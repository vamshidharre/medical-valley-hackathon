/* Atheria engine — deterministic logic ported 1:1 from the original Python code.
   stats.py, rules.py, guardrails.py, validity.py, store.py (hash chain).
   Pure functions, no network, no randomness. */
(function (root) {
  'use strict';

  /* ---------- SHA-256 (sync, UTF-8) ---------- */
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  function utf8(s) { return new TextEncoder().encode(s); }
  function sha256(str) {
    const msg = utf8(str), l = msg.length, bits = l * 8;
    const n = (((l + 9 + 63) >> 6) << 6), buf = new Uint8Array(n);
    buf.set(msg); buf[l] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(n - 8, Math.floor(bits / 4294967296)); dv.setUint32(n - 4, bits >>> 0);
    let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    const w = new Uint32Array(64);
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i-15], b = w[i-2];
        const s0 = ((a>>>7)|(a<<25)) ^ ((a>>>18)|(a<<14)) ^ (a>>>3);
        const s1 = ((b>>>17)|(b<<15)) ^ ((b>>>19)|(b<<13)) ^ (b>>>10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
      }
      let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = ((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10));
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;
    }
    return [h0,h1,h2,h3,h4,h5,h6,h7].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }

  /* ---------- canonical JSON + hash chain (store.py) ---------- */
  function canonical(o) {
    if (o === null || typeof o !== 'object') return JSON.stringify(o);
    if (Array.isArray(o)) return '[' + o.map(canonical).join(',') + ']';
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  const GENESIS = '0'.repeat(64);
  // payload may be the raw canonical string (exact bytes the original Python hashed) or an object
  const eventHash = (prev, ts, type, actor, payload) => {
    const ps = typeof payload === 'string' ? payload : canonical(payload);
    return sha256(prev + '{"actor":' + JSON.stringify(actor) + ',"payload":' + ps + ',"ts":' + JSON.stringify(ts) + ',"type":' + JSON.stringify(type) + '}');
  };
  function verifyChain(events) {
    let prev = GENESIS;
    for (const e of events) {
      if (e.prev_hash !== prev || eventHash(prev, e.ts, e.type, e.actor, e.ps || e.payload) !== e.hash)
        return { valid: false, events: events.length, broken_at_seq: e.seq };
      prev = e.hash;
    }
    return { valid: true, events: events.length, head: prev };
  }

  /* ---------- statistics (stats.py) ---------- */
  const EVANS = { prr_min: 2.0, chi2_min: 4.0, a_min: 3 };
  const r4 = x => Math.round(x * 1e4) / 1e4;
  function computePair(drug, event, a, b, c, d) {
    const z = Math.min(a, b, c, d) > 0;
    const [aa, bb, cc, dd] = z ? [a, b, c, d] : [a + .5, b + .5, c + .5, d + .5];
    const prr = (aa / (aa + bb)) / (cc / (cc + dd));
    const ror = (aa * dd) / (bb * cc);
    const se = Math.sqrt(1 / aa + 1 / bb + 1 / cc + 1 / dd);
    const lo = Math.exp(Math.log(ror) - 1.96 * se), hi = Math.exp(Math.log(ror) + 1.96 * se);
    const n = a + b + c + d, den = (a + b) * (c + d) * (a + c) * (b + d);
    const chi2 = den === 0 ? 0 : n * Math.pow(Math.max(0, Math.abs(a * d - b * c) - n / 2), 2) / den;
    const is_signal = prr >= EVANS.prr_min && chi2 >= EVANS.chi2_min && a >= EVANS.a_min;
    return { signal_id: drug + '__' + event, drug, event, a, b, c, d, prr: r4(prr), ror: r4(ror), ror_lo: r4(lo), ror_hi: r4(hi), chi2: r4(chi2), is_signal };
  }
  function computeAll(rows) { // rows: {drug,event}
    const n = rows.length, pair = new Map(), dn = new Map(), en = new Map();
    for (const r of rows) {
      const k = r.drug + '\u0000' + r.event;
      pair.set(k, (pair.get(k) || 0) + 1); dn.set(r.drug, (dn.get(r.drug) || 0) + 1); en.set(r.event, (en.get(r.event) || 0) + 1);
    }
    const out = [];
    for (const [k, a] of pair) {
      const [drug, event] = k.split('\u0000');
      const b = dn.get(drug) - a, c = en.get(event) - a;
      out.push(computePair(drug, event, a, b, c, n - a - b - c));
    }
    return out.sort((x, y) => y.prr - x.prr || (x.signal_id < y.signal_id ? -1 : 1));
  }

  /* ---------- rules (rules.py) ---------- */
  const CAUSALITY = { ruleset: 'cau_001', version: '1.1.0' };
  const RECOMMEND = { ruleset: 'rec_001', version: '1.0.0' };
  const CATEGORIES = ['Certain', 'Probable', 'Possible', 'Unlikely', 'Unassessable'];
  const REC_T = { max_unassessable_share: 0.5, min_supportive_share: 0.5, min_unlikely_share: 0.5 };
  function assessCausality(f) {
    let temporal = (f.temporal_relationship || {}).value || 'unknown';
    const onset = f.time_to_onset || {};
    let derived = '';
    if (temporal === 'unknown' && onset.status === 'verified' && Number.isInteger(onset.value) && onset.value >= 0) {
      temporal = 'plausible'; derived = ` (derived from verified onset of ${onset.value} days)`;
    }
    const dech = (f.dechallenge || {}).value || 'unknown', rech = (f.rechallenge || {}).value || 'unknown';
    const nAlt = (f.alternative_causes || []).length;
    const basis = `temporal=${temporal}${derived}, dechallenge=${dech}, rechallenge=${rech}, verified alternative causes=${nAlt}`;
    let rid, cat, why;
    if (temporal === 'implausible') [rid, cat, why] = ['CAU-01', 'Unlikely', 'The time relationship to the drug is implausible.'];
    else if (temporal === 'unknown') [rid, cat, why] = ['CAU-02', 'Unassessable', 'The time relationship could not be established from verified evidence; we do not guess.'];
    else if (nAlt >= 2 && dech !== 'positive') [rid, cat, why] = ['CAU-03', 'Unlikely', 'Two or more verified alternative causes and no positive dechallenge.'];
    else if (nAlt >= 1) [rid, cat, why] = ['CAU-04', 'Possible', 'Plausible timing, but a verified alternative cause could explain the event.'];
    else if (dech === 'positive' && rech === 'positive') [rid, cat, why] = ['CAU-05', 'Certain', 'Plausible timing, positive dechallenge and positive rechallenge, no alternative cause.'];
    else if (dech === 'positive') [rid, cat, why] = ['CAU-06', 'Probable', 'Plausible timing and positive dechallenge, no alternative cause.'];
    else [rid, cat, why] = ['CAU-07', 'Possible', 'Plausible timing, no alternative cause, but dechallenge not positive or not reported.'];
    return { category: cat, rule_id: rid, ruleset: CAUSALITY.ruleset, version: CAUSALITY.version, explanation: `${why} Facts: ${basis}.`, facts_used: { temporal, dech, rech, nAlt, derived: !!derived } };
  }
  function recommend(stats, cats) {
    const dist = {}; CATEGORIES.forEach(c => dist[c] = 0); cats.forEach(c => dist[c]++);
    const n = cats.length, assessable = n - dist.Unassessable;
    const un = n ? dist.Unassessable / n : 1;
    const sup = assessable ? (dist.Certain + dist.Probable) / assessable : 0;
    const unl = assessable ? dist.Unlikely / assessable : 0;
    let rid, rec;
    if (n === 0 || un > REC_T.max_unassessable_share) [rid, rec] = ['REC-01', 'Insufficient information – request follow-up'];
    else if (stats.is_signal && sup >= REC_T.min_supportive_share) [rid, rec] = ['REC-02', 'Validated – escalate to Safety Review Committee'];
    else if (unl >= REC_T.min_unlikely_share) [rid, rec] = ['REC-03', 'Not confirmed – confounded, continue monitoring'];
    else [rid, rec] = ['REC-04', 'Inconclusive – continue monitoring and request follow-up'];
    const r3 = x => Math.round(x * 1000) / 1000;
    return { recommendation: rec, rule_id: rid, ruleset: RECOMMEND.ruleset, version: RECOMMEND.version, thresholds: REC_T,
      inputs: { n_cases: n, distribution: dist, unassessable_share: r3(un), supportive_share: r3(sup), unlikely_share: r3(unl), is_signal: !!stats.is_signal, prr: stats.prr } };
  }

  /* ---------- guardrails (guardrails.py) ---------- */
  const QMAP = { '‘': "'", '’': "'", '“': '"', '”': '"' };
  function normMap(text) {
    const out = [], idx = []; let prevSpace = true;
    for (let i = 0; i < text.length; i++) {
      let ch = QMAP[text[i]] || text[i];
      if (/\s/.test(ch)) { if (!prevSpace) { out.push(' '); idx.push(i); } prevSpace = true; }
      else { out.push(ch.toLowerCase()); idx.push(i); prevSpace = false; }
    }
    if (out.length && out[out.length - 1] === ' ') { out.pop(); idx.pop(); }
    return [out.join(''), idx];
  }
  function locateQuote(quote, source) {
    if (!quote) return null;
    const [q] = normMap(quote.trim().replace(/^"+|"+$/g, '').trim());
    if (q.length < 3) return null;
    const [s, idx] = normMap(source), pos = s.indexOf(q);
    if (pos < 0) return null;
    return [idx[pos], idx[pos + q.length - 1] + 1];
  }
  const NEG = /\b(negative|denied|denies|no|not|none|without|unremarkable|ruled out|excluded|absent)\b/i;
  const isNegated = q => NEG.test(q);

  function verifyExtraction(ext, narrative) {
    const facts = {}; let verified = 0, rejected = 0;
    function single(name, value, quote, unk) {
      if (value === null || value === undefined || value === 'unknown') { facts[name] = { value: unk, status: 'unknown', quote: null, span: null }; return; }
      const span = locateQuote(quote, narrative);
      if (span) { verified++; facts[name] = { value, status: 'verified', quote: narrative.slice(span[0], span[1]), span }; }
      else { rejected++; facts[name] = { value: unk, status: 'unverified', quote: null, span: null, rejected_value: value, rejected_quote: quote }; }
    }
    const g = (o, k) => (o && o[k]) || {};
    single('time_to_onset', g(ext, 'time_to_onset').days, g(ext, 'time_to_onset').quote, null);
    single('temporal_relationship', g(ext, 'temporal_relationship').value, g(ext, 'temporal_relationship').quote, 'unknown');
    single('dechallenge', g(ext, 'dechallenge').value, g(ext, 'dechallenge').quote, 'unknown');
    single('rechallenge', g(ext, 'rechallenge').value, g(ext, 'rechallenge').quote, 'unknown');
    const alts = [], rejAlts = [], excluded = [];
    const items = [...(ext.alternative_causes || []).map(a => [a, false]), ...(ext.excluded_causes || []).map(a => [a, true])];
    for (const [alt, isEx] of items) {
      if (!alt || !alt.cause || !alt.quote) { rejected++; rejAlts.push({ cause: String(alt && alt.cause), status: 'unverified', rejected_quote: alt && alt.quote }); continue; }
      const span = locateQuote(alt.quote, narrative);
      if (!span) { rejected++; rejAlts.push({ cause: alt.cause, status: 'unverified', rejected_quote: alt.quote }); continue; }
      verified++;
      const item = { cause: alt.cause, status: 'verified', quote: narrative.slice(span[0], span[1]), span };
      if (isEx) excluded.push(item);
      else if (isNegated(item.quote)) excluded.push({ ...item, reclassified_by: 'negation_guardrail' });
      else alts.push(item);
    }
    facts.alternative_causes = alts; facts.excluded_causes = excluded; facts.rejected_alternative_causes = rejAlts;
    facts.data_gaps = (ext.data_gaps || []).slice();
    return { facts, guardrail: { schema_valid: true, quotes_verified: verified, quotes_rejected: rejected } };
  }
  const CASE_RE = /R-\d{5}/g;
  function checkSummaryCitations(text, valid) {
    const cited = [...new Set(text.match(CASE_RE) || [])].sort();
    return { cited, valid: cited.filter(c => valid.has(c)), invalid: cited.filter(c => !valid.has(c)) };
  }

  /* ---------- ICSR validity (validity.py, val_001 v1.0.0) ---------- */
  const VAL = { id: 'val_001', version: '1.0.0' };
  const CRITERIA = ['identifiable_patient', 'identifiable_reporter', 'suspect_product', 'adverse_event'];
  const CORE = ['suspect_product', 'adverse_event'];
  const human = n => { const p = n.map(x => x.replace(/_/g, ' ')); return p.length === 1 ? p[0] : p.slice(0, -1).join(', ') + ' and ' + p[p.length - 1]; };
  function evaluateValidity(el) { // el: {criterion:{present, quote}}
    const present = {}; CRITERIA.forEach(c => present[c] = !!(el[c] && el[c].present));
    const missing = CRITERIA.filter(c => !present[c]), missingCore = CORE.filter(c => !present[c]);
    const prov = {};
    CRITERIA.forEach(c => {
      const e = el[c] || {};
      if (e.present && e.quote) prov[c] = `present — evidence: '${e.quote.length > 80 ? e.quote.slice(0, 77) + '...' : e.quote}'`;
      else if (e.present) prov[c] = 'present — asserted without an evidence span';
      else prov[c] = 'ABSENT — not found in the source text';
    });
    let outcome, fired, expl;
    if (!missing.length) { outcome = 'valid_icsr'; fired = 'val_001_all_criteria_present'; expl = `VALID ICSR. Rule ${VAL.id} v${VAL.version}. All four minimum criteria are present: identifiable patient, identifiable reporter, suspect product, and adverse event.`; }
    else if (missingCore.length) { outcome = 'non_icsr'; fired = 'val_001_missing_core_element'; expl = `NON-ICSR. Rule ${VAL.id} v${VAL.version}. Missing core element(s): ${human(missingCore)}. Without both a suspect product and an adverse event there is no reportable safety signal.`; }
    else { outcome = 'potential_icsr'; fired = 'val_001_incomplete_escalate'; expl = `POTENTIAL ICSR. Rule ${VAL.id} v${VAL.version}. A suspect product and an adverse event are both present, but ${human(missing)} could not be established from the source. We do not guess — escalating for human review and follow-up rather than asserting or discarding validity.`; }
    return { outcome, trace: { rule_id: VAL.id, rule_set_version: VAL.version, inputs: present, input_provenance: prov, fired_rules: [fired], explanation: expl, outcome } };
  }

  /* ---------- Offline source reader ----------
     Stand-in for the Bedrock model in this static build: regex reader that only reports
     what the text says, with verbatim quotes. The decision still belongs to val_001. */
  const PRODUCTS = ['Atherex','Hepatrix','Dormyl','Cardiolin','Nexamab','Zelvora','Plaxitin','Oruvane','Tamlesta','paracetamol','acetaminophen','amoxicillin','ibuprofen','aspirin','methotrexate','amiodarone','isoniazid','valproate','valproic acid','carbamazepine','allopurinol','lamotrigine','nitrofurantoin','diclofenac','naproxen','metformin','atorvastatin','warfarin','clozapine','tamoxifen','flucloxacillin','rifampicin','ketoconazole','phenytoin','sulfasalazine'];
  const PRODUCT_RE = new RegExp('\\b(' + PRODUCTS.join('|') + ')\\b', 'i');
  const SUFFIX_RE = /\b[A-Za-z]{4,}(mab|nib|vir|pril|sartan|statin|azole|cillin|mycin|oxacin|prazole|olol|zepam|tidine|fenac|profen|platin|tinib|ciclib|parin|gliptin|gliflozin|setron)\b/i;
  const DOSE_RE = /\b([A-Z][a-z]{3,}\w*)\s+\d+(\.\d+)?\s?(mg|mcg|g|ml|iu)\b/;
  const AE_RE = /\b(rash|itch\w*|prurit\w+|bleeding|h(a)?emorrhag\w+|jaundice|hepatitis|liver (injury|damage|failure)|hepatotoxicity|nausea|vomiting|headache|dizziness|fatigue|anaphyla\w+|angioedema|pancreatitis|QT prolong\w+|syncope|seizure\w*|swelling|dyspn\w+|fever|necrolysis|stevens-johnson syndrome|kidney injury|renal failure|hyponat\w+|hospitali[sz]\w+|admitted|died|death|collapse|palpitations|rhabdomyolysis|thrombocytopeni\w+|neutropeni\w+|hepatic\w*|cholestasis|transaminases?)\b/i;
  const SERIOUS_RE = /\b(hospitali[sz]\w+|admitted|died|death|life[- ]threatening|disabil\w+|anaphyla\w+|stevens-johnson|necrolysis|liver failure|acute kidney injury|collapse)\b/i;
  function sentences(text) { const out = []; const re = /[^.!?\n]+[.!?]?/g; let m; while ((m = re.exec(text))) { const t = m[0]; if (t.trim()) out.push({ t, s: m.index }); } return out; }
  function firstMatch(text, res) { for (const re of res) { const m = re.exec(text); if (m) return { quote: m[0].trim(), start: m.index + m[0].indexOf(m[0].trim()) }; } return null; }
  function negatedAt(sentence, idx) { return /\b(no|not|never|without|denied|denies|neither|nor|none|n't)\b[^.]{0,40}$/i.test(sentence.slice(Math.max(0, idx - 45), idx)); }

  function readSource(text) {
    const el = {};
    const pat = firstMatch(text, [/\b\d{1,3}[- ]year[- ]old\b[^.,;\n]{0,30}/i, /\b(aged?|age:?)\s+\d{1,3}\b[^.,;\n]{0,20}/i, /\b\d{1,3}\s?(yo|y\/o)\b/i, /\bpatient[^.\n]{0,12}\b(initials|aged)\b[^.\n]{0,20}/i, /\bmy (patient|mother|father|son|daughter|husband|wife|wife's|friend)\b/i, /\bI (took|am taking|was taking|have been taking|developed|experienced|started|had)\b/, /\b[A-Z]\.[A-Z]\.(?=[\s,;.]|$)/, /\b(a|the) (\d{1,3}[- ]year[- ]old )?(woman|man|boy|girl|female|male|infant|child)\b/i, /\bPatient:[^\n]*\d[^\n]*/]);
    el.identifiable_patient = pat ? { present: true, quote: pat.quote, start: pat.start } : { present: false };
    const rep = firstMatch(text, [/\bAuthors?:[^\n]+/, /\b(Dr\.?|Doctor|Prof\.?)\s+[A-Z][\w.'-]+(\s+[A-Z][\w.'-]+)?/, /\bI am (a |an )?(physician|pharmacist|nurse|doctor|consumer|patient|dentist)\b/i, /\bmy name is\b[^.\n]{0,40}/i, /\bReporter:[^\n]*(physician|pharmacist|nurse|dentist|consumer|patient|doctor|lawyer)[^\n]*/i, /\bReporter:\s*[A-Z][^\n]{3,}/, /\bPharmacist report\b/i, /\bI (am writing|write|am reporting)\b[^.\n]{0,30}/i, /\bmy patient\b/i, /\bI (took|am taking|was taking|have been taking|developed|experienced)\b/]);
    el.identifiable_reporter = rep ? { present: true, quote: rep.quote, start: rep.start } : { present: false };
    let prod = null; const pm = PRODUCT_RE.exec(text) || SUFFIX_RE.exec(text) || DOSE_RE.exec(text);
    if (pm && !negatedAt(text, pm.index) ) prod = { quote: pm[0].trim(), start: pm.index };
    el.suspect_product = prod ? { present: true, quote: prod.quote, start: prod.start } : { present: false };
    let ae = null;
    for (const s of sentences(text)) {
      const re = new RegExp(AE_RE.source, 'ig'); let m;
      while ((m = re.exec(s.t))) {
        if (negatedAt(s.t, m.index)) continue;
        if (/^\s*(Event|Product|Reporter|Patient)/.test(s.t) && false) continue;
        const lead = s.t.length - s.t.trimStart().length;
        const q = s.t.trim().slice(0, 140);
        ae = { quote: q, start: s.s + lead }; break;
      }
      if (ae) break;
    }
    el.adverse_event = ae ? { present: true, quote: ae.quote, start: ae.start } : { present: false };
    for (const c of CRITERIA) if (el[c].present) { const sp = locateQuote(el[c].quote, text); if (sp) { el[c].start = sp[0]; el[c].end = sp[1]; } else el[c] = { present: false }; }
    const serious = SERIOUS_RE.test(text);
    return { elements: el, seriousness_signal: serious, products: prod ? [prod.quote] : [], ae_candidates: ae ? [ae.quote] : [] };
  }
  function priority(elements, serious) { const n = CRITERIA.filter(c => elements[c].present).length; return Math.round(Math.min(1, 0.15 + n * 0.12 + (serious ? 0.35 : 0)) * 100) / 100; }

  /* ---------- MedDRA auto-coder (explainable baseline, meddra_001 v1.0.0) ----------
     Maps free-text adverse-event descriptions to a MedDRA Preferred Term and System
     Organ Class by matching a small synonym dictionary (LLT-style phrases) against the
     source text. Deliberately simple and fully inspectable: every prediction carries
     the exact phrase(s) it matched, located back in the text, so "why" is never a black
     box. It only knows the 15 PTs seen in this demo dataset — a provided, labelled
     dataset is meant to replace or retrain this with real coverage and real ML. */
  const MEDDRA_VERSION = '1.0.0';
  const MEDDRA = {
    'Rash': { soc: 'Skin and subcutaneous tissue disorders', kw: ['itchy rash', 'rash', 'hives', 'skin eruption', 'red spots', 'itching'] },
    'Stevens-Johnson syndrome': { soc: 'Skin and subcutaneous tissue disorders', kw: ['stevens-johnson syndrome', 'stevens-johnson', 'toxic epidermal necrolysis', 'skin blistering', 'blistering skin', 'skin peeling'] },
    'Hepatotoxicity': { soc: 'Hepatobiliary disorders', kw: ['hepatotoxicity', 'jaundice', 'liver injury', 'liver damage', 'raised transaminases', 'yellowing of the eyes', 'dark urine', 'cholestasis', 'hepatitis'] },
    'Pancreatitis': { soc: 'Gastrointestinal disorders', kw: ['pancreatitis', 'pancreatic'] },
    'Nausea': { soc: 'Gastrointestinal disorders', kw: ['nausea', 'vomiting', 'feeling sick', 'queasy', 'nauseous'] },
    'Diarrhoea': { soc: 'Gastrointestinal disorders', kw: ['diarrhoea', 'diarrhea', 'loose stools'] },
    'Dizziness': { soc: 'Nervous system disorders', kw: ['dizziness', 'dizzy', 'light-headed', 'lightheaded'] },
    'Headache': { soc: 'Nervous system disorders', kw: ['headache', 'head pain', 'migraine'] },
    'Insomnia': { soc: 'Psychiatric disorders', kw: ['insomnia', 'trouble sleeping', 'could not sleep', 'difficulty sleeping', 'unable to sleep'] },
    'Fatigue': { soc: 'General disorders and administration site conditions', kw: ['fatigue', 'tiredness', 'no energy', 'exhausted', 'persistent tiredness'] },
    'Interstitial lung disease': { soc: 'Respiratory, thoracic and mediastinal disorders', kw: ['interstitial lung disease', 'dyspnoea', 'shortness of breath', 'pulmonary reaction', 'lung disease'] },
    'QT prolongation': { soc: 'Cardiac disorders', kw: ['qt prolongation', 'prolonged qt', 'qt interval', 'qtc'] },
    'Hyponatraemia': { soc: 'Metabolism and nutrition disorders', kw: ['hyponatraemia', 'hyponatremia', 'low sodium', 'low blood sodium'] },
    'Acute kidney injury': { soc: 'Renal and urinary disorders', kw: ['acute kidney injury', 'kidney injury', 'renal failure', 'kidney failure'] },
    'Arthralgia': { soc: 'Musculoskeletal and connective tissue disorders', kw: ['arthralgia', 'joint pain', 'aching joints'] }
  };
  function classifyMedDRA(text, topN = 3) {
    if (!text || !text.trim()) return { top: null, candidates: [] };
    const cands = [];
    for (const [pt, def] of Object.entries(MEDDRA)) {
      let score = 0; const matches = [];
      def.kw.forEach(kw => {
        const re = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        const m = re.exec(text);
        if (m) { score += 1; matches.push({ kw, quote: m[0] }); }
      });
      if (score > 0) cands.push({ pt, soc: def.soc, score, matches });
    }
    cands.sort((a, b) => b.score - a.score);
    const top = cands[0] ? { ...cands[0] } : null;
    if (top) {
      top.spans = top.matches.map(m => { const sp = locateQuote(m.quote, text); return sp ? { s: sp[0], e: sp[1], kw: m.kw, quote: m.quote } : null; }).filter(Boolean);
      top.confidence = Math.round(Math.min(0.97, 0.45 + top.score * 0.13) * 100) / 100;
    }
    return { top, candidates: cands.slice(0, topN).map(c => ({ pt: c.pt, soc: c.soc, score: c.score })) };
  }

  /* ---------- trained MedDRA ML coder ----------
     Runs window.MEDDRA_MODEL (TF-IDF 1-2 grams + multinomial logistic regression, trained
     offline on the symptomify/VAERS dataset) entirely client-side. Tokenisation here must
     match the Python training pipeline exactly: lowercase \w\w+ tokens, unigrams + adjacent
     bigrams, raw count × idf, no per-document normalisation — the same features the model
     was fit on, so nothing is approximated at inference time except that the shipped weight
     matrix itself is the one measured in the reported accuracy. */
  const ML_SOC = {
    'Product storage error': 'Injury, poisoning and procedural complications', 'Expired product administered': 'Injury, poisoning and procedural complications',
    'Product administered to patient of inappropriate age': 'Injury, poisoning and procedural complications', 'Inappropriate schedule of product administration': 'Injury, poisoning and procedural complications',
    'Interchange of vaccine products': 'Injury, poisoning and procedural complications', 'Incorrect dose administered': 'Injury, poisoning and procedural complications',
    'Extra dose administered': 'Injury, poisoning and procedural complications', 'Underdose': 'Injury, poisoning and procedural complications',
    'Wrong product administered': 'Injury, poisoning and procedural complications', 'Product preparation issue': 'Injury, poisoning and procedural complications',
    'Incomplete course of vaccination': 'Injury, poisoning and procedural complications', 'Poor quality product administered': 'Injury, poisoning and procedural complications',
    'Product dose omission issue': 'Injury, poisoning and procedural complications', 'Unevaluable event': 'General disorders and administration site conditions',
    'Herpes zoster': 'Infections and infestations', 'Pain in extremity': 'Musculoskeletal and connective tissue disorders',
    'Rash': 'Skin and subcutaneous tissue disorders', 'Dizziness': 'Nervous system disorders',
    'Urticaria': 'Skin and subcutaneous tissue disorders', 'Tinnitus': 'Ear and labyrinth disorders',
    'Headache': 'Nervous system disorders', 'Lymphadenopathy': 'Blood and lymphatic system disorders',
    'Death': 'General disorders and administration site conditions', 'Syncope': 'Nervous system disorders',
    'Injection site pain': 'General disorders and administration site conditions', 'Pyrexia': 'General disorders and administration site conditions',
    'Pruritus': 'Skin and subcutaneous tissue disorders', 'COVID-19': 'Infections and infestations',
    'Vaccination site pain': 'General disorders and administration site conditions', 'Fatigue': 'General disorders and administration site conditions',
    'Arthralgia': 'Musculoskeletal and connective tissue disorders', 'Hypoaesthesia': 'Nervous system disorders',
    'Pain': 'General disorders and administration site conditions', 'No adverse event': 'General disorders and administration site conditions',
    'Paraesthesia': 'Nervous system disorders', 'Malaise': 'General disorders and administration site conditions',
    'Vaccination complication': 'General disorders and administration site conditions', 'Myalgia': 'Musculoskeletal and connective tissue disorders',
    'Diarrhoea': 'Gastrointestinal disorders', 'Injection site rash': 'General disorders and administration site conditions'
  };
  const ML_TOKEN_RE = /\b\w\w+\b/g;
  function mlTokenize(text) {
    const toks = (text.toLowerCase().match(ML_TOKEN_RE)) || [];
    const grams = toks.slice();
    for (let i = 0; i < toks.length - 1; i++) grams.push(toks[i] + ' ' + toks[i + 1]);
    return grams;
  }
  let _mlVidx = null;
  function mlVocabIndex() {
    const M = root.MEDDRA_MODEL;
    if (!M) return null;
    if (_mlVidx && _mlVidx.M === M) return _mlVidx;
    const vidx = Object.create(null);
    M.terms.forEach((t, i) => { vidx[t] = i; });
    _mlVidx = { M, vidx };
    return _mlVidx;
  }
  function classifyMedDRA_ML(text, topN = 3) {
    const ix = mlVocabIndex();
    if (!ix) return { top: null, candidates: [], ready: false };
    if (!text || !text.trim()) return { top: null, candidates: [], ready: true };
    const { M, vidx } = ix;
    const counts = Object.create(null);
    mlTokenize(text).forEach(g => { if (vidx[g] != null) counts[g] = (counts[g] || 0) + 1; });
    const keys = Object.keys(counts);
    if (!keys.length) return { top: null, candidates: [], ready: true, reason: 'no_vocabulary_overlap' };
    const n = M.classes.length, scores = new Array(n);
    for (let ci = 0; ci < n; ci++) {
      let s = M.intercepts[ci]; const w = M.weights[ci];
      for (const g of keys) { const idx = vidx[g]; s += counts[g] * M.idf[idx] * w[idx]; }
      scores[ci] = s;
    }
    const mx = Math.max(...scores), exps = scores.map(s => Math.exp(s - mx)), sum = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / sum);
    const order = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
    const bestIdx = order[0], w = M.weights[bestIdx];
    const contributions = keys.map(g => { const idx = vidx[g]; return { term: g, contribution: Math.round(counts[g] * M.idf[idx] * w[idx] * 1000) / 1000 }; })
      .filter(c => c.contribution > 0).sort((a, b) => b.contribution - a.contribution);
    const evidence = Math.round(contributions.reduce((a, c) => a + c.contribution, 0) * 100) / 100;
    const tier = evidence < 15 ? 'weak' : evidence < 40 ? 'moderate' : 'strong';
    const spans = contributions.slice(0, 8).map(c => { const sp = locateQuote(c.term, text); return sp ? { s: sp[0], e: sp[1], kw: c.term, quote: text.slice(sp[0], sp[1]), contribution: c.contribution } : null; }).filter(Boolean);
    const pt = M.classes[bestIdx];
    const top = { pt, soc: ML_SOC[pt] || '—', confidence: Math.round(probs[bestIdx] * 1000) / 1000, evidence, tier, contributions: contributions.slice(0, 8), spans };
    const candidates = order.slice(0, topN).map(i => ({ pt: M.classes[i], soc: ML_SOC[M.classes[i]] || '—', confidence: Math.round(probs[i] * 1000) / 1000 }));
    return { top, candidates, ready: true };
  }

  root.Engine = { sha256, canonical, GENESIS, eventHash, verifyChain, EVANS, computePair, computeAll, CAUSALITY, RECOMMEND, CATEGORIES, REC_T,
    assessCausality, recommend, locateQuote, isNegated, verifyExtraction, checkSummaryCitations, VAL, CRITERIA, evaluateValidity, readSource, priority,
    MEDDRA, MEDDRA_VERSION, classifyMedDRA, classifyMedDRA_ML, ML_SOC, mlTokenize };
  if (typeof module !== 'undefined') module.exports = root.Engine;
})(typeof window !== 'undefined' ? window : globalThis);
