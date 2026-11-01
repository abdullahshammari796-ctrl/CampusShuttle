import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from '../../src/identity/password-hasher.ts';
import { TokenService } from '../../src/identity/token-service.ts';
import { EventBus } from '../../src/shared/event-bus.ts';

const SECRET = 'a-test-secret-that-is-long-enough-for-hmac';
const principal = { userId: 'u1', role: 'driver' as const, displayName: 'Driver' };

describe('Password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('correct horse');
    assert.match(hash, /^scrypt\$/);
    assert.equal(await verifyPassword('correct horse', hash), true);
    assert.equal(await verifyPassword('Correct horse', hash), false);
    assert.equal(await verifyPassword('correct horse', 'not-a-hash'), false);
  });

  it('salts every hash', async () => {
    assert.notEqual(await hashPassword('same'), await hashPassword('same'));
  });
});

describe('Session tokens', () => {
  const tokens = new TokenService(SECRET, 60_000);

  it('round-trips a principal until expiry', () => {
    const { token, expiresAt } = tokens.issue(principal, 1000);
    assert.equal(expiresAt, 61_000);
    assert.deepEqual(tokens.verify(token, 2000), principal);
    assert.deepEqual(tokens.verifySession(token, 2000), { principal, expiresAt: 61_000 }, 'expiry is available to close live streams');
    assert.equal(tokens.verify(token, 61_000), null);
  });

  it('rejects tampered payloads, foreign signatures and garbage', () => {
    const { token } = tokens.issue(principal, 1000);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'u1', role: 'office', name: 'x', exp: 99_999 })).toString('base64url');
    assert.equal(tokens.verify(`${forged}.${sig}`, 2000), null, 'role escalation attempt');
    assert.equal(new TokenService(`${SECRET}-other`, 60_000).verify(token, 2000), null);
    assert.equal(tokens.verify(`${body}.`, 2000), null);
    assert.equal(tokens.verify('garbage', 2000), null);
  });

  it('pseudonymises ids stably per purpose without revealing them', () => {
    const a = tokens.pseudonymize('waiting', 'u-student-1');
    assert.equal(a, tokens.pseudonymize('waiting', 'u-student-1'));
    assert.notEqual(a, tokens.pseudonymize('other', 'u-student-1'));
    assert.equal(a.includes('student'), false);
  });

  it('refuses short secrets', () => {
    assert.throws(() => new TokenService('short', 1000));
  });
});

describe('EventBus (Observer pattern)', () => {
  it('delivers to typed and wildcard subscribers and isolates failing handlers', () => {
    const errors: unknown[] = [];
    const bus = new EventBus<{ type: 'a'; n: number } | { type: 'b'; n: number }>((e) => errors.push(e));
    const seen: string[] = [];
    bus.subscribe('a', () => {
      throw new Error('boom');
    });
    bus.subscribe('a', (e) => seen.push(`a${e.n}`));
    bus.subscribeAll((e) => seen.push(`*${e.type}`));
    bus.publish({ type: 'a', n: 1 });
    bus.publish({ type: 'b', n: 2 });
    assert.deepEqual(seen, ['a1', '*a', '*b']);
    assert.equal(errors.length, 1);
    assert.deepEqual(bus.stats(), { published: 2, handlerErrors: 1, subscriptions: 3 });
  });

  it('unsubscribes', () => {
    const bus = new EventBus<{ type: 'a' }>();
    let count = 0;
    const off = bus.subscribe('a', () => count++);
    bus.publish({ type: 'a' });
    off();
    bus.publish({ type: 'a' });
    assert.equal(count, 1);
  });
});
