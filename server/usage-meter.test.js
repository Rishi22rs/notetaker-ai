const test = require('node:test');
const assert = require('node:assert/strict');
const { billableSeconds, nextMeteredAt, LEASE_MS } = require('./usage-meter');

test('usage is charged in whole server-authoritative seconds', () => {
  const lastMeteredAt = new Date('2026-01-01T00:00:00.250Z');
  const leaseExpiresAt = new Date('2026-01-01T00:00:30.250Z');
  assert.equal(billableSeconds({ lastMeteredAt, leaseExpiresAt }, new Date('2026-01-01T00:00:04.999Z')), 4);
  assert.equal(nextMeteredAt(lastMeteredAt, 4).toISOString(), '2026-01-01T00:00:04.250Z');
});

test('a dead client cannot consume usage beyond its server lease', () => {
  const lastMeteredAt = new Date('2026-01-01T00:00:00.000Z');
  const leaseExpiresAt = new Date(lastMeteredAt.getTime() + LEASE_MS);
  assert.equal(billableSeconds({ lastMeteredAt, leaseExpiresAt }, new Date('2026-01-01T01:00:00.000Z')), 30);
});
