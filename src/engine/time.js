// Time zone helpers built on Intl, so no tz database dependency is needed.

const fmtCache = new Map();
function partsFormatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }));
  }
  return fmtCache.get(tz);
}

/** Wall-clock parts of a UTC instant in a time zone. */
export function zonedParts(date, tz) {
  const out = {};
  for (const p of partsFormatter(tz).formatToParts(date)) out[p.type] = p.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(out.weekday);
  return {
    year: +out.year, month: +out.month, day: +out.day,
    hour: +out.hour, minute: +out.minute, second: +out.second, weekday: wd,
  };
}

/** Offset in minutes of tz at a UTC instant (e.g. +330 for India). */
export function tzOffsetMinutes(date, tz) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Convert local wall-clock time in tz to a UTC Date. Handles historical offsets. */
export function zonedToUtc(year, month, day, hour = 0, minute = 0, tz = 'UTC') {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let off = tzOffsetMinutes(new Date(guess), tz);
  let utc = guess - off * 60000;
  const off2 = tzOffsetMinutes(new Date(utc), tz);
  if (off2 !== off) utc = guess - off2 * 60000;
  return new Date(utc);
}

export function fmtTime(date, tz) {
  if (!date) return null;
  const p = zonedParts(date, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function fmtDateTime(date, tz) {
  if (!date) return null;
  const p = zonedParts(date, tz);
  const d = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return `${d} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  if (!m) throw new Error(`Invalid date "${str}", expected YYYY-MM-DD`);
  return { year: +m[1], month: +m[2], day: +m[3] };
}

export function parseTime(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str || '');
  if (!m) throw new Error(`Invalid time "${str}", expected HH:MM`);
  return { hour: +m[1], minute: +m[2] };
}

export const addMs = (d, ms) => new Date(d.getTime() + ms);
export const DAY_MS = 86400000;
