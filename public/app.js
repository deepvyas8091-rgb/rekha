// Rekha web client. Plain ES modules, no build step.
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
    const err = new ApiError(data.error || `Request failed (${res.status})`, res.status, data.code);
    if (res.status === 401 && data.code === 'signin') openSignin(data.error);
    if (res.status === 402 && data.code === 'upgrade') openPlans(data.error);
    throw err;
  }
  return data;
}
const post = (path, body, method = 'POST') => api(path, { method, body: body instanceof FormData ? body : JSON.stringify(body) });
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString();
const showError = (el, e) => { el.innerHTML = e.status === 402 || e.status === 401 ? `<div class="card upsell">${esc(e.message)}</div>` : `<div class="card q-bad">${esc(e.message)}</div>`; };
const pill = (q, text) => `<span class="pill q-${esc(q)}">${esc(text)}</span>`;
const loc = () => ({ lat: state.place.lat, lon: state.place.lon, tz: state.place.tz });

// ---------- boot ----------
async function boot() {
  state.meta = await api('/api/meta');
  $('#demoBanner').hidden = !state.meta.demoMode;
  const cityOpts = state.meta.cities.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('');
  for (const sel of ['#placeSel', '[name=city]', '[name=bCity]', '[name=gCity]']) $(sel).innerHTML = cityOpts;
  const actOpts = state.meta.activities.map((a) => `<option value="${a}">${a[0].toUpperCase() + a.slice(1)}</option>`).join('');
  $('#activity').innerHTML = actOpts; $('#calActivity').innerHTML = actOpts;
  $('#lang').innerHTML = Object.entries(state.meta.languages).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  $('#lang').value = local.get('lang', navigator.language?.startsWith('hi') ? 'hi' : 'en');
  if (!state.place) state.place = state.meta.cities.find((c) => c.name === 'Mumbai');
  $('#placeBtn').textContent = state.place.name;
  $('#panchDate').value = new Intl.DateTimeFormat('en-CA', { timeZone: state.place.tz }).format(new Date());
  bindUi();
  await refreshMe();
  loadToday();
}

async function refreshMe() {
  state.me = await api('/api/me');
  const signed = !!state.me.user;
  $('#accountBtn').textContent = signed ? (state.me.user.name || 'Account') : 'Sign in';
  $('#planBtn').textContent = isPaid() ? state.me.plan.name : 'Premium';
  $('#planBtn').classList.toggle('premium', !isPaid());
  const usable = profiles().filter((p) => !p.locked);
  if (!current() && usable[0]) state.profileId = usable[0].id;
  $('#profileBar').hidden = usable.length < 2;
  $('#profileSel').innerHTML = usable.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (current()) $('#profileSel').value = current().id;
  renderProfiles(); updateSources(); renderMatchPickers();
}

function bindUi() {
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $('#placeBtn').addEventListener('click', () => $('#placeDlg').showModal());
  $('#placeDlg').addEventListener('close', () => { if ($('#placeDlg').returnValue === 'ok') setPlace(state.meta.cities[+$('#placeSel').value]); });
  $('#gpsBtn').addEventListener('click', () => navigator.geolocation?.getCurrentPosition((p) => {
    setPlace({ name: 'My location', lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    $('#placeDlg').close();
  }, () => alert('Location permission was not granted.')));
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
  $('#palmFile').addEventListener('change', onPalm);
  $('#faceConsent').addEventListener('change', (e) => { $('#faceFile').disabled = !e.target.checked; });
  $('#faceFile').addEventListener('change', onFace);
  $('#readBtn').addEventListener('click', onReading);
  $('#lang').addEventListener('change', () => { local.set('lang', $('#lang').value); if (isPaid()) loadDaily(); });
  $('#chatForm').addEventListener('submit', onAsk);
  $('#shareBtn').addEventListener('click', shareCard);
  $('#matchForm').addEventListener('submit', onMatch);
  $('#devForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await post('/api/auth/dev', { email: e.target.email.value || 'tester@example.com' });
    $('#signinDlg').close(); await afterSignin();
  });
}

function switchTab(name) {
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
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
async function openSignin(why) {
  $('#signinMsg').textContent = why || '';
  $('#devForm').hidden = !state.meta.devLogin;
  if (!$('#signinDlg').open) $('#signinDlg').showModal();
  if (!state.meta.googleClientId) { $('#gsiBtn').innerHTML = state.meta.devLogin ? '' : '<p class="hint">Sign-in is not configured yet.</p>'; return; }
  try {
    await loadGsi();
    google.accounts.id.initialize({
      client_id: state.meta.googleClientId,
      callback: async ({ credential }) => {
        try { await post('/api/auth/google', { credential }); $('#signinDlg').close(); await afterSignin(); } catch (e) { $('#signinMsg').textContent = e.message; }
      },
    });
    google.accounts.id.renderButton($('#gsiBtn'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with' });
  } catch { $('#signinMsg').textContent = 'Could not load Google sign-in. Check your connection.'; }
}
async function afterSignin() {
  await refreshMe();
  // Move a chart made before signing in into the account.
  if (state.guestBirth && !profiles().length) {
    try { const p = await post('/api/profiles', { name: state.guestBirth.name || 'Me', relation: 'self', birth: state.guestBirth }); state.profileId = p.id; await refreshMe(); } catch { /* plan limit */ }
  }
  loadToday();
}

// ---------- plans + checkout ----------
function openPlans(why) {
  $('#plansWhy').textContent = why || 'Free tools stay free. Premium adds your personal times, daily guidance and full readings.';
  const cur = state.me.plan?.key || 'free';
  $('#plansList').innerHTML = state.meta.plans.filter((p) => p.key !== 'free').map((p) => `
    <div class="plan${cur === p.key ? ' current' : ''}${p.key === 'couple' ? ' popular' : ''}">
      ${p.key === 'couple' ? '<span class="tag">Most popular</span>' : ''}
      <h3>${esc(p.name)}</h3>
      <div class="price">₹${p.priceInr}<small>/month</small></div>
      <ul>${p.features.slice(0, 4).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <button class="primary" data-plan="${p.key}" ${cur === p.key ? 'disabled' : ''}>${cur === p.key ? 'Your plan' : cur === 'free' ? `Start ${esc(p.name)}` : `Switch to ${esc(p.name)}`}</button>
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
  if (!state.me.user) { $('#plansDlg').close(); openSignin('Sign in first so your plan is saved to your account.'); return; }
  try {
    if (state.me.plan?.key !== 'free' && !confirm('Switching starts a new monthly plan today and ends your current one. Continue?')) return;
    const s = await post('/api/billing/subscribe', { plan });
    await loadRazorpay();
    const rzp = new window.Razorpay({
      key: s.keyId, subscription_id: s.subscriptionId, name: 'Rekha', description: `${s.name} plan, ₹${s.priceInr}/month`,
      prefill: { email: s.email, name: s.userName }, theme: { color: '#2b1840' },
      handler: async (r) => {
        try { await post('/api/billing/verify', r); $('#plansDlg').close(); await refreshMe(); loadToday(); toast(`Welcome to ${s.name}!`); } catch (e) { alert(e.message); }
      },
    });
    rzp.on('payment.failed', (r) => alert(r.error?.description || 'Payment failed. You have not been charged.'));
    rzp.open();
  } catch (e) { if (e.status !== 402) alert(e.message); }
}

// ---------- account ----------
function openAccount() {
  const m = state.me; const p = m.plan;
  const meter = (k, label) => m.allowance[k].max ? `<div class="meter"><span>${label}</span><span>${m.allowance[k].used} / ${m.allowance[k].max}</span></div>` : '';
  const renew = p.renewsAt ? new Date(p.renewsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  $('#accountBody').innerHTML = `
    <h2>${esc(m.user.name || 'Your account')}</h2>
    <p class="hint">${esc(m.user.email)}</p>
    <div class="card"><strong>${esc(p.name)} plan</strong>${p.key !== 'free' && renew ? `<p class="hint">${p.status === 'cancelling' || p.status === 'cancelled' ? `Access until ${renew}` : `Renews ${renew}`}</p>` : ''}
      <h3>This month</h3>${meter('reading', 'Full readings')}${meter('palm', 'Palm scans')}${meter('chat', 'Questions')}${meter('match', 'Match explanations')}${meter('daily', 'Daily guidance')}
    </div>
    <button class="primary" id="accPlans">${p.key === 'free' ? 'See premium plans' : 'Change plan'}</button>
    ${p.key !== 'free' && p.status !== 'cancelling' && p.status !== 'cancelled' ? '<button class="ghost" id="accCancel">Cancel subscription</button>' : ''}
    <button class="ghost" id="accOut">Sign out</button>
    <button class="ghost danger" id="accDelete">Delete my account and data</button>
    <button class="ghost" data-close>Close</button>`;
  $('#accountBody [data-close]').addEventListener('click', () => $('#accountDlg').close());
  $('#accPlans').addEventListener('click', () => { $('#accountDlg').close(); openPlans(); });
  $('#accCancel')?.addEventListener('click', async () => {
    if (!confirm('Cancel? You keep premium until the end of the month you paid for.')) return;
    try { await post('/api/billing/cancel', {}); await refreshMe(); openAccount(); } catch (e) { alert(e.message); }
  });
  $('#accOut').addEventListener('click', async () => { await post('/api/auth/logout', {}); location.reload(); });
  $('#accDelete').addEventListener('click', async () => {
    if (!confirm('This permanently deletes your account, all profiles, scans and readings. Continue?')) return;
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
    const t = await api(`/api/timings?${qs({ ...loc(), activities: $('#activity').value, profile: prof?.id })}`);
    state.timings = t;
    renderNow(t, prof);
    const wins = t.bestWindows[$('#activity').value] || [];
    $('#bestWindows').innerHTML = wins.length
      ? wins.map((w) => `<div class="window"><strong>${esc(w.start)} – ${esc(w.end)}</strong><span>${esc(w.choghadiya)} · ${esc(w.horas.join(', '))} hora</span></div>`).join('')
      : '<div class="card muted">No clean daytime window today for this activity. Check the Panchang tab for better days.</div>';
    $('#badTimes').innerHTML = t.badTimes.map((b) => item(b, 'bad')).join('') + (t.panchak ? `<div class="item bad"><time>All day</time><div>Panchak<small>${esc(t.panchak)}</small></div></div>` : '');
    $('#goodTimes').innerHTML = t.goodTimes.filter((g) => !g.skip).map((g) => item(g, 'good')).join('');
    renderChoghadiya();
    $('#hora').innerHTML = t.hora.map((h) => `<div class="item ${h.quality === 'bad' ? 'bad' : h.quality === 'good' ? 'good' : ''}${isNow(h) ? ' active' : ''}"><time>${esc(h.start)} – ${esc(h.end)}</time><div>${esc(h.lord)}<small>${esc(h.use)}</small></div></div>`).join('');
    loadDaily();
  } catch (e) { showError($('#nowCard'), e); }
}
const item = (x, cls) => `<div class="item ${cls}${isNow(x) ? ' active' : ''}"><time>${esc(x.start)} – ${esc(x.end)}</time><div>${esc(x.name)}<small>${esc(x.note || '')}</small></div></div>`;
function isNow(x) {
  const n = new Intl.DateTimeFormat('en-GB', { timeZone: state.place.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  return x.start <= x.end ? n >= x.start && n < x.end : n >= x.start || n < x.end;
}
function renderNow(t, prof) {
  const c = t.current || {};
  const slot = [...t.choghadiya.day, ...t.choghadiya.night].find((s) => s.name === c.choghadiya && isNow(s));
  const bad = c.inBadPeriod?.length ? `<div>${pill('bad', `Now: ${c.inBadPeriod.join(', ')}`)}</div>` : '';
  let personal;
  if (t.personal) personal = `<div class="sub">${esc(prof?.name || 'Your')} day: <strong>${esc(t.personal.dayRating)}</strong> · Tara ${esc(t.personal.tarabalam.tara)} · Moon in house ${esc(t.personal.chandrabalam.house)}</div>`;
  else if (t.personalLocked) personal = '<button class="linkish" id="unlockDay">See your personal day rating and best times ›</button>';
  else personal = `<button class="linkish" id="addBirth">Add your birth details for a personal day rating ›</button>`;
  $('#nowCard').innerHTML = `
    <div class="sub">${esc(t.weekday)} · Sunrise ${esc(t.sunrise)} · Sunset ${esc(t.sunset)} · ${esc(state.place.name)}</div>
    <div class="big">${slot ? `${esc(slot.name)} choghadiya ${pill(slot.quality, slot.quality)}` : 'Today'}</div>
    ${slot ? `<div class="sub">${esc(slot.start)} – ${esc(slot.end)} · ${esc(slot.use)} · ${esc(c.hora || '')} hora</div>` : ''}
    ${bad}${personal}
    ${t.thaiColour ? `<div class="sub">Colour of the day: ${esc(t.thaiColour.wear.join(' or '))}</div>` : ''}`;
  $('#unlockDay')?.addEventListener('click', () => openPlans('Your personal day rating, best times and daily guidance are part of Premium.'));
  $('#addBirth')?.addEventListener('click', () => switchTab('chart'));
}
function renderChoghadiya() {
  const t = state.timings; if (!t) return;
  $('#choghadiya').innerHTML = t.choghadiya[state.cgPart].map((s) => `<div class="slot q-${esc(s.quality)}${isNow(s) ? ' active' : ''}"><time>${esc(s.start)} – ${esc(s.end)}</time><span>${esc(s.name)} <small class="muted">${esc(s.use)}</small></span>${pill(s.quality, s.quality)}</div>`).join('');
}
async function loadDaily() {
  const prof = current(); const el = $('#dailyCard');
  if (!prof || !isPaid()) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="card muted">Writing today\'s guidance…</div>';
  try {
    const d = await api(`/api/daily/${prof.id}?${qs({ ...loc(), language: $('#lang').value })}`);
    el.innerHTML = `<div class="card daily"><h2>Today for ${esc(prof.name)}</h2><div class="prose">${esc(d.text)}</div></div>`;
  } catch (e) { el.innerHTML = e.code === 'limit' ? '' : `<div class="card q-bad">${esc(e.message)}</div>`; }
}

// ---------- panchang + calendar ----------
async function loadPanchang() {
  try {
    const d = await api(`/api/panchang?${qs({ ...loc(), date: $('#panchDate').value })}`);
    const ends = (x) => (x.endsAt ? `until ${x.endsAt.slice(11)}${x.endsAt.slice(0, 10) !== d.date ? ' (+1)' : ''}` : '');
    const cells = [
      ['Tithi', `${d.paksha} ${d.tithi[0].name}`, ends(d.tithi[0])], ['Nakshatra', d.nakshatra[0].name, ends(d.nakshatra[0])],
      ['Yoga', d.yoga[0].name, ends(d.yoga[0])], ['Karana', d.karana[0].name, ends(d.karana[0])],
      ['Vara', `${d.vara.en} (${d.vara.sa})`, `Lord: ${d.vara.lord}`], ['Month', d.masa.amanta, `Purnimanta: ${d.masa.purnimanta}`],
      ['Sunrise / Sunset', `${d.sunrise} / ${d.sunset}`, ''], ['Moonrise / Moonset', `${d.moonrise ?? '-'} / ${d.moonset ?? '-'}`, ''],
      ['Moon sign', d.moonSign, `Sun: ${d.sunSign}`], ['Ritu / Ayana', d.ritu, d.ayana],
      ['Vikram Samvat', d.samvat.vikram, `Shaka ${d.samvat.shaka}`], ['Festivals', d.festivals.join(', ') || 'None', ''],
    ];
    $('#panchang').innerHTML = cells.map(([b, s, sm]) => `<div class="cell"><b>${esc(b)}</b><span>${esc(s)}</span><small>${esc(sm)}</small></div>`).join('');
  } catch (e) { showError($('#panchang'), e); }
}
async function loadCalendar() {
  const month = $('#panchDate').value.slice(0, 7);
  $('#calendar').innerHTML = '<div class="muted">Scoring the month…</div>';
  try {
    const c = await api(`/api/calendar?${qs({ ...loc(), month, activity: $('#calActivity').value, profile: current()?.id })}`);
    $('#calNote').innerHTML = c.personalLocked ? '<button class="linkish" id="calUnlock">Personalise this calendar to your chart with Premium ›</button>'
      : c.days[0]?.personal ? `<p class="hint">Personalised for ${esc(current()?.name)}.</p>` : '';
    $('#calUnlock')?.addEventListener('click', () => openPlans('Personal good-day calendars are part of Premium.'));
    const first = new Date(`${month}-01T12:00:00Z`).getUTCDay();
    const head = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<div class="dow">${d}</div>`).join('');
    const label = { excellent: 'best', good: 'good', average: 'ok', avoid: 'avoid' };
    $('#calendar').innerHTML = head + '<div></div>'.repeat(first) + c.days.map((d) => `<button class="day ${d.rating}" title="${esc(`${d.tithi}, ${d.nakshatra}. ${d.reasons.join('; ')}`)}" data-date="${d.date}"><b>${+d.date.slice(8)}</b>${label[d.rating]}</button>`).join('');
    $$('#calendar .day').forEach((b) => b.addEventListener('click', () => { $('#panchDate').value = b.dataset.date; loadPanchang(); window.scrollTo(0, 0); }));
  } catch (e) { showError($('#calendar'), e); }
}

// ---------- profiles + kundli ----------
function renderProfiles() {
  const el = $('#profilesCard');
  if (!state.me.user) {
    el.innerHTML = '<div class="card upsell"><strong>Sign in to save profiles</strong><p class="hint">Keep charts for your family and get readings for each person.</p><button class="primary" id="profSignin">Sign in with Google</button></div>';
    $('#profSignin').addEventListener('click', () => openSignin());
    if (state.guestBirth) fillBirth(state.guestBirth);
    return;
  }
  const max = state.me.plan.profiles;
  el.innerHTML = `<div class="card"><div class="row-head"><h2>Family profiles</h2><span class="hint">${profiles().filter((p) => !p.locked).length} of ${max}</span></div>
    ${profiles().map((p) => `<div class="profile${p.id === current()?.id ? ' sel' : ''}${p.locked ? ' locked' : ''}">
      <button class="pname" data-pick="${p.id}" ${p.locked ? 'disabled' : ''}><strong>${esc(p.name)}</strong><small>${esc(p.natal?.rashi || '')} · ${esc(p.natal?.nakshatra || '')}${p.locked ? ' · needs a bigger plan' : ''}</small></button>
      <button class="ghost small" data-del="${p.id}" aria-label="Delete ${esc(p.name)}">Delete</button></div>`).join('') || '<p class="hint">No profiles yet. Add your birth details below.</p>'}
    ${profiles().length >= max ? `<button class="linkish" id="moreProfiles">Need more profiles? Couple covers 2, Family covers 4 ›</button>` : ''}</div>`;
  $$('[data-pick]').forEach((b) => b.addEventListener('click', () => selectProfile(b.dataset.pick)));
  $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this profile and its scans and readings?')) return;
    await api(`/api/profiles/${b.dataset.del}`, { method: 'DELETE' }); await refreshMe(); loadToday(); $('#chart').innerHTML = '';
  }));
  $('#moreProfiles')?.addEventListener('click', () => openPlans());
  $('#birthForm').hidden = profiles().length >= max;
  $('#birthTitle').textContent = profiles().length ? 'Add a family member' : 'Add your birth details';
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
      await refreshMe(); loadToday(); showChart();
    } else {
      state.guestBirth = { ...birth, name: f.name.value.trim() }; local.set('birth', state.guestBirth);
      const data = await post('/api/profile', { birth });
      renderChart(data, state.guestBirth.name);
      state.guestNatal = { nakshatra: data.vedic.birthNakshatra };
      $('#chart').insertAdjacentHTML('afterbegin', '<div class="card upsell">Sign in to save this chart and unlock readings. <button class="linkish" id="saveSignin">Sign in ›</button></div>');
      $('#saveSignin').addEventListener('click', () => openSignin());
    }
  } catch (err) { if (err.status !== 402) showError($('#chart'), err); }
}
async function showChart() {
  const prof = current(); if (!prof) return;
  $('#chart').innerHTML = '<p class="muted">Calculating…</p>';
  try { renderChart(await api(`/api/profiles/${prof.id}/chart`), prof.name); } catch (e) { showError($('#chart'), e); }
}
function renderChart(p, name) {
  const v = p.vedic; const cur = v.dasha.current;
  $('#chart').innerHTML = `
    <h2>${esc(name || 'Your')} kundli</h2>
    <div class="grid">
      <div class="cell"><b>Lagna</b><span>${esc(v.lagna.signName)}</span><small>${esc(v.lagna.degree)} · ${esc(v.lagna.nakshatra)}</small></div>
      <div class="cell"><b>Moon sign (Rashi)</b><span>${esc(v.moonSign)}</span><small>${esc(v.birthNakshatra)}</small></div>
      <div class="cell"><b>Current dasha</b><span>${esc(cur?.mahadasha)} / ${esc(cur?.antardasha)}</span><small>until ${esc(cur?.antarEnds?.slice(0, 10))}</small></div>
      <div class="cell"><b>Sade Sati</b><span>${esc(v.sadeSati.active ? v.sadeSati.phase : 'Not active')}</span><small>${esc(v.sadeSati.dhaiya || `Saturn in ${v.sadeSati.saturnSign}`)}</small></div>
      <div class="cell"><b>Manglik</b><span>${esc(v.manglik.status)}</span></div>
      <div class="cell"><b>Western sun sign</b><span>${esc(p.western.sunSign)}</span></div>
      <div class="cell"><b>Chinese zodiac</b><span>${esc(p.chinese.zodiac.chinese)}</span><small>Day master: ${esc(p.chinese.dayMaster)}</small></div>
      <div class="cell"><b>Thai birth colour</b><span>${esc(p.thai.colour)}</span><small>Born on ${esc(p.thai.day)}</small></div>
      <div class="cell"><b>Life path</b><span>${esc(p.numerology.lifePath)}</span></div>
      <div class="cell"><b>BaZi</b><span>${esc(Object.values(p.chinese.pillars).map((x) => x.stem.zh + x.branch.zh).join(' '))}</span><small>Missing: ${esc(p.chinese.missingElements.join(', ') || 'none')}</small></div>
    </div>
    <div class="card"><h2>Planets</h2><table><thead><tr><th>Planet</th><th>Sign</th><th>Degree</th><th>Nakshatra</th><th>House</th></tr></thead><tbody>
    ${v.planets.map((x) => `<tr><td>${esc(x.planet)}${x.retrograde && !['Rahu', 'Ketu'].includes(x.planet) ? ' (R)' : ''}</td><td>${esc(x.signName)}</td><td>${esc(x.degree)}</td><td>${esc(x.nakshatra)} ${esc(x.pada)}</td><td>${esc(x.house)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="card"><h2>Vimshottari dasha</h2><table><thead><tr><th>Mahadasha</th><th>From</th><th>To</th></tr></thead><tbody>
    ${v.dasha.periods.map((d) => `<tr${cur?.mahadasha === d.lord ? ' class="q-best"' : ''}><td>${esc(d.lord)}</td><td>${esc(d.start)}</td><td>${esc(d.end)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

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
const factsHtml = (facts) => `<ul>${facts.map((f) => `<li><strong>${esc(f.fact)}</strong>: ${esc(f.meaning)} <small class="muted">(${esc(f.source)})</small></li>`).join('')}</ul>`;

async function onPalm(e) {
  const file = e.target.files[0]; if (!file) return;
  const out = $('#palmOut');
  if (!state.me.user) { openSignin('Sign in to read your palm lines. Your first scan is free.'); e.target.value = ''; return; }
  if (!current()) { out.innerHTML = '<div class="card upsell">Add your birth details in Kundli first, so the scan is saved to your profile.</div>'; return; }
  out.innerHTML = '<p class="muted">Finding your hand…</p>';
  const canvas = await loadImage(file, $('#palmCanvas'));
  let lms = null;
  try { lms = (await landmarker('hand')).detect(canvas).landmarks?.[0] || null; if (lms) dots(canvas, lms, '#f08a3e'); } catch { /* on-device model unavailable */ }
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const fd = new FormData(); fd.append('photo', blob, 'palm.jpg'); fd.append('profileId', current().id);
  if (lms) fd.append('landmarks', JSON.stringify(lms.map(({ x, y }) => ({ x, y }))));
  out.innerHTML = '<p class="muted">Reading your lines…</p>';
  try {
    const r = await post('/api/palm', fd);
    if (r.lines?.warning) { out.innerHTML = `<p class="q-bad">${esc(r.lines.warning)} Retake with your open palm filling the frame.</p>`; return; }
    state.palm = r.palm;
    out.innerHTML = `${r.lines?.photoQuality === 'poor' ? '<p class="q-neutral">Photo is dark or blurry, so some lines were skipped. Retake in daylight for a fuller reading.</p>' : ''}
      <h3>${esc(r.palm.handType ? `${r.palm.handType} hand` : 'Your palm')}</h3>${factsHtml(r.palm.facts)}<p class="hint">Saved to ${esc(current().name)}. Photo deleted after reading.</p>`;
    await refreshMe();
  } catch (err) { showError(out, err); }
}

async function onFace(e) {
  const file = e.target.files[0]; if (!file || !$('#faceConsent').checked) return;
  const out = $('#faceOut'); out.innerHTML = '<p class="muted">Measuring proportions on your device…</p>';
  const canvas = await loadImage(file, $('#faceCanvas'), 960);
  try {
    const lms = (await landmarker('face')).detect(canvas).faceLandmarks?.[0];
    if (!lms) { out.innerHTML = '<p class="q-bad">No face found. Face the camera straight on in even light.</p>'; return; }
    dots(canvas, lms.filter((_, i) => i % 6 === 0), '#6fe0d4');
    const r = await post('/api/face', { consent: true, profileId: current()?.id, landmarks: lms.map(({ x, y }) => ({ x, y })) });
    state.face = { faceType: r.faceType, facts: r.facts };
    out.innerHTML = `<h3>${esc(r.faceType)} face type</h3>${factsHtml(r.facts)}<p class="hint">Only measurements were sent. Your photo never left this device.</p>`;
    if (state.me.user) await refreshMe();
  } catch (err) { showError(out, err); }
}

// ---------- reading + chat ----------
function updateSources() {
  const p = current();
  const s = [['Birth chart', !!p], ['Palm', !!(p?.hasPalm || state.palm)], ['Face', !!(p?.hasFace || state.face)]];
  $('#sources').innerHTML = s.map(([n, ok]) => `<span class="chip${ok ? ' ok' : ''}">${ok ? '✓' : '+'} ${n}</span>`).join('');
}
async function loadSavedReading() {
  const p = current(); if (!p?.hasReading) return;
  try {
    const r = await api(`/api/reading/${p.id}`);
    if (r?.text) { $('#reading').hidden = false; $('#reading').textContent = r.text; $('#chatCard').hidden = false; $('#shareBtn').hidden = false; chatAllowance(); }
  } catch { /* ignore */ }
}
function chatAllowance() {
  const a = state.me.allowance?.chat; $('#chatLeft').textContent = a ? `${Math.max(0, a.max - a.used)} questions left this month` : '';
}
async function onReading() {
  if (!state.me.user) { openSignin('Sign in for your combined reading. Your first one is free.'); return; }
  if (!current()) { switchTab('chart'); return; }
  const el = $('#reading'); el.hidden = false; el.textContent = 'Writing your reading…';
  try {
    const r = await post('/api/reading', { profileId: current().id, language: $('#lang').value, location: loc() });
    el.textContent = r.text; state.facts = r.facts; state.history = [];
    if (r.kind === 'teaser') {
      el.insertAdjacentHTML('beforeend', '<p><button class="primary" id="fullUp">Unlock the full reading: love, career, current phase</button></p>');
      $('#fullUp').addEventListener('click', () => openPlans('The full palm + face + chart reading is part of Premium.'));
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
  g.fillStyle = '#f0b27a'; g.font = '700 64px Fraunces, serif'; g.fillText(`${p.name}'s Rekha reading`, 80, 160);
  g.fillStyle = '#ffffff'; g.font = '500 40px Inter, sans-serif';
  const lines = [p.natal && `Moon sign: ${p.natal.rashi}`, p.natal && `Nakshatra: ${p.natal.nakshatra}`, p.natal && `Ascendant: ${p.natal.lagna}`,
    state.palm?.handType && `${state.palm.handType} hand`, state.face?.faceType && `${state.face.faceType} face type`].filter(Boolean);
  lines.forEach((t, i) => g.fillText(t, 80, 300 + i * 80));
  g.fillStyle = '#f0b27a'; g.font = '500 34px Inter, sans-serif'; g.fillText(`Get yours free at ${location.host}`, 80, 1250);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'rekha-reading.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file], title: 'My Rekha reading' }).catch(() => {});
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
    if (!f.bDate.value || !f.gDate.value) { out.innerHTML = '<div class="card q-bad">Enter both birth dates.</div>'; return; }
    boy = birthFrom(f.bDate.value, f.bTime.value || '12:00', f.bCity.value); girl = birthFrom(f.gDate.value, f.gTime.value || '12:00', f.gCity.value);
  }
  out.innerHTML = '<p class="muted">Matching…</p>';
  try {
    const r = await post('/api/match', { boy, girl, narrate: isPaid(), language: $('#lang').value });
    const g = r.gunMilan;
    out.innerHTML = `<div class="card"><div class="score">${esc(g.total)} / 36</div><div>${pill(g.total >= 25 ? 'good' : g.total >= 18 ? 'neutral' : 'bad', g.verdict)}</div>
      <table><thead><tr><th>Koota</th><th>Score</th><th>Area</th></tr></thead><tbody>${g.kootas.map((k) => `<tr><td>${esc(k.koota)}</td><td>${esc(k.score)} / ${esc(k.max)}</td><td>${esc(k.area)}</td></tr>`).join('')}</tbody></table>
      <p>Manglik: ${esc(r.manglik.boy)} / ${esc(r.manglik.girl)}. ${g.doshas.length ? `Doshas: ${esc(g.doshas.join(', '))}.` : 'No major doshas.'}</p>
      <p class="hint">${esc(g.note)}</p></div>
      ${r.reading ? `<article class="card prose">${esc(r.reading)}</article>` : `<div class="card upsell">Want this explained in plain words in your language? <button class="linkish" id="matchUp">Premium ›</button></div>`}`;
    $('#matchUp')?.addEventListener('click', () => openPlans('Detailed match explanations are part of Premium.'));
  } catch (err) { showError(out, err); }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
boot().catch((e) => showError($('#nowCard'), e));
