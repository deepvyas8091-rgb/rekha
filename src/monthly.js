// "Your month ahead" for paid users: on the 1st of each month (from 08:00 India time) each paying
// account gets it for its first profile, by email (if they have an address and have not turned it
// off) and by push on their linked phones. It is also shown in the app (Reading tab) on demand.
import { db, listProfiles, getUser } from './db.js';
import { planOf } from './plans.js';
import { monthAhead } from './engagement.js';
import { layout, sendOne, emailConfigured } from './email.js';
import { pushToUser } from './push.js';
import { t, isLang, localePath } from './i18n/index.js';

const base = () => (process.env.PUBLIC_URL || 'https://rekha.io').replace(/\/$/, '');
db.exec('CREATE TABLE IF NOT EXISTS month_sent (user_id TEXT NOT NULL, month TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, month))');

export async function monthlyTick(narrate, now = new Date(), { fetchImpl, sender } = {}) {
  const ist = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = Object.fromEntries(ist.map((x) => [x.type, x.value]));
  if (part.day !== '01' || +part.hour < 8) return 0;
  const month = `${part.year}-${part.month}`;
  let done = 0;
  for (const { id } of db.prepare("SELECT id FROM users WHERE plan != 'free'").all()) {
    const u = getUser(id);
    if (!planOf(u).personal || db.prepare('SELECT 1 FROM month_sent WHERE user_id = ? AND month = ?').get(id, month)) continue;
    const prof = listProfiles(id)[0]; if (!prof) continue;
    const lang = isLang(u.lang) ? u.lang : 'en';
    const place = { lat: prof.birth.lat, lon: prof.birth.lon, tz: prof.birth.tz };
    try {
      const m = await monthAhead(prof, lang, place, narrate, month);
      const url = `${base()}${localePath(lang, '/')}?tab=reading`;
      if (u.email && u.monthly_email && emailConfigured()) {
        const heading = t(lang, 'Your month ahead, {name}', { name: prof.name });
        await sendOne({ to: u.email, subject: heading, ...layout(lang, { heading, paragraphs: m.text.split(/\n\s*\n/), button: { label: t(lang, 'Open Rekha'), url }, why: t(lang, 'Part of your Rekha premium plan. You can turn this email off under Account.') }) }, fetchImpl);
      }
      await pushToUser(id, { title: t(lang, 'Your month ahead is ready'), body: t(lang, 'Best days, days to go slow and this month\'s festivals.'), url: '/?tab=reading' }, sender);
      db.prepare('INSERT OR REPLACE INTO month_sent (user_id, month, at) VALUES (?, ?, ?)').run(id, month, Date.now());
      done++;
    } catch (e) { console.error('month ahead', id, e.message); }
  }
  return done;
}
