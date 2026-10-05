const crypto = require('node:crypto');
const { ObjectId } = require('mongodb');
const { hashToken, randomToken } = require('../auth-crypto');

const DEFAULT_PLANS = Object.freeze([
  { id: 'seconds_600', durationSeconds: 600, amountPaise: 5000 },
  { id: 'seconds_1800', durationSeconds: 1800, amountPaise: 15000 },
  { id: 'seconds_3600', durationSeconds: 3600, amountPaise: 30000 }
].map((plan, index) => ({ ...plan, active: true, sortOrder: index + 1 })));

function durationLabel(durationSeconds) {
  const seconds = Math.max(0, Math.floor(Number(durationSeconds) || 0));
  return seconds % 60 ? `${seconds}s` : `${seconds / 60} minutes`;
}

function secureEqual(first, second) {
  const left = Buffer.from(String(first || ''));
  const right = Buffer.from(String(second || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signature(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

function checkoutHtml({ keyId, payment, user }) {
  const data = JSON.stringify({
    key: keyId,
    amount: payment.amountPaise,
    currency: 'INR',
    name: 'Notetaker AI',
    description: `${durationLabel(payment.durationSeconds)} usage`,
    order_id: payment.providerOrderId,
    prefill: { name: user.name || '', email: user.email || '' },
    theme: { color: '#83e1b4' }
  }).replace(/</g, '\\u003c');
  const paymentId = JSON.stringify(payment._id.toString());
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recharge Notetaker AI</title><script src="https://checkout.razorpay.com/v1/checkout.js"></script><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111317;color:#f4f5f7;font:16px system-ui}.card{width:min(420px,calc(100% - 40px));padding:28px;border:1px solid #353941;border-radius:14px;background:#202329;text-align:center}button{width:100%;padding:12px;border:0;border-radius:8px;background:#83e1b4;color:#10251b;font-weight:700;cursor:pointer}.muted{color:#9ca3ad;font-size:13px}</style></head><body><main class="card"><h1>${durationLabel(payment.durationSeconds)}</h1><p>Pay ₹${(payment.amountPaise / 100).toFixed(2)}</p><button id="pay">Continue to payment</button><p class="muted" id="status">Secure checkout powered by Razorpay</p></main><script>const options=${data};options.handler=async(result)=>{document.querySelector('#status').textContent='Verifying payment…';const response=await fetch('/payments/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({paymentId:${paymentId},...result})});const body=await response.json();document.querySelector('#pay').hidden=true;document.querySelector('#status').textContent=response.ok?(body.credited?'Payment complete. Time added. You can return to the app.':'Payment received. Waiting for capture confirmation…'):(body.error||'Verification failed.');};options.modal={ondismiss:()=>{document.querySelector('#status').textContent='Payment cancelled. You can close this page.'}};document.querySelector('#pay').onclick=()=>new Razorpay(options).open();</script></body></html>`;
}

function createPaymentService({ db, config }) {
  const payments = db.collection('payments');
  const wallets = db.collection('wallets');
  const discounts = db.collection('discounts');
  const users = db.collection('users');
  const plansCollection = db.collection('recharge_plans');
  const catalog = db.collection('payment_catalog');

  async function ensureIndexes() {
    await Promise.all([
      payments.createIndex({ providerOrderId: 1 }, { unique: true }),
      payments.createIndex({ providerPaymentId: 1 }, { unique: true, sparse: true }),
      payments.createIndex({ checkoutTokenHash: 1 }, { unique: true }),
      payments.createIndex({ userId: 1, createdAt: -1 }),
      plansCollection.createIndex({ id: 1 }, { unique: true }),
      plansCollection.createIndex({ active: 1, sortOrder: 1 })
    ]);
    const legacyPlans = await plansCollection.find({ minutes: { $type: 'number' } }).toArray();
    for (const plan of legacyPlans) {
      const durationSeconds = Math.max(1, Math.floor(plan.minutes * 60));
      const id = /^minutes_\d+$/i.test(String(plan.id || '')) ? `seconds_${durationSeconds}` : plan.id;
      await plansCollection.updateOne({ _id: plan._id }, { $set: { id, durationSeconds, updatedAt: new Date() }, $unset: { minutes: '' } });
      if (id !== plan.id) await payments.updateMany({ planId: plan.id }, { $set: { planId: id } });
    }
    const legacyIds = await plansCollection.find({ id: /^minutes_\d+$/i, durationSeconds: { $type: 'number' } }).toArray();
    for (const plan of legacyIds) {
      const id = `seconds_${plan.durationSeconds}`;
      await plansCollection.updateOne({ _id: plan._id }, { $set: { id, updatedAt: new Date() } });
      await payments.updateMany({ planId: plan.id }, { $set: { planId: id } });
    }
    await payments.updateMany({ durationSeconds: { $exists: false }, minutes: { $type: 'number' } }, [{ $set: { durationSeconds: { $multiply: ['$minutes', 60] } } }, { $unset: 'minutes' }]);
    // Existing installs receive the starter plans once. After this marker is
    // written, the database is the catalog of record—even if it is empty.
    const initialized = await catalog.updateOne(
      { _id: 'recharge-plans-v1' },
      { $setOnInsert: { initializedAt: new Date() } },
      { upsert: true }
    );
    if (initialized.upsertedCount) await plansCollection.insertMany(DEFAULT_PLANS.map((plan) => ({ ...plan, createdAt: new Date(), updatedAt: new Date() })));
  }

  async function plans() {
    const values = await plansCollection.find({ active: { $ne: false } }).sort({ sortOrder: 1, durationSeconds: 1, _id: 1 }).toArray();
    return values
      .filter((plan) => /^[a-z0-9_-]{3,40}$/i.test(String(plan.id || '')) && Number.isInteger(plan.durationSeconds) && plan.durationSeconds > 0 && Number.isInteger(plan.amountPaise) && plan.amountPaise > 0)
      .map((plan) => ({ id: plan.id, durationSeconds: plan.durationSeconds, amountPaise: plan.amountPaise }));
  }

  function configured() {
    return Boolean(config.razorpayKeyId && config.razorpayKeySecret && config.razorpayWebhookSecret);
  }

  async function razorpayApi(route, options = {}) {
    const response = await fetch(`https://api.razorpay.com/v1${route}`, {
      ...options,
      headers: {
        authorization: `Basic ${Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64')}`,
        'content-type': 'application/json', ...options.headers
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.description || 'Razorpay rejected the request.');
    return body;
  }

  async function createOrder(user, planId) {
    if (!configured()) {
      const error = new Error('Payments are not configured yet. Add Razorpay test keys to the backend.');
      error.status = 503;
      throw error;
    }
    const plan = await plansCollection.findOne({ id: planId, active: { $ne: false } });
    if (!plan || !Number.isInteger(plan.durationSeconds) || plan.durationSeconds < 1 || !Number.isInteger(plan.amountPaise) || plan.amountPaise < 1) { const error = new Error('This recharge plan is unavailable.'); error.status = 400; throw error; }
    const discount = await discounts.findOne({ userId: user._id, status: 'active' }, { sort: { createdAt: 1 } });
    const percentOff = Math.min(99, Math.max(0, Number(discount?.percentOff) || 0));
    const amountPaise = Math.max(100, Math.round(plan.amountPaise * (100 - percentOff) / 100));
    const checkoutToken = randomToken(32);
    const localId = new ObjectId();
    const providerOrder = await razorpayApi('/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: amountPaise, currency: 'INR', receipt: localId.toString(),
        notes: { userId: user._id.toString(), planId: plan.id }
      })
    });
    const payment = {
      _id: localId, userId: user._id, planId: plan.id, durationSeconds: plan.durationSeconds,
      grossAmountPaise: plan.amountPaise, discountAmountPaise: plan.amountPaise - amountPaise,
      amountPaise, discountId: discount?._id || null, provider: 'razorpay',
      providerOrderId: providerOrder.id, checkoutTokenHash: hashToken(checkoutToken),
      status: 'created', createdAt: new Date()
    };
    await payments.insertOne(payment);
    return {
      paymentId: localId.toString(),
      checkoutUrl: `${config.publicUrl}/checkout/${checkoutToken}`,
      durationSeconds: plan.durationSeconds, amountPaise, discountPercent: percentOff
    };
  }

  async function creditPayment(payment, providerPaymentId) {
    const now = new Date();
    await wallets.updateOne({ userId: payment.userId }, { $setOnInsert: { balanceSeconds: 0, createdAt: now } }, { upsert: true });
    const walletUpdate = await wallets.updateOne(
      { userId: payment.userId, appliedPaymentIds: { $ne: payment._id } },
      { $inc: { balanceSeconds: payment.durationSeconds }, $addToSet: { appliedPaymentIds: payment._id }, $set: { updatedAt: now } }
    );
    await payments.updateOne(
      { _id: payment._id },
      { $set: { providerPaymentId, status: 'credited', capturedAt: now, creditedAt: now } }
    );
    if (payment.discountId) await discounts.updateOne({ _id: payment.discountId, status: 'active' }, { $set: { status: 'used', usedAt: now, paymentId: payment._id } });
    return walletUpdate.modifiedCount > 0;
  }

  async function verifyCheckout(body) {
    if (!configured()) throw new Error('Payments are not configured.');
    if (!ObjectId.isValid(body.paymentId)) { const error = new Error('Invalid payment.'); error.status = 400; throw error; }
    const payment = await payments.findOne({ _id: new ObjectId(body.paymentId) });
    if (!payment || payment.providerOrderId !== body.razorpay_order_id) { const error = new Error('Payment order does not match.'); error.status = 400; throw error; }
    const expected = signature(config.razorpayKeySecret, `${payment.providerOrderId}|${body.razorpay_payment_id}`);
    if (!secureEqual(expected, body.razorpay_signature)) { const error = new Error('Payment signature is invalid.'); error.status = 401; throw error; }
    const providerPayment = await razorpayApi(`/payments/${encodeURIComponent(body.razorpay_payment_id)}`);
    if (providerPayment.order_id !== payment.providerOrderId || providerPayment.amount !== payment.amountPaise) throw new Error('Payment details do not match the order.');
    if (providerPayment.status !== 'captured') {
      await payments.updateOne({ _id: payment._id }, { $set: { providerPaymentId: providerPayment.id, status: 'pending_capture' } });
      return { credited: false };
    }
    await creditPayment(payment, providerPayment.id);
    return { credited: true };
  }

  async function processWebhook(rawBody, providedSignature) {
    if (!configured() || !secureEqual(signature(config.razorpayWebhookSecret, rawBody), providedSignature)) {
      const error = new Error('Invalid webhook signature.'); error.status = 401; throw error;
    }
    const event = JSON.parse(rawBody);
    if (event.event !== 'payment.captured') return { ignored: true };
    const providerPayment = event.payload?.payment?.entity;
    const payment = await payments.findOne({ providerOrderId: providerPayment?.order_id });
    if (!payment || providerPayment.amount !== payment.amountPaise || providerPayment.currency !== 'INR') {
      const error = new Error('Webhook payment does not match a local order.'); error.status = 400; throw error;
    }
    await creditPayment(payment, providerPayment.id);
    return { credited: true };
  }

  async function showCheckout(token, response) {
    const payment = await payments.findOne({ checkoutTokenHash: hashToken(token), status: { $in: ['created', 'pending_capture'] } });
    if (!payment) { response.writeHead(404, { 'content-type': 'text/plain' }).end('This checkout link is invalid or already completed.'); return; }
    const user = await users.findOne({ _id: payment.userId });
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
      'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; frame-src https://api.razorpay.com https://*.razorpay.com; style-src 'unsafe-inline'; connect-src 'self' https://api.razorpay.com https://*.razorpay.com; img-src 'self' data: https:"
    });
    response.end(checkoutHtml({ keyId: config.razorpayKeyId, payment, user }));
  }

  async function status(user, id) {
    if (!ObjectId.isValid(id)) return null;
    const payment = await payments.findOne({ _id: new ObjectId(id), userId: user._id });
    return payment ? { id, status: payment.status, durationSeconds: payment.durationSeconds, amountPaise: payment.amountPaise } : null;
  }

  async function wallet(user) {
    const value = await wallets.findOne({ userId: user._id });
    return { balanceSeconds: Math.max(0, Number(value?.balanceSeconds) || 0) };
  }

  return { configured, createOrder, ensureIndexes, plans, processWebhook, showCheckout, status, verifyCheckout, wallet };
}

module.exports = { createPaymentService, DEFAULT_PLANS, secureEqual, signature };
