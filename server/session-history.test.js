const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sessionDetails, createSessionHistoryService } = require('./session-history');
const { createUsageService } = require('./usage-meter');

function memoryDb() {
  const stores = new Map(); let next = 0;
  const matches = (doc, query) => Object.entries(query).every(([key, value]) => value && typeof value === 'object' && '$gte' in value ? doc[key] >= value.$gte : doc[key] === value);
  return { stores, collection(name) {
    if (!stores.has(name)) stores.set(name, []);
    const rows = stores.get(name);
    return {
      createIndex: async () => {},
      insertOne: async doc => { rows.push({ ...doc, _id: String(++next) }); },
      findOne: async query => { const row = rows.find(row => matches(row, query)); return row ? { ...row } : null; },
      find: query => ({ toArray: async () => rows.filter(row => matches(row, query)).map(row => ({ ...row })) }),
      updateOne: async (query, update) => {
        const row = rows.find(row => matches(row, query)); if (!row) return { matchedCount: 0, modifiedCount: 0 };
        Object.assign(row, update.$set || {}); for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
        return { matchedCount: 1, modifiedCount: 1 };
      }
    };
  } };
}

test('session metadata preserves resume text and rejects invalid input', () => {
  const result = sessionDetails({ company: ' Stripe ', extraContext: 'Engineering role', resume: { name: 'CV.pdf', content: 'Readable resume', mime: 'application/pdf', secret: 'ignored' } });
  assert.equal(result.company, 'Stripe'); assert.equal(result.resume.content, 'Readable resume'); assert.equal(result.resume.secret, undefined);
  assert.throws(() => sessionDetails({ company: '' }), error => error.status === 400);
  assert.throws(() => sessionDetails({ company: 'A', resume: { content: '' } }), error => error.status === 400);
  assert.throws(() => sessionDetails({ company: 'A', extraContext: 'a'.repeat(20001) }), error => error.status === 400);
});
test('history records are owned by the signed-in user and ending is idempotent', async () => {
  const db = memoryDb(), histories = createSessionHistoryService({ db });
  const owner = { _id: 'owner' }, stranger = { _id: 'stranger' };
  const { id } = await histories.create(owner, { company: 'Stripe', extraContext: 'Session-only details' });
  await assert.rejects(histories.requireOpen(stranger, id), error => error.status === 404);
  await assert.rejects(histories.end(stranger, id), error => error.status === 404);
  await histories.requireOpen(owner, id); await histories.end(owner, id); await histories.end(owner, id);
  assert.equal(db.stores.get('interview_sessions')[0].status, 'ended');
  assert.equal(db.stores.get('interview_sessions')[0].extraContext, 'Session-only details');
  await assert.rejects(histories.requireOpen(owner, id), error => error.status === 404);
});
test('usage adds only billed active seconds across pause and resume to the same history', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-13T00:00:00Z') });
  const db = memoryDb(), user = { _id: 'owner' };
  await db.collection('wallets').insertOne({ userId: user._id, balanceSeconds: 600 });
  const histories = createSessionHistoryService({ db }), usage = createUsageService({ db, historyService: histories });
  const { id } = await histories.create(user, { company: 'Stripe' });
  await usage.start(user, 'first', id); t.mock.timers.tick(10000); await usage.stop(user, 'first');
  t.mock.timers.tick(300000); // Five paused minutes must not be charged.
  await usage.start(user, 'second', id); t.mock.timers.tick(15000); await usage.endHistory(user, id); await histories.end(user, id);
  const segments = db.stores.get('usage_sessions');
  assert.equal(segments.reduce((sum, row) => sum + row.chargedSeconds, 0), 25);
  assert.ok(segments.every(row => row.historyId === id && row.status === 'stopped'));
  assert.equal((await usage.balance(user)).balanceSeconds, 575);
});
test('expired leases cap billed time and finalize history as interrupted', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-13T00:00:00Z') });
  const db = memoryDb(), user = { _id: 'owner' };
  await db.collection('wallets').insertOne({ userId: user._id, balanceSeconds: 600 });
  const histories = createSessionHistoryService({ db }), usage = createUsageService({ db, historyService: histories });
  const { id } = await histories.create(user, { company: 'Stripe' });
  await usage.start(user, 'first', id); t.mock.timers.tick(60000); await usage.reconcile(user);
  assert.equal(db.stores.get('usage_sessions')[0].chargedSeconds, 30);
  assert.equal(db.stores.get('interview_sessions')[0].status, 'interrupted');
  await assert.rejects(usage.start(user, 'second', id), error => error.status === 404);
});
test('history aggregation scopes records and billed usage to the same owner', async () => {
  const calls = [];
  const histories = createSessionHistoryService({ db: { collection: () => ({ aggregate: pipeline => { calls.push(pipeline); return { toArray: async () => [] }; } }) } });
  await histories.list({ _id: 'owner' }, 2);
  assert.deepEqual(calls[0][0].$match, { userId: 'owner' });
  const lookup = calls[0].find(stage => stage.$lookup).$lookup;
  assert.deepEqual(lookup.pipeline[0].$match.$expr.$and[1], { $eq: ['$userId', '$$owner'] });
  assert.deepEqual(calls[0].at(-1), { $project: { 'resume.content': 0 } });
  assert.deepEqual(calls[0].find(stage => stage.$skip), { $skip: 50 });
});

test('simultaneous history reconciliation and audio heartbeat bill the interval once', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-13T00:00:00Z') });
  const db = memoryDb(), user = { _id: 'owner' };
  await db.collection('wallets').insertOne({ userId: user._id, balanceSeconds: 600 });
  const histories = createSessionHistoryService({ db }), usage = createUsageService({ db, historyService: histories });
  const { id } = await histories.create(user, { company: 'Stripe' });
  await usage.start(user, 'first', id); t.mock.timers.tick(10000);
  await Promise.all([usage.reconcile(user), usage.heartbeat(user, 'first'), usage.reconcile(user)]);
  assert.equal(db.stores.get('usage_sessions')[0].chargedSeconds, 10);
  assert.equal((await usage.balance(user)).balanceSeconds, 590);
});
