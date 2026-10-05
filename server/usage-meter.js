// Usage is deliberately metered by server time, not by a renderer timer.  The
// client only keeps a short lease alive while it is actively listening.
const LEASE_MS = 30 * 1000;

function billableSeconds({ lastMeteredAt, leaseExpiresAt }, now = new Date()) {
  const last = new Date(lastMeteredAt).getTime();
  const lease = new Date(leaseExpiresAt).getTime();
  const end = Math.min(now.getTime(), lease);
  if (!Number.isFinite(last) || !Number.isFinite(end) || end <= last) return 0;
  return Math.floor((end - last) / 1000);
}

function nextMeteredAt(lastMeteredAt, seconds) {
  return new Date(new Date(lastMeteredAt).getTime() + seconds * 1000);
}

function createUsageService({ db }) {
  const sessions = db.collection('usage_sessions');
  const wallets = db.collection('wallets');

  async function ensureIndexes() {
    await Promise.all([
      sessions.createIndex({ token: 1 }, { unique: true }),
      sessions.createIndex({ userId: 1, status: 1 })
    ]);
  }

  async function debit(userId, requestedSeconds, now) {
    if (requestedSeconds <= 0) return 0;
    const wallet = await wallets.findOne({ userId }, { projection: { balanceSeconds: 1 } });
    const available = Math.max(0, Math.floor(Number(wallet?.balanceSeconds) || 0));
    const seconds = Math.min(requestedSeconds, available);
    if (!seconds) return 0;
    const updated = await wallets.updateOne(
      { userId, balanceSeconds: { $gte: seconds } },
      { $inc: { balanceSeconds: -seconds }, $set: { updatedAt: now } }
    );
    // A recharge can race with this update; retry once with the fresh balance.
    return updated.modifiedCount ? seconds : debit(userId, requestedSeconds, now);
  }

  async function settle(session, now) {
    const requested = billableSeconds(session, now);
    if (!requested) return { chargedSeconds: 0, exhausted: false };
    const chargedSeconds = await debit(session.userId, requested, now);
    const lastMeteredAt = nextMeteredAt(session.lastMeteredAt, chargedSeconds);
    const exhausted = chargedSeconds < requested;
    await sessions.updateOne(
      { _id: session._id, status: 'active' },
      {
        $set: { lastMeteredAt, updatedAt: now, ...(exhausted ? { status: 'exhausted', endedAt: now } : {}) },
        $inc: { chargedSeconds }
      }
    );
    return { chargedSeconds, exhausted };
  }

  async function start(user, token) {
    const now = new Date();
    const existing = await sessions.findOne({ userId: user._id, status: 'active' });
    if (existing) await settle(existing, now);
    const active = await sessions.findOne({ userId: user._id, status: 'active' });
    if (active) return { token: active.token, balanceSeconds: await balance(user), resumed: true };
    const current = await balance(user);
    if (current.balanceSeconds < 1) {
      const error = new Error('You have no usage time left. Redeem a coupon or recharge to continue.');
      error.status = 402;
      throw error;
    }
    await sessions.insertOne({
      userId: user._id, token, status: 'active', startedAt: now, lastMeteredAt: now,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS), chargedSeconds: 0, createdAt: now, updatedAt: now
    });
    return { token, balanceSeconds: current.balanceSeconds, resumed: false };
  }

  async function heartbeat(user, token) {
    const now = new Date();
    const session = await sessions.findOne({ userId: user._id, token, status: 'active' });
    if (!session) return { active: false, ...(await balance(user)) };
    const result = await settle(session, now);
    if (!result.exhausted) {
      await sessions.updateOne({ _id: session._id, status: 'active' }, { $set: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS), updatedAt: now } });
    }
    return { active: !result.exhausted, ...result, ...(await balance(user)) };
  }

  async function stop(user, token) {
    const now = new Date();
    const session = await sessions.findOne({ userId: user._id, token, status: 'active' });
    if (session) {
      await settle(session, now);
      await sessions.updateOne({ _id: session._id, status: 'active' }, { $set: { status: 'stopped', endedAt: now, updatedAt: now } });
    }
    return balance(user);
  }

  async function reconcile(user) {
    const session = await sessions.findOne({ userId: user._id, status: 'active' });
    if (session) await settle(session, new Date());
    return balance(user);
  }

  async function balance(user) {
    const value = await wallets.findOne({ userId: user._id }, { projection: { balanceSeconds: 1 } });
    return { balanceSeconds: Math.max(0, Math.floor(Number(value?.balanceSeconds) || 0)) };
  }

  return { ensureIndexes, start, heartbeat, stop, reconcile, balance, leaseMs: LEASE_MS };
}

module.exports = { LEASE_MS, billableSeconds, nextMeteredAt, createUsageService };
