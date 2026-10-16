// IndexNow (https://www.indexnow.org): tells Bing, Yandex, Naver and Seznam which pages changed,
// so daily pages are re-crawled the same day. Google does not use IndexNow; it reads the sitemap.
// The key is INDEXNOW_KEY if set, otherwise created once and kept in the database.
import crypto from 'node:crypto';
import { db } from '../db.js';

let key = null;
export function indexNowKey() {
  if (key) return key;
  key = process.env.INDEXNOW_KEY;
  if (!key) {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'indexnow'").get();
    key = row?.value || crypto.randomBytes(16).toString('hex');
    if (!row) db.prepare("INSERT INTO settings (key, value) VALUES ('indexnow', ?)").run(key);
  }
  return key;
}

/** Submit addresses (at most 10,000 per request). Returns the HTTP statuses. */
export async function submitIndexNow(base, urls, fetchImpl = fetch) {
  const host = new URL(base).host;
  const statuses = [];
  for (let i = 0; i < urls.length; i += 10000) {
    const r = await fetchImpl('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key: indexNowKey(), keyLocation: `${base}/${indexNowKey()}.txt`, urlList: urls.slice(i, i + 10000) }),
    });
    statuses.push(r.status);
  }
  return statuses;
}
