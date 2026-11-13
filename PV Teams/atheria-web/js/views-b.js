/* Views B — signals, investigation (overview / case / review / chat), audit, trust */
(function () {
  'use strict';
  const { E, C, esc } = A;
  const CATS = E.CATEGORIES;
  const catColor = c => C.CAT[c];
  const fx = (v, d = 2) => Number(v).toFixed(d);

  /* ======================= SIGNALS ======================= */
  A.sigUI = A.sigUI || { drug: '', all: false };
  A.views.signals = function () {
    const U = A.sigUI, list = (U.all ? A.pairs : A.flagged).filter(p => !U.drug || p.drug === U.drug);
    const inv = Object.keys(A.invState).length;
    const body = `<div class="grid g4">
      <div class="card kpi"><div class="lb">Drug–event pairs</div><div class="v">${A.pairs.length}</div><div class="ft">across ${A.reports.length.toLocaleString()} reports</div></div>
      <div class="card kpi"><div class="lb">Flagged by Evans</div><div class="v" style="color:var(--blue)">${A.flagged.length}</div><div class="ft">PRR ≥ 2 · χ² ≥ 4 · cases ≥ 3</div></div>
      <div class="card kpi"><div class="lb">Investigated</div><div class="v">${inv}</div><div class="ft">AI-read, rule-assessed</div></div>
      <div class="card kpi"><div class="lb">Awaiting sign-off</div><div class="v" style="color:var(--warn)">${Object.values(A.invState).filter(s => s.status === 'in_review').length}</div><div class="ft">human approval needed</div></div></div>
    <div class="grid g-7-5 mt" style="align-items:start"><div class="card"><div class="hd"><div><h3>Signal map</h3><div class="sub">Pairs in the blue zone meet all three Evans criteria. Bubble size shows χ².</div></div></div>${C.bubble(A.pairs.filter(p => !U.drug || p.drug === U.drug), { href: s => A.sigUrl(s.signal_id) })}</div>
      <div class="card"><div class="hd"><div><h3>Drug × event heat map</h3><div class="sub">Numbers are case counts. Blue outlined cells are flagged signals; darker means higher PRR.</div></div></div>${C.heat(A.drugs, A.events, (d, e) => A.pairMap.get(d + '__' + e), { href: c => A.sigUrl(c.signal_id) })}</div></div>
    <div class="card mt"><div class="row" style="margin-bottom:16px"><button class="chip ${!U.drug ? 'on' : ''}" data-d="">All drugs</button>${A.drugs.map(d => `<button class="chip ${U.drug === d ? 'on' : ''}" data-d="${d}">${d}</button>`).join('')}<span class="sp"></span><div class="seg"><button data-all="0" class="${!U.all ? 'on' : ''}">Flagged only</button><button data-all="1" class="${U.all ? 'on' : ''}">All pairs</button></div></div>
      <div class="scroll"><table><thead><tr><th>Signal</th><th class="num">Cases</th><th class="num">PRR</th><th>ROR 95% CI</th><th class="num">χ²</th><th>Evans</th><th>Status</th><th></th></tr></thead><tbody>${list.map(p => {
        const st = A.invState[p.signal_id], b = st ? A.build(p.signal_id) : null, ok = A.canInvestigate(p);
        return `<tr class="click" data-s="${esc(p.signal_id)}"><td><b>${esc(p.drug)}</b> + ${esc(p.event)}</td><td class="num mono">${p.a}</td><td class="num mono">${p.prr}</td><td class="mono" style="font-size:12.5px">${fx(p.ror, 1)} <span style="color:var(--mut)">(${fx(p.ror_lo, 1)}–${fx(p.ror_hi, 1)})</span></td><td class="num mono">${fx(p.chi2, 1)}</td><td>${p.is_signal ? '<span class="badge b-info">Signal</span>' : '<span class="badge b-mut">Below threshold</span>'}</td><td>${b ? (st.status === 'completed' ? '<span class="badge b-ok">Signed off</span> ' : '<span class="badge b-warn">In review</span> ') + A.recBadge(b.rec.rule_id) : ok ? '<span class="badge b-mut">Not started</span>' : '<span class="badge b-mut" data-tip="Needs live model extraction">Stats only</span>'}</td><td style="text-align:right">${ok ? `<button class="btn sm ${b ? 'ghost' : ''}" data-i="${esc(p.signal_id)}">${b ? 'Open' : 'Investigate'}</button>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="8"><div class="empty">No pairs.</div></td></tr>'}</tbody></table></div>
      <div class="callout info mt" style="font-size:12.5px"><b>Why some pairs say “Stats only”.</b> Investigating a signal needs an AI to read every case narrative. This build ships the original project’s cached, schema-validated extractions for the ${A.pairs.filter(A.canInvestigate).length} pairs it investigated. The statistics are computed live for all ${A.pairs.length}.</div></div>`;
    A.after = () => {
      document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { A.sigUI.drug = b.dataset.d; A.rerender(); });
      document.querySelectorAll('[data-all]').forEach(b => b.onclick = () => { A.sigUI.all = b.dataset.all === '1'; A.rerender(); });
      document.querySelectorAll('tr[data-s]').forEach(r => r.onclick = e => { if (e.target.closest('button')) return; location.hash = A.sigUrl(r.dataset.s); });
      document.querySelectorAll('[data-i]').forEach(b => b.onclick = () => A.runInvestigate(b.dataset.i));
    };
    return A.shell('Signal detection', 'Statistics detect candidate signals across every drug–event pair. Pick one to investigate.', body);
  };
  const STEPS = ['Statistics', 'AI extraction', 'Guardrails verify quotes', 'Rules decide', 'Ready for review'];
  A.runInvestigate = async function (sid) {
    if (A.invState[sid]) { location.hash = A.sigUrl(sid); return; }
    const p = A.pairMap.get(sid), ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,16,30,.5);z-index:90;display:grid;place-items:center;padding:20px;backdrop-filter:blur(4px)';
    ov.innerHTML = `<div class="card" style="width:min(640px,100%)"><h3>Investigating ${esc(A.sigLabel(p))}</h3><div class="sub" style="margin-bottom:16px">${A.casesOf(p).length} case narratives</div><div class="steps" id="stp">${STEPS.map(s => `<div class="s">${s}</div>`).join('')}</div><p class="sub mt" id="stx">Starting…</p></div>`;
    document.body.appendChild(ov);
    const txt = ['Computing PRR, ROR confidence interval and χ² from the contingency table…', 'Replaying schema-validated model extractions for each case (zero model calls)…', 'Locating every quote in its source text at exact character offsets…', 'Applying cau_001 per case, then rec_001 to the signal…', 'Done. Opening the investigation.'];
    await A.investigate(sid, i => { document.querySelectorAll('#stp .s').forEach((s, j) => s.className = 's ' + (j < i ? 'done' : j === i ? 'on' : '')); document.getElementById('stx').textContent = txt[i]; });
    ov.remove(); location.hash = A.sigUrl(sid);
  };

  /* ======================= SIGNAL (dispatcher) ======================= */
  A.views.signal = function ({ parts, q }) {
    const sid = parts[1], p = A.pairMap.get(sid); if (!p) return A.shell('Unknown signal', '', '<div class="card"><div class="empty"><b>Not found</b><a href="#/signals">Back to signals</a></div></div>');
    const b = A.build(sid), sub = parts[2];
    if (!b) return notStarted(p);
    if (sub === 'case') return caseView(b, parts[3], q);
    if (sub === 'review') return reviewView(b);
    if (sub === 'chat') return chatView(b);
    return overview(b);
  };
  const crumb = (p, extra) => `<a href="#/signals">Signals</a> / <a href="${A.sigUrl(p.signal_id)}">${esc(A.sigLabel(p))}</a>${extra ? ' / ' + extra : ''}`;
  function tabs(b, on) { const u = A.sigUrl(b.sid); return `<div class="seg" style="margin-bottom:18px">${[['', 'Overview'], ['/review', 'Review & sign-off'], ['/chat', 'Ask the evidence'], ['/trust', 'Trust lab']].map(([s, l]) => `<button onclick="location.hash='${u}${s}'" class="${on === s ? 'on' : ''}">${l}</button>`).join('')}</div>`; }
  function notStarted(p) {
    const ok = A.canInvestigate(p);
    const body = `<div class="grid g-7-5"><div class="card"><h3>Disproportionality statistics</h3><div class="sub" style="margin-bottom:16px">Computed live from the report counts</div><div class="grid g2">${statCards(p)}</div></div><div class="card"><h3>Contingency table</h3><div class="sub" style="margin-bottom:14px">Circle area is proportional to the count</div>${C.table2x2(p)}</div></div>
      <div class="card mt">${ok ? `<div class="row"><div><h3>Ready to investigate</h3><div class="sub">${A.casesOf(p).length} case narratives will be read, every quote verified, and the rules applied.</div></div><span class="sp"></span><button class="btn" id="go">Start investigation ${A.ico('arrow')}</button></div>` : '<div class="callout warn"><b>Statistics only.</b> This pair has no cached AI extractions in the bundled data, so it cannot be investigated offline. With a live model connected, the same pipeline would run on its narratives.</div>'}</div>`;
    A.after = () => { const g = document.getElementById('go'); if (g) g.onclick = () => A.runInvestigate(p.signal_id); };
    return A.shell(esc(A.sigLabel(p)), p.is_signal ? 'Flagged by the Evans criteria.' : 'Below the Evans thresholds.', body, '', crumb(p));
  }
  function statCards(p) {
    const t = (l, v, ok, hint) => `<div class="fact"><div class="k">${l}</div><div class="val">${v}</div><div style="font-size:12px;color:var(--mut)">${hint}</div></div>`;
    return t('PRR', p.prr, 0, 'Proportional reporting ratio') + t('ROR', fx(p.ror, 1), 0, `95% CI ${fx(p.ror_lo, 1)} – ${fx(p.ror_hi, 1)}`) + t('χ² (Yates)', fx(p.chi2, 1), 0, 'Continuity-corrected') + t('Cases', p.a, 0, 'Drug and event together');
  }

  /* ======================= OVERVIEW ======================= */
  A.catFilter = A.catFilter || '';
  function overview(b) {
    const { p, cases, rec, st, metrics: M } = b, dist = rec.inputs.distribution, F = A.catFilter;
    const done = st.status === 'completed';
    const onset = cases.map(c => c.facts.time_to_onset).filter(o => o.status === 'verified').map(o => o.value);
    const cnt = (k) => { const o = { positive: 0, negative: 0, not_done: 0, unknown: 0 }; cases.forEach(c => o[c.facts[k].value] = (o[c.facts[k].value] || 0) + 1); return o; };
    const dc = cnt('dechallenge'), rc = cnt('rechallenge'), chCol = { positive: 'var(--c-cert)', negative: 'var(--c-unl)', not_done: 'var(--c-poss)', unknown: 'var(--c-una)' };
    const altCount = {}; cases.forEach(c => c.facts.alternative_causes.forEach(a => { const k = a.cause.toLowerCase().trim(); altCount[k] = (altCount[k] || 0) + 1; }));
    const alts = Object.entries(altCount).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const vis = cases.filter(c => !F || c.cat === F);
    const donutD = CATS.map(c => ({ label: c, value: dist[c], color: catColor(c) }));
    const overrides = cases.filter(c => c.override).length;
    const recPath = recSteps(rec);
    const body = `${tabs(b, '')}
    <div class="grid g-8-4"><div class="grid g2" style="align-content:start">
      <div class="card"><h3>Evans criteria</h3><div class="sub" style="margin-bottom:14px">Deterministic statistics. No AI involved.</div>${C.meter(Math.min(1, p.prr / 4), { label: 'PRR', right: p.prr, note: '/ needs ≥ 2', mark: .5, color: p.prr >= 2 ? 'var(--ok)' : 'var(--bad)' })}${C.meter(Math.min(1, p.chi2 / 8), { label: 'χ²', right: fx(p.chi2, 1), note: '/ needs ≥ 4', mark: .5, color: p.chi2 >= 4 ? 'var(--ok)' : 'var(--bad)' })}${C.meter(Math.min(1, p.a / 6), { label: 'Cases', right: p.a, note: '/ needs ≥ 3', mark: .5, color: p.a >= 3 ? 'var(--ok)' : 'var(--bad)' })}<div style="margin-top:6px">${p.is_signal ? '<span class="badge b-ok">All three met · statistical signal</span>' : '<span class="badge b-bad">Not a signal</span>'}</div></div>
      <div class="card"><h3>Contingency table</h3><div class="sub" style="margin-bottom:12px">Reports counted by drug and event</div>${C.table2x2(p)}</div>
      <div class="card" style="grid-column:1/-1"><h3>Reporting odds ratio</h3><div class="sub" style="margin-bottom:8px">95% confidence interval. A line fully right of 1 means the drug is reported with this event more often than expected.</div>${C.forest([{ label: A.sigLabel(p), est: p.ror, lo: p.ror_lo, hi: p.ror_hi, color: 'var(--blue)' }, { label: 'PRR (point estimate)', est: p.prr, lo: p.prr, hi: p.prr, color: 'var(--violet)' }], { label: 'ROR with 95% CI' })}</div></div>
      <div class="card"><div class="row" style="margin-bottom:14px"><h3>Recommendation</h3><span class="sp"></span><span class="badge ${done ? 'b-ok' : 'b-warn'}">${done ? 'Signed off' : 'Awaiting human sign-off'}</span></div>
        <div style="font-size:21px;font-weight:700;letter-spacing:-.02em;line-height:1.25">${esc(rec.recommendation)}</div><div style="margin:10px 0 16px" class="row">${A.recBadge(rec.rule_id)}<code>${rec.rule_id} v${rec.version}</code></div>
        <div class="list" style="gap:8px">${recPath}</div>
        <div class="row mt"><a class="btn" href="${A.sigUrl(b.sid)}/review">${done ? 'View sign-off' : 'Review & sign off'} ${A.ico('arrow')}</a></div></div></div>
    <div class="grid g3 mt">
      <div class="card"><div class="hd"><div><h3>Causality of ${cases.length} cases</h3><div class="sub">Per-case category from cau_001 ${E.CAUSALITY.version}${overrides ? ` · ${overrides} human override(s) included` : ''}</div></div></div><div class="row" style="justify-content:center;gap:18px">${C.donut(donutD, { size: 160, center: cases.length, sub: 'cases' })}<div style="min-width:120px">${C.legend(donutD).replace('class="legend"', 'class="legend" style="flex-direction:column;gap:7px"')}</div></div></div>
      <div class="card"><div class="hd"><div><h3>How the rule reads this mix</h3><div class="sub">Bars against rec_001 thresholds (black marker)</div></div></div>${C.meter(rec.inputs.unassessable_share, { label: 'Unassessable share', mark: .5, dir: '>', color: 'var(--c-una)', tip: 'Above 50% → insufficient information' })}${C.meter(rec.inputs.supportive_share, { label: 'Supportive (Certain + Probable)', mark: .5, color: 'var(--c-cert)' })}${C.meter(rec.inputs.unlikely_share, { label: 'Unlikely share', mark: .5, color: 'var(--c-unl)' })}</div>
      <div class="card"><div class="hd"><div><h3>Trust receipts</h3><div class="sub">What the guardrails did to the AI output</div></div></div><div class="row" style="gap:18px">${C.ring(M.verified / Math.max(1, M.verified + M.rejected), { size: 104, color: 'var(--ok)', label: 'quotes verified' })}<div style="font-size:13.5px"><b>${M.verified}</b> quotes verified in source<br><b>${M.rejected}</b> rejected as unbacked<br><b>${M.reclassified}</b> ruled-out causes reclassified<br><span style="color:var(--mut)">≈ ${(M.minutes / 60).toFixed(1)} h of reading saved</span></div></div></div></div>
    <div class="grid g3 mt">
      <div class="card"><h3>Time from drug start to onset</h3><div class="sub" style="margin-bottom:8px">Days, only where a verified quote states it (${onset.length}/${cases.length} cases)</div>${C.hist(onset, { bins: 6 })}</div>
      <div class="card"><h3>Dechallenge and rechallenge</h3><div class="sub" style="margin-bottom:14px">What happened when the drug was stopped or restarted</div><div style="font-size:13px;font-weight:600;margin-bottom:6px">Dechallenge</div>${C.stack(Object.entries(dc).map(([k, v]) => ({ label: A.human(k), value: v, color: chCol[k] })), { h: 18 })}<div style="font-size:13px;font-weight:600;margin:16px 0 6px">Rechallenge</div>${C.stack(Object.entries(rc).map(([k, v]) => ({ label: A.human(k), value: v, color: chCol[k] })), { h: 18 })}<div class="legend mt">${Object.keys(chCol).map(k => `<span><i style="background:${chCol[k]}"></i>${A.human(k)}</span>`).join('')}</div></div>
      <div class="card"><h3>Confounders found</h3><div class="sub" style="margin-bottom:14px">Other explanations verified in the narratives</div>${alts.length ? C.hbars(alts.map(([k, v]) => ({ label: A.human(k), value: v, text: v + ' cases', color: 'var(--c-poss)' })), { max: cases.length }) : '<div class="empty"><b>None verified</b>No alternative causes appear in these cases.</div>'}</div></div>
    <div class="card mt"><div class="hd"><div><h3>Every case at a glance</h3><div class="sub">One tile per case, coloured by effective causality. Click to open the evidence.</div></div></div><div class="row" style="gap:6px;margin-bottom:14px">${cases.map(c => `<a href="${A.sigUrl(b.sid)}/case/${c.id}" ${C.tip(c.id + ' · ' + c.cat + (c.override ? ' (human override)' : '') + '\n' + c.rule.rule_id)} style="width:26px;height:26px;border-radius:8px;background:${catColor(c.cat)};display:block;${c.override ? 'outline:3px solid var(--violet);outline-offset:1px' : ''};${F && c.cat !== F ? 'opacity:.18' : ''}" aria-label="${c.id} ${c.cat}"></a>`).join('')}</div>
      <div class="row" style="margin-bottom:14px"><button class="chip ${!F ? 'on' : ''}" data-f="">All ${cases.length}</button>${CATS.map(c => `<button class="chip ${F === c ? 'on' : ''}" data-f="${c}"><i class="dot" style="background:${catColor(c)}"></i>${c} ${dist[c]}</button>`).join('')}</div>
      <div class="scroll"><table><thead><tr><th>Case</th><th>Patient</th><th>Causality</th><th class="num">Onset (d)</th><th>Dechallenge</th><th>Confounders</th><th>Rule</th><th></th></tr></thead><tbody>${vis.map(c => `<tr class="click" data-c="${c.id}"><td><b class="mono">${c.id}</b>${c.serious ? ' <span class="badge b-bad">serious</span>' : ''}</td><td>${c.age}${c.sex} · ${c.country}</td><td>${A.catBadge(c.cat)}${c.override ? ' <span class="badge b-vio">override</span>' : ''}</td><td class="num mono">${c.facts.time_to_onset.status === 'verified' ? c.facts.time_to_onset.value : '—'}</td><td>${A.human(c.facts.dechallenge.value)}</td><td>${c.facts.alternative_causes.length || '—'}</td><td><code>${c.rule.rule_id}</code></td><td style="text-align:right"><span style="color:var(--blue)">Open →</span></td></tr>`).join('')}</tbody></table></div></div>`;
    A.after = () => {
      document.querySelectorAll('[data-f]').forEach(x => x.onclick = () => { A.catFilter = x.dataset.f; A.rerender(); });
      document.querySelectorAll('tr[data-c]').forEach(r => r.onclick = () => location.hash = A.sigUrl(b.sid) + '/case/' + r.dataset.c);
    };
    return A.shell(esc(p.drug) + ' <span style="color:var(--mut)">+</span> ' + esc(p.event), `${cases.length} cases · started ${A.fmtDate(st.startedAt)} · extraction prompt extract_v1.4.0`, body, `<a class="btn ghost" href="${A.sigUrl(b.sid)}/chat">${A.ico('chat')} Ask the evidence</a>`, crumb(p));
  }
  function recSteps(rec) {
    const I = rec.inputs, t = rec.thresholds, order = ['REC-01', 'REC-02', 'REC-03', 'REC-04'], fired = order.indexOf(rec.rule_id);
    const pct = x => Math.round(x * 100) + '%';
    const defs = [[`Unassessable share ${pct(I.unassessable_share)} is above ${pct(t.max_unassessable_share)}?`, 'Insufficient information'], [`Statistical signal AND supportive share ${pct(I.supportive_share)} ≥ ${pct(t.min_supportive_share)}?`, 'Validated'], [`Unlikely share ${pct(I.unlikely_share)} ≥ ${pct(t.min_unlikely_share)}?`, 'Not confirmed'], ['Otherwise', 'Inconclusive']];
    return defs.map((d, i) => { const state = i < fired ? 'no' : i === fired ? 'yes' : 'skip'; return `<div class="row" style="padding:9px 12px;border-radius:14px;gap:10px;background:${state === 'yes' ? 'var(--blue-soft)' : 'var(--card-2)'};${state === 'yes' ? 'border:1.5px solid var(--blue)' : ''};opacity:${state === 'skip' ? .5 : 1}"><span class="mono" style="font-weight:700;font-size:12px">${order[i]}</span><span style="flex:1;font-size:13px">${d[0]}</span><b style="font-size:12px;color:${state === 'yes' ? 'var(--blue)' : 'var(--mut)'}">${state === 'yes' ? '✓ ' + d[1] : state === 'no' ? 'No' : 'not reached'}</b></div>`; }).join('');
  }
  function cauSteps(rule) {
    const f = rule.facts_used, order = ['CAU-01', 'CAU-02', 'CAU-03', 'CAU-04', 'CAU-05', 'CAU-06', 'CAU-07'], fired = order.indexOf(rule.rule_id);
    const defs = [['Time relationship implausible', 'Unlikely'], ['Time relationship unknown (after trying to derive it from a verified onset)', 'Unassessable'], ['2 or more verified alternative causes and no positive dechallenge', 'Unlikely'], ['At least 1 verified alternative cause', 'Possible'], ['Positive dechallenge and positive rechallenge', 'Certain'], ['Positive dechallenge', 'Probable'], ['Otherwise', 'Possible']];
    return defs.map((d, i) => { const state = i < fired ? 'no' : i === fired ? 'yes' : 'skip'; return `<div class="row" style="padding:8px 12px;border-radius:12px;gap:10px;background:${state === 'yes' ? 'var(--blue-soft)' : 'var(--card-2)'};${state === 'yes' ? 'border:1.5px solid var(--blue)' : ''};opacity:${state === 'skip' ? .45 : 1}"><span class="mono" style="font-weight:700;font-size:11.5px">${order[i]}</span><span style="flex:1;font-size:12.5px">${d[0]}</span><b style="font-size:12px;color:${state === 'yes' ? 'var(--blue)' : 'var(--mut)'}">${state === 'yes' ? '✓ ' + d[1] : state === 'no' ? 'No' : '—'}</b></div>`; }).join('');
  }

  /* ======================= CASE ======================= */
  function caseView(b, rid, q) {
    const c = b.cases.find(x => x.id === rid); if (!c) return A.shell('Case not found', '', '<div class="card"><div class="empty"><b>Not in this signal</b></div></div>');
    const done = b.st.status === 'completed', i = b.cases.indexOf(c), prev = b.cases[i - 1], next = b.cases[i + 1], f = c.facts;
    const spans = []; const add = (o, cls, id, tp) => { if (o && o.span) spans.push({ s: o.span[0], e: o.span[1], cls, id, tip: tp }); };
    add(f.time_to_onset, 'h-onset', 'onset', 'Onset'); add(f.temporal_relationship, 'h-temporal', 'temporal', 'Time relationship'); add(f.dechallenge, 'h-dech', 'dech', 'Dechallenge'); add(f.rechallenge, 'h-rech', 'rech', 'Rechallenge');
    f.alternative_causes.forEach((a, k) => add(a, 'h-alt', 'alt' + k, 'Alternative cause: ' + a.cause)); f.excluded_causes.forEach((a, k) => add(a, 'h-exc', 'exc' + k, 'Ruled out: ' + a.cause));
    let cite = null; if (q.get('s')) { cite = { s: +q.get('s'), e: +q.get('e'), cls: 'h-alt', id: 'cite', tip: 'Cited passage' }; }
    const sp2 = cite ? [cite, ...spans.filter(x => x.e <= cite.s || x.s >= cite.e)] : spans;
    const Q = (o, id) => o && o.quote ? `<div class="q" data-goto="${id}">“${esc(o.quote)}”<div class="mono" style="font-size:11px;color:var(--mut)">chars ${o.span[0]}–${o.span[1]} · verified</div></div>` : '';
    const stBadge = o => o.status === 'verified' ? '<span class="badge b-ok">verified</span>' : o.status === 'unverified' ? '<span class="badge b-bad">rejected: quote not found</span>' : '<span class="badge b-mut">unknown · not stated</span>';
    const g = c.guardrail, recl = f.excluded_causes.filter(x => x.reclassified_by);
    const body = `<div class="row" style="margin-bottom:16px"><a class="btn ghost sm" href="${prev ? A.sigUrl(b.sid) + '/case/' + prev.id : '#'}" ${prev ? '' : 'style="opacity:.4;pointer-events:none"'}>← ${prev ? prev.id : ''}</a><span style="color:var(--mut);font-size:13px">Case ${i + 1} of ${b.cases.length}</span><a class="btn ghost sm" href="${next ? A.sigUrl(b.sid) + '/case/' + next.id : '#'}" ${next ? '' : 'style="opacity:.4;pointer-events:none"'}>${next ? next.id : ''} →</a></div>
    <div class="grid g-7-5" style="align-items:start"><div class="grid" style="gap:18px">
      <div class="card"><div class="hd"><div><h3>Source narrative</h3><div class="sub">${c.age}-year-old ${c.sex === 'F' ? 'woman' : 'man'} · ${c.country} · received ${c.date}${c.serious ? ' · flagged serious' : ''}</div></div></div>
        <div class="legend" style="margin-bottom:10px"><span><i style="background:#CFE3FF"></i>Onset / timing</span><span><i style="background:#C9F0DD"></i>Dechallenge</span><span><i style="background:#B8E8F0"></i>Rechallenge</span><span><i style="background:#FFD9A8"></i>Alternative cause</span><span><i style="background:#E3E7EF"></i>Ruled out</span></div>
        <div class="src" id="srcbox">${A.highlight(c.narrative, sp2)}</div></div>
      <div class="card"><div class="hd"><div><h3>Timeline from verified facts</h3><div class="sub">Built only from quotes the guardrails confirmed</div></div></div>${C.patientTimeline(f)}</div>
      <div class="card"><div class="hd"><div><h3>Extracted facts</h3><div class="sub">Click a quote to jump to it in the narrative</div></div></div><div class="grid g2" style="gap:12px">
        <div class="fact"><div class="k">Time to onset</div><div class="val">${f.time_to_onset.status === 'verified' ? f.time_to_onset.value + ' days' : 'Not stated'}</div>${stBadge(f.time_to_onset)}${Q(f.time_to_onset, 'onset')}</div>
        <div class="fact"><div class="k">Time relationship</div><div class="val">${A.human(f.temporal_relationship.value)}</div>${stBadge(f.temporal_relationship)}${Q(f.temporal_relationship, 'temporal')}</div>
        <div class="fact"><div class="k">Dechallenge</div><div class="val">${A.human(f.dechallenge.value)}</div>${stBadge(f.dechallenge)}${Q(f.dechallenge, 'dech')}</div>
        <div class="fact"><div class="k">Rechallenge</div><div class="val">${A.human(f.rechallenge.value)}</div>${stBadge(f.rechallenge)}${Q(f.rechallenge, 'rech')}</div>
        <div class="fact" style="grid-column:1/-1"><div class="k">Alternative causes present (${f.alternative_causes.length})</div>${f.alternative_causes.map((a, k) => `<div style="margin-top:8px"><b>${esc(a.cause)}</b> <span class="badge b-ok">verified</span>${Q(a, 'alt' + k)}</div>`).join('') || '<div style="color:var(--mut);margin-top:6px">None reported</div>'}</div>
        <div class="fact" style="grid-column:1/-1"><div class="k">Explicitly ruled out (${f.excluded_causes.length})</div>${f.excluded_causes.map((a, k) => `<div style="margin-top:8px"><b>${esc(a.cause)}</b> ${a.reclassified_by ? '<span class="badge b-vio" data-tip="The model listed this as a cause, but the quote contains negation, so a guardrail moved it to ruled-out">reclassified by negation guardrail</span>' : '<span class="badge b-ok">verified</span>'}${Q(a, 'exc' + k)}</div>`).join('') || '<div style="color:var(--mut);margin-top:6px">None</div>'}</div>
        <div class="fact" style="grid-column:1/-1"><div class="k">Data gaps the AI noted</div><div class="row" style="margin-top:6px;gap:6px">${f.data_gaps.map(x => `<span class="badge b-mut">${esc(x)}</span>`).join('') || '<span style="color:var(--mut)">None noted</span>'}</div></div></div></div></div>
    <div class="grid sticky-r" style="gap:18px">
      <div class="card"><div class="row"><h3>Causality</h3><span class="sp"></span>${A.catBadge(c.cat)}${c.override ? '<span class="badge b-vio">human override</span>' : ''}</div>
        <p style="margin:12px 0;font-size:13.5px">${esc(c.rule.explanation)}</p><div class="row" style="margin-bottom:12px"><code>${c.rule.rule_id}</code><code>${c.rule.ruleset} v${c.rule.version}</code></div>${c.override ? `<div class="callout" style="background:var(--violet-soft);color:var(--violet);margin-bottom:12px;font-size:13px">Rule said <b>${c.rule.category}</b>. ${esc(c.override.actor)} set <b>${c.override.category}</b>: “${esc(c.override.reason)}”</div>` : ''}
        <div class="list" style="gap:6px">${cauSteps(c.rule)}</div></div>
      <div class="card"><h3>Guardrail receipt</h3><div class="sub" style="margin-bottom:12px">Level 2 checks, plain code. The model can’t argue past them.</div>
        <div class="grid g3" style="gap:8px">${[['Schema valid', g.schema_valid ? 'Yes' : 'No', g.schema_valid ? 'ok' : 'bad'], ['Quotes verified', g.quotes_verified, 'ok'], ['Quotes rejected', g.quotes_rejected, g.quotes_rejected ? 'bad' : 'mut']].map(x => `<div class="fact" style="padding:10px"><div class="k" style="font-size:10.5px">${x[0]}</div><div class="val" style="font-size:20px;color:var(--${x[2]})">${x[1]}</div></div>`).join('')}</div>
        ${recl.length ? `<div class="callout warn mt" style="font-size:12.5px"><b>${recl.length} reclassification:</b> “${esc(recl[0].cause)}” was filed as a cause but its quote says it was ruled out.</div>` : ''}
        ${f.rejected_alternative_causes.length ? `<div class="callout bad mt" style="font-size:12.5px">${f.rejected_alternative_causes.length} claim(s) discarded: quote not found in the narrative.</div>` : ''}</div>
      <div class="card"><h3>Human override</h3><div class="sub" style="margin-bottom:12px">${done ? 'This investigation is signed off. No further changes.' : 'Disagree with the rule? Override with a reason. It is audited and the recommendation recomputes immediately.'}</div>
        <div class="field"><label for="ocat">Category</label><select id="ocat" ${done ? 'disabled' : ''}>${CATS.map(x => `<option ${x === c.cat ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div class="field mt"><label for="orsn">Reason (required)</label><textarea id="orsn" style="min-height:70px" ${done ? 'disabled' : ''} placeholder="Clinical reasoning for the change">${c.override ? esc(c.override.reason) : ''}</textarea></div>
        <div class="row mt"><button class="btn sm" id="oapply" ${done ? 'disabled' : ''}>Apply override</button>${c.override ? `<button class="btn ghost sm" id="oclear" ${done ? 'disabled' : ''}>Clear override</button>` : ''}</div><div class="lock">${A.ico('shield', 'width="15" height="15" style="stroke:currentColor;fill:none;stroke-width:2"')} Recorded as ${esc(A.user.name)}</div></div></div></div>`;
    A.after = () => {
      A.bindMarks(document.getElementById('srcbox'));
      if (cite) { const m = document.querySelector('mark[data-m="cite"]'); if (m) { m.scrollIntoView({ block: 'center' }); m.classList.add('flash'); } }
      const ap = document.getElementById('oapply'); if (ap) ap.onclick = () => {
        const cat = document.getElementById('ocat').value, reason = document.getElementById('orsn').value.trim();
        if (!reason) { A.toast('An override requires a reason'); return; } if (cat === c.rule.category) { A.toast('Same as the rule’s category. Nothing to override'); return; }
        b.st.overrides = b.st.overrides || {}; b.st.overrides[c.id] = { category: cat, reason, actor: A.user.name };
        A.auditAdd('human_override', A.user.name, { signal_id: b.sid, report_id: c.id, from: c.cat, to: cat, reason, rule_category: c.rule.category });
        const nb = A.build(b.sid); A.auditAdd('rule_evaluation', 'system', { signal_id: b.sid, scope: 'signal', rule_id: nb.rec.rule_id, ruleset: nb.rec.ruleset, version: nb.rec.version, recommendation: nb.rec.recommendation });
        A.persistInv(); A.toast('Override applied · recommendation recomputed: ' + nb.rec.rule_id); A.rerender();
      };
      const cl = document.getElementById('oclear'); if (cl) cl.onclick = () => { delete b.st.overrides[c.id]; A.auditAdd('human_override_cleared', A.user.name, { signal_id: b.sid, report_id: c.id }); A.persistInv(); A.rerender(); };
    };
    return A.shell('<span class="mono">' + c.id + '</span> ' + A.catBadge(c.cat), `${esc(A.sigLabel(b.p))} · evidence page`, body, '', crumb(b.p, c.id));
  }

  /* ======================= REVIEW ======================= */
  function draftTemplate(b) {
    const { p, cases, rec } = b, d = rec.inputs.distribution;
    const strong = cases.filter(c => c.cat === 'Certain' || c.cat === 'Probable').slice(0, 5), weak = cases.filter(c => c.cat === 'Unlikely').slice(0, 4);
    const altCount = {}; cases.forEach(c => c.facts.alternative_causes.forEach(a => { const k = a.cause.toLowerCase(); altCount[k] = (altCount[k] || 0) + 1; }));
    const top = Object.entries(altCount).sort((x, y) => y[1] - x[1]).slice(0, 3).map(x => `${x[0]} (${x[1]} cases)`);
    const desc = c => `${c.id} (${c.cat.toLowerCase()}${c.facts.time_to_onset.status === 'verified' ? ', onset ' + c.facts.time_to_onset.value + ' days' : ''}${c.facts.dechallenge.value === 'positive' ? ', positive dechallenge' : ''})`;
    return `${p.drug} with ${p.event.toLowerCase()}: ${cases.length} cases were assessed. Disproportionality gives PRR ${p.prr} and ROR ${fx(p.ror, 1)} (95% CI ${fx(p.ror_lo, 1)}–${fx(p.ror_hi, 1)}), χ² ${fx(p.chi2, 1)}; the Evans criteria are ${p.is_signal ? '' : 'not '}met. Rule ${rec.rule_id} v${rec.version} gives the recommendation “${rec.recommendation}”. Causality by case: ${CATS.map(k => `${d[k]} ${k.toLowerCase()}`).join(', ')}.` + (strong.length ? ` Strongest support comes from ${strong.map(desc).join('; ')}.` : '') + (weak.length ? ` Cases where another explanation is more likely include ${weak.map(c => c.id).join(', ')}.` : '') + (top.length ? ` The most frequent alternative causes were ${top.join(', ')}.` : '') + ` ${cases.filter(c => c.override).length} human override(s) are included.`;
  }
  function reviewView(b) {
    const { p, cases, rec, st } = b, done = st.status === 'completed', S = st.summary, valid = new Set(cases.map(c => c.id));
    const chk = S ? E.checkSummaryCitations(S.final_text != null ? S.final_text : S.text, valid) : null;
    const body = `${tabs(b, '/review')}<div class="grid g-7-5" style="align-items:start"><div class="grid" style="gap:18px">
      <div class="card"><div class="row" style="margin-bottom:6px"><h3>Investigation summary</h3><span class="sp"></span>${S ? `<span class="badge b-vio">${esc(S.label)}</span>` : ''}</div><div class="sub" style="margin-bottom:14px">${S ? `Drafted by <code>${esc(S.model_id)}</code> · <code>${esc(S.prompt_version)}</code>${S.edited ? ' · edited by you' : ''}` : 'The AI drafts from structured, already-verified data only. It cannot change the recommendation.'}</div>
        ${S ? `<textarea id="sum" style="min-height:230px;font-size:14.5px;line-height:1.65" ${done ? 'disabled' : ''}>${esc(S.final_text != null ? S.final_text : S.text)}</textarea>
        <div id="cites" style="margin-top:12px">${citeHtml(chk)}</div>` : `<div class="empty"><b>No draft yet</b>Generate a draft to review, edit and sign.</div><div class="row" style="justify-content:center"><button class="btn" id="draft">Draft summary</button></div>`}
        ${S && !done ? '<div class="row mt"><button class="btn ghost sm" id="redraft">Re-draft</button><span style="font-size:12px;color:var(--mut)">Every case ID you cite is checked against this signal in real time.</span></div>' : ''}</div>
      <div class="card"><h3>What you are approving</h3><div class="sub" style="margin-bottom:14px">Everything below is frozen into the audit trail at sign-off</div><div class="grid g2" style="gap:12px">
        <div class="fact"><div class="k">Rule recommendation</div><b>${esc(rec.recommendation)}</b><div class="mono" style="font-size:12px;color:var(--mut);margin-top:4px">${rec.rule_id} v${rec.version}</div></div>
        <div class="fact"><div class="k">Causality mix</div>${C.stack(CATS.map(k => ({ label: k, value: rec.inputs.distribution[k], color: catColor(k) })), { h: 14 })}<div style="font-size:12px;color:var(--mut);margin-top:8px">${cases.length} cases · ${cases.filter(c => c.override).length} overridden</div></div>
        <div class="fact"><div class="k">Statistics</div><b>PRR ${p.prr} · χ² ${fx(p.chi2, 1)}</b><div style="font-size:12px;color:var(--mut)">ROR ${fx(p.ror, 1)} (${fx(p.ror_lo, 1)}–${fx(p.ror_hi, 1)})</div></div>
        <div class="fact"><div class="k">Pipeline versions</div><div class="mono" style="font-size:12px;line-height:1.7">extract_v1.4.0<br>cau_001 v${E.CAUSALITY.version}<br>rec_001 v${E.RECOMMEND.version}</div></div></div></div></div>
    <div class="sticky-r">${done ? signed(b) : `<div class="card"><h3>Sign-off</h3><div class="sub" style="margin-bottom:14px">A named human owns the decision.</div>
      <div class="field"><label for="who">Reviewer name</label><input id="who" value="${esc(A.user.name)}"></div>
      <div class="field mt"><label>Decision</label><div class="seg" style="width:100%"><button data-dec="accept" class="on" style="flex:1">Accept recommendation</button><button data-dec="override" style="flex:1">Override</button></div></div>
      <div id="ovf" style="display:none"><div class="field mt"><label for="frec">Final recommendation</label><select id="frec">${['Validated – escalate to Safety Review Committee', 'Not confirmed – confounded, continue monitoring', 'Inconclusive – continue monitoring and request follow-up', 'Insufficient information – request follow-up'].map(x => `<option>${x}</option>`).join('')}</select></div><div class="field mt"><label for="frs">Reason (required)</label><textarea id="frs" style="min-height:80px"></textarea></div></div>
      <button class="btn mt" id="sign" style="width:100%;justify-content:center" ${S ? '' : 'disabled'}>${A.ico('check')} Sign off investigation</button>${S ? '' : '<div class="sub mt">Draft a summary first.</div>'}
      <div class="callout warn mt" style="font-size:12.5px">Signing locks overrides and the summary. Your name, the decision and a hash of the summary are written to the hash-chained audit trail.</div></div>`}</div></div>`;
    A.after = () => {
      const save = () => A.persistInv();
      const dr = document.getElementById('draft'), rd = document.getElementById('redraft');
      const make = () => { const real = window.DATA.summaries[b.sid]; const text = real || draftTemplate(b); st.summary = { text, label: 'AI draft – requires human approval', model_id: real ? 'apac.amazon.nova-lite-v1:0' : 'offline-drafter (template)', prompt_version: 'summary_v1.0.0', edited: false, final_text: null }; const c = E.checkSummaryCitations(text, valid); A.auditAdd('ai_summary', 'system', { signal_id: b.sid, model_id: st.summary.model_id, prompt_version: 'summary_v1.0.0', summary_sha256: E.sha256(text), citations: c }); save(); A.rerender(); };
      if (dr) dr.onclick = make; if (rd) rd.onclick = make;
      const ta = document.getElementById('sum'); if (ta) ta.oninput = () => { S.final_text = ta.value; S.edited = ta.value !== S.text; save(); document.getElementById('cites').innerHTML = citeHtml(E.checkSummaryCitations(ta.value, valid)); };
      let dec = 'accept'; document.querySelectorAll('[data-dec]').forEach(x => x.onclick = () => { dec = x.dataset.dec; document.querySelectorAll('[data-dec]').forEach(y => y.classList.toggle('on', y === x)); document.getElementById('ovf').style.display = dec === 'override' ? 'block' : 'none'; });
      const sg = document.getElementById('sign'); if (sg) sg.onclick = () => {
        const who = document.getElementById('who').value.trim(); if (!who) { A.toast('Reviewer name is required'); return; }
        const text = (S.final_text != null ? S.final_text : S.text).trim(); let final = rec.recommendation, reason = '';
        if (dec === 'override') { reason = document.getElementById('frs').value.trim(); final = document.getElementById('frec').value; if (!reason) { A.toast('Overriding needs a reason'); return; } }
        const ev = A.auditAdd('human_signoff', who, { signal_id: b.sid, decision: dec, final_recommendation: final, reason, rule_recommendation: rec.recommendation, summary_sha256: E.sha256(text) });
        st.status = 'completed'; st.signoff = { actor: who, decision: dec, final_recommendation: final, reason, rule_recommendation: rec.recommendation, summary_sha256: E.sha256(text), ts: ev.ts, audit_hash: ev.hash }; S.final_text = text; save(); A.toast('Signed off · audit event #' + ev.seq); A.rerender();
      };
    };
    return A.shell('Review & sign-off', esc(A.sigLabel(p)) + ' · AI draft, citation check, human approval', body, '', crumb(p, 'Review'));
  }
  function citeHtml(c) {
    if (!c) return '';
    return `<div class="row" style="gap:8px"><b style="font-size:13px">Citation check</b>${c.valid.map(x => `<span class="badge b-ok">${x} ✓</span>`).join('')}${c.invalid.map(x => `<span class="badge b-bad">${x} not in this signal ✗</span>`).join('')}${c.cited.length ? '' : '<span class="badge b-warn">no case IDs cited</span>'}</div>${c.invalid.length ? '<div class="callout bad mt" style="font-size:12.5px">Invalid citations detected. Remove or correct them before signing.</div>' : ''}`;
  }
  function signed(b) {
    const s = b.st.signoff;
    return `<div class="card" style="border:2px solid var(--ok)"><div class="row"><h3>Signed off</h3><span class="sp"></span><span class="badge b-ok">Locked</span></div><div class="tl mt"><div class="e ok"><b>${esc(s.actor)}</b><div style="font-size:12.5px;color:var(--mut)">${A.fmtDate(s.ts)}</div></div><div class="e"><b>${s.decision === 'accept' ? 'Accepted the rule recommendation' : 'Overrode the rule recommendation'}</b><div style="font-size:13px">${esc(s.final_recommendation)}</div>${s.reason ? `<div style="font-size:12.5px;color:var(--mut)">Reason: ${esc(s.reason)}</div>` : ''}</div><div class="e h"><b>Cryptographic receipt</b><div class="mono" style="font-size:11px;color:var(--mut);word-break:break-all">summary sha256 ${s.summary_sha256}<br>audit hash ${s.audit_hash}</div></div></div>
      <div class="row mt"><button class="btn ghost sm" id="dl">Download report (JSON)</button><a class="btn ghost sm" href="#/audit">View audit trail</a></div></div>`.replace('id="dl"', 'id="dl" onclick="A.download(\'' + b.sid.replace(/'/g, "\\'") + '\')"');
  }
  A.download = sid => {
    const b = A.build(sid), r = { signal: b.p, recommendation: b.rec, signoff: b.st.signoff, summary: b.st.summary, cases: b.cases.map(c => ({ id: c.id, category: c.cat, rule: c.rule, override: c.override, facts: c.facts })) };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })); a.download = 'signal-report-' + sid.replace(/\W+/g, '-') + '.json'; a.click();
  };

  /* ======================= CHAT ======================= */
  A.chats = A.chats || {};
  const STOP = new Set('a an the of in on to for and or is are was were be been what which who how why do did does any all with by at as it this that these those from there their about case cases patient patients drug tell me show list give'.split(' '));
  const stem = w => w.replace(/(ing|ed|es|s)$/, '');
  const toks = s => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => !STOP.has(w) && w.length > 1).map(stem);
  function answer(b, qn) {
    const cases = b.cases, kb = {}; cases.forEach(c => kb[c.id] = c.narrative);
    const cites = []; const addC = (c, quote) => { if (quote) cites.push({ case_id: c.id, quote }); };
    const low = qn.toLowerCase(); let text = '', intent = 'retrieval', best = 0, rel = [];
    const ver = k => cases.filter(c => c.facts[k].value === 'positive');
    if (/rechalleng|re-?introduc|restart/.test(low)) {
      intent = 'rechallenge (structured facts)'; const pos = ver('rechallenge'); text = pos.length ? `${pos.length} of ${cases.length} cases have a verified positive rechallenge: ${pos.map(c => c.id).join(', ')}.` : `No case has a verified positive rechallenge among ${cases.length} cases.`;
      pos.slice(0, 5).forEach(c => addC(c, c.facts.rechallenge.quote)); rel = pos; best = pos.length ? 1 : 0.1;
    } else if (/dechalleng|stopp|discontinu|withdr|improv|recover/.test(low)) {
      intent = 'dechallenge (structured facts)'; const pos = ver('dechallenge'); text = `${pos.length} of ${cases.length} cases show a verified positive dechallenge (the event improved after the drug was stopped).`; pos.slice(0, 4).forEach(c => addC(c, c.facts.dechallenge.quote)); rel = pos; best = pos.length ? 1 : 0.1;
    } else if (/alternative|confound|other cause|co-?med|alcohol|explain|another/.test(low)) {
      intent = 'alternative causes (structured facts)'; const cnt = {}, ex = {}; cases.forEach(c => c.facts.alternative_causes.forEach(a => { const k = a.cause.toLowerCase(); cnt[k] = (cnt[k] || 0) + 1; ex[k] = ex[k] || [c, a.quote]; })); const top = Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 5);
      text = top.length ? 'Verified alternative causes: ' + top.map(x => `${x[0]} (${x[1]} case${x[1] > 1 ? 's' : ''})`).join('; ') + '.' : 'No alternative causes were verified in these cases.'; top.forEach(x => addC(ex[x[0]][0], ex[x[0]][1])); rel = top.map(x => ex[x[0]][0]); best = top.length ? 1 : 0.1;
    } else if (/onset|how long|time to|days after|latency|when did/.test(low)) {
      intent = 'time to onset (structured facts)'; const o = cases.filter(c => c.facts.time_to_onset.status === 'verified').sort((x, y) => x.facts.time_to_onset.value - y.facts.time_to_onset.value);
      if (o.length) { const lo = o[0], hi = o[o.length - 1]; text = `Verified onset ranges from ${lo.facts.time_to_onset.value} to ${hi.facts.time_to_onset.value} days after starting the drug (${o.length} of ${cases.length} cases state it).`; addC(lo, lo.facts.time_to_onset.quote); addC(hi, hi.facts.time_to_onset.quote); rel = [lo, hi]; best = 1; }
    } else if (/gap|missing|unknown|insufficient|unassess/.test(low)) {
      intent = 'data gaps (structured facts)'; const cnt = {}; cases.forEach(c => c.facts.data_gaps.forEach(g => cnt[g.toLowerCase()] = (cnt[g.toLowerCase()] || 0) + 1)); const top = Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 5); text = top.length ? 'Most common gaps the AI noted: ' + top.map(x => `${x[0]} (${x[1]})`).join('; ') + '.' : 'No data gaps were noted.'; best = top.length ? .8 : .1; text += ` ${cases.filter(c => c.cat === 'Unassessable').length} case(s) are Unassessable.`;
    }
    if (!text) { // hybrid lexical retrieval over narrative sentences
      const q = toks(qn), chunks = []; cases.forEach(c => c.narrative.split(/(?<=[.!?])\s+/).forEach(s => chunks.push({ c, s, t: new Set(toks(s)) })));
      const df = {}; chunks.forEach(ch => ch.t.forEach(w => df[w] = (df[w] || 0) + 1));
      const sc = chunks.map(ch => ({ ...ch, score: q.reduce((a, w) => a + (ch.t.has(w) ? Math.log(1 + chunks.length / df[w]) : 0), 0), hit: q.filter(w => ch.t.has(w)).length })).filter(x => x.score > 0).sort((x, y) => y.score - x.score);
      best = sc.length ? sc[0].score / Math.max(1, q.reduce((a, w) => a + Math.log(1 + chunks.length / (df[w] || 1)), 0)) : 0;
      const top = []; const seen = new Set(); sc.forEach(x => { if (top.length < 4 && !seen.has(x.c.id)) { seen.add(x.c.id); top.push(x); } });
      if (best >= .45 && top.length && q.length) { text = `The closest evidence in this signal's narratives (${top.length} case${top.length > 1 ? 's' : ''}):`; top.forEach(x => addC(x.c, x.s.trim())); rel = top.map(x => x.c); intent = 'lexical retrieval over narrative sentences'; }
    }
    const ok = [], bad = []; cites.forEach(c => { const sp = E.locateQuote(c.quote, kb[c.case_id] || ''); if (sp) ok.push({ case_id: c.case_id, quote: kb[c.case_id].slice(sp[0], sp[1]), span: sp }); else bad.push(c); });
    const none = !text || (!ok.length && !/structured/.test(intent)) || best < .2 && !/structured/.test(intent);
    const res = { question: qn, intent, answer: none ? 'I could not find supporting evidence for that in this signal’s cases.' : text, no_evidence: none, citations: none ? [] : ok, rejected: bad, grounding: none ? 'no_evidence' : ok.length ? 'grounded' : 'structured', best, related: rel.slice(0, 6).map(c => c.id) };
    A.auditAdd('chat_exchange', A.user.name, { signal_id: b.sid, question: qn, intent, grounding: res.grounding, citations: res.citations.map(c => ({ case_id: c.case_id, span: c.span })), rejected_citations: bad.length, mode: 'offline-extractive' });
    return res;
  }
  function chatView(b) {
    const T = A.chats[b.sid] = A.chats[b.sid] || [], last = T[T.length - 1];
    const sugg = ['What was the time to onset?', 'Which cases had a positive rechallenge?', 'What alternative causes were reported?', 'How many had positive dechallenge?', 'What is the approved dose for children?'];
    const msg = m => `<div style="display:flex;flex-direction:column;gap:10px"><div style="align-self:flex-end;background:var(--blue);color:#fff;border-radius:20px 20px 4px 20px;padding:10px 16px;max-width:80%">${esc(m.question)}</div>
      <div class="card flat" style="align-self:flex-start;max-width:92%;padding:16px 18px"><div class="row" style="margin-bottom:8px"><span class="badge ${m.grounding === 'no_evidence' ? 'b-warn' : 'b-ok'}">${m.grounding === 'no_evidence' ? 'No supporting evidence' : m.grounding === 'grounded' ? 'Grounded · citations verified' : 'From verified structured facts'}</span><span class="badge b-vio">read-only assistant</span></div><div>${esc(m.answer)}</div>
      ${m.citations.map(c => `<a class="item" style="margin-top:8px;padding:10px 14px" href="${A.sigUrl(b.sid)}/case/${c.case_id}?s=${c.span[0]}&e=${c.span[1]}"><div class="row"><b class="mono" style="font-size:12px">${c.case_id}</b><span class="badge b-ok">verbatim ✓</span><span class="sp"></span><span style="font-size:12px;color:var(--blue)">Open source →</span></div><div style="font-size:13px;margin-top:4px;color:var(--ink-2)">“${esc(c.quote)}”</div></a>`).join('')}
      ${m.rejected.length ? `<div class="callout bad mt" style="font-size:12.5px">${m.rejected.length} citation(s) rejected: quote not found in source.</div>` : ''}</div></div>`;
    const body = `${tabs(b, '/chat')}<div class="grid g-7-5" style="align-items:start"><div class="card"><div class="row" style="margin-bottom:14px">${sugg.map(s => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <div id="thread" class="list" style="gap:22px;min-height:260px;max-height:58vh;overflow:auto;padding:4px">${T.length ? T.map(msg).join('') : `<div class="empty"><b>Ask about ${esc(A.sigLabel(b.p))}</b>Answers come only from this signal’s narratives and verified facts, and every citation links to its source.</div>`}</div>
      <form class="row mt" id="cf"><input class="input" id="cq" placeholder="Ask the evidence…" style="flex:1" autocomplete="off"><button class="btn" type="submit">${A.ico('arrow')} Ask</button></form></div>
    <div class="sticky-r"><div class="card"><h3>How the last answer was grounded</h3><div class="sub" style="margin-bottom:14px">Retrieval → relevance gate → verified citations</div>${last ? `<div class="flow" style="flex-direction:column;gap:10px">${[['1 · Retrieve', last.intent, 'b-info'], ['2 · Relevance gate', `best match score ${Math.round(last.best * 100)}% ${last.best >= .2 ? '(passed)' : '(blocked: too weak)'}`, last.best >= .2 ? 'b-ok' : 'b-warn'], ['3 · Citation check', `${last.citations.length} verified · ${last.rejected.length} rejected`, last.rejected.length ? 'b-bad' : 'b-ok']].map(x => `<div class="fact"><span class="badge ${x[2]}">${x[0]}</span><div style="font-size:13px;margin-top:6px">${esc(x[1])}</div></div>`).join('')}</div>${last.related.length ? `<h4 style="margin:16px 0 8px">Cases consulted</h4><div class="row" style="gap:6px">${last.related.map(id => `<a class="badge b-info mono" href="${A.sigUrl(b.sid)}/case/${id}">${id}</a>`).join('')}</div>` : ''}` : '<div class="empty">Ask a question to see the grounding steps.</div>'}
      <div class="callout info mt" style="font-size:12.5px"><b>Offline extractive mode.</b> This build answers by retrieving and quoting narrative text and aggregating verified facts. No generative model is called. With a model connected, the same retrieval, relevance gate and citation verification apply.</div></div></div></div>`;
    A.after = () => {
      const t = document.getElementById('thread'); if (t) t.scrollTop = t.scrollHeight;
      const ask = qn => { if (!qn.trim()) return; T.push(answer(b, qn.trim())); A.rerender(); };
      document.getElementById('cf').onsubmit = e => { e.preventDefault(); ask(document.getElementById('cq').value); };
      document.querySelectorAll('[data-s]').forEach(x => x.onclick = () => ask(x.dataset.s));
    };
    return A.shell('Ask the evidence', 'A read-only assistant. It never assigns causality or changes the recommendation.', body, '', crumb(b.p, 'Chat'));
  }
  A.views.ask = function () {
    const body = `<div class="grid g3">${A.pairs.filter(A.canInvestigate).map(p => { const st = A.invState[p.signal_id]; return `<a class="item" style="padding:20px" href="${st ? A.sigUrl(p.signal_id) + '/chat' : A.sigUrl(p.signal_id)}"><b>${esc(A.sigLabel(p))}</b><div class="m"><span>${A.casesOf(p).length} cases</span><span>PRR ${p.prr}</span>${st ? '<span class="badge b-ok">ready</span>' : '<span class="badge b-mut">investigate first</span>'}</div></a>`; }).join('')}</div>`;
    return A.shell('Ask the evidence', 'Choose a signal. Chat is scoped to one signal at a time so answers can never mix evidence across drugs.', body);
  };

  /* ======================= AUDIT ======================= */
  A.auditUI = A.auditUI || { type: '', ver: null, tamper: null };
  const TYPE_BADGE = { ai_extraction: 'b-vio', ai_triage_proposal: 'b-vio', ai_summary: 'b-vio', rule_evaluation: 'b-teal', human_override: 'b-warn', human_override_cleared: 'b-warn', human_signoff: 'b-ok', human_field_accept: 'b-ok', chat_exchange: 'b-info', decision_replay: 'b-mut' };
  A.views.audit = function () {
    const U = A.auditUI, ev = U.tamper ? U.tamper.chain : A.audit, v = U.ver || { valid: null };
    const types = [...new Set(A.audit.map(e => e.type))], shown = ev.slice().reverse().filter(e => !U.type || e.type === U.type).slice(0, 80);
    const bad = U.ver && !U.ver.valid ? U.ver.broken_at_seq : null;
    const chain = ev.map((e, i) => `<i class="${v.valid === null ? 'pend' : bad && e.seq >= bad ? 'bad' : e.local ? 'new' : ''}" ${C.tip('#' + e.seq + ' ' + e.type + (bad && e.seq === bad ? '\nHASH MISMATCH — this event was altered' : ''))}></i>`).join('');
    const body = `<div class="grid g4"><div class="card kpi"><div class="lb">Events in chain</div><div class="v">${ev.length}</div><div class="ft">${D_.audit.length} original + ${A.audit.filter(e => e.local).length} created here</div></div>
      <div class="card kpi"><div class="lb">Chain status</div><div class="v" style="color:var(--${v.valid === null ? 'mut' : v.valid ? 'ok' : 'bad'});font-size:26px;padding:8px 0">${v.valid === null ? 'Not verified' : v.valid ? 'Intact ✓' : 'BROKEN'}</div><div class="ft">${v.valid ? 'every hash recomputed' : v.valid === false ? 'altered at event #' + bad : 'press Verify'}</div></div>
      <div class="card kpi" style="grid-column:span 2"><div class="lb">Head hash</div><div class="mono" style="word-break:break-all;margin-top:8px;font-size:13px">${ev[ev.length - 1].hash}</div><div class="ft">Changing any past event changes every hash after it.</div></div></div>
    <div class="card mt"><div class="hd"><div><h3>Verify the chain</h3><div class="sub">Each event stores the hash of the one before it. Verification recomputes SHA-256 for every event in your browser, starting from the genesis hash.</div></div><div class="row"><button class="btn" id="ver">${A.ico('shield')} Verify chain</button><button class="btn ghost" id="tam">${U.tamper ? 'Undo tampering demo' : 'Simulate tampering'}</button></div></div>
      <div class="chain">${chain}</div><div class="legend mt"><span><i style="background:var(--ok)"></i>Original (from the zip's real database)</span><span><i style="background:var(--blue)"></i>Created in this session</span><span><i style="background:var(--bad)"></i>Altered or after an altered event</span><span><i style="background:var(--line)"></i>Not yet verified</span></div>
      ${U.tamper ? `<div class="callout warn mt" style="font-size:13px"><b>Tampering demo.</b> A copy of the chain was edited at event #${U.tamper.seq} (a reviewer name was changed). Verify to watch it fail. Your real audit trail is untouched.</div>` : ''}</div>
    <div class="card mt"><div class="hd"><div><h3>Events</h3><div class="sub">Newest first · showing ${shown.length}</div></div><a class="btn ghost sm" id="exp">Export JSON</a></div><div class="row" style="margin-bottom:14px"><button class="chip ${!U.type ? 'on' : ''}" data-t="">All</button>${types.map(t => `<button class="chip ${U.type === t ? 'on' : ''}" data-t="${t}">${A.human(t)}</button>`).join('')}</div>
      <div class="tl">${shown.map(e => `<div class="e ${e.type.startsWith('human') ? 'h' : e.type === 'rule_evaluation' ? 'ok' : ''}"><div class="row"><span class="badge ${TYPE_BADGE[e.type] || 'b-mut'}">${A.human(e.type)}</span><b class="mono" style="font-size:12.5px">#${e.seq}</b><span style="color:var(--mut);font-size:12.5px">${A.fmtDate(e.ts)} · ${esc(e.actor)}</span>${e.local ? '<span class="badge b-info">this session</span>' : ''}</div><div style="font-size:13px;margin-top:4px;color:var(--ink-2)">${esc(summ(e))}</div><details><summary style="cursor:pointer;font-size:12px;color:var(--mut)">hash &amp; payload</summary><div class="mono" style="font-size:11px;word-break:break-all;color:var(--mut);margin:6px 0">prev ${e.prev_hash}<br>this ${e.hash}</div><pre class="mono" style="font-size:11.5px;white-space:pre-wrap;background:var(--card-2);padding:10px;border-radius:12px">${esc(JSON.stringify(e.payload, null, 1))}</pre></details></div>`).join('')}</div></div>`;
    A.after = () => {
      document.getElementById('ver').onclick = async () => {
        const b = document.getElementById('ver'); b.disabled = true; let prev = E.GENESIS, res = { valid: true, events: ev.length, head: null };
        const dots = document.querySelectorAll('.chain i'); dots.forEach(d => d.className = 'pend');
        for (let i = 0; i < ev.length; i++) { const e = ev[i]; if (e.prev_hash !== prev || E.eventHash(prev, e.ts, e.type, e.actor, e.ps || e.payload) !== e.hash) { res = { valid: false, events: ev.length, broken_at_seq: e.seq }; for (let j = i; j < dots.length; j++) dots[j].className = 'bad'; break; } dots[i].className = e.local ? 'new' : ''; prev = e.hash; if (i % 4 === 0) await new Promise(r => setTimeout(r, 12)); }
        if (res.valid) res.head = prev; U.ver = res; A.rerender();
      };
      document.getElementById('tam').onclick = () => { if (U.tamper) { U.tamper = null; U.ver = null; } else { const idx = Math.floor(A.audit.length / 2), cp = A.audit.map(e => ({ ...e })); const e = cp[idx]; const p2 = JSON.parse(JSON.stringify(e.payload)); p2.altered = true; e.payload = p2; e.ps = E.canonical(p2); U.tamper = { chain: cp, seq: e.seq }; U.ver = null; } A.rerender(); };
      document.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { U.type = x.dataset.t; A.rerender(); });
      document.getElementById('exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(A.audit.map(({ ps, ...r }) => r), null, 1)], { type: 'application/json' })); a.download = 'atheria-audit.json'; a.click(); };
    };
    return A.shell('Audit trail', 'Append-only and hash-chained. Anyone can re-verify it, and any edit to history is detectable.', body);
  };
  const D_ = window.DATA;
  function summ(e) {
    const p = e.payload || {};
    switch (e.type) {
      case 'ai_extraction': return `AI extracted facts for ${p.report_id} · ${p.guardrail ? p.guardrail.quotes_verified + ' quotes verified, ' + p.guardrail.quotes_rejected + ' rejected' : ''} · ${p.from_cache ? 'replayed from cache' : 'live model call'}`;
      case 'rule_evaluation': return p.scope === 'signal' ? `Rule ${p.rule_id} → ${p.recommendation || ''}` : `Rule ${p.rule_id}${p.report_id ? ' on ' + p.report_id : ''}${p.category ? ' → ' + p.category : p.outcome ? ' → ' + p.outcome : ''}`;
      case 'human_override': return `${p.report_id}: ${p.from} → ${p.to}. Reason: ${p.reason}`;
      case 'human_signoff': return `${p.signal_id}: ${p.decision} · ${p.final_recommendation}`;
      case 'ai_summary': return `Summary drafted for ${p.signal_id} (sha256 ${String(p.summary_sha256).slice(0, 10)}…)`;
      case 'chat_exchange': return `Question: “${p.question}” → ${p.grounding}`;
      case 'ai_triage_proposal': return `AI proposed criteria for ${p.source_record_id}`;
      case 'decision_replay': return `Replayed ${p.source_record_id}: ${p.identical ? 'identical' : 'DIFFERENT'}`;
      default: return JSON.stringify(p).slice(0, 140);
    }
  }

  /* ======================= TRUST ======================= */
  A.views.trust = function () {
    const rows = (h, r) => `<div class="scroll"><table><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${r.map(x => `<tr>${x.map((c, i) => `<td ${i === 0 ? 'style="white-space:nowrap"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const body = `<div class="card"><h3>The core idea</h3><p style="margin:8px 0 18px;font-size:16px;max-width:75ch">Statistics detect. AI extracts. Code verifies. Rules decide. A human approves. The AI only reads text and reports facts with quotes. Plain code then checks that each quote really exists in the source.</p>${A.flowStrip()}</div>
    <div class="grid g2 mt"><div class="card"><h3>Two layers of guardrails</h3><div class="sub" style="margin-bottom:14px">Prompts are necessary but not sufficient, so the second layer is code.</div>
      <div class="fact"><span class="badge b-vio">Level 1 · prompt</span><div style="margin-top:8px;font-size:13.5px">“Facts only. Quote verbatim. Prefer <i>unknown</i> over inference.” Versioned: <code>extract_v1.4.0</code></div></div>
      <div class="fact mt"><span class="badge b-info">Level 2 · code</span><ul style="margin:8px 0 0 18px;font-size:13.5px;line-height:1.8"><li>Output must match a strict schema, or it is rejected</li><li>Every fact needs a verbatim quote at real character offsets, or it becomes <b>unknown</b></li><li>Negation check moves “ruled out” findings out of alternative causes</li><li>Summary citations must be real case IDs from this signal</li><li>Chat answers pass a relevance gate and citation verification</li></ul></div></div>
    <div class="card"><h3>What is real in this build</h3><div class="sub" style="margin-bottom:14px">Being clear about what runs where</div>${rows(['Component', 'In this website'], [['Statistics (PRR, ROR CI, χ², Evans)', '<span class="badge b-ok">Live, same code logic</span>'], ['Guardrails and quote verification', '<span class="badge b-ok">Live</span>'], ['Causality and recommendation rules', '<span class="badge b-ok">Live</span>'], ['ICSR validity rule val_001', '<span class="badge b-ok">Live</span>'], ['Hash-chained audit', '<span class="badge b-ok">Live, 120 real events verify</span>'], ['Case-narrative AI extraction', '<span class="badge b-warn">Cached output from the original Nova Lite run</span>'], ['Triage reading of new reports', '<span class="badge b-warn">Offline rule-based reader</span>'], ['Summary drafting and chat', '<span class="badge b-warn">Offline: template draft, extractive answers</span>']])}</div></div>
    <div class="card mt"><h3>Rule books</h3><div class="sub" style="margin-bottom:14px">Versioned, pure functions. Same inputs and version always give the same output.</div><div class="grid g3" style="align-items:start">
      <div><h4 style="margin-bottom:8px">val_001 v1.0.0 · ICSR validity</h4>${rows(['If', 'Then'], [['All 4 criteria present', '<span class="badge b-ok">Valid</span>'], ['Product or event absent', '<span class="badge b-mut">Not an ICSR</span>'], ['Product + event, but patient or reporter absent', '<span class="badge b-warn">Escalate</span>']])}<p class="sub mt">Criteria: identifiable patient, identifiable reporter, suspect product, adverse event.</p></div>
      <div><h4 style="margin-bottom:8px">cau_001 v1.1.0 · causality</h4>${rows(['Rule', 'Category'], [['CAU-01 timing implausible', A.catBadge('Unlikely')], ['CAU-02 timing unknown', A.catBadge('Unassessable')], ['CAU-03 ≥2 alt. causes, no positive dechallenge', A.catBadge('Unlikely')], ['CAU-04 ≥1 alt. cause', A.catBadge('Possible')], ['CAU-05 +dechallenge +rechallenge', A.catBadge('Certain')], ['CAU-06 +dechallenge', A.catBadge('Probable')], ['CAU-07 otherwise', A.catBadge('Possible')]])}</div>
      <div><h4 style="margin-bottom:8px">rec_001 v1.0.0 · recommendation</h4>${rows(['Rule', 'Outcome'], [['REC-01 unassessable > 50%', 'Insufficient information'], ['REC-02 signal and supportive ≥ 50%', 'Validated'], ['REC-03 unlikely ≥ 50%', 'Not confirmed'], ['REC-04 otherwise', 'Inconclusive']])}<p class="sub mt">Evans: PRR ≥ 2, χ² ≥ 4, cases ≥ 3.</p></div></div></div>
    <div class="card mt"><h3>Assumptions and limits</h3><ul style="margin:10px 0 0 18px;line-height:1.9;max-width:85ch"><li>Data is a synthetic FAERS-style set (fixed seed 42, 1,261 reports) with fictional drugs.</li><li>The causality rule is WHO-UMC-inspired and has <b>not</b> been clinically validated.</li><li>The “time saved” figure assumes 15 minutes of manual review per case. It is an assumption, not a measurement.</li><li>This is a single-user demo with local state in your browser. It has no authentication, and e-signature, MedDRA coding and E2B export are not built.</li></ul></div>`;
    return A.shell('How decisions are made', 'Everything the platform concludes can be traced to evidence, a rule and a person.', body);
  };
})();
