// Measurement:
//   GA4 (GA4_MEASUREMENT_ID, e.g. G-XXXXXXX) and Microsoft Clarity (CLARITY_PROJECT_ID), loaded after
//   the page is idle so they never slow the first paint. Visitors in Europe (EEA, UK, Switzerland:
//   detected from the browser time zone) are asked first; until they accept, GA4 runs in cookieless
//   consent mode and Clarity does not load. No advertising features are switched on anywhere.
//   A first-party event log (no cookies, an anonymous random id on the device) feeds the funnel in
//   the owner dashboard, so the key numbers exist even if GA4 is blocked or not set up yet.
import express from 'express';
import { db } from './db.js';
import { t } from './i18n/index.js';

db.exec(`CREATE TABLE IF NOT EXISTS events (
  day TEXT NOT NULL, vid TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, vid, name)
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_events_name ON events(name, day)');

export const EVENTS = ['app_open', 'page_view', 'alerts_on', 'app_installed', 'palm_scan', 'face_scan', 'free_reading', 'full_reading',
  'sign_up', 'login', 'plans_view', 'checkout_start', 'purchase', 'share_timings', 'calendar_add', 'muhurat_search',
  'invite_created', 'invite_opened', 'invite_completed', 'ask_question', 'question_chip', 'quickstart_done', 'email_signup', 'month_ahead_view'];
const KNOWN = new Set(EVENTS);
const GA = () => (/^G-[A-Z0-9]{4,20}$/.test(process.env.GA4_MEASUREMENT_ID || '') ? process.env.GA4_MEASUREMENT_ID : null);
const CLARITY = () => (/^[a-z0-9]{6,20}$/i.test(process.env.CLARITY_PROJECT_ID || '') ? process.env.CLARITY_PROJECT_ID : null);

/** <head> scripts: consent default, the rk() event helper, and GA4 / Clarity loaded when idle. */
export function analyticsHead() {
  const ga = GA(); const cl = CLARITY();
  return `<script>(function(){
var tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}
var eu=/^Europe\\/|^Atlantic\\/(Reykjavik|Canary|Madeira|Azores|Faroe)/.test(tz);
var c=null;try{c=localStorage.getItem('rk_consent')}catch(e){}
var ok=c?c==='yes':!eu;window.__rkConsent={needed:eu&&!c,ok:ok};
var vid='';if(ok){try{vid=localStorage.getItem('rk_vid')||'';if(!vid){vid=Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem('rk_vid',vid)}}catch(e){}}
window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:ok?'granted':'denied'});
${ga ? `gtag('js',new Date());gtag('config','${ga}',{anonymize_ip:true});` : ''}
window.rk=function(n,p){try{gtag('event',n,p||{});if(window.clarity)clarity('event',n);var b=JSON.stringify({n:n,v:vid});if(!(navigator.sendBeacon&&navigator.sendBeacon('/api/ev',new Blob([b],{type:'application/json'}))))fetch('/api/ev',{method:'POST',headers:{'content-type':'application/json'},body:b,keepalive:true})}catch(e){}};
function load(){${ga ? `var s=document.createElement('script');s.async=1;s.src='https://www.googletagmanager.com/gtag/js?id=${ga}';document.head.appendChild(s);` : ''}${cl ? `if(window.__rkConsent.ok){(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${cl}");}` : ''}}
window.__rkLoadAnalytics=load;
window.addEventListener('load',function(){(window.requestIdleCallback||function(f){setTimeout(f,1500)})(load,{timeout:3000})});
})();</script>`;
}

/** The consent bar for visitors in Europe (hidden for everyone else by the script). */
export function consentBar(lang) {
  return `<div class="consent" id="rkConsent" hidden role="region" aria-label="${t(lang, 'Cookies')}">
  <p>${t(lang, 'Rekha uses cookies for anonymous usage statistics (Google Analytics and Microsoft Clarity) to see what helps. No ads.')} <a href="/privacy">${t(lang, 'Privacy')}</a></p>
  <div><button type="button" class="primary small" data-consent="yes">${t(lang, 'Accept')}</button><button type="button" class="ghost small" data-consent="no">${t(lang, 'Decline')}</button></div>
</div>
<script>(function(){var b=document.getElementById('rkConsent');if(!b||!window.__rkConsent||!window.__rkConsent.needed)return;b.hidden=false;
b.addEventListener('click',function(e){var v=e.target.getAttribute('data-consent');if(!v)return;try{localStorage.setItem('rk_consent',v)}catch(x){}b.hidden=true;
if(v==='yes'){window.__rkConsent.ok=true;gtag('consent','update',{analytics_storage:'granted'});if(window.__rkLoadAnalytics)window.__rkLoadAnalytics()}});})();</script>`;
}

// ---- first-party event log --------------------------------------------------------------
const today = () => new Date().toISOString().slice(0, 10);
export function recordEvent(name, vid = '') {
  if (!KNOWN.has(name)) return false;
  db.prepare('INSERT INTO events (day, vid, name, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, vid, name) DO UPDATE SET n = n + 1')
    .run(today(), /^[a-z0-9]{6,40}$/.test(vid) ? vid : '', name);
  return true;
}
let lastPrune = 0;
function prune() {
  if (Date.now() - lastPrune < 86400000) return;
  lastPrune = Date.now();
  db.prepare('DELETE FROM events WHERE day < ?').run(new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10));
}

/** Funnel for the owner dashboard over the last `days` days. */
export function funnel(days = 30) {
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const rows = db.prepare("SELECT name, SUM(n) n, COUNT(DISTINCT CASE WHEN vid != '' THEN vid END) people FROM events WHERE day >= ? GROUP BY name").all(since);
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  const visitors = db.prepare("SELECT COUNT(DISTINCT vid) n FROM events WHERE day >= ? AND vid != ''").get(since).n;
  // Returning: seen on 2+ different days in the window. Week-1 retention: first seen 8 to 14 days ago, active again in the last 7 days.
  const returning = db.prepare("SELECT COUNT(*) n FROM (SELECT vid FROM events WHERE day >= ? AND vid != '' GROUP BY vid HAVING COUNT(DISTINCT day) >= 2)").get(since).n;
  const d = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const cohort = db.prepare("SELECT vid FROM events WHERE vid != '' GROUP BY vid HAVING MIN(day) BETWEEN ? AND ?").all(d(14), d(8)).map((r) => r.vid);
  const back = cohort.length ? db.prepare(`SELECT COUNT(DISTINCT vid) n FROM events WHERE day >= ? AND vid IN (${cohort.map(() => '?').join(',')})`).get(d(6), ...cohort).n : 0;
  const daily = db.prepare("SELECT day, COUNT(DISTINCT CASE WHEN vid != '' THEN vid END) visitors, SUM(CASE WHEN name = 'share_timings' THEN n ELSE 0 END) shares FROM events WHERE day >= ? GROUP BY day ORDER BY day").all(since);
  return { days, visitors, returning, week1: { cohort: cohort.length, back }, events: Object.fromEntries(EVENTS.map((e) => [e, by[e] ? { n: by[e].n, people: by[e].people } : { n: 0, people: 0 }])), daily };
}

export function analyticsRoutes(app, { isAdmin, limit }) {
  app.post('/api/ev', express.json({ limit: '1kb', type: ['application/json', 'text/plain'] }), limit(600), (req, res) => {
    recordEvent(String(req.body?.n || ''), String(req.body?.v || ''));
    prune();
    res.status(204).end();
  });
  app.get('/api/admin/funnel', (req, res) => (isAdmin(req) ? res.json(funnel(Math.min(90, Math.max(7, +req.query.days || 30)))) : res.status(403).json({ error: 'forbidden' })));
}
