/* Views A — Atheria triage side: dashboard, report form, literature, inbox, workbench */
(function () {
  'use strict';
  const { E, C, esc } = A;
  A.rerender = async () => { const y = window.scrollY; await A.render(); window.scrollTo(0, y); };
  const KPI = (label, v, foot, ico, tone, spark) => `<div class="card kpi"><div class="ico" style="background:var(--${tone}-soft);color:var(--${tone})">${A.ico(ico)}</div><div class="lb">${label}</div><div class="v">${v}</div><div class="ft">${foot}</div>${spark ? spark : ''}</div>`;
  const CRIT_LABEL = { identifiable_patient: 'Identifiable patient', identifiable_reporter: 'Identifiable reporter', suspect_product: 'Suspect product', adverse_event: 'Adverse event' };
  const CRIT_CLS = { identifiable_patient: 'h-patient', identifiable_reporter: 'h-reporter', suspect_product: 'h-product', adverse_event: 'h-ae' };

  /* ======================= DASHBOARD ======================= */
  A.views.dashboard = function () {
    const ib = A.inbox, by = o => ib.filter(r => r.outcome === o).length;
    const valid = by('valid_icsr'), pot = by('potential_icsr'), non = by('non_icsr');
    const inv = Object.keys(A.invState), builds = inv.map(A.build).filter(Boolean);
    const invCases = builds.reduce((a, b) => a + b.cases.length, 0);
    const months = {}, ser = {}; A.reports.forEach(r => { const m = r.date.slice(0, 7); months[m] = (months[m] || 0) + 1; if (r.serious) ser[m] = (ser[m] || 0) + 1; });
    const ml = Object.keys(months).sort(); const mlabel = ml.map(m => new Date(m + '-15').toLocaleString(undefined, { month: 'short', year: '2-digit' }));
    const donut = [{ label: 'Valid ICSR', value: valid, color: 'var(--ok)' }, { label: 'Escalated', value: pot, color: 'var(--warn)' }, { label: 'Not an ICSR', value: non, color: 'var(--c-una)' }];
    const critRows = E.CRITERIA.map(k => { const n = ib.filter(r => r.elements[k].present).length; return { label: CRIT_LABEL[k], value: n, text: `${n}/${ib.length}`, color: n === ib.length ? 'var(--ok)' : 'var(--blue)', sub: ib.length - n ? `${ib.length - n} record(s) could not establish this` : 'present in every record' }; });
    const mx = Math.max(1, ib.length), fun = [['Received', ib.length, 'var(--blue)'], ['≥ 3 criteria found', ib.filter(r => Object.values(r.trace.inputs).filter(Boolean).length >= 3).length, 'var(--teal)'], ['Product + event (core)', ib.filter(r => r.outcome !== 'non_icsr').length, 'var(--violet)'], ['Valid ICSR', valid, 'var(--ok)']];
    const watch = A.flagged.slice(0, 6).map(p => { const b = A.invState[p.signal_id] ? A.build(p.signal_id) : null; return `<a class="item" href="${A.sigUrl(p.signal_id)}"><div class="row"><b>${esc(A.sigLabel(p))}</b><span class="sp"></span>${b ? A.recBadge(b.rec.rule_id) : '<span class="badge b-info">Not investigated</span>'}</div><div class="m"><span>PRR <b class="mono">${p.prr}</b></span><span>${p.a} cases</span>${b ? `<span style="flex:1;min-width:90px">${C.stack(Object.entries(b.rec.inputs.distribution).map(([k, v]) => ({ label: k, value: v, color: C.CAT[k] })), { h: 8 })}</span>` : ''}</div></a>`; }).join('');
    const body = `
    <div class="hero fade"><div><h2>Every safety decision, explained.</h2><p>AI reads the text. A versioned rules engine decides. You approve. Each answer below links back to the exact words in the source.</p>
      <div class="row" style="margin-top:20px"><a class="btn white" href="#/report">${A.ico('pen')} Report an event</a><a class="btn" style="background:rgba(255,255,255,.2);box-shadow:none" href="#/signals">${A.ico('pulse')} Investigate signals</a></div></div>${A.cross(210)}</div>
    <div class="grid g4 mt">
      ${KPI('Records received', ib.length, 'All intake channels', 'inbox', 'blue', C.spark([1, 2, 2, 3, 3, 4, ib.length || 1], { color: 'var(--blue)' }))}
      ${KPI('Valid ICSRs', valid, 'All 4 criteria met', 'check', 'ok')}
      ${KPI('Awaiting review', pot, 'Escalated, never guessed', 'alert', 'warn')}
      ${KPI('Signals flagged', A.flagged.length, `${builds.length} investigated · ${invCases} cases read`, 'pulse', 'violet', C.spark(A.flagged.map(p => p.prr).slice().reverse().map(v => Math.log10(v) + 1), { color: 'var(--violet)' }))}</div>
    <div class="grid g-7-5 mt">
      <div class="card"><div class="hd"><div><h3>Signal map</h3><div class="sub">Every drug–event pair in the 1,261-report dataset. Larger bubble = stronger χ². Click one to investigate.</div></div><a class="btn ghost sm" href="#/signals">Open signals</a></div>${C.bubble(A.pairs, { href: s => A.sigUrl(s.signal_id) })}</div>
      <div class="card"><div class="hd"><div><h3>Signal watchlist</h3><div class="sub">Ranked by PRR, with what the rules concluded</div></div></div><div class="list">${watch}</div></div></div>
    <div class="grid g3 mt">
      <div class="card"><div class="hd"><div><h3>Triage outcomes</h3><div class="sub">Decided by rule <code>val_001 v1.0.0</code></div></div></div><div class="row" style="justify-content:center;gap:24px">${C.donut(donut, { size: 170, sub: 'records', center: ib.length })}<div style="min-width:130px">${C.legend(donut).replace('class="legend"', 'class="legend" style="flex-direction:column;gap:8px"')}</div></div></div>
      <div class="card"><div class="hd"><div><h3>What the sources contained</h3><div class="sub">Share of records where each ICSR criterion was found</div></div></div>${C.hbars(critRows, { max: Math.max(1, ib.length) })}</div>
      <div class="card"><div class="hd"><div><h3>Intake funnel</h3><div class="sub">Where records drop out, and why</div></div></div>${C.hbars(fun.map(([l, v, c]) => ({ label: l, value: v, color: c, text: v })), { max: mx })}</div></div>
    <div class="grid g-7-5 mt">
      <div class="card"><div class="hd"><div><h3>Reporting volume</h3><div class="sub">Reports received per month, with the serious share</div></div><div class="legend"><span><i style="background:var(--blue)"></i>All</span><span><i style="background:var(--c-unl)"></i>Serious</span></div></div>${C.line([{ name: 'All reports', values: ml.map(m => months[m]), color: 'var(--blue)', area: 1 }, { name: 'Serious', values: ml.map(m => ser[m] || 0), color: 'var(--c-unl)' }], mlabel, { label: 'Monthly reports' })}</div>
      <div class="card"><div class="hd"><div><h3>Reviewer time saved</h3><div class="sub">Assumes 15 minutes of manual reading per case</div></div></div><div class="row" style="justify-content:space-around">${C.ring(Math.min(1, invCases * 15 / 60 / 40), { color: 'var(--ok)', size: 130, label: 'time saved' })}<div><div class="v" style="font-size:34px;font-weight:700">${(invCases * 15 / 60).toFixed(1)} h</div><div style="color:var(--mut);font-size:13px">${invCases} case narratives read<br>by AI, every quote verified</div></div></div><div class="callout info mt" style="font-size:12.5px">The estimate is an assumption, not a measurement. Ring shows progress toward a 40-hour reference workload.</div></div></div>
    <div class="card mt"><div class="hd"><div><h3>Who decides what</h3><div class="sub">The AI never makes a regulatory decision.</div></div><a class="btn ghost sm" href="#/trust">See the rules</a></div>${A.flowStrip()}</div>
    <div class="card mt"><div class="hd"><div><h3>Latest records</h3><div class="sub">Newest triage results</div></div><a href="#/inbox">View all</a></div>${ib.length ? `<div class="grid g3">${ib.slice(0, 3).map(r => `<a class="item" href="#/inbox?id=${r.id}"><div class="row"><span class="badge ${r.channel === 'safereport' ? 'b-teal' : 'b-mut'}">${r.channel === 'safereport' ? (r.id + ' · Exasol') : A.human(r.channel)}</span><span class="sp"></span>${A.outBadge(r.outcome)}</div><div class="t">${esc(r.text.replace(/\s+/g, ' '))}</div><div class="m">${C.criteriaDots(r.trace.inputs)}<span>${Object.values(r.trace.inputs).filter(Boolean).length}/4 criteria</span></div></a>`).join('')}</div>` : '<div class="empty"><b>No records yet</b>Report an event or run a literature sweep.</div>'}</div>`;
    return A.shell('Hello,<br>' + esc(A.user.name), 'Pharmacovigilance command center for ICSR triage and signal investigation.', body);
  };
  A.flowStrip = (active) => {
    const st = [['Statistics', 'detect', 'PRR · ROR 95% CI · χ² · Evans', 'b-teal'], ['AI', 'extracts', 'Reads text, returns facts with verbatim quotes', 'b-vio'], ['Code', 'verifies', 'Every quote located at real character offsets', 'b-info'], ['Rules', 'decide', 'Versioned, pure, replayable', 'b-warn'], ['Human', 'approves', 'Override with a reason, sign off', 'b-ok']];
    return `<div class="flow">${st.map((s, i) => `<div class="st ${active === i ? 'on' : active > i ? 'done' : ''}"><span class="badge ${s[3]} who">${s[0]}</span><b>${s[1]}</b><span>${s[2]}</span></div>`).join('')}</div>`;
  };

  /* ======================= REPORT FORM ======================= */
  const EMPTY = { reporter_name: '', reporter_qualification: '', reporter_email: '', reporter_country: '', patient_initials: '', patient_age: '', patient_sex: '', product_name: '', dose: '', event_description: '', onset_date: '', narrative: '' };
  const EXAMPLES = [
    { label: 'Complete report', hint: 'expect: Valid ICSR', d: { reporter_name: 'Dr. Anita Sharma', reporter_qualification: 'physician', reporter_email: 'a.sharma@example-hospital.in', reporter_country: 'IN', patient_initials: 'R.K.', patient_age: '54 years', patient_sex: 'female', product_name: 'Atherex 100mg', dose: '100mg once daily', event_description: 'Severe itchy rash across the torso', onset_date: '2026-08-28', narrative: 'My patient was prescribed Atherex 100mg once daily for hypertension. Eight days later she developed a severe itchy rash across her torso and was admitted overnight for observation. The drug was withdrawn and the rash began to settle.' } },
    { label: 'Incomplete report', hint: 'expect: Escalated', d: { product_name: 'Atherex', event_description: 'stomach bleeding', narrative: 'I read online that people are getting bad stomach bleeding from Atherex. I do not have details of who was affected.' } },
    { label: 'Enquiry only', hint: 'expect: Not an ICSR', d: { reporter_qualification: 'pharmacist', product_name: 'Atherex 100mg', narrative: 'Can Atherex 100mg tablets be split in half for easier swallowing? No patient has experienced any problem.' } }
  ];
  const compose = f => {
    const L = [];
    const rep = [f.reporter_name, f.reporter_qualification, f.reporter_email && '(' + f.reporter_email + (f.reporter_country ? ', ' + f.reporter_country : '') + ')'].filter(Boolean).join(', ');
    if (rep) L.push('Reporter: ' + rep);
    const pat = [f.patient_initials, f.patient_age, f.patient_sex].filter(Boolean).join(', '); if (pat) L.push('Patient: ' + pat);
    const prod = [f.product_name, f.dose].filter(Boolean).join(', '); if (prod) L.push('Product: ' + prod);
    const ev = [f.event_description, f.onset_date && '(onset ' + f.onset_date + ')'].filter(Boolean).join(' '); if (ev) L.push('Event: ' + ev);
    return L.join('\n') + (L.length ? '\n\n' : '') + f.narrative.trim();
  };
  A.formState = { ...EMPTY };
  function critPreview(text) {
    const r = text.trim().length > 3 ? E.readSource(text) : null;
    return `<div class="grid" style="gap:10px">${E.CRITERIA.map(k => { const e = r && r.elements[k]; return `<div class="crit ${e && e.present ? 'y' : 'n'}" style="${r ? '' : 'opacity:.6'}"><div class="ic">${e && e.present ? '✓' : r ? '–' : '·'}</div><div><b>${CRIT_LABEL[k]}</b><div style="font-size:12.5px;color:var(--mut)">${e && e.present ? '“' + esc(e.quote.slice(0, 80)) + (e.quote.length > 80 ? '…' : '') + '”' : r ? 'Not found yet' : 'Waiting for text'}</div></div></div>`; }).join('')}</div>`;
  }
  A.views.report = function () {
    const f = A.formState, T = (k, lb, ph = '', t = 'text') => `<div class="field"><label for="f_${k}">${lb}</label><input id="f_${k}" data-k="${k}" type="${t}" value="${esc(f[k])}" placeholder="${esc(ph)}"></div>`;
    const body = `<div class="grid g-7-5" style="align-items:start"><form class="card" id="rf"><div class="row" style="margin-bottom:16px"><span style="font-weight:650">Try an example</span>${EXAMPLES.map((x, i) => `<button type="button" class="chip" data-ex="${i}">${x.label} <span style="color:var(--mut);font-weight:500">· ${x.hint}</span></button>`).join('')}</div>
      <h3 style="margin-bottom:12px">Who is reporting</h3><div class="grid g2">${T('reporter_name', 'Name', 'Dr. Anita Sharma')}<div class="field"><label for="f_reporter_qualification">Qualification</label><select id="f_reporter_qualification" data-k="reporter_qualification"><option value="">—</option>${['physician', 'pharmacist', 'nurse', 'consumer', 'other'].map(o => `<option ${f.reporter_qualification === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>${T('reporter_email', 'Email', '', 'email')}${T('reporter_country', 'Country', 'IN')}</div>
      <h3 style="margin:22px 0 12px">Patient</h3><div class="grid g3">${T('patient_initials', 'Initials', 'R.K.')}${T('patient_age', 'Age', '54 years')}<div class="field"><label for="f_patient_sex">Sex</label><select id="f_patient_sex" data-k="patient_sex"><option value="">—</option>${['female', 'male', 'other'].map(o => `<option ${f.patient_sex === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div>
      <h3 style="margin:22px 0 12px">Product and event</h3><div class="grid g2">${T('product_name', 'Product', 'Atherex 100mg')}${T('dose', 'Dose', '100mg once daily')}${T('event_description', 'Event', 'Severe itchy rash')}${T('onset_date', 'Onset date', '', 'date')}</div>
      <div class="field" style="margin-top:14px"><label for="f_narrative">What happened <span style="color:var(--bad)">*</span></label><textarea id="f_narrative" data-k="narrative" required placeholder="Describe the symptoms and complaints in your own words">${esc(f.narrative)}</textarea></div>
      <div class="callout info mt" style="font-size:12.5px">Only the narrative is required. Incomplete reports are exactly what the validity rule exists to classify, so the form never blocks them.</div>
      <div class="row mt"><button class="btn" type="submit" id="sub">Submit and triage ${A.ico('arrow')}</button><button class="btn ghost" type="button" id="clr">Clear</button></div></form>
      <div class="sticky-r"><div class="card" id="pv"><div class="hd"><div><h3>Live reading</h3><div class="sub">What the reader finds in the text as you type</div></div></div><div id="pvb">${critPreview(compose(f))}</div>
      <div class="lock">${A.ico('shield', 'width="15" height="15" style="stroke:currentColor;fill:none;stroke-width:2"')} This preview only reports. The decision is made by <code>val_001</code> when you submit.</div></div><div id="res"></div></div></div>`;
    A.after = () => {
      const rf = document.getElementById('rf'), upd = () => { document.getElementById('pvb').innerHTML = critPreview(compose(A.formState)); };
      rf.addEventListener('input', e => { const k = e.target.dataset.k; if (k) { A.formState[k] = e.target.value; upd(); } });
      rf.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { A.formState = { ...EMPTY, ...EXAMPLES[+b.dataset.ex].d }; A.rerender(); });
      document.getElementById('clr').onclick = () => { A.formState = { ...EMPTY }; A.rerender(); };
      rf.onsubmit = async e => {
        e.preventDefault(); const sb = document.getElementById('sub'); sb.disabled = true; sb.innerHTML = '<span class="spin"></span> Triaging…'; await new Promise(r => setTimeout(r, 700));
        const out = A.triage(compose(A.formState), 'web_form'); const r = out.record;
        document.getElementById('res').innerHTML = `<div class="card mt fade"><div class="row"><h3>Determination</h3><span class="sp"></span>${A.outBadge(r.outcome)}</div>${out.duplicate ? '<div class="callout warn mt" style="font-size:12.5px">An identical report was already received (same content hash), so no duplicate was created.</div>' : ''}<p style="margin:14px 0;font-size:13.5px">${esc(r.trace.explanation)}</p><div class="row"><a class="btn sm" href="#/inbox?id=${r.id}">Inspect evidence and rule trace</a></div></div>`;
        sb.disabled = false; sb.innerHTML = 'Submit and triage ' + A.ico('arrow'); document.getElementById('res').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); A.toast('Triaged · ' + A.OUT_LABEL[r.outcome]);
      };
    };
    return A.shell('Report an event', 'Public-facing adverse event form. Submitting triggers triage immediately.', body);
  };

  /* ======================= LITERATURE ======================= */
  const PRESETS = [['Hepatotoxicity case reports', 'drug induced liver injury case report'], ['Serious skin reactions', 'stevens johnson syndrome drug induced case report'], ['Anaphylaxis', 'anaphylaxis drug adverse reaction case report'], ['Cardiac adverse reactions', 'drug induced QT prolongation adverse reaction']];
  A.lit = A.lit || { q: PRESETS[0][1], n: 3, res: null };
  async function pubmed(q, n) {
    const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/', ac = new AbortController(), t = setTimeout(() => ac.abort(), 12000);
    try {
      const s = await (await fetch(`${base}esearch.fcgi?db=pubmed&retmode=json&sort=date&retmax=${n}&term=${encodeURIComponent(q)}`, { signal: ac.signal })).json();
      const ids = s.esearchresult.idlist; if (!ids.length) return { live: true, docs: [] };
      const xml = await (await fetch(`${base}efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(',')}`, { signal: ac.signal })).text();
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const docs = [...doc.querySelectorAll('PubmedArticle')].map(a => {
        const title = (a.querySelector('ArticleTitle') || {}).textContent || '', abs = [...a.querySelectorAll('AbstractText')].map(x => x.textContent).join(' ');
        const au = [...a.querySelectorAll('Author')].slice(0, 6).map(x => ((x.querySelector('LastName') || {}).textContent || '') + ' ' + ((x.querySelector('Initials') || {}).textContent || '')).filter(x => x.trim()).join(', ');
        return { pmid: (a.querySelector('PMID') || {}).textContent, text: `${title}\nAuthors: ${au}\n\n${abs}` };
      }); return { live: true, docs };
    } catch (e) { return { live: false, err: e.message }; } finally { clearTimeout(t); }
  }
  A.views.literature = function () {
    const L = A.lit, r = L.res;
    const body = `<div class="grid g-5-7" style="align-items:start"><form class="card" id="lf2"><h3>Standing query</h3><div class="sub" style="margin-bottom:14px">Marketing authorisation holders must screen published literature for reactions to their products.</div>
      <div class="row" style="margin-bottom:14px">${PRESETS.map(p => `<button type="button" class="chip ${L.q === p[1] ? 'on' : ''}" data-q="${esc(p[1])}">${p[0]}</button>`).join('')}</div>
      <div class="field"><label for="lq">PubMed query</label><input id="lq" value="${esc(L.q)}"></div><div class="field mt"><label for="ln2">Max articles</label><select id="ln2">${[1, 2, 3, 5, 8].map(n => `<option ${L.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="row mt"><button class="btn" id="run" type="submit">${A.ico('book')} Run sweep</button></div>
      <div class="callout info mt" style="font-size:12.5px">Runs live against NCBI E-utilities from your browser. If the network is unavailable, bundled synthetic abstracts are used instead and clearly labelled. Articles already seen are skipped by content hash.</div></form>
      <div id="lres">${r ? litResult(r) : '<div class="card"><div class="empty"><b>No sweep run yet</b>Choose a preset and press Run sweep.</div></div>'}</div></div>`;
    A.after = () => {
      document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { A.lit.q = b.dataset.q; A.rerender(); });
      document.getElementById('lf2').onsubmit = async e => {
        e.preventDefault(); A.lit.q = document.getElementById('lq').value; A.lit.n = +document.getElementById('ln2').value;
        const btn = document.getElementById('run'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Searching PubMed…';
        let out = await pubmed(A.lit.q, A.lit.n), live = out.live, docs = out.docs, note = '';
        if (!out.live) { docs = A.SAMPLES.filter(s => s[0] === 'literature_pubmed').map((s, i) => ({ pmid: 'sample-' + (i + 1), text: s[1].replace(' (Synthetic sample abstract for demonstration.)', ' (Synthetic sample abstract, variant ' + Date.now().toString(36).slice(-3) + '.)') })).slice(0, A.lit.n); note = 'PubMed was not reachable (' + out.err + '). Showing synthetic sample abstracts instead.'; }
        let dups = 0; const results = []; docs.forEach(d => { const o = A.triage(d.text, 'literature_pubmed', { pmid: d.pmid }); if (o.duplicate) dups++; results.push(o.record); });
        A.lit.res = { q: A.lit.q, live, note, ingested: results.length - dups, dups, triaged: results.length, results }; A.rerender();
      };
    };
    return A.shell('Literature sweep', 'Scheduled screening of published literature. Each article is ingested as a source record, then decided by the same rule as every other channel.', body);
  };
  function litResult(r) {
    return `<div class="card fade"><div class="hd"><div><h3>Sweep results</h3><div class="sub">“${esc(r.q)}” · ${r.live ? 'live PubMed' : 'offline samples'}</div></div></div>${r.note ? `<div class="callout warn" style="margin-bottom:14px;font-size:12.5px">${esc(r.note)}</div>` : ''}
      <div class="grid g3" style="margin-bottom:16px">${[['Ingested', r.ingested, 'ok'], ['Duplicates skipped', r.dups, 'mut'], ['Triaged', r.triaged, 'info']].map(x => `<div class="fact"><div class="k">${x[0]}</div><div class="val">${x[1]}</div></div>`).join('')}</div>
      <div class="list">${r.results.map(x => `<a class="item" href="#/inbox?id=${x.id}"><div class="row"><b style="font-size:14px">${esc(x.text.split('\n')[0].slice(0, 90))}</b><span class="sp"></span>${A.outBadge(x.outcome)}</div><div class="m">${C.criteriaDots(x.trace.inputs)}<span>${esc(x.meta.pmid ? 'PMID ' + x.meta.pmid : '')}</span></div></a>`).join('') || '<div class="empty">No articles matched.</div>'}</div></div>`;
  }

  /* ======================= INBOX ======================= */
  A.inboxUI = A.inboxUI || { outcome: '', channel: '', q: '' };
  A.views.inbox = function ({ q }) {
    const U = A.inboxUI, ib = A.inbox, id = q.get('id') || (A.inboxSel && ib.find(r => r.id === A.inboxSel) ? A.inboxSel : (ib[0] || {}).id);
    A.inboxSel = id;
    const vis = ib.filter(r => (!U.outcome || r.outcome === U.outcome) && (!U.channel || r.channel === U.channel) && (!U.q || r.text.toLowerCase().includes(U.q.toLowerCase())));
    const sel = ib.find(r => r.id === id), by = o => ib.filter(r => r.outcome === o).length;
    const chans = [...new Set(ib.map(r => r.channel))];
    const stat = (l, v, t) => `<div class="card kpi" style="padding:16px 20px"><div class="lb">${l}</div><div class="v" style="font-size:28px;color:var(--${t})">${v}</div></div>`;
    const body = `<div class="grid g4">${stat('Total records', ib.length, 'ink')}${stat('Valid ICSR', by('valid_icsr'), 'ok')}${stat('Escalated', by('potential_icsr'), 'warn')}${stat('Not ICSR', by('non_icsr'), 'mut')}</div>
    <div class="grid g-5-7 mt" style="align-items:start"><div class="card"><div class="row" style="margin-bottom:12px"><input class="input" id="iq" placeholder="Search text…" value="${esc(U.q)}" style="max-width:200px;padding:9px 14px"><select class="input" id="ic" style="max-width:150px;padding:9px 14px"><option value="">All channels</option>${chans.map(c => `<option value="${c}" ${U.channel === c ? 'selected' : ''}>${A.human(c)}</option>`).join('')}</select><button class="btn ghost sm" id="sync-db" style="margin-left:auto;gap:6px" title="Sync live reports from Exasol"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">${A.I.link}</svg> Sync Exasol</button></div>
      <div class="row" style="margin-bottom:14px">${[['', 'All'], ['valid_icsr', 'Valid'], ['potential_icsr', 'Escalated'], ['non_icsr', 'Not ICSR']].map(([v, l]) => `<button class="chip ${U.outcome === v ? 'on' : ''}" data-o="${v}">${l}</button>`).join('')}</div>
      <div class="list" style="max-height:70vh;overflow:auto;padding:2px">${vis.map(r => `<div class="item ${r.id === id ? 'sel' : ''}" data-id="${r.id}" tabindex="0" role="button"><div class="row"><span class="badge ${r.channel === 'safereport' ? 'b-teal' : 'b-mut'}">${r.channel === 'safereport' ? (r.id + ' · Exasol') : A.human(r.channel)}</span>${r.sample ? '<span class="badge b-info">sample</span>' : ''}<span class="sp"></span>${A.outBadge(r.outcome)}</div><div class="t">${esc(r.text.replace(/\s+/g, ' '))}</div><div class="m">${C.criteriaDots(r.trace.inputs)}<span>${Object.values(r.trace.inputs).filter(Boolean).length}/4</span><span class="sp"></span><span>Priority</span><span style="width:60px">${C.stack([{ label: 'priority', value: r.priority, color: r.priority > .7 ? 'var(--bad)' : r.priority > .45 ? 'var(--warn)' : 'var(--blue)' }, { label: '', value: 1 - r.priority, color: 'var(--line)' }], { h: 7 })}</span></div></div>`).join('') || '<div class="empty"><b>Nothing here</b>No records match these filters.</div>'}</div></div>
      <div class="sticky-r">${sel ? detail(sel) : '<div class="card empty"><b>Select a record</b>Pick one from the list to see its evidence and decision trace.</div>'}</div></div>`;
    A.after = () => {
      document.querySelectorAll('.item[data-id]').forEach(el => { const go = () => { A.inboxSel = el.dataset.id; history.replaceState(null, '', '#/inbox?id=' + el.dataset.id); A.rerender(); }; el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter') go(); }; });
      document.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { U.outcome = b.dataset.o; A.rerender(); });
      document.getElementById('ic').onchange = e => { U.channel = e.target.value; A.rerender(); };
      const sb = document.getElementById('sync-db');
      if (sb) sb.onclick = async () => {
        sb.disabled = true; sb.textContent = 'Syncing…';
        await A.loadDbReports();
        await A.loadDbSignals();
        A.toast('Synced with Exasol (PV.REPORTS & PV.SIGNALS)');
        await A.rerender();
      };
      let tm; document.getElementById('iq').oninput = e => { U.q = e.target.value; clearTimeout(tm); tm = setTimeout(async () => { await A.rerender(); const el = document.getElementById('iq'); el.focus(); el.setSelectionRange(99, 99); }, 250); };
      if (sel) { A.bindMarks(document.getElementById('srcbox')); const rp = document.getElementById('replay'); if (rp) rp.onclick = () => { const again = E.evaluateValidity(Object.fromEntries(E.CRITERIA.map(k => [k, sel.elements[k]]))), same = E.canonical(again.trace) === E.canonical(sel.trace); document.getElementById('rpres').innerHTML = same ? `<div class="callout ok">Replayed from the stored criteria: <b>identical decision and trace</b> (sha256 ${E.sha256(E.canonical(again.trace)).slice(0, 12)}…). Same inputs and rule version always give the same outcome.</div>` : '<div class="callout bad">Replay differs from stored decision.</div>'; A.auditAdd('decision_replay', A.user.name, { source_record_id: sel.id, identical: same }); }; }
    };
    return A.shell('Triage inbox', 'Prioritised queue. Click any evidence quote to see where it sits in the source text.', body);
  };
  function detail(r) {
    const spans = E.CRITERIA.map(k => { const e = r.elements[k]; return e.present && e.end ? { s: e.start, e: e.end, cls: CRIT_CLS[k], id: k, tip: CRIT_LABEL[k] } : null; });
    const t = r.trace, n = Object.values(t.inputs).filter(Boolean).length;
    const rows = [['valid_icsr', 'All four criteria present', 'VALID ICSR'], ['non_icsr', 'Suspect product or adverse event absent', 'NON-ICSR'], ['potential_icsr', 'Product + event present, patient or reporter absent', 'POTENTIAL ICSR (escalate)']];
    return `<div class="card fade"><div class="row"><h3>Record ${esc(r.id.startsWith('SR-') ? r.id : r.id.slice(4))}</h3><span class="sp"></span>${A.outBadge(r.outcome)}</div>
      <div class="row" style="margin:10px 0 16px;font-size:12.5px;color:var(--mut)"><span>${A.human(r.channel)}</span>·<span>${A.fmtDate(r.ts)}</span>·<span>Proposed by <code>${esc(r.model)}</code></span>·<span>Prompt <code>${esc(r.prompt)}</code></span></div>
      <div class="row" style="margin-bottom:14px">${C.ring(n / 4, { size: 76, color: n === 4 ? 'var(--ok)' : n >= 2 ? 'var(--warn)' : 'var(--bad)', label: 'criteria met' })}<div><b>${n} of 4 criteria met</b><div style="font-size:12.5px;color:var(--mut)">${r.serious ? 'Seriousness signal detected in text' : 'No seriousness signal in text'} · priority ${Math.round(r.priority * 100)}</div></div></div>
      <h4 style="margin:14px 0 10px">Criteria and evidence</h4><div class="grid g2" style="gap:10px">${E.CRITERIA.map(k => { const e = r.elements[k]; return `<div class="crit ${e.present ? 'y' : 'n'}"><div class="ic">${e.present ? '✓' : '✗'}</div><div style="min-width:0"><b>${CRIT_LABEL[k]}</b>${e.present ? `<div class="q" data-goto="${k}" title="Click to locate in the source">“${esc(e.quote.length > 90 ? e.quote.slice(0, 90) + '…' : e.quote)}”</div><div style="font-size:11px;color:var(--mut);margin-top:3px" class="mono">chars ${e.start}–${e.end}</div>` : '<div style="font-size:12.5px;color:var(--mut)">Not found in the source text</div>'}</div></div>`; }).join('')}</div>
      <h4 style="margin:20px 0 8px">Source text</h4><div class="legend" style="margin-bottom:8px">${E.CRITERIA.map(k => `<span><i class="${CRIT_CLS[k]}" style="background:${{ 'h-patient': '#E0D6FF', 'h-reporter': '#CFE3FF', 'h-product': '#C9F0DD', 'h-ae': '#FFD3CE' }[CRIT_CLS[k]]}"></i>${CRIT_LABEL[k]}</span>`).join('')}</div><div class="src" id="srcbox">${A.highlight(r.text, spans)}</div>
      <h4 style="margin:20px 0 10px">Rule decision trace · <code>${t.rule_id} v${t.rule_set_version}</code></h4>
      <div class="list" style="gap:8px">${rows.map(([o, c, res]) => `<div class="row" style="padding:10px 14px;border-radius:14px;background:${o === r.outcome ? (o === 'valid_icsr' ? 'var(--ok-soft)' : o === 'potential_icsr' ? 'var(--warn-soft)' : 'var(--card-2)') : 'transparent'};border:1.5px solid ${o === r.outcome ? 'var(--blue)' : 'var(--line)'}"><span style="flex:1;font-size:13px">${c}</span><b style="font-size:12.5px">${res}</b>${o === r.outcome ? '<span class="badge b-info">fired</span>' : ''}</div>`).join('')}</div>
      <div style="margin-top:14px;font-size:13.5px">${esc(t.explanation)}</div>
      <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600;font-size:13px">Input provenance (why each criterion was believed)</summary><table style="margin-top:8px;font-size:12.5px"><tbody>${E.CRITERIA.map(k => `<tr><td style="width:36%"><b>${CRIT_LABEL[k]}</b></td><td>${esc(t.input_provenance[k])}</td></tr>`).join('')}<tr><td><b>Fired rule</b></td><td><code>${esc(t.fired_rules[0])}</code></td></tr></tbody></table></details>
      <div class="row mt"><button class="btn ghost sm" id="replay">${A.ico('check')} Replay this decision</button><span style="font-size:12px;color:var(--mut)">Re-runs the rule from stored inputs</span></div><div id="rpres" style="margin-top:10px"></div>
      <div class="callout info mt" style="font-size:12.5px"><b>Reading note.</b> In this static build the “AI” is an offline rule-based reader that only reports what the text says with verbatim quotes. In the full system a language model does this step. Either way <b>it never decides</b>: ${t.rule_id} does.</div></div>`;
  }

  /* ======================= WORKBENCH ======================= */
  A.wb = A.wb || { c: 0, sel: null, accepted: A.LS.get('wbacc', {}) };
  const LBL = p => p.replace(/\[(\d+)\]/g, (m, i) => ' ' + (+i + 1)).replace(/\./g, ' › ').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  A.views.workbench = function () {
    const cases = window.DATA.cases, W = A.wb, c = cases[W.c], fields = c.fields.filter(f => f.value != null && f.value !== '' || f.state);
    const grp = f => { if (A.wb.accepted[c.id + f.path]) return 'ok'; if (f.state === 'accepted') return 'ok'; if (f.state === 'escalated' || f.value == null || f.value === '') return 'unk'; return 'rev'; };
    const G = { ok: [], rev: [], unk: [] }; fields.forEach(f => G[grp(f)].push(f));
    const sel = fields.find(f => f.path === W.sel) || fields[0];
    const gtitle = { ok: ['Auto-accepted', 'ok'], rev: ['Needs review', 'warn'], unk: ['Unknown or escalated', 'bad'] };
    const conf = x => x == null ? '' : `<span style="display:inline-block;width:46px;vertical-align:middle">${C.stack([{ label: 'c', value: x, color: x > .9 ? 'var(--ok)' : x > .8 ? 'var(--warn)' : 'var(--bad)' }, { label: '', value: 1 - x, color: 'var(--line)' }], { h: 6 })}</span> ${Math.round(x * 100)}%`;
    const total = fields.length, accepted = G.ok.length;
    const body = `<div class="row" style="margin-bottom:18px">${cases.map((x, i) => `<button class="chip ${i === W.c ? 'on' : ''}" data-c="${i}">${x.number} <span style="opacity:.7;font-weight:500">· ${A.human(x.state)}</span></button>`).join('')}</div>
    <div class="grid g-5-7" style="align-items:start"><div class="card"><div class="row" style="margin-bottom:16px;gap:18px">${C.ring(c.completeness.overall_score, { size: 96, color: 'var(--blue)', label: 'completeness' })}<div><b>Case completeness</b><div style="font-size:12.5px;color:var(--mut)">${accepted}/${total} fields accepted · v${c.version}</div><div style="margin-top:6px">${c.completeness.missing_mandatory.length ? `<span class="badge b-bad">${c.completeness.missing_mandatory.length} mandatory missing</span>` : '<span class="badge b-ok">All mandatory present</span>'}</div></div></div>
      ${['rev', 'unk', 'ok'].map(g => G[g].length ? `<div style="margin-top:14px"><div class="row" style="margin-bottom:8px"><span class="badge b-${gtitle[g][1]}">${gtitle[g][0]}</span><span style="color:var(--mut);font-size:12.5px">${G[g].length}</span></div><div class="list" style="gap:6px">${G[g].map(f => `<div class="item ${sel && f.path === sel.path ? 'sel' : ''}" data-p="${esc(f.path)}" tabindex="0" role="button" style="padding:10px 14px"><div class="row"><span style="font-size:12px;color:var(--mut)">${esc(LBL(f.path))}</span><span class="sp"></span><span class="badge ${f.by === 'rule' ? 'b-teal' : 'b-vio'}">${f.by === 'rule' ? 'Rule' : 'AI'}</span></div><div style="font-weight:600;margin-top:2px">${esc(f.value == null || f.value === '' ? '— unknown' : String(f.value))}</div></div>`).join('')}</div></div>` : '').join('')}</div>
      <div class="sticky-r"><div class="card fade">${sel ? `<div class="hd"><div><h3>${esc(LBL(sel.path))}</h3><div class="sub">Provenance for this field</div></div>${sel.state === 'accepted' || A.wb.accepted[c.id + sel.path] ? '<span class="badge b-ok">Accepted</span>' : `<span class="badge b-warn">${esc(A.human(sel.state || 'unknown'))}</span>`}</div>
        <div class="fact"><div class="k">Value</div><div class="val">${esc(sel.value == null || sel.value === '' ? 'Unknown' : String(sel.value))}</div></div>
        <div class="grid g2 mt" style="gap:10px"><div class="fact"><div class="k">Produced by</div><b>${sel.by === 'rule' ? 'Deterministic rule' : 'AI model'}</b><div style="font-size:12px;color:var(--mut)" class="mono">${esc(sel.rule || sel.model || '—')}</div></div><div class="fact"><div class="k">Confidence</div><b>${sel.conf != null ? conf(sel.conf) : 'n/a (rule)'}</b><div style="font-size:12px;color:var(--mut)" class="mono">${esc(sel.prompt || '')}</div></div></div>
        <h4 style="margin:18px 0 8px">Source evidence</h4>${sel.ev.length ? sel.ev.map(e => `<div class="fact" style="margin-bottom:8px"><div style="font-size:15px">“${esc(e.quote)}”</div>${e.tr ? `<div style="font-size:13px;color:var(--mut);margin-top:4px">Translated: “${esc(e.tr)}”</div>` : ''}<div class="mono" style="font-size:11.5px;color:var(--mut);margin-top:6px">${e.s != null ? `source chars ${e.s}–${e.e}` : ''}</div></div>`).join('') : '<div class="callout info" style="font-size:13px">No evidence span. This value was derived by a rule from other fields or system events, not read from the source.</div>'}
        <div class="row mt"><button class="btn sm" id="acc" ${A.wb.accepted[c.id + sel.path] || sel.state === 'accepted' ? 'disabled' : ''}>${A.ico('check')} Accept field</button><span style="font-size:12px;color:var(--mut)">Recorded in the audit trail</span></div>` : ''}</div>
      ${c.missing.length ? `<div class="card mt"><h3>Missing information</h3><div class="sub" style="margin-bottom:12px">Follow-up questions the system would send</div>${c.missing.map(m => `<div class="callout warn" style="margin-bottom:10px"><b>${esc(LBL(m.field_path))}</b>${m.is_mandatory ? ' <span class="badge b-bad">mandatory</span>' : ''}<div style="margin:4px 0">${esc(m.description)}</div><div><b>Ask:</b> ${esc(m.follow_up_question)}</div></div>`).join('')}</div>` : ''}</div></div>`;
    A.after = () => {
      document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { W.c = +b.dataset.c; W.sel = null; A.rerender(); });
      document.querySelectorAll('[data-p]').forEach(el => { const go = () => { W.sel = el.dataset.p; A.rerender(); }; el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter') go(); }; });
      const a = document.getElementById('acc'); if (a) a.onclick = () => { A.wb.accepted[c.id + sel.path] = 1; A.LS.set('wbacc', A.wb.accepted); A.auditAdd('human_field_accept', A.user.name, { case_id: c.id, field: sel.path }); A.toast('Field accepted and logged'); A.rerender(); };
    };
    return A.shell('Case workbench', 'Canonical case fields, each with its producer, confidence and source evidence. Golden fixtures from the original project.', body);
  };
})();
