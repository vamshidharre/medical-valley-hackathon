/* Atheria charts — dependency-free SVG generators that turn numbers and text facts into pictures. */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f = (n, d = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  const CAT = { Certain: 'var(--c-cert)', Probable: 'var(--c-prob)', Possible: 'var(--c-poss)', Unlikely: 'var(--c-unl)', Unassessable: 'var(--c-unas)' };
  const OUT = { valid_icsr: 'var(--ok)', potential_icsr: 'var(--warn)', non_icsr: 'var(--c-una)' };
  const tip = t => `data-tip="${esc(t)}"`;
  const fill = c => `style="fill:${c}"`;

  function donut(data, o = {}) {
    const S = o.size || 190, R = S / 2 - 6, r = R * (o.hole || .64), cx = S / 2, tot = data.reduce((a, d) => a + d.value, 0);
    let a0 = -Math.PI / 2, out = '';
    if (!tot) out = `<circle cx="${cx}" cy="${cx}" r="${(R + r) / 2}" fill="none" style="stroke:var(--line)" stroke-width="${R - r}"/>`;
    data.filter(d => d.value > 0).forEach(d => {
      const a1 = a0 + (d.value / tot) * Math.PI * 2 - (data.filter(x => x.value > 0).length > 1 ? .02 : 0);
      const lg = a1 - a0 > Math.PI ? 1 : 0, P = (rad, a) => [cx + rad * Math.cos(a), cx + rad * Math.sin(a)];
      const [x0, y0] = P(R, a0), [x1, y1] = P(R, a1), [x2, y2] = P(r, a1), [x3, y3] = P(r, a0);
      if (data.filter(x => x.value > 0).length === 1) out += `<circle cx="${cx}" cy="${cx}" r="${(R + r) / 2}" fill="none" style="stroke:${d.color}" stroke-width="${R - r}" ${tip(d.label + ': ' + d.value)}/>`;
      else out += `<path d="M${x0},${y0} A${R},${R} 0 ${lg} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${lg} 0 ${x3},${y3}Z" ${fill(d.color)} ${tip(d.label + ': ' + d.value + ' (' + Math.round(d.value / tot * 100) + '%)')}/>`;
      a0 = a1 + .02;
    });
    return `<svg class="chart" viewBox="0 0 ${S} ${S}" style="max-width:${S}px" role="img" aria-label="${esc(o.label || 'Donut chart')}">${out}
      <text x="${cx}" y="${cx + 2}" text-anchor="middle" style="font-size:${S / 5.2}px;font-weight:700;fill:var(--ink)">${esc(o.center != null ? o.center : tot)}</text>
      <text x="${cx}" y="${cx + S / 8}" text-anchor="middle" class="ax" style="font-size:12px">${esc(o.sub || 'total')}</text></svg>`;
  }
  function legend(data) { return `<div class="legend">${data.map(d => `<span><i style="background:${d.color}"></i>${esc(d.label)} <b>${d.value}</b></span>`).join('')}</div>`; }

  function hbars(rows, o = {}) {
    const max = o.max || Math.max(1, ...rows.map(r => r.value));
    return `<div class="list" style="gap:12px">${rows.map(r => `<div ${tip(r.tip || r.label + ': ' + r.value)}>
      <div class="row" style="justify-content:space-between;margin-bottom:5px"><span style="font-weight:600;font-size:14px;display:inline-flex;align-items:center;gap:8px">${r.icon || ''}${esc(r.label)}</span><span class="mono" style="color:var(--mut)">${esc(r.text != null ? r.text : r.value)}</span></div>
      <div class="bar${o.track ? ' ' + o.track : ''}"><i style="width:${Math.max(r.value ? 2 : 0, r.value / max * 100)}%;background:${r.color || 'var(--slate)'}"></i></div>${r.sub ? `<div style="font-size:12px;color:var(--mut);margin-top:3px">${esc(r.sub)}</div>` : ''}</div>`).join('')}</div>`;
  }
  function stack(parts, o = {}) {
    const tot = parts.reduce((a, p) => a + p.value, 0) || 1;
    return `<div style="display:flex;height:${o.h || 16}px;border-radius:99px;overflow:hidden;background:var(--card-2);gap:2px">${parts.filter(p => p.value > 0).map(p => `<i ${tip(p.label + ': ' + p.value + ' (' + Math.round(p.value / tot * 100) + '%)')} style="flex:${p.value};background:${p.color};display:block"></i>`).join('')}</div>`;
  }
  function spark(v, o = {}) {
    const w = o.w || 120, h = o.h || 44, mx = Math.max(1, ...v), n = v.length;
    if (n < 2) return '';
    const pts = v.map((y, i) => [i / (n - 1) * w, h - 4 - y / mx * (h - 10)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    const c = o.color || 'var(--blue)';
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="spark" aria-hidden="true"><path d="${d}L${w},${h}L0,${h}Z" style="fill:${c};opacity:.12"/><path d="${d}" fill="none" style="stroke:${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function line(series, labels, o = {}) {
    const W = o.w || 640, H = o.h || 220, L = 38, B = 28, T = 10, R = 10, n = labels.length;
    const mx = Math.max(1, ...series.flatMap(s => s.values)); const nice = Math.ceil(mx / 4) * 4 || 4;
    const X = i => L + i / Math.max(1, n - 1) * (W - L - R), Y = v => T + (1 - v / nice) * (H - T - B);
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = nice / 4 * i, y = Y(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="axl"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" class="ax">${f(v)}</text>`; }
    labels.forEach((l, i) => { if (i % Math.ceil(n / 8) === 0) g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="ax">${esc(l)}</text>`; });
    series.forEach(s => {
      const pts = s.values.map((v, i) => [X(i), Y(v)]), d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
      if (s.area) g += `<path d="${d}L${X(n - 1)},${Y(0)}L${X(0)},${Y(0)}Z" style="fill:${s.color};opacity:.1"/>`;
      g += `<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
      pts.forEach((p, i) => g += `<circle cx="${p[0]}" cy="${p[1]}" r="9" fill="transparent" ${tip(s.name + ' · ' + labels[i] + ': ' + s.values[i])}/>`);
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || 'Trend')}">${g}</svg>`;
  }
  const lg = v => Math.log10(Math.max(v, 1e-6));
  function bubble(sigs, o = {}) { // x = cases, y = PRR (log/log) with Evans region shaded
    const W = o.w || 680, H = o.h || 360, L = 52, B = 40, T = 14, R = 16;
    const xs = [1, 2, 3, 5, 10, 20, 30, 50], ys = [.5, 1, 2, 5, 10, 20, 40];
    const x0 = lg(1), x1 = lg(60), y0 = lg(.4), y1 = lg(60);
    const X = v => L + (lg(v) - x0) / (x1 - x0) * (W - L - R), Y = v => T + (1 - (lg(v) - y0) / (y1 - y0)) * (H - T - B);
    let g = `<rect x="${X(3)}" y="${Y(60)}" width="${W - R - X(3)}" height="${Y(2) - Y(60)}" style="fill:var(--bad);opacity:.06" rx="10"/>`;
    xs.forEach(v => g += `<line x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${H - B}" class="axl"/><text x="${X(v)}" y="${H - B + 18}" text-anchor="middle" class="ax">${v}</text>`);
    ys.forEach(v => g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="axl"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" class="ax">${v}</text>`);
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(2)}" y2="${Y(2)}" style="stroke:var(--bad)" stroke-dasharray="5 4" stroke-width="1.6"/><line x1="${X(3)}" x2="${X(3)}" y1="${T}" y2="${H - B}" style="stroke:var(--bad)" stroke-dasharray="5 4" stroke-width="1.6"/>`;
    g += `<text x="${W - R - 6}" y="${Y(2) - 8}" text-anchor="end" style="font-size:12px;font-weight:700;fill:var(--bad-ink);paint-order:stroke;stroke:var(--card);stroke-width:4px;stroke-linejoin:round">Evans signal zone · PRR ≥ 2, cases ≥ 3, χ² ≥ 4</text>`;
    g += `<text x="${(L + W) / 2}" y="${H - 4}" text-anchor="middle" class="ax">Number of cases (log scale)</text><text transform="translate(12 ${H / 2}) rotate(-90)" text-anchor="middle" class="ax">PRR (log scale)</text>`;
    sigs.slice().sort((a, b) => b.chi2 - a.chi2).forEach(s => {
      const r = Math.max(5, Math.min(26, Math.sqrt(s.chi2) * 1.7)), col = o.color ? o.color(s) : s.is_signal ? 'var(--bad)' : 'var(--c-una)';
      g += `<a href="${o.href ? o.href(s) : '#'}"><circle cx="${X(Math.max(1, s.a))}" cy="${Y(Math.max(.4, s.prr))}" r="${r}" style="fill:${col};opacity:${s.is_signal ? .78 : .35};stroke:var(--card)" stroke-width="2" ${tip(s.drug + ' + ' + s.event + '\nCases ' + s.a + ' · PRR ' + s.prr + ' · χ² ' + s.chi2)}/></a>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Signal map: cases versus PRR">${g}</svg>`;
  }
  function heat(drugs, events, cell, o = {}) {
    const cw = 60, ch = 40, L = 96, T = 92, W = L + events.length * cw + 6, H = T + drugs.length * ch + 6;
    let g = '';
    events.forEach((e, j) => g += `<text transform="translate(${L + j * cw + cw / 2} ${T - 8}) rotate(-38)" class="ax" style="font-size:11.5px">${esc(e.length > 16 ? e.slice(0, 15) + '…' : e)}</text>`);
    drugs.forEach((d, i) => {
      g += `<text x="${L - 10}" y="${T + i * ch + ch / 2 + 4}" text-anchor="end" style="font-size:12.5px;font-weight:600;fill:var(--ink)">${esc(d)}</text>`;
      events.forEach((e, j) => {
        const c = cell(d, e), x = L + j * cw, y = T + i * ch;
        if (!c) { g += `<rect x="${x + 2}" y="${y + 2}" width="${cw - 4}" height="${ch - 4}" rx="9" style="fill:var(--card-2)"/>`; return; }
        const t = Math.min(1, Math.log10(Math.max(c.prr, 1)) / 1.55), col = c.is_signal ? `rgba(207,34,46,${.25 + .75 * t})` : `rgba(122,131,148,${.12 + .25 * Math.min(1, c.prr / 2)})`;
        g += `<a href="${o.href ? o.href(c) : '#'}"><rect x="${x + 2}" y="${y + 2}" width="${cw - 4}" height="${ch - 4}" rx="9" style="fill:${col}${c.is_signal ? ';stroke:var(--bad)' : ''}" stroke-width="${c.is_signal ? 1.5 : 0}" ${tip(c.drug + ' + ' + c.event + '\nCases ' + c.a + ' · PRR ' + c.prr + (c.is_signal ? ' · SIGNAL' : ''))}/><text x="${x + cw / 2}" y="${y + ch / 2 + 4}" text-anchor="middle" style="font-size:11.5px;font-weight:650;fill:${c.is_signal && t > .55 ? '#fff' : 'var(--ink)'};pointer-events:none">${c.a}</text></a>`;
      });
    });
    return `<div class="scroll"><svg class="chart" style="min-width:${W}px" viewBox="0 0 ${W} ${H}" role="img" aria-label="Drug by event heat map, numbers are case counts">${g}</svg></div>`;
  }
  function forest(rows, o = {}) {
    const W = 560, rh = 38, L = 168, R = 70, T = 8, B = 34, H = T + rows.length * rh + B;
    const lo = lg(Math.min(.5, ...rows.map(r => r.lo)) * .8), hi = lg(Math.max(4, ...rows.map(r => r.hi)) * 1.2);
    const X = v => L + (lg(v) - lo) / (hi - lo) * (W - L - R);
    let g = '';
    [.5, 1, 2, 5, 10, 20, 50, 100].filter(v => lg(v) >= lo && lg(v) <= hi).forEach(v => g += `<line x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${H - B}" class="axl"/><text x="${X(v)}" y="${H - 12}" text-anchor="middle" class="ax">${v}</text>`);
    g += `<line x1="${X(1)}" x2="${X(1)}" y1="${T}" y2="${H - B}" style="stroke:var(--ink)" stroke-width="1.6"/>`;
    rows.forEach((r, i) => {
      const y = T + i * rh + rh / 2, c = r.color || 'var(--blue)';
      g += `<text x="${L - 12}" y="${y + 4}" text-anchor="end" style="font-size:12.5px;font-weight:600;fill:var(--ink)">${esc(r.label)}</text>
        <line x1="${X(r.lo)}" x2="${X(r.hi)}" y1="${y}" y2="${y}" style="stroke:${c}" stroke-width="3" stroke-linecap="round"/>
        <rect x="${X(r.est) - 6}" y="${y - 6}" width="12" height="12" rx="3" style="fill:${c}" ${tip(r.label + '\nRatio ' + r.est + '\n95% CI ' + r.lo + ' – ' + r.hi)}/>
        <text x="${W - R + 8}" y="${y + 4}" class="ax" style="font-size:11.5px">${f(r.est, 1)}</text>`;
    });
    g += `<text x="${X(1)}" y="${H - 0}" text-anchor="middle" class="ax">no association = 1</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || 'Forest plot of ratios with 95% confidence intervals')}">${g}</svg>`;
  }
  function table2x2(s) {
    const cells = [['a', 'Drug + event', s.a, 'var(--blue)'], ['b', 'Drug, other events', s.b, 'var(--c-una)'], ['c', 'Other drugs + event', s.c, 'var(--violet)'], ['d', 'Everything else', s.d, 'var(--c-una)']];
    const mx = Math.max(s.a, s.b, s.c, s.d);
    return `<div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:6px;font-size:12px;color:var(--mut);align-items:center">
      <span></span><b style="text-align:center">Event of interest</b><b style="text-align:center">Other events</b>
      <b style="writing-mode:vertical-rl;transform:rotate(180deg);text-align:center">This drug</b>${[0, 1].map(i => cellH(cells[i], mx)).join('')}
      <b style="writing-mode:vertical-rl;transform:rotate(180deg);text-align:center">Other drugs</b>${[2, 3].map(i => cellH(cells[i], mx)).join('')}</div>`;
    function cellH(c, m) {
      const sz = 20 + Math.sqrt(c[2] / m) * 62;
      return `<div ${tip(c[1] + ': ' + c[2])} style="background:var(--card-2);border-radius:16px;min-height:112px;display:grid;place-items:center;position:relative"><i style="width:${sz}px;height:${sz}px;border-radius:50%;background:${c[3]};opacity:${c[0] === 'a' || c[0] === 'c' ? .85 : .35};display:block"></i><span style="position:absolute;left:10px;top:8px;font-weight:700;color:var(--ink-2)">${c[0].toUpperCase()}</span><b style="position:absolute;bottom:8px;right:12px;color:var(--ink);font-size:15px" class="mono">${f(c[2])}</b></div>`;
    }
  }
  function hist(vals, o = {}) {
    if (!vals.length) return '<div class="empty">No verified onset times</div>';
    const mn = Math.min(...vals), mx = Math.max(...vals), nb = Math.max(1, Math.min(o.bins || 7, mx - mn + 1)), w = (mx - mn + 1) / nb || 1;
    const bins = Array.from({ length: nb }, (_, i) => ({ lo: Math.round(mn + i * w), hi: Math.round(mn + (i + 1) * w - 1), n: 0 }));
    vals.forEach(v => bins[Math.min(nb - 1, Math.floor((v - mn) / w))].n++);
    const W = 520, H = 190, L = 28, B = 30, T = 12, m = Math.max(...bins.map(b => b.n)), bw = (W - L) / nb;
    let g = '';
    [0, .5, 1].forEach(t => { const y = T + (1 - t) * (H - T - B); g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" class="axl"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" class="ax">${Math.round(m * t)}</text>`; });
    bins.forEach((b, i) => { const h = b.n / m * (H - T - B), x = L + i * bw + 4; g += `<rect x="${x}" y="${H - B - h}" width="${bw - 8}" height="${h}" rx="7" style="fill:${o.color || 'var(--blue)'}" ${tip(b.lo + '–' + b.hi + ' days: ' + b.n + ' cases')}/><text x="${x + (bw - 8) / 2}" y="${H - 10}" text-anchor="middle" class="ax">${b.lo}–${b.hi}</text>`; });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Histogram of days from drug start to onset">${g}</svg>`;
  }
  function meter(v, o) { // value 0..1 with threshold marker
    const m = o.mark;
    return `<div style="margin:2px 0 14px" ${tip(o.tip || '')}><div class="row" style="justify-content:space-between;font-size:13px;margin-bottom:6px"><span style="font-weight:600">${esc(o.label)}</span><span class="mono">${o.right != null ? o.right : Math.round(v * 100) + '%'}${m != null && o.right == null ? ` <span style="color:var(--mut)">/ rule ${o.dir || '≥'} ${Math.round(m * 100)}%</span>` : ''}${o.right != null ? ` <span style="color:var(--mut)">${o.note || ''}</span>` : ''}</span></div>
      <div class="bar" style="position:relative;overflow:visible"><i style="width:${Math.min(100, v * 100)}%;background:${o.color || 'var(--blue)'}"></i>${m != null ? `<b style="position:absolute;left:${m * 100}%;top:-5px;bottom:-5px;width:3px;background:var(--ink);border-radius:2px"></b>` : ''}</div></div>`;
  }
  function ring(p, o = {}) {
    const S = o.size || 120, r = S / 2 - 10, c = 2 * Math.PI * r;
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(o.label || 'progress')} ${Math.round(p * 100)}%"><circle cx="${S / 2}" cy="${S / 2}" r="${r}" fill="none" style="stroke:var(--card-2)" stroke-width="12"/><circle cx="${S / 2}" cy="${S / 2}" r="${r}" fill="none" style="stroke:${o.color || 'var(--blue)'}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 ${S / 2} ${S / 2})"/><text x="${S / 2}" y="${S / 2 + 6}" text-anchor="middle" style="font-size:${S / 4.4}px;font-weight:700;fill:var(--ink)">${Math.round(p * 100)}%</text></svg>`;
  }
  function criteriaDots(c, size = 11) {
    return `<span style="display:inline-flex;gap:4px" aria-label="criteria met">${['identifiable_patient', 'identifiable_reporter', 'suspect_product', 'adverse_event'].map(k => `<i class="dot" style="width:${size}px;height:${size}px;background:${c[k] ? 'var(--ok)' : 'var(--line)'}" ${tip((k.replace(/_/g, ' ')) + ': ' + (c[k] ? 'present' : 'absent'))}></i>`).join('')}</span>`;
  }
  /* patient timeline: day 0 (drug start) → onset → dechallenge/recovery → rechallenge */
  function patientTimeline(facts) {
    const on = facts.time_to_onset.status === 'verified' ? facts.time_to_onset.value : null;
    const W = 640, H = 150, L = 50, R = 50, y = 78;
    const ev = [{ d: 0, label: 'Drug started', sub: 'Day 0', c: 'var(--slate)' }];
    if (on != null) ev.push({ d: on, label: 'Event onset', sub: `Day ${on}`, c: 'var(--bad)' });
    let rec = null; const dq = facts.dechallenge.quote || '', m = /(\d+)\s*(week|day)/i.exec(dq);
    if (facts.dechallenge.value === 'positive' && on != null) { rec = m ? on + (m[2].toLowerCase().startsWith('w') ? +m[1] * 7 : +m[1]) : on + 10; ev.push({ d: on + 2, label: 'Drug stopped', sub: 'dechallenge', c: 'var(--slate)' }); ev.push({ d: rec, label: m ? 'Recovered' : 'Improved', sub: m ? `+${m[1]} ${m[2]}s` : 'timing not stated', c: 'var(--ok)' }); }
    if (facts.rechallenge.value === 'positive' && rec != null) ev.push({ d: rec + 10, label: 'Rechallenge', sub: 'event recurred', c: 'var(--bad)' });
    if (facts.dechallenge.value === 'not_done') ev.push({ d: (on || 0) + 6, label: 'Drug continued', sub: 'no dechallenge', c: 'var(--c-una)' });
    const mx = Math.max(10, ...ev.map(e => e.d)) * 1.05, X = d => L + d / mx * (W - L - R);
    let g = `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" style="stroke:var(--line)" stroke-width="5" stroke-linecap="round"/>`;
    if (on != null) g += `<line x1="${X(0)}" x2="${X(on)}" y1="${y}" y2="${y}" style="stroke:var(--blue)" stroke-width="5" stroke-linecap="round" opacity=".5"/>`;
    ev.sort((a, b) => a.d - b.d).forEach((e, i) => { const up = i % 2 === 0; g += `<circle cx="${X(e.d)}" cy="${y}" r="9" style="fill:${e.c};stroke:var(--card)" stroke-width="3"/><text x="${X(e.d)}" y="${up ? y - 22 : y + 32}" text-anchor="middle" style="font-size:12px;font-weight:650;fill:var(--ink)">${e.label}</text><text x="${X(e.d)}" y="${up ? y - 8 : y + 46}" text-anchor="middle" class="ax">${e.sub}</text>`; });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Case timeline built from verified facts">${g}</svg>`;
  }
  function tipInit() {
    let t = null;
    document.addEventListener('mouseover', e => {
      const el = e.target.closest && e.target.closest('[data-tip]'); if (!el) return;
      if (!t) { t = document.createElement('div'); t.className = 'tip'; document.body.appendChild(t); }
      t.textContent = el.getAttribute('data-tip'); t.style.whiteSpace = 'pre-line'; t.style.display = 'block';
    });
    document.addEventListener('mousemove', e => { if (t && t.style.display === 'block') { t.style.left = Math.min(innerWidth - 270, e.clientX + 14) + 'px'; t.style.top = (e.clientY + 16) + 'px'; } });
    document.addEventListener('mouseout', e => { if (t && e.target.closest && e.target.closest('[data-tip]')) t.style.display = 'none'; });
  }
  root.Charts = { esc, f, CAT, OUT, tip, donut, legend, hbars, stack, spark, line, bubble, heat, forest, table2x2, hist, meter, ring, criteriaDots, patientTimeline, tipInit };
})(window);
