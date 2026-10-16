// Rekha web client. Plain ES modules, no build step.
import {
  TIMES, PANCHANG, nakshatraNature, SIGN_TRAIT, PLANET, HOUSE, DASHA, KUNDLI_TERMS, LIFE_PATH,
  CHINESE_ANIMAL, ELEMENT, PALM_GUIDE, FACE_GUIDE, PALM_SVG, FACE_SVG, SIGN_NOTE, SAMPLE_READING, ALERTS_HELP,
} from './guide.js';
import { t, d, N, month, lang, loadPack, pathFor, fmtDate, locale } from './i18n.js';
import { COUNTRIES } from './countries.js';
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
  // The page starts /api/meta and /api/me before this script loads (see shell.js); reuse them.
  const early = window.__early || {};
  [state.meta] = await Promise.all([early.meta ? early.meta.catch(() => api('/api/meta')) : api('/api/meta'), loadPack()]);
  $('#demoBanner').hidden = !state.meta.demoMode;
  const cityOpts = state.meta.cities.map((c, i) => `<option value="${i}">${esc(d(c.name))}</option>`).join('');
  for (const sel of ['#placeSel', '[name=city]', '[name=bCity]', '[name=gCity]']) { $(sel).innerHTML = cityOpts; citySearch($(sel)); }
  const actOpts = state.meta.activities.map((a) => `<option value="${a}">${esc(actName(a))}</option>`).join('');
  $('#activity').innerHTML = actOpts; $('#calActivity').innerHTML = actOpts;
  // Reading language: the page language unless the user picked another one for readings.
  $('#lang').innerHTML = Object.entries(state.meta.languageNames).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  const readLang = local.get(`readLang.${lang}`);
  $('#lang').value = readLang && state.meta.languageNames[readLang] ? readLang : lang;
  document.cookie = `rk_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
  // First visit: the city the visitor's network or time zone points to (not saved until they confirm or
  // change it), else Mumbai. A note on Today offers the exact location from the phone's GPS.
  if (!state.place) {
    let guess = null;
    try { guess = await (early.geo || api(`/api/geo?${qs({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}`)); } catch { /* offline */ }
    state.place = guess?.lat != null && guess.tz ? { name: guess.name, lat: guess.lat, lon: guess.lon, tz: guess.tz } : state.meta.cities.find((c) => c.name === 'Mumbai');
    state.placeGuess = guess?.source || 'default';
  }
  $('#placeBtn').textContent = d(state.place.name);
  $('#panchDate').value = new Intl.DateTimeFormat('en-CA', { timeZone: state.place.tz }).format(new Date());
  bindUi();
  bindAuth();
  renderGuides();
  applyLayout();
  await refreshMe();
  loadToday();
  finishCheckout();
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
  $('#signNote').innerHTML = `<summary>${esc(t(SIGN_NOTE.title))}</summary><div><p>${esc(t(SIGN_NOTE.body))}</p><a href="${esc(pathFor(lang, '/insights/lagna-vs-rashi-vs-sun-sign'))}">${esc(t('Lagna, rashi and sun sign explained'))}</a></div>`;
  // Sample full reading on the plans screen, so people see what they pay for.
  const sample = SAMPLE_READING.sections.map(([heading, text, basis]) => ({
    heading: t(heading), text: t(text), basis: basis.map(([name, value, house]) => ({ name, value, house })),
  }));
  $('#sampleBody').innerHTML = `<p class="hint">${esc(t(SAMPLE_READING.intro))}</p>${sample.map((x) => sectionHtml(x.heading, x.text, x.basis)).join('')}`;
}

// ---------- readings that show their working ----------
// Each section lists the calculated facts it was written from ("Based on").
const BASIS_NAMES = [N('Day rating'), N('Best window today')]; // names the server adds, registered for translation
void BASIS_NAMES;
const BASIS_GROUPS = { chart: N('Birth chart'), palm: N('Palm'), face: N('Face'), today: N('Today') };
function basisLabel(b) {
  const val = Array.isArray(b.value) ? b.value.map(d).join(' / ') : d(b.value);
  return `${d(b.name)}: ${val}${b.house ? ` · ${t('house {n}', { n: b.house })}` : ''}${b.retro ? ' (R)' : ''}`;
}
const sectionHtml = (heading, text, basis) => `<section class="rsec">${heading ? `<h3>${esc(heading)}</h3>` : ''}<div class="prose">${esc(text)}</div>
  ${basis.length ? `<p class="basis"><span class="basis-k">${esc(t('Based on'))}</span>${basis.map((b) => `<span class="chip">${esc(basisLabel(b))}</span>`).join('')}</p>` : ''}</section>`;
function readingHtml(r) {
  const label = `<p class="ai-label">${esc(t('Written by AI from these calculated facts. Not a human astrologer, and not a certainty.'))} <a href="${esc(pathFor(lang, '/insights/how-rekha-works'))}">${esc(t('How Rekha works'))}</a></p>`;
  if (!r.sections?.length) return `${label}<div class="prose">${esc(r.text)}</div>`;
  const byId = new Map((r.basis || []).map((b) => [b.id, b]));
  const groups = Object.entries(BASIS_GROUPS).map(([g, name]) => [name, (r.basis || []).filter((b) => b.group === g)]).filter(([, l]) => l.length);
  return label + r.sections.map((x) => sectionHtml(x.heading, x.text, (x.basis || []).map((id) => byId.get(id)).filter(Boolean))).join('')
    + (groups.length ? `<details class="explain"><summary>${esc(t('Everything this reading was given'))}</summary><div>${groups.map(([name, list]) => `<p><strong>${esc(t(name))}</strong><br>${list.map((b) => esc(basisLabel(b))).join(' · ')}</p>`).join('')}</div></details>` : '');
}

async function refreshMe() {
  const early = window.__early?.me; if (window.__early) window.__early.me = null;
  state.me = early ? await early.catch(() => api('/api/me')) : await api('/api/me');
  if (!state.me || typeof state.me !== 'object') state.me = await api('/api/me');
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
  // Tap outside a sheet (on the dimmed backdrop) to close it.
  $$('dialog.sheet').forEach((dlg) => dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }));
  $('#signinDlg').addEventListener('close', () => { state.pendingPlan = null; });
  $('#placeBtn').addEventListener('click', () => $('#placeDlg').showModal());
  $('#placeDlg').addEventListener('close', () => { if ($('#placeDlg').returnValue === 'ok') setPlace(placeOf($('#placeSel').value)); });
  $('#gpsBtn').addEventListener('click', () => { useGps(); $('#placeDlg').close(); });
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
  $('#palmCamBtn').addEventListener('click', openCamera);
  $('#camDlg').addEventListener('close', stopCamera);
  $('#camManual').addEventListener('click', () => { cam.manual = true; camStatus(t('Hold still…')); startCountdown(); });
  $('#camFile').addEventListener('change', (e) => { $('#camDlg').close(); onPalm(e); });
  $('#customiseBtn').addEventListener('click', openCustomise);
  $('#todayReset').addEventListener('click', () => { local.set('todayLayout', null); applyLayout(); renderCustomise(); });
  $$('#plansInterval [data-iv]').forEach((b) => b.addEventListener('click', () => { state.interval = b.dataset.iv; openPlans(state.plansWhy, $('#plansList input:checked')?.value); }));
  bindAlerts();
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
    const pending = state.pendingPlan; $('#signinDlg').close(); await afterSignin(pending);
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

// Exact location from the phone, named after the nearest city (the time zone comes from the city when known).
function useGps() {
  if (!navigator.geolocation) { alert(t('Location permission was not granted.')); return; }
  navigator.geolocation.getCurrentPosition(async (p) => {
    const lat = +p.coords.latitude.toFixed(4), lon = +p.coords.longitude.toFixed(4);
    let near = null;
    try { near = await api(`/api/geo?${qs({ lat, lon })}`); } catch { /* offline: keep the coordinates */ }
    setPlace({ name: near?.name || t('My location'), lat, lon, tz: near?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone });
  }, () => alert(t('Location permission was not granted.')), { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 });
}
function setPlace(p) {
  state.placeGuess = null;
  state.place = p; local.set('place', p); $('#placeBtn').textContent = p.name;
  syncAlerts();
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
// Every country, named in the page language by the browser, sorted by that name.
const regionName = (() => { try { const dn = new Intl.DisplayNames([document.documentElement.lang || 'en', 'en'], { type: 'region' }); return (c) => dn.of(c) || c; } catch { return (c) => c; } })();
const countryOptions = (selected) => COUNTRIES.map(([c, dial]) => [c, dial, regionName(c)])
  .sort((a, b) => a[2].localeCompare(b[2], locale()))
  .map(([c, dial, name]) => `<option value="${c}+${dial}"${c === selected ? ' selected' : ''}>${esc(name)} +${dial}</option>`).join('');
const homeCountry = () => state.pricing?.country || 'IN';
function authMode(mode) {
  $$('[data-auth]').forEach((b) => b.classList.toggle('on', b.dataset.auth === mode));
  $('#loginForm').hidden = mode !== 'login';
  $('#signupForm').hidden = mode !== 'signup';
  $('#signinTitle').textContent = mode === 'login' ? t('Log in') : t('Create your account');
  $('#authError').hidden = true;
}
function authError(msg) { $('#authError').textContent = msg; $('#authError').hidden = false; }
function bindAuth() {
  const fill = () => { const opts = countryOptions(homeCountry()); $$('#signinDlg [name=countryCode]').forEach((sel) => { sel.innerHTML = opts; }); };
  fill(); loadPricing().then(fill);
  $$('[data-auth]').forEach((b) => b.addEventListener('click', () => authMode(b.dataset.auth)));
  const submit = (path) => async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('.primary');
    const body = Object.fromEntries(new FormData(f));
    btn.disabled = true;
    try {
      await post(path, body);
      const pending = state.pendingPlan;
      const news = f.marketing?.checked;
      $('#signinDlg').close(); f.reset();
      if (news) $('#signupNews').checked = true;
      if (!pending) toast(path.endsWith('signup') ? t('Welcome to Rekha!') : t('Welcome back!'));
      await afterSignin(pending);
    } catch (err) {
      authError(err.message);
      if (err.code === 'exists') { authMode('login'); authError(err.message); $('#loginForm [name=phone]').value = body.phone; }
    } finally { btn.disabled = false; }
  };
  $('#loginForm').addEventListener('submit', submit('/api/auth/login'));
  $('#signupForm').addEventListener('submit', submit('/api/auth/signup'));
  $('#forgotBtn').addEventListener('click', () => authError(t('Forgot your password? Message us on WhatsApp from your registered number and we will reset it for you. If you used Google before, you can also continue with Google below.')));
}
// Sign-in. When it starts from a plan (state.pendingPlan), the sheet shows the chosen plan and the
// step bar, opens on "Create account", and payment starts straight after (see afterSignin).
async function openSignin(why, mode) {
  const plan = state.pendingPlan;
  $('#signinMsg').textContent = why || (plan ? t('Create a free account or log in. Your plan is saved to it, then you go straight to payment.') : t("Save your family's profiles and unlock AI readings."));
  $('#signinSteps').hidden = !plan;
  $('#signinPlan').hidden = !plan;
  if (plan) {
    $('#signinPlan').innerHTML = `<span>${esc(t('{plan} plan', { plan: t(PLAN_NAME[plan]) }))} · <strong>${priceText(plan)}</strong></span><button type="button" class="linkish" id="changePlan">${esc(t('Change'))}</button>`;
    $('#changePlan').addEventListener('click', () => { const k = state.pendingPlan; $('#signinDlg').close(); openPlans(null, k); });
  }
  $('#devForm').hidden = !state.meta.devLogin;
  authMode(mode || (plan || local.get('seenBefore') !== true ? 'signup' : 'login'));
  if (!$('#signinDlg').open) $('#signinDlg').showModal();
  const hasGoogle = !!state.meta.googleClientId;
  $('#googleOr').hidden = !hasGoogle;
  if (!hasGoogle) { $('#gsiBtn').innerHTML = ''; return; }
  try {
    await loadGsi();
    google.accounts.id.initialize({
      client_id: state.meta.googleClientId,
      callback: async ({ credential }) => {
        try { await post('/api/auth/google', { credential }); const pending = state.pendingPlan; $('#signinDlg').close(); await afterSignin(pending); } catch (e) { authError(e.message); }
      },
    });
    const w = Math.min(360, Math.max(240, $('#signinDlg .sheet-body').clientWidth - 8));
    google.accounts.id.renderButton($('#gsiBtn'), { theme: 'outline', size: 'large', shape: 'pill', text: plan ? 'continue_with' : 'signin_with', width: w, locale: lang });
  } catch { authError(t('Could not load Google sign-in. You can still use your mobile number.')); }
}
async function afterSignin(plan = null) {
  local.set('seenBefore', true);
  // Consent ticked on the sign-up form (mobile or Google): stored with its time on the account.
  if ($('#signupNews')?.checked && !$('#signupForm').hidden) {
    await post('/api/me/marketing', { optIn: true, lang, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => {});
    $('#signupNews').checked = false;
  }
  await refreshMe();
  // Move a chart made before signing in into the account.
  if (state.guestBirth && !profiles().length) {
    try { const p = await post('/api/profiles', { name: state.guestBirth.name || t('Me'), relation: 'self', birth: state.guestBirth }); state.profileId = p.id; await refreshMe(); } catch { /* plan limit */ }
  }
  loadToday();
  window.dispatchEvent(new Event('rekha:signedin'));
  // Came from a plan: continue to payment without asking again.
  if (plan) {
    if (state.me.plan?.key === plan && (state.me.plan.interval || 'month') === (state.interval || 'month')) { toast(t('You are already on this plan.')); return; }
    toast(t('Account ready. Taking you to payment…'));
    subscribe(plan, { skipConfirm: true });
  }
}

// ---------- plans + checkout ----------
// Prices for the visitor's country (from the browser's time zone, or Cloudflare when proxied).
let pricingP = null;
function loadPricing() {
  pricingP ||= api(`/api/pricing?${qs({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}`).then((p) => { state.pricing = p; return p; }).catch(() => null);
  return pricingP;
}
// Step 1 of 3: pick a plan. Monthly or yearly, one list of features (the same for every plan),
// compact plan cards, the promise (no wallet, no upsell), a sample full reading, and one
// button that goes to sign-up or straight to payment.
const priceOf = (key) => {
  const list = state.interval === 'year' ? state.pricing?.yearly : state.pricing?.plans;
  return list?.[key] || (state.interval === 'year' ? null : state.meta.plans.find((x) => x.key === key)?.price);
};
async function openPlans(why, preselect) {
  await loadPricing();
  const cur = state.me.plan?.key || 'free';
  const curIv = state.me.plan?.interval || 'month';
  const signed = !!state.me.user;
  const yearly = !!state.pricing?.yearly && state.meta.billing !== 'razorpay';
  if (!state.interval || !yearly) state.interval = yearly && cur !== 'free' ? curIv : state.interval && yearly ? state.interval : 'month';
  state.plansWhy = why;
  $('#plansInterval').hidden = !yearly;
  $$('#plansInterval [data-iv]').forEach((b) => b.classList.toggle('on', b.dataset.iv === state.interval));
  $('#plansNote').textContent = state.pricing?.country === 'IN' || !state.pricing
    ? t('Prices include GST. Cancel anytime; you keep access until the period you paid for ends.')
    : t('Cancel anytime; you keep access until the period you paid for ends.');
  $('#plansCountry').textContent = state.pricing ? t('Prices for {country}', { country: regionName(state.pricing.country) }) : '';
  $('#plansWhy').textContent = why || t('Free tools stay free. Premium adds your personal times, daily guidance and full readings.');
  $('#plansSteps').innerHTML = `<li class="on">${esc(t('Plan'))}</li><li${signed ? ' class="done"' : ''}>${esc(t('Account'))}</li><li>${esc(t('Payment'))}</li>`;
  const paid = state.meta.plans.filter((p) => p.key !== 'free');
  const isCurrent = (k) => cur === k && curIv === state.interval;
  const pick = preselect && !isCurrent(preselect) ? preselect : (paid.find((p) => !isCurrent(p.key) && p.key === (cur !== 'free' ? cur : 'couple')) || paid.find((p) => !isCurrent(p.key)))?.key;
  $('#plansList').innerHTML = paid.map((p) => {
    const pr = priceOf(p.key);
    const perMonth = state.interval === 'year' && pr ? `<small class="per">${esc(t('{amount} a month, billed yearly', { amount: money({ ...pr, amount: pr.amount / 12 }) }))}</small>` : '';
    return `
    <label class="plan-opt${isCurrent(p.key) ? ' current' : ''}">
      <input type="radio" name="plan" value="${p.key}"${p.key === pick ? ' checked' : ''}${isCurrent(p.key) ? ' disabled' : ''}>
      <span><strong>${esc(t(p.name))}</strong><small>${esc(isCurrent(p.key) ? t('Your plan') : t(p.profiles === 1 ? '{n} profile' : '{n} profiles', { n: p.profiles }))}</small></span>
      <span class="amt">${priceHtml({ ...p, price: pr })}${perMonth}</span>
      ${p.key === 'couple' ? `<span class="badge">${esc(t('Most popular'))}</span>` : ''}
    </label>`;
  }).join('');
  $('#planFeatures').innerHTML = (paid[0]?.features || []).slice(1).map((f) => `<li>${esc(d(f))}</li>`).join('');
  const go = $('#planGo');
  const label = () => {
    const k = $('#plansList input:checked')?.value;
    go.disabled = !k;
    go.textContent = !k ? t('Your plan') : !signed ? t('Continue with {plan}', { plan: t(PLAN_NAME[k]) })
      : cur === 'free' ? t('Pay for {plan}', { plan: t(PLAN_NAME[k]) })
        : k === cur ? (state.interval === 'year' ? t('Switch to yearly') : t('Switch to monthly'))
          : t('Switch to {plan}', { plan: t(PLAN_NAME[k]) });
  };
  $$('#plansList input').forEach((r) => r.addEventListener('change', label));
  label();
  go.onclick = () => { const k = $('#plansList input:checked')?.value; if (k) subscribe(k); };
  if (!$('#plansDlg').open) $('#plansDlg').showModal();
}
const priceText = (plan) => {
  const p = state.meta.plans.find((x) => x.key === plan);
  return priceHtml({ ...p, price: priceOf(plan) }).replace(/<[^>]+>/g, '');
};
const money = (pr) => {
  try { return new Intl.NumberFormat(locale(), { style: 'currency', currency: pr.currency, maximumFractionDigits: pr.amount % 1 ? 2 : 0 }).format(pr.amount); } catch { return `${pr.currency} ${Math.round(pr.amount * 100) / 100}`; }
};
// Price as the payment provider has it (Stripe can be any currency or interval), else the ₹ default.
function priceHtml(p) {
  const pr = p.price;
  if (!pr) return `₹${p.priceInr}<small>${esc(t('/month'))}</small>`;
  const per = pr.interval === 'year' ? t('/year') : t('/month');
  return `${esc(money(pr))}<small>${esc(per)}</small>`;
}
let rzpLoaded = null;
function loadRazorpay() {
  rzpLoaded ||= new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve; s.onerror = reject; document.head.append(s);
  });
  return rzpLoaded;
}
async function subscribe(plan, { skipConfirm = false } = {}) {
  // Not signed in: remember the plan, sign up, and payment starts by itself afterwards.
  if (!state.me.user) { state.pendingPlan = plan; $('#plansDlg').close(); openSignin(); return; }
  const go = $('#planGo'); go.disabled = true;
  try {
    const switchMsg = state.meta.billing === 'stripe'
      ? t('Your plan changes now. The price difference for the rest of this period is charged or credited. Continue?')
      : t('Switching starts a new monthly plan today and ends your current one. Continue?');
    if (!skipConfirm && state.me.plan?.key !== 'free' && !confirm(switchMsg)) return;
    const s = await post('/api/billing/subscribe', { plan, interval: state.interval || 'month', lang, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    // Stripe: plan changes happen straight away; new subscriptions go to Stripe's payment page.
    if (s.changed) { $('#plansDlg').close(); await refreshMe(); loadToday(); toast(t('Welcome to {plan}!', { plan: t(PLAN_NAME[s.plan] || s.plan) })); return; }
    if (s.url) { location.href = s.url; return; }
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
  } catch (e) { if (e.status !== 402) alert(e.message); } finally { go.disabled = false; }
}

const PLAN_NAME = { solo: N('Solo'), couple: N('Couple'), family: N('Family') };
// Back from Stripe Checkout with ?paid=<session id>: confirm, then tidy the address bar.
async function finishCheckout() {
  const params = new URLSearchParams(location.search);
  const sid = params.get('paid'); if (!sid) return;
  params.delete('paid');
  history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''));
  try {
    const r = await post('/api/billing/verify', { sessionId: sid });
    await refreshMe(); loadToday();
    toast(t('Welcome to {plan}!', { plan: t(PLAN_NAME[r.plan] || r.plan) }));
  } catch (e) { toast(e.message); }
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
    ${state.meta.billing === 'stripe' && p.key !== 'free' ? `<button class="ghost" id="accPortal">${esc(t('Payment method and invoices'))}</button>` : ''}
    <button class="primary" id="accPlans">${esc(p.key === 'free' ? t('See premium plans') : t('Change plan'))}</button>
    ${p.key !== 'free' && p.status !== 'cancelling' && p.status !== 'cancelled' ? `<button class="ghost" id="accCancel">${esc(t('Cancel subscription'))}</button>` : ''}
    <label class="check"><input type="checkbox" id="accNews"${m.user.marketing ? ' checked' : ''}> <span>${esc(t('Festival reminders and occasional updates'))}</span></label>
    <details class="explain"><summary>${esc(m.user.phone ? t('Change mobile number') : t('Add mobile number'))}</summary><div>
      <form id="accPhone" class="form"><span class="phone"><select name="countryCode" aria-label="${esc(t('Country code'))}">${countryOptions(homeCountry())}</select><input name="phone" type="tel" inputmode="numeric" placeholder="98765 43210" required></span><button class="ghost">${esc(t('Save number'))}</button></form></div></details>
    <details class="explain"><summary>${esc(m.user.hasPassword ? t('Change password') : t('Set a password (log in with your mobile number)'))}</summary><div>
      <form id="accPw" class="form">${m.user.hasPassword ? `<input name="currentPassword" type="password" placeholder="${esc(t('Current password'))}" autocomplete="current-password" required>` : ''}<input name="newPassword" type="password" placeholder="${esc(t('New password (8+ characters)'))}" autocomplete="new-password" minlength="8" required><button class="ghost">${esc(t('Save password'))}</button></form></div></details>
    <p class="hint" id="accMsg"></p>
    <button class="ghost" id="accOut">${esc(t('Sign out'))}</button>
    <button class="ghost danger" id="accDelete">${esc(t('Delete my account and data'))}</button>
    <button class="ghost" data-close>${esc(t('Close'))}</button>`;
  $('#accountBody [data-close]').addEventListener('click', () => $('#accountDlg').close());
  $('#accPortal')?.addEventListener('click', async () => {
    try { const r = await post('/api/billing/portal', {}); location.href = r.url; } catch (e) { alert(e.message); }
  });
  $('#accPlans').addEventListener('click', () => { $('#accountDlg').close(); openPlans(); });
  $('#accCancel')?.addEventListener('click', async () => {
    if (!confirm(t('Cancel? You keep premium until the end of the month you paid for.'))) return;
    try { await post('/api/billing/cancel', {}); await refreshMe(); openAccount(); } catch (e) { alert(e.message); }
  });
  $('#accOut').addEventListener('click', async () => { await post('/api/auth/logout', {}); location.reload(); });
  $('#accNews').addEventListener('change', async (e) => {
    try { await post('/api/me/marketing', { optIn: e.target.checked, lang, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }); $('#accMsg').textContent = e.target.checked ? t('You will get festival reminders and updates.') : t('Festival reminders and updates are off.'); } catch (err) { $('#accMsg').textContent = err.message; }
  });
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
  const fromProfile = current()?.natal?.moonSign ?? state.guestNatal?.moonSign;
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
      ${h.ai ? `<p class="ai-label">${esc(t("Written by AI from today's planet positions for this Moon sign. The scores are calculated, not written by AI."))}</p>` : ''}
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
  // First visit with a guessed city: say so, and offer the exact location or another city.
  const guess = state.placeGuess ? `<div class="place-guess"><span>${esc(state.placeGuess === 'network' ? t('Showing times for {city}, based on your network. Not right?', { city: d(state.place.name) }) : t('Showing times for {city}. Set your city for your own times.', { city: d(state.place.name) }))}</span>
    <span class="two"><button class="primary small" id="guessGps">${esc(t('Use my exact location'))}</button><button class="ghost small" id="guessPick">${esc(t('Choose city'))}</button><button class="linkish" id="guessOk">${esc(t('Yes, this is right'))}</button></span></div>` : '';
  $('#nowCard').innerHTML = `${guess}
    <div class="sub">${esc(d(tm.weekday))} · ${esc(t('Sunrise'))} ${esc(tm.sunrise)} · ${esc(t('Sunset'))} ${esc(tm.sunset)} · ${esc(d(state.place.name))}</div>
    <div class="big">${slot ? `${esc(t('{name} choghadiya', { name: d(slot.name) }))} ${pill(slot.quality, slot.quality)}` : esc(t('Today'))}</div>
    ${slot ? `<div class="sub">${esc(slot.start)} – ${esc(slot.end)} · ${esc(d(slot.use))}${c.hora ? ` · ${esc(t('{planets} hora', { planets: d(c.hora) }))}` : ''}</div>` : ''}
    ${bad}${personal}
    ${tm.thaiColour ? `<div class="sub">${esc(t('Colour of the day'))}: ${esc(tm.thaiColour.wear.map(d).join(` ${t('or')} `))}</div>` : ''}`;
  $('#guessGps')?.addEventListener('click', useGps);
  $('#guessPick')?.addEventListener('click', () => $('#placeDlg').showModal());
  $('#guessOk')?.addEventListener('click', () => setPlace(state.place));
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
    el.innerHTML = `<div class="card daily"><h2>${esc(t('Today for {name}', { name: prof.name }))}</h2><p class="ai-label">${esc(t("Written by AI from your birth star, Moon sign and today's calculated timings."))}</p><div class="prose">${esc(g.text)}</div></div>`;
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
  const i = state.meta.cities.findIndex((c) => c.name === b.city);
  if (i >= 0) f.city.value = i;
  else if (b.city && Number.isFinite(b.lat)) addPlaceOption(f.city, { name: b.city, lat: b.lat, lon: b.lon, tz: b.tz });
}
// ---------- world city search ----------
// The 40 main cities stay in each list; a search box above it finds any city in the world.
const extraPlaces = [];
function placeOf(value) {
  return String(value).startsWith('p:') ? extraPlaces[+String(value).slice(2)] : state.meta.cities[+value];
}
function addPlaceOption(select, place) {
  extraPlaces.push(place);
  const opt = document.createElement('option');
  opt.value = `p:${extraPlaces.length - 1}`;
  opt.textContent = place.country ? `${place.name}, ${regionName(place.country)}` : place.name;
  select.prepend(opt); select.value = opt.value;
  select.dispatchEvent(new Event('change'));
}
function citySearch(select) {
  const box = document.createElement('div'); box.className = 'place-search';
  box.innerHTML = `<input type="search" autocomplete="off" placeholder="${esc(t('Search any city or town'))}" aria-label="${esc(t('Search any city or town'))}"><ul class="place-results" hidden></ul>`;
  select.before(box);
  const input = box.querySelector('input'); const list = box.querySelector('ul');
  let timer = null; let results = [];
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { list.hidden = true; return; }
    timer = setTimeout(async () => {
      try { results = await api(`/api/places?${qs({ q })}`); } catch { results = []; }
      list.innerHTML = results.length ? results.map((r, i) => `<li><button type="button" data-i="${i}">${esc(r.name)}<small>${esc([r.region, regionName(r.country)].filter(Boolean).join(', '))}</small></button></li>`).join('')
        : `<li class="muted">${esc(t('No city found. Try the nearest bigger town.'))}</li>`;
      list.hidden = false;
    }, 250);
  });
  // Enter picks the first match instead of submitting the surrounding form.
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    list.querySelector('button[data-i]')?.click();
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const r = results[+b.dataset.i];
    addPlaceOption(select, { name: r.name, lat: r.lat, lon: r.lon, tz: r.tz, country: r.country });
    input.value = ''; list.hidden = true;
  });
}

function birthFrom(dateV, timeV, cityValue) {
  const c = placeOf(cityValue);
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
      state.guestNatal.moonSign = data.vedic.moonSignIndex;
      updateSources(); loadHoroscope();
      $('#chart').insertAdjacentHTML('afterbegin', `<div class="card upsell">${esc(t('Your chart is kept on this device. Get a free short reading from it in the Reading tab, or create a free account to save it.'))} <button class="linkish" id="guestRead">${esc(t('Get my free reading ›'))}</button> <button class="linkish" id="saveSignin">${esc(t('Create a free account'))} ›</button></div>`);
      $('#guestRead').addEventListener('click', () => { switchTab('reading'); guestReading(); });
      $('#saveSignin').addEventListener('click', () => openSignin(null, 'signup'));
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

    ${signsHtml(p)}

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
// Indian Moon sign, Indian (sidereal) Sun sign and Western (tropical) sun sign side by side,
// with why they differ: the "wrong sign" complaint is nearly always this difference.
const englishSign = (sa) => RASHIS.find(([x]) => x === sa)?.[1];
function signsHtml(p) {
  const v = p.vedic;
  const sid = v.planets.find((x) => x.planet === 'Sun')?.signName;
  const west = p.western?.sunSign || v.sunSignWestern;
  const named = (sa) => (lang === 'en' && englishSign(sa) ? `${sa} (${englishSign(sa)})` : d(sa));
  const same = englishSign(sid) === west;
  return `<section class="card signs">
    <h2>${esc(t('Your three signs'))}</h2>
    <div class="grid three">
      <div class="cell"><b>${esc(t('Moon sign (Rashi)'))}</b><span class="val">${esc(named(v.moonSign))}</span><span class="sub">${esc(t('Used for Indian daily horoscopes'))}</span></div>
      <div class="cell"><b>${esc(t('Indian Sun sign'))}</b><span class="val">${esc(named(sid))}</span><span class="sub">${esc(t('Sidereal zodiac'))}</span></div>
      <div class="cell"><b>${esc(t('Western sun sign'))}</b><span class="val">${esc(d(west))}</span><span class="sub">${esc(t('Tropical zodiac, used by magazines'))}</span></div>
    </div>
    <p class="means">${esc(same ? t('Your Indian and Western Sun signs match. This happens for people born in about the last week of a Western sign.')
      : t('Your Western sun sign is {west}, but in Indian astrology your Sun is in {sid}. Both are correct: the two zodiacs start about 24 degrees apart, so most people move back one sign.', { west: d(west), sid: named(sid) }))}
      ${esc(t('Your Indian daily horoscope uses your Moon sign, {moon}.', { moon: named(v.moonSign) }))}</p>
    <a href="${esc(pathFor(lang, '/insights/lagna-vs-rashi-vs-sun-sign'))}">${esc(t('Lagna, rashi and sun sign explained'))}</a>
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
const landmarkers = new Map();
function landmarker(kind, runningMode = 'IMAGE') {
  const key = `${kind}:${runningMode}`;
  if (!landmarkers.has(key)) {
    landmarkers.set(key, (async () => {
      const { m, files } = await vision();
      const base = { delegate: 'GPU' };
      if (kind === 'hand') return m.HandLandmarker.createFromOptions(files, { runningMode, numHands: 1, baseOptions: { ...base, modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' } });
      return m.FaceLandmarker.createFromOptions(files, { runningMode, numFaces: 1, baseOptions: { ...base, modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' } });
    })().catch((e) => { landmarkers.delete(key); throw e; }));
  }
  return landmarkers.get(key);
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
  e.target.value = '';
  const canvas = await loadImage(file, $('#palmCanvas'));
  await readPalm(canvas);
}
// Brightness and sharpness of a photo, so a dark or blurred scan is caught before it is read.
function photoQuality(canvas) {
  const w = 160; const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(canvas, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) { lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; sum += lum[i]; }
  const mean = sum / (w * h);
  // Variance of the Laplacian: low means few sharp edges (blur).
  let n = 0, m = 0, m2 = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const v = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w];
    n++; const dlt = v - m; m += dlt / n; m2 += dlt * (v - m);
  }
  const sharp = n ? m2 / n : 0;
  return { mean, sharp, problem: mean < 55 ? 'dark' : mean > 235 ? 'bright' : sharp < 40 ? 'blurry' : null };
}
const QUALITY_MSG = {
  dark: N('This photo looks too dark to read the lines.'),
  bright: N('This photo looks overexposed, so fine lines may not show.'),
  blurry: N('This photo looks blurred, so fine lines may not show.'),
};
function askRetake(problem) {
  const out = $('#palmOut');
  return new Promise((resolve) => {
    out.innerHTML = `<div class="card q-neutral"><p>${esc(t(QUALITY_MSG[problem]))}</p><div class="two"><button class="primary" id="qRetake">${esc(t('Retake'))}</button><button class="ghost" id="qUse">${esc(t('Use this photo'))}</button></div></div>`;
    $('#qRetake').addEventListener('click', () => { out.innerHTML = ''; resolve(false); openCamera(); });
    $('#qUse').addEventListener('click', () => resolve(true));
  });
}
async function readPalm(canvas) {
  const out = $('#palmOut');
  const q = photoQuality(canvas);
  if (q.problem && !(await askRetake(q.problem))) return;
  out.innerHTML = `<p class="muted">${esc(t('Finding your hand…'))}</p>`;
  let lms = null;
  try { lms = (await landmarker('hand')).detect(canvas).landmarks?.[0] || null; if (lms) dots(canvas, lms, '#f08a3e'); } catch { /* on-device model unavailable */ }
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const fd = new FormData(); fd.append('photo', blob, 'palm.jpg');
  const prof = state.me.user ? current() : null;
  if (prof) fd.append('profileId', prof.id);
  if (lms) fd.append('landmarks', JSON.stringify(lms.map(({ x, y }) => ({ x, y }))));
  out.innerHTML = `<p class="muted">${esc(t('Reading your lines…'))}</p>`;
  try {
    const r = await post('/api/palm', fd);
    if (r.lines?.warning) { out.innerHTML = `<p class="q-bad">${esc(d(r.lines.warning))} ${esc(t('Retake with your open palm filling the frame.'))}</p>`; return; }
    state.palm = r.palm; updateSources();
    const note = r.saved ? t('Saved to {name}. Photo deleted after reading. Your combined reading in the Reading tab now includes your palm.', { name: prof.name })
      : state.me.user ? t('Photo deleted after reading. Add your birth details in Kundli to save scans to a profile.')
        : t('Photo deleted after reading. Nothing was saved. Your free reading in the Reading tab can include this palm.');
    out.innerHTML = `${r.lines?.photoQuality === 'poor' ? `<p class="q-neutral">${esc(t('Photo is dark or blurry, so some lines were skipped. Retake in daylight for a fuller reading.'))}</p>` : ''}
      <h2>${esc(r.palm.handType ? t('Your palm: {type} hand', { type: d(r.palm.handType) }) : t('Your palm'))}</h2>${factsHtml(r.palm.facts, r.palm.notVisible)}<p class="hint">${esc(note)}</p>
      ${state.me.user ? '' : `<p><button class="linkish" id="palmSave">${esc(t('Create a free account to keep it ›'))}</button></p>`}`;
    $('#palmSave')?.addEventListener('click', () => openSignin(t('A free account keeps your palm and chart, so your readings can use them.'), 'signup'));
    if (state.me.user) await refreshMe();
  } catch (err) { showError(out, err); }
}

// ---------- guided palm capture ----------
// Live camera with a hand outline. The photo is taken by a 3-second countdown once the
// open hand fills the outline and holds still, never "before I was ready".
const cam = { stream: null, timer: null, count: null, okSince: 0, last: null, manual: false };
const camStatus = (msg) => { $('#camStatus').textContent = msg; };
function stopCamera() {
  clearInterval(cam.timer); clearInterval(cam.count); cam.timer = null; cam.count = null; cam.okSince = 0; cam.last = null; cam.manual = false;
  cam.stream?.getTracks().forEach((tr) => tr.stop()); cam.stream = null;
  $('#camCount').hidden = true;
}
async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { $('#palmFile').click(); return; }
  const dlg = $('#camDlg');
  if (!dlg.open) dlg.showModal();
  camStatus(t('Starting the camera…'));
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
  } catch {
    dlg.close(); toast(t('The camera is not available. Upload a photo instead.')); $('#palmFile').click(); return;
  }
  const video = $('#camVideo'); video.srcObject = cam.stream;
  try { await video.play(); } catch { /* autoplay attribute covers it */ }
  let model = null;
  try { model = await landmarker('hand', 'VIDEO'); } catch { /* fall back to the manual countdown */ }
  if (!dlg.open) return stopCamera();
  if (!model) { camStatus(t('Hold your open palm inside the outline, then tap Take photo now.')); return; }
  camStatus(t('Show your open palm inside the outline'));
  const probe = document.createElement('canvas'); probe.width = 64; probe.height = 64;
  const pg = probe.getContext('2d', { willReadFrequently: true });
  cam.timer = setInterval(() => {
    if (!video.videoWidth || cam.manual) return;
    let lms = null;
    try { lms = model.detectForVideo(video, performance.now()).landmarks?.[0]; } catch { return; }
    pg.drawImage(video, 0, 0, 64, 64);
    const px = pg.getImageData(0, 0, 64, 64).data; let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const problem = handProblem(lms, sum / (px.length / 4));
    if (problem) {
      // The hand moved or left the outline during the countdown: start again.
      if (cam.count) { clearInterval(cam.count); cam.count = null; $('#camCount').hidden = true; }
      cam.okSince = 0; camStatus(t(problem)); return;
    }
    if (cam.count) return;
    cam.okSince ||= Date.now();
    camStatus(t('Hold still…'));
    if (Date.now() - cam.okSince > 600) { camStatus(t('Perfect. Taking the photo…')); startCountdown(); }
  }, 180);
}
const HAND_MSG = {
  none: N('Show your open palm inside the outline'), dark: N('Too dark: move to a brighter spot'),
  far: N('Move your hand a little closer'), near: N('Move your hand a little further away'),
  closed: N('Open your hand fully, fingers slightly apart'), moving: N('Hold still…'),
};
function handProblem(lms, brightness) {
  if (brightness < 50) return HAND_MSG.dark;
  if (!lms) return HAND_MSG.none;
  const xs = lms.map((p) => p.x); const ys = lms.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (size < 0.45) return HAND_MSG.far;
  if (Math.min(...xs) < 0.01 || Math.max(...xs) > 0.99 || Math.min(...ys) < 0.01 || Math.max(...ys) > 0.99) return HAND_MSG.near;
  const dist = (a, b) => Math.hypot(lms[a].x - lms[b].x, lms[a].y - lms[b].y);
  const open = [[8, 6], [12, 10], [16, 14], [20, 18]].filter(([tip, pip]) => dist(tip, 0) > dist(pip, 0)).length;
  if (open < 4) return HAND_MSG.closed;
  if (cam.last && Math.hypot(lms[9].x - cam.last.x, lms[9].y - cam.last.y) > 0.025) { cam.last = { ...lms[9] }; return HAND_MSG.moving; }
  cam.last = { ...lms[9] };
  return null;
}
function startCountdown() {
  if (cam.count) return;
  let n = 3; const el = $('#camCount'); el.hidden = false; el.textContent = n;
  cam.count = setInterval(() => {
    n -= 1;
    if (n > 0) { el.textContent = n; return; }
    clearInterval(cam.count); cam.count = null; el.hidden = true;
    capturePalm();
  }, 1000);
}
async function capturePalm() {
  const video = $('#camVideo');
  if (!video.videoWidth) return;
  const canvas = $('#palmCanvas');
  const s = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * s); canvas.height = Math.round(video.videoHeight * s);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.hidden = false;
  $('#camDlg').close();
  await readPalm(canvas);
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
  const s = [[N('Birth chart'), !!p || (!state.me.user && !!state.guestBirth)], [N('Palm'), !!(p?.hasPalm || state.palm)], [N('Face'), !!(p?.hasFace || state.face)]];
  $('#sources').innerHTML = s.map(([n, ok]) => `<span class="chip${ok ? ' ok' : ''}">${ok ? '✓' : '+'} ${esc(t(n))}</span>`).join('');
}
async function loadSavedReading() {
  const p = current(); if (!p?.hasReading) return;
  try {
    const r = await api(`/api/reading/${p.id}`);
    if (r?.text) { $('#reading').hidden = false; $('#reading').innerHTML = readingHtml(r); $('#chatCard').hidden = false; $('#shareBtn').hidden = false; chatAllowance(); }
  } catch { /* ignore */ }
}
function chatAllowance() {
  const a = state.me.allowance?.chat; $('#chatLeft').textContent = a ? t('{n} questions left this month', { n: Math.max(0, a.max - a.used) }) : '';
}
// No account: a short reading from the birth details on this device, plus any palm and face scan.
async function guestReading() {
  const el = $('#reading');
  if (!state.guestBirth) {
    switchTab('chart');
    toast(t('Add your birth details first. No account needed.'));
    return;
  }
  el.hidden = false; el.textContent = t('Writing your reading…');
  try {
    const r = await post('/api/reading', { birth: state.guestBirth, name: state.guestBirth.name, palm: state.palm, face: state.face, language: $('#lang').value, location: loc() });
    el.innerHTML = readingHtml(r);
    el.insertAdjacentHTML('beforeend', `<div class="card upsell"><p>${esc(t('This short reading is free and was not saved.'))}</p>
      <div class="two"><button class="primary" id="guestSave">${esc(t('Create a free account to keep it'))}</button><button class="ghost" id="fullUp">${esc(t('See what the full reading adds'))}</button></div></div>`);
    $('#guestSave').addEventListener('click', () => openSignin(t('A free account keeps your palm and chart, so your readings can use them.'), 'signup'));
    $('#fullUp').addEventListener('click', () => openPlans(t('The full palm + face + chart reading is part of Premium.')));
  } catch (e) { el.textContent = e.message; }
}
async function onReading(refresh = false) {
  if (!state.me.user) { guestReading(); return; }
  if (!current()) { switchTab('chart'); return; }
  const el = $('#reading'); el.hidden = false; el.textContent = t('Writing your reading…');
  try {
    const r = await post('/api/reading', { profileId: current().id, language: $('#lang').value, location: loc(), refresh: refresh === true });
    el.innerHTML = readingHtml(r); state.facts = r.facts; state.history = [];
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
      ${r.reading ? `<article class="card"><p class="ai-label">${esc(t('Written by AI from the scores above.'))}</p><div class="prose">${esc(r.reading)}</div></article>` : `<div class="card upsell">${esc(t('Want this explained in plain words in your language?'))} <button class="linkish" id="matchUp">${esc(t('Premium'))} ›</button></div>`}`;
    $('#matchUp')?.addEventListener('click', () => openPlans(t('Detailed match explanations are part of Premium.')));
  } catch (err) { showError(out, err); }
}

// ---------- daily alerts (web push) ----------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToBytes = (b64) => { const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
function alertsMsg(text) { $('#alertsMsg').hidden = !text; $('#alertsMsg').textContent = text || ''; }
async function currentPush() {
  if (!pushSupported()) return null;
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { return null; }
}
function alertsUi(on) {
  $('#alertsOn').hidden = on; $('#alertsOff').hidden = !on;
  $('#alertsState').textContent = on ? t('On') : '';
  $('#alertsCard').classList.toggle('on', on);
}
const alertPrefs = () => ({ morning: $('#alertMorning').checked ? $('#alertTime').value || '07:00' : null, rahu: $('#alertRahu').checked, news: $('#alertNews').checked });
async function sendAlertPrefs(sub, confirmIt = false) {
  const prefs = alertPrefs();
  local.set('alerts', prefs);
  await post('/api/push/subscribe', { subscription: sub.toJSON(), place: { ...loc(), name: d(state.place.name) }, lang, ...prefs, confirm: confirmIt });
}
async function syncAlerts() { const sub = await currentPush(); if (sub) sendAlertPrefs(sub).catch(() => {}); }
function bindAlerts() {
  const saved = local.get('alerts');
  if (saved) { $('#alertMorning').checked = !!saved.morning; if (saved.morning) $('#alertTime').value = saved.morning; $('#alertRahu').checked = saved.rahu !== false; $('#alertNews').checked = saved.news !== false; }
  currentPush().then((sub) => alertsUi(!!sub));
  $('#alertsOn').addEventListener('click', async () => {
    if (!pushSupported()) { alertsMsg(t(isIos() && !isStandalone() ? ALERTS_HELP.ios : ALERTS_HELP.unsupported)); return; }
    if (!$('#alertMorning').checked && !$('#alertRahu').checked && !$('#alertNews').checked) { alertsMsg(t('Tick at least one alert.')); return; }
    const btn = $('#alertsOn'); btn.disabled = true;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { alertsMsg(t(ALERTS_HELP.blocked)); return; }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await api('/api/push/key');
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
      await sendAlertPrefs(sub, true);
      alertsUi(true); alertsMsg(t('Alerts are on for {city}. They follow the location you set at the top.', { city: d(state.place.name) }));
    } catch (e) { alertsMsg(e.message || t('Could not turn on alerts. Please try again.')); } finally { btn.disabled = false; }
  });
  $('#alertsOff').addEventListener('click', async () => {
    const sub = await currentPush();
    if (sub) { await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
    alertsUi(false); alertsMsg(t('Alerts are off.'));
  });
  for (const id of ['#alertMorning', '#alertTime', '#alertRahu', '#alertNews']) $(id).addEventListener('change', syncAlerts);
  // Signing in later links this phone's alerts to the account (for the owner's segments).
  window.addEventListener('rekha:signedin', syncAlerts);
}

// ---------- choose what Today shows ----------
// Saved on this device only (a display preference, not account data).
const SECTIONS = [['daily', N('Your daily guidance')], ['horo', N('Daily horoscope')], ['best', N('Best time for')], ['times', N('Avoid today and auspicious windows')],
  ['alerts', N('Daily alerts')], ['chogh', N('Choghadiya')], ['hora', N('Hora (planetary hours)')]];
function layout() {
  const saved = local.get('todayLayout');
  const keys = SECTIONS.map(([k]) => k);
  const order = [...(saved?.order || []).filter((k) => keys.includes(k)), ...keys.filter((k) => !(saved?.order || []).includes(k))];
  return { order, hidden: (saved?.hidden || []).filter((k) => keys.includes(k)) };
}
function applyLayout() {
  const { order, hidden } = layout();
  const body = $('#todayBody');
  for (const k of order) { const el = body.querySelector(`:scope > [data-sec="${k}"]`); if (el) { body.append(el); el.classList.toggle('sec-off', hidden.includes(k)); } }
}
function renderCustomise() {
  const { order, hidden } = layout();
  const name = Object.fromEntries(SECTIONS);
  $('#todayList').innerHTML = order.map((k, i) => `<li><label class="check"><input type="checkbox" data-k="${k}"${hidden.includes(k) ? '' : ' checked'}> ${esc(t(name[k]))}</label>
    <span class="moves"><button type="button" class="ghost small" data-up="${k}" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('Move up'))}">↑</button><button type="button" class="ghost small" data-down="${k}" ${i === order.length - 1 ? 'disabled' : ''} aria-label="${esc(t('Move down'))}">↓</button></span></li>`).join('');
  const save = (o, h) => { local.set('todayLayout', { order: o, hidden: h }); applyLayout(); renderCustomise(); };
  $$('#todayList [data-k]').forEach((c) => c.addEventListener('change', () => {
    const { order: o, hidden: h } = layout();
    save(o, c.checked ? h.filter((x) => x !== c.dataset.k) : [...h, c.dataset.k]);
  }));
  $$('#todayList [data-up], #todayList [data-down]').forEach((b) => b.addEventListener('click', () => {
    const { order: o, hidden: h } = layout();
    const k = b.dataset.up || b.dataset.down; const i = o.indexOf(k); const j = b.dataset.up ? i - 1 : i + 1;
    [o[i], o[j]] = [o[j], o[i]]; save(o, h);
  }));
}
function openCustomise() { renderCustomise(); $('#todayDlg').showModal(); }

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
