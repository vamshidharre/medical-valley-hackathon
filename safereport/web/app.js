/* SafeReport — mobile ICSR reporter. Vanilla JS, no build step.
   Works fully offline with simulated AI; if /api/health reports Claude, real OCR + LLM are used. */
(() => {
const $ = (s, el = document) => el.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- icons ---------- */
const P = {
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-4M14 18h2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  doc: '<path d="M7 3h8l4 4v14H7z"/><path d="M9 12h8M9 16h6"/>',
  steth: '<path d="M6 3v6a4 4 0 008 0V3M10 13v2a5 5 0 0010 0v-1"/><circle cx="20" cy="12" r="2"/>',
  pill: '<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M9 8l6 8" />',
  bag: '<path d="M5 8h14l-1 12H6zM9 8a3 3 0 016 0"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 5a3.5 3.5 0 010 7M18 14c2.2.6 3.5 2.4 3.5 5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
  flip: '<path d="M4 7h12l-3-3M20 17H8l3 3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  bell: '<path d="M6 16v-5a6 6 0 1112 0v5l1.5 2h-15zM10 20.5a2 2 0 004 0"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5L15.5 10"/>',
};
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
const ROLES = [
  ['Patient', 'user', 'I took the medicine'], ['Doctor', 'steth', 'Registered physician'],
  ['Chemist', 'bag', 'Pharmacist / chemist'], ['Other HCP', 'people', 'Nurse, dentist, etc.'],
];
const STEPS = [['capture', 'Capture'], ['details', 'Details'], ['chat', 'Chat'], ['review', 'Review'], ['report', 'Report']];
const S = {
  screen: 'signup', profile: null, med: { name: '', dose: '', batch: '', mfr: '', source: '' }, photo: null,
  msgs: [], fields: {}, asked: null, speaker: 'patient', busy: false, capOpen: true,
  scanSeq: 0, returnTo: null, edit: { rep: false, ev: false }, consent: false, report: null, stage: 0, follow: [], followIdx: 0, timers: [], live: false, canExtract: false, ocrName: '', notified: false,
};
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const isPatient = () => S.profile?.role === 'Patient';
const company = () => S.med.mfr || 'the manufacturer';

/* ---------- shell ---------- */
const screen = $('#screen'), nav = $('#progress'), notif = $('#notif');

function go(name) {
  if (S.screen === 'chat' && name !== 'chat') haltVoice();
  const changed = name !== S.screen;
  S.screen = name;
  screen.className = 'screen' + (changed ? ' enter' : '') + (name === 'chat' ? ' chat' : '') + (name === 'welcome' ? ' welcome' : '');
  $('#phone').classList.toggle('on-blue', name === 'welcome');
  $('#phone').dataset.screen = name;
  const fn = { welcome, signin, signup, capture, details, chat, review, report, followup }[name];
  screen.innerHTML = fn();
  screen.scrollTop = 0;
  bind(name);
  renderNav();
}

const NAVICON = { capture: 'camera', details: 'doc', chat: 'people', review: 'shield', report: 'check' };
function renderNav() {
  const idx = STEPS.findIndex(s => s[0] === S.screen);
  nav.hidden = idx < 0;
  if (idx < 0) return;
  nav.innerHTML = STEPS.map(([k, label], i) => {
    const cls = i < idx ? 'done' : i === idx ? 'now' : '';
    const badge = k === 'followup' && S.notified && S.screen !== 'followup' ? '<b class="badge"></b>' : '';
    return `<div class="pn ${cls}" title="Step ${i + 1} of ${STEPS.length}: ${label}">${ic(i < idx ? 'check' : NAVICON[k])}<span>${label}</span>${badge}</div>`;
  }).join('');
}

document.addEventListener('click', e => {
  if (e.target.matches('input,textarea,select')) return;
  const t = e.target.closest('[data-act]');
  if (t && !t.disabled) actions[t.dataset.act]?.(t, e);
});

/* ---------- 0. welcome ---------- */
function welcome() {
  return `<div class="wel-art"><span class="ring r1"></span><span class="ring r2"></span><div class="cross">${CROSS}</div></div>
  <h1>Your Health,<br>One Tap Away</h1>
  <p>Report medicine side effects to the manufacturer in minutes, anytime, anywhere.</p>
  <button class="getstarted" data-act="start"><span>Get started</span><b>${ic('back').replace('<path d="M15 5l-7 7 7 7"/>', '<path d="M9 5l7 7-7 7"/>')}</b></button>`;
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
  return `
  <div class="top" style="padding-bottom:0">${backBtn('gowelcome')}</div>
  <div class="top">${LOGO}<div><h1>Welcome back</h1><p>Sign in to report a side effect.</p></div></div>
  <div class="card">
    <label class="label" for="si-contact">Phone or email</label>
    <input class="input" id="si-contact" data-si="contact" autocomplete="username" placeholder="The one you signed up with" value="${esc(sign.contact)}">
    <label class="label" for="si-pin">PIN</label>
    <input class="input" id="si-pin" data-si="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" placeholder="Your 4 to 6 digit PIN" value="${esc(sign.pin)}">
    <p class="hint" id="si-err" style="color:var(--red);font-weight:600" hidden></p>
  </div>
  <div class="footer"><button class="btn primary" id="si-btn" data-act="signIn" disabled>Sign in</button>
    <button class="link" data-act="gosignup">New here? Create an account</button></div>`;
}

function signup() {
  return `
  <div class="top" style="padding-bottom:0">${backBtn('signupback')}</div>
  <div class="top">${LOGO}<div><h1>Create your account</h1><p>Report a medicine side effect in minutes.</p></div></div>
  <div class="card"><h3>Who are you?</h3>
    <div class="roles">${ROLES.map(([r, i, d]) => `<button class="role ${draft.role === r ? 'on' : ''}" data-act="role" data-v="${r}">${ic(i)}<b>${r}</b><span>${d}</span></button>`).join('')}</div>
    <label class="label" for="su-name">Full name</label>
    <input class="input" id="su-name" data-bind="name" autocomplete="name" placeholder="e.g. Asha Verma" value="${esc(draft.name)}">
    <label class="label" for="su-contact">Phone or email</label>
    <input class="input" id="su-contact" data-bind="contact" autocomplete="username" placeholder="So the company can follow up" value="${esc(draft.contact)}">
    <label class="label" for="su-country">Country <span style="font-weight:500;color:var(--ink-2)">(optional)</span></label>
    <input class="input" id="su-country" data-bind="country" autocomplete="country-name" placeholder="e.g. India" value="${esc(draft.country)}">
    <label class="label" for="su-pin">Create a PIN</label>
    <input class="input" id="su-pin" data-bind="pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" placeholder="4 to 6 digits" value="${esc(draft.pin)}">
    <p class="hint" id="su-err" style="color:var(--red);font-weight:600" hidden></p>
    <p class="hint">Saved on this device only. You will use your phone or email and PIN to sign in.</p>
  </div>
  <div class="footer"><button class="btn primary" id="su-save" data-act="saveProfile" disabled>Create account</button>
    <button class="link" data-act="gosignin">Already have an account? Sign in</button></div>`;
}

/* ---------- 2. capture ---------- */
function capture() {
  const p = S.profile;
  const go = '<span class="go">' + ic('back') + '</span>';
  return `
  <div class="top"><div class="grow"><h1>Hello,<br>${esc(p.name.split(' ')[0])}</h1><p>${esc(p.role)} · new report</p></div>
    <button class="avatar" data-act="resetProfile" title="Sign out" aria-label="Sign out">${esc(p.name.trim()[0] || '?').toUpperCase()}</button></div>
  <div class="hero"><div><h2>Which medicine?</h2><p>Photograph the pack so we can read the name, dose and batch for you.</p></div>${CROSS}</div>
  <div class="sec"><h2>Add your medicine</h2></div>
  <div class="stack">
    <button class="big" data-act="camera"><span class="bi b">${ic('camera')}</span><span><b>Take a photo</b><small>Front of the pack or strip</small></span>${go}</button>
    <button class="big" data-act="upload"><span class="bi g">${ic('upload')}</span><span><b>Upload a photo</b><small>Choose from your gallery</small></span>${go}</button>
    <button class="big" data-act="qr"><span class="bi a">${ic('qr')}</span><span><b>Scan QR code</b><small>On the pack or leaflet</small></span>${go}</button>
  </div>`;
}

function scanning(imgUrl, label) {
  screen.className = 'screen enter';
  S.screen = 'capture'; renderNav();
  screen.innerHTML = `<div class="top"><div class="grow"><h1>Reading your pack</h1><p>${label}</p></div></div>
  <div class="card scan-card">${imgUrl ? `<img class="scanimg" src="${imgUrl}" alt="Medicine pack">` : ''}<div class="pulse"></div>
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
function resetConversation() { S.msgs = []; S.fields = {}; S.asked = null; S.narrEdited = false; S.returnTo = null; }
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
  <div class="top">${backBtn('back-capture')}<div><h1>Check the details</h1><p>Fix anything we read wrongly.</p></div></div>
  ${S.photo ? `<div class="card hl-card">${hlImage()}${anyBox ? hlLegend() : ''}<p class="hint">${anyBox ? 'Colours show where each detail was found on your pack. Tap the photo to enlarge.' : 'Your photo. Tap it to enlarge.'}</p></div>` : ''}
  <div class="card">
    ${m.source && m.source !== 'Entered manually' ? `<span class="pill g">${ic('check').replace('class="ic"', 'class="ic" style="width:14px;height:14px"')} ${esc(m.source)}</span>` : ''}
    ${f('name', 'Medicine name', 'e.g. Paracetamol')}${f('dose', 'Dose / strength', 'e.g. 500 mg tablet')}
    ${f('batch', 'Batch number', 'Printed near the expiry date')}${f('mfr', 'Manufacturer', 'Company on the pack')}
    ${['name', 'dose', 'batch', 'mfr'].some(k => !m[k]) && /^Read from/.test(m.source) ? '<p class="hint" style="color:var(--amber);font-weight:600">Some fields could not be read — please fill them in.</p>' : '<p class="hint">The batch number helps the company trace the exact lot.</p>'}
    </div>
  <div class="footer"><button class="btn green" id="confirm" data-act="confirm" ${m.name.trim() ? '' : 'disabled'}>${ic('check')} ${S.returnTo ? 'Save changes' : 'Confirm details'}</button></div>`;
}

/* ---------- 4. chat ---------- */
function chat() {
  if (!isPatient()) return chatHCP();
  const hcp = false;
  return `
  <div class="chat-head"><div class="row"><button class="avatar" data-act="back-details" aria-label="Back">${ic('back')}</button><div class="grow"><h2>${hcp ? 'Case discussion' : 'Tell me what happened'}</h2><small>${esc(S.med.name)} · ${esc(S.med.dose)}</small></div>
    <button class="mini" id="toReview" data-act="toReview" disabled>Review</button></div>
    ${hcp ? `<div class="people"><span class="person"><i style="background:#d4881f">P</i>Patient</span><span class="person"><i style="background:var(--blue)">${esc(S.profile.role[0])}</i>You</span><span class="person"><i style="background:var(--green)">AI</i>Listening</span></div>` : ''}</div>
  <div class="cap" id="cap"></div>
  <div class="msgs" id="msgs" aria-live="polite"></div>
  <div class="chips" id="chips"></div>
  <div class="composer">
    ${hcp ? `<div class="who" id="who"><button data-act="speaker" data-v="patient" class="p">As patient</button><button data-act="speaker" data-v="hcp">As me (${esc(S.profile.role)})</button></div>` : ''}
    <form class="send-row" id="form"><input class="input" id="msgIn" placeholder="${hcp ? 'Type a message…' : 'Type your answer…'}" autocomplete="off"><button class="send" aria-label="Send" type="submit">${ic('send')}</button></form></div>`;
}

const captured = () => FIELDS.filter(([k]) => S.fields[k]).length;
const missing = () => FIELDS.filter(([k]) => !S.fields[k]).map(f => f[0]);

function renderCap(newKeys = []) {
  const n = captured(), pct = Math.round(n / FIELDS.length * 100);
  const hcp = !isPatient();
  $('#cap').innerHTML = `<button class="cap-h" data-act="togglecap" ${hcp ? '' : 'disabled'}><span>${hcp ? 'Captured fields · tap one to correct it' : 'Report progress'}</span><div class="bar"><i style="width:${pct}%"></i></div><span>${n}/${FIELDS.length}</span>${hcp ? ic('chev') : ''}</button>
  ${hcp && S.capOpen ? `<div class="cap-grid">${FIELDS.map(([k, l]) => `<div class="cf ${S.fields[k] ? 'ok' : ''} ${newKeys.includes(k) ? 'new' : ''}" data-act="editcf" data-k="${k}"><b>${l}</b><span>${esc(S.fields[k] || 'not yet')}</span></div>`).join('')}</div>` : ''}`;
  const btn = $('#toReview');
  if (btn) { btn.disabled = !(S.fields.reaction || S.msgs.some(m => !m.sys && m.who !== 'ai')); btn.style.background = missing().length ? '' : 'var(--green)'; }
}

function renderMsgs(typing) {
  if (!isPatient()) return renderTranscript();
  const box = $('#msgs'); if (!box) return;
  const hcp = !isPatient();
  const mine = who => (hcp ? who === 'hcp' : who === 'patient');
  const name = w => w === 'ai' ? 'SafeReport AI' : w === 'patient' ? 'Patient' : S.profile.role;
  box.innerHTML = S.msgs.map(m => m.sys ? `<div class="sys">${esc(m.text)}</div>`
    : `<div class="m ${m.who === 'ai' ? 'ai' : mine(m.who) ? 'me' : ''}"><small>${name(m.who)}</small><p>${esc(m.text)}</p></div>`).join('')
    + (typing ? '<div class="m ai"><small>SafeReport AI</small><p class="typing"><i></i><i></i><i></i></p></div>' : '');
  box.scrollTop = box.scrollHeight;
}

const CHIPS = {
  patient: { reaction: ['I got a red itchy rash', 'I felt dizzy and sick', 'Bad headache and nausea'], onset: ['About 2 hours after the dose', 'It started yesterday'], severity: ['Mild, I managed', 'Severe, I went to the doctor'], action: ['I stopped taking it', 'I kept taking it'], outcome: ['Much better now', 'Still ongoing'], initials: ['My initials are A.V.'], age: ['I am 34, female', 'I am 52, male'], otherMeds: ['No other medicines', 'I take metformin'] },
  hcp: { reaction: ['Patient has a rash on the arms and chest', 'Reports dizziness and vomiting'], onset: ['It began 3 hours after the first dose'], severity: ['Moderate, no hospital visit needed', 'Severe, she was hospitalised'], action: ['I advised to stop the medicine', 'Medicine was continued'], outcome: ['Recovering after stopping', 'Not recovered yet'], age: ['Female patient, 34 years old'], otherMeds: ['No other medicines', 'Also on amlodipine'] },
};
function renderChips() {
  const box = $('#chips'); if (!box) return;
  const sp = isPatient() ? 'patient' : S.speaker;
  const next = S.asked && !S.fields[S.asked] ? S.asked : missing()[0];
  const list = next ? CHIPS[sp === 'patient' ? 'patient' : 'hcp'][next] || [] : [];
  box.innerHTML = list.map(t => `<button class="chip" data-act="chip" data-v="${esc(t)}">${esc(t)}</button>`).join('');
}

function bindChat() {
  if (!isPatient()) return bindVoice();
  S.speaker = 'patient';
  if (!S.msgs.length) {
    const hello = isPatient()
      ? `Hi ${S.profile.name.split(' ')[0]}, I'm sorry you had a problem with ${S.med.name}. I'll ask a few quick questions for the report. What happened after you took it?`
      : `I'm listening in on this case for ${S.med.name}. Talk freely — I'll fill in the report and only ask you, the ${S.profile.role}, about anything still missing.`;
    S.msgs.push({ who: 'ai', text: hello });
    S.asked = isPatient() ? 'reaction' : null;
  }
  renderCap(); renderMsgs(); renderChips(); syncWho();
  $('#form').addEventListener('submit', e => { e.preventDefault(); const i = $('#msgIn'); const v = i.value.trim(); if (v) { i.value = ''; send(v); } });
}
function syncWho() {
  document.querySelectorAll('#who button').forEach(b => b.classList.toggle('on', b.dataset.v === S.speaker));
  const i = $('#msgIn'); if (i && !isPatient()) i.placeholder = S.speaker === 'patient' ? 'Type what the patient says…' : 'Type as the ' + S.profile.role + '…';
}

async function send(text) {
  if (S.busy) return;
  const who = isPatient() ? 'patient' : S.speaker;
  S.msgs.push({ who, text });
  S.busy = true; renderMsgs(true);
  let res;
  if (S.live) {
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: S.profile.role, med: S.med, messages: S.msgs.filter(m => !m.sys), fields: S.fields }) });
      if (!r.ok) throw 0;
      res = await r.json();
    } catch { S.live = false; }
  }
  if (!res) { await sleep(750); res = mockAI(text, who); }
  const before = { ...S.fields };
  for (const [k, v] of Object.entries(res.fields || {})) if (v && FIELDS.some(f => f[0] === k)) S.fields[k] = v;
  const fresh = FIELDS.map(f => f[0]).filter(k => S.fields[k] && S.fields[k] !== before[k]);
  if (!isPatient() && fresh.length) S.msgs.push({ sys: true, text: 'Captured: ' + fresh.map(k => FIELDS.find(f => f[0] === k)[1]).join(', ') });
  if (res.reply) S.msgs.push({ who: 'ai', text: res.reply });
  S.asked = res.asked !== undefined ? res.asked : (missing()[0] || null);
  S.busy = false;
  renderCap(fresh); renderMsgs(); renderChips();
}

/* ---- voice case discussion (Doctor / Chemist / Other HCP) ----
   The mic streams speech-to-text (browser Web Speech API). The LLM labels every utterance as HCP or
   patient, fills the captured fields, and asks follow-up questions (spoken) when something is missing. */
const getSR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
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
function haltVoice() { V.on = false; try { V.rec?.abort(); } catch { /* ignore */ } clearTimeout(V.timer); try { speechSynthesis.cancel(); } catch { /* ignore */ } V.speaking = false; V.pending = []; V.interim = ''; }
function addSegment(t) { V.pending.push(t); V.interim = ''; schedule(); if (V.pending.length >= 4) flush(false); }
function schedule() { clearTimeout(V.timer); V.timer = setTimeout(() => flush(true), 3200); }   // a pause = time to label and maybe ask

async function flush(allowQ) {
  if (!V.pending.length) return;
  if (V.busy) return schedule();
  const segs = V.pending.splice(0); V.interim = '';
  V.busy = true; renderTranscript(); updateVoiceUI();
  const ask = allowQ && Date.now() - V.lastQ > 15000;
  let res = null;
  if (S.live) {
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
  if (!V.tts || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text); u.rate = 1.02;
  V.speaking = true; try { V.rec?.stop(); } catch { /* ignore */ }   // don't transcribe the AI's own voice
  updateVoiceUI();
  const done = () => { V.speaking = false; if (V.on) { try { V.rec.start(); } catch { /* ignore */ } } updateVoiceUI(); };
  u.onend = done; u.onerror = done;
  speechSynthesis.speak(u);
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
  initials: () => 'What are your initials, for example R.K.? We use initials instead of your full name to protect your privacy.',
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
function extractFields(t) {
  const x = t.toLowerCase(), out = {};
  let m;
  if ((m = t.match(/\binitials?\s*(?:are|is|:)?\s*([A-Za-z]\.?\s?[A-Za-z]\.?(?:\s?[A-Za-z]\.?)?)(?![A-Za-z])/i)) && fmtInitials(m[1])) out.initials = fmtInitials(m[1]);
  if ((m = x.match(/(\d{1,3})\s*(?:-?\s*)(?:years?|yrs?|y\/?o|yo)\b/) || x.match(/\baged?\s+(\d{1,3})\b/) || x.match(/\bi am (\d{1,3})\b/) || x.match(/^\s*(\d{1,3})\s*$/))) out.age = m[1] + ' years';
  if (/\b(female|woman|girl|she|her|lady)\b/.test(x)) out.sex = 'Female'; else if (/\b(male|man|boy|he|his|him)\b/.test(x)) out.sex = 'Male';
  const rx = REACTIONS.filter(r => x.includes(r));
  if (rx.length) out.reaction = rx.map(r => ({ dizz: 'dizziness', vomit: 'vomiting', swell: 'swelling', breath: 'breathlessness', diarrh: 'diarrhoea', palpitation: 'palpitations', drows: 'drowsiness', itch: 'itching', sick: 'feeling sick' }[r] || r)).join(', ');
  if ((m = x.match(/(\d+|an?|one|two|three|few|several)\s*(minutes?|hours?|days?|weeks?)(?:\s*(?:ago|after|later|since))/) || x.match(/\b(yesterday|today|last night|this morning|since \w+)\b/))) out.onset = m[0].replace(/^(a|an)\b/, '1');
  if (/hospital|admitted|emergency|icu|life.threat/.test(x)) out.severity = 'Serious — hospital care'; else if (/\bsevere|very bad|terrible|unbearable|went to (?:the )?doctor/.test(x)) out.severity = 'Severe'; else if (/moderate|quite bad/.test(x)) out.severity = 'Moderate'; else if (/\bmild|slight|little|manageable|managed/.test(x)) out.severity = 'Mild';
  if (/stopp?ed|discontinu|withdr|not take|no longer|advised (?:\w+ )?to stop|\bstop (?:the|taking|it)/.test(x)) out.action = 'Medicine stopped'; else if (/reduc|lower(ed)? the dose/.test(x)) out.action = 'Dose reduced'; else if (/continu|kept|still taking|carry on/.test(x)) out.action = 'Medicine continued';
  if (/not recovered|still|ongoing|persist|same/.test(x)) out.outcome = 'Not yet recovered'; else if (/worse|worsen/.test(x)) out.outcome = 'Getting worse'; else if (/recovered|resolved|gone/.test(x)) out.outcome = 'Recovered'; else if (/better|improv|recovering/.test(x)) out.outcome = 'Recovering';
  if (/no other (medic|drug|tablet)|nothing else|not taking any|none\b/.test(x)) out.otherMeds = 'None'; else if ((m = t.match(/(?:also (?:on|taking|takes)|along with|concomitant(?:ly)?(?: medicines?)?:?|other medicines?:?|i take|i am on|she takes|he takes)\s+([^.,;?]{3,50})/i))) out.otherMeds = m[1].trim();
  return out;
}
function mockAI(text, who) {
  const found = extractFields(text);
  const ask = S.asked;
  // a direct answer to the question just asked is accepted even if keywords didn't match
  if (isPatient() && ask === 'initials' && !found.initials && fmtInitials(text)) found.initials = fmtInitials(text);
  else if (isPatient() && ask && ask !== 'initials' && !found[ask] && !(ask === 'age' && found.sex) && text.length <= 80) found[ask] = text.replace(/^\W+|\W+$/g, '');
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
  const f = S.fields, m = S.med, p = S.profile || {};
  if (!f.reaction) return S.msgs.filter(x => !x.sys && x.who !== 'ai').map(x => x.text).join(' ');
  const who = [f.age && f.age.replace(/^(\d+) years?$/, '$1-year-old'), f.sex && f.sex.toLowerCase()].filter(Boolean).join(' ');
  const pt = (who ? 'A ' + who + ' patient' : 'A patient') + (f.initials ? ' (' + f.initials + ')' : '');
  const ev = f.reaction.charAt(0).toLowerCase() + f.reaction.slice(1);
  const repLine = (p.name && p.name.trim()) ? `Reporter: ${p.name.trim()} (${p.role || 'Patient'}).\n` : '';
  return `${repLine}${pt} experienced ${ev}${f.onset ? ' (onset: ' + f.onset + ')' : ''} while taking ${medLabel(m)}${m.batch ? ' (batch ' + m.batch + ')' : ''}. `
    + `${f.severity ? 'Severity: ' + f.severity + '. ' : ''}${f.action ? f.action + '. ' : ''}${f.outcome ? 'Outcome: ' + f.outcome + '. ' : ''}${f.otherMeds ? 'Other medicines: ' + f.otherMeds + '.' : ''}`.trim();
}
/* The four things a report needs to be processable as a valid case */
const criteria = () => [
  ['Identifiable patient', !!(S.fields.initials || S.fields.age || S.fields.sex), 'Initials, age or sex'],
  ['Identifiable reporter', !!(S.profile.name && S.profile.contact), 'Your name and contact'],
  ['Suspect medicine', !!S.med.name.trim(), 'The medicine name'],
  ['Adverse event', !!S.fields.reaction, 'What went wrong'],
];
function review() {
  const p = S.profile, m = S.med;
  if (!S.narrEdited) S.narr = narrative();
  const crit = criteria(), allOk = crit.every(c => c[1]);
  const row = (l, v, opt) => `<div class="kv"><span>${l}</span><b class="${v ? '' : 'miss'}">${esc(v || (opt ? '—' : 'Not provided'))}</b></div>`;
  const head = (title, act, on) => `<div class="card-h"><h3>${title}</h3><button class="edit" data-act="${act}">${on ? 'Done' : 'Edit'}</button></div>`;
  const rep = S.edit.rep ? `
    <label class="kv-edit"><span>Name</span><input class="input sm" data-rep="name" value="${esc(p.name)}" autocomplete="name"></label>
    <label class="kv-edit"><span>Qualification</span><select class="input sm" data-rep="role">${ROLES.map(([r]) => `<option ${r === p.role ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <label class="kv-edit"><span>Phone or email</span><input class="input sm" data-rep="contact" value="${esc(p.contact)}"></label>
    <label class="kv-edit"><span>Country</span><input class="input sm" data-rep="country" value="${esc(p.country || '')}"></label>
    <p class="hint" id="rep-err" style="color:var(--red);font-weight:600" hidden></p>`
    : `${row('Name', p.name)}${row('Qualification', p.role)}${row('Contact', p.contact)}${row('Country', p.country, true)}`;
  const ev = S.edit.ev
    ? FIELDS.map(([k, l]) => `<label class="kv-edit"><span>${l}</span><input class="input sm" data-evf="${k}" value="${esc(S.fields[k] || '')}" placeholder="Not provided"></label>`).join('')
    : FIELDS.map(([k, l]) => row(l, S.fields[k])).join('');
  return `
  <div class="top">${backBtn('back-chat')}<div><h1>Review your report</h1><p>Check before sending to ${esc(company())}.</p></div></div>
  <div class="card"><h3>Report completeness</h3>
    ${crit.map(([t, ok, hint]) => `<div class="crit ${ok ? 'ok' : ''}"><i>${ok ? ic('check') : ''}</i><div><b>${t}</b><small>${ok ? 'Provided' : hint}</small></div></div>`).join('')}
    <p class="hint" style="margin-top:12px;${allOk ? 'color:var(--green-d)' : 'color:var(--amber)'};font-weight:600">${allOk ? 'This report has everything the company needs to process it.' : 'Some details are missing. You can still submit. The company may contact you for more information.'}</p></div>
  <div class="card">${head('Reporter', 'editrep', S.edit.rep)}${rep}</div>
  <div class="card"><div class="card-h"><h3>Suspect medicine</h3><button class="edit" data-act="editmed">Edit</button></div>${row('Product', m.name)}${row('Dose', m.dose)}${row('Batch', m.batch)}${row('Manufacturer', m.mfr)}</div>
  <div class="card">${head('Patient & event', 'editev', S.edit.ev)}${ev}</div>
  <div class="card"><h3>What happened <span style="color:var(--red)">*</span></h3>
    <textarea class="input textarea" id="narr" data-narr="1" placeholder="Describe the symptoms and complaints in your own words">${esc(S.narr)}</textarea>
    <p class="hint">This is the only required part. Edit it if anything is missing or wrong.</p></div>
  ${S.msgs.some(m => !m.sys && m.who !== 'ai') ? `<div class="card"><h3>Conversation transcript</h3>${S.msgs.filter(m => !m.sys).map(m => `<p class="narr" style="margin-bottom:8px"><b>${m.who === 'ai' ? 'AI' : m.who === 'hcp' ? esc(S.profile.role) : 'Patient'}:</b> ${esc(m.text)}</p>`).join('')}</div>` : ''}
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
const STAGES = [['Report issued', 'Your report was created and is ready for the company.'], ['Received by the company', 'The company will confirm once their safety team starts working on your report. This can take a few days.']];
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
  <div class="center"><h1>Report issued</h1><p>Sent to ${esc(company())}</p></div>
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
  start: () => go('signup'),
  gowelcome: () => go('welcome'),
  signupback: () => go(Object.keys(accounts()).length ? 'signin' : 'welcome'),
  cancelscan: () => { S.scanSeq++; go('capture'); },
  'back-details': () => go('details'),
  zoom: () => {
    const z = document.createElement('div'); z.className = 'zoomer';
    z.innerHTML = `<div class="zoom-bar"><b>Your pack</b><button class="cam-btn" aria-label="Close">${ic('close')}</button></div>${hlImage('62vh')}${Object.keys(HL).some(hasBox) ? hlLegend() : ''}`;
    z.onclick = () => z.remove(); $('#phone').appendChild(z);
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
  role: t => { draft.role = t.dataset.v; document.querySelectorAll('.role').forEach(r => r.classList.toggle('on', r === t)); validateSignup(); },
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
  confirm() { const to = S.returnTo || 'chat'; S.returnTo = null; go(to); },
  'back-capture': () => { if (S.returnTo) { const to = S.returnTo; S.returnTo = null; go(to); } else go('capture'); },
  'back-chat': () => go('chat'),
  togglecap: () => { S.capOpen = !S.capOpen; renderCap(); },
  mic: () => (V.on ? stopVoice() : startVoice()),
  vtts: () => { V.tts = !V.tts; if (!V.tts) try { speechSynthesis.cancel(); } catch { /* ignore */ } updateVoiceUI(); },
  vtype: () => { const f = $('#vform'); f.hidden = !f.hidden; if (!f.hidden) $('#msgIn').focus(); },
  flip: t => { const m = S.msgs[+t.dataset.i]; if (m) { m.who = m.who === 'hcp' ? 'patient' : 'hcp'; renderTranscript(); } },
  speaker: t => { S.speaker = t.dataset.v; syncWho(); renderChips(); $('#msgIn').focus(); },
  chip: t => send(t.dataset.v),
  fchip: t => answerFollow(t.dataset.v),
  toReview: () => { S.consent = false; S.edit = { rep: false, ev: false }; go('review'); },
  submit: async t => {
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
  },
  gofollow,
  newreport() {
    S.timers.forEach(clearTimeout); notif.hidden = true;
    S.med = { name: '', dose: '', batch: '', mfr: '', source: '' }; S.photo = null; S.msgs = []; S.fields = {}; S.report = null; S.stage = 0; S.notified = false; S.sealed = false; S.narrEdited = false;
    go('capture');
  },
};

const pinOk = p => /^\d{4,6}$/.test(p);
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
  if (t.dataset.bind) { draft[t.dataset.bind] = t.dataset.bind === 'pin' ? t.value.replace(/\D/g, '') : t.value; if (t.dataset.bind === 'pin') t.value = draft.pin; err('#su-err', ''); validateSignup(); }
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
  try { const r = await fetch('/api/health', { cache: 'no-store' }); if (r.ok) { const h = await r.json(); S.live = !!h.claude; S.canExtract = !!h.extract; S.ocrName = h.ocr_provider || ''; } } catch { /* offline demo mode */ }
  const tick = () => { const c = $('#clock'); if (c) c.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, ''); };
  tick(); setInterval(tick, 30000);
  go(Object.keys(accounts()).length ? 'signin' : 'welcome');
})();
})();
