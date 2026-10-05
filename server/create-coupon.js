require('dotenv').config();
const { MongoClient } = require('mongodb');
const { hashToken } = require('../auth-crypto');

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: npm run coupon:create -- CODE (--minutes MINUTES | --percent PERCENT) [--max COUNT]');
  process.exit(1);
}

const args = process.argv.slice(2);
const code = String(args.shift() || '').trim().toUpperCase();
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};
const minutes = valueAfter('--minutes');
const percent = valueAfter('--percent');
const maximum = valueAfter('--max');
if (!/^[A-Z0-9_-]{4,32}$/.test(code)) usage('Code must be 4-32 letters, numbers, underscores, or hyphens.');
if ((minutes === undefined) === (percent === undefined)) usage('Choose exactly one benefit: --minutes or --percent.');
if (!process.env.MONGODB_URI) usage('MONGODB_URI is missing from .env.');

let benefitType;
let benefitValue;
if (minutes !== undefined) {
  const number = Number(minutes);
  if (!Number.isInteger(number) || number < 1 || number > 600_000) usage('Minutes must be a positive integer.');
  benefitType = 'free_seconds';
  benefitValue = number * 60;
} else {
  const number = Number(percent);
  if (!Number.isInteger(number) || number < 1 || number > 99) usage('Percent must be an integer from 1 to 99. Use a free-minute coupon for fully free usage.');
  benefitType = 'percent_off';
  benefitValue = number;
}
const maxRedemptions = maximum === undefined ? null : Number(maximum);
if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) usage('Max must be a positive integer.');

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  try {
    await client.db(process.env.MONGODB_DB || 'notetaker').collection('coupons').insertOne({
      codeHash: hashToken(code), codeLabel: code, benefitType, benefitValue,
      maxRedemptions, redeemedCount: 0, active: true, createdAt: new Date()
    });
    console.log(`Created ${code}: ${benefitType === 'free_seconds' ? `${benefitValue / 60} free minutes` : `${benefitValue}% off`}${maxRedemptions ? `, max ${maxRedemptions} redemptions` : ''}.`);
  } catch (error) {
    if (error.code === 11000) throw new Error(`Coupon ${code} already exists.`);
    throw error;
  } finally { await client.close(); }
})().catch((error) => { console.error(error.message); process.exit(1); });
