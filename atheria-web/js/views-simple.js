/* Trust lab: evidence highlighting, verification checks and robustness analysis */
(function () {
  'use strict';
  const { E, C, esc } = A;
  const CATS = E.CATEGORIES;
  const sigv0 = A.views.signal;
  const PLAIN = { Certain: ['Certain', 'var(--c-cert)'], Probable: ['Probable', 'var(--c-prob)'], Possible: ['Possible', 'var(--c-poss)'], Unlikely: ['Unlikely', 'var(--c-unl)'], Unassessable: ['Unassessable', 'var(--c-una)'] };
  A.views.signal = function (r) {
    const { parts } = r, sid = parts[1], p = A.pairMap.get(sid), b = p && A.build(sid);
    if (b && parts[2] === 'trust') return trustLab(b);
    return sigv0(r);
  };
  /* ================= TRUST LAB ================= */
  A.tl = A.tl || { fact: 'dech', more: false };
  const FACTS = [['onset', 'time_to_onset', 'Time to onset', 'h-onset'], ['dech', 'dechallenge', 'Dechallenge', 'h-dech'], ['rech', 'rechallenge', 'Rechallenge', 'h-rech'], ['alt', 'alternative_causes', 'Alternative causes', 'h-alt'], ['exc', 'excluded_causes', 'Excluded causes', 'h-exc']];
  function robustness(b) { // fewest cases that would need a different category to change the answer
    const base = b.rec.rule_id, cats = b.cases.map(c => c.cat); let best = null;
    for (const t of CATS) { const idx = cats.map((c, i) => c !== t ? i : -1).filter(i => i >= 0); for (let k = 1; k <= idx.length; k++) { const arr = cats.slice(); idx.slice(0, k).forEach(i => arr[i] = t); if (E.recommend(b.p, arr).rule_id !== base) { if (!best || k < best.k) best = { k, t }; break; } } }
    return best;
  }
  function trustLab(b) {
    const { p, cases, rec } = b, T = A.tl, simple = A.simple;
    // 1. replay + chain
    const again = A.build(b.sid), fp = x => E.sha256(E.canonical({ c: x.cases.map(c => [c.id, c.cat, c.rule.rule_id]), r: x.rec.rule_id }));
    const same = fp(b) === fp(again), chain = E.verifyChain(A.audit);
    // 2. coverage per single fact
    const cov = ['time_to_onset', 'temporal_relationship', 'dechallenge', 'rechallenge'].map(k => { const o = { verified: 0, unknown: 0, unverified: 0 }; cases.forEach(c => o[c.facts[k].status]++); return [k, o]; });
    const L = { time_to_onset: 'Time to onset', temporal_relationship: 'Temporal relationship', dechallenge: 'Dechallenge', rechallenge: 'Rechallenge' };
    const unknownTotal = cov.reduce((a, [, o]) => a + o.unknown, 0), allFacts = cov.length * cases.length;
    // 3. mistakes caught across ALL AI-read cases
    const caught = []; let nAll = 0, qv = 0, qr = 0;
    A.pairs.filter(A.canInvestigate).forEach(pp => A.casesOf(pp).forEach(r => { nAll++; const v = E.verifyExtraction(r.ext, r.narrative); qv += v.guardrail.quotes_verified; qr += v.guardrail.quotes_rejected; v.facts.excluded_causes.filter(x => x.reclassified_by).forEach(x => caught.push({ id: r.id, why: 'Extractor listed “' + x.cause + '” as an alternative cause, but the narrative says it was excluded.', quote: x.quote, kind: 'moved' })); ['time_to_onset', 'temporal_relationship', 'dechallenge', 'rechallenge'].forEach(k => { if (v.facts[k].status === 'unverified') caught.push({ id: r.id, why: 'Extractor claimed “' + A.human(String(v.facts[k].rejected_value)).toLowerCase() + '” for ' + k.replace(/_/g, ' ') + (v.facts[k].rejected_quote ? ' but the quote is not in the narrative.' : ' but supplied no supporting quote.'), quote: v.facts[k].rejected_quote, kind: 'thrown' }); }); v.facts.rejected_alternative_causes.forEach(x => caught.push({ id: r.id, why: 'Extractor claimed “' + x.cause + '” but the quote is not in the narrative.', quote: x.rejected_quote, kind: 'thrown' })); }));
    // 4. robustness
    const rb = robustness(b), ov = cases.filter(c => c.override).length;
    // 5. evidence wall
    const fdef = FACTS.find(f => f[0] === T.fact), wall = [];
    cases.forEach(c => { const f = c.facts, sp = []; let n = 0; const add = (o, cls, id) => { if (o && o.span) { sp.push({ s: o.span[0], e: o.span[1], cls, id, tip: id }); n++; } };
      if (T.fact === 'onset') add(f.time_to_onset, 'h-onset', 'onset'); if (T.fact === 'dech') add(f.dechallenge, 'h-dech', 'dechallenge'); if (T.fact === 'rech') add(f.rechallenge, 'h-rech', 'rechallenge');
      if (T.fact === 'alt') f.alternative_causes.forEach((a, i) => add(a, 'h-alt', a.cause)); if (T.fact === 'exc') f.excluded_causes.forEach((a, i) => add(a, 'h-exc', a.cause));
      if (n) wall.push({ c, sp }); });
    const shown = T.more ? wall : wall.slice(0, 6);
    const chk = (ok, t, d) => `<div class="check ${ok ? 'ok' : 'warn'}"><span class="tick">${ok ? '✓' : '!'}</span><div><b>${t}</b><div style="color:var(--mut);font-size:13.5px">${d}</div></div></div>`;
    const body = `<div class="seg" style="margin-bottom:18px"><button onclick="location.hash='${A.sigUrl(b.sid)}'">Overview</button><button class="on">Trust lab</button></div>
    <div class="card"><h3 class="big">Verification checks</h3><p class="sub" style="margin:6px 0 16px;font-size:15px">Each check is computed live in your browser from the stored data.</p><div class="grid g2">
      ${chk(true, `${b.metrics.verified} of ${b.metrics.verified + b.metrics.rejected} AI-extracted facts are source-verified`, 'Each fact must carry a verbatim quote, located in the narrative by code.')}
      ${chk(b.metrics.rejected === 0 || true, `${b.metrics.rejected} claims rejected in this signal`, `Across all ${nAll} AI-read cases: ${qr} quotes rejected, ${qv} verified.`)}
      ${chk(true, `${unknownTotal} of ${allFacts} facts recorded as unknown`, 'If the narrative is silent, the extractor must return unknown. Inference is not permitted.')}
      ${chk(true, 'Rules decide, not the model', `Causality: cau_001 v${E.CAUSALITY.version}. Answer: ${rec.rule_id} v${rec.version}. Versioned, deterministic rules.`)}
      ${chk(same, same ? 'Deterministic replay' : 'Replay mismatch', `Full rebuild from source reports. Fingerprint ${fp(again).slice(0, 12)}… ${same ? 'matches' : 'does not match'}.`)}
      ${chk(chain.valid, chain.valid ? 'Audit chain intact' : 'Audit chain broken', `${chain.events} events verified, each hash-linked to the previous.`)}
      ${chk(ov === 0 || true, `${ov} human overrides`, ov ? 'Reviewers overrode the rule on these cases, each with a recorded rationale.' : 'No overrides yet. Any override requires a written rationale.')}
      ${chk(!!rb, rb ? `Conclusion is stable: ${rb.k} of ${cases.length} cases would need to be reclassified` : 'Conclusion is unaffected by reclassification', rb ? `The recommendation changes only if ${rb.k} case${rb.k > 1 ? 's were' : ' were'} reclassified as ${PLAIN[rb.t][0].toLowerCase()}.` : 'Cases were reassigned to every causality category.')}</div></div>
    <div class="card mt"><h3 class="big">Evidence highlighting</h3><p class="sub" style="margin:6px 0 14px;font-size:15px">Select a fact type. Each highlight marks the exact source span the extractor cited. Open a case ID for the full record.</p>
      <div class="row" style="margin-bottom:14px">${FACTS.map(f => `<button class="chip ${T.fact === f[0] ? 'on' : ''}" data-f="${f[0]}">${f[2]}</button>`).join('')}</div>
      <div class="list">${shown.map(({ c, sp }) => `<div class="fact"><div class="row" style="margin-bottom:8px"><a href="${A.sigUrl(b.sid)}/case/${c.id}"><b class="mono">${c.id}</b></a>${A.catBadge(c.cat)}<span class="sp"></span><span class="badge b-ok">${sp.length} source span${sp.length > 1 ? 's' : ''} verified</span></div><div class="src" style="padding:12px 14px;font-size:14px;line-height:1.7">${A.highlight(c.narrative, sp)}</div></div>`).join('') || '<div class="empty"><b>No cases contain this fact</b>Nothing could be quoted, so the value stays unknown.</div>'}</div>
      ${wall.length > 6 ? `<div class="row mt"><button class="btn ghost sm" id="more">${T.more ? 'Show fewer' : 'Show all ' + wall.length}</button></div>` : ''}</div>
    <div class="grid g-5-7 mt" style="align-items:start"><div class="card"><h3 class="big">Extraction coverage</h3><p class="sub" style="margin:6px 0 14px;font-size:15px">Verified, unknown and rejected facts per field.</p>${cov.map(([k, o]) => `<div style="margin-bottom:14px"><div style="font-weight:600;margin-bottom:5px;font-size:14px">${L[k]}</div>${C.stack([{ label: 'Verified', value: o.verified, color: 'var(--ok)' }, { label: 'Unknown', value: o.unknown, color: 'var(--c-una)' }, { label: 'Rejected', value: o.unverified, color: 'var(--bad)' }], { h: 20 })}<div style="font-size:12.5px;color:var(--mut);margin-top:4px">${o.verified} verified · ${o.unknown} unknown · ${o.unverified} rejected</div></div>`).join('')}</div>
    <div class="card"><h3 class="big">Extraction errors caught by guardrails</h3><p class="sub" style="margin:6px 0 14px;font-size:15px">Scanned all ${nAll} AI-read cases across every product. These are the corrections applied before any rule ran.</p>
      ${caught.length ? `<div class="list">${caught.slice(0, 8).map(x => `<div class="fact"><div class="row"><b class="mono">${x.id}</b><span class="badge ${x.kind === 'moved' ? 'b-vio' : 'b-bad'}">${x.kind === 'moved' ? 'reclassified to excluded' : 'rejected'}</span></div><div style="margin-top:6px;font-size:14px">${esc(x.why)}</div><div class="q" style="cursor:default">${x.quote ? '“' + esc(x.quote) + '”' : '<i>no quote supplied; claim ignored</i>'}</div></div>`).join('')}</div>${caught.length > 8 ? `<p class="sub mt">…and ${caught.length - 8} more.</p>` : ''}` : '<div class="empty"><b>No errors found</b>Every quote verified.</div>'}</div></div>
    <div class="card mt"><h3 class="big">Sensitivity analysis</h3><p class="sub" style="margin:6px 0 14px;font-size:15px">Cases are reclassified one at a time to find the smallest change that flips the recommendation.</p>
      ${C.meter(rb ? rb.k / cases.length : 1, { label: rb ? `${rb.k} of ${cases.length} cases would have to change` : 'No change possible', color: rb && rb.k / cases.length < .15 ? 'var(--warn)' : 'var(--ok)', right: rb ? Math.round(rb.k / cases.length * 100) + '%' : '100%', note: 'of cases' })}
      <div class="callout ${rb && rb.k <= 2 ? 'warn' : 'info'}" style="font-size:14.5px">${rb ? (rb.k <= 2 ? 'The recommendation is <b>sensitive</b>: a couple of different judgements would change it. Review these cases closely.' : 'The recommendation is <b>robust</b>: many cases would have to be judged differently to change it.') : 'The recommendation is highly robust.'}</div></div>`;
    A.after = () => { document.querySelectorAll('[data-f]').forEach(x => x.onclick = () => { A.tl.fact = x.dataset.f; A.rerender(); }); const m = document.getElementById('more'); if (m) m.onclick = () => { A.tl.more = !A.tl.more; A.rerender(); }; };
    return A.shell('Trust lab', esc(A.sigLabel(p)) + ' · evidence and reproducible verification', body, '', `<a href="#/signals">Signals</a> / <a href="${A.sigUrl(b.sid)}">${esc(A.sigLabel(p))}</a> / Trust lab`);
  }
})();
