const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_PLANS, secureEqual, signature } = require('./payments');

test('starter recharge plans use integer paise and second values', () => {
  assert.deepEqual(DEFAULT_PLANS.map((plan) => plan.id), ['seconds_600', 'seconds_1800', 'seconds_3600']);
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
