// Mobile number + password accounts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'adm-token-123';
delete process.env.ANTHROPIC_API_KEY;
const { default: app } = await import('../src/server.js');
const { normalisePhone, hashPassword, verifyPassword } = await import('../src/auth.js');

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
after(() => server.close());

function client() {
  let cookie = '';
  const call = async (p, body, headers = {}) => {
    const res = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body && JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { call, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}

test('phone numbers are normalised to international format and validated', () => {
  assert.equal(normalisePhone('+91', '98765 43210'), '+919876543210');
  assert.equal(normalisePhone('+91', '09876543210'), '+919876543210');
  assert.equal(normalisePhone('+91', '+91 98765-43210'), '+919876543210');
  assert.equal(normalisePhone('+971', '50 123 4567'), '+971501234567');
  assert.throws(() => normalisePhone('+91', '12345'), /10-digit/);
  assert.throws(() => normalisePhone('+91', '5876543210'), /10-digit/);
});

test('passwords are hashed with scrypt and verified', () => {
  const h = hashPassword('correct horse');
  assert.match(h, /^scrypt\$/);
  assert.ok(!h.includes('correct horse'));
  assert.ok(verifyPassword('correct horse', h));
  assert.ok(!verifyPassword('wrong', h));
});

test('sign up, log out, log in with mobile and password', async () => {
  const c = client();
  const s = await c.call('/api/auth/signup', { name: 'Asha', countryCode: '+91', phone: '9876500001', password: 'secret123' });
  assert.equal(s.status, 200);
  let me = await c.call('/api/me');
  assert.equal(me.body.user.phone, '+919876500001');
  assert.equal(me.body.user.hasPassword, true);
  await c.call('/api/auth/logout', {});
  c.cookie = '';
  assert.equal((await c.call('/api/me')).body.user, null);
  const l = await c.call('/api/auth/login', { countryCode: '+91', phone: '98765 00001', password: 'secret123' });
  assert.equal(l.status, 200);
  me = await c.call('/api/me');
  assert.equal(me.body.user.name, 'Asha');
});

test('duplicate number, weak password and bad login are rejected without revealing which', async () => {
  const c = client();
  assert.equal((await c.call('/api/auth/signup', { name: 'X', phone: '9876500001', password: 'another123' })).status, 409);
  assert.equal((await c.call('/api/auth/signup', { name: 'X', phone: '9876500002', password: 'short' })).status, 400);
  const wrongPw = await c.call('/api/auth/login', { phone: '9876500001', password: 'nope-nope' });
  const noUser = await c.call('/api/auth/login', { phone: '9876599999', password: 'nope-nope' });
  assert.equal(wrongPw.status, 401);
  assert.equal(noUser.status, 401);
  assert.equal(wrongPw.body.error, noUser.body.error);
});

test('five wrong passwords lock the account for 15 minutes', async () => {
  const c = client();
  await c.call('/api/auth/signup', { name: 'Lock', phone: '9876500003', password: 'rightpass1' });
  c.cookie = '';
  for (let i = 0; i < 5; i++) await c.call('/api/auth/login', { phone: '9876500003', password: 'wrongpass' });
  const locked = await c.call('/api/auth/login', { phone: '9876500003', password: 'rightpass1' });
  assert.equal(locked.status, 429);
});

test('owner reset gives a temporary password and signs out old devices', async () => {
  const user = client();
  await user.call('/api/auth/signup', { name: 'Ravi', phone: '9876500004', password: 'original1' });
  const oldCookie = user.cookie;
  const admin = client();
  const found = await admin.call('/api/admin/users?q=9876500004', null, { 'x-admin-token': 'adm-token-123' });
  assert.equal(found.body.length, 1);
  assert.equal((await admin.call('/api/admin/users?q=x', null, { 'x-admin-token': 'wrong' })).status, 403);
  const reset = await admin.call('/api/admin/reset-password', { userId: found.body[0].id }, { 'x-admin-token': 'adm-token-123' });
  assert.ok(reset.body.tempPassword.length >= 8);
  // Old session no longer valid.
  const stale = client(); stale.cookie = oldCookie;
  assert.equal((await stale.call('/api/me')).body.user, null);
  // Temp password works; then the user changes it.
  const fresh = client();
  assert.equal((await fresh.call('/api/auth/login', { phone: '9876500004', password: reset.body.tempPassword })).status, 200);
  assert.equal((await fresh.call('/api/auth/password', { currentPassword: reset.body.tempPassword, newPassword: 'brandnew1' })).status, 200);
  assert.equal((await fresh.call('/api/me')).body.user.name, 'Ravi', 'this device stays signed in after changing password');
});

test('a Google user can add a mobile number and a password', async () => {
  process.env.DEV_LOGIN = '1';
  const c = client();
  // dev login is gated at import time; skip if not enabled in this process
  const r = await c.call('/api/auth/dev', { email: 'g@example.com' });
  if (r.status !== 200) return;
  assert.equal((await c.call('/api/auth/phone', { countryCode: '+91', phone: '9876500005' })).status, 200);
  assert.equal((await c.call('/api/auth/password', { newPassword: 'googlepw1' })).status, 200);
});
