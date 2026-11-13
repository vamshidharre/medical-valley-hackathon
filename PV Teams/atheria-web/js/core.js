/* Atheria core — state, persistence, audit chain, shell, router */
(function (root) {
  'use strict';
  const E = root.Engine, C = root.Charts, D = root.DATA, esc = C.esc;
  const A = root.A = { views: {}, E, C, esc };

  /* ---------- storage (best-effort) ---------- */
  const LS = { get(k, d) { try { const v = localStorage.getItem('atheria.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('atheria.' + k, JSON.stringify(v)); } catch (e) { } } };
  A.LS = LS;

  /* ---------- data ---------- */
  A.reports = D.reports.map(r => ({ id: r[0], drug: r[1], event: r[2], age: r[3], sex: r[4], serious: !!r[5], country: r[6], date: r[7], narrative: r[8] || null, ext: r[9] || null }));
  A.byId = new Map(A.reports.map(r => [r.id, r]));
  A.pairs = E.computeAll(A.reports);
  A.pairMap = new Map(A.pairs.map(p => [p.signal_id, p]));
  A.flagged = A.pairs.filter(p => p.is_signal);
  A.drugs = [...new Set(A.reports.map(r => r.drug))].sort();
  A.events = [...new Set(A.reports.map(r => r.event))].sort();
  A.casesOf = p => A.reports.filter(r => r.drug === p.drug && r.event === p.event).sort((a, b) => a.id < b.id ? -1 : 1);
  A.canInvestigate = p => { const c = A.casesOf(p); return c.length > 0 && c.every(r => r.ext); };
  A.sigLabel = p => `${p.drug} + ${p.event}`;
  A.sigUrl = id => '#/signal/' + encodeURIComponent(id);

  /* ---------- audit chain ---------- */
  const extra = LS.get('audit', []);
  A.audit = D.audit.concat(extra);
  A.auditAdd = function (type, actor, payload, persist = true) {
    const prev = A.audit.length ? A.audit[A.audit.length - 1] : null;
    const prevHash = prev ? prev.hash : E.GENESIS, ts = new Date().toISOString().replace('Z', '+00:00');
    const ps = E.canonical(payload), hash = E.eventHash(prevHash, ts, type, actor, ps);
    const ev = { seq: (prev ? prev.seq : 0) + 1, ts, type, actor, payload, ps, prev_hash: prevHash, hash, local: true };
    A.audit.push(ev);
    if (persist) A.persistAudit();
    return ev;
  };
  A.persistAudit = () => LS.set('audit', A.audit.filter(e => e.local));
  if (!E.verifyChain(A.audit).valid) { A.audit = D.audit.slice(); LS.set('audit', []); }

  /* ---------- inbox ---------- */
  A.inbox = LS.get('inbox', []);
  A.persistInbox = () => LS.set('inbox', A.inbox);
  A.triage = function (text, channel, meta = {}) {
    const hash = E.sha256(text + (meta.report_id ? ':' + meta.report_id : ''));
    const dup = A.inbox.find(r => (meta.report_id && (r.id === meta.report_id || (r.meta && r.meta.report_id === meta.report_id))) || (!meta.report_id && r.hash === hash));
    if (dup) return { duplicate: true, record: dup };
    const read = E.readSource(text), v = E.evaluateValidity(read.elements);
    const rec = { id: meta.report_id || ('src_' + hash.slice(0, 10)), hash, channel, text, ts: new Date().toISOString(), meta, elements: read.elements, outcome: v.outcome, trace: v.trace,
      priority: E.priority(read.elements, read.seriousness_signal), serious: read.seriousness_signal, model: 'offline-reader-1', prompt: 'triage_icsr v1.0', products: read.products, ae: read.ae_candidates, sample: !!meta.sample };
    A.inbox.unshift(rec);
    A.auditAdd('ai_triage_proposal', 'system', { source_record_id: rec.id, model_id: rec.model, prompt_version: rec.prompt, criteria: v.trace.inputs, content_sha256: hash }, false);
    A.auditAdd('rule_evaluation', 'system', { source_record_id: rec.id, rule_id: v.trace.rule_id, rule_set_version: v.trace.rule_set_version, fired: v.trace.fired_rules, outcome: v.outcome }, false);
    A.persistAudit(); A.persistInbox();
    return { duplicate: false, record: rec };
  };
  A.SAMPLES = [
    ['web_form', 'Reporter: Dr. Anita Sharma, physician (a.sharma@example-hospital.in, IN)\nPatient: R.K., 54 years, female\nProduct: Atherex 100mg, 100mg once daily\nEvent: Severe itchy rash across the torso\n\nMy patient was prescribed Atherex 100mg once daily for hypertension. Eight days later she developed a severe itchy rash across her torso and was admitted overnight for observation. The drug was withdrawn and the rash began to settle.'],
    ['web_form', 'I read online that people are getting bad stomach bleeding from Atherex. I do not have details of who was affected.'],
    ['web_form', 'Reporter: pharmacist\nCan Atherex 100mg tablets be split in half for easier swallowing? No patient has experienced any problem.'],
    ['literature_pubmed', 'Hepatocellular injury after amoxicillin-clavulanate: a case report\nAuthors: Weber M, Okafor N, Lindqvist P\n\nWe describe a 63-year-old man who developed jaundice and markedly raised transaminases ten days after completing a course of amoxicillin-clavulanate for sinusitis. Liver biopsy showed cholestatic hepatitis. He recovered over eight weeks after the drug was withdrawn. (Synthetic sample abstract for demonstration.)'],
    ['literature_pubmed', 'Drug-induced QT prolongation: an observational overview\nAuthors: Haddad R, Iyer S\n\nThis review summarises mechanisms by which medicines prolong the QT interval and discusses risk stratification. No individual cases are described. (Synthetic sample abstract for demonstration.)']
  ];
  if (!A.inbox.length && !LS.get('seeded', false)) { A.SAMPLES.forEach(([c, t]) => A.triage(t, c, { sample: true })); LS.set('seeded', true); }

  /* ---------- investigations ---------- */
  A.invState = LS.get('inv', {}); // {sid:{status,overrides:{rid:{...}},summary,signoff,startedAt}}
  A.persistInv = () => LS.set('inv', A.invState);
  A.build = function (sid) { // deterministic re-computation from reports + saved human actions
    const p = A.pairMap.get(sid), st = A.invState[sid]; if (!p || !st) return null;
    const cases = A.casesOf(p).map(r => {
      const v = E.verifyExtraction(r.ext, r.narrative), rule = E.assessCausality(v.facts), ov = (st.overrides || {})[r.id] || null;
      return { ...r, facts: v.facts, guardrail: v.guardrail, rule, override: ov, cat: ov ? ov.category : rule.category };
    });
    const rec = E.recommend(p, cases.map(c => c.cat));
    return { sid, p, cases, rec, st, metrics: metrics(cases) };
  };
  function metrics(cases) {
    const g = cases.map(c => c.guardrail), ver = g.reduce((a, x) => a + x.quotes_verified, 0), rej = g.reduce((a, x) => a + x.quotes_rejected, 0);
    const recl = cases.reduce((a, c) => a + c.facts.excluded_causes.filter(x => x.reclassified_by).length, 0);
    return { n: cases.length, verified: ver, rejected: rej, reclassified: recl, minutes: cases.length * 15 };
  }
  A.investigate = async function (sid, onStep) {
    const p = A.pairMap.get(sid); if (A.invState[sid] && A.invState[sid].status === 'completed') return;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    onStep && onStep(0); await sleep(350);
    onStep && onStep(1); await sleep(450);
    const prev = A.invState[sid] || {}; A.invState[sid] = { status: 'in_review', overrides: prev.overrides || {}, summary: prev.summary || null, signoff: null, startedAt: new Date().toISOString() };
    onStep && onStep(2); await sleep(450);
    const b = A.build(sid);
    b.cases.forEach(c => {
      A.auditAdd('ai_extraction', 'system', { signal_id: sid, report_id: c.id, model_id: 'apac.amazon.nova-lite-v1:0', prompt_version: 'extract_v1.4.0', from_cache: true, guardrail: c.guardrail }, false);
      A.auditAdd('rule_evaluation', 'system', { signal_id: sid, report_id: c.id, rule_id: c.rule.rule_id, ruleset: c.rule.ruleset, version: c.rule.version, category: c.rule.category }, false);
    });
    onStep && onStep(3); await sleep(450);
    A.auditAdd('rule_evaluation', 'system', { signal_id: sid, scope: 'signal', rule_id: b.rec.rule_id, ruleset: b.rec.ruleset, version: b.rec.version, recommendation: b.rec.recommendation }, false);
    A.persistAudit(); A.persistInv(); onStep && onStep(4); await sleep(250);
  };

  // first run: pre-investigate most flagged signals so charts are populated; two are left to show the live flow
  if (!LS.get('preinv', false)) {
    A.flagged.filter(p => A.canInvestigate(p) && !/Hepatrix__|Dormyl__Pancreatitis/.test(p.signal_id)).forEach(p => {
      A.invState[p.signal_id] = { status: 'in_review', overrides: {}, summary: null, signoff: null, startedAt: new Date().toISOString() };
      A.build(p.signal_id).cases.forEach(c => { A.auditAdd('ai_extraction', 'system', { signal_id: p.signal_id, report_id: c.id, model_id: 'apac.amazon.nova-lite-v1:0', prompt_version: 'extract_v1.4.0', from_cache: true, guardrail: c.guardrail }, false); A.auditAdd('rule_evaluation', 'system', { signal_id: p.signal_id, report_id: c.id, rule_id: c.rule.rule_id, ruleset: c.rule.ruleset, version: c.rule.version, category: c.rule.category }, false); });
    });
    A.persistInv(); A.persistAudit(); LS.set('preinv', true);
  }

  /* ---------- helpers ---------- */
  A.fmtDate = s => { try { return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return s; } };
  A.human = s => String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  A.short = (h, n = 8) => h ? h.slice(0, n) + '…' + h.slice(-4) : '—';
  A.OUT_LABEL = { valid_icsr: 'Valid ICSR', potential_icsr: 'Potential ICSR · escalated', non_icsr: 'Not an ICSR' };
  A.outBadge = o => o ? `<span class="badge ${o === 'valid_icsr' ? 'b-ok' : o === 'potential_icsr' ? 'b-warn' : 'b-mut'}">${A.OUT_LABEL[o]}</span>` : '<span class="badge b-info">Pending</span>';
  A.catBadge = c => `<span class="badge" style="background:${C.CAT[c]};color:${c === 'Possible' ? '#4A3200' : '#fff'}">${c}</span>`;
  A.recBadge = id => ({ 'REC-02': '<span class="badge b-ok">Validated</span>', 'REC-03': '<span class="badge b-bad">Not confirmed</span>', 'REC-01': '<span class="badge b-mut">Insufficient info</span>', 'REC-04': '<span class="badge b-warn">Inconclusive</span>' }[id] || '');
  A.toast = msg => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };
  A.highlight = function (text, spans) { // spans: [{s,e,cls,id,tip}] non-overlapping greedy
    const ok = []; let end = -1;
    spans.filter(x => x && x.s != null && x.e > x.s).sort((a, b) => a.s - b.s || b.e - a.e).forEach(x => { if (x.s >= end) { ok.push(x); end = x.e; } });
    let out = '', pos = 0;
    ok.forEach(x => { out += esc(text.slice(pos, x.s)) + `<mark class="${x.cls}" data-m="${esc(x.id)}" ${C.tip(x.tip || '')}>${esc(text.slice(x.s, x.e))}</mark>`; pos = x.e; });
    return out + esc(text.slice(pos));
  };
  A.bindMarks = (scope, root_) => { // click quote -> flash its mark
    (root_ || document).querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => {
      const m = (scope || document).querySelector(`mark[data-m="${CSS.escape(el.dataset.goto)}"]`); if (!m) { A.toast('That evidence is not in the highlighted text'); return; }
      m.scrollIntoView({ block: 'center', behavior: 'smooth' }); m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash');
    }));
  };
  A.I = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>', book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>', inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>', bench: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M9 9h12"/>',
    pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>', chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/>', shield: '<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7z"/><path d="M10 20a2 2 0 0 0 4 0"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', check: '<path d="m5 12 5 5 9-10"/>', file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>', alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>', flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.5 1.5 0 0 0 5.8 21h12.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'
  };
  A.ico = (n, extra = '') => `<svg viewBox="0 0 24 24" ${extra} aria-hidden="true">${A.I[n]}</svg>`;
  A.cross = (s = 200) => `<svg class="cross" width="${s}" height="${s}" viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#DDE6F5"/></linearGradient><linearGradient id="cs" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C6D2E8"/><stop offset="1" stop-color="#A9B9D6"/></linearGradient></defs><g transform="rotate(-8 100 100)"><path d="M78 24h44a8 8 0 0 1 8 8v38h38a8 8 0 0 1 8 8v44a8 8 0 0 1-8 8h-38v38a8 8 0 0 1-8 8H78a8 8 0 0 1-8-8v-38H32a8 8 0 0 1-8-8V78a8 8 0 0 1 8-8h38V32a8 8 0 0 1 8-8z" transform="translate(10 10)" fill="url(#cs)"/><path d="M78 24h44a8 8 0 0 1 8 8v38h38a8 8 0 0 1 8 8v44a8 8 0 0 1-8 8h-38v38a8 8 0 0 1-8 8H78a8 8 0 0 1-8-8v-38H32a8 8 0 0 1-8-8V78a8 8 0 0 1 8-8h38V32a8 8 0 0 1 8-8z" fill="url(#cg)"/></g></svg>`;
  A.logo = () => `<svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="#1E7BFF"/><path d="M16 9h8a2 2 0 0 1 2 2v5h5a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5v5a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-5H9a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h5v-5a2 2 0 0 1 2-2z" fill="#fff"/></svg>`;

  /* ---------- shell + router ---------- */
  const NAV = [
    ['Overview', [['#/', 'home', 'Dashboard'], ['#/report', 'pen', 'Report an event'], ['#/literature', 'book', 'Literature sweep'], ['#/inbox', 'inbox', 'Triage inbox', 'inbox'], ['#/workbench', 'bench', 'Case workbench']]],
    ['Signals', [['#/signals', 'pulse', 'Signal detection', 'sig'], ['#/ask', 'chat', 'Ask the evidence'], ['#/audit', 'link', 'Audit trail']]],
    ['Trust', [['#/trust', 'shield', 'How decisions are made']]]
  ];
  A.user = LS.get('user', null);
  if (!A.user && /[?&]demo=1/.test(location.search)) A.user = { name: 'Dr. Chloe F.', role: 'Safety physician' }; // shareable demo link skips sign-in
  A.simple = false;
  A.theme = LS.get('theme', matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = A.theme;
  const appEl = document.getElementById('app');

  function parse() { const h = location.hash.replace(/^#\/?/, ''), [path, q] = h.split('?'); return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(q || '') }; }
  A.route = parse;
  function activeNav(parts) { const k = parts[0] || ''; if (k === 'signal') return '#/signals'; return '#/' + k; }
  A.shell = function (title, sub, body, acts = '', crumbs = '') {
    const parts = parse().parts, on = activeNav(parts), awaiting = A.inbox.filter(r => r.outcome === 'potential_icsr').length;
    const nav = NAV.map(([g, items]) => `<div class="grp">${g}</div>` + items.map(([h, ic, lb, k]) => `<a href="${h}" class="${h === on || (h === '#/' && on === '#/') ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${A.I[ic]}</svg><span>${lb}</span>${k === 'inbox' && awaiting ? `<b class="cnt">${awaiting}</b>` : ''}${k === 'sig' ? `<b class="cnt">${A.flagged.length}</b>` : ''}</a>`).join('')).join('');
    return `<div class="app"><aside class="side"><a class="brand" href="#/" style="text-decoration:none;color:inherit">${A.logo()}Atheria<small>PV</small></a><nav class="nav" aria-label="Main">${nav}</nav>
      <div class="me"><div class="av">${esc((A.user.name || 'U')[0])}</div><div style="min-width:0"><b>${esc(A.user.name)}</b><span>${esc(A.user.role)}</span></div><button class="iconbtn" style="width:34px;height:34px;margin-left:auto;box-shadow:none" title="Sign out" id="signout"><svg viewBox="0 0 24 24">${A.I.out}</svg></button></div></aside>
      <main class="main" id="main">${crumbs ? `<div class="crumbs">${crumbs}</div>` : ''}<header class="top"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="acts">${acts}
      <button class="iconbtn" id="themebtn" title="Toggle dark mode" aria-label="Toggle dark mode"><svg viewBox="0 0 24 24">${A.I.moon}</svg></button>
      <a class="iconbtn" href="#/inbox" title="${awaiting} escalated records awaiting review" aria-label="Notifications"><svg viewBox="0 0 24 24">${A.I.bell}</svg></a></div></header>${body}</main></div>`;
  };
  A.loginView = function () {
    return `<div class="login"><div class="l"><div class="row" style="font-size:22px;font-weight:700;letter-spacing:-.03em">${A.logo()} Atheria</div>
      <div style="position:relative;z-index:1"><h1>Your safety signals, explained.</h1><p style="margin-top:18px;max-width:44ch;opacity:.92;font-size:17px">AI proposes. A versioned rules engine decides. A qualified human approves. Every step is evidence-anchored and auditable.</p>
      <div class="pillrow" style="margin-top:26px"><span>Evidence-anchored</span><span>Deterministic rules</span><span>Hash-chained audit</span><span>Human sign-off</span></div></div>
      <div style="position:absolute;right:40px;top:110px;opacity:.97">${A.cross(300)}</div></div>
      <div class="r"><form id="lf"><div><h2 style="font-size:30px">Welcome back</h2><p style="color:var(--mut);margin-top:6px">Sign in to the pharmacovigilance workspace.</p></div>
      <div class="field"><label for="ln">Full name</label><input id="ln" value="Dr. Chloe F." autocomplete="name" required></div>
      <div class="field"><label for="lr">Role</label><select id="lr"><option>Safety physician</option><option>PV scientist</option><option>QPPV</option><option>Case processor</option></select></div>
      <button class="btn" type="submit" style="justify-content:center;padding:14px">Continue ${A.ico('arrow')}</button>
      <div class="callout info" style="font-size:12.5px"><b>Demo workspace.</b> Synthetic data and fictional drugs. This build has no server: the rules, statistics, guardrails and audit chain run in your browser, and nothing is sent anywhere. Your reviewer name is used to sign actions.</div></form></div></div>`;
  };
  async function render() {
    const { parts } = parse();
    if (!A.user) { appEl.innerHTML = A.loginView(); document.getElementById('lf').onsubmit = e => { e.preventDefault(); A.user = { name: document.getElementById('ln').value.trim() || 'Reviewer', role: document.getElementById('lr').value }; LS.set('user', A.user); location.hash = '#/'; render(); }; return; }
    const key = parts[0] || 'dashboard';
    if (key === 'inbox' || key === 'dashboard' || key === 'signals') {
      await A.loadDbReports();
      if (key === 'signals' || key === 'dashboard') await A.loadDbSignals();
    }
    const fn = A.views[key] || A.views.dashboard;
    let html; try { html = await fn(parse()); } catch (err) { console.error(err); html = A.shell('Something went wrong', '', `<div class="card"><div class="callout bad">${esc(err.message)}</div></div>`); }
    appEl.innerHTML = html;
    const tb = document.getElementById('themebtn'); if (tb) tb.onclick = () => { A.theme = A.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = A.theme; LS.set('theme', A.theme); };
    const so = document.getElementById('signout'); if (so) so.onclick = () => { LS.set('user', null); A.user = null; render(); };
    const after = A.after; A.after = null; if (after) after();
    window.scrollTo(0, 0);
  }
  A.render = render;
  window.addEventListener('hashchange', render);
  C.tipInit();
  /* ---------- signal statistics from Exasol (when served by safereport/server.py) ---------- */
  // Browser engine numbers stay as an independent cross-check; if Exasol is not reachable they are used as before.
  A.signalSource = { db: 'browser' };
  A.loadDbSignals = async function () {
    try {
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 4000);
      const res = await fetch('/api/pv/signals', { signal: ctl.signal });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'HTTP ' + res.status);
      const j = await res.json(), browser = A.pairMap;
      const keys = ['a', 'b', 'c', 'd', 'prr', 'ror', 'ror_lo', 'ror_hi', 'chi2'];
      const agree = j.rows.filter(r => { const p = browser.get(r.signal_id); return p && p.is_signal === r.is_signal && keys.every(k => Math.abs(p[k] - r[k]) < 1e-3); }).length;
      A.pairs = j.rows.slice().sort((x, y) => y.prr - x.prr || (x.signal_id < y.signal_id ? -1 : 1));
      A.pairMap = new Map(A.pairs.map(p => [p.signal_id, p]));
      A.flagged = A.pairs.filter(p => p.is_signal);
      A.signalSource = { db: 'exasol', query: j.query, viewSql: j.view_sql, reports: j.reports, agree, total: j.rows.length, browserTotal: browser.size };
    } catch (e) { A.signalSource = { db: 'browser', error: String(e.message || e) }; }
  };
  A.loadDbReports = async function () {
    try {
      const res = await fetch('/api/pv/reports?source=safereport');
      if (!res.ok) return;
      const j = await res.json();
      for (const r of (j.reports || []).slice().reverse()) {
        if (r.narrative && !A.inbox.some(x => x.id === r.report_id || (x.meta && x.meta.report_id === r.report_id))) {
          A.triage(r.narrative, 'safereport', { report_id: r.report_id, drug: r.drug, event: r.event_term, live_db: true });
        }
      }
    } catch (e) { /* ignore */ }
  };
  A.start = async () => { if (!location.hash) location.hash = '#/'; await A.loadDbSignals(); await A.loadDbReports(); render(); };
})(window);
