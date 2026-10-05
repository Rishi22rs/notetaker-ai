require('dotenv').config();
const { MongoClient } = require('mongodb');

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing from .env.');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(process.env.MONGODB_DB || 'notetaker');
    const plans = db.collection('recharge_plans');
    const payments = db.collection('payments');
    const legacyPlans = await plans.find({ $or: [{ minutes: { $type: 'number' } }, { id: /^minutes_\d+$/i }] }).toArray();
    for (const plan of legacyPlans) {
      const durationSeconds = Number.isInteger(plan.durationSeconds) ? plan.durationSeconds : Math.max(1, Math.floor(plan.minutes * 60));
      const id = /^minutes_\d+$/i.test(String(plan.id || '')) ? `seconds_${durationSeconds}` : plan.id;
      await plans.updateOne({ _id: plan._id }, { $set: { id, durationSeconds, updatedAt: new Date() }, $unset: { minutes: '' } });
      if (id !== plan.id) await payments.updateMany({ planId: plan.id }, { $set: { planId: id } });
    }
    const legacyPayments = await payments.find({ minutes: { $type: 'number' } }).toArray();
    for (const payment of legacyPayments) {
      await payments.updateOne({ _id: payment._id }, { $set: { durationSeconds: Math.max(1, Math.floor(payment.minutes * 60)) }, $unset: { minutes: '' } });
    }
    console.log(`Migrated ${legacyPlans.length} recharge plan(s) and ${legacyPayments.length} payment record(s) to seconds.`);
  } finally { await client.close(); }
})().catch((error) => { console.error(error.message); process.exit(1); });
