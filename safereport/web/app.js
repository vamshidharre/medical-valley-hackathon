/* SafeReport — mobile ICSR reporter. Vanilla JS, no build step.
   Works fully offline with simulated AI; if /api/health reports Claude, real OCR + LLM are used. */
(() => {
const $ = (s, el = document) => el.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- icons ---------- */
const P = {
  camera: '<path d="M4 11.5v-2a2 2 0 012-2h2l1.5-2h5L16 7.5h2a2 2 0 012 2V17a2 2 0 01-2 2H6a2 2 0 01-2-2v-2.5"/><circle cx="12" cy="13" r="3.2"/><path d="M17 10.5h.01"/>',
  upload: '<path d="M12 15V4.5M8 8.5l4-4 4 4"/><path d="M4 14v3.5A2.5 2.5 0 006.5 20h7.5M17 20h.5a2.5 2.5 0 002.5-2.5V14"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M14 14h2.5M20 14v2.5M14 18v2M17.5 20H20M17 17h.01"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.6-3.8 3.6-6 7.5-6 2.2 0 4.1.7 5.4 1.9"/><path d="M19.2 18.6c.2.6.3 1.2.3 1.9"/>',
  doc: '<path d="M9 4.5H7a2 2 0 00-2 2V19a2 2 0 002 2h10a2 2 0 002-2V6.5a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="3.2" rx="1.2"/><path d="M8.5 11h7M8.5 14.5h5M8.5 18h1.5M12.5 18h.01"/>',
  steth: '<path d="M5 3.5h2M13 3.5h2M6 3.5v5a4 4 0 008 0v-5"/><path d="M10 12.5V15a4.5 4.5 0 009 0v-2"/><circle cx="19" cy="10.5" r="2"/>',
  pill: '<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M9 8l6 8" />',
  bag: '<rect x="6" y="3" width="12" height="4" rx="1.2"/><path d="M7 7v11.5A2.5 2.5 0 009.5 21h5a2.5 2.5 0 002.5-2.5V7"/><path d="M12 11v5M9.5 13.5h5M9.5 18.5H11"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6 1.4 0 2.7.4 3.8 1.1"/><path d="M15.5 4.8a3.5 3.5 0 010 6.4M17.5 14.3c2.3.7 4 2.6 4 5.7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  keyboard: '<path d="M7 18H5.5a3 3 0 01-3-3V9a3 3 0 013-3h13a3 3 0 013 3v6a3 3 0 01-3 3H10"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h6M17 14h.01"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
  flip: '<path d="M4 7h12l-3-3M20 17H8l3 3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  bell: '<path d="M6 16v-5a6 6 0 1112 0v5l1.5 2h-15zM10 20.5a2 2 0 004 0"/>',
  shield: '<path d="M8.5 4.4L12 3l7.5 3v5.5c0 4.7-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.8-7.5-9.5V6l1.2-.5"/><path d="M9 12l2 2 4-4"/>',
  chat: '<path d="M20 12.5V7a3 3 0 00-3-3H7a3 3 0 00-3 3v7a3 3 0 003 3h1.5v3l4-3H17a3 3 0 002.2-1"/><path d="M8 9h6M8 12.5h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/><path d="M8.2 9.3a3.3 3.3 0 012-1.7"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 017.6-1.8"/><path d="M12 14.5v2.5"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M4 8l8 5.5L20 8"/><path d="M6.5 15.5h1.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5c-2.4 0-4.4-1-6-2.3"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M4 4l16 16"/><path d="M9.5 6a8.6 8.6 0 012.5-.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-2.6 3.4M14.1 14.2A3 3 0 019.8 9.9M6.5 7.6C4 9.3 2.5 12 2.5 12S6 18.5 12 18.5c1.4 0 2.6-.3 3.7-.8"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M10.4 3.6l-.4 2a6.6 6.6 0 00-1.6.9l-1.9-.7-1.6 2.8 1.5 1.3a6.7 6.7 0 000 1.8l-1.5 1.3 1.6 2.8 1.9-.7c.5.4 1 .7 1.6.9l.4 2h3.2l.4-2c.6-.2 1.1-.5 1.6-.9l1.9.7 1.6-2.8-1.5-1.3a6.7 6.7 0 000-1.8l1.5-1.3-1.6-2.8-1.9.7a6.600 6.600 0 00-1.6-.9l-.4-2z"/>',
  leaf: '<path d="M5 19c0-8.5 5.5-14 15-14 0 6-2.3 10.6-6.5 12.8"/><path d="M5 19l8-8"/><path d="M10 19.2c-1.8.3-3.4.1-5-.2"/>',
  building: '<path d="M4 21V8.5L12 4l8 4.5V21"/><path d="M2.5 21h4M9 21h12.5"/><path d="M12 9v4M10 11h4"/><path d="M10 21v-3.5h4V21"/>',
};
/* AI identifiers: the AI colour (violet) plus an everyday icon wearing a sparkle mark wherever the AI acts */
const SPARK = 'M18.5 1.2l1.1 2.7 2.7 1.1-2.7 1.1-1.1 2.7-1.1-2.7-2.7-1.1 2.7-1.1z';
const aiIc = n => `<svg class="ic aiic" viewBox="0 0 24 24">${P[n]}<path class="knock" d="${SPARK}"/><path class="spk" d="${SPARK}"/></svg>`;
const aiBadge = (txt = 'AI helper') => `<button class="aib" data-act="aiinfo" aria-label="${txt}: how the AI helps">${ic('spark')}${txt}</button>`;
const CROSS = `<svg viewBox="0 0 220 220" aria-hidden="true"><defs>
  <linearGradient id="cf" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="190"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d9e2f1"/></linearGradient>
  <linearGradient id="cs" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="210"><stop offset="0" stop-color="#c9d3e6"/><stop offset="1" stop-color="#9eacc8"/></linearGradient></defs>
  <g transform="translate(16 22)" fill="url(#cs)"><rect x="62" y="0" width="76" height="190" rx="26"/><rect x="0" y="62" width="200" height="76" rx="26"/></g>
  <g fill="url(#cf)"><rect x="62" y="0" width="76" height="190" rx="26"/><rect x="0" y="62" width="200" height="76" rx="26"/></g></svg>`;
const HL = { name: ['Medicine name', '#1a7bff'], dose: ['Dose / strength', '#22b07d'], batch: ['Batch number', '#f59e0b'], mfr: ['Manufacturer', '#7c5cff'] };
const BOXKEY = { name: 'name', dose: 'dose', batch: 'batch', mfr: 'manufacturer' };
const ic = n => `<svg class="ic" viewBox="0 0 24 24">${P[n]}</svg>`;
const backBtn = act => `<button class="avatar" data-act="${act}" aria-label="Back">${ic('back')}</button>`;
const LOGO = `<div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${P.shield}</svg></div>`;

/* ---------- state ---------- */
const FIELDS = [
  ['reaction', 'Adverse event'], ['onset', 'Onset date'], ['initials', 'Patient initials'], ['age', 'Age'], ['sex', 'Sex'],
  ['severity', 'Severity'], ['action', 'Action taken'], ['outcome', 'Outcome'], ['otherMeds', 'Other medicines'],
];
// Short, plain labels for the role picker; the stored role values stay the same
const ROLE_LABEL = { Patient: 'Patient', Doctor: 'Doctor', Chemist: 'Pharmacist', 'Other HCP': 'Nurse & other' };
const roleHint = r => { const d = ROLES.find(x => x[0] === r); return d ? d[2] : 'Tap the one that fits you.'; };
const ROLES = [
  ['Patient', 'user', 'I took the medicine'], ['Doctor', 'steth', 'Registered physician'],
  ['Chemist', 'bag', 'Pharmacist / chemist'], ['Other HCP', 'people', 'Nurse, dentist, etc.'],
];
const STEPS = [['capture', 'Capture'], ['details', 'Details'], ['chat', 'Chat'], ['review', 'Review'], ['report', 'Report']];
const S = {
  screen: 'signup', profile: null, med: { name: '', dose: '', batch: '', mfr: '', source: '' }, photo: null,
  eco: (() => { try { return localStorage.getItem('safereport.eco') === 'true'; } catch { return false; } })(),
  msgs: [], fields: {}, tries: {}, asked: null, speaker: 'patient', busy: false, capOpen: true,
  scanSeq: 0, returnTo: null, edit: { rep: false, ev: false }, consent: false, report: null, stage: 0, follow: [], followIdx: 0, timers: [], live: false, canExtract: false, ocrName: '', notified: false,
};
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const isPatient = () => S.profile?.role === 'Patient';
const company = () => S.med.mfr || 'the manufacturer';
/* Role-based wording: patients see everyday words; doctors, chemists and other HCPs keep the
   pharmacovigilance terms they already use. The report sent to the company is the same either way. */
const PLAIN = {
  reaction: 'What happened', onset: 'When it started', initials: 'Your initials', age: 'Your age', sex: 'Sex',
  severity: 'How bad it is', action: 'What you did with the medicine', outcome: 'How you feel now', otherMeds: 'Other medicines',
};
const fieldLabel = k => isPatient() ? PLAIN[k] : FIELDS.find(f => f[0] === k)[1];
const say = (plain, pro) => isPatient() ? plain : pro;
const callName = n => { const w = n.trim().split(/\s+/); return /^(dr|prof)\.?$/i.test(w[0]) && w[1] ? w[0] + ' ' + w[1] : w[0]; };
const STEP_PLAIN = { capture: 'Medicine', details: 'Check', chat: 'Questions', review: 'Send', report: 'Sent' };

/* ---------- shell ---------- */
const screen = $('#screen'), nav = $('#progress'), notif = $('#notif');

function go(name) {
  if (S.screen === 'chat' && name !== 'chat') haltVoice();
  const changed = name !== S.screen;
  S.screen = name;
  screen.className = 'screen' + (changed ? ' enter' : '') + (name === 'chat' ? ' chat' : '') + (name === 'welcome' ? ' welcome' : '');
  $('#phone').classList.toggle('on-blue', name === 'welcome');
  $('#phone').classList.toggle('on-dark', name === 'signin');
  $('#phone').dataset.screen = name;
  const fn = { welcome, signin, signup, capture, details, symptom, chat, review, report, followup }[name];
  screen.innerHTML = fn();
  screen.scrollTop = 0;
  bind(name);
  renderNav();
}

const NAVICON = { capture: 'camera', details: 'doc', chat: 'people', review: 'shield', report: 'check' };
function renderNav() {
  const idx = STEPS.findIndex(s => s[0] === (S.screen === 'symptom' ? 'chat' : S.screen));   // symptom search is the start of the Chat step
  nav.hidden = idx < 0;
  if (idx < 0) return;
  nav.innerHTML = STEPS.map(([k, label], i) => {
    const cls = i < idx ? 'done' : i === idx ? 'now' : '';
    const badge = k === 'followup' && S.notified && S.screen !== 'followup' ? '<b class="badge"></b>' : '';
    const lb = say(STEP_PLAIN[k] || label, label);
    return `<div class="pn ${cls}" title="Step ${i + 1} of ${STEPS.length}: ${lb}">${i < idx ? ic('check') : k === 'chat' ? aiIc('chat') : ic(NAVICON[k])}<span>${lb}</span>${badge}</div>`;
  }).join('');
}

document.addEventListener('click', e => {
  if (e.target.matches('input,textarea,select')) return;
  const t = e.target.closest('[data-act]');
  if (t && !t.disabled) actions[t.dataset.act]?.(t, e);
});

/* ---------- 0. welcome ---------- */
/* The glass orb is SafeReport AI's face: shown wherever the assistant speaks or is introduced */
const orb = (size = 'md') => `<span class="pill-logo pl-${size}" aria-hidden="true"></span>`;   // medicine (capsule) logo
const arrow = () => ic('back').replace('<path d="M15 5l-7 7 7 7"/>', '<path d="M9 5l7 7-7 7"/>');

/* Welcome art: a capsule drifts in, splits open and its granules pour out into a small pile.
   Plays once (under 5 s, WCAG 2.2.2); with reduced motion the open capsule is shown at rest. */
const GRAINS = [[-34, 70, 9], [-18, 78, 11], [0, 74, 10], [18, 80, 12], [36, 72, 9], [-26, 88, 10], [-8, 92, 12], [10, 90, 11], [28, 88, 10],
  [-16, 102, 9], [2, 104, 11], [20, 102, 9], [-44, 84, 7], [46, 86, 8], [-4, 60, 8], [8, 114, 8]];
function capsule() {
  return `<div class="capsule" aria-hidden="true">
    <div class="cap-tilt"><span class="half glass"><i></i></span><span class="half shell"></span></div>
    <div class="grains">${GRAINS.map(([x, y, s], i) => `<i style="--x:${x}px;--y:${y}px;--s:${s}px;--d:${(1.75 + i * 0.07).toFixed(2)}s"${i % 5 === 3 ? ' class="g"' : ''}></i>`).join('')}</div></div>`;
}

function welcome() {
  return `<div class="wel-art"><span class="ring r1"></span><span class="ring r2"></span>${capsule()}</div>
  <h1>Adverse drug reaction?</h1>
  <p>Tell the company that makes it in a few minutes. Our AI helps with the questions; you check before sending.</p>
  <button class="getstarted" data-act="start"><i class="spark">${ic('spark')}</i><span>Start to report</span><b>${arrow()}</b></button>`;
}

/* ---------- 1. sign up ---------- */
/* Accounts live on this device only (no backend). The PIN is stored as a salted hash. */
const acctKey = c => String(c).trim().toLowerCase().replace(/[\s\-()]/g, '');
const accounts = () => store.get('safereport.accounts') || {};
async function hashPin(pin, salt) {
  const data = salt + ':' + pin;
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const ch of data) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;   // fallback on insecure origins
  return 'f' + h.toString(16);
}
const blank = () => ({ role: '', name: '', contact: '', country: '', pin: '' });
let draft = blank();
let sign = { contact: '', pin: '' };
const err = (id, msg) => { const e = $(id); if (e) { e.textContent = msg; e.hidden = !msg; } };

function signin() {
  // Dark green header with the greeting and our heart, then a white rounded sheet with the form (golden split 38.2 : 61.8)
  return `
  <div class="si2-top"><button class="avatar" data-act="gowelcome" aria-label="Back">${ic('back')}</button>
    <div class="si2-text"><h1>Sign in</h1><p>Report a side effect safely. Your PIN stays on this phone.</p></div></div>
  <div class="si2-sheet">
    <label class="label" for="si-contact">Phone or email</label>
    <div class="ifield">${ic('mail')}<input id="si-contact" data-si="contact" autocomplete="username" placeholder="The one you signed up with" value="${esc(sign.contact)}"></div>
    <label class="label" for="si-pin">PIN</label>
    <div class="ifield">${ic('lock')}<input id="si-pin" data-si="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" placeholder="4 to 6 digits" value="${esc(sign.pin)}">
      <button type="button" class="eye" data-act="sipeek" aria-label="Show PIN" aria-pressed="false">${ic('eye')}</button></div>
    <div class="forgot"><button class="link" data-act="siforgot">Forgot your PIN?</button></div>
    <p class="hint" id="si-err" style="color:var(--red);font-weight:600" hidden></p>
    <div class="si2-cta"><button class="btn primary login" id="si-btn" data-act="signIn" disabled>Login</button>
      <button class="link" data-act="gosignup">New here? Create an account</button></div>
  </div>`;
}

function signup() {
  return `
  <div class="top" style="padding-bottom:0">${backBtn('signupback')}</div>
  <div class="top"><div><h1>Create your account</h1><p>Report a medicine side effect in minutes.</p></div></div>
  <div class="card"><h3>Who are you?</h3>
    <div class="rolerow" role="radiogroup" aria-label="Who are you?">${ROLES.map(([r, i]) => `<button class="rolec ${draft.role === r ? 'on' : ''}" role="radio" aria-checked="${draft.role === r}" data-act="role" data-v="${r}"><span class="rc">${ic(i)}</span><b>${ROLE_LABEL[r]}</b></button>`).join('')}</div>
    <p class="rolehint" id="rolehint" aria-live="polite">${roleHint(draft.role)}</p>
    <label class="label" for="su-name">Full name</label>
    <input class="input" id="su-name" data-bind="name" autocomplete="name" placeholder="e.g. Asha Verma" value="${esc(draft.name)}">
    <label class="label" for="su-contact">Phone or email</label>
    <input class="input" id="su-contact" data-bind="contact" autocomplete="username" placeholder="So the company can follow up" value="${esc(draft.contact)}">
    <label class="label" for="su-country">Country <span style="font-weight:500;color:var(--ink-2)">(optional)</span></label>
    <input class="input" id="su-country" data-bind="country" autocomplete="country-name" placeholder="e.g. India" value="${esc(draft.country)}">
    <label class="label" for="su-pin">Create a PIN</label>
    <input class="input" id="su-pin" data-bind="pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" placeholder="4 to 6 digits" value="${esc(draft.pin)}" aria-describedby="su-pinhint">
    <p class="hint pinhint" id="su-pinhint" aria-live="polite">${pinHint(draft.pin)}</p>
    <p class="hint" id="su-err" style="color:var(--red);font-weight:600" hidden></p>
    <p class="hint">Saved on this device only. You will use your phone or email and PIN to sign in.</p>
  </div>
  <div class="footer"><button class="btn primary" id="su-save" data-act="saveProfile" disabled>Create account</button>
    <button class="link" data-act="gosignin">Already have an account? Sign in</button></div>`;
}

/* ---------- 2. capture ---------- */
function capture() {
  const p = S.profile;
  // Simple picker: one question from the mascot, four ways to add the medicine, then Continue
  const OPTS = [['camera', 'camera', 'Take a photo', true], ['upload', 'upload', 'Upload a photo', true], ['qr', 'qr', 'Scan the QR code', false], ['manual', 'keyboard', 'Type it in', false]];
  S.pick = OPTS.some(o => o[0] === S.pick) ? S.pick : null;
  return `
  <div class="pk-top"><span class="grow"></span><button class="avatar gearbtn" data-act="settings" aria-label="Settings">${ic('gear')}</button></div>
  <div class="pk-hero"><p class="bubble" id="pk-q">Which medicine was it?</p><span class="mascot">${capsule()}</span></div>
  <div class="pk-sheet">
    <div class="pk-list" role="radiogroup" aria-labelledby="pk-q">${OPTS.map(([a, e, l, ai]) => `<button class="pk ${S.pick === a ? 'on' : ''}" role="radio" aria-checked="${S.pick === a}" data-act="pick" data-v="${a}"><span class="pk-e ${ai ? 'ai' : ''}" aria-hidden="true">${ai ? aiIc(e) : ic(e)}</span><b>${l}</b>${ai ? `<span class="aitag">${ic('spark')}AI<span class="sr"> reads it</span></span>` : ''}</button>`).join('')}</div>
    <button class="btn primary" id="pk-go" data-act="pickgo" ${S.pick ? '' : 'disabled'}>Continue</button>
  </div>`;
}

function scanning(imgUrl, label) {
  screen.className = 'screen enter';
  S.screen = 'capture'; renderNav();
  screen.innerHTML = `<div class="top"><div class="grow"><h1>Reading your pack</h1><p>${aiBadge('AI')} ${label}</p></div></div>
  <div class="card scan-card">${imgUrl ? `<img class="scanimg" src="${imgUrl}" alt="Medicine pack">` : ''}<div class="pulse ai"></div>
    <div class="steps-l" id="scan-steps">
      <div class="now">● Reading the label</div><div>○ Finding the medicine details</div><div>○ Checking batch and manufacturer</div></div></div>
  <div class="footer"><button class="btn line" data-act="cancelscan">Cancel</button></div>`;
}
async function scanProgress() {
  const rows = [...document.querySelectorAll('#scan-steps div')];
  const labels = ['Reading the label', 'Finding the medicine details', 'Checking batch and manufacturer'];
  for (let i = 0; i < rows.length; i++) {
    rows.forEach((r, j) => { r.className = j < i ? 'done' : j === i ? 'now' : ''; r.textContent = (j < i ? '✓ ' : j === i ? '● ' : '○ ') + labels[j]; });
    await sleep(650);
  }
}

const SAMPLES = [
  { name: 'Zumenon', dose: '2 mg tablet', batch: 'ZM2406B', mfr: 'Abbott Healthcare' },
  { name: 'Paracetamol IP 500 mg', dose: '500 mg tablet', batch: 'PCM-24117', mfr: 'Cipla Ltd' },
  { name: 'Amoxicillin 250 mg', dose: '250 mg capsule', batch: 'AX250-0932', mfr: 'Sun Pharmaceutical' },
];
let sampleN = 0;

const measure = url => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth / i.naturalHeight || 1.4); i.onerror = () => r(1.4); i.src = url; });
async function runExtract({ file, qr, label }) {
  const seq = ++S.scanSeq;
  const url = file ? URL.createObjectURL(file) : null;
  S.photo = url;
  scanning(url, label);
  const prog = scanProgress();
  S.photoAR = url ? await measure(url) : 1.4;
  let med = null, err = '';
  const readFail = 'We could not read this photo right now. Please try again, or enter the details yourself.';
  if (file) {                                   // a real photo is NEVER replaced by sample data
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/extract', { method: 'POST', body: fd });
      if (r.ok) {
        const j = await r.json();
        med = { name: j.name, dose: j.dose, batch: j.batch, mfr: j.manufacturer, boxes: j.boxes || {}, source: 'Read from your photo' };
        S.canExtract = true;
      } else {
        const errJson = await r.json().catch(() => ({}));
        console.warn('Extract API error:', r.status, errJson);
        err = r.status === 422 ? 'We could not find any readable text. Try again in good light with the label filling the frame.' : (errJson.detail || readFail);
      }
    } catch (e) {
      console.error('Fetch /api/extract error:', e);
      err = readFail;
    }
  } else {
    const s = qr || SAMPLES[sampleN++ % SAMPLES.length];
    med = { ...s, raw: '', source: qr ? 'Read from QR code' : 'Sample medicine' };
  }
  await prog;
  if (seq !== S.scanSeq) return;                 // cancelled
  resetConversation();
  if (!med) { S.med = { name: '', dose: '', batch: '', mfr: '', raw: '', source: '' }; return scanFailed(err); }
  S.med = med;
  go('details');
}
function resetConversation() { S.msgs = []; S.fields = {}; S.tries = {}; S.sym = null; S.asked = null; S.narrEdited = false; S.returnTo = null; }
function scanFailed(err) {
  screen.className = 'screen enter';
  screen.innerHTML = `<div class="top">${backBtn('back-capture')}<div class="grow"><h1>Couldn't read the pack</h1><p>Let's try that again.</p></div></div>
  <div class="card">${S.photo ? `<img class="scanimg" src="${S.photo}" alt="Your photo">` : ''}<p class="narr">${esc(err)}</p>
  <p class="hint">Tips: good light, hold the camera steady, fill the frame with the label, avoid glare.</p></div>
  <div class="footer stack"><button class="btn primary" data-act="camera">${ic('camera')} Retake photo</button>
  <button class="btn line" data-act="manual">Enter details manually</button></div>`;
}

/* ---------- 3. details ---------- */
const hasBox = k => !!(S.med.boxes && S.med.boxes[BOXKEY[k]] && S.med[k]);
function hlImage(maxH = '300px') {
  const bx = S.med.boxes || {}, pad = 0.006;
  const marks = Object.keys(HL).filter(hasBox).map((k, i) => {
    const b = bx[BOXKEY[k]], x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad), x1 = Math.min(1, b.x1 + pad), y1 = Math.min(1, b.y1 + pad);
    return `<div class="hl ${y0 < 0.08 ? 'low' : ''}" data-k="${k}" style="left:${x0 * 100}%;top:${y0 * 100}%;width:${(x1 - x0) * 100}%;height:${(y1 - y0) * 100}%;--c:${HL[k][1]};--d:${0.15 + i * 0.12}s"><span>${HL[k][0]}</span></div>`;
  }).join('');
  return `<div class="hl-box" data-act="zoom" style="width:min(100%,calc(${maxH} * ${S.photoAR || 1.4}))"><img src="${S.photo}" alt="Your medicine pack">${marks}</div>`;
}
const hlLegend = () => `<div class="legend">${Object.keys(HL).filter(hasBox).map(k => `<button class="lg" style="--c:${HL[k][1]}" data-act="hlfocus" data-k="${k}"><i></i>${HL[k][0]}</button>`).join('')}</div>`;

function details() {
  const m = S.med, anyBox = Object.keys(HL).some(hasBox);
  const f = (k, label, ph) => `<label class="label" for="d-${k}">${anyBox && hasBox(k) ? `<i class="cdot" style="--c:${HL[k][1]}"></i>` : ''}${label}</label><input class="input" id="d-${k}" data-med="${k}" placeholder="${ph}" value="${esc(m[k])}">`;
  return `
  <div class="top">${backBtn('back-capture')}<div><h1>Check the details</h1><p>${m.source && m.source !== 'Entered manually' ? `${aiBadge('AI')} read these from your pack. Fix anything it got wrong.` : 'Fill in what you can see on the pack.'}</p></div></div>
  ${S.photo ? `<div class="card hl-card">${hlImage()}${anyBox ? hlLegend() : ''}<p class="hint">${anyBox ? 'Colours show where each detail was found on your pack. Tap the photo to enlarge.' : 'Your photo. Tap it to enlarge.'}</p></div>` : ''}
  <div class="card">
    ${m.source && m.source !== 'Entered manually' ? `<span class="pill ${/QR/.test(m.source) ? 'g' : 'ai'}">${(/QR/.test(m.source) ? ic('check') : ic('spark')).replace('class="ic"', 'class="ic" style="width:14px;height:14px"')} ${esc(m.source)}</span>` : ''}
    ${f('name', 'Medicine name', 'e.g. Paracetamol')}${f('dose', 'Dose / strength', 'e.g. 500 mg tablet')}
    ${f('batch', 'Batch number', 'Printed near the expiry date')}${f('mfr', 'Manufacturer', 'Company on the pack')}
    ${['name', 'dose', 'batch', 'mfr'].some(k => !m[k]) && /^Read from/.test(m.source) ? '<p class="hint" style="color:var(--amber);font-weight:600">Some fields could not be read — please fill them in.</p>' : '<p class="hint">The batch number helps the company trace the exact lot.</p>'}
    </div>
  <div class="footer"><button class="btn green" id="confirm" data-act="confirm" ${m.name.trim() ? '' : 'disabled'}>${ic('check')} ${S.returnTo ? 'Save changes' : 'Confirm details'}</button></div>`;
}

/* ---------- 3b. symptom search (patients): pick plain-language symptoms instead of typing them ---------- */
/* Symptom icons in the same line style as the UI icons (2px round strokes, small breaks, spark marks) */
const SIC = {
  head: '<path d="M8 20.5v-3.3A6.5 6.5 0 115.5 11c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5c0 .9.6 1.5 1.2 2.3.4.6 0 1.2-.7 1.2H18v2a2 2 0 01-2 2h-1.5v2"/><path d="M11.5 7.5l-1.5 2.8h2.6L11 13"/><path d="M2.5 5.5l1.5 1M4 3l.8 1.6"/>',
  nausea: '<circle cx="12" cy="12" r="8.5"/><path d="M9 10h.01M15 10h.01"/><path d="M8 15.5c1-1 2-1 3 0s2 1 3 0 1.5-.8 2 0"/>',
  vomit: '<path d="M17.8 8.5A7.5 7.5 0 1011 18.5"/><path d="M8.5 9h.01M13.5 9h.01M9.5 13.5h3"/><path d="M18.5 13c1.2 1.6 1.8 2.6 1.8 3.5a1.8 1.8 0 01-3.6 0c0-.9.6-1.9 1.8-3.5z"/>',
  dizzy: '<circle cx="12" cy="12" r="8.5"/><path d="M7 10a1.5 1.5 0 103 0 2.4 2.4 0 10-4.8 0M14 10a1.5 1.5 0 103 0 2.4 2.4 0 10-4.8 0"/><path d="M9.5 16h5"/>',
  rash: '<path d="M8 4h8a4 4 0 014 4v8a4 4 0 01-4 4H8a4 4 0 01-4-4v-5"/><path d="M4 8a4 4 0 012-3.4"/><path d="M9 9h.01M14.5 8.5h.01M12 12.5h.01M8.5 15.5h.01M15.5 15.5h.01"/>',
  itch: '<path d="M8 13V6.5a1.5 1.5 0 013 0V12M11 11V5a1.5 1.5 0 013 0v6M14 11V6.5a1.5 1.5 0 013 0V14a7 7 0 01-7 7h-.5a6 6 0 01-5-2.7L3 15.5a1.5 1.5 0 012.6-1.5L8 16"/><path d="M19.5 4l1.2-1.2M20.2 7.5h1.6"/>',
  hives: '<path d="M3 19h3M9 19h12"/><path d="M5 19a3 3 0 016 0M11 19a2.5 2.5 0 015 0M16 19a2.5 2.5 0 015 0"/><path d="M8 10.5l1 1M12 8v-2M16 10.5l-1 1"/>',
  stomach: '<path d="M13.5 3.5V6c0 1.5 1 2.5 2.5 3a4 4 0 012.8 4c0 4.4-3.6 7.5-8 7.5-2.5 0-4.5-1.5-4.5-3.5s1.5-3 3.5-3c1.5 0 2.7-1 2.7-2.5V3.5"/><path d="M9 3.5h1"/>',
  drops: '<path d="M8 4c1.8 2.4 2.7 4 2.7 5.2a2.7 2.7 0 01-5.4 0C5.3 8 6.2 6.4 8 4zM16 9c1.8 2.4 2.7 4 2.7 5.2a2.7 2.7 0 01-5.4 0c0-1.2.9-2.8 2.7-5.2z"/><path d="M4 20h3.5M10 20h10"/>',
  knot: '<path d="M13.5 3.5V6c0 1.5 1 2.5 2.5 3a4 4 0 012.8 4c0 4.4-3.6 7.5-8 7.5-2.5 0-4.5-1.5-4.5-3.5s1.5-3 3.5-3c1.5 0 2.7-1 2.7-2.5V3.5"/><path d="M18 2.5l2 2M20 2.5l-2 2"/>',
  battery: '<path d="M14 7.5h2.5A2.5 2.5 0 0119 10v4a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 013 14v-4a2.5 2.5 0 012.5-2.5H11"/><path d="M21.5 10.5v3M6.5 11v2"/>',
  moonz: '<path d="M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z"/><path d="M15 3h3.5L15 6.5h3.5"/>',
  moon: '<path d="M18 15A7 7 0 019 6a7 7 0 109 9z"/><path d="M14.5 4h.01M20 8.5h.01M17.5 5h.01"/>',
  arm: '<path d="M3.5 19.5c3 0 5-1 6-3 2 1.5 5 1.5 7-.5 2-2 2-5.5-.5-6.5-1.5-.6-3 0-3.5 1.5l-.5 2c-1-1.5-1.5-3-1-5l1-3.5c.2-.8-.4-1.5-1.2-1.5H8.5L6.5 7"/><path d="M14.5 13.5l1.5-.5"/>',
  bone: '<path d="M8.5 6a2.5 2.5 0 10-3 3 2.5 2.5 0 103 3l3.5 3.5M15 18a2.5 2.5 0 103 3 2.5 2.5 0 103-3 2.5 2.5 0 10-3-3l-6-6"/>',
  spine: '<path d="M12 3v3M12 9v12"/><path d="M9 5.5h6M8.5 9.5h7M9 13.5h6M9.5 17.5h5"/>',
  cough: '<path d="M16 7A7 7 0 104 12a7 7 0 0012 5"/><path d="M15.5 10.5h.01"/><path d="M18.5 9.5l2-1M19 12h2.5M18.5 14.5l2 1"/>',
  heartbeat: '<path d="M20 9.5c0 5-8 11-8 11s-2.6-2-4.8-4.6"/><path d="M4.4 12C3.5 11 3 10.1 3 8.8A4.6 4.6 0 0112 7a4.6 4.6 0 018 2.5"/><path d="M2.5 13.5h4l1.5-3 2.5 5 1.5-2h2.5"/>',
  thermo: '<path d="M14 14.5V5a2 2 0 00-4 0v9.5a4 4 0 104 0z"/><path d="M12 11v5"/><path d="M17.5 6h2M17.5 9.5h1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5c-2.4 0-4.4-1-6-2.3"/><circle cx="12" cy="12" r="3"/>',
  lips: '<path d="M3 12c3-3 6-3 9-1 3-2 6-2 9 1-3 4-6 5.5-9 5.5S6 16 3 12z"/><path d="M3 12h7.5M13.5 12H21"/>',
  comb: '<path d="M3 9.5h18v3H3z"/><path d="M5 12.5V17M8 12.5V17M11 12.5V17M14 12.5V17M17 12.5V15"/><path d="M19.5 17.5v.01"/>',
  cloud: '<path d="M7 15.5a4 4 0 01-.5-8A5.5 5.5 0 0117 8a3.8 3.8 0 01.5 7.5H11"/><path d="M8 18.5l-1 2M12 18.5l-1 2M16 18.5l-1 2"/>',
  plate: '<path d="M19.6 9a7 7 0 11-3.1-3.6"/><circle cx="13" cy="12" r="3.5"/><path d="M3.5 4v5a1.5 1.5 0 001.5 1.5V20M5 4v4"/>',
  drop: '<path d="M12 3c3.5 4.5 6 8 6 11a6 6 0 01-12 0c0-3 2.5-6.5 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 002.5 2.5"/>',
  tingle: '<path d="M7 11V5.5a1.5 1.5 0 013 0V10M10 9V4a1.5 1.5 0 013 0v6M13 9.5V5.5a1.5 1.5 0 013 0V14a7 7 0 01-7 7 6 6 0 01-5.3-3.2L2.2 15a1.5 1.5 0 012.6-1.5L7 16"/><path d="M19 4l1.5-1.5M20 8h2M19.5 11.5l1.5 1"/>',
  lungs: '<path d="M12 4v7M12 11c-1 1-2.5 1-3.5 0M12 11c1 1 2.5 1 3.5 0"/><path d="M8.5 7.5C6 8 3.5 12 3.5 17c0 1.7 1.4 2.8 3 2.4 1.5-.4 2-1.4 2-3V7.5zM15.5 7.5C18 8 20.5 12 20.5 17c0 1.7-1.4 2.8-3 2.4-1.5-.4-2-1.4-2-3V7.5z"/>',
  heartcrack: '<path d="M12 20.5S3 14.5 3 8.8A4.6 4.6 0 0112 7a4.6 4.6 0 019 1.8c0 5.7-9 11.7-9 11.7z"/><path d="M12 7l-1.5 4 3 2-1.5 3.5"/>',
  face: '<circle cx="12" cy="12" r="8.5"/><path d="M9 10h.01M15 10h.01"/><path d="M9.5 15.5c1.5 1 3.5 1 5 0"/><path d="M18.5 2.5l1 1.5M21.5 5.5L20 6"/>',
};
const sicon = k => `<svg class="ic" viewBox="0 0 24 24">${SIC[k] || SIC.face}</svg>`;
// [name, also known as, plain explanation, icon, needs urgent help]
const SYMPTOMS = [
  ['Headache', 'Head pain, pressure in the head', 'Pain anywhere in the head or face.', 'head'],
  ['Nausea', 'Feeling sick', 'Feeling like you might vomit.', 'nausea'],
  ['Vomiting', 'Being sick, throwing up', 'Bringing up food or liquid from the stomach.', 'vomit'],
  ['Dizziness', 'Light-headed, spinning, vertigo', 'Feeling unsteady, faint or as if the room is spinning.', 'dizzy'],
  ['Skin rash', 'Red spots, blotches', 'A change in the colour or texture of the skin.', 'rash'],
  ['Itching', 'Itchy skin', 'An urge to scratch the skin.', 'itch'],
  ['Hives', 'Raised itchy welts, nettle rash', 'Raised, itchy bumps that come and go.', 'hives'],
  ['Stomach pain', 'Tummy ache, abdominal pain, cramps', 'Pain or cramps in the belly.', 'stomach'],
  ['Diarrhoea', 'Loose or watery stools', 'Going to the toilet more often, with loose stools.', 'drops'],
  ['Constipation', 'Hard stools, difficulty going', 'Going to the toilet less often or with difficulty.', 'knot'],
  ['Tiredness', 'Fatigue, low energy, exhaustion', 'Feeling unusually tired or weak.', 'battery'],
  ['Drowsiness', 'Sleepiness during the day', 'Finding it hard to stay awake.', 'moonz'],
  ['Trouble sleeping', 'Insomnia, waking at night', 'Finding it hard to fall or stay asleep.', 'moon'],
  ['Muscle pain', 'Aching muscles, myalgia', 'Soreness or aching in the muscles.', 'arm'],
  ['Joint pain', 'Aching joints, stiff joints', 'Pain in the knees, hips, hands or other joints.', 'bone'],
  ['Back pain', 'Lower back pain, upper back pain', 'Pain anywhere along the back.', 'spine'],
  ['Cough', 'Dry cough, tickly throat', 'Coughing that is new or worse than usual.', 'cough'],
  ['Fast heartbeat', 'Palpitations, racing heart', 'Feeling your heart pounding, racing or skipping.', 'heartbeat'],
  ['Fever', 'High temperature, chills', 'A temperature of 38 °C or higher.', 'thermo'],
  ['Blurred vision', 'Eyesight changes', 'Things look fuzzy or hard to focus on.', 'eye'],
  ['Dry mouth', 'Thirsty, sticky mouth', 'Less saliva than usual.', 'lips'],
  ['Hair loss', 'Thinning hair', 'Losing more hair than usual.', 'comb'],
  ['Mood changes', 'Low mood, anxiety, irritability', 'Feeling sad, worried or irritable in a way that is new.', 'cloud'],
  ['Loss of appetite', 'Not hungry, eating less', 'Not wanting to eat as much as usual.', 'plate'],
  ['Bruising or bleeding', 'Nosebleeds, bleeding gums, easy bruising', 'Bleeding or bruising more easily than usual.', 'drop'],
  ['Tingling', 'Pins and needles, numbness', 'A prickly or numb feeling, often in hands or feet.', 'tingle'],
  ['Shortness of breath', 'Breathlessness, wheezing', 'Finding it hard to breathe.', 'lungs', true],
  ['Chest pain', 'Tight chest, pressure in the chest', 'Pain, tightness or pressure in the chest.', 'heartcrack', true],
  ['Swollen face, lips or tongue', 'Angioedema, throat swelling', 'Swelling of the face, mouth or throat.', 'face', true],
];
const POPULAR = ['Headache', 'Nausea', 'Skin rash', 'Dizziness', 'Stomach pain', 'Tiredness'];
const symOf = n => SYMPTOMS.find(s => s[0] === n);
function symMatch(q) {
  const t = q.trim().toLowerCase(); if (!t) return [];
  return SYMPTOMS.filter(([n, aka]) => (n + ' ' + aka).toLowerCase().includes(t)).slice(0, 8);
}
function symptom() {
  S.sym = S.sym || { q: '', picked: [], open: null };
  return `
  <div class="top bar-top">${backBtn('back-details')}<h1 class="ttl">Your symptoms</h1><span style="width:48px"></span></div>
  <div class="ask">${orb('md')}<h2>What is bothering you most?</h2><p>For example, search "headache". You can pick more than one.</p></div>
  <form class="search" id="symform" role="search"><label for="symq" class="sr">Search for a symptom</label>
    <span class="sic">${ic('search')}</span><input id="symq" type="search" autocomplete="off" placeholder="Search for a symptom" value="${esc(S.sym.q)}" aria-describedby="symcount">
    <button type="button" class="clr" data-act="symclear" aria-label="Clear search" ${S.sym.q ? '' : 'hidden'}>${ic('close')}</button>
    ${getSR() ? `<button type="button" class="micb" data-act="symmic" aria-label="Say your symptom">${ic('mic')}</button>` : ''}</form>
  <div id="symres" aria-live="polite">${symResults()}</div>
  <div class="footer"><button class="btn primary" data-act="symgo" id="symgo" ${S.sym.picked.length ? '' : 'disabled'}>${symGoLabel()}</button>
    <button class="link" data-act="symskip">Describe it in my own words instead</button></div>`;
}
const symGoLabel = () => S.sym.picked.length ? `Continue with ${S.sym.picked.length === 1 ? S.sym.picked[0].toLowerCase() : S.sym.picked.length + ' symptoms'} ${arrow()}` : 'Pick at least one symptom';
function symRow([n, aka, desc, emo, urgent]) {
  const on = S.sym.picked.includes(n), open = S.sym.open === n;
  return `<div class="srow ${on ? 'on' : ''}"><button class="spick" data-act="sympick" data-n="${esc(n)}" role="checkbox" aria-checked="${on}"><span class="emo" aria-hidden="true">${sicon(emo)}</span><span class="grow"><b>${esc(n)}</b><small>${esc(aka)}</small></span><span class="tickb" aria-hidden="true">${on ? ic('check') : ''}</span></button>
    <button class="qbtn" data-act="symwhat" data-n="${esc(n)}" aria-expanded="${open}" aria-label="What is ${esc(n.toLowerCase())}?">?</button>
    ${open ? `<p class="sdesc">${esc(desc)}${urgent ? ' <b>This can be serious.</b>' : ''}</p>` : ''}</div>`;
}
function symResults() {
  const q = S.sym.q, list = symMatch(q), urgent = S.sym.picked.filter(n => symOf(n)?.[4]);
  const shown = list.map(s => s[0]), others = S.sym.picked.filter(n => !shown.includes(n));
  const picked = others.length ? `<div class="sec"><h2>Your picks</h2></div><div class="slist">${others.map(n => symRow(symOf(n))).join('')}</div>` : '';
  const warn = urgent.length ? `<div class="urgent" role="alert">${ic('shield')}<span><b>Get help now if this is happening.</b> ${esc(urgent.join(', '))} can be serious. Call 112 or your doctor. You can finish this report afterwards.</span></div>` : '';
  if (!q.trim()) return `${warn}<div class="sec"><h2>Popular searches</h2></div><div class="pop">${POPULAR.map(n => { const s = symOf(n); return `<button class="popc ${S.sym.picked.includes(n) ? 'on' : ''}" data-act="sympick" data-n="${esc(n)}" aria-pressed="${S.sym.picked.includes(n)}"><span class="emo" aria-hidden="true">${sicon(s[3])}</span>${esc(n)}</button>`; }).join('')}</div>${picked}`;
  return `${warn}<p class="found" id="symcount">${list.length ? `Symptoms found: ${list.length}` : `No match for "${esc(q)}". Try another word, or describe it in your own words.`}</p><div class="slist">${list.map(symRow).join('')}</div>${picked}`;
}
function rerenderSym() {
  const r = $('#symres'); if (r) r.innerHTML = symResults();
  const g = $('#symgo'); if (g) { g.disabled = !S.sym.picked.length; g.innerHTML = symGoLabel(); }
  const c = $('[data-act=symclear]'); if (c) c.hidden = !S.sym.q;
}
function bindSymptom() {
  const i = $('#symq');
  i.addEventListener('input', () => { S.sym.q = i.value; S.sym.open = null; rerenderSym(); });
  $('#symform').addEventListener('submit', e => { e.preventDefault(); const first = symMatch(S.sym.q)[0]; if (first && !S.sym.picked.includes(first[0])) { S.sym.picked.push(first[0]); rerenderSym(); } });
}

/* ---------- 4. chat ---------- */
function chat() {
  if (!isPatient()) return chatHCP();
  const hcp = false;
  return `
  <div class="chat-head"><div class="row"><button class="avatar" data-act="back-symptom" aria-label="Back">${ic('back')}</button><div class="grow"><h2>${hcp ? 'Case discussion' : 'Tell me what happened'}</h2><small>${esc(S.med.name)}${S.med.dose ? ' · ' + esc(S.med.dose) : ''}</small></div>
    <button class="mini" id="toReview" data-act="toReview" disabled>Review</button></div>
    <div class="ailine">${aiBadge()}<span>asks questions and fills in your report. You check everything before it's sent.</span></div>
    ${hcp ? `<div class="people"><span class="person"><i style="background:#d4881f">P</i>Patient</span><span class="person"><i style="background:var(--blue)">${esc(S.profile.role[0])}</i>You</span><span class="person"><i style="background:var(--green)">AI</i>Listening</span></div>` : ''}</div>
  <div class="cap" id="cap"></div>
  <div class="msgs" id="msgs" aria-live="polite"></div>
  <div class="chips" id="chips"></div>
  ${hcp ? `<div class="composer">
    <div class="who" id="who"><button data-act="speaker" data-v="patient" class="p">As patient</button><button data-act="speaker" data-v="hcp">As me (${esc(S.profile.role)})</button></div>
    <form class="send-row" id="form"><input class="input" id="msgIn" placeholder="Type a message…" autocomplete="off"><button class="send" aria-label="Send" type="submit">${ic('send')}</button></form></div>` : `<div class="composer voice pv">
    <div class="vstate" id="pvstate" aria-live="polite"></div>
    <div class="vrow">
      <button class="vbtn" data-act="pvtts" id="pvtts" aria-label="Read the AI's replies aloud" aria-pressed="true">${ic('volume')}</button>
      <button class="mic" data-act="pvmic" id="pvmic" aria-label="Speak your answer" aria-pressed="false">${ic('mic')}<span class="wave"><i></i><i></i><i></i><i></i><i></i></span></button>
      <button class="vbtn" data-act="pvtype" id="pvtype" aria-label="Type your answer" aria-expanded="${getSR() ? 'false' : 'true'}">${ic('keyboard')}</button>
    </div>
    <form class="send-row" id="form" ${getSR() ? 'hidden' : ''}><input class="input" id="msgIn" placeholder="Type your answer…" autocomplete="off" aria-describedby="chat-nudge"><button class="send" aria-label="Send" type="submit">${ic('send')}</button></form>
    <p class="caveat" id="chat-nudge">Please don't share other people's names or phone numbers.</p></div>`}`;
}

const captured = () => FIELDS.filter(([k]) => S.fields[k]).length;
const missing = () => FIELDS.filter(([k]) => !S.fields[k]).map(f => f[0]);

function renderCap(newKeys = []) {
  const n = captured(), pct = Math.round(n / FIELDS.length * 100);
  const hcp = !isPatient();
  $('#cap').innerHTML = `<button class="cap-h" data-act="togglecap" ${hcp ? '' : 'disabled'}><span>${hcp ? 'Captured fields · tap one to correct it' : 'Questions answered'}</span><div class="bar"><i style="width:${pct}%"></i></div><span>${n}/${FIELDS.length}</span>${hcp ? ic('chev') : ''}</button>
  ${hcp && S.capOpen ? `<div class="cap-grid">${FIELDS.map(([k, l]) => `<div class="cf ${S.fields[k] ? 'ok' : ''} ${newKeys.includes(k) ? 'new' : ''}" data-act="editcf" data-k="${k}"><b>${l}</b><span>${esc(S.fields[k] || 'not yet')}</span></div>`).join('')}</div>` : ''}`;
  const btn = $('#toReview');
  if (btn) { btn.disabled = !(S.fields.reaction || S.msgs.some(m => !m.sys && m.who !== 'ai')); btn.style.background = missing().length ? '' : 'var(--blue)'; }   // AAA: white on --blue is 7.7:1
}

function renderMsgs(typing) {
  if (!isPatient()) return renderTranscript();
  const box = $('#msgs'); if (!box) return;
  const hcp = !isPatient();
  const mine = who => (hcp ? who === 'hcp' : who === 'patient');
  const name = w => w === 'ai' ? 'SafeReport AI' : w === 'patient' ? 'Patient' : S.profile.role;
  box.innerHTML = S.msgs.map(m => m.saved ? `<div class="saved">${m.saved.map(([k, l, v]) => `<button class="sv" data-act="reask" data-k="${k}" title="Tap to answer this again">${ic('spark')}<span>Saved · ${esc(l)}: <b>${esc(v)}</b></span><u>Change</u></button>`).join('')}</div>`
    : m.sys ? `<div class="sys">${esc(m.text)}</div>`
    : `<div class="m ${m.who === 'ai' ? 'ai' : mine(m.who) ? 'me' : ''}"><small>${name(m.who)}</small><p>${esc(m.text)}</p></div>`).join('')
    + (typing ? '<div class="m ai"><small>SafeReport AI</small><p class="typing"><i></i><i></i><i></i></p></div>' : '');
  box.scrollTop = box.scrollHeight;
}

const CHIPS = {
  patient: { reaction: ['I got a red itchy rash', 'I felt dizzy and sick', 'Bad headache and nausea'], onset: ['About 2 hours after the dose', 'It started yesterday'], severity: ['Mild, I managed', 'Moderate', 'Severe, I went to the doctor'], action: ['I stopped taking it', 'I kept taking it'], outcome: ['Much better now', 'Still ongoing'], age: ['I am 34, female', 'I am 52, male'], otherMeds: ['No other medicines', 'I take metformin'] },
  hcp: { reaction: ['Patient has a rash on the arms and chest', 'Reports dizziness and vomiting'], onset: ['It began 3 hours after the first dose'], severity: ['Moderate, no hospital visit needed', 'Severe, she was hospitalised'], action: ['I advised to stop the medicine', 'Medicine was continued'], outcome: ['Recovering after stopping', 'Not recovered yet'], age: ['Female patient, 34 years old'], otherMeds: ['No other medicines', 'Also on amlodipine'] },
};
function renderChips() {
  const box = $('#chips'); if (!box) return;
  const sp = isPatient() ? 'patient' : S.speaker;
  const next = S.asked && !S.fields[S.asked] ? S.asked : missing()[0];
  const list = next === 'initials' && isPatient() ? (myInitials() ? [`My initials are ${myInitials()}`] : [])
    : next ? CHIPS[sp === 'patient' ? 'patient' : 'hcp'][next] || [] : [];
  box.innerHTML = list.map(t => `<button class="chip" data-act="chip" data-v="${esc(t)}">${esc(t)}</button>`).join('');
}

function bindChat() {
  if (!isPatient()) return bindVoice();
  S.speaker = 'patient';
  if (!S.msgs.length) {
    const picked = isPatient() && S.fields.reaction;
    const hello = picked
      ? `Hi ${S.profile.name.split(' ')[0]}, I'm sorry you had ${S.fields.reaction} with ${S.med.name}. I'll ask a few quick questions for the report. ${QUESTIONS[missing()[0]]()}`
      : isPatient()
      ? `Hi ${S.profile.name.split(' ')[0]}, I'm sorry you had a problem with ${S.med.name}. I'll ask a few quick questions for the report. What happened after you took it?`
      : `I'm listening in on this case for ${S.med.name}. Talk freely — I'll fill in the report and only ask you, the ${S.profile.role}, about anything still missing.`;
    if (picked) S.msgs.push({ sys: true, saved: [['reaction', fieldLabel('reaction'), S.fields.reaction]] });
    S.msgs.push({ who: 'ai', text: hello });
    S.asked = isPatient() ? (picked ? missing()[0] : 'reaction') : null;
  }
  renderCap(); renderMsgs(); renderChips(); syncWho(); updatePV();
  $('#form').addEventListener('submit', e => { e.preventDefault(); const i = $('#msgIn'); const v = i.value.trim(); if (v) { i.value = ''; PV.spoken = false; send(v); } });
}
function syncWho() {
  document.querySelectorAll('#who button').forEach(b => b.classList.toggle('on', b.dataset.v === S.speaker));
  const i = $('#msgIn'); if (i && !isPatient()) i.placeholder = S.speaker === 'patient' ? 'Type what the patient says…' : 'Type as the ' + S.profile.role + '…';
}

async function send(text) {
  if (S.busy) return;
  const who = isPatient() ? 'patient' : S.speaker;
  S.msgs.push({ who, text });
  S.busy = true; renderMsgs(true); updatePV();
  let res;
  if (S.live && !S.eco) {
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: S.profile.role, med: S.med, messages: S.msgs.filter(m => !m.sys), fields: S.fields }) });
      if (!r.ok) throw 0;
      res = await r.json();
    } catch { S.live = false; }
  }
  if (!res) { await sleep(750); res = mockAI(text, who); }
  if (S.keptAsIs && res.reply) { res.reply = "I'll keep that as you wrote it and mark it for you to check on the review screen. " + res.reply.replace(/^Noted, I've added that\. /, ''); S.keptAsIs = false; }
  const before = { ...S.fields };
  for (const [k, v] of Object.entries(res.fields || {})) if (v && FIELDS.some(f => f[0] === k)) S.fields[k] = v;
  const fresh = FIELDS.map(f => f[0]).filter(k => S.fields[k] && S.fields[k] !== before[k]);
  if (!isPatient() && fresh.length) S.msgs.push({ sys: true, text: 'Captured: ' + fresh.map(k => FIELDS.find(f => f[0] === k)[1]).join(', ') });
  if (isPatient() && /\S+@\S+\.\S+|(?:\d[\s-]?){9,}/.test(text)) S.msgs.push({ sys: true, text: 'No need to share emails or phone numbers here. The company already has your contact.' });
  if (isPatient() && fresh.length) S.msgs.push({ sys: true, saved: fresh.map(k => [k, fieldLabel(k), S.fields[k]]) });
  if (res.reply) S.msgs.push({ who: 'ai', text: res.reply });
  if (isPatient() && res.reply) speakPatient(res.reply);
  S.asked = res.asked !== undefined ? res.asked : (missing()[0] || null);
  S.busy = false;
  renderCap(fresh); renderMsgs(); renderChips(); updatePV();
}

/* ---- voice case discussion (Doctor / Chemist / Other HCP) ----
   The mic streams speech-to-text (browser Web Speech API). The LLM labels every utterance as HCP or
   patient, fills the captured fields, and asks follow-up questions (spoken) when something is missing. */
const getSR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
/* Patient voice: tap the mic, say the answer, it goes into the chat like typed text.
   If the answer was spoken, the AI's reply is read aloud (unless the speaker is switched off). */
const PV = { on: false, rec: null, tts: true, spoken: false, status: '' };
function updatePV() {
  const m = $('#pvmic'); if (!m) return;
  m.classList.toggle('on', PV.on); m.setAttribute('aria-pressed', PV.on);
  const t = $('#pvtts'); t.classList.toggle('off', !PV.tts); t.setAttribute('aria-pressed', PV.tts);
  $('#pvstate').textContent = !getSR() ? "Voice isn't available on this device. Tap the keyboard to type instead."
    : PV.status === 'blocked' ? 'Microphone access is blocked. Allow it in the browser, or type instead.'
    : S.busy ? 'Thinking…' : PV.on ? 'Listening… say your answer' : 'Tap the mic and say your answer';
}
/* AI voice: ElevenLabs through the server's /api/tts. If the server has no ElevenLabs key (503) or the call
   fails, the browser's own voice speaks instead. */
let ttsAudio = null, elevenOff = false;
function stopSpeech() { try { ttsAudio?.pause(); } catch { /* ignore */ } ttsAudio = null; try { speechSynthesis.cancel(); } catch { /* ignore */ } }
async function sayText(text, done = () => {}) {
  stopSpeech();
  if (!elevenOff) {
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (r.status === 503) elevenOff = true;
      if (!r.ok) throw 0;
      const a = ttsAudio = new Audio(URL.createObjectURL(await r.blob()));
      a.onended = done;
      await a.play();
      return;
    } catch { ttsAudio = null; }
  }
  if (!('speechSynthesis' in window)) return done();
  const u = new SpeechSynthesisUtterance(text); u.rate = 1.02; u.onend = done; u.onerror = done;
  speechSynthesis.speak(u);
}
function speakPatient(text) {
  if (!PV.tts || !PV.spoken) return;
  sayText(text);
}
function stopPV() { PV.on = false; try { PV.rec?.abort(); } catch { /* ignore */ } stopSpeech(); }
const V = { rec: null, on: false, pending: [], interim: '', timer: null, busy: false, tts: true, speaking: false, lastQ: 0, status: '' };

function chatHCP() {
  return `
  <div class="chat-head"><div class="row"><button class="avatar" data-act="back-details" aria-label="Back">${ic('back')}</button><div class="grow"><h2>Case discussion</h2><small>${esc(S.med.name)} · ${esc(S.med.dose)}</small></div>
    <button class="mini" id="toReview" data-act="toReview" disabled>Review</button></div></div>
  <div class="cap" id="cap"></div>
  <div class="msgs" id="msgs" aria-live="polite"></div>
  <div class="voice">
    <div class="vstate" id="vstate"></div>
    <div class="vrow">
      <button class="vbtn" data-act="vtts" id="vtts" aria-label="Toggle AI voice">${ic('volume')}</button>
      <button class="mic" data-act="mic" id="mic" aria-label="Start or stop listening">${ic('mic')}<span class="wave"><i></i><i></i><i></i><i></i><i></i></span></button>
      <button class="vbtn" data-act="vtype" aria-label="Type instead">${ic('keyboard')}</button>
    </div>
    <form class="send-row" id="vform" hidden><input class="input" id="msgIn" placeholder="Type what was said…" autocomplete="off"><button class="send" aria-label="Send" type="submit">${ic('send')}</button></form>
  </div>`;
}

function bindVoice() {
  if (!S.msgs.length) S.msgs.push({ who: 'ai', text: `I'll listen to this consultation about ${S.med.name} and fill in the report as you talk. Tap the mic to begin, and I'll ask if anything is missing.` });
  renderCap(); renderTranscript(); updateVoiceUI();
  $('#vform').addEventListener('submit', e => {
    e.preventDefault(); const i = $('#msgIn'); const v = i.value.trim();
    if (v) { i.value = ''; V.pending.push(v); clearTimeout(V.timer); flush(true); }
  });
}

function updateVoiceUI() {
  const mic = $('#mic'); if (!mic) return;
  mic.classList.toggle('on', V.on);
  $('#vtts').classList.toggle('off', !V.tts);
  $('#vstate').textContent = !getSR() ? "Voice isn't available on this device. Tap the keyboard to type instead."
    : V.status === 'blocked' ? 'Microphone access is blocked. Allow it in the browser, or type instead.'
    : V.speaking ? 'SafeReport AI is speaking…' : V.busy ? 'Understanding the conversation…'
    : V.on ? 'Listening… talk naturally' : 'Tap the mic to start the consultation';
}

function renderTranscript() {
  const box = $('#msgs'); if (!box) return;
  const nm = w => w === 'patient' ? 'Patient' : S.profile.role;
  let html = S.msgs.map((m, i) => m.sys ? `<div class="sys">${esc(m.text)}</div>`
    : m.who === 'ai' ? `<div class="m ai"><small>SafeReport AI</small><p>${esc(m.text)}</p></div>`
    : `<div class="m ${m.who === 'hcp' ? 'me' : 'pat'}"><button class="tag" data-act="flip" data-i="${i}" title="Tap if the speaker was identified wrongly">${nm(m.who)} ⇄</button><p>${esc(m.text)}</p></div>`).join('');
  const heard = [...V.pending, V.interim].filter(Boolean).join(' ');
  if (heard) html += `<div class="m heard"><small>Heard…</small><p>${esc(heard)}</p></div>`;
  if (V.busy) html += '<div class="m ai"><small>SafeReport AI</small><p class="typing"><i></i><i></i><i></i></p></div>';
  box.innerHTML = html; box.scrollTop = box.scrollHeight;
}

function startVoice() {
  const SR = getSR();
  if (!SR) return updateVoiceUI();
  const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US';
  r.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript.trim();
      if (e.results[i].isFinal) { if (t) addSegment(t); } else interim += t + ' ';
    }
    V.interim = interim.trim(); if (V.interim) schedule(); renderTranscript();
  };
  r.onerror = e => { if (['not-allowed', 'service-not-allowed'].includes(e.error)) { V.on = false; V.status = 'blocked'; updateVoiceUI(); } };
  r.onend = () => { if (V.on && !V.speaking) { try { r.start(); } catch { /* already running */ } } updateVoiceUI(); };
  V.rec = r; V.on = true; V.status = '';
  try { r.start(); } catch { /* ignore */ }
  updateVoiceUI();
}
function stopVoice() { V.on = false; try { V.rec?.stop(); } catch { /* ignore */ } clearTimeout(V.timer); updateVoiceUI(); if (V.pending.length) flush(false); }
function haltVoice() { stopPV(); V.on = false; try { V.rec?.abort(); } catch { /* ignore */ } clearTimeout(V.timer); stopSpeech(); V.speaking = false; V.pending = []; V.interim = ''; }
function addSegment(t) { V.pending.push(t); V.interim = ''; schedule(); if (V.pending.length >= 4) flush(false); }
function schedule() { clearTimeout(V.timer); V.timer = setTimeout(() => flush(true), 3200); }   // a pause = time to label and maybe ask

async function flush(allowQ) {
  if (!V.pending.length) return;
  if (V.busy) return schedule();
  const segs = V.pending.splice(0); V.interim = '';
  V.busy = true; renderTranscript(); updateVoiceUI();
  const ask = allowQ && Date.now() - V.lastQ > 15000;
  let res = null;
  if (S.live && !S.eco) {
    try {
      const r = await fetch('/api/listen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: S.profile.role, med: S.med, turns: S.msgs.filter(m => !m.sys), segments: segs, fields: S.fields, allow_question: ask }) });
      if (!r.ok) throw 0;
      res = await r.json();
    } catch { S.live = false; }
  }
  if (!res) res = localListen(segs, ask);
  applyListen(res);
}
function applyListen(res) {
  const before = { ...S.fields };
  res.turns.forEach(t => S.msgs.push(t));
  for (const [k, v] of Object.entries(res.fields || {})) if (v && FIELDS.some(f => f[0] === k)) S.fields[k] = v;
  const fresh = FIELDS.map(f => f[0]).filter(k => S.fields[k] && S.fields[k] !== before[k]);
  if (fresh.length) S.msgs.push({ sys: true, text: 'Captured: ' + fresh.map(k => FIELDS.find(f => f[0] === k)[1]).join(', ') });
  V.busy = false;
  const lastAI = [...S.msgs].reverse().find(m => m.who === 'ai')?.text;
  renderCap(fresh); renderTranscript(); updateVoiceUI();
  if (res.question && res.question !== lastAI) { S.msgs.push({ who: 'ai', text: res.question }); V.lastQ = Date.now(); renderTranscript(); speak(res.question); }
  if (V.pending.length) schedule();
}
function speak(text) {
  if (!V.tts) return;
  V.speaking = true; try { V.rec?.stop(); } catch { /* ignore */ }   // don't transcribe the AI's own voice
  updateVoiceUI();
  sayText(text, () => { V.speaking = false; if (V.on) { try { V.rec.start(); } catch { /* ignore */ } } updateVoiceUI(); });
}
/* offline fallback: questions -> HCP, everything else -> patient */
function localListen(segs, ask) {
  const turns = [];
  segs.forEach(seg => (seg.match(/[^.?!]+[.?!]*/g) || [seg]).forEach(x => {
    x = x.trim(); if (!x) return;
    const q = /\?\s*$/.test(x) || /^(what|when|how|did|do|does|have|has|are|is|can|could|would|any|since|tell me|which|where)\b/i.test(x);
    const clin = /\b(i advise|i('ll| will) (prescribe|stop|give)|let me|i recommend|we('ll| will)|examine|prescrib)/i.test(x);
    turns.push({ who: q || clin ? 'hcp' : 'patient', text: x });
  }));
  const all = [...S.msgs.filter(m => !m.sys && m.who !== 'ai'), ...turns].map(t => t.text).join('. ');
  const fields = extractFields(all);
  const miss = FIELDS.map(f => f[0]).filter(k => !({ ...S.fields, ...fields })[k]);
  const question = !ask ? null : miss.length ? `${S.profile.role}, to complete the report: ${HCP_Q[miss[0]]}` : 'All key fields are captured. You can review and submit the report now.';
  return { turns, fields, question, done: !miss.length };
}

/* ---- simulated AI (offline) ---- */
const REACTIONS = ['rash', 'itch', 'hives', 'nausea', 'vomit', 'headache', 'dizz', 'swell', 'breath', 'diarrh', 'fever', 'palpitation', 'drows', 'stomach pain', 'cramp', 'cough', 'tired', 'fatigue', 'sleepy', 'chest pain', 'sick'];
const QUESTIONS = {
  reaction: () => `What did you notice after taking ${S.med.name}? Describe it in your own words.`,
  onset: () => 'On what date did it start? If you are not sure, tell me how long after the dose.',
  severity: () => 'How bad is it: mild, moderate or severe? Did you need to see a doctor?',
  action: () => 'Did you stop, reduce, or keep taking the medicine?',
  outcome: () => 'How are you feeling now — better, the same, or worse?',
  initials: () => `What are your initials${myInitials() ? ', for example ' + myInitials() : ''}? The medical part of your report names you only by initials, age and sex. Your contact details are kept separate.`,
  age: () => 'Could you tell me your age?',
  sex: () => 'And are you male or female?',
  otherMeds: () => 'Are you taking any other medicines or supplements?',
};
const HCP_Q = {
  reaction: 'What exactly is the reaction the patient is experiencing?',
  onset: 'What was the onset date, or the time to onset after the dose?',
  severity: 'How would you grade the severity, and was hospital care needed?',
  action: 'What action was taken with the medicine — withdrawn, reduced or continued?',
  outcome: 'What is the current outcome — recovered, recovering or ongoing?',
  initials: "What are the patient's initials?",
  age: "What is the patient's age?", sex: "What is the patient's sex?",
  otherMeds: 'Is the patient on any concomitant medicines?',
};
const fmtInitials = v => { const l = String(v).replace(/[^A-Za-z]/g, '').toUpperCase(); return l.length >= 1 && l.length <= 4 ? l.split('').join('.') + '.' : ''; };
const myInitials = () => { const w = (S.profile?.name || '').trim().split(/\s+/).filter(Boolean); return w.length > 1 ? fmtInitials(w.map(x => x[0]).join('')) : ''; };
/* Does a value plausibly answer this field? Used to re-ask unclear answers and to flag doubtful values on review. */
const FITS = {
  reaction: v => v.length >= 3,
  onset: v => /\d|yesterday|today|tonight|morning|night|week|month|year|ago|since|after|before|started|began/i.test(v),
  initials: v => /^([A-Z]\.){1,4}$/.test(v),
  age: v => /\d/.test(v),
  sex: v => /^(male|female)$/i.test(v),
  severity: v => /mild|moderate|severe|serious|hospital/i.test(v),
  action: v => /stop|reduc|continu|kept|withdr|paus/i.test(v),
  outcome: v => /recover|better|worse|ongoing|same|resolved|improv|not yet/i.test(v),
  otherMeds: v => !/\b(better|worse|still have|ongoing|recovered|mild|moderate|severe|ago|yesterday)\b/i.test(v),
};
const fits = (k, v) => !v || !FITS[k] || FITS[k](String(v));
const doubtful = () => FIELDS.map(f => f[0]).filter(k => S.fields[k] && !fits(k, S.fields[k]));
const REASK = {
  onset: 'When did it start? A date or something like "3 days ago" is fine.',
  initials: () => `Could you type just your initials${myInitials() ? ', for example ' + myInitials() : ''}?`,
  age: 'How old are you? A number is enough.',
  sex: 'Are you male or female?',
  severity: "I didn't catch how bad it is. Was it mild, moderate or severe?",
  action: 'Did you stop taking it, take less, or keep taking it as before?',
  outcome: 'How are you feeling now: better, the same, or worse?',
  otherMeds: 'Are you taking any other medicines or supplements? If not, just say "none".',
};
function extractFields(t) {
  const x = t.toLowerCase(), out = {};
  let m;
  if ((m = t.match(/\binitials?\s*(?:are|is|:)?\s*([A-Za-z]\.?\s?[A-Za-z]\.?(?:\s?[A-Za-z]\.?)?)(?![A-Za-z])/i)) && fmtInitials(m[1])) out.initials = fmtInitials(m[1]);
  if ((m = x.match(/(\d{1,3})\s*(?:-?\s*)(?:years?|yrs?|y\/?o|yo)\b/) || x.match(/\baged?\s+(\d{1,3})\b/) || x.match(/\bi am (\d{1,3})\b/) || x.match(/^\s*(\d{1,3})\s*$/))) out.age = m[1] + ' years';
  if (/\b(female|woman|girl|she|her|lady)\b/.test(x)) out.sex = 'Female'; else if (/\b(male|man|boy|he|his|him)\b/.test(x)) out.sex = 'Male';
  const rx = REACTIONS.filter(r => x.includes(r));
  if (rx.length) out.reaction = rx.map(r => ({ dizz: 'dizziness', vomit: 'vomiting', swell: 'swelling', breath: 'breathlessness', diarrh: 'diarrhoea', palpitation: 'palpitations', drows: 'drowsiness', itch: 'itching', sick: 'feeling sick' }[r] || r)).join(', ');
  if ((m = x.match(/(\d+|an?|one|two|three|few|several)\s*(minutes?|hours?|days?|weeks?)(?:\s*(?:ago|after|later|since))/) || x.match(/\b(yesterday|today|last night|this morning|since (?:last |this )?\w+)\b/))) out.onset = m[0].replace(/^(a|an)\b/, '1');
  if (/hospital|admitted|emergency|icu|life.threat/.test(x)) out.severity = 'Serious — hospital care'; else if (/\bsevere|very bad|terrible|unbearable|went to (?:the )?doctor/.test(x)) out.severity = 'Severe'; else if (/moderate|quite bad/.test(x)) out.severity = 'Moderate'; else if (/\bmild|slight|little|manageable|managed/.test(x)) out.severity = 'Mild';
  if (/stopp?ed|discontinu|withdr|not take|no longer|advised (?:\w+ )?to stop|\bstop (?:the|taking|it)/.test(x)) out.action = 'Medicine stopped'; else if (/reduc|lower(ed)? the dose/.test(x)) out.action = 'Dose reduced'; else if (/continu|kept|keep taking|still tak|carry on/.test(x)) out.action = 'Medicine continued';
  if (/not recovered|not better|still (?:have|got|feel|there|bad|sick|hurt|ongoing)|ongoing|persist|same/.test(x)) out.outcome = 'Not yet recovered'; else if (/worse|worsen/.test(x)) out.outcome = 'Getting worse'; else if (/recovered|resolved|gone/.test(x)) out.outcome = 'Recovered'; else if (/better|improv|recovering/.test(x)) out.outcome = 'Recovering';
  if (/no other (medic|drug|tablet)|nothing else|not taking any|none\b/.test(x)) out.otherMeds = 'None'; else if ((m = t.match(/(?:also (?:on|taking|takes)|along with|concomitant(?:ly)?(?: medicines?)?:?|other medicines?:?|i take|i am on|she takes|he takes)\s+([^.,;?]{3,50})/i))) out.otherMeds = m[1].trim();
  return out;
}
function mockAI(text, who) {
  const found = extractFields(text);
  const ask = S.asked;
  // a direct answer to the question just asked is accepted even if keywords didn't match
  // ...but only if it plausibly fits; otherwise ask again (at most twice, then keep it and flag it on review)
  const raw = text.replace(/^\W+|\W+$/g, '');
  if (isPatient() && ask === 'initials' && !found.initials && fmtInitials(text)) found.initials = fmtInitials(text);
  else if (isPatient() && ask && ask !== 'initials' && !found[ask] && !(ask === 'age' && found.sex) && text.length <= 80) {
    const tries = (S.tries[ask] || 0) + 1;
    if (fits(ask, raw) || tries > 2) { found[ask] = raw; S.keptAsIs = !fits(ask, raw); }
    else {
      S.tries[ask] = tries;
      const f = REASK[ask], q = typeof f === 'function' ? f() : f;
      return { fields: found, reply: (Object.keys(found).length ? "Thanks, I've noted that. " : '') + q, asked: ask };
    }
  }
  if (isPatient() && ask === 'age' && !found.age) delete found.age;
  const merged = { ...S.fields, ...found };
  const miss = FIELDS.map(f => f[0]).filter(k => !merged[k]);
  const sr = S.msgs.filter(m => m.who !== 'ai' && !m.sys).length;
  const thanked = S.msgs.some(m => m.who === 'ai' && /everything I need|key fields are captured/.test(m.text));
  if (!miss.length && thanked) return { fields: found, reply: isPatient() ? "Noted, I've added that. Tap Review whenever you're ready." : 'Noted and added to the report.', asked: null };
  if (!miss.length) return { fields: found, reply: isPatient() ? 'Thank you, that is everything I need. Tap Review to check your report before sending it to ' + company() + '.' : 'All key fields are captured. You can review and submit the report now.', asked: null };
  if (isPatient()) {
    if (/breath|swollen (?:face|tongue|throat)|chest pain|faint/.test(text.toLowerCase())) return { fields: found, reply: 'That can be serious. If you have trouble breathing, swelling of the face or throat, or chest pain, please get emergency help now. We can finish this report afterwards.', asked: miss[0] };
    return { fields: found, reply: QUESTIONS[miss[0]](), asked: miss[0] };
  }
  // 3-way: AI only speaks after the HCP, or when the patient has talked for a while
  const sinceAI = (() => { let n = 0; for (let i = S.msgs.length - 1; i >= 0 && S.msgs[i].who !== 'ai'; i--) if (!S.msgs[i].sys) n++; return n; })();
  if (who === 'hcp' || sinceAI >= 3) return { fields: found, reply: `${S.profile.role}, to complete the report: ${HCP_Q[miss[0]]}`, asked: miss[0] };
  return { fields: found, reply: null, asked: miss[0], _sr: sr };
}

/* ---------- 5. review ---------- */
const medLabel = m => m.dose && !m.dose.toLowerCase().includes(m.name.trim().toLowerCase()) ? `${m.name} ${m.dose}` : (m.dose || m.name);
function narrative() {
  const f = Object.fromEntries(Object.entries(S.fields).filter(([k, v]) => fits(k, v))), m = S.med;   // doubtful answers stay out of the summary
  if (!f.reaction) return S.msgs.filter(x => !x.sys && x.who !== 'ai').map(x => x.text).join(' ');
  const who = [f.age && f.age.replace(/^(\d+) years?$/, '$1-year-old'), f.sex && f.sex.toLowerCase()].filter(Boolean).join(' ');
  const pt = (who ? 'A ' + who + ' patient' : 'A patient') + (f.initials ? ' (' + f.initials + ')' : '');
  const ev = f.reaction.charAt(0).toLowerCase() + f.reaction.slice(1);
  return `${pt} experienced ${ev}${f.onset ? ' (onset: ' + f.onset + ')' : ''} while taking ${medLabel(m)}${m.batch ? ' (batch ' + m.batch + ')' : ''}. `
    + `${f.severity ? 'Severity: ' + f.severity + '. ' : ''}${f.action ? f.action + '. ' : ''}${f.outcome ? 'Outcome: ' + f.outcome + '. ' : ''}${f.otherMeds ? 'Other medicines: ' + f.otherMeds + '.' : ''}`.trim();
}
/* The four things a report needs to be processable as a valid case */
const criteria = () => [
  [say('Who it happened to', 'Identifiable patient'), !!(S.fields.initials || S.fields.age || S.fields.sex), 'Initials, age or sex'],
  [say('How the company can reach you', 'Identifiable reporter'), !!(S.profile.name && S.profile.contact), 'Your name and contact'],
  [say('The medicine', 'Suspect medicine'), !!S.med.name.trim(), 'The medicine name'],
  [say('What happened', 'Adverse event'), !!S.fields.reaction, 'What went wrong'],
];
function review() {
  const p = S.profile, m = S.med;
  if (!S.narrEdited) S.narr = narrative();
  const crit = criteria(), allOk = crit.every(c => c[1]), doubts = doubtful();
  const label = fieldLabel;
  const row = (l, v, opt, warn) => `<div class="kv ${warn ? 'warn' : ''}"><span>${l}</span><b class="${v ? '' : 'miss'}">${esc(v || (opt ? '—' : 'Not provided'))}${warn ? '<small>Please check</small>' : ''}</b></div>`;
  const verdict = doubts.length
    ? `<p class="hint" style="margin-top:12px;color:var(--amber);font-weight:600">${aiBadge('AI')} wasn't sure about ${doubts.length === 1 ? 'one answer' : doubts.length + ' answers'}: ${doubts.map(label).join(', ')}. Tap Edit under ${say('What happened to you', 'Patient &amp; event')} to fix ${doubts.length === 1 ? 'it' : 'them'}.</p>`
    : `<p class="hint" style="margin-top:12px;${allOk ? 'color:var(--green-d)' : 'color:var(--amber)'};font-weight:600">${allOk ? 'This report has everything the company needs to process it.' : 'Some details are missing. You can still submit. The company may contact you for more information.'}</p>`;
  const head = (title, act, on) => `<div class="card-h"><h3>${title}</h3><button class="edit" data-act="${act}">${on ? 'Done' : 'Edit'}</button></div>`;
  const rep = S.edit.rep ? `
    <label class="kv-edit"><span>Name</span><input class="input sm" data-rep="name" value="${esc(p.name)}" autocomplete="name"></label>
    <label class="kv-edit"><span>${say('You are a', 'Qualification')}</span><select class="input sm" data-rep="role">${ROLES.map(([r]) => `<option ${r === p.role ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <label class="kv-edit"><span>Phone or email</span><input class="input sm" data-rep="contact" value="${esc(p.contact)}"></label>
    <label class="kv-edit"><span>Country</span><input class="input sm" data-rep="country" value="${esc(p.country || '')}"></label>
    <p class="hint" id="rep-err" style="color:var(--red);font-weight:600" hidden></p>`
    : `${row('Name', p.name)}${row(say('You are a', 'Qualification'), p.role)}${row(say('Phone or email', 'Contact'), p.contact)}${row('Country', p.country, true)}`;
  const ev = S.edit.ev
    ? FIELDS.map(([k]) => `<label class="kv-edit"><span>${fieldLabel(k)}</span><input class="input sm ${doubts.includes(k) ? 'warn' : ''}" data-evf="${k}" value="${esc(S.fields[k] || '')}" placeholder="Not provided"></label>`).join('')
    : FIELDS.map(([k]) => row(fieldLabel(k), S.fields[k], false, doubts.includes(k))).join('');
  return `
  <div class="top">${backBtn('back-chat')}<div><h1>${say('Check and send', 'Review your report')}</h1><p>${say(`Have a quick look before it goes to ${esc(company())}.`, `Check before sending to ${esc(company())}.`)}</p></div></div>
  <div class="card"><h3>${say('Ready to send?', 'Report completeness')}</h3>
    ${crit.map(([t, ok, hint]) => `<div class="crit ${ok ? 'ok' : ''}"><i>${ok ? ic('check') : ''}</i><div><b>${t}</b><small>${ok ? 'Provided' : hint}</small></div></div>`).join('')}
    ${verdict}</div>
  <div class="card">${head(say('You', 'Reporter'), 'editrep', S.edit.rep)}${rep}</div>
  <div class="card"><div class="card-h"><h3>${say('The medicine', 'Suspect medicine')}</h3><button class="edit" data-act="editmed">Edit</button></div>${row(say('Name', 'Product'), m.name)}${row('Dose', m.dose)}${row('Batch', m.batch)}${row('Manufacturer', m.mfr)}</div>
  <div class="card">${head(say('What happened to you', 'Patient & event'), 'editev', S.edit.ev)}<p class="aifill">${ic('spark')}<span>${say('The AI filled these in from your answers. Edit anything that is wrong.', 'Captured by the AI from the conversation. Edit to correct.')}</span></p>${ev}</div>
  <div class="card"><h3>${say('Your summary', 'What happened')} <span style="color:var(--red)" aria-hidden="true">*</span><span class="sr"> (required)</span></h3>
    <textarea class="input textarea" id="narr" data-narr="1" placeholder="Describe the symptoms and complaints in your own words">${esc(S.narr)}</textarea>
    <p class="hint">${S.narrEdited ? 'Edited by you.' : `${aiBadge('AI')} wrote this from your answers.`} This is the only required part, so edit it if anything is missing or wrong.</p></div>
  ${S.msgs.some(m => !m.sys && m.who !== 'ai') ? `<div class="card"><h3>${say('Your conversation', 'Conversation transcript')}</h3>${S.msgs.filter(m => !m.sys).map(m => `<p class="narr" style="margin-bottom:8px"><b>${m.who === 'ai' ? 'AI' : m.who === 'hcp' ? esc(S.profile.role) : 'Patient'}:</b> ${esc(m.text)}</p>`).join('')}</div>` : ''}
  <div class="card whosees"><h3>Who sees this</h3>
    <div class="wrow">${ic('building')}<div><b>Safety team at ${esc(company())}</b><small>The medical details: initials, age, sex, the medicine and what happened.</small></div></div>
    <div class="wrow">${ic('user')}<div><b>Your name and contact</b><small>Only so the company can ask you follow-up questions. Kept apart from the medical details.</small></div></div>
    <div class="wrow">${ic('shield')}<div><b>Health authorities</b><small>The company may pass on the medical details, without your name or contact, as the law requires.</small></div></div>
    <div class="wrow">${ic('lock')}<div><b>Stays on this phone</b><small>Your PIN and sign-in.</small></div></div>
    <button class="eulink" data-act="euinfo" style="margin-top:8px">${ic('shield')} Your rights under the EU AI Act and GDPR</button>
  </div>
  <label class="consent"><input type="checkbox" id="consent"><span>I confirm this information is accurate to the best of my knowledge and agree to be contacted for follow-up.</span></label>
  <div class="footer"><button class="btn primary" id="submit" data-act="submit" disabled>${ic('send')} Submit report</button>
  <button class="link" data-act="back-chat">Add more details in chat</button></div>`;
}
function rerenderReview() {
  const y = screen.scrollTop;
  screen.innerHTML = review(); bind('review'); screen.scrollTop = y;
}
function saveReporter() {
  const get = k => ($(`[data-rep=${k}]`)?.value || '').trim();
  const n = { name: get('name'), role: get('role'), contact: get('contact'), country: get('country') };
  if (n.name.length < 2 || n.contact.length < 5 || !n.role) return err('#rep-err', 'Please enter your name and a phone or email.');
  const all = accounts(), oldKey = acctKey(S.profile.contact), newKey = acctKey(n.contact);
  if (newKey !== oldKey && all[newKey]) return err('#rep-err', 'Another account already uses that phone or email.');
  if (all[oldKey]) { const rec = all[oldKey]; delete all[oldKey]; all[newKey] = { ...rec, ...n }; store.set('safereport.accounts', all); }
  S.profile = n; S.edit.rep = false; rerenderReview();
}
const updateSubmit = () => { const b = $('#submit'); if (b) b.disabled = !($('#consent').checked && (S.narr || '').trim().length > 9); };

/* ---------- 6. report issued ---------- */
function confetti() {
  const cols = ['#1a7bff', '#22b07d', '#ffb020', '#7c5cff', '#ff6b8b'];
  return '<div class="confetti">' + Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2, d = 90 + Math.random() * 120;
    return `<i style="background:${cols[i % cols.length]};--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d - 40)}px;--r:${Math.round(Math.random() * 540)}deg;animation-delay:${(0.35 + Math.random() * 0.2).toFixed(2)}s"></i>`;
  }).join('') + '</div>';
}
const STAGES = [['Report sent', 'Your report was created and is ready for the company.'], ['Received by the company', 'The company will confirm once their safety team starts working on your report. This can take a few days.']];
function report() {
  const r = S.report;
  const first = !S.sealed; S.sealed = true;
  const ts = STAGES.map(([t, d], i) => {
    const fin = i < S.stage;
    const cls = fin ? 'done' : i === S.stage ? 'now' : 'wait';
    return `<div class="ts ${cls}"><div class="dot">${fin ? ic('check') : ''}</div><div><b>${t}</b><small>${r.times[i] ? r.times[i] + ' · ' : ''}${d}</small></div></div>`;
  }).join('');
  return `
  <div class="top" style="padding-bottom:0">${backBtn('newreport')}</div>
  ${first ? confetti() : ''}<div class="seal ${first ? '' : 'still'}">${ic('check')}</div>
  <div class="center"><h1>${say('Report sent', 'Report issued')}</h1><p>Sent to ${esc(company())}</p></div>
  <div class="card" style="margin-top:18px"><h3 style="text-align:center">Reference ID</h3><div class="refid">${r.id}</div><p class="hint center">Keep this number to follow up on your report.</p></div>
  <div class="card"><h3>Status</h3><div class="tl">${ts}</div></div>
  <div class="footer">
    <button class="link" data-act="newreport">Start a new report</button></div>`;
}
const clock = () => new Date().toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function advance(to) {
  if (!S.report || S.stage >= to) return;
  S.stage = to; S.report.times[to] = clock();
  if (to === 2) notify();
  if (S.screen === 'report') go('report');
}
function notify() {
  S.notified = true;
  notif.hidden = false;
  notif.innerHTML = `${LOGO}<div><b>${esc(company())} acknowledged your report</b><small>${S.report.id} · they have a few follow-up questions</small></div>`;
  notif.onclick = () => { notif.hidden = true; if (S.screen !== 'followup') gofollow(); };
  renderNav();
  setTimeout(() => { notif.hidden = true; }, 8000);
}

/* ---------- 7. follow-up ---------- */
const FOLLOW = [
  { q: 'Has the reaction improved since you reported it?', chips: ['Fully recovered', 'Getting better', 'About the same', 'Getting worse'] },
  { q: 'Did you see a doctor or have any tests done for this reaction? Please share what you can.', chips: ['No, I did not', 'Yes, saw a doctor', 'Yes, had blood tests'] },
  { q: 'Did you take the medicine again after the reaction, and did the symptoms come back?', chips: ['Did not restart', 'Restarted, symptoms returned', 'Restarted, no symptoms'] },
];
function followup() {
  return `<div class="chat-head"><div class="row"><div class="grow"><h2>Follow-up questions</h2><small>${esc(company())} · ${S.report.id}</small></div><span class="pill g">Acknowledged</span></div></div>
  <div class="msgs" id="msgs"></div><div class="chips" id="chips"></div>
  <div class="composer"><form class="send-row" id="form"><input class="input" id="msgIn" placeholder="Type your answer…" autocomplete="off"><button class="send" aria-label="Send" type="submit">${ic('send')}</button></form></div>`;
}
function renderFollow(typing) {
  const box = $('#msgs');
  box.innerHTML = S.follow.map(m => m.sys ? `<div class="sys">${esc(m.text)}</div>` : `<div class="m ${m.who === 'ai' ? 'ai' : 'me'}"><small>${m.who === 'ai' ? esc(company()) + ' safety team' : 'You'}</small><p>${esc(m.text)}</p></div>`).join('')
    + (typing ? '<div class="m ai"><p class="typing"><i></i><i></i><i></i></p></div>' : '');
  box.scrollTop = box.scrollHeight;
  const q = FOLLOW[S.followIdx];
  $('#chips').innerHTML = q && !typing ? q.chips.map(c => `<button class="chip" data-act="fchip" data-v="${esc(c)}">${esc(c)}</button>`).join('') : '';
}
function bindFollow() {
  if (!S.follow.length) S.follow.push({ who: 'ai', text: `Thank you for your report. To help us assess it, we have ${FOLLOW.length} short questions. ${FOLLOW[0].q}` });
  renderFollow();
  $('#form').addEventListener('submit', e => { e.preventDefault(); const i = $('#msgIn'); const v = i.value.trim(); if (v) { i.value = ''; answerFollow(v); } });
}
async function answerFollow(text) {
  if (S.busy || S.followIdx >= FOLLOW.length) return;
  S.busy = true; S.follow.push({ who: 'me', text }); S.followIdx++;
  renderFollow(true); await sleep(800);
  if (S.followIdx < FOLLOW.length) S.follow.push({ who: 'ai', text: FOLLOW[S.followIdx].q });
  else { S.follow.push({ who: 'ai', text: 'Thank you — that is everything we need for now. Your answers were added to your report. We will contact you only if we need anything else.' }); S.follow.push({ sys: true, text: 'Follow-up sent to ' + company() }); }
  S.busy = false; renderFollow();
}
function gofollow() { S.notified = false; notif.hidden = true; go('followup'); }

/* ---------- actions ---------- */
const actions = {
  start: () => go('signin'),
  gowelcome: () => go('welcome'),
  signupback: () => go('signin'),
  cancelscan: () => { S.scanSeq++; go('capture'); },
  'back-details': () => go('details'),
  'back-symptom': () => go(isPatient() ? 'symptom' : 'details'),
  sympick: t => { const n = t.dataset.n, i = S.sym.picked.indexOf(n); if (i < 0) S.sym.picked.push(n); else S.sym.picked.splice(i, 1); rerenderSym(); $(`[data-n="${CSS.escape(n)}"][data-act=sympick]`)?.focus(); },
  symwhat: t => { S.sym.open = S.sym.open === t.dataset.n ? null : t.dataset.n; rerenderSym(); $(`[data-n="${CSS.escape(t.dataset.n)}"][data-act=symwhat]`)?.focus(); },
  symclear: () => { S.sym.q = ''; const i = $('#symq'); i.value = ''; rerenderSym(); i.focus(); },
  symmic: t => {
    const SR = getSR(); if (!SR) return;
    const r = new SR(); r.lang = navigator.language || 'en-US'; t.classList.add('on'); t.setAttribute('aria-label', 'Listening… say your symptom');
    r.onresult = e => { const v = e.results[0][0].transcript; S.sym.q = v; $('#symq').value = v; rerenderSym(); };
    r.onend = () => { t.classList.remove('on'); t.setAttribute('aria-label', 'Say your symptom'); };
    try { r.start(); } catch { t.classList.remove('on'); }
  },
  symgo: () => {
    if (!S.sym.picked.length) return;
    S.msgs = []; S.fields = { reaction: S.sym.picked.map(n => n.toLowerCase()).join(', ') }; S.asked = null;
    go('chat');
  },
  symskip: () => { S.msgs = []; S.fields = {}; S.asked = null; go('chat'); },
  zoom: () => {
    const z = document.createElement('div'); z.className = 'zoomer';
    z.innerHTML = `<div class="zoom-bar"><b>Your pack</b><button class="cam-btn" aria-label="Close">${ic('close')}</button></div>${hlImage('62vh')}${Object.keys(HL).some(hasBox) ? hlLegend() : ''}`;
    z.onclick = () => z.remove(); $('#phone').appendChild(z);
  },
  aiinfo: () => {
    const el = document.createElement('div'); el.className = 'sheet-ov';
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ai-h">
      <div class="sheet-h"><h2 id="ai-h">${ic('spark')} How the AI helps</h2><span class="mode ${S.live ? 'live' : ''}">${S.live ? 'Live AI' : 'Demo AI'}</span></div>
      <div class="wrow">${ic('check')}<div><b>What it does</b><small>Reads the medicine pack from your photo, asks you short questions, and writes a summary you can edit.</small></div></div>
      <div class="wrow">${ic('close')}<div><b>What it never does</b><small>It never sends anything until you tap Submit, and it doesn't give medical advice. If you feel very unwell, call your doctor or 112.</small></div></div>
      <div class="wrow">${ic('lock')}<div><b>Your data</b><small>${S.live ? 'Your photo and answers go to Claude, an AI service by Anthropic, only to fill in this report.' : 'Demo mode: the AI runs on this phone. Nothing leaves it until you submit.'}</small></div></div>
      <div class="wrow">${ic('building')}<div><b>Who decides</b><small>A safety specialist at ${esc(company())} reviews every report. The AI only helps you fill it in.</small></div></div>
      <button class="btn primary" data-close>Got it</button></div>`;
    const close = () => el.remove();
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    $('#phone').appendChild(el); el.querySelector('[data-close]').focus();
  },
  euinfo: () => {
    const el = document.createElement('div'); el.className = 'sheet-ov';
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="eu-h">
      <div class="sheet-h"><h2 id="eu-h">${ic('shield')} Your rights in the EU</h2><span class="mode">Demo draft</span></div>
      <div class="wrow">${ic('spark')}<div><b>You are using an AI system</b><small>SafeReport uses AI to read your medicine pack and to ask you questions. Anything the AI wrote is marked with ✦. (EU AI Act, transparency)</small></div></div>
      <div class="wrow">${ic('check')}<div><b>What it is for</b><small>Helping you report a suspected side effect to the manufacturer. It does not diagnose or treat you.</small></div></div>
      <div class="wrow">${ic('people')}<div><b>People stay in charge</b><small>You check and send every report yourself. A safety specialist at the company reviews it. The AI never decides on its own.</small></div></div>
      <div class="wrow">${ic('lock')}<div><b>Your data (GDPR)</b><small>${esc(company()).replace(/^./, c => c.toUpperCase())} receives your report and is responsible for it. You can ask them to see, correct or delete your data. Your PIN stays on this phone.</small></div></div>
      <div class="wrow">${ic('leaf')}<div><b>Using less energy</b><small>Low-energy mode skips the photo AI and keeps the chat on this phone.</small></div></div>
      <p class="hint" style="margin:6px 0 0;color:var(--amber);font-weight:600">Demo wording, not legal advice. The team must confirm the risk class, legal basis and data controller before launch.</p>
      <button class="btn primary" data-close>Got it</button></div>`;
    const close = () => el.remove();
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    $('#phone').appendChild(el); el.querySelector('[data-close]').focus();
  },
  hlfocus: t => { const i = $('#d-' + t.dataset.k); i?.focus(); const h = document.querySelector(`.hl[data-k="${t.dataset.k}"]`); if (h) { h.classList.add('on'); setTimeout(() => h.classList.remove('on'), 1800); } },
  editcf: t => {
    if (t.querySelector('input')) return;
    const k = t.dataset.k, span = t.querySelector('span'), inp = document.createElement('input');
    inp.className = 'cf-in'; inp.value = S.fields[k] || ''; inp.placeholder = 'Type a correction';
    span.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const commit = () => { if (done) return; done = true; const v = inp.value.trim(); if (v) S.fields[k] = v; else delete S.fields[k]; renderCap(); };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { inp.value = S.fields[k] || ''; commit(); } });
  },
  editrep: () => { if (S.edit.rep) saveReporter(); else { S.edit.rep = true; rerenderReview(); } },
  editev: () => { S.edit.ev = !S.edit.ev; rerenderReview(); },
  editmed: () => { S.returnTo = 'review'; go('details'); },
  role: t => { draft.role = t.dataset.v; document.querySelectorAll('.rolec').forEach(r => { const on = r === t; r.classList.toggle('on', on); r.setAttribute('aria-checked', on); }); $('#rolehint').textContent = roleHint(draft.role); validateSignup(); },
  async saveProfile() {
    const key = acctKey(draft.contact), all = accounts();
    if (all[key]) return err('#su-err', 'An account with this phone or email already exists. Please sign in instead.');
    const salt = Math.random().toString(36).slice(2);
    const profile = { role: draft.role, name: draft.name.trim(), contact: draft.contact.trim(), country: draft.country.trim() };
    all[key] = { ...profile, salt, hash: await hashPin(draft.pin, salt) };
    store.set('safereport.accounts', all);
    draft = blank(); sign = { contact: '', pin: '' };
    S.profile = profile; go('capture');
  },
  async signIn() {
    const a = accounts()[acctKey(sign.contact)];
    if (!a) return err('#si-err', 'We could not find an account with that phone or email. Create an account to get started.');
    if (await hashPin(sign.pin, a.salt) !== a.hash) return err('#si-err', 'That PIN is not correct. Please try again.');
    sign = { contact: '', pin: '' };
    S.profile = { role: a.role, name: a.name, contact: a.contact, country: a.country || '' }; go('capture');
  },
  gosignup: () => go('signup'),
  gosignin: () => go('signin'),
  pick: t => { S.pick = t.dataset.v; document.querySelectorAll('.pk').forEach(b => { const on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); $('#pk-go').disabled = false; },
  pickgo: (t, e) => { const a = S.pick; if (a && actions[a]) actions[a](t, e); },
  sipeek: t => { const i = $('#si-pin'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; t.setAttribute('aria-pressed', show); t.setAttribute('aria-label', show ? 'Hide PIN' : 'Show PIN'); t.innerHTML = ic(show ? 'eyeoff' : 'eye'); },
  siforgot: () => {
    const el = document.createElement('div'); el.className = 'sheet-ov';
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fp-h"><div class="sheet-h"><h2 id="fp-h">${ic('lock')} Forgot your PIN?</h2></div>
      <p class="hint" style="margin:0 0 8px;font-size:15px">For your privacy, your PIN is stored only on this phone, so nobody (not even us) can see or reset it. You can create a new account and keep reporting.</p>
      <button class="btn primary" data-new>Create a new account</button><button class="link" data-close>Back to sign in</button></div>`;
    const close = () => el.remove();
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); else if (e.target.closest('[data-new]')) { close(); go('signup'); } });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    $('#phone').appendChild(el); el.querySelector('[data-new]').focus();
  },
  settings: () => {
    const el = document.createElement('div'); el.className = 'sheet-ov';
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="st-h"><div class="sheet-h"><h2 id="st-h">${ic('gear')} Settings</h2></div>
      <div class="wrow">${ic('user')}<div><b>${esc(S.profile.name)}</b><small>${esc(S.profile.contact)} · ${esc(S.profile.role)}</small></div></div>
      <button class="btn line" data-out>Sign out</button><button class="link" data-close>Close</button></div>`;
    const close = () => el.remove();
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); else if (e.target.closest('[data-out]')) { close(); actions.resetProfile(); } });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    $('#phone').appendChild(el); el.querySelector('[data-close]').focus();
  },
  resetProfile() {
    if (!confirm('Sign out of SafeReport?')) return;
    S.timers.forEach(clearTimeout); notif.hidden = true;
    S.profile = null; S.med = { name: '', dose: '', batch: '', mfr: '', source: '' }; S.photo = null; S.msgs = []; S.fields = {};
    S.report = null; S.stage = 0; S.notified = false; S.sealed = false; S.narrEdited = false; S.follow = []; S.followIdx = 0;
    go('signin');
  },
  camera: openCamera,
  upload: () => $('#fileUpload').click(),
  sample: () => runExtract({ label: 'Using a sample medicine pack…' }),
  qr: openScanner,
  manual() { resetConversation(); S.med = { name: '', dose: '', batch: '', mfr: '', source: 'Entered manually' }; go('details'); },
  confirm() { const to = S.returnTo || (isPatient() && !S.msgs.length ? 'symptom' : 'chat'); S.returnTo = null; go(to); },
  'back-capture': () => { if (S.returnTo) { const to = S.returnTo; S.returnTo = null; go(to); } else go('capture'); },
  'back-chat': () => go('chat'),
  togglecap: () => { S.capOpen = !S.capOpen; renderCap(); },
  mic: () => (V.on ? stopVoice() : startVoice()),
  pvtts: () => { PV.tts = !PV.tts; if (!PV.tts) stopSpeech(); updatePV(); },
  pvtype: t => { const f = $('#form'); f.hidden = !f.hidden; t.setAttribute('aria-expanded', !f.hidden); if (!f.hidden) $('#msgIn').focus(); },
  pvmic: () => {
    const SR = getSR(); if (!SR) { $('#form').hidden = false; updatePV(); return; }
    if (PV.on) { try { PV.rec.stop(); } catch { /* ignore */ } return; }
    try { speechSynthesis.cancel(); } catch { /* ignore */ }
    const r = new SR(); r.lang = navigator.language || 'en-US'; r.interimResults = true; r.continuous = false; PV.rec = r; PV.status = '';
    r.onresult = e => {
      let fin = '', tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t; else tmp += t; }
      if (tmp) $('#pvstate').textContent = '“' + tmp.trim() + '”';
      if (fin.trim()) { PV.spoken = true; send(fin.trim()); }
    };
    r.onerror = e => { if (['not-allowed', 'service-not-allowed'].includes(e.error)) { PV.status = 'blocked'; $('#form').hidden = false; } };
    r.onend = () => { PV.on = false; updatePV(); };
    PV.on = true; try { r.start(); } catch { PV.on = false; } updatePV();
  },
  vtts: () => { V.tts = !V.tts; if (!V.tts) stopSpeech(); updateVoiceUI(); },
  vtype: () => { const f = $('#vform'); f.hidden = !f.hidden; if (!f.hidden) $('#msgIn').focus(); },
  flip: t => { const m = S.msgs[+t.dataset.i]; if (m) { m.who = m.who === 'hcp' ? 'patient' : 'hcp'; renderTranscript(); } },
  speaker: t => { S.speaker = t.dataset.v; syncWho(); renderChips(); $('#msgIn').focus(); },
  chip: t => { PV.spoken = false; send(t.dataset.v); },
  reask: t => {
    if (S.busy) return;
    const k = t.dataset.k, f = REASK[k];
    delete S.fields[k]; S.tries[k] = 0; S.asked = k;
    S.msgs.push({ who: 'ai', text: k === 'reaction' ? QUESTIONS.reaction() : `No problem, let's fix that. ${typeof f === 'function' ? f() : f}` });
    renderCap(); renderMsgs(); renderChips();
  },
  fchip: t => answerFollow(t.dataset.v),
  toReview: () => { S.consent = false; S.edit = { rep: false, ev: false }; go('review'); },
  submit: t => {
    // Verification: one calm summary of exactly what leaves the phone, before anything is sent
    const f = S.fields, m = S.med, doubts = doubtful();
    const li = (l, v) => v ? `<div class="kv"><span>${l}</span><b>${esc(v)}</b></div>` : '';
    const el = document.createElement('div'); el.className = 'sheet-ov';
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="cf-h">
      <div class="sheet-h"><h2 id="cf-h">Send to ${esc(company())}?</h2></div>
      <p class="hint" style="margin:0 0 6px">This is what their safety team will receive.</p>
      ${li('Medicine', medLabel(m))}${li('What happened', f.reaction)}${li('Started', f.onset)}${li('Severity', fits('severity', f.severity) ? f.severity : '')}${li('Patient', [f.initials, f.age, f.sex].filter(Boolean).join(' · '))}
      <div class="wrow">${ic('user')}<div><small>Your name and contact go separately, only for follow-up questions.</small></div></div>
      ${doubts.length ? `<p class="hint" style="color:var(--amber);font-weight:600;margin:0">Still marked to check: ${doubts.map(fieldLabel).join(', ')}. Those answers are left out of the summary.</p>` : ''}
      <button class="btn primary" data-go>${ic('send')} Send report</button>
      <button class="link" data-close>Go back and check</button></div>`;
    const close = () => el.remove();
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-close]')) close();
      else if (e.target.closest('[data-go]')) { close(); sendReport(t); }
    });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    $('#phone').appendChild(el); el.querySelector('[data-go]').focus();
  },
  gofollow,
  newreport() {
    S.timers.forEach(clearTimeout); notif.hidden = true;
    S.med = { name: '', dose: '', batch: '', mfr: '', source: '' }; S.photo = null; S.msgs = []; S.fields = {}; S.report = null; S.stage = 0; S.notified = false; S.sealed = false; S.narrEdited = false;
    go('capture');
  },
};

document.addEventListener('change', e => {
  if (e.target.id !== 'eco') return;
  S.eco = e.target.checked; store.set('safereport.eco', S.eco); go('capture');
});

async function sendReport(t) {
  t.disabled = true; t.innerHTML = '<span class="pulse" style="width:22px;height:22px;border-width:3px;margin:0"></span> Submitting to Exasol…';
  let id = 'SR-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  try {
    const payload = {
      drug: (S.med.name || 'Unknown').trim(),
      event_term: (S.fields.reaction || 'Unspecified adverse reaction').trim(),
      age: parseInt(S.fields.age, 10) || null,
      sex: (S.fields.sex || '').toUpperCase().slice(0, 1) || null,
      serious: /hospital|death|life-threat|disab|severe/i.test((S.fields.severity || '') + ' ' + (S.narr || '')),
      country: (S.profile.country || 'DE').toUpperCase().slice(0, 2),
      narrative: (S.narr || '').trim(),
      reporter: S.profile,
      med: S.med,
      fields: S.fields,
    };
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const j = await res.json();
      if (j.report_id) id = j.report_id;
    }
  } catch (e) {
    console.warn('Exasol submit failed, falling back to local ID:', e);
  }
  await sleep(600);
  S.report = { id, times: [clock()] }; S.stage = 1; S.notified = false; S.sealed = false;
  S.follow = []; S.followIdx = 0;
  S.timers.forEach(clearTimeout);
  go('report');
}

const pinOk = p => /^\d{4,6}$/.test(p);
/* Nudge, never block: flag PINs that are easy to guess (repeats, runs, years) */
const weakPin = p => /^(\d)\1+$/.test(p) || /^(\d\d)\1+$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p) || /^(19|20)\d\d$/.test(p);
function pinHint(p) {
  if (!p) return 'Pick digits that aren\'t a sequence, a repeat or a birth year.';
  if (!pinOk(p)) return 'Use 4 to 6 digits.';
  return weakPin(p) ? '<span class="weak">Easy to guess. Someone who picks up your phone could open your reports. Try a less obvious PIN.</span>' : '<span class="strong">Good PIN.</span>';
}
function validateSignup() {
  const b = $('#su-save'); if (!b) return;
  b.disabled = !(draft.role && draft.name.trim().length > 1 && draft.contact.trim().length > 4 && pinOk(draft.pin));
}
function validateSignin() {
  const b = $('#si-btn'); if (!b) return;
  b.disabled = !(sign.contact.trim().length > 4 && pinOk(sign.pin));
}
function bind(name) {
  if (name === 'chat') bindChat();
  if (name === 'symptom') bindSymptom();
  if (name === 'followup') bindFollow();
  if (name === 'signup') validateSignup();
  if (name === 'signin') validateSignin();
  if (name === 'review') { const c = $('#consent'); c.checked = !!S.consent; c.addEventListener('change', () => { S.consent = c.checked; updateSubmit(); }); updateSubmit(); }
}
document.addEventListener('focusin', e => {
  const k = e.target.dataset?.med, box = $('.hl-box'); if (!k || !box) return;
  box.classList.add('focus'); box.querySelectorAll('.hl').forEach(h => h.classList.toggle('on', h.dataset.k === k));
});
document.addEventListener('focusout', e => {
  if (!e.target.dataset?.med) return; const box = $('.hl-box'); if (!box) return;
  box.classList.remove('focus'); box.querySelectorAll('.hl').forEach(h => h.classList.remove('on'));
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.matches('[data-si],[data-bind]')) return;
  const b = $('#si-btn') || $('#su-save'); if (b && !b.disabled) b.click();
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.bind) { draft[t.dataset.bind] = t.dataset.bind === 'pin' ? t.value.replace(/\D/g, '') : t.value; if (t.dataset.bind === 'pin') { t.value = draft.pin; const h = $('#su-pinhint'); if (h) h.innerHTML = pinHint(draft.pin); } err('#su-err', ''); validateSignup(); }
  if (t.dataset.si) { sign[t.dataset.si] = t.dataset.si === 'pin' ? t.value.replace(/\D/g, '') : t.value; if (t.dataset.si === 'pin') t.value = sign.pin; err('#si-err', ''); validateSignin(); }
  if (t.dataset.evf) { const v = t.value.trim(); if (v) S.fields[t.dataset.evf] = v; else delete S.fields[t.dataset.evf]; }
  if (t.dataset.narr) { S.narr = t.value; S.narrEdited = true; updateSubmit(); }
  if (t.dataset.med) { S.med[t.dataset.med] = t.value; t.classList.add('edited'); const c = $('#confirm'); if (c) c.disabled = !S.med.name.trim(); }
});

/* file inputs */
for (const id of ['fileCamera', 'fileUpload']) {
  $('#' + id).addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) runExtract({ file: f, label: 'Reading your photo…' });
  });
}

/* In-app camera: live viewfinder -> shutter -> preview (Retake / Use photo). Falls back to the file picker. */
let camStream = null;
async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return $('#fileCamera').click();
  const el = document.createElement('div'); el.className = 'scanner cam';
  el.innerHTML = `<video playsinline muted autoplay></video><img class="cam-prev" alt="Captured photo" hidden>
    <div class="cam-top"><button class="cam-btn" id="cam-x" aria-label="Close camera"><svg class="ic" viewBox="0 0 24 24">${P.close}</svg></button><span id="cam-msg">Fill the frame with the pack label</span></div>
    <div class="cam-bar" id="cam-live"><button class="cam-btn" id="cam-up" aria-label="Choose from gallery">${ic('upload')}</button><button class="shutter" id="cam-shot" aria-label="Take photo"></button><button class="cam-btn" id="cam-flip" aria-label="Switch camera"><svg class="ic" viewBox="0 0 24 24">${P.flip}</svg></button></div>
    <div class="cam-bar" id="cam-review" hidden><button class="btn line" id="cam-retake" style="flex:1">Retake</button><button class="btn green" id="cam-use" style="flex:1">${ic('check')} Use photo</button></div>`;
  $('#phone').appendChild(el);
  const video = $('video', el), msg = $('#cam-msg', el);
  let mode = 'environment', blob = null;
  const stop = () => { camStream?.getTracks().forEach(t => t.stop()); camStream = null; };
  const close = () => { stop(); el.remove(); };
  async function start() {
    stop();
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      video.srcObject = camStream; await video.play();
      msg.textContent = 'Fill the frame with the pack label';
    } catch (e) {
      msg.textContent = e.name === 'NotAllowedError' ? 'Camera access is blocked. Allow it in the browser, or choose a photo from the gallery.' : 'No camera found. Choose a photo from the gallery instead.';
    }
  }
  $('#cam-x', el).onclick = close;
  $('#cam-up', el).onclick = () => { close(); $('#fileUpload').click(); };
  $('#cam-flip', el).onclick = () => { mode = mode === 'environment' ? 'user' : 'environment'; start(); };
  $('#cam-shot', el).onclick = () => {
    if (!video.videoWidth) return;
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    c.toBlob(b => {
      blob = b; const img = $('.cam-prev', el); img.src = URL.createObjectURL(b); img.hidden = false;
      $('#cam-live', el).hidden = true; $('#cam-review', el).hidden = false; msg.textContent = 'Is the text sharp and readable?';
    }, 'image/jpeg', 0.92);
  };
  $('#cam-retake', el).onclick = () => { $('.cam-prev', el).hidden = true; $('#cam-live', el).hidden = false; $('#cam-review', el).hidden = true; msg.textContent = 'Fill the frame with the pack label'; };
  $('#cam-use', el).onclick = () => { const f = new File([blob], 'pack-photo.jpg', { type: 'image/jpeg' }); close(); runExtract({ file: f, label: 'Reading your photo…' }); };
  start();
}

/* QR scanner: real camera + BarcodeDetector when available, otherwise a simulated scan */
let stream = null;
async function openScanner() {
  const el = document.createElement('div'); el.className = 'scanner';
  el.innerHTML = `<video playsinline muted></video><div class="frame"></div>
    <div class="sb"><b style="font-size:18px">Point at the QR code</b><span id="sc-msg" style="font-size:14px;opacity:.8">Hold steady until it scans</span>
    <button class="btn line" id="sc-x">Cancel</button></div>`;
  $('#phone').appendChild(el);
  let stopped = false;
  const close = () => { stopped = true; stream?.getTracks().forEach(t => t.stop()); stream = null; el.remove(); };
  const done = payload => { close(); runExtract({ qr: parseQR(payload), label: 'Reading QR code…' }); };
  $('#sc-x', el).onclick = close;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('video', el); v.srcObject = stream; await v.play();
    if ('BarcodeDetector' in window) {
      const det = new BarcodeDetector({ formats: ['qr_code'] });
      while (!stopped) {
        const codes = await det.detect(v).catch(() => []);
        if (codes.length) return done(codes[0].rawValue);
        await sleep(300);
      }
    } else $('#sc-msg', el).textContent = 'QR scanning is not available on this device. Try taking a photo of the pack instead.';
  } catch { $('#sc-msg', el).textContent = 'Camera not available. Allow camera access, or take a photo of the pack instead.'; }
}
function parseQR(raw) {
  const kv = {};
  String(raw).split(/[;|\n&]/).forEach(p => { const m = p.match(/^\s*([A-Za-z_ ]+)\s*[=:]\s*(.+)$/); if (m) kv[m[1].trim().toLowerCase()] = m[2].trim(); });
  const pick = (...ks) => ks.map(k => kv[k]).find(Boolean) || '';
  const q = { name: pick('name', 'drug', 'product'), dose: pick('dose', 'strength'), batch: pick('batch', 'lot', 'bn'), mfr: pick('mfr', 'manufacturer', 'mfg') };
  return q.name || q.batch ? q : { name: '', dose: '', batch: String(raw).slice(0, 20), mfr: '' };
}

/* ---------- boot ---------- */
(async function boot() {
  try { const r = await fetch('/api/health', { cache: 'no-store' }); if (r.ok) { const h = await r.json(); S.live = !!(h.claude || h.gemini); S.canExtract = !!h.extract; S.ocrName = h.ocr_provider || ''; } } catch { /* offline demo mode */ }
  const tick = () => { const c = $('#clock'); if (c) c.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, ''); };
  tick(); setInterval(tick, 30000);
  go('welcome');   // every launch opens on the capsule animation
})();
})();
