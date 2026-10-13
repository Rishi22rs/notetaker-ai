const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_PLANS, DEFAULT_CUSTOM_PRICING, customPlan, secureEqual, signature } = require('./payments');

test('starter recharge plans use integer paise and second values', () => {
  assert.deepEqual(DEFAULT_PLANS.map((plan) => plan.id), ['minutes_100_pack', 'minutes_300_pack', 'minutes_1000_pack']);
  for (const plan of DEFAULT_PLANS) {
    assert.equal(Number.isInteger(plan.amountPaise), true);
    assert.equal(Number.isInteger(plan.durationSeconds), true);
    assert.ok(plan.amountPaise > 0);
    assert.ok(plan.durationSeconds > 0);
  }
});

test('Razorpay signatures are deterministic and compared safely', () => {
  const first = signature('secret', 'order_1|pay_1');
  assert.equal(secureEqual(first, signature('secret', 'order_1|pay_1')), true);
  assert.equal(secureEqual(first, signature('secret', 'order_1|pay_2')), false);
  assert.equal(secureEqual(first, ''), false);
});

 test('custom minute orders use backend pricing and reject invalid quantities', () => {
   assert.deepEqual(customPlan(DEFAULT_CUSTOM_PRICING, 18), { id: 'custom_minutes', durationSeconds: 1080, amountPaise: 10800 });
   assert.equal(customPlan({ ...DEFAULT_CUSTOM_PRICING, amountPaisePerMinute: 750 }, 10).amountPaise, 7500);
   for (const minutes of [0, 9, 10.5, '10', NaN, 10001]) assert.throws(() => customPlan(DEFAULT_CUSTOM_PRICING, minutes));
   assert.throws(() => customPlan({ ...DEFAULT_CUSTOM_PRICING, enabled: false }, 10));
   assert.throws(() => customPlan({ ...DEFAULT_CUSTOM_PRICING, amountPaisePerMinute: -1 }, 10));
 });
 test('agreed pack amounts and durations are exact', () => {
   assert.deepEqual(DEFAULT_PLANS.map(p => [p.durationSeconds, p.amountPaise]), [[6000, 49900], [18000, 139900], [60000, 399900]]);
 });

test('checkout ignores client prices and snapshots backend custom pricing', async () => {
  const { createPaymentService } = require('./payments');
  const saved = [];
  const userId = new (require('mongodb').ObjectId)();
  const pricing = { ...DEFAULT_CUSTOM_PRICING, amountPaisePerMinute: 700 };
  const db = { collection(name) { return {
    async findOne() { return name === 'app_config' ? pricing : null; },
    async insertOne(value) { saved.push(value); }
  }; } };
  const service = createPaymentService({ db, config: { razorpayKeyId: 'test', razorpayKeySecret: 'test', razorpayWebhookSecret: 'test', publicUrl: 'https://example.com' } });
  const originalFetch = global.fetch;
  global.fetch = async (_url, request) => {
    const order = JSON.parse(request.body);
    assert.equal(order.amount, 12600);
    assert.equal(order.currency, 'INR');
    return { ok: true, async json() { return { id: 'order_test' }; } };
  };
  try {
    const result = await service.createOrder({ _id: userId }, 'custom_minutes', 18);
    assert.equal(result.amountPaise, 12600);
    assert.equal(result.durationSeconds, 1080);
    pricing.amountPaisePerMinute = 900;
    assert.equal(saved[0].amountPaise, 12600);
    assert.equal(saved[0].durationSeconds, 1080);
    await assert.rejects(service.createOrder({ _id: userId }, 'custom_minutes', -10), /outside the allowed range/);
    await assert.rejects(service.createOrder({ _id: userId }, 'removed_pack'), /unavailable/);
  } finally { global.fetch = originalFetch; }
});

test('catalog exposes valid crossed-out prices without changing sale prices', async () => {
  const { createPaymentService } = require('./payments');
  const values = [69900, null, 49900, 10000, '69900'].map((originalAmountPaise, i) => ({ id: `pack_${i}`, durationSeconds: 6000, amountPaise: 49900, originalAmountPaise }));
  const db = { collection() { return { find() { return { sort() { return { async toArray() { return values; } }; } }; } }; } };
  const plans = await createPaymentService({ db, config: {} }).plans();
  assert.deepEqual(plans.map(p => p.originalAmountPaise), [69900, null, null, null, null]);
  assert.ok(plans.every(p => p.amountPaise === 49900));
});

test('custom config is read fresh from app_config/global on each request', async () => {
  const { createPaymentService } = require('./payments');
  let current = { enabled: true, amountPaisePerMinute: 600, minMinutes: 10, maxMinutes: 10000 };
  const db = { collection(name) { return { async findOne(query) {
    assert.equal(name, 'app_config'); assert.equal(query._id, 'global'); return { ...current };
  } }; } };
  const service = createPaymentService({ db, config: {} });
  assert.equal((await service.customPricing()).amountPaisePerMinute, 600);
  current = { enabled: true, amountPaisePerMinute: 800, minMinutes: 20, maxMinutes: 500 };
  assert.deepEqual(await service.customPricing(), current);
});

test('changed checkout pricing returns refresh signal without creating payment', async () => {
  const { createPaymentService } = require('./payments');
  const db = { collection(name) { return { async findOne() {
    if (name === 'app_config') return { ...DEFAULT_CUSTOM_PRICING, amountPaisePerMinute: 900 };
    if (name === 'recharge_plans') return { amountPaise: 59900, durationSeconds: 6000 };
    throw new Error('Checkout must stop before further operations');
  } }; } };
  const service = createPaymentService({ db, config: { razorpayKeyId: 'test', razorpayKeySecret: 'test', razorpayWebhookSecret: 'test' } });
  assert.deepEqual(await service.createOrder({}, 'custom_minutes', 10, DEFAULT_CUSTOM_PRICING), { priceUpdated: true });
  assert.deepEqual(await service.createOrder({}, 'pack_test', undefined, { amountPaise: 49900, durationSeconds: 6000 }), { priceUpdated: true });
});
