const http = require('node:http');
const { MongoClient } = require('mongodb');
const { hashToken, isLoopbackRedirect, randomToken } = require('../auth-crypto');
const { createPaymentService } = require('./payments');
const { createUsageService } = require('./usage-meter');

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const ONE_TIME_TTL_MS = 2 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const body = await readText(request);
  return body ? JSON.parse(body) : {};
}

async function readText(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body is too large.');
  }
  return body;
}

function publicUser(user) {
  return { id: user._id.toString(), email: user.email, name: user.name, picture: user.picture || '' };
}

async function createAuthServer(config) {
  const client = new MongoClient(config.mongoUri);
  await client.connect();
  const db = client.db(config.mongoDbName || 'notetaker');
  const users = db.collection('users');
  const sessions = db.collection('sessions');
  const exchanges = db.collection('auth_exchanges');
  const coupons = db.collection('coupons');
  const couponRedemptions = db.collection('coupon_redemptions');
  const wallets = db.collection('wallets');
  const discounts = db.collection('discounts');
  const paymentService = createPaymentService({ db, config });
  const usageService = createUsageService({ db });
  await Promise.all([
    users.createIndex({ googleId: 1 }, { unique: true }),
    sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    exchanges.createIndex({ valueHash: 1 }, { unique: true }),
    exchanges.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    coupons.createIndex({ codeHash: 1 }, { unique: true }),
    couponRedemptions.createIndex({ couponId: 1, userId: 1 }, { unique: true }),
    wallets.createIndex({ userId: 1 }, { unique: true }),
    discounts.createIndex({ redemptionId: 1 }, { unique: true }),
    paymentService.ensureIndexes(),
    usageService.ensureIndexes()
  ]);
  const pendingStates = new Map();

  async function currentUser(request) {
    const match = /^Bearer (.+)$/.exec(request.headers.authorization || '');
    if (!match) return null;
    const session = await sessions.findOne({ tokenHash: hashToken(match[1]), expiresAt: { $gt: new Date() } });
    return session ? users.findOne({ _id: session.userId }) : null;
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, config.publicUrl);
      if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { ok: true });
      if (request.method === 'GET' && url.pathname === '/payments/plans') {
        return sendJson(response, 200, { plans: await paymentService.plans(), configured: paymentService.configured() });
      }
      if (request.method === 'GET' && url.pathname.startsWith('/checkout/')) {
        return paymentService.showCheckout(decodeURIComponent(url.pathname.slice('/checkout/'.length)), response);
      }
      if (request.method === 'POST' && url.pathname === '/webhooks/razorpay') {
        const result = await paymentService.processWebhook(await readText(request), request.headers['x-razorpay-signature']);
        return sendJson(response, 200, result);
      }
      if (request.method === 'POST' && url.pathname === '/payments/verify') {
        return sendJson(response, 200, await paymentService.verifyCheckout(await readJson(request)));
      }

      if (request.method === 'GET' && url.pathname === '/auth/google/start') {
        const desktopRedirect = url.searchParams.get('desktop_redirect');
        if (!isLoopbackRedirect(desktopRedirect)) return sendJson(response, 400, { error: 'A loopback desktop redirect is required.' });
        const state = randomToken();
        pendingStates.set(hashToken(state), { desktopRedirect, expiresAt: Date.now() + 10 * 60 * 1000 });
        const googleUrl = new URL(GOOGLE_AUTHORIZE_URL);
        googleUrl.search = new URLSearchParams({
          client_id: config.googleClientId,
          redirect_uri: `${config.publicUrl}/auth/google/callback`,
          response_type: 'code', scope: 'openid email profile', state,
          prompt: 'select_account', access_type: 'online'
        });
        response.writeHead(302, { location: googleUrl.toString(), 'cache-control': 'no-store' }).end();
        return;
      }

      if (request.method === 'GET' && url.pathname === '/auth/google/callback') {
        const stateHash = hashToken(url.searchParams.get('state') || '');
        const pending = pendingStates.get(stateHash);
        pendingStates.delete(stateHash);
        if (!pending || pending.expiresAt < Date.now()) return sendJson(response, 400, { error: 'The sign-in request expired.' });
        if (url.searchParams.get('error')) {
          const destination = new URL(pending.desktopRedirect);
          destination.searchParams.set('error', 'Google sign-in was cancelled.');
          response.writeHead(302, { location: destination.toString() }).end();
          return;
        }
        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: url.searchParams.get('code') || '', client_id: config.googleClientId,
            client_secret: config.googleClientSecret,
            redirect_uri: `${config.publicUrl}/auth/google/callback`, grant_type: 'authorization_code'
          })
        });
        const tokens = await tokenResponse.json();
        if (!tokenResponse.ok || !tokens.id_token) throw new Error('Google token exchange failed.');
        const infoResponse = await fetch(`${GOOGLE_TOKEN_INFO_URL}?id_token=${encodeURIComponent(tokens.id_token)}`);
        const profile = await infoResponse.json();
        if (!infoResponse.ok || profile.aud !== config.googleClientId || profile.email_verified !== 'true') {
          throw new Error('Google identity verification failed.');
        }
        const now = new Date();
        const user = await users.findOneAndUpdate(
          { googleId: profile.sub },
          { $set: { email: profile.email, name: profile.name || profile.email, picture: profile.picture || '', lastLoginAt: now }, $setOnInsert: { createdAt: now } },
          { upsert: true, returnDocument: 'after' }
        );
        const code = randomToken();
        await exchanges.insertOne({ valueHash: hashToken(code), userId: user._id, expiresAt: new Date(Date.now() + ONE_TIME_TTL_MS) });
        const destination = new URL(pending.desktopRedirect);
        destination.searchParams.set('code', code);
        response.writeHead(302, { location: destination.toString(), 'cache-control': 'no-store' }).end();
        return;
      }

      if (request.method === 'POST' && url.pathname === '/auth/exchange') {
        const { code } = await readJson(request);
        const exchange = await exchanges.findOneAndDelete({ valueHash: hashToken(code || ''), expiresAt: { $gt: new Date() } });
        if (!exchange) return sendJson(response, 401, { error: 'The sign-in code is invalid or expired.' });
        const user = await users.findOne({ _id: exchange.userId });
        const token = randomToken(48);
        await sessions.insertOne({ tokenHash: hashToken(token), userId: user._id, createdAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
        return sendJson(response, 200, { token, user: publicUser(user) });
      }

      if (request.method === 'GET' && url.pathname === '/auth/me') {
        const user = await currentUser(request);
        return user ? sendJson(response, 200, { user: publicUser(user) }) : sendJson(response, 401, { error: 'Not signed in.' });
      }

      if (request.method === 'POST' && url.pathname === '/auth/logout') {
        const match = /^Bearer (.+)$/.exec(request.headers.authorization || '');
        if (match) await sessions.deleteOne({ tokenHash: hashToken(match[1]) });
        return sendJson(response, 200, { ok: true });
      }

      if (request.method === 'GET' && url.pathname === '/wallet') {
        const user = await currentUser(request);
        return user ? sendJson(response, 200, await usageService.reconcile(user)) : sendJson(response, 401, { error: 'Not signed in.' });
      }

      if (request.method === 'POST' && url.pathname === '/usage/start') {
        const user = await currentUser(request);
        if (!user) return sendJson(response, 401, { error: 'Sign in to start usage.' });
        return sendJson(response, 201, await usageService.start(user, randomToken(24)));
      }

      if (request.method === 'POST' && url.pathname === '/usage/heartbeat') {
        const user = await currentUser(request);
        if (!user) return sendJson(response, 401, { error: 'Sign in to continue usage.' });
        const { token } = await readJson(request);
        return sendJson(response, 200, await usageService.heartbeat(user, String(token || '')));
      }

      if (request.method === 'POST' && url.pathname === '/usage/stop') {
        const user = await currentUser(request);
        if (!user) return sendJson(response, 401, { error: 'Sign in to stop usage.' });
        const { token } = await readJson(request);
        return sendJson(response, 200, await usageService.stop(user, String(token || '')));
      }

      if (request.method === 'POST' && url.pathname === '/payments/orders') {
        const user = await currentUser(request);
        if (!user) return sendJson(response, 401, { error: 'Sign in before purchasing minutes.' });
        const body = await readJson(request);
        return sendJson(response, 201, await paymentService.createOrder(user, String(body.planId || '')));
      }

      if (request.method === 'GET' && /^\/payments\/[a-f0-9]{24}$/i.test(url.pathname)) {
        const user = await currentUser(request);
        if (!user) return sendJson(response, 401, { error: 'Not signed in.' });
        const result = await paymentService.status(user, url.pathname.slice('/payments/'.length));
        return result ? sendJson(response, 200, result) : sendJson(response, 404, { error: 'Payment not found.' });
      }

      if (request.method === 'POST' && url.pathname === '/coupons/redeem') {
        const user = await currentUser(request);
        if (!user) return sendJson(response, 401, { error: 'Sign in before redeeming a coupon.' });
        const body = await readJson(request);
        const code = String(body.code || '').trim().toUpperCase();
        if (!/^[A-Z0-9_-]{4,32}$/.test(code)) return sendJson(response, 400, { error: 'Enter a valid coupon code.' });

        const now = new Date();
        const coupon = await coupons.findOne({
          codeHash: hashToken(code), active: true,
          $and: [
            { $or: [{ startsAt: null }, { startsAt: { $lte: now } }, { startsAt: { $exists: false } }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }] }
          ]
        });
        if (!coupon) return sendJson(response, 404, { error: 'This coupon is invalid or expired.' });

        let redemption = await couponRedemptions.findOne({ couponId: coupon._id, userId: user._id });
        let isNew = false;
        if (!redemption) {
          try {
            const created = await couponRedemptions.insertOne({
              couponId: coupon._id, userId: user._id, status: 'pending', createdAt: now
            });
            redemption = { _id: created.insertedId, couponId: coupon._id, userId: user._id, status: 'pending', createdAt: now };
            isNew = true;
          } catch (error) {
            if (error.code !== 11000) throw error;
            redemption = await couponRedemptions.findOne({ couponId: coupon._id, userId: user._id });
          }
        }
        if (redemption.status === 'redeemed') return sendJson(response, 409, { error: 'You have already used this coupon.' });

        if (isNew) {
          const limitFilter = { _id: coupon._id, active: true };
          if (Number.isInteger(coupon.maxRedemptions)) limitFilter.redeemedCount = { $lt: coupon.maxRedemptions };
          const reserved = await coupons.updateOne(limitFilter, { $inc: { redeemedCount: 1 } });
          if (!reserved.modifiedCount) {
            await couponRedemptions.deleteOne({ _id: redemption._id, status: 'pending' });
            return sendJson(response, 409, { error: 'This coupon has reached its redemption limit.' });
          }
        }

        let message;
        if (coupon.benefitType === 'free_seconds') {
          await wallets.updateOne(
            { userId: user._id },
            { $setOnInsert: { balanceSeconds: 0, createdAt: now } },
            { upsert: true }
          );
          await wallets.updateOne(
            { userId: user._id, appliedCouponRedemptions: { $ne: redemption._id } },
            { $inc: { balanceSeconds: coupon.benefitValue }, $addToSet: { appliedCouponRedemptions: redemption._id }, $set: { updatedAt: now } }
          );
          message = `${coupon.benefitValue / 60} free minute${coupon.benefitValue === 60 ? '' : 's'} added.`;
        } else if (coupon.benefitType === 'percent_off') {
          await discounts.updateOne(
            { redemptionId: redemption._id },
            { $setOnInsert: { userId: user._id, couponId: coupon._id, percentOff: coupon.benefitValue, status: 'active', createdAt: now } },
            { upsert: true }
          );
          message = `${coupon.benefitValue}% off saved for your next recharge.`;
        } else {
          throw new Error('Unsupported coupon benefit.');
        }
        await couponRedemptions.updateOne({ _id: redemption._id }, { $set: { status: 'redeemed', redeemedAt: now } });
        return sendJson(response, 200, { message, benefitType: coupon.benefitType, benefitValue: coupon.benefitValue });
      }
      sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      console.error(error);
      const status = Number.isInteger(error.status) ? error.status : 500;
      sendJson(response, status, { error: status < 500 ? error.message : 'The server could not complete this request.' });
    }
  });

  return { server, close: async () => { await new Promise((resolve) => server.close(resolve)); await client.close(); } };
}

module.exports = { createAuthServer, publicUser };
