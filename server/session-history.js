const { randomUUID } = require('node:crypto');
const { GridFSBucket } = require('mongodb');
const { Readable } = require('node:stream');
const { pipeline: streamPipeline } = require('node:stream/promises');
const MAX_RESUME_BYTES = 25 * 1024 * 1024;

function originalBytes(encoded) {
  if (typeof encoded !== 'string' || !encoded || encoded.length > Math.ceil(MAX_RESUME_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw Object.assign(new Error('Invalid original resume file (maximum 25 MB).'), { status: 400 });
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > MAX_RESUME_BYTES) throw Object.assign(new Error('Invalid original resume file.'), { status: 400 });
  return bytes;
}

function sessionDetails(value = {}) {
  const company = String(value.company || '').trim();
  if (!company || company.length > 200) throw Object.assign(new Error('Enter a company name (up to 200 characters).'), { status: 400 });
  const extraContext = String(value.extraContext || '');
  if (extraContext.length > 20000) throw Object.assign(new Error('Extra context is too long.'), { status: 400 });
  let resume = null;
  if (value.resume) {
    const content = String(value.resume.content || '');
    if (!content.trim() || content.length > 500000) throw Object.assign(new Error('Resume must contain readable text (up to 500,000 characters).'), { status: 400 });
    resume = { name: String(value.resume.name || 'Resume').slice(0, 240), mime: String(value.resume.mime || '').slice(0, 100), size: Math.max(0, Number(value.resume.size) || 0), content };
  }
  return { company, extraContext, resume };
}

function createSessionHistoryService({ db, resumeBucket }) {
  let bucket = resumeBucket;
  const originals = () => bucket ||= new GridFSBucket(db, { bucketName: 'session_resumes' });
  const histories = db.collection('interview_sessions');
  const pipeline = (user, id) => [
    { $match: { userId: user._id, ...(id ? { id } : {}) } },
    { $sort: { createdAt: -1, id: -1 } },
    { $lookup: { from: 'usage_sessions', let: { historyId: '$id', owner: '$userId' }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$historyId', '$$historyId'] }, { $eq: ['$userId', '$$owner'] }] } } },
      { $group: { _id: null, seconds: { $sum: '$chargedSeconds' } } }
    ], as: 'usage' } },
    { $set: { consumedSeconds: { $ifNull: [{ $arrayElemAt: ['$usage.seconds', 0] }, 0] } } },
    { $unset: ['usage', '_id', 'userId'] }
  ];
  return {
    ensureIndexes: () => Promise.all([histories.createIndex({ id: 1 }, { unique: true }), histories.createIndex({ userId: 1, createdAt: -1 })]),
    async create(user, value) {
      const details = sessionDetails(value);
      const now = new Date();
      const record = { id: randomUUID(), userId: user._id, ...details, status: 'ready', createdAt: now, endedAt: null };
      let upload;
      try {
        const encoded = value.resume?.originalBase64;
        if (encoded !== undefined) {
          const bytes = originalBytes(encoded);
          if (!record.resume) throw Object.assign(new Error('Resume details are missing.'), { status: 400 });
          upload = originals().openUploadStream(record.resume.name, { metadata: { userId: user._id, sessionId: record.id, mime: record.resume.mime } });
          await streamPipeline(Readable.from([bytes]), upload);
          record.resume.fileId = upload.id;
          record.resume.downloadable = true;
          record.resume.size = bytes.length;
        }
        await histories.insertOne(record);
      } catch (error) {
        if (upload) await originals().delete(upload.id).catch(() => {});
        throw error;
      }
      return { id: record.id, resumeStored: !!record.resume?.fileId };
    },
    async resumeDownload(user, id) {
      const record = await histories.findOne({ userId: user._id, id });
      if (!record) throw Object.assign(new Error('Session not found.'), { status: 404 });
      if (!record.resume?.fileId) throw Object.assign(new Error('The original resume was not saved for this older session.'), { status: 404 });
      return { name: record.resume.name, stream: originals().openDownloadStream(record.resume.fileId) };
    },
    async requireOpen(user, id) {
      if (!id) return;
      const record = await histories.findOne({ userId: user._id, id, endedAt: null });
      if (!record) throw Object.assign(new Error('Session not found or already ended.'), { status: 404 });
      await histories.updateOne({ userId: user._id, id, endedAt: null }, { $set: { status: 'in-progress' } });
    },
    async end(user, id, status = 'ended') {
      const result = await histories.updateOne({ userId: user._id, id, endedAt: null }, { $set: { status, endedAt: new Date() } });
      if (!result.matchedCount && !await histories.findOne({ userId: user._id, id })) throw Object.assign(new Error('Session not found.'), { status: 404 });
      return { ok: true };
    },
    async list(user, page = 0) {
      return histories.aggregate([...pipeline(user), { $skip: page * 25 }, { $limit: 26 }, { $project: { 'resume.content': 0 } }]).toArray();
    },
    async detail(user, id) {
      const [record] = await histories.aggregate(pipeline(user, id)).toArray();
      if (!record) throw Object.assign(new Error('Session not found.'), { status: 404 });
      return record;
    }
  };
}
module.exports = { sessionDetails, createSessionHistoryService };
