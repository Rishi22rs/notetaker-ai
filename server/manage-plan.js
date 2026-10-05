require('dotenv').config();
const { MongoClient } = require('mongodb');

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: npm run plan:add -- ID DURATION_SECONDS PRICE_PAISE [SORT_ORDER] | npm run plan:remove -- ID');
  process.exit(1);
}

const [command, id, minutesValue, amountValue, sortValue] = process.argv.slice(2);
if (!['add', 'remove'].includes(command) || !/^[a-z0-9_-]{3,40}$/i.test(String(id || ''))) usage('Use a 3-40 character plan ID containing letters, numbers, underscores, or hyphens.');
if (!process.env.MONGODB_URI) usage('MONGODB_URI is missing from .env.');

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  try {
    const plans = client.db(process.env.MONGODB_DB || 'notetaker').collection('recharge_plans');
    if (command === 'remove') {
      const result = await plans.deleteOne({ id });
      console.log(result.deletedCount ? `Removed plan ${id}.` : `Plan ${id} was not found.`);
      return;
    }
    const durationSeconds = Number(minutesValue);
    const amountPaise = Number(amountValue);
    const sortOrder = sortValue === undefined ? durationSeconds : Number(sortValue);
    if (![durationSeconds, amountPaise, sortOrder].every(Number.isInteger) || durationSeconds < 1 || amountPaise < 1) usage('Duration seconds, price paise, and optional sort order must be positive integers.');
    const now = new Date();
    await plans.updateOne({ id }, { $set: { durationSeconds, amountPaise, sortOrder, active: true, updatedAt: now }, $unset: { minutes: '' }, $setOnInsert: { createdAt: now } }, { upsert: true });
    console.log(`Saved ${id}: ${durationSeconds} seconds for ${amountPaise} paise.`);
  } finally { await client.close(); }
})().catch((error) => { console.error(error.message); process.exit(1); });
