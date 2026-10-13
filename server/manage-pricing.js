require('dotenv').config();
const { MongoClient } = require('mongodb');
const { DEFAULT_PLANS, DEFAULT_CUSTOM_PRICING, customPlan } = require('./payments');
const [command, rate, minimum = '10', maximum = '10000'] = process.argv.slice(2);
async function main() {
  if (!['set', 'disable', 'defaults', 'show'].includes(command)) throw new Error('Usage: npm run pricing:manage -- set PRICE_PAISE_PER_MINUTE [MIN_MINUTES] [MAX_MINUTES] | disable | defaults | show');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing.');
  const pricing = command === 'set' ? { enabled: true, amountPaisePerMinute: Number(rate), minMinutes: Number(minimum), maxMinutes: Number(maximum) } : { ...DEFAULT_CUSTOM_PRICING };
  if (command === 'set') customPlan(pricing, pricing.maxMinutes);
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(process.env.MONGODB_DB || 'notetaker');
    const catalog = db.collection('payment_catalog');
    if (command === 'show') {
      console.log(JSON.stringify({ packs: await db.collection('recharge_plans').find({}).toArray(), customPricing: await catalog.findOne({ _id: 'custom-minute-pricing' }) || DEFAULT_CUSTOM_PRICING }, null, 2)); return;
    }
    if (command === 'defaults') {
      const plans = db.collection('recharge_plans');
      for (const plan of DEFAULT_PLANS) await plans.updateOne({ id: plan.id }, { $set: { ...plan, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
      // Retire only the original, unmodified starter prices. Preserve custom packs.
      for (const [id, amountPaise] of [['seconds_600', 5000], ['seconds_1800', 15000], ['seconds_3600', 30000]]) {
        await plans.updateOne({ id, amountPaise }, { $set: { active: false, updatedAt: new Date() } });
      }
    }
    await catalog.updateOne({ _id: 'custom-minute-pricing' }, { $set: command === 'disable' ? { enabled: false, updatedAt: new Date() } : { ...pricing, updatedAt: new Date() } }, { upsert: true });
    console.log('Pricing saved. Reopen Recharge & Offers to load the changes.');
  } finally { await client.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
