const { randomUUID } = require('node:crypto');

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

function createSessionHistoryService({ db }) {
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
      await histories.insertOne(record);
      return { id: record.id };
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
