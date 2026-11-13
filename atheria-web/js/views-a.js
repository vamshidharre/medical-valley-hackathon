/* Views A — Atheria triage side: dashboard, report form, literature, inbox, workbench */
(function () {
  'use strict';
  const { E, C, esc } = A;
  A.rerender = async () => { const y = window.scrollY; await A.render(); window.scrollTo(0, y); };
  const KPI = (label, v, foot, ico, tone, spark) => `<div class="card kpi"><div class="ico" style="background:var(--${tone}-soft);color:var(--${tone})">${A.ico(ico)}</div><div class="lb">${label}</div><div class="v">${v}</div><div class="ft">${foot}</div>${spark ? spark : ''}</div>`;
  const CRIT_LABEL = { identifiable_patient: 'Identifiable patient', identifiable_reporter: 'Identifiable reporter', suspect_product: 'Suspect product', adverse_event: 'Adverse event' };
  const CRIT_CLS = { identifiable_patient: 'h-patient', identifiable_reporter: 'h-reporter', suspect_product: 'h-product', adverse_event: 'h-ae' };

  /* ======================= DASHBOARD ======================= */
  const chanBadge = c => `<span class="badge ${c === 'safereport' ? 'b-teal' : 'b-mut'}">${A.ico(A.chanIcon(c), 'width="13" height="13"')}${c === 'safereport' ? 'SafeReport · Exasol' : A.chanLabel(c)}</span>`;
  const KPITab = (tab, on, label, v, foot, ico, tone, spark) => `<button type="button" class="card kpi tab ${on ? 'on' : ''}" data-tab="${tab}"><div class="ico" style="background:var(--${tone}-soft);color:var(--${tone})">${A.ico(ico)}</div><div class="lb">${label}</div><div class="v">${v}</div><div class="ft">${foot}</div>${spark || ''}<svg class="arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>`;
  const recordCard = r => `<a class="item" href="#/inbox?id=${r.id}"><div class="row">${chanBadge(r.channel)}<span class="sp"></span>${A.statusBadge(r)}</div><div class="t">${esc(r.text.replace(/\s+/g, ' '))}</div><div class="m">${r.confirmed ? `${C.criteriaDots(r.trace.inputs)}<span>${Object.values(r.trace.inputs).filter(Boolean).length}/4 criteria</span>` : '<span style="font-size:12px;color:var(--mut)">No decision confirmed yet</span>'}</div></a>`;
  A.dashUI = A.dashUI || { tab: 'received' };
  A.views.dashboard = function () {
    const U = A.dashUI, ib = A.inbox, by = o => ib.filter(r => r.confirmed && r.finalOutcome === o).length;
    const valid = by('valid_icsr'), pot = by('potential_icsr'), non = by('non_icsr');
    const chanCounts = {}; ib.forEach(r => { chanCounts[r.channel] = (chanCounts[r.channel] || 0) + 1; });
    const chanRows = Object.entries(chanCounts).sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ label: A.chanLabel(c), value: n, text: n, color: A.chanColor(c) }));
    const inv = Object.keys(A.invState), builds = inv.map(A.build).filter(Boolean);
    const invCases = builds.reduce((a, b) => a + b.cases.length, 0);
    const months = {}, ser = {}; A.reports.forEach(r => { const m = r.date.slice(0, 7); months[m] = (months[m] || 0) + 1; if (r.serious) ser[m] = (ser[m] || 0) + 1; });
    const ml = Object.keys(months).sort(); const mlabel = ml.map(m => new Date(m + '-15').toLocaleString(undefined, { month: 'short', year: '2-digit' }));
    const donut = [{ label: 'Valid ICSR', value: valid, color: 'var(--ok)' }, { label: 'Escalated', value: pot, color: 'var(--warn)' }, { label: 'Not an ICSR', value: non, color: 'var(--c-una)' }];
    const critRows = E.CRITERIA.map(k => { const n = ib.filter(r => r.elements[k].present).length; return { label: CRIT_LABEL[k], value: n, text: `${n}/${ib.length}`, color: n === ib.length ? 'var(--ok)' : 'var(--blue)', sub: ib.length - n ? `${ib.length - n} record(s) could not establish this` : 'present in every record' }; });
    const mx = Math.max(1, ib.length), fun = [['Received', ib.length, 'var(--blue)'], ['≥ 3 criteria found', ib.filter(r => Object.values(r.trace.inputs).filter(Boolean).length >= 3).length, 'var(--teal)'], ['Product + event (core)', ib.filter(r => r.outcome !== 'non_icsr').length, 'var(--violet)'], ['Valid ICSR', valid, 'var(--ok)']];
    const watch = A.flagged.slice(0, 6).map(p => { const b = A.invState[p.signal_id] ? A.build(p.signal_id) : null; return `<a class="item" href="${A.sigUrl(p.signal_id)}"><div class="row"><b>${esc(A.sigLabel(p))}</b><span class="sp"></span>${b ? A.recBadge(b.rec.rule_id) : '<span class="badge b-info">Not investigated</span>'}</div><div class="m"><span>PRR <b class="mono">${p.prr}</b></span><span>${p.a} cases</span>${b ? `<span style="flex:1;min-width:90px">${C.stack(Object.entries(b.rec.inputs.distribution).map(([k, v]) => ({ label: k, value: v, color: C.CAT[k] })), { h: 8 })}</span>` : ''}</div></a>`; }).join('');

    // ---- the four tabs, each a self-contained, focused view of one KPI ----
    const tabReceived = `
      <div class="grid g-7-5 mt" style="align-items:center"><div class="card"><div class="hd"><div><h3>Where records come from</h3><div class="sub">Every intake channel, read and decided by the same rule</div></div></div>${C.hbars(chanRows)}<div class="row mt" style="flex-wrap:wrap;gap:8px">${A.CHANNELS.map(chanBadge).join('')}</div></div>
        <div class="card"><div class="hd"><div><h3>Reporting volume</h3><div class="sub">Per month, with the serious share</div></div></div>${C.line([{ name: 'All reports', values: ml.map(m => months[m]), color: 'var(--blue)', area: 1 }, { name: 'Serious', values: ml.map(m => ser[m] || 0), color: 'var(--c-unl)' }], mlabel, { label: 'Monthly reports' })}</div></div>
      <div class="card mt"><div class="hd"><div><h3>Intake funnel</h3><div class="sub">Where records go after being received</div></div></div>${C.hbars(fun.map(([l, v, c]) => ({ label: l, value: v, color: c, text: v })), { max: mx })}</div>
      <div class="card mt"><div class="hd"><div><h3>Latest records</h3><div class="sub">Newest first</div></div><a href="#/inbox">Open triage inbox</a></div>${ib.length ? `<div class="grid g3">${ib.slice(0, 6).map(recordCard).join('')}</div>` : '<div class="empty"><b>No records yet</b>Run a literature sweep to bring in new records.</div>'}</div>`;

    const tabValid = `
      <div class="grid g-5-7 mt" style="align-items:center"><div class="card"><div class="hd"><div><h3>All triage outcomes</h3><div class="sub">Decided by rule <code>val_001 v1.0.0</code></div></div></div><div class="row" style="justify-content:center;gap:24px">${C.donut(donut, { size: 160, sub: 'records', center: ib.length })}<div style="min-width:150px">${C.legend(donut).replace('class="legend"', 'class="legend" style="flex-direction:column;gap:8px"')}</div></div></div>
        <div class="card"><div class="hd"><div><h3>Why these count as valid</h3><div class="sub">Share of all records where each ICSR criterion was found</div></div></div>${C.hbars(critRows, { max: Math.max(1, ib.length) })}</div></div>
      <div class="card mt"><div class="hd"><div><h3>Valid ICSR records</h3><div class="sub">All 4 criteria met — patient, reporter, product and event — and confirmed by a reviewer</div></div><a href="#/inbox">Open triage inbox</a></div>${valid ? `<div class="grid g3">${ib.filter(r => r.confirmed && r.finalOutcome === 'valid_icsr').slice(0, 6).map(recordCard).join('')}</div>` : '<div class="empty"><b>None yet</b>No record has been confirmed as valid. Open the triage inbox, enable AI on a record and confirm it.</div>'}</div>`;

    const missing = E.CRITERIA.map(k => ({ k, n: ib.filter(r => r.confirmed && r.finalOutcome === 'potential_icsr' && !r.elements[k].present).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
    const tabAwaiting = `
      <div class="card mt"><div class="hd"><div><h3>What's missing on escalated records</h3><div class="sub">Core facts (product + event) are present — these are what stopped a record being counted valid</div></div></div>${missing.length ? C.hbars(missing.map(x => ({ label: CRIT_LABEL[x.k], value: x.n, text: `${x.n} record(s)`, color: 'var(--warn)' })), { max: Math.max(1, pot) }) : '<div class="empty"><b>Nothing missing</b>No record is currently confirmed as escalated.</div>'}</div>
      <div class="card mt"><div class="hd"><div><h3>Awaiting review</h3><div class="sub">Product and event are present, but the record could not be confirmed complete — never guessed, always escalated to a person</div></div><a href="#/inbox">Open triage inbox</a></div>${pot ? `<div class="grid g3">${ib.filter(r => r.confirmed && r.finalOutcome === 'potential_icsr').slice(0, 6).map(recordCard).join('')}</div>` : '<div class="empty"><b>Nothing awaiting review</b>No record has been confirmed as escalated yet.</div>'}</div>`;

    const tabFlagged = `
      <div class="grid g-7-5 mt"><div class="card"><div class="hd"><div><h3>Signal map</h3><div class="sub">Every drug–event pair in the 1,261-report dataset. Larger bubble = stronger χ². Click one to investigate.</div></div><a class="btn ghost sm" href="#/signals">Open signals</a></div>${C.bubble(A.pairs, { href: s => A.sigUrl(s.signal_id) })}</div>
        <div class="card"><div class="hd"><div><h3>Signal watchlist</h3><div class="sub">Ranked by PRR, with what the rules concluded</div></div></div><div class="list">${watch}</div></div></div>
      <div class="card mt"><div class="hd"><div><h3>Reviewer time saved</h3><div class="sub">Assumes 15 minutes of manual reading per case</div></div></div><div class="row" style="justify-content:space-around">${C.ring(Math.min(1, invCases * 15 / 60 / 40), { color: 'var(--ok)', size: 130, label: 'time saved' })}<div><div class="v" style="font-size:34px;font-weight:700">${(invCases * 15 / 60).toFixed(1)} h</div><div style="color:var(--mut);font-size:13px">${invCases} case narratives read<br>by AI, every quote verified</div></div></div><div class="callout info mt" style="font-size:12.5px">The estimate is an assumption, not a measurement. Ring shows progress toward a 40-hour reference workload.</div></div>`;

    const TABS = { received: tabReceived, valid: tabValid, awaiting: tabAwaiting, flagged: tabFlagged };
    if (!TABS[U.tab]) U.tab = 'received';
    const body = `
    <div class="hero fade"><div><h2>Every safety decision, explained.</h2><p>AI reads the text. A versioned rules engine decides. You approve. Each answer below links back to the exact words in the source.</p>
      <div class="row" style="margin-top:20px"><a class="btn white" href="#/inbox">${A.ico('inbox')} Open triage inbox</a><a class="btn" style="background:rgba(255,255,255,.2);box-shadow:none" href="#/signals">${A.ico('pulse')} Investigate signals</a></div></div>${A.cross(210)}</div>
    <div class="grid g4 mt">
      ${KPITab('received', U.tab === 'received', 'Records received', ib.length, 'Tap to see where from', 'inbox', 'blue', C.spark([1, 2, 2, 3, 3, 4, ib.length || 1], { color: 'var(--blue)' }))}
      ${KPITab('valid', U.tab === 'valid', 'Valid ICSRs', valid, 'Tap to see which, and why', 'check', 'ok')}
      ${KPITab('awaiting', U.tab === 'awaiting', 'Awaiting review', pot, 'Tap to see what’s missing', 'alert', 'warn')}
      ${KPITab('flagged', U.tab === 'flagged', 'Signals flagged', A.flagged.length, 'Tap to open the signal map', 'pulse', 'violet', C.spark(A.flagged.map(p => p.prr).slice().reverse().map(v => Math.log10(v) + 1), { color: 'var(--violet)' }))}</div>
    ${TABS[U.tab]}`;
    A.after = () => { document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { A.dashUI.tab = b.dataset.tab; A.rerender(); }); };
    return A.shell('Hello,<br>' + esc(A.user.name), 'Pharmacovigilance command center for ICSR triage and signal investigation.', body);
  };
  A.flowStrip = (active) => {
    const st = [['Statistics', 'detect', 'PRR · ROR 95% CI · χ² · Evans', 'b-teal'], ['AI', 'extracts', 'Reads text, returns facts with verbatim quotes', 'b-vio'], ['Code', 'verifies', 'Every quote located at real character offsets', 'b-info'], ['Rules', 'decide', 'Versioned, pure, replayable', 'b-warn'], ['Human', 'approves', 'Override with a reason, sign off', 'b-ok']];
    return `<div class="flow">${st.map((s, i) => `<div class="st ${active === i ? 'on' : active > i ? 'done' : ''}"><span class="badge ${s[3]} who">${s[0]}</span><b>${s[1]}</b><span>${s[2]}</span></div>`).join('')}</div>`;
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
    const body = `<div class="row" style="margin-bottom:16px"><div class="callout ${L.exasol && L.exasol.ok ? 'ok' : 'info'}" style="flex:1;font-size:13px" id="exStatus">${L.exasol === undefined ? 'Checking Exasol…' : L.exasol.ok ? `<b>Exasol is being used:</b> this schema (<code>ATHERIA_PV.LITERATURE_PAPERS</code>) on the local Exasol database currently holds <b>${L.exasol.literature_papers}</b> paper(s) — the same database this project's Exasol MCP server reads from.` : `<b>Exasol not reachable:</b> ${esc(L.exasol.error || 'unknown error')}`}</div></div>
    <div class="grid g-5-7" style="align-items:start"><form class="card" id="lf2"><h3>Standing query</h3><div class="sub" style="margin-bottom:14px">Marketing authorisation holders must screen published literature for reactions to their products.</div>
      <div class="row" style="margin-bottom:14px">${PRESETS.map(p => `<button type="button" class="chip ${L.q === p[1] ? 'on' : ''}" data-q="${esc(p[1])}">${p[0]}</button>`).join('')}</div>
      <div class="field"><label for="lq">PubMed query</label><input id="lq" value="${esc(L.q)}"></div><div class="field mt"><label for="ln2">Max articles</label><select id="ln2">${[1, 2, 3, 5, 8].map(n => `<option ${L.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="row mt"><button class="btn" id="run" type="submit">${A.ico('book')} Run sweep</button></div>
      <div class="callout info mt" style="font-size:12.5px">Runs live against NCBI E-utilities from your browser. If the network is unavailable, bundled synthetic abstracts are used instead and clearly labelled. Articles already seen are skipped by content hash. Every result is also written to Exasol.</div></form>
      <div id="lres">${r ? litResult(r) : '<div class="card"><div class="empty"><b>No sweep run yet</b>Choose a preset and press Run sweep.</div></div>'}</div></div>`;
    A.after = () => {
      if (L.exasol === undefined) { L.exasol = null; A.getExasolStatus().then(s => { L.exasol = s; A.rerender(); }); }
      document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { A.lit.q = b.dataset.q; A.rerender(); });
      document.getElementById('lf2').onsubmit = async e => {
        e.preventDefault(); A.lit.q = document.getElementById('lq').value; A.lit.n = +document.getElementById('ln2').value;
        const btn = document.getElementById('run'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Searching PubMed…';
        let out = await pubmed(A.lit.q, A.lit.n), live = out.live, docs = out.docs, note = '';
        if (!out.live) { docs = A.SAMPLES.filter(s => s[0] === 'literature_pubmed').map((s, i) => ({ pmid: 'sample-' + (i + 1), text: s[1].replace(' (Synthetic sample abstract for demonstration.)', ' (Synthetic sample abstract, variant ' + Date.now().toString(36).slice(-3) + '.)') })).slice(0, A.lit.n); note = 'PubMed was not reachable (' + out.err + '). Showing synthetic sample abstracts instead.'; }
        let dups = 0; const results = []; docs.forEach(d => { const o = A.triage(d.text, 'literature_pubmed', { pmid: d.pmid }); if (o.duplicate) dups++; results.push(o.record); });
        A.lit.res = { q: A.lit.q, live, note, ingested: results.length - dups, dups, triaged: results.length, results, exasolWrite: null };
        A.rerender();
        const rows = results.map(rec => ({ pmid: rec.meta.pmid, query: A.lit.q, title: rec.text.split('\n')[0].slice(0, 200), abstract_text: rec.text, outcome: rec.outcome, criteria_patient: rec.elements.identifiable_patient.present, criteria_reporter: rec.elements.identifiable_reporter.present, criteria_product: rec.elements.suspect_product.present, criteria_event: rec.elements.adverse_event.present }));
        const w = await A.callExasolLiterature(rows);
        A.lit.res.exasolWrite = w; A.lit.exasol = await A.getExasolStatus(); A.rerender();
      };
    };
    return A.shell('Literature monitoring', 'Scheduled screening of published literature. Each article is ingested as a source record, then decided by the same rule as every other channel, and written to the Exasol database.', body);
  };
  function litResult(r) {
    return `<div class="card fade"><div class="hd"><div><h3>Sweep results</h3><div class="sub">“${esc(r.q)}” · ${r.live ? 'live PubMed' : 'offline samples'}</div></div></div>${r.note ? `<div class="callout warn" style="margin-bottom:14px;font-size:12.5px">${esc(r.note)}</div>` : ''}
      <div class="grid g3" style="margin-bottom:16px">${[['Ingested', r.ingested, 'ok'], ['Duplicates skipped', r.dups, 'mut'], ['Triaged', r.triaged, 'info']].map(x => `<div class="fact"><div class="k">${x[0]}</div><div class="val">${x[1]}</div></div>`).join('')}</div>
      ${r.exasolWrite === null ? `<div class="callout info" style="font-size:12.5px;margin-bottom:14px">Writing to Exasol…</div>` : r.exasolWrite ? (r.exasolWrite.ok ? `<div class="callout ok" style="font-size:12.5px;margin-bottom:14px"><b>Stored in Exasol:</b> ${r.exasolWrite.inserted} new row(s) written to <code>ATHERIA_PV.LITERATURE_PAPERS</code> (${r.exasolWrite.skipped_duplicates} already there) — ${r.exasolWrite.total_in_exasol} total now.</div>` : `<div class="callout bad" style="font-size:12.5px;margin-bottom:14px"><b>Exasol write failed:</b> ${esc(r.exasolWrite.error)}</div>`) : ''}
      <div class="list">${r.results.map(x => `<a class="item" href="#/inbox?id=${x.id}"><div class="row"><b style="font-size:14px">${esc(x.text.split('\n')[0].slice(0, 90))}</b><span class="sp"></span>${A.outBadge(x.outcome)}</div><div class="m">${C.criteriaDots(x.trace.inputs)}<span>${esc(x.meta.pmid ? 'PMID ' + x.meta.pmid : '')}</span></div></a>`).join('') || '<div class="empty">No articles matched.</div>'}</div></div>`;
  }

  /* ======================= INBOX ======================= */
  A.inboxUI = A.inboxUI || { outcome: '', channel: '', q: '', decision: {} };
  const OUTCOME_CHOICES = [['valid_icsr', 'Valid ICSR'], ['potential_icsr', 'Escalate (Potential ICSR)'], ['non_icsr', 'Not an ICSR']];
  A.views.inbox = function ({ q }) {
    const U = A.inboxUI, ib = A.inbox, id = q.get('id') || (A.inboxSel && ib.find(r => r.id === A.inboxSel) ? A.inboxSel : (ib[0] || {}).id);
    A.inboxSel = id;
    const vis = ib.filter(r => (!U.outcome || (r.confirmed && r.finalOutcome === U.outcome)) && (!U.channel || r.channel === U.channel) && (!U.q || r.text.toLowerCase().includes(U.q.toLowerCase())));
    const sel = ib.find(r => r.id === id), by = o => ib.filter(r => r.confirmed && r.finalOutcome === o).length;
    const chans = [...new Set(ib.map(r => r.channel))];
    const stat = (l, v, t) => `<div class="card kpi" style="padding:16px 20px"><div class="lb">${l}</div><div class="v" style="font-size:28px;color:var(--${t})">${v}</div></div>`;
    const row = r => `<div class="row">${chanBadge(r.channel)}${r.sample ? '<span class="badge b-info">sample</span>' : ''}<span class="sp"></span>${A.statusBadge(r)}</div><div class="t">${esc(r.text.replace(/\s+/g, ' '))}</div><div class="m">${r.confirmed ? `${C.criteriaDots(r.trace.inputs)}<span>${Object.values(r.trace.inputs).filter(Boolean).length}/4</span><span class="sp"></span><span>Priority</span><span style="width:60px">${C.stack([{ label: 'priority', value: r.priority, color: r.priority > .7 ? 'var(--bad)' : r.priority > .45 ? 'var(--warn)' : 'var(--blue)' }, { label: '', value: 1 - r.priority, color: 'var(--line)' }], { h: 7 })}</span>` : `<span style="font-size:12px;color:var(--mut)">${r.liveAI ? 'Analysed — awaiting a reviewer’s confirmation' : 'Received, not yet analysed'}</span>`}</div>`;
    const body = `<div class="callout info mt" style="font-size:13px;margin-bottom:16px">Nothing counts as Valid, Escalated or Not an ICSR until a reviewer confirms it. Open a record, click <b>Enable AI</b>, then confirm or change its determination.</div>
    <div class="grid g4">${stat('Total records', ib.length, 'ink')}${stat('Valid ICSR', by('valid_icsr'), 'ok')}${stat('Escalated', by('potential_icsr'), 'warn')}${stat('Not ICSR', by('non_icsr'), 'mut')}</div>
    <div class="grid g-5-7 mt" style="align-items:start"><div class="card"><div class="row" style="margin-bottom:12px"><input class="input" id="iq" placeholder="Search text…" value="${esc(U.q)}" style="max-width:200px;padding:9px 14px"><select class="input" id="ic" style="max-width:170px;padding:9px 14px"><option value="">All channels</option>${chans.map(c => `<option value="${c}" ${U.channel === c ? 'selected' : ''}>${A.chanLabel(c)}</option>`).join('')}</select><button class="btn ghost sm" id="sync-db" style="margin-left:auto;gap:6px" title="Sync live reports from Exasol"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">${A.I.link}</svg> Sync Exasol</button></div>
      <div class="row" style="margin-bottom:14px">${[['', 'All'], ['valid_icsr', 'Valid'], ['potential_icsr', 'Escalated'], ['non_icsr', 'Not ICSR']].map(([v, l]) => `<button class="chip ${U.outcome === v ? 'on' : ''}" data-o="${v}">${l}</button>`).join('')}</div>
      <div class="list" style="max-height:70vh;overflow:auto;padding:2px">${vis.map(r => `<div class="item ${r.id === id ? 'sel' : ''}" data-id="${r.id}" tabindex="0" role="button">${row(r)}</div>`).join('') || '<div class="empty"><b>Nothing here</b>No records match these filters.</div>'}</div></div>
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
      if (sel) {
        const b = document.getElementById('enableAi');
        if (b) b.onclick = async () => {
          b.disabled = true; b.innerHTML = '<span class="spin"></span> Analyzing with Claude…';
          const errBox = document.getElementById('aiErr'); if (errBox) errBox.innerHTML = '';
          const out = await A.callClaude(sel.text);
          if (!out || !out.ok) {
            if (errBox) errBox.innerHTML = `<div class="callout bad mt" style="font-size:12.5px"><b>Could not analyze this record.</b> ${esc((out && out.error) || 'Unknown error.')}</div>`;
            b.disabled = false; b.innerHTML = `${A.ico('bot')} Enable AI`;
            return;
          }
          const elements = {};
          E.CRITERIA.forEach(k => {
            const e = (out.elements && out.elements[k]) || { present: false };
            if (e.present && e.quote) { const sp = E.locateQuote(e.quote, sel.text); elements[k] = sp ? { present: true, quote: e.quote, start: sp[0], end: sp[1] } : { present: false }; }
            else elements[k] = { present: false };
          });
          const v = E.evaluateValidity(elements);
          sel.elements = elements; sel.outcome = v.outcome; sel.trace = v.trace; sel.priority = E.priority(elements, sel.serious);
          sel.model = out.model || 'claude'; sel.prompt = 'claude_extract_v1 (live)'; sel.liveAI = true;
          U.decision[sel.id] = { choice: v.outcome, reason: '' };
          A.auditAdd('ai_extraction', 'system', { source_record_id: sel.id, model_id: sel.model, prompt_version: sel.prompt, criteria: v.trace.inputs, live: true }, false);
          A.auditAdd('rule_evaluation', 'system', { source_record_id: sel.id, rule_id: v.trace.rule_id, rule_set_version: v.trace.rule_set_version, fired: v.trace.fired_rules, outcome: v.outcome }, false);
          A.persistAudit(); A.persistInbox();
          A.toast('Analyzed live by Claude · proposed ' + A.OUT_LABEL[v.outcome]);
          A.rerender();
        };
      }
      if (sel && sel.liveAI && !sel.confirmed) {
        const d = U.decision[sel.id] || (U.decision[sel.id] = { choice: sel.outcome, reason: '' });
        document.querySelectorAll('[data-choice]').forEach(c => c.onclick = () => { d.choice = c.dataset.choice; A.rerender(); });
        const reasonEl = document.getElementById('ovReason'); if (reasonEl) reasonEl.oninput = e => { d.reason = e.target.value; const cb = document.getElementById('confirmBtn'); if (cb) cb.disabled = d.choice !== sel.outcome && !d.reason.trim(); };
        const cb = document.getElementById('confirmBtn');
        if (cb) cb.onclick = () => {
          const overridden = d.choice !== sel.outcome;
          sel.confirmed = true; sel.finalOutcome = d.choice; sel.decidedBy = A.user.name; sel.decidedAt = new Date().toISOString(); sel.overridden = overridden;
          if (overridden) A.auditAdd('human_override', A.user.name, { source_record_id: sel.id, from: sel.outcome, to: d.choice, reason: d.reason });
          A.auditAdd('human_signoff', A.user.name, { source_record_id: sel.id, decision: d.choice, rule_proposed: sel.outcome });
          A.persistAudit(); A.persistInbox(); delete U.decision[sel.id];
          A.toast('Confirmed · ' + A.OUT_LABEL[d.choice]);
          A.rerender();
        };
      }
      if (sel && sel.confirmed) { const ch = document.getElementById('changeDecision'); if (ch) ch.onclick = () => { sel.confirmed = false; U.decision[sel.id] = { choice: sel.finalOutcome, reason: '' }; A.rerender(); }; }
    };
    return A.shell('Triage inbox', 'Nothing is counted until a reviewer confirms it. Click any evidence quote to see where it sits in the source text.', body);
  };
  function detail(r) {
    if (!r.liveAI) {
      return `<div class="card fade"><div class="row"><h3>Record ${esc(r.id.slice(4))}</h3><span class="sp"></span>${A.statusBadge(r)}</div>
        <div class="row mt" style="align-items:center;gap:12px;margin:14px 0"><button class="btn" id="enableAi" type="button">${A.ico('bot')} Enable AI</button><span style="font-size:12.5px;color:var(--mut)">Sends this one record to the real Claude API, live, right now</span></div>
        <div id="aiErr"></div>
        <div class="row" style="margin:10px 0 16px;font-size:12.5px;color:var(--mut)"><span>${A.chanLabel(r.channel)}</span>·<span>${A.fmtDate(r.ts)}</span></div>
        <h4 style="margin:14px 0 8px">Source text, exactly as received</h4><div class="src">${esc(r.text)}</div>
        <div class="callout info mt" style="font-size:12.5px">No category, no priority, no determination yet — just the words and where they came from. Click <b>Enable AI</b> to have Claude read it against the 4 ICSR criteria.</div></div>`;
    }
    const spans = E.CRITERIA.map(k => { const e = r.elements[k]; return e.present && e.end ? { s: e.start, e: e.end, cls: CRIT_CLS[k], id: k, tip: CRIT_LABEL[k] } : null; });
    const t = r.trace, n = Object.values(t.inputs).filter(Boolean).length;
    const rows = [['valid_icsr', 'All four criteria present', 'VALID ICSR'], ['non_icsr', 'Suspect product or adverse event absent', 'NON-ICSR'], ['potential_icsr', 'Product + event present, patient or reporter absent', 'POTENTIAL ICSR (escalate)']];
    const d = A.inboxUI.decision[r.id] || { choice: r.outcome, reason: '' };
    const decisionBlock = r.confirmed
      ? `<div class="card mt" style="background:var(--card-2)"><div class="row"><h4 style="margin:0">Confirmed determination</h4><span class="sp"></span>${A.outBadge(r.finalOutcome)}</div>
        <div style="font-size:12.5px;color:var(--mut);margin-top:8px">${r.overridden ? `Reviewer <b>${esc(r.decidedBy)}</b> overrode the rule's proposal of <b>${A.OUT_LABEL[r.outcome]}</b>.` : `Reviewer <b>${esc(r.decidedBy)}</b> confirmed the rule's proposal.`} Confirmed ${A.fmtDate(r.decidedAt)}.</div>
        <div class="row mt"><button class="btn ghost sm" id="changeDecision">Change decision</button></div></div>`
      : `<div class="card mt" style="background:var(--card-2)"><h4 style="margin:0 0 6px">Final determination</h4><div class="sub" style="margin-bottom:12px">The rule proposes <b>${A.OUT_LABEL[r.outcome]}</b>. Confirm it, or choose a different outcome — this is what counts toward the numbers.</div>
        <div class="grid g3" style="gap:8px">${OUTCOME_CHOICES.map(([v, l]) => `<button class="chip ${d.choice === v ? 'on' : ''}" data-choice="${v}" style="width:100%;text-align:center">${l}${v === r.outcome ? ' <span style="opacity:.6">(rule)</span>' : ''}</button>`).join('')}</div>
        ${d.choice !== r.outcome ? `<div class="field mt"><label for="ovReason">Reason for overriding the rule</label><textarea id="ovReason" placeholder="Why does this differ from the rule's proposal?">${esc(d.reason || '')}</textarea></div>` : ''}
        <div class="row mt"><button class="btn" id="confirmBtn" ${d.choice !== r.outcome && !(d.reason || '').trim() ? 'disabled' : ''}>${A.ico('check')} Confirm</button><span style="font-size:12px;color:var(--mut)">Only this increases the counts above</span></div></div>`;
    return `<div class="card fade"><div class="row"><h3>Record ${esc(r.id.slice(4))}</h3><span class="sp"></span><span class="badge b-vio">Live Claude call</span>${A.statusBadge(r)}</div>
      <div class="row mt" style="align-items:center;gap:12px;margin-bottom:14px"><button class="btn ghost sm" id="enableAi" type="button">${A.ico('bot')} Re-run with Claude</button><span style="font-size:12.5px;color:var(--mut)">Already read live by Claude — click to ask again</span></div>
      <div id="aiErr"></div>
      <div class="row" style="margin:10px 0 16px;font-size:12.5px;color:var(--mut)"><span>${A.chanLabel(r.channel)}</span>·<span>${A.fmtDate(r.ts)}</span>·<span>Proposed by <code>${esc(r.model)}</code></span>·<span>Prompt <code>${esc(r.prompt)}</code></span></div>
      <div class="row" style="margin-bottom:14px">${C.ring(n / 4, { size: 76, color: n === 4 ? 'var(--ok)' : n >= 2 ? 'var(--warn)' : 'var(--bad)', label: 'criteria met' })}<div><b>${n} of 4 criteria met</b><div style="font-size:12.5px;color:var(--mut)">${r.serious ? 'Seriousness signal detected in text' : 'No seriousness signal in text'} · priority ${Math.round(r.priority * 100)}</div></div></div>
      <h4 style="margin:14px 0 10px">Criteria and evidence</h4><div class="grid g2" style="gap:10px">${E.CRITERIA.map(k => { const e = r.elements[k]; return `<div class="crit ${e.present ? 'y' : 'n'}"><div class="ic">${e.present ? '✓' : '✗'}</div><div style="min-width:0"><b>${CRIT_LABEL[k]}</b>${e.present ? `<div class="q" data-goto="${k}" title="Click to locate in the source">“${esc(e.quote.length > 90 ? e.quote.slice(0, 90) + '…' : e.quote)}”</div><div style="font-size:11px;color:var(--mut);margin-top:3px" class="mono">chars ${e.start}–${e.end}</div>` : '<div style="font-size:12.5px;color:var(--mut)">Not found in the source text</div>'}</div></div>`; }).join('')}</div>
      <h4 style="margin:20px 0 8px">Source text</h4><div class="legend" style="margin-bottom:8px">${E.CRITERIA.map(k => `<span><i class="${CRIT_CLS[k]}" style="background:${{ 'h-patient': '#E0D6FF', 'h-reporter': '#CFE3FF', 'h-product': '#C9F0DD', 'h-ae': '#FFD3CE' }[CRIT_CLS[k]]}"></i>${CRIT_LABEL[k]}</span>`).join('')}</div><div class="src" id="srcbox">${A.highlight(r.text, spans)}</div>
      <h4 style="margin:20px 0 10px">Rule's proposal · <code>${t.rule_id} v${t.rule_set_version}</code></h4>
      <div class="list" style="gap:8px">${rows.map(([o, c, res]) => `<div class="row" style="padding:10px 14px;border-radius:14px;background:${o === r.outcome ? (o === 'valid_icsr' ? 'var(--ok-soft)' : o === 'potential_icsr' ? 'var(--warn-soft)' : 'var(--card-2)') : 'transparent'};border:1.5px solid ${o === r.outcome ? 'var(--blue)' : 'var(--line)'}"><span style="flex:1;font-size:13px">${c}</span><b style="font-size:12.5px">${res}</b>${o === r.outcome ? '<span class="badge b-info">proposed</span>' : ''}</div>`).join('')}</div>
      <div style="margin-top:14px;font-size:13.5px">${esc(t.explanation)}</div>
      <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600;font-size:13px">Input provenance (why each criterion was believed)</summary><table style="margin-top:8px;font-size:12.5px"><tbody>${E.CRITERIA.map(k => `<tr><td style="width:36%"><b>${CRIT_LABEL[k]}</b></td><td>${esc(t.input_provenance[k])}</td></tr>`).join('')}<tr><td><b>Fired rule</b></td><td><code>${esc(t.fired_rules[0])}</code></td></tr></tbody></table></details>
      <div class="row mt"><button class="btn ghost sm" id="replay">${A.ico('check')} Replay this decision</button><span style="font-size:12px;color:var(--mut)">Re-runs the rule from stored inputs</span></div><div id="rpres" style="margin-top:10px"></div>
      ${decisionBlock}
      <div class="callout info mt" style="font-size:12.5px"><b>Reading note.</b> This record was read live by the real Claude API, right now, not a cached or offline result. It only reported facts with verbatim quotes — code then re-checked each quote actually exists in the text before it counted. Either way <b>the rule proposes, a person decides</b>: ${t.rule_id} is only a recommendation until confirmed above.</div></div>`;
  }

  /* ======================= WORKBENCH ======================= */
  A.wb = A.wb || { selId: null, sel: null, accepted: A.LS.get('wbacc', {}) };
  // Migrate the old boolean "accepted" flag (before Reject existed) to the string form.
  Object.keys(A.wb.accepted).forEach(k => { if (A.wb.accepted[k] && A.wb.accepted[k] !== 'accepted' && A.wb.accepted[k] !== 'rejected') A.wb.accepted[k] = 'accepted'; });
  const LBL = p => p.replace(/\[(\d+)\]/g, (m, i) => ' ' + (+i + 1)).replace(/\./g, ' › ').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  const CASE_FIELD_ORDER = ['patient_demographics', 'product_and_dose', 'onset', 'dechallenge', 'rechallenge', 'seriousness', 'concomitant_medications', 'outcome'];
  const CASE_FIELD_LABEL = { patient_demographics: 'Patient demographics', product_and_dose: 'Product and dose', onset: 'Time to onset', dechallenge: 'Dechallenge', rechallenge: 'Rechallenge', seriousness: 'Seriousness', concomitant_medications: 'Concomitant medications', outcome: 'Outcome' };
  const caseLabel = r => { const p = r.elements.suspect_product; return (p && p.present ? p.quote.slice(0, 22) : A.chanLabel(r.channel)) + ' · ' + r.id.slice(4, 10); };
  A.views.workbench = function () {
    const cases = A.inbox.filter(r => r.confirmed && r.finalOutcome === 'valid_icsr');
    const W = A.wb;
    if (!cases.length) {
      return A.shell('Case workbench', 'Only cases confirmed as Valid ICSR in the triage inbox show up here for detailed review.', `<div class="card"><div class="empty"><b>No valid ICSR cases yet</b>Open the <a href="#/inbox">triage inbox</a>, click Enable AI on a record, and confirm it as a Valid ICSR — it will appear here for detailed, field-by-field review.</div></div>`);
    }
    if (!W.selId || !cases.find(c => c.id === W.selId)) W.selId = cases[0].id;
    const c = cases.find(x => x.id === W.selId);
    const picker = `<div class="row" style="margin-bottom:18px;flex-wrap:wrap">${cases.map(x => `<button class="chip ${x.id === W.selId ? 'on' : ''}" data-c="${x.id}">${esc(caseLabel(x))}</button>`).join('')}</div>`;

    if (!c.caseAI) {
      const body = `${picker}<div class="card"><div class="row"><h3>${esc(caseLabel(c))}</h3><span class="sp"></span><span class="badge b-ok">Valid ICSR · confirmed</span></div>
        <div class="row mt" style="align-items:center;gap:12px;margin:14px 0"><button class="btn" id="enableCaseAi" type="button">${A.ico('bot')} Enable AI</button><span style="font-size:12.5px;color:var(--mut)">Sends this case to the real Claude API for a detailed, field-by-field review</span></div>
        <div id="caseAiErr"></div>
        <h4 style="margin:14px 0 8px">What triage already confirmed</h4><div class="grid g2" style="gap:10px">${E.CRITERIA.map(k => { const e = c.elements[k]; return `<div class="crit y"><div class="ic">✓</div><div><b>${CRIT_LABEL[k]}</b><div class="q">“${esc((e.quote || '').slice(0, 90))}”</div></div></div>`; }).join('')}</div>
        <h4 style="margin:18px 0 8px">Source text</h4><div class="src">${esc(c.text)}</div>
        <div class="callout info mt" style="font-size:12.5px">No field-level detail yet — patient demographics, dose, onset, dechallenge, rechallenge, seriousness, concomitant medications and outcome are not broken out until you click <b>Enable AI</b>.</div></div>`;
      A.after = () => {
        document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { W.selId = b.dataset.c; W.sel = null; A.rerender(); });
        const b = document.getElementById('enableCaseAi');
        if (b) b.onclick = async () => {
          b.disabled = true; b.innerHTML = '<span class="spin"></span> Analyzing with Claude…';
          const errBox = document.getElementById('caseAiErr'); if (errBox) errBox.innerHTML = '';
          const out = await A.callClaudeCase(c.text);
          if (!out || !out.ok) {
            if (errBox) errBox.innerHTML = `<div class="callout bad mt" style="font-size:12.5px"><b>Could not analyze this case.</b> ${esc((out && out.error) || 'Unknown error.')}</div>`;
            b.disabled = false; b.innerHTML = `${A.ico('bot')} Enable AI`;
            return;
          }
          const fields = {};
          CASE_FIELD_ORDER.forEach(k => {
            const f = (out.fields && out.fields[k]) || { value: 'unknown', quote: null };
            let span = null;
            if (f.quote) { const sp = E.locateQuote(f.quote, c.text); if (sp) span = { s: sp[0], e: sp[1] }; }
            fields[k] = { value: f.value || 'unknown', quote: span ? f.quote : null, span };
          });
          c.caseFields = fields; c.caseModel = out.model || 'claude'; c.caseAI = true;
          A.auditAdd('ai_extraction', 'system', { source_record_id: c.id, model_id: c.caseModel, prompt_version: 'claude_case_detail_v1 (live)', scope: 'case_fields', live: true }, false);
          A.persistAudit(); A.persistInbox();
          A.toast('Case detail read live by Claude');
          A.rerender();
        };
      };
      return A.shell('Case workbench', 'Only cases confirmed as Valid ICSR in the triage inbox show up here for detailed review.', body);
    }

    const fieldKeys = CASE_FIELD_ORDER;
    const decision = k => A.wb.accepted[c.id + k]; // undefined | 'accepted' | 'rejected'
    const grp = k => { const d = decision(k); if (d === 'accepted') return 'ok'; if (d === 'rejected') return 'bad'; const v = (c.caseFields[k].value || '').toLowerCase(); if (v.includes('unknown') || v.includes('not done')) return 'unk'; return 'rev'; };
    const G = { ok: [], rev: [], unk: [], bad: [] }; fieldKeys.forEach(k => G[grp(k)].push(k));
    const selKey = fieldKeys.includes(W.sel) ? W.sel : fieldKeys[0];
    const sel = c.caseFields[selKey], selDecision = decision(selKey);
    const gtitle = { ok: ['Accepted', 'ok'], rev: ['Needs review', 'warn'], unk: ['Unknown', 'mut'], bad: ['Rejected', 'bad'] };
    const total = fieldKeys.length, accepted = G.ok.length, decided = G.ok.length + G.bad.length, allDecided = decided === total;
    const spans = selKey && sel.span ? [{ s: sel.span.s, e: sel.span.e, cls: 'h-med', id: selKey, tip: CASE_FIELD_LABEL[selKey] }] : [];
    const selBadge = selDecision === 'accepted' ? '<span class="badge b-ok">Accepted</span>' : selDecision === 'rejected' ? '<span class="badge b-bad">Rejected</span>' : grp(selKey) === 'unk' ? '<span class="badge b-mut">Unknown</span>' : '<span class="badge b-warn">Needs review</span>';
    const body = `${picker}
    <div class="grid g-5-7" style="align-items:start"><div class="card"><div class="row" style="margin-bottom:16px;gap:18px">${C.ring(accepted / total, { size: 96, color: 'var(--blue)', label: 'accepted' })}<div><b>Case review</b><div style="font-size:12.5px;color:var(--mut)">${accepted}/${total} fields accepted · ${decided}/${total} decided</div><div style="margin-top:6px"><span class="badge b-vio">Read live by Claude</span></div></div></div>
      ${['rev', 'unk', 'ok', 'bad'].map(g => G[g].length ? `<div style="margin-top:14px"><div class="row" style="margin-bottom:8px"><span class="badge b-${gtitle[g][1]}">${gtitle[g][0]}</span><span style="color:var(--mut);font-size:12.5px">${G[g].length}</span></div><div class="list" style="gap:6px">${G[g].map(k => `<div class="item ${k === selKey ? 'sel' : ''}" data-p="${k}" tabindex="0" role="button" style="padding:10px 14px"><div class="row"><span style="font-size:12px;color:var(--mut)">${esc(CASE_FIELD_LABEL[k])}</span><span class="sp"></span><span class="badge b-vio">AI</span></div><div style="font-weight:600;margin-top:2px">${esc(c.caseFields[k].value)}</div></div>`).join('')}</div></div>` : '').join('')}
      <div class="card mt" style="background:var(--card-2)">${c.caseReviewed
        ? `<div class="row"><h4 style="margin:0">Case review confirmed</h4><span class="sp"></span><span class="badge b-ok">Confirmed</span></div><div style="font-size:12.5px;color:var(--mut);margin-top:8px">Reviewer <b>${esc(c.caseReviewedBy)}</b> confirmed this case's review on ${A.fmtDate(c.caseReviewedAt)}.</div>
          ${c.caseExasolWrite === undefined ? `<div class="callout info mt" style="font-size:12.5px">Writing to Exasol…</div>` : c.caseExasolWrite && c.caseExasolWrite.ok ? `<div class="callout ok mt" style="font-size:12.5px"><b>Stored in Exasol:</b> this review is now a row in <code>ATHERIA_PV.CASE_REVIEWS</code> (${c.caseExasolWrite.total_in_exasol} total now) — readable live through this project's Exasol MCP server.</div>` : c.caseExasolWrite ? `<div class="callout bad mt" style="font-size:12.5px"><b>Exasol write failed:</b> ${esc(c.caseExasolWrite.error)}</div>` : ''}
          <div class="row mt"><button class="btn ghost sm" id="reopenCase">Reopen review</button></div>`
        : `<h4 style="margin:0 0 6px">Final sign-off</h4><div class="sub" style="margin-bottom:12px">${allDecided ? 'Every field has been accepted or rejected. You can confirm this case’s review.' : `${decided}/${total} fields decided — accept or reject every field above before confirming.`}</div><div class="row"><button class="btn" id="confirmCase" ${allDecided ? '' : 'disabled'}>${A.ico('check')} Confirm case review</button><span style="font-size:12px;color:var(--mut)">Recorded in the audit trail</span></div>`}</div></div>
      <div class="sticky-r"><div class="card fade">${selKey ? `<div class="hd"><div><h3>${esc(CASE_FIELD_LABEL[selKey])}</h3><div class="sub">Provenance for this field</div></div>${selBadge}</div>
        <div class="fact"><div class="k">Value</div><div class="val">${esc(sel.value)}</div></div>
        <div class="grid g2 mt" style="gap:10px"><div class="fact"><div class="k">Produced by</div><b>AI model</b><div style="font-size:12px;color:var(--mut)" class="mono">${esc(c.caseModel)}</div></div><div class="fact"><div class="k">Prompt</div><div style="font-size:12px;color:var(--mut)" class="mono">claude_case_detail_v1 (live)</div></div></div>
        <h4 style="margin:18px 0 8px">Source evidence</h4>${sel.quote ? `<div class="fact"><div style="font-size:15px">“${esc(sel.quote)}”</div></div>` : '<div class="callout info" style="font-size:13px">No verbatim quote — the model reported this as unknown, or its quote could not be re-verified in the source text, so it is not counted as evidence.</div>'}
        <div class="row mt" style="gap:10px"><button class="btn sm" id="acc" ${selDecision === 'accepted' ? 'disabled' : ''}>${A.ico('check')} Accept field</button><button class="btn ghost sm" id="rej" ${selDecision === 'rejected' ? 'disabled' : ''}>${A.ico('alert')} Reject field</button></div><div style="font-size:12px;color:var(--mut);margin-top:6px">Recorded in the audit trail</div>
        <h4 style="margin:18px 0 8px">Source text</h4><div class="src" id="srcbox">${A.highlight(c.text, spans)}</div>` : ''}</div></div></div>`;
    A.after = () => {
      document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { W.selId = b.dataset.c; W.sel = null; A.rerender(); });
      document.querySelectorAll('[data-p]').forEach(el => { const go = () => { W.sel = el.dataset.p; A.rerender(); }; el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter') go(); }; });
      A.bindMarks(document.getElementById('srcbox'));
      const a = document.getElementById('acc'); if (a) a.onclick = () => { A.wb.accepted[c.id + selKey] = 'accepted'; A.LS.set('wbacc', A.wb.accepted); A.auditAdd('human_field_accept', A.user.name, { case_id: c.id, field: selKey, value: sel.value }); A.toast('Field accepted and logged'); A.rerender(); };
      const rj = document.getElementById('rej'); if (rj) rj.onclick = () => { A.wb.accepted[c.id + selKey] = 'rejected'; A.LS.set('wbacc', A.wb.accepted); A.auditAdd('human_field_reject', A.user.name, { case_id: c.id, field: selKey, value: sel.value }); A.toast('Field rejected and logged'); A.rerender(); };
      const cf = document.getElementById('confirmCase'); if (cf) cf.onclick = async () => {
        cf.disabled = true; cf.innerHTML = '<span class="spin"></span> Confirming…';
        c.caseReviewed = true; c.caseReviewedBy = A.user.name; c.caseReviewedAt = new Date().toISOString();
        A.auditAdd('human_signoff', A.user.name, { case_id: c.id, scope: 'case_review', accepted, rejected: G.bad.length, total });
        A.persistAudit(); A.persistInbox(); A.toast('Case review confirmed'); A.rerender();
        const w = await A.callExasolCaseReview({ record_id: c.id, channel: c.channel, final_outcome: c.finalOutcome, model: c.caseModel, reviewed_by: A.user.name, reviewed_at: c.caseReviewedAt, accepted, rejected: G.bad.length, total, fields: c.caseFields });
        c.caseExasolWrite = w; A.persistInbox(); A.rerender();
      };
      const rp = document.getElementById('reopenCase'); if (rp) rp.onclick = () => { c.caseReviewed = false; A.persistInbox(); A.rerender(); };
    };
    return A.shell('Case workbench', 'Only cases confirmed as Valid ICSR in the triage inbox show up here for detailed review.', body);
  };
})();
