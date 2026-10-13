// Rekha web client. Plain ES modules, no build step.
import {
  TIMES, PANCHANG, nakshatraNature, SIGN_TRAIT, PLANET, HOUSE, DASHA, KUNDLI_TERMS, LIFE_PATH,
  CHINESE_ANIMAL, ELEMENT, PALM_GUIDE, FACE_GUIDE, PALM_SVG, FACE_SVG,
} from './guide.js';
import { t, d, N, month, lang, loadPack, pathFor, fmtDate } from './i18n.js';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const local = {
  get(k, d = null) { try { return JSON.parse(localStorage.getItem(`rekha.${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`rekha.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};
const state = {
  meta: null, me: { user: null }, place: local.get('place'), profileId: local.get('profileId'),
  guestBirth: local.get('birth'), // signed-out users keep one chart on the device
  palm: null, face: null, history: [], cgPart: 'day', timings: null,
};
const profiles = () => state.me.profiles || [];
const current = () => profiles().find((p) => p.id === state.profileId && !p.locked) || profiles().find((p) => !p.locked) || null;
const isPaid = () => !!state.me.plan?.personal;

// ---------- API ----------
class ApiError extends Error { constructor(msg, status, code) { super(msg); this.status = status; this.code = code; } }
async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(path, { credentials: 'same-origin', ...opts, headers: opts.body && !isForm ? { 'content-type': 'application/json' } : {} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(data.error ? d(data.error) : t('Request failed ({status})', { status: res.status }), res.status, data.code);
    if (res.status === 401 && data.code === 'signin') openSignin(data.error);
    if (res.status === 402 && data.code === 'upgrade') openPlans(data.error);
    throw err;
  }
  return data;
}
const post = (path, body, method = 'POST') => api(path, { method, body: body instanceof FormData ? body : JSON.stringify(body) });
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString();
const showError = (el, e) => { el.innerHTML = e.status === 402 || e.status === 401 ? `<div class="card upsell">${esc(e.message)}</div>` : `<div class="card q-bad">${esc(e.message)}</div>`; };
const pill = (q, text) => `<span class="pill q-${esc(q)}">${esc(d(text))}</span>`;
const ACT = { general: N('General'), business: N('Business'), travel: N('Travel'), marriage: N('Marriage'), purchase: N('Purchase'), property: N('Property'), government: N('Government work'), education: N('Education'), health: N('Health') };
const actName = (a) => t(ACT[a] || a[0].toUpperCase() + a.slice(1));
const loc = () => ({ lat: state.place.lat, lon: state.place.lon, tz: state.place.tz });

// ---------- boot ----------
async function boot() {
  [state.meta] = await Promise.all([api('/api/meta'), loadPack()]);
  $('#demoBanner').hidden = !state.meta.demoMode;
  const cityOpts = state.meta.cities.map((c, i) => `<option value="${i}">${esc(d(c.name))}</option>`).join('');
  for (const sel of ['#placeSel', '[name=city]', '[name=bCity]', '[name=gCity]']) $(sel).innerHTML = cityOpts;
  const actOpts = state.meta.activities.map((a) => `<option value="${a}">${esc(actName(a))}</option>`).join('');
  $('#activity').innerHTML = actOpts; $('#calActivity').innerHTML = actOpts;
  // Reading language: the page language unless the user picked another one for readings.
  $('#lang').innerHTML = Object.entries(state.meta.languageNames).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  const readLang = local.get(`readLang.${lang}`);
  $('#lang').value = readLang && state.meta.languageNames[readLang] ? readLang : lang;
  document.cookie = `rk_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
  if (!state.place) state.place = state.meta.cities.find((c) => c.name === 'Mumbai');
  $('#placeBtn').textContent = d(state.place.name);
  $('#panchDate').value = new Intl.DateTimeFormat('en-CA', { timeZone: state.place.tz }).format(new Date());
  bindUi();
  bindAuth();
  renderGuides();
  await refreshMe();
  loadToday();
  // Deep links from articles, e.g. /?tab=chart. Tabs keep the URL in sync, so Back works.
  const tab = new URLSearchParams(location.search).get('tab');
  if (tab && $(`#tab-${tab}`)) switchTab(tab, false);
  window.addEventListener('popstate', () => switchTab(new URLSearchParams(location.search).get('tab') || 'today', false));
}

// Static explanations that do not depend on data.
function renderGuides() {
  $$('details.explain').forEach((el) => {
    const x = TIMES[el.dataset.explain]; if (!x) return;
    let body = `<div><p>${esc(t(x.body))}</p>`;
    if (el.dataset.explain === 'choghadiya') body += `<div class="legend">${TIMES.types.map(([n, q, m]) => `<div>${pill(q, n)}<span>${esc(t(m))}</span></div>`).join('')}</div>`;
    el.innerHTML = `<summary>${esc(t(x.title))}</summary>${body}</div>`;
  });
  $('#horaExplain').textContent = t(TIMES.hora.body);
  $('#panchIntro').textContent = t(PANCHANG.intro);
  const guide = (g, svg) => `
    <div class="guide-top">${svg}<p>${esc(t(g.intro))}</p></div>
    <h3>${esc(t('What your reading shows'))}</h3>
    <ul class="guide-list">${g.sections.map(([a, b]) => `<li><strong>${esc(t(a))}</strong>${esc(t(b))}</li>`).join('')}</ul>
    ${g.never ? `<p class="never">${esc(t(g.never))}</p>` : ''}
    <details class="explain"><summary>${esc(t('Tips for a good photo'))}</summary><div><ul class="tips">${g.tips.map((x) => `<li>${esc(t(x))}</li>`).join('')}</ul></div></details>`;
  $('#palmGuide').innerHTML = guide(PALM_GUIDE, PALM_SVG());
  $('#faceGuide').innerHTML = guide(FACE_GUIDE, FACE_SVG());
}

async function refreshMe() {
  state.me = await api('/api/me');
  const signed = !!state.me.user;
  $('#accountBtn').textContent = signed ? (state.me.user.name || t('Account')) : t('Sign in');
  $('#planBtn').textContent = isPaid() ? t(state.me.plan.name) : t('Premium');
  $('#planBtn').classList.toggle('premium', !isPaid());
  const usable = profiles().filter((p) => !p.locked);
  if (!current() && usable[0]) state.profileId = usable[0].id;
  $('#profileBar').hidden = usable.length < 2;
  $('#profileSel').innerHTML = usable.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (current()) $('#profileSel').value = current().id;
  renderProfiles(); updateSources(); renderMatchPickers();
}

function bindUi() {
  $$('.tabs button[data-tab]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#langMenu')?.addEventListener('toggle', (e) => {
    // Keep the open tab when switching language.
    if (e.target.open) $$('#langMenu a[hreflang]').forEach((a) => { a.href = pathFor(a.dataset.l) + location.search; });
  });
  $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $('#placeBtn').addEventListener('click', () => $('#placeDlg').showModal());
  $('#placeDlg').addEventListener('close', () => { if ($('#placeDlg').returnValue === 'ok') setPlace(state.meta.cities[+$('#placeSel').value]); });
  $('#gpsBtn').addEventListener('click', () => navigator.geolocation?.getCurrentPosition((p) => {
    setPlace({ name: t('My location'), lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    $('#placeDlg').close();
  }, () => alert(t('Location permission was not granted.'))));
  $('#planBtn').addEventListener('click', () => openPlans());
  $('#accountBtn').addEventListener('click', () => (state.me.user ? openAccount() : openSignin()));
  $('#profileSel').addEventListener('change', (e) => selectProfile(e.target.value));
  $('#activity').addEventListener('change', loadToday);
  $$('[data-cg]').forEach((b) => b.addEventListener('click', () => {
    state.cgPart = b.dataset.cg; $$('[data-cg]').forEach((x) => x.classList.toggle('on', x === b)); renderChoghadiya();
  }));
  $('#panchDate').addEventListener('change', () => { loadPanchang(); loadCalendar(); });
  $('#calActivity').addEventListener('change', loadCalendar);
  $('#birthForm').addEventListener('submit', onBirth);
  $('#addMemberBtn').addEventListener('click', () => { $('#birthForm').hidden = false; $('#addMemberBtn').hidden = true; $('#birthForm').scrollIntoView({ behavior: 'smooth' }); });
  $('#palmFile').addEventListener('change', onPalm);
  $('#faceConsent').addEventListener('change', (e) => { $('#faceFile').disabled = !e.target.checked; $('#faceUpload').classList.toggle('disabled', !e.target.checked); });
  $('#faceFile').addEventListener('change', onFace);
  $('#readBtn').addEventListener('click', () => onReading(false));
  $('#lang').addEventListener('change', () => { local.set(`readLang.${lang}`, $('#lang').value); if (isPaid()) loadDaily(); });
  $('#chatForm').addEventListener('submit', onAsk);
  $('#shareBtn').addEventListener('click', shareCard);
  $('#matchForm').addEventListener('submit', onMatch);
  $('#devForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await post('/api/auth/dev', { email: e.target.email.value || 'tester@example.com' });
    $('#signinDlg').close(); await afterSignin();
  });
}

function switchTab(name, push = true) {
  if (push) {
    const url = name === 'today' ? location.pathname : `${location.pathname}?tab=${name}`;
    if (url !== location.pathname + location.search) history.pushState({ tab: name }, '', url);
  }
  $$('.tabs button[data-tab]').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('on', on);
    if (on) { b.setAttribute('aria-current', 'page'); b.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } else b.removeAttribute('aria-current');
  });
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
  if (name === 'panchang' && !$('#panchang').innerHTML) { loadPanchang(); loadCalendar(); }
  if (name === 'chart' && current() && !$('#chart').innerHTML) showChart();
  if (name === 'reading') loadSavedReading();
  window.scrollTo(0, 0);
}

function setPlace(p) {
  state.place = p; local.set('place', p); $('#placeBtn').textContent = p.name;
  loadToday(); $('#panchang').innerHTML = ''; $('#calendar').innerHTML = '';
  if ($('#tab-panchang').classList.contains('active')) { loadPanchang(); loadCalendar(); }
}

function selectProfile(id) {
  state.profileId = id; local.set('profileId', id);
  state.palm = null; state.face = null; state.history = [];
  $('#reading').hidden = true; $('#chatCard').hidden = true; $('#chart').innerHTML = '';
  if ($('#profileSel').value !== id) $('#profileSel').value = id;
  updateSources(); loadToday(); $('#calendar').innerHTML = '';
  if ($('#tab-panchang').classList.contains('active')) loadCalendar();
  if ($('#tab-chart').classList.contains('active')) showChart();
  if ($('#tab-reading').classList.contains('active')) loadSavedReading();
  renderProfiles();
}

// ---------- sign-in ----------
let gsiLoaded = null;
function loadGsi() {
  gsiLoaded ||= new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = resolve; s.onerror = reject; document.head.append(s);
  });
  return gsiLoaded;
}
const COUNTRY_CODES = [['+91', 'IN +91'], ['+971', 'AE +971'], ['+65', 'SG +65'], ['+60', 'MY +60'], ['+66', 'TH +66'], ['+62', 'ID +62'], ['+63', 'PH +63'], ['+84', 'VN +84'], ['+977', 'NP +977'], ['+94', 'LK +94'], ['+880', 'BD +880'], ['+44', 'UK +44'], ['+1', 'US/CA +1'], ['+61', 'AU +61']];
function authMode(mode) {
  $$('[data-auth]').forEach((b) => b.classList.toggle('on', b.dataset.auth === mode));
  $('#loginForm').hidden = mode !== 'login';
  $('#signupForm').hidden = mode !== 'signup';
  $('#signinTitle').textContent = mode === 'login' ? t('Log in') : t('Create your account');
  $('#authError').hidden = true;
}
function authError(msg) { $('#authError').textContent = msg; $('#authError').hidden = false; }
function bindAuth() {
  const opts = COUNTRY_CODES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  $$('#signinDlg [name=countryCode]').forEach((sel) => { sel.innerHTML = opts; });
  $$('[data-auth]').forEach((b) => b.addEventListener('click', () => authMode(b.dataset.auth)));
  const submit = (path) => async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('.primary');
    const body = Object.fromEntries(new FormData(f));
    btn.disabled = true;
    try {
      await post(path, body);
      $('#signinDlg').close(); f.reset(); await afterSignin();
      toast(path.endsWith('signup') ? t('Welcome to Rekha!') : t('Welcome back!'));
    } catch (err) {
      authError(err.message);
      if (err.code === 'exists') { authMode('login'); authError(err.message); $('#loginForm [name=phone]').value = body.phone; }
    } finally { btn.disabled = false; }
  };
  $('#loginForm').addEventListener('submit', submit('/api/auth/login'));
  $('#signupForm').addEventListener('submit', submit('/api/auth/signup'));
  $('#forgotBtn').addEventListener('click', () => authError(t('Forgot your password? Message us on WhatsApp from your registered number and we will reset it for you. If you used Google before, you can also continue with Google below.')));
}
async function openSignin(why, mode = 'login') {
  $('#signinMsg').textContent = why || t("Save your family's profiles and unlock AI readings.");
  $('#devForm').hidden = !state.meta.devLogin;
  authMode(mode);
  if (!$('#signinDlg').open) $('#signinDlg').showModal();
  const hasGoogle = !!state.meta.googleClientId;
  $('#googleOr').hidden = !hasGoogle && !state.meta.devLogin;
  if (!hasGoogle) { $('#gsiBtn').innerHTML = ''; return; }
  try {
    await loadGsi();
    google.accounts.id.initialize({
      client_id: state.meta.googleClientId,
      callback: async ({ credential }) => {
        try { await post('/api/auth/google', { credential }); $('#signinDlg').close(); await afterSignin(); } catch (e) { authError(e.message); }
      },
    });
    google.accounts.id.renderButton($('#gsiBtn'), { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 300, locale: lang });
  } catch { authError(t('Could not load Google sign-in. You can still use your mobile number.')); }
}
async function afterSignin() {
  await refreshMe();
  // Move a chart made before signing in into the account.
  if (state.guestBirth && !profiles().length) {
    try { const p = await post('/api/profiles', { name: state.guestBirth.name || t('Me'), relation: 'self', birth: state.guestBirth }); state.profileId = p.id; await refreshMe(); } catch { /* plan limit */ }
  }
  loadToday();
}

// ---------- plans + checkout ----------
function openPlans(why) {
  $('#plansWhy').textContent = why || t('Free tools stay free. Premium adds your personal times, daily guidance and full readings.');
  const cur = state.me.plan?.key || 'free';
  $('#plansList').innerHTML = state.meta.plans.filter((p) => p.key !== 'free').map((p) => `
    <div class="plan${cur === p.key ? ' current' : ''}${p.key === 'couple' ? ' popular' : ''}">
      ${p.key === 'couple' ? `<span class="tag">${esc(t('Most popular'))}</span>` : ''}
      <h3>${esc(t(p.name))}</h3>
      <div class="price">₹${p.priceInr}<small>${esc(t('/month'))}</small></div>
      <ul>${p.features.slice(0, 4).map((f) => `<li>${esc(d(f))}</li>`).join('')}</ul>
      <button class="primary" data-plan="${p.key}" ${cur === p.key ? 'disabled' : ''}>${esc(cur === p.key ? t('Your plan') : cur === 'free' ? t('Start {plan}', { plan: t(p.name) }) : t('Switch to {plan}', { plan: t(p.name) }))}</button>
    </div>`).join('');
  $$('#plansList [data-plan]').forEach((b) => b.addEventListener('click', () => subscribe(b.dataset.plan)));
  if (!$('#plansDlg').open) $('#plansDlg').showModal();
}
let rzpLoaded = null;
function loadRazorpay() {
  rzpLoaded ||= new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve; s.onerror = reject; document.head.append(s);
  });
  return rzpLoaded;
}
async function subscribe(plan) {
  if (!state.me.user) { $('#plansDlg').close(); openSignin(t('Sign in first so your plan is saved to your account.')); return; }
  try {
    if (state.me.plan?.key !== 'free' && !confirm(t('Switching starts a new monthly plan today and ends your current one. Continue?'))) return;
    const s = await post('/api/billing/subscribe', { plan });
    await loadRazorpay();
    const rzp = new window.Razorpay({
      key: s.keyId, subscription_id: s.subscriptionId, name: 'Rekha', description: t('{plan} plan, ₹{price}/month', { plan: t(s.name), price: s.priceInr }),
      prefill: { email: s.email, name: s.userName }, theme: { color: '#2b1840' },
      handler: async (r) => {
        try { await post('/api/billing/verify', r); $('#plansDlg').close(); await refreshMe(); loadToday(); toast(t('Welcome to {plan}!', { plan: t(s.name) })); } catch (e) { alert(e.message); }
      },
    });
    rzp.on('payment.failed', (r) => alert(r.error?.description || t('Payment failed. You have not been charged.')));
    rzp.open();
  } catch (e) { if (e.status !== 402) alert(e.message); }
}

// ---------- account ----------
function openAccount() {
  const m = state.me; const p = m.plan;
  const meter = (k, label) => m.allowance[k].max ? `<div class="meter"><span>${esc(t(label))}</span><span>${m.allowance[k].used} / ${m.allowance[k].max}</span></div>` : '';
  const renew = p.renewsAt ? fmtDate(p.renewsAt, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  $('#accountBody').innerHTML = `
    <h2>${esc(m.user.name || t('Your account'))}</h2>
    <p class="hint">${esc([m.user.phone, m.user.email].filter(Boolean).join(' · '))}</p>
    <div class="card"><strong>${esc(t('{plan} plan', { plan: t(p.name) }))}</strong>${p.key !== 'free' && renew ? `<p class="hint">${esc(p.status === 'cancelling' || p.status === 'cancelled' ? t('Access until {date}', { date: renew }) : t('Renews {date}', { date: renew }))}</p>` : ''}
      <h3>${esc(t('This month'))}</h3>${meter('reading', N('Full readings'))}${meter('palm', N('Palm scans'))}${meter('chat', N('Questions'))}${meter('match', N('Match explanations'))}${meter('daily', N('Daily guidance'))}
    </div>
    <button class="primary" id="accPlans">${esc(p.key === 'free' ? t('See premium plans') : t('Change plan'))}</button>
    ${p.key !== 'free' && p.status !== 'cancelling' && p.status !== 'cancelled' ? `<button class="ghost" id="accCancel">${esc(t('Cancel subscription'))}</button>` : ''}
    <details class="explain"><summary>${esc(m.user.phone ? t('Change mobile number') : t('Add mobile number'))}</summary><div>
      <form id="accPhone" class="form"><span class="phone"><select name="countryCode" aria-label="${esc(t('Country code'))}">${COUNTRY_CODES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><input name="phone" type="tel" inputmode="numeric" placeholder="98765 43210" required></span><button class="ghost">${esc(t('Save number'))}</button></form></div></details>
    <details class="explain"><summary>${esc(m.user.hasPassword ? t('Change password') : t('Set a password (log in with your mobile number)'))}</summary><div>
      <form id="accPw" class="form">${m.user.hasPassword ? `<input name="currentPassword" type="password" placeholder="${esc(t('Current password'))}" autocomplete="current-password" required>` : ''}<input name="newPassword" type="password" placeholder="${esc(t('New password (8+ characters)'))}" autocomplete="new-password" minlength="8" required><button class="ghost">${esc(t('Save password'))}</button></form></div></details>
    <p class="hint" id="accMsg"></p>
    <button class="ghost" id="accOut">${esc(t('Sign out'))}</button>
    <button class="ghost danger" id="accDelete">${esc(t('Delete my account and data'))}</button>
    <button class="ghost" data-close>${esc(t('Close'))}</button>`;
  $('#accountBody [data-close]').addEventListener('click', () => $('#accountDlg').close());
  $('#accPlans').addEventListener('click', () => { $('#accountDlg').close(); openPlans(); });
  $('#accCancel')?.addEventListener('click', async () => {
    if (!confirm(t('Cancel? You keep premium until the end of the month you paid for.'))) return;
    try { await post('/api/billing/cancel', {}); await refreshMe(); openAccount(); } catch (e) { alert(e.message); }
  });
  $('#accOut').addEventListener('click', async () => { await post('/api/auth/logout', {}); location.reload(); });
  $('#accPhone').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await post('/api/auth/phone', Object.fromEntries(new FormData(e.target))); await refreshMe(); openAccount(); $('#accMsg').textContent = t('Mobile number saved.'); } catch (err) { $('#accMsg').textContent = err.message; }
  });
  $('#accPw').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await post('/api/auth/password', Object.fromEntries(new FormData(e.target))); await refreshMe(); openAccount(); $('#accMsg').textContent = t('Password saved. Other devices have been signed out.'); } catch (err) { $('#accMsg').textContent = err.message; }
  });
  $('#accDelete').addEventListener('click', async () => {
    if (!confirm(t('This permanently deletes your account, all profiles, scans and readings. Continue?'))) return;
    try { await api('/api/me', { method: 'DELETE' }); localStorage.clear(); location.reload(); } catch (e) { alert(e.message); }
  });
  if (!$('#accountDlg').open) $('#accountDlg').showModal();
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}

// ---------- today ----------
async function loadToday() {
  const prof = current();
  try {
    const tm = await api(`/api/timings?${qs({ ...loc(), activities: $('#activity').value, profile: prof?.id })}`);
    state.timings = tm;
    renderNow(tm, prof);
    const wins = tm.bestWindows[$('#activity').value] || [];
    $('#bestWindows').innerHTML = wins.length
      ? wins.map((w) => `<div class="window"><strong>${esc(w.start)} – ${esc(w.end)}</strong><span>${esc(d(w.choghadiya))} · ${esc(t('{planets} hora', { planets: w.horas.map(d).join(', ') }))}</span></div>`).join('')
      : `<div class="card muted">${esc(t('No clean daytime window today for this activity. Check the Panchang tab for better days.'))}</div>`;
    $('#badTimes').innerHTML = tm.badTimes.map((b) => item(b, 'bad')).join('') + (tm.panchak ? `<div class="item bad"><time>${esc(t('All day'))}</time><div><strong>${esc(d('Panchak'))}</strong><small>${esc(d(tm.panchak))}</small></div></div>` : '');
    $('#goodTimes').innerHTML = tm.goodTimes.filter((g) => !g.skip).map((g) => item(g, 'good')).join('');
    renderChoghadiya();
    $('#hora').innerHTML = tm.hora.map((h) => `<div class="item ${h.quality === 'bad' ? 'bad' : h.quality === 'good' ? 'good' : ''}${isNow(h) ? ' active' : ''}"><time>${esc(h.start)} – ${esc(h.end)}</time><div><strong>${esc(d(h.lord))}</strong><small>${esc(d(h.use))}</small></div></div>`).join('');
    loadDaily();
    loadHoroscope();
  } catch (e) { showError($('#nowCard'), e); }
}

// ---------- free daily horoscope ----------
const RASHIS = [['Mesha', 'Aries'], ['Vrishabha', 'Taurus'], ['Mithuna', 'Gemini'], ['Karka', 'Cancer'], ['Simha', 'Leo'], ['Kanya', 'Virgo'],
  ['Tula', 'Libra'], ['Vrishchika', 'Scorpio'], ['Dhanu', 'Sagittarius'], ['Makara', 'Capricorn'], ['Kumbha', 'Aquarius'], ['Meena', 'Pisces']];
function horoSign() {
  const fromProfile = current()?.natal?.moonSign;
  const saved = local.get('horoSign');
  return Number.isInteger(fromProfile) ? fromProfile : Number.isInteger(saved) ? saved : 0;
}
async function loadHoroscope() {
  const sel = $('#horoSign');
  if (!sel.options.length) {
    sel.innerHTML = RASHIS.map(([sa, en], i) => `<option value="${i}">${esc(lang === 'en' ? `${sa} (${en})` : d(sa))}</option>`).join('');
    sel.addEventListener('change', () => { local.set('horoSign', +sel.value); loadHoroscope(); });
    $('#findRashi').addEventListener('click', () => switchTab('chart'));
  }
  if (document.activeElement !== sel) sel.value = String(horoSign());
  const sign = +sel.value;
  const out = $('#horoOut');
  try {
    const h = await api(`/api/horoscope?${qs({ sign, lang })}`);
    const bar = (label, n) => `<div class="score-row"><span>${esc(t(label))}</span><span class="meter-bar" aria-label="${esc(t('{n} out of 5', { n }))}"><i style="width:${n * 20}%"></i></span><b>${n}/5</b></div>`;
    out.innerHTML = `
      <p class="sub muted">${esc(fmtDate(h.date + 'T12:00:00', { weekday: 'long', day: 'numeric', month: 'long' }))} · ${esc(t('Moon in {sign}, house {n} from your sign', { sign: d(h.moonTransit.sign), n: h.moonTransit.house }))}</p>
      <div class="prose">${esc(h.text)}</div>
      <div class="scores">${bar(N('Love'), h.scores.love)}${bar(N('Career'), h.scores.career)}${bar(N('Money'), h.scores.money)}${bar(N('Energy'), h.scores.energy)}</div>
      <p class="hint">${esc(t('Lucky colour'))}: <strong>${esc(h.lucky.colour.map(d).join(` ${t('or')} `))}</strong> · ${esc(t('Lucky number'))}: <strong>${h.lucky.number}</strong></p>`;
  } catch (e) { out.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}
const item = (x, cls) => `<div class="item ${cls}${isNow(x) ? ' active' : ''}"><time>${esc(x.start)} – ${esc(x.end)}</time><div><strong>${esc(d(x.name))}</strong><small>${esc(d(x.note || ''))}</small></div></div>`;
function isNow(x) {
  const n = new Intl.DateTimeFormat('en-GB', { timeZone: state.place.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  return x.start <= x.end ? n >= x.start && n < x.end : n >= x.start || n < x.end;
}
function renderNow(tm, prof) {
  const c = tm.current || {};
  const slot = [...tm.choghadiya.day, ...tm.choghadiya.night].find((s) => s.name === c.choghadiya && isNow(s));
  const bad = c.inBadPeriod?.length ? `<div><span class="pill q-bad">${esc(t('Now: {periods}', { periods: c.inBadPeriod.map(d).join(', ') }))}</span></div>` : '';
  let personal;
  if (tm.personal) personal = `<div class="sub">${esc(t('{name} day', { name: prof?.name || t('Your') }))}: <strong>${esc(d(tm.personal.dayRating))}</strong> · ${esc(t('Tara'))} ${esc(d(tm.personal.tarabalam.tara))} (${esc(d(tm.personal.tarabalam.quality))}) · ${esc(t('Moon in house {n} from your Moon sign', { n: tm.personal.chandrabalam.house }))}</div>
    <details class="explain"><summary>${esc(t(TIMES.personal.title))}</summary><div>${esc(t(TIMES.personal.body))}</div></details>`;
  else if (tm.personalLocked) personal = `<button class="linkish" id="unlockDay">${esc(t('See your personal day rating and best times ›'))}</button>`;
  else personal = `<button class="linkish" id="addBirth">${esc(t('Add your birth details for a personal day rating ›'))}</button>`;
  $('#nowCard').innerHTML = `
    <div class="sub">${esc(d(tm.weekday))} · ${esc(t('Sunrise'))} ${esc(tm.sunrise)} · ${esc(t('Sunset'))} ${esc(tm.sunset)} · ${esc(d(state.place.name))}</div>
    <div class="big">${slot ? `${esc(t('{name} choghadiya', { name: d(slot.name) }))} ${pill(slot.quality, slot.quality)}` : esc(t('Today'))}</div>
    ${slot ? `<div class="sub">${esc(slot.start)} – ${esc(slot.end)} · ${esc(d(slot.use))}${c.hora ? ` · ${esc(t('{planets} hora', { planets: d(c.hora) }))}` : ''}</div>` : ''}
    ${bad}${personal}
    ${tm.thaiColour ? `<div class="sub">${esc(t('Colour of the day'))}: ${esc(tm.thaiColour.wear.map(d).join(` ${t('or')} `))}</div>` : ''}`;
  $('#unlockDay')?.addEventListener('click', () => openPlans(t('Your personal day rating, best times and daily guidance are part of Premium.')));
  $('#addBirth')?.addEventListener('click', () => switchTab('chart'));
}
function renderChoghadiya() {
  const tm = state.timings; if (!tm) return;
  $('#choghadiya').innerHTML = tm.choghadiya[state.cgPart].map((s) => `<div class="slot q-${esc(s.quality)}${isNow(s) ? ' active' : ''}"><time>${esc(s.start)} – ${esc(s.end)}</time><span><strong>${esc(d(s.name))}</strong><small>${esc(d(s.use))}</small></span>${pill(s.quality, s.quality)}</div>`).join('');
}
async function loadDaily() {
  const prof = current(); const el = $('#dailyCard');
  if (!prof || !isPaid()) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card muted">${esc(t("Writing today's guidance…"))}</div>`;
  try {
    const g = await api(`/api/daily/${prof.id}?${qs({ ...loc(), language: $('#lang').value })}`);
    el.innerHTML = `<div class="card daily"><h2>${esc(t('Today for {name}', { name: prof.name }))}</h2><div class="prose">${esc(g.text)}</div></div>`;
  } catch (e) { el.innerHTML = e.code === 'limit' ? '' : `<div class="card q-bad">${esc(e.message)}</div>`; }
}

// ---------- panchang + calendar ----------
async function loadPanchang() {
  try {
    const p = await api(`/api/panchang?${qs({ ...loc(), date: $('#panchDate').value })}`);
    const ends = (x) => (x.endsAt ? (x.endsAt.slice(0, 10) !== p.date ? t('until {time} tomorrow', { time: x.endsAt.slice(11) }) : t('until {time}', { time: x.endsAt.slice(11) })) : '');
    const ti = p.tithi[0];
    const tn = ((ti.index - 1) % 15) + 1;
    const tg = PANCHANG.tithiGroup(tn);
    const tithiMeans = PANCHANG.special[ti.name] ? t(PANCHANG.special[ti.name]) : tg ? t('{group} tithi. {meaning}', { group: d(tg[0]), meaning: t(tg[1]) }) : '';
    const y = p.yoga[0];
    const k = p.karana[0];
    const cells = [
      [N('Tithi'), `${d(p.paksha)} ${d(ti.name)}`, ends(ti), `${tithiMeans} ${PANCHANG.paksha[p.paksha] ? t(PANCHANG.paksha[p.paksha]) : ''}`],
      [N('Nakshatra'), d(p.nakshatra[0].name), `${ends(p.nakshatra[0])} · ${t('ruled by {planet}', { planet: d(p.nakshatra[0].lord) })}`, nakshatraNature(p.nakshatra[0].name)],
      [N('Yoga'), d(y.name), ends(y), y.auspicious ? t('An auspicious yoga: fine for new beginnings.') : t('Traditionally avoided for new beginnings while it lasts.')],
      [N('Karana'), d(k.name), ends(k), PANCHANG.karana[k.name] ? t(PANCHANG.karana[k.name]) : t('A normal karana: no special restriction.')],
      [N('Vara'), lang === 'en' ? `${p.vara.en} (${p.vara.sa})` : d(p.vara.en), t('Ruled by {planet}', { planet: d(p.vara.lord) }), t(PANCHANG.vara[p.vara.en])],
      [N('Month'), month(p.masa.amanta), `${t('Purnimanta')}: ${month(p.masa.purnimanta)}`, p.masa.adhika ? t('This is an extra (Adhika) month: avoided for weddings and housewarming.') : ''],
      [N('Sunrise / Sunset'), `${p.sunrise} / ${p.sunset}`, d(state.place.name), ''],
      [N('Moonrise / Moonset'), `${p.moonrise ?? '-'} / ${p.moonset ?? '-'}`, '', ''],
      [N('Moon sign'), d(p.moonSign), t('Sun in {sign}', { sign: d(p.sunSign) }), SIGN_TRAIT[p.moonSign] ? t('Moon in {sign}: the mood of the day leans {mood}', { sign: d(p.moonSign), mood: t(SIGN_TRAIT[p.moonSign]).split(/:\s*/).slice(1).join(': ') || t(SIGN_TRAIT[p.moonSign]) }) : ''],
      [N('Ritu / Ayana'), `${d(p.ritu)} · ${d(p.ayana)}`, '', ''],
      [N('Vikram Samvat'), String(p.samvat.vikram), `${t('Shaka')} ${p.samvat.shaka}`, ''],
      [N('Festivals'), p.festivals.map(d).join(', ') || t('None today'), '', ''],
    ];
    $('#panchang').innerHTML = cells.map(([b, val, sub, means]) => `<div class="cell">
      <b>${esc(t(b))}</b><span class="val">${esc(val)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}
      ${means ? `<p class="means">${esc(means)}</p>` : ''}
      ${PANCHANG.terms[b] ? `<details><summary>${esc(t('What does this mean?'))}</summary><p>${esc(t(PANCHANG.terms[b]))}</p></details>` : ''}
    </div>`).join('');
  } catch (e) { showError($('#panchang'), e); }
}
async function loadCalendar() {
  const month = $('#panchDate').value.slice(0, 7);
  $('#calendar').innerHTML = `<div class="muted">${esc(t('Scoring the month…'))}</div>`;
  try {
    const c = await api(`/api/calendar?${qs({ ...loc(), month, activity: $('#calActivity').value, profile: current()?.id })}`);
    $('#calNote').innerHTML = c.personalLocked ? `<button class="linkish" id="calUnlock">${esc(t('Personalise this calendar to your chart with Premium ›'))}</button>`
      : c.days[0]?.personal ? `<p class="hint">${esc(t('Personalised for {name}.', { name: current()?.name }))}</p>` : '';
    $('#calUnlock')?.addEventListener('click', () => openPlans(t('Personal good-day calendars are part of Premium.')));
    const first = new Date(`${month}-01T12:00:00Z`).getUTCDay();
    // Weekday initials in the page language (1 Jan 2023 was a Sunday).
    const head = [...Array(7)].map((_, i) => `<div class="dow">${esc(fmtDate(Date.UTC(2023, 0, 1 + i, 12), { weekday: 'narrow', timeZone: 'UTC' }))}</div>`).join('');
    const label = { excellent: t('Best'), good: t('Good'), average: t('OK'), avoid: t('Avoid') };
    $('#calendar').innerHTML = head + '<div></div>'.repeat(first) + c.days.map((x) => `<button class="day ${x.rating}" title="${esc(`${d(x.tithi)}, ${d(x.nakshatra)}. ${x.reasons.map(d).join('; ')}`)}" data-date="${x.date}"><b>${+x.date.slice(8)}</b>${esc(label[x.rating])}</button>`).join('');
    $$('#calendar .day').forEach((b) => b.addEventListener('click', () => { $('#panchDate').value = b.dataset.date; loadPanchang(); window.scrollTo(0, 0); }));
  } catch (e) { showError($('#calendar'), e); }
}

// ---------- profiles + kundli ----------
function renderProfiles() {
  const el = $('#profilesCard');
  if (!state.me.user) {
    el.innerHTML = `<div class="card upsell"><strong>${esc(t('Sign in to save profiles'))}</strong><p class="hint">${esc(t('Keep charts for your family and get readings for each person.'))}</p><button class="primary" id="profSignin">${esc(t('Sign in'))}</button></div>`;
    $('#profSignin').addEventListener('click', () => openSignin());
    if (state.guestBirth) fillBirth(state.guestBirth);
    return;
  }
  const max = state.me.plan.profiles;
  el.innerHTML = `<div class="card"><div class="row-head"><h2>${esc(t('Family profiles'))}</h2><span class="hint">${esc(t('{n} of {max}', { n: profiles().filter((p) => !p.locked).length, max }))}</span></div>
    ${profiles().map((p) => `<div class="profile${p.id === current()?.id ? ' sel' : ''}${p.locked ? ' locked' : ''}">
      <button class="pname" data-pick="${p.id}" ${p.locked ? 'disabled' : ''}><strong>${esc(p.name)}</strong><small>${esc(d(p.natal?.rashi || ''))} · ${esc(d(p.natal?.nakshatra || ''))}${p.locked ? ` · ${esc(t('needs a bigger plan'))}` : ''}</small></button>
      <button class="ghost small" data-del="${p.id}" aria-label="${esc(t('Delete {name}', { name: p.name }))}">${esc(t('Delete'))}</button></div>`).join('') || `<p class="hint">${esc(t('No profiles yet. Add your birth details below.'))}</p>`}
    ${profiles().length >= max ? `<button class="linkish" id="moreProfiles">${esc(t('Need more profiles? Couple covers 2, Family covers 4 ›'))}</button>` : ''}</div>`;
  $$('[data-pick]').forEach((b) => b.addEventListener('click', () => selectProfile(b.dataset.pick)));
  $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(t('Delete this profile and its scans and readings?'))) return;
    await api(`/api/profiles/${b.dataset.del}`, { method: 'DELETE' }); await refreshMe(); loadToday(); $('#chart').innerHTML = '';
  }));
  $('#moreProfiles')?.addEventListener('click', () => openPlans());
  // With a saved profile, the chart comes first and the form folds behind a button.
  const full = profiles().length >= max;
  $('#birthForm').hidden = full || profiles().length > 0;
  $('#addMemberBtn').hidden = full || profiles().length === 0;
  $('#birthTitle').textContent = profiles().length ? t('Add a family member') : t('Add your birth details');
}
function fillBirth(b) {
  const f = $('#birthForm'); f.name.value = b.name || ''; f.date.value = b.date; f.time.value = b.time;
  const i = state.meta.cities.findIndex((c) => c.name === b.city); if (i >= 0) f.city.value = i;
}
function birthFrom(dateV, timeV, cityIdx) {
  const c = state.meta.cities[+cityIdx];
  return { date: dateV, time: timeV, lat: c.lat, lon: c.lon, tz: c.tz, city: c.name };
}
async function onBirth(e) {
  e.preventDefault();
  const f = e.target;
  const birth = birthFrom(f.date.value, f.time.value, f.city.value);
  try {
    if (state.me.user) {
      const p = await post('/api/profiles', { name: f.name.value.trim(), relation: f.relation.value, birth });
      state.profileId = p.id; local.set('profileId', p.id); f.reset();
      await refreshMe(); loadToday(); await showChart();
      $('#chart').scrollIntoView({ behavior: 'smooth' });
    } else {
      state.guestBirth = { ...birth, name: f.name.value.trim() }; local.set('birth', state.guestBirth);
      const data = await post('/api/profile', { birth });
      renderChart(data, state.guestBirth.name);
      state.guestNatal = { nakshatra: data.vedic.birthNakshatra };
      $('#chart').insertAdjacentHTML('afterbegin', `<div class="card upsell">${esc(t('Sign in to save this chart and unlock readings.'))} <button class="linkish" id="saveSignin">${esc(t('Sign in'))} ›</button></div>`);
      $('#saveSignin').addEventListener('click', () => openSignin());
    }
  } catch (err) { if (err.status !== 402) showError($('#chart'), err); }
}
async function showChart() {
  const prof = current(); if (!prof) return;
  $('#chart').innerHTML = `<p class="muted">${esc(t('Calculating…'))}</p>`;
  try { renderChart(await api(`/api/profiles/${prof.id}/chart`), prof.name); } catch (e) { showError($('#chart'), e); }
}
function renderChart(p, name) {
  const v = p.vedic; const cur = v.dasha.current;
  const term = (k) => `<details><summary>${esc(t('What is this?'))}</summary><p>${esc(t(KUNDLI_TERMS[k]))}</p></details>`;
  const cell = (label, val, sub, means, k) => `<div class="cell"><b>${esc(t(label))}</b><span class="val">${esc(val)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}${means ? `<p class="means">${esc(means)}</p>` : ''}${k ? term(k) : ''}</div>`;
  const tr = (x) => (x ? t(x) : '');
  const dm = p.chinese.dayMaster.split(' ')[0];
  const housesHtml = v.houses.map((h) => `<tr><td><strong>${h.house}</strong></td><td>${esc(d(h.sign))}</td><td>${esc(h.planets.map(d).join(', ') || '-')}</td><td>${esc(tr(HOUSE[h.house]))}</td></tr>`).join('');
  const sadeSati = v.sadeSati.active ? d(v.sadeSati.phase) : t('Not active');
  $('#chart').innerHTML = `
    <section class="block">
      <h2>${esc(name ? t('{name}: kundli at a glance', { name }) : t('Your kundli at a glance'))}</h2>
      <div class="grid">
        ${cell(N('Lagna (ascendant)'), d(v.lagna.signName), `${v.lagna.degree} · ${d(v.lagna.nakshatra)}`, `${t('Your outer personality')}: ${tr(SIGN_TRAIT[v.lagna.signName])}`, 'Lagna')}
        ${cell(N('Moon sign (Rashi)'), d(v.moonSign), '', `${t('Your inner nature')}: ${tr(SIGN_TRAIT[v.moonSign])}`, 'Rashi')}
        ${cell(N('Birth nakshatra'), d(v.birthNakshatra), t('Ruled by {planet}', { planet: d(DASHA_LORD[v.birthNakshatra] || '') }), nakshatraNature(v.birthNakshatra), 'Nakshatra')}
        ${cell(N('Current dasha'), `${d(cur?.mahadasha)} / ${d(cur?.antardasha)}`, t('Sub-period until {date}', { date: cur?.antarEnds?.slice(0, 10) }), `${tr(DASHA[cur?.mahadasha])} ${t('The {planet} sub-period adds: {themes}', { planet: d(cur?.antardasha), themes: tr(DASHA[cur?.antardasha]) })}`, 'Dasha')}
        ${cell(N('Sade Sati'), sadeSati, v.sadeSati.dhaiya ? d(v.sadeSati.dhaiya) : t('Saturn is in {sign}', { sign: d(v.sadeSati.saturnSign) }), v.sadeSati.active ? t('A 7.5-year Saturn phase: steady effort and patience pay off.') : v.sadeSati.dhaiya ? t('A shorter Saturn period: keep commitments realistic.') : t('No Saturn pressure on your Moon sign right now.'), 'Sade Sati')}
        ${cell(N('Manglik'), d(v.manglik.status), '', v.manglik.status === 'Not Manglik' ? t('Mars is not in a Manglik house.') : t('Mars is in a Manglik house from at least one reference point. Exceptions often cancel it; confirm with an astrologer before marriage decisions.'), 'Manglik')}
      </div>
    </section>

    <section class="card">
      <h2>${esc(t('Planets and what they mean for you'))}</h2>
      <p class="hint">${esc(t('Each planet represents certain themes. The house it sits in shows the area of life where those themes play out. (R) means retrograde.'))}</p>
      <table class="stack"><thead><tr><th>${esc(t('Planet'))}</th><th>${esc(t('Sign'))}</th><th>${esc(t('House'))}</th><th>${esc(t('Nakshatra'))}</th></tr></thead><tbody>
      ${v.planets.map((x) => `<tr><td class="lead"><strong>${esc(d(x.planet))}${x.retrograde && !['Rahu', 'Ketu'].includes(x.planet) ? ' (R)' : ''}</strong><small>${esc(tr(PLANET[x.planet]))}</small></td><td data-label="${esc(t('Sign'))}">${esc(d(x.signName))}<small>${esc(x.degree)}</small></td><td data-label="${esc(t('House'))}">${esc(x.house)}<small>${esc(tr(HOUSE[x.house]))}</small></td><td data-label="${esc(t('Nakshatra'))}">${esc(d(x.nakshatra))}<small>${esc(t('Pada {n}', { n: x.pada }))}</small></td></tr>`).join('')}
      </tbody></table>
    </section>

    <details class="card fold"><summary><h2>${esc(t('The 12 houses'))}</h2></summary>
      <p class="hint">${esc(t(KUNDLI_TERMS.Houses))}</p>
      <div class="table-wrap"><table><thead><tr><th>${esc(t('House'))}</th><th>${esc(t('Sign'))}</th><th>${esc(t('Planets'))}</th><th>${esc(t('Area of life'))}</th></tr></thead><tbody>${housesHtml}</tbody></table></div>
    </details>

    <section class="card">
      <h2>${esc(t('Vimshottari dasha timeline'))}</h2>
      <p class="hint">${esc(t(KUNDLI_TERMS.Dasha))}</p>
      <div class="table-wrap"><table><thead><tr><th>${esc(t('Period'))}</th><th>${esc(t('From'))}</th><th>${esc(t('To'))}</th></tr></thead><tbody>
      ${v.dasha.periods.map((x) => `<tr${cur?.mahadasha === x.lord ? ' class="q-best"' : ''}><td><strong>${esc(d(x.lord))}${cur?.mahadasha === x.lord ? ` (${esc(t('now'))})` : ''}</strong><small>${esc(tr(DASHA[x.lord]))}</small></td><td>${esc(x.start)}</td><td>${esc(x.end)}</td></tr>`).join('')}
      </tbody></table></div>
    </section>

    <section class="block">
      <h2>${esc(t('Other traditions'))}</h2>
      <div class="grid">
        ${cell(N('Western sun sign'), d(p.western.sunSign), t('Tropical zodiac'), t('Used in Western astrology and most horoscope columns. It often differs from your Indian sign by one sign.'))}
        ${cell(N('Chinese zodiac'), d(p.chinese.zodiac.chinese), `${t('Vietnamese')}: ${d(p.chinese.zodiac.vietnamese)}`, tr(CHINESE_ANIMAL[p.chinese.zodiac.chinese]))}
        ${cell(N('BaZi day master'), d(p.chinese.dayMaster), Object.values(p.chinese.pillars).map((x) => x.stem.zh + x.branch.zh).join(' '), `${t('Your core element is {element}, the element of {meaning}.', { element: d(dm), meaning: tr(ELEMENT[dm]) })} ${p.chinese.missingElements.length ? t('Missing: {list}; these are qualities to develop consciously.', { list: p.chinese.missingElements.map(d).join(', ') }) : t('All five elements are present.')}`, 'BaZi')}
        ${cell(N('Thai birth colour'), d(p.thai.colour), t('Born on a {day}', { day: d(p.thai.day) }), `${t('Lucky colours')}: ${p.thai.lucky.map(d).join(', ')}. ${t('Traditionally avoid {colour}.', { colour: d(p.thai.avoid) })}`, 'Thai birth colour')}
        ${cell(N('Life path number'), String(p.numerology.lifePath), p.numerology.chaldeanNameNumber ? t('Name number {n}', { n: p.numerology.chaldeanNameNumber.single }) : '', tr(LIFE_PATH[p.numerology.lifePath]), 'Life path')}
      </div>
    </section>`;
}
// Nakshatra rulers (Vimshottari), for the "ruled by" line.
const DASHA_LORD = {
  Ashwini: 'Ketu', Bharani: 'Venus', Krittika: 'Sun', Rohini: 'Moon', Mrigashira: 'Mars', Ardra: 'Rahu', Punarvasu: 'Jupiter', Pushya: 'Saturn', Ashlesha: 'Mercury',
  Magha: 'Ketu', 'Purva Phalguni': 'Venus', 'Uttara Phalguni': 'Sun', Hasta: 'Moon', Chitra: 'Mars', Swati: 'Rahu', Vishakha: 'Jupiter', Anuradha: 'Saturn', Jyeshtha: 'Mercury',
  Mula: 'Ketu', 'Purva Ashadha': 'Venus', 'Uttara Ashadha': 'Sun', Shravana: 'Moon', Dhanishta: 'Mars', Shatabhisha: 'Rahu', 'Purva Bhadrapada': 'Jupiter', 'Uttara Bhadrapada': 'Saturn', Revati: 'Mercury',
};

// ---------- on-device vision (MediaPipe) ----------
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0';
let visionP = null;
function vision() {
  visionP ||= import(`${MP}/vision_bundle.mjs`).then(async (m) => ({ m, files: await m.FilesetResolver.forVisionTasks(`${MP}/wasm`) }));
  return visionP;
}
async function landmarker(kind) {
  const { m, files } = await vision();
  const base = { delegate: 'GPU' };
  if (kind === 'hand') return m.HandLandmarker.createFromOptions(files, { runningMode: 'IMAGE', numHands: 1, baseOptions: { ...base, modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' } });
  return m.FaceLandmarker.createFromOptions(files, { runningMode: 'IMAGE', numFaces: 1, baseOptions: { ...base, modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' } });
}
async function loadImage(file, canvas, maxSide = 1280) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  canvas.width = Math.round(img.width * s); canvas.height = Math.round(img.height * s);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  canvas.hidden = false;
  return canvas;
}
function dots(canvas, pts, color) {
  const g = canvas.getContext('2d'); g.fillStyle = color;
  for (const p of pts) { g.beginPath(); g.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, 7); g.fill(); }
}
// Results grouped by area, e.g. Hand shape / Fingers / Major lines / Mounts.
function factsHtml(facts, notVisible = []) {
  const groups = new Map();
  for (const f of facts) {
    const g = d(f.group || 'Other');
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(f);
  }
  let html = [...groups].map(([g, list]) => `<div class="result-group"><h3>${esc(g)}</h3>${list.map((f) => `
    <div class="result"><div class="what">${esc(d(f.source))}</div><div class="fact">${esc(d(f.fact))}</div><div class="meaning">${esc(d(f.meaning))}</div></div>`).join('')}</div>`).join('');
  if (notVisible.length) html += `<p class="hint">${esc(t('Not visible in this photo, so not read: {list}. A clearer photo in daylight can add them.', { list: notVisible.map(d).join(', ') }))}</p>`;
  return html;
}

async function onPalm(e) {
  const file = e.target.files[0]; if (!file) return;
  const out = $('#palmOut');
  if (!state.me.user) { openSignin(t('Sign in to read your palm lines. Your first scan is free.')); e.target.value = ''; return; }
  if (!current()) { out.innerHTML = `<div class="card upsell">${esc(t('Add your birth details in Kundli first, so the scan is saved to your profile.'))}</div>`; return; }
  out.innerHTML = `<p class="muted">${esc(t('Finding your hand…'))}</p>`;
  const canvas = await loadImage(file, $('#palmCanvas'));
  let lms = null;
  try { lms = (await landmarker('hand')).detect(canvas).landmarks?.[0] || null; if (lms) dots(canvas, lms, '#f08a3e'); } catch { /* on-device model unavailable */ }
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const fd = new FormData(); fd.append('photo', blob, 'palm.jpg'); fd.append('profileId', current().id);
  if (lms) fd.append('landmarks', JSON.stringify(lms.map(({ x, y }) => ({ x, y }))));
  out.innerHTML = `<p class="muted">${esc(t('Reading your lines…'))}</p>`;
  try {
    const r = await post('/api/palm', fd);
    if (r.lines?.warning) { out.innerHTML = `<p class="q-bad">${esc(d(r.lines.warning))} ${esc(t('Retake with your open palm filling the frame.'))}</p>`; return; }
    state.palm = r.palm;
    out.innerHTML = `${r.lines?.photoQuality === 'poor' ? `<p class="q-neutral">${esc(t('Photo is dark or blurry, so some lines were skipped. Retake in daylight for a fuller reading.'))}</p>` : ''}
      <h2>${esc(r.palm.handType ? t('Your palm: {type} hand', { type: d(r.palm.handType) }) : t('Your palm'))}</h2>${factsHtml(r.palm.facts, r.palm.notVisible)}<p class="hint">${esc(t('Saved to {name}. Photo deleted after reading. Your combined reading in the Reading tab now includes your palm.', { name: current().name }))}</p>`;
    await refreshMe();
  } catch (err) { showError(out, err); }
}

async function onFace(e) {
  const file = e.target.files[0]; if (!file || !$('#faceConsent').checked) return;
  const out = $('#faceOut'); out.innerHTML = `<p class="muted">${esc(t('Measuring proportions on your device…'))}</p>`;
  const canvas = await loadImage(file, $('#faceCanvas'), 960);
  try {
    const lms = (await landmarker('face')).detect(canvas).faceLandmarks?.[0];
    if (!lms) { out.innerHTML = `<p class="q-bad">${esc(t('No face found. Face the camera straight on in even light.'))}</p>`; return; }
    dots(canvas, lms.filter((_, i) => i % 6 === 0), '#6fe0d4');
    const r = await post('/api/face', { consent: true, profileId: current()?.id, landmarks: lms.map(({ x, y }) => ({ x, y })) });
    state.face = { faceType: r.faceType, facts: r.facts };
    out.innerHTML = `<h2>${esc(t('Your face: {type} type', { type: d(r.faceType) }))}</h2>${factsHtml(r.facts)}<p class="hint">${esc(t('Only measurements were sent. Your photo never left this device.'))}</p>`;
    if (state.me.user) await refreshMe();
  } catch (err) { showError(out, err); }
}

// ---------- reading + chat ----------
function updateSources() {
  const p = current();
  const s = [[N('Birth chart'), !!p], [N('Palm'), !!(p?.hasPalm || state.palm)], [N('Face'), !!(p?.hasFace || state.face)]];
  $('#sources').innerHTML = s.map(([n, ok]) => `<span class="chip${ok ? ' ok' : ''}">${ok ? '✓' : '+'} ${esc(t(n))}</span>`).join('');
}
async function loadSavedReading() {
  const p = current(); if (!p?.hasReading) return;
  try {
    const r = await api(`/api/reading/${p.id}`);
    if (r?.text) { $('#reading').hidden = false; $('#reading').textContent = r.text; $('#chatCard').hidden = false; $('#shareBtn').hidden = false; chatAllowance(); }
  } catch { /* ignore */ }
}
function chatAllowance() {
  const a = state.me.allowance?.chat; $('#chatLeft').textContent = a ? t('{n} questions left this month', { n: Math.max(0, a.max - a.used) }) : '';
}
async function onReading(refresh = false) {
  if (!state.me.user) { openSignin(t('Sign in for your combined reading. Your first one is free.')); return; }
  if (!current()) { switchTab('chart'); return; }
  const el = $('#reading'); el.hidden = false; el.textContent = t('Writing your reading…');
  try {
    const r = await post('/api/reading', { profileId: current().id, language: $('#lang').value, location: loc(), refresh: refresh === true });
    el.textContent = r.text; state.facts = r.facts; state.history = [];
    if (r.cached) {
      // Saved reading: shown free. Rewriting it uses one reading from the monthly allowance.
      const when = fmtDate(r.at, { day: 'numeric', month: 'short' });
      el.insertAdjacentHTML('afterbegin', `<p class="hint">${esc(t('Your saved reading from {date}.', { date: when }))} <button class="linkish" id="rewrite">${esc(t('Write a fresh one'))}</button></p>`);
      $('#rewrite').addEventListener('click', () => { if (confirm(t("A fresh reading uses one from this month's allowance. Continue?"))) onReading(true); });
    }
    if (r.kind === 'teaser') {
      el.insertAdjacentHTML('beforeend', `<p><button class="primary" id="fullUp">${esc(t('Unlock the full reading: love, career, current phase'))}</button></p>`);
      $('#fullUp').addEventListener('click', () => openPlans(t('The full palm + face + chart reading is part of Premium.')));
    }
    $('#chatCard').hidden = false; $('#shareBtn').hidden = false; $('#chatLog').innerHTML = '';
    await refreshMe(); chatAllowance();
  } catch (e) { el.textContent = e.message; }
}
async function onAsk(e) {
  e.preventDefault();
  const q = $('#chatQ').value.trim(); if (!q || !current()) return;
  $('#chatQ').value = '';
  $('#chatLog').insertAdjacentHTML('beforeend', `<div class="msg me">${esc(q)}</div>`);
  try {
    const r = await post('/api/ask', { question: q, profileId: current().id, history: state.history, language: $('#lang').value });
    state.history.push({ role: 'user', content: q }, { role: 'assistant', content: r.answer });
    $('#chatLog').insertAdjacentHTML('beforeend', `<div class="msg ai">${esc(r.answer)}</div>`);
    await refreshMe(); chatAllowance();
  } catch (err) { $('#chatLog').insertAdjacentHTML('beforeend', `<div class="msg ai">${esc(err.message)}</div>`); }
}

// Shareable 1080x1350 card for Instagram and WhatsApp status.
async function shareCard() {
  const p = current(); if (!p) return;
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 1350); grad.addColorStop(0, '#2b1840'); grad.addColorStop(1, '#6b2d3c');
  g.fillStyle = grad; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = '#f0b27a'; g.font = '700 64px Fraunces, serif'; g.fillText(t("{name}'s Rekha reading", { name: p.name }), 80, 160);
  g.fillStyle = '#ffffff'; g.font = '500 40px Inter, sans-serif';
  const lines = [p.natal && `${t('Moon sign')}: ${d(p.natal.rashi)}`, p.natal && `${t('Nakshatra')}: ${d(p.natal.nakshatra)}`, p.natal && `${t('Ascendant')}: ${d(p.natal.lagna)}`,
    state.palm?.handType && t('{type} hand', { type: d(state.palm.handType) }), state.face?.faceType && t('{type} face type', { type: d(state.face.faceType) })].filter(Boolean);
  lines.forEach((t, i) => g.fillText(t, 80, 300 + i * 80));
  g.fillStyle = '#f0b27a'; g.font = '500 34px Inter, sans-serif'; g.fillText(t('Get yours free at {site}', { site: location.host }), 80, 1250);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'rekha-reading.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file], title: t('My Rekha reading') }).catch(() => {});
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); }
}

// ---------- matching ----------
function renderMatchPickers() {
  const list = profiles().filter((p) => !p.locked);
  const use = list.length >= 2;
  $('#matchPick').hidden = !use; $('#matchManual').hidden = use;
  if (use) {
    const opts = list.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    $('#matchA').innerHTML = opts; $('#matchB').innerHTML = opts; $('#matchB').selectedIndex = 1;
  }
}
async function onMatch(e) {
  e.preventDefault();
  const f = e.target; const out = $('#matchOut');
  let boy, girl;
  if (!$('#matchPick').hidden) {
    boy = profiles().find((p) => p.id === $('#matchA').value).birth; girl = profiles().find((p) => p.id === $('#matchB').value).birth;
  } else {
    if (!f.bDate.value || !f.gDate.value) { out.innerHTML = `<div class="card q-bad">${esc(t('Enter both birth dates.'))}</div>`; return; }
    boy = birthFrom(f.bDate.value, f.bTime.value || '12:00', f.bCity.value); girl = birthFrom(f.gDate.value, f.gTime.value || '12:00', f.gCity.value);
  }
  out.innerHTML = `<p class="muted">${esc(t('Matching…'))}</p>`;
  try {
    const r = await post('/api/match', { boy, girl, narrate: isPaid(), language: $('#lang').value });
    const g = r.gunMilan;
    out.innerHTML = `<div class="card"><div class="score">${esc(g.total)} / 36</div><div>${pill(g.total >= 25 ? 'good' : g.total >= 18 ? 'neutral' : 'bad', g.verdict)}</div>
      <table><thead><tr><th>${esc(t('Koota'))}</th><th>${esc(t('Score'))}</th><th>${esc(t('Area'))}</th></tr></thead><tbody>${g.kootas.map((k) => `<tr><td>${esc(d(k.koota))}</td><td>${esc(k.score)} / ${esc(k.max)}</td><td>${esc(d(k.area))}</td></tr>`).join('')}</tbody></table>
      <p>${esc(t('Manglik'))}: ${esc(d(r.manglik.boy))} / ${esc(d(r.manglik.girl))}. ${esc(g.doshas.length ? t('Doshas: {list}.', { list: g.doshas.map(d).join(', ') }) : t('No major doshas.'))}</p>
      <p class="hint">${esc(d(g.note))}</p></div>
      ${r.reading ? `<article class="card prose">${esc(r.reading)}</article>` : `<div class="card upsell">${esc(t('Want this explained in plain words in your language?'))} <button class="linkish" id="matchUp">${esc(t('Premium'))} ›</button></div>`}`;
    $('#matchUp')?.addEventListener('click', () => openPlans(t('Detailed match explanations are part of Premium.')));
  } catch (err) { showError(out, err); }
}

// ---------- install as an app (PWA) ----------
let deferredPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
function showInstall(kind) {
  if (isStandalone() || local.get('installDismissed') > Date.now()) return;
  $('#installCard').hidden = false;
  $('#installBtn').onclick = async () => {
    if (kind === 'ios') { $('#iosDlg').showModal(); return; }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') $('#installCard').hidden = true;
  };
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; showInstall('prompt'); });
window.addEventListener('appinstalled', () => { $('#installCard').hidden = true; toast(t('Rekha is on your home screen')); });
$('#installLater').addEventListener('click', () => { $('#installCard').hidden = true; local.set('installDismissed', Date.now() + 7 * 86400000); });
if (isIos() && !isStandalone()) showInstall('ios');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
boot().catch((e) => showError($('#nowCard'), e));
