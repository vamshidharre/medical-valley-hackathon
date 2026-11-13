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
  // Drop any sample left over from an older build whose source text was deliberately
  // incomplete (placeholder "not captured" / "none identified" fields) — every
  // SafeReport AI sample is now a complete report, and a stale incomplete one
  // would just sit there and give Claude nothing real to find.
  A.inbox = A.inbox.filter(r => !(r.sample && /not captured|none identified/.test(r.text)));
  // Every fresh load starts the triage inbox clean: no record is pre-analysed,
  // pre-confirmed or still holding a previous live Claude result. Records
  // themselves (and anything already in the audit trail) are kept — only the
  // per-record AI/decision state resets, so "Enable AI" always starts from zero.
  A.inbox.forEach(r => {
    const fresh = E.readSource(r.text), v = E.evaluateValidity(fresh.elements);
    r.elements = fresh.elements; r.outcome = v.outcome; r.trace = v.trace;
    r.priority = E.priority(fresh.elements, fresh.seriousness_signal); r.serious = fresh.seriousness_signal;
    r.model = 'offline-reader-1'; r.prompt = 'triage_icsr v1.0';
    r.liveAI = false; r.readBy = null; r.confirmed = false; r.finalOutcome = null; r.decidedBy = null; r.decidedAt = null; r.overridden = false;
    r.caseAI = false; r.caseFields = null; r.caseModel = null; r.caseReviewed = false; r.caseReviewedBy = null; r.caseReviewedAt = null; r.caseExasolWrite = null;
  });
  A.persistInbox = () => LS.set('inbox', A.inbox);
  A.persistInbox();
  A.triage = function (text, channel, meta = {}) {
    const hash = E.sha256(text);
    const dup = A.inbox.find(r => r.hash === hash);
    if (dup) return { duplicate: true, record: dup };
    const read = E.readSource(text), v = E.evaluateValidity(read.elements);
    const rec = { id: 'src_' + hash.slice(0, 10), hash, channel, text, ts: new Date().toISOString(), meta, elements: read.elements, outcome: v.outcome, trace: v.trace,
      priority: E.priority(read.elements, read.seriousness_signal), serious: read.seriousness_signal, model: 'offline-reader-1', prompt: 'triage_icsr v1.0', products: read.products, ae: read.ae_candidates, sample: !!meta.sample,
      liveAI: false, readBy: null, confirmed: false, finalOutcome: null, caseAI: false, caseFields: null, caseModel: null, caseReviewed: false, caseReviewedBy: null, caseReviewedAt: null, caseExasolWrite: null };
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
    ['web_form', 'Reporter: Dr. Michael Tan, physician (m.tan@example-clinic.sg, SG)\nPatient: initials J.L., 68 years, male\nProduct: Hepatrix 50mg, once daily\nEvent: jaundice and dark urine\n\nMy patient was started on Hepatrix 50mg daily for hyperlipidaemia. Four weeks later he developed jaundice, dark urine and markedly raised transaminases. Hepatrix was withdrawn and liver function slowly improved over the following month.'],
    ['web_form', 'I just wanted to ask if Zelvora can be taken in the morning instead of at night. No problems so far, just a timing question.'],
    ['web_form', 'A relative of mine started Tamlesta a few weeks ago and has been having fainting spells and syncope since, but I do not know the exact dose or how long ago it started, and I would rather not give my own details.'],
    ['web_form', 'Reporter: consumer (self)\nPatient: self, 33 years, female\nProduct: Oruvane 15mg weekly\nEvent: severe fatigue and hair loss\n\nI am a patient taking Oruvane 15mg weekly for rheumatoid arthritis. Over the past two months I have developed severe fatigue and noticeable hair loss. My rheumatologist is reviewing whether to continue the medication.'],
    ['web_form', 'Reporter: pharmacist\nProduct: Plaxitin\n\nCan Plaxitin 20mg tablets be dispensed in a blister pack instead of a bottle for a patient with a tremor? No adverse effects to report.'],
    ['web_form', 'Reporter: Dr. Sofia Marchetti, physician (IT)\nPatient: initials G.B., 47 years, male\nProduct: carbamazepine 400mg daily\nEvent: widespread rash and fever, hospitalised\n\nMy patient was commenced on carbamazepine 400mg daily for trigeminal neuralgia. Twelve days later he developed a widespread rash with fever and was hospitalised for observation. Carbamazepine was discontinued and his skin findings resolved over ten days.'],
    ['web_form', 'Product: nitrofurantoin\nEvent: dyspnoea and fever after several months of use\n\nSubmitted through the public web form without any reporter or patient details: a user mentioned dyspnoea and fever after several months on nitrofurantoin, raising concern for a possible pulmonary reaction, but left all identifying fields blank.'],
    ['web_form', 'I read on social media that some people get headaches from ibuprofen. I have not experienced this myself and have no further information.'],
    ['web_form', 'Reporter: Dr. Amina Yusuf, physician (NG)\nPatient: initials T.O., 29 years, female\nProduct: sulfasalazine 1g twice daily\nEvent: fever and widespread rash, hospitalised for observation\n\nMy patient was started on sulfasalazine 1g twice daily for ulcerative colitis. Three weeks later she developed fever and a widespread rash and was hospitalised for observation of a possible drug hypersensitivity syndrome. Sulfasalazine was stopped and she improved over the following week.'],
    ['email', 'Subject: Adverse reaction to Nexamab 300mg\n\nDear Safety Team,\n\nI am a physician treating a 58-year-old male patient on Nexamab 300mg for metastatic lung cancer. Ten days after his second infusion he developed progressive dyspnoea and was hospitalised for suspected interstitial lung disease. Nexamab was withheld and he improved with corticosteroids.\n\nRegards,\nDr. Felix Nwosu'],
    ['email', 'Subject: Severe nausea after starting metformin\n\nHello,\n\nI am a pharmacist. My patient, a 61-year-old woman, started metformin 500mg twice daily for type 2 diabetes. Within three days she had severe nausea and vomiting and could not keep food down. She stopped the tablets and the nausea resolved within 48 hours.\n\nThank you,\nPriya Deshmukh, RPh'],
    ['email', 'Subject: Storage question for Cardiolin\n\nHi,\n\nI am a caregiver. Can Cardiolin tablets be stored outside the fridge for travel? No problems to report, just a storage question.\n\nThanks,\nS. Oduya'],
    ['email', 'Subject: Rash after amoxicillin\n\nHello,\n\nI am a nurse. A patient on the ward developed an itchy rash across the arms after starting amoxicillin 500mg three times daily. I do not have further identifying details as the patient has since been discharged.\n\nBest,\nR. Castillo'],
    ['email', 'Subject: Dizziness and fatigue on atorvastatin\n\nDear team,\n\nI am a physician. My patient, a 70-year-old man, has been on atorvastatin 40mg nightly for six months and now reports persistent dizziness and fatigue. Symptoms improved after the dose was halved.\n\nRegards,\nDr. Amara Okonkwo'],
    ['email', 'Subject: Heard about a bad reaction\n\nHi,\n\nSomeone in an online forum mentioned bleeding problems with a blood pressure medicine but did not name it. Just flagging in case it is useful.\n\nThanks,\nAnonymous'],
    ['email', 'Subject: Jaundice after isoniazid\n\nDear Safety Team,\n\nI am a physician. A 45-year-old man on isoniazid 300mg daily for latent tuberculosis developed jaundice and raised transaminases after six weeks. Isoniazid was stopped and liver function normalised over two months.\n\nRegards,\nDr. Lena Hartono'],
    ['email', 'Subject: Swelling after naproxen\n\nTo whom it may concern,\n\nA 39-year-old woman developed facial swelling and angioedema two hours after taking naproxen 250mg for a headache. She was treated in the emergency department and recovered fully. No further reporter details were provided.\n\n[message forwarded without a named sender]'],
    ['email', 'Subject: Adherence question for sulfasalazine\n\nHi,\n\nI am a pharmacist. A patient asked whether sulfasalazine tablets can be crushed if swallowing is difficult. No adverse effects have occurred.\n\nThanks,\nJ. J. Cuevas'],
    ['email', 'Subject: Severe headache and seizure on phenytoin\n\nDear team,\n\nI am a physician and neurologist. My patient, a 28-year-old man, experienced a breakthrough seizure and severe headache after his phenytoin level dropped due to a missed dose. He was stabilised in hospital and his dose was adjusted.\n\nRegards,\nDr. Wiremu Tane'],
    ['email', 'Subject: Neutropenia after clozapine\n\nDear team,\n\nI am a physician and psychiatrist. A 34-year-old man on clozapine 300mg daily for six weeks was found to have neutropenia on routine blood monitoring. Clozapine was stopped immediately per protocol and his neutrophil count recovered within ten days.\n\nRegards,\nDr. Helena Brandt'],
    ['email', 'Subject: Routine monitoring update\n\nHi,\n\nI am a pharmacist. Just confirming the patient on tamoxifen remains stable with no new symptoms at this check-in. No action needed.\n\nThanks,\nM. Alavi'],
    ['phone_call', 'Call log — Safety hotline\nCaller: consumer (self)\nDuration: 6 min\n\nSummary: I am a patient. I started Plaxitin 20mg two weeks ago for depression and developed a widespread rash with blistering around day 10. I went to the emergency department and was diagnosed with Stevens-Johnson syndrome. Plaxitin was stopped immediately.\n\nTranscript excerpt: "It started as a few red spots and then the skin started blistering, it was terrifying."'],
    ['phone_call', 'Call log — Safety hotline\nCaller: physician\nDuration: 4 min\n\nSummary: I am a physician calling about my patient, a 50-year-old woman on Oruvane 15mg weekly for rheumatoid arthritis, who developed severe fatigue and hair thinning after four months. We reduced the dose and fatigue improved.\n\nTranscript excerpt: "She just has no energy at all some days, it worried both of us."'],
    ['phone_call', 'Call log — General enquiry line\nCaller: consumer\nDuration: 2 min\n\nSummary: Caller asked whether Dormyl can be taken with food. No side effects reported. Caller declined to give further details.\n\nTranscript excerpt: "I just wanted to check the timing, that is all."'],
    ['phone_call', 'Call log — Safety hotline\nCaller: not stated\nDuration: 5 min\n\nSummary: Anonymous caller reported that a 24-year-old man collapsed and was hospitalised after taking isoniazid for several weeks, but declined to give contact information or relationship to the patient.\n\nTranscript excerpt: "He just went down, I do not want to say who I am."'],
    ['phone_call', 'Call log — Safety hotline\nCaller: nurse\nDuration: 7 min\n\nSummary: I am a nurse. My patient, a 66-year-old man on warfarin 5mg daily, presented with gum bleeding and bruising after an antibiotic course was added. INR was found to be markedly elevated.\n\nTranscript excerpt: "His gums would not stop bleeding when he brushed his teeth."'],
    ['phone_call', 'Call log — General enquiry line\nCaller: caregiver\nDuration: 3 min\n\nSummary: Caller asked about getting a replacement prescription for Nexamab after losing the original. No clinical concerns raised.\n\nTranscript excerpt: "I just need a new script, nothing is wrong."'],
    ['phone_call', 'Call log — Safety hotline\nCaller: consumer\nDuration: 4 min\n\nSummary: Caller said a family member had severe vomiting and dehydration after starting metformin but could not provide the family member\'s age or any other identifying detail.\n\nTranscript excerpt: "My relative just could not stop being sick, we are all worried."'],
    ['phone_call', 'Call log — Safety hotline\nCaller: physician\nDuration: 5 min\n\nSummary: I am a physician. A 72-year-old woman on amiodarone 200mg daily was found to have QT prolongation on a routine ECG, with no other explanation identified. Amiodarone was discontinued.\n\nTranscript excerpt: "The ECG change was quite striking given how stable she had been."'],
    ['phone_call', 'Call log — General enquiry line\nCaller: pharmacist\nDuration: 2 min\n\nSummary: I am a pharmacist. Calling to confirm the correct storage temperature for Cardiolin. No patient-related issue.\n\nTranscript excerpt: "Just a stock question before we dispense the next batch."'],
    ['phone_call', 'Call log — Safety hotline\nCaller: not stated\nDuration: 3 min\n\nSummary: Anonymous tip: a 45-year-old woman has had palpitations and dizziness since starting Cardiolin last week. Caller would not give a name or relationship to the patient.\n\nTranscript excerpt: "I just think someone should know, that is all I will say."'],
    ['phone_call', 'Call log — Safety hotline\nCaller: physician\nDuration: 5 min\n\nSummary: I am a physician. My patient, a 19-year-old woman on lamotrigine 100mg daily for epilepsy, developed a widespread rash and fever after three weeks and was admitted for monitoring of a possible hypersensitivity reaction. Lamotrigine was stopped.\n\nTranscript excerpt: "The rash spread very quickly over just two days."'],
    ['phone_call', 'Call log — General enquiry line\nCaller: consumer\nDuration: 2 min\n\nSummary: Caller wanted to know if allopurinol tablets are available in a liquid form for a patient who has trouble swallowing. No reaction reported.\n\nTranscript excerpt: "Swallowing tablets has just become difficult lately."'],
    ['literature_pubmed', 'Hepatocellular injury after amoxicillin-clavulanate: a case report\nAuthors: Weber M, Okafor N, Lindqvist P\n\nWe describe a 63-year-old man who developed jaundice and markedly raised transaminases ten days after completing a course of amoxicillin-clavulanate for sinusitis. Liver biopsy showed cholestatic hepatitis. He recovered over eight weeks after the drug was withdrawn. (Synthetic sample abstract for demonstration.)'],
    ['literature_pubmed', 'Drug-induced QT prolongation: an observational overview\nAuthors: Haddad R, Iyer S\n\nThis review summarises mechanisms by which medicines prolong the QT interval and discusses risk stratification. No individual cases are described. (Synthetic sample abstract for demonstration.)'],
    ['literature_pubmed', 'Rhabdomyolysis associated with high-dose atorvastatin: a case report\nAuthors: Keskin O, Fontaine L\n\nWe report a 59-year-old man who developed severe muscle pain and rhabdomyolysis six weeks after his atorvastatin dose was increased to 80mg daily for secondary prevention. Creatine kinase peaked at 42 times the upper limit of normal. Atorvastatin was withdrawn and his symptoms resolved over three weeks. (Synthetic sample abstract for demonstration.)'],
    ['literature_pubmed', 'Hyponatraemia following carbamazepine initiation in an elderly patient\nAuthors: Osei B, Lindqvist P\n\nAn 81-year-old woman developed confusion and severe hyponatraemia four weeks after starting carbamazepine 400mg daily for trigeminal neuralgia. Serum sodium normalised after carbamazepine was discontinued and fluids were restricted. (Synthetic sample abstract for demonstration.)'],
    ['literature_pubmed', 'Mechanisms of drug-induced pancreatitis: a narrative review\nAuthors: Haddad R, Okafor N\n\nThis review summarises known drug classes associated with acute pancreatitis and proposes a framework for causality assessment in suspected cases. No individual patient cases are presented. (Synthetic sample abstract for demonstration.)'],
    ['literature_pubmed', 'Angioedema associated with allopurinol: two case reports\nAuthors: Weber M, Iyer S\n\nWe describe two patients, a 52-year-old man and a 67-year-old woman, who each developed facial angioedema within three weeks of starting allopurinol for gout. Both recovered fully after the drug was stopped and antihistamines were given. (Synthetic sample abstract for demonstration.)'],
    ['literature_pubmed', 'A proposed algorithm for disproportionality analysis in spontaneous reporting databases\nAuthors: Marchetti S, Tane W\n\nThis methods paper describes a reproducible approach to signal detection using proportional reporting ratios and reporting odds ratios, illustrated with simulated data. (Synthetic sample abstract for demonstration.)'],
    ['literature_pubmed', 'Thrombocytopenia in patients receiving methotrexate: a case series\nAuthors: Castillo R, Brandt H\n\nPatients treated with methotrexate for prolonged courses developed thrombocytopenia, with platelet counts recovering after discontinuation; individual ages and identifiers are not reported due to a data use agreement. (Synthetic sample abstract for demonstration.)'],
    ['safereport_ai', 'SafeReport AI — automated extraction (agent v2.4.1)\nSource channel: WhatsApp patient support chat\nExtraction confidence: 0.94\n\nPatient: initials N.P., 41 years, female\nReporter: consumer (self)\nSuspect product: Zelvora 50mg\nAdverse event: palpitations and QT prolongation detected on follow-up ECG\n\nOriginal narrative captured by the agent:\nI am a patient. I have been taking Zelvora 50mg once daily for three weeks for my heart condition. My doctor found QT prolongation on my ECG along with palpitations I had been feeling at home starting about five days after I began the tablets. Zelvora was stopped the same day and the palpitations went away within 48 hours; my ECG returned to normal at a follow-up two weeks later. I am also taking amlodipine 5mg for blood pressure, which was not changed. My doctor has not restarted Zelvora.'],
    ['safereport_ai', 'SafeReport AI — automated extraction (agent v2.4.1)\nSource channel: Facebook Messenger patient outreach\nExtraction confidence: 0.88\n\nPatient: initials K.D., 36 years, male\nReporter: consumer (self)\nSuspect product: ibuprofen 400mg\nAdverse event: severe abdominal pain and bleeding, hospitalised\n\nOriginal narrative captured by the agent:\nI am a patient. I took ibuprofen 400mg several times a day for back pain for about ten days before the abdominal pain and bleeding started. I stopped the ibuprofen as soon as I was admitted and the bleeding settled within three days; I was hospitalised for two days for observation and a blood transfusion. I was not taking any other regular medication at the time. I have not taken ibuprofen again since.'],
    ['safereport_ai', 'SafeReport AI — automated extraction (agent v2.4.1)\nSource channel: Call centre transcript (voice)\nExtraction confidence: 0.92\n\nPatient: initials R.T., 67 years, male\nReporter: consumer (self)\nSuspect product: Dormyl 10mg\nAdverse event: dizziness and a fall the next afternoon\n\nOriginal narrative captured by the agent:\nI am a patient. I am a 67-year-old man. After taking Dormyl 10mg at night I felt dizzy well into the next afternoon and had a fall at home. My daughter helped me make this call.'],
    ['safereport_ai', 'SafeReport AI — automated extraction (agent v2.4.1)\nSource channel: Partner hospital EHR integration\nExtraction confidence: 0.97\n\nPatient: initials B.F., 74 years, male\nReporter: physician (treating team)\nSuspect product: warfarin 5mg\nAdverse event: intracranial haemorrhage\n\nOriginal narrative captured by the agent:\nI am a physician. My patient, a 74-year-old man on warfarin 5mg daily for two years, was admitted with a spontaneous intracranial haemorrhage ten days after a course of antibiotics was added, which raised his INR above the therapeutic range. Warfarin was reversed and withheld, and he was also taking aspirin 75mg which was stopped at the same time. He remained in hospital for ten days and was discharged with mild residual weakness; warfarin has not been restarted.'],
    ['safereport_ai', 'SafeReport AI — automated extraction (agent v2.4.1)\nSource channel: Pharmacy refill chatbot\nExtraction confidence: 0.86\n\nPatient: initials D.M., 59 years, female\nReporter: consumer (self)\nSuspect product: Cardiolin\nAdverse event: palpitations and dizziness since the last dose increase\n\nOriginal narrative captured by the agent:\nI am a patient. I am a 59-year-old woman. Since my Cardiolin dose was increased I have had palpitations and dizziness most evenings. I am asking for a refill while my doctor reviews the dose.'],
    ['safereport_ai', 'SafeReport AI — automated extraction (agent v2.4.1)\nSource channel: Recorded support call (auto-transcribed)\nExtraction confidence: 0.85\n\nPatient: initials V.R., 58 years, female\nReporter: nurse (care coordinator)\nSuspect product: nitrofurantoin 100mg\nAdverse event: dyspnoea and fever after two months of continuous use\n\nOriginal narrative captured by the agent:\nI am a nurse coordinating care. My patient, a 58-year-old woman, has been on continuous nitrofurantoin 100mg for recurrent urinary infections for about two months and developed dyspnoea and fever roughly ten days after her last prescription refill, raising concern for a pulmonary reaction. She was not on any other new medication. Nitrofurantoin was stopped on specialist advice and her breathing and fever improved over the following week; she has not restarted it.'],
    ['safereport_ai', 'SafeReport AI — automated extraction (agent v2.4.1)\nSource channel: Mobile app store review\nExtraction confidence: 0.89\n\nPatient: initials self, 44 years, male\nReporter: consumer (self)\nSuspect product: Tamlesta\nAdverse event: syncope shortly after the first dose\n\nOriginal narrative captured by the agent:\nI am a patient. I am a 44-year-old man. I started Tamlesta and had a fainting spell, actual syncope, within an hour of the first dose. Will not be taking this again.'],
    ['safereport_ai', 'SafeReport AI — automated extraction (agent v2.4.1)\nSource channel: Partner telehealth consultation note\nExtraction confidence: 0.91\n\nPatient: initials H.M., 63 years, male\nReporter: physician (telehealth consult)\nSuspect product: amiodarone 200mg\nAdverse event: QT prolongation on remote ECG monitoring\n\nOriginal narrative captured by the agent:\nI am a physician. My patient, a 63-year-old man on amiodarone 200mg daily for four months, showed QT prolongation on remote ECG monitoring during a routine telehealth check-in, first noticed about two weeks after his last dose increase. He is also taking metoprolol 50mg for his heart rhythm, which was continued unchanged. The dose was reduced pending cardiology review, and a repeat ECG one week later showed the QT interval had shortened towards normal. Amiodarone has not been stopped completely.'],
    ['safereport_ai', 'SafeReport AI — automated extraction (agent v2.4.1)\nSource channel: SMS text message\nExtraction confidence: 0.81\n\nPatient: initials self, 52 years, female\nReporter: consumer (self)\nSuspect product: Hepatrix\nAdverse event: nausea and fatigue since starting the tablets\n\nOriginal narrative captured by the agent:\nI am a patient. I am a 52-year-old woman. Since starting Hepatrix I have had nausea and fatigue most days. Wanted to flag this before my next refill.'],
    ['safereport_ai', 'SafeReport AI — automated extraction (agent v2.4.1)\nSource channel: Partner pharmacy chatbot\nExtraction confidence: 0.9\n\nPatient: initials Q.S., 50 years, female\nReporter: pharmacist (partner pharmacy)\nSuspect product: Hepatrix 50mg\nAdverse event: jaundice and markedly raised transaminases\n\nOriginal narrative captured by the agent:\nI am a pharmacist. My patient, a 50-year-old woman on Hepatrix 50mg daily for six weeks, returned to the pharmacy with yellowing of the eyes that had started about four days earlier and was found to have markedly raised transaminases on urgent blood work. She was not taking any other regular medication. Hepatrix was stopped and she was referred for same-day review; two weeks later her liver function tests had returned to normal and the jaundice had fully resolved. Her doctor has decided not to restart Hepatrix.']
  ];
  A.CHANNELS = ['web_form', 'email', 'phone_call', 'literature_pubmed', 'safereport_ai'];
  A.CHANNEL_LABEL = { web_form: 'Web form', email: 'Email', phone_call: 'Phone call', literature_pubmed: 'Literature (PubMed)', safereport_ai: 'SafeReport AI' };
  A.preview = t => { const g = k => (t.match(new RegExp('^\\s*' + k + ':\\s*(.+)$', 'mi')) || [])[1];
    const prod = g('Suspect product'), ev = g('Adverse event');
    if (prod && ev) return prod.trim() + ' · ' + ev.trim();
    return t.split('\n').filter(l => !/automated extraction|^\s*source channel:|^\s*extraction confidence:/i.test(l)).join(' ').replace(/\s+/g, ' ').trim(); };
  A.techDetails = msg => msg ? `<details class="tech"><summary>Details for IT</summary><code>${A.esc(msg)}</code></details>` : '';
  A.aiError = (what, msg) => /api[_ ]?key|not set|501/i.test(msg || '')
    ? `<b>AI reading isn't connected,</b> so Claude can't read this ${what} yet. Ask your administrator to connect the AI service.${A.techDetails(msg)}`
    : `<b>Claude couldn't read this ${what}.</b> Try again in a moment.${A.techDetails(msg)}`;
  A.CHANNEL_COLOR = { web_form: 'var(--blue)', email: 'var(--slate)', phone_call: 'var(--teal)', literature_pubmed: 'var(--warn)', safereport_ai: 'var(--ok)' };
  A.chanLabel = c => A.CHANNEL_LABEL[c] || A.human(c);
  A.chanIcon = c => ({ web_form: 'globe', email: 'mail', phone_call: 'phone', literature_pubmed: 'book', safereport_ai: 'botai' }[c] || 'file');
  A.chanColor = c => A.CHANNEL_COLOR[c] || 'var(--blue)';
  // Idempotent: A.triage() already skips anything whose content hash is already in
  // the inbox, so this just backfills whichever samples are missing — including
  // ones added or rewritten after a browser already had an older set seeded.
  A.SAMPLES.forEach(([c, t]) => A.triage(t, c, { sample: true }));
  LS.set('seeded', true); LS.set('seeded2', true);

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
  A.human = s => String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()).replace(/\bai\b/gi, 'AI');
  A.short = (h, n = 8) => h ? h.slice(0, n) + '…' + h.slice(-4) : '—';
  A.OUT_LABEL = { valid_icsr: 'Valid ICSR', potential_icsr: 'Potential ICSR · escalated', non_icsr: 'Not an ICSR' };
  A.outBadge = o => o ? `<span class="badge ${o === 'valid_icsr' ? 'b-ok' : o === 'potential_icsr' ? 'b-warn' : 'b-mut'}">${A.OUT_LABEL[o]}</span>` : '<span class="badge b-info">Pending</span>';
  /* A record's ICSR outcome only counts once a human has confirmed it — this
     reflects that: nothing analysed yet, analysed but awaiting confirmation, or
     confirmed (counted). */
  A.statusBadge = r => r.confirmed ? A.outBadge(r.finalOutcome) : r.liveAI ? '<span class="badge b-info">Awaiting confirmation</span>' : '<span class="badge b-mut">Not yet analysed</span>';
  A.catBadge = c => `<span class="badge ${{ Certain: 'b-bad', Probable: 'b-bad', Possible: 'b-warn', Unassessable: 'b-warn' }[c] || 'b-mut'}">${c}</span>`; // soft fill + dark text keeps AAA
  A.recBadge = id => ({ 'REC-02': '<span class="badge b-bad">Validated</span>', 'REC-03': '<span class="badge b-mut">Not confirmed</span>', 'REC-01': '<span class="badge b-warn">Insufficient info</span>', 'REC-04': '<span class="badge b-warn">Inconclusive</span>' }[id] || '');
  A.toast = msg => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };
  /* Real, live call to the Claude API — the one genuine model call in this build.
     Goes to this server's own /api/extract (server.py), which holds the API key
     server-side and never exposes it to the browser. Returns {ok, elements, model}
     on success, or {ok:false, error} — including the honest "key not set yet" case. */
  async function postJson(url, body) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!data) return { ok: false, error: `Server returned ${res.status} with no readable response.` };
      return data;
    } catch (e) {
      return { ok: false, error: 'Could not reach the server (' + e.message + '). Is server.py running?' };
    }
  }
  A.callClaude = text => postJson('/api/extract', { text });
  /* Case workbench's "Enable AI" — a second, independent live Claude call per case,
     asking for a deeper field-by-field review (dechallenge, rechallenge, onset, etc.)
     instead of just the 4 triage criteria. Same honesty rules: verbatim quotes only,
     re-verified client-side before anything is shown. */
  A.callClaudeCase = text => postJson('/api/extract_case', { text });
  /* Real, live calls to the local Exasol database (schema ATHERIA_PV) — the one
     genuine database in this build. Literature sweep results and confirmed case
     reviews are written here by server.py, through the admin pyexasol connection;
     the same rows are immediately readable through this project's Exasol MCP
     server, since both point at the same local instance. */
  A.callExasolLiterature = rows => postJson('/api/exasol/literature', { rows });
  A.callExasolCaseReview = payload => postJson('/api/exasol/case_review', payload);
  A.getExasolStatus = async function () {
    try {
      const res = await fetch('/api/exasol/status');
      const data = await res.json().catch(() => null);
      return data || { ok: false, error: `Server returned ${res.status}.` };
    } catch (e) {
      return { ok: false, error: 'Could not reach the server (' + e.message + ').' };
    }
  };
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
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7z"/><path d="M10 20a2 2 0 0 0 4 0"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', check: '<path d="m5 12 5 5 9-10"/>', file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>', alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>', flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.5 1.5 0 0 0 5.8 21h12.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>', phone: '<path d="M5 4h4l2 5-2.5 2a11 11 0 0 0 5.5 5.5l2-2.5 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 7a2 2 0 0 1 2-3z"/>',
    // dashboard card icons: 24px grid, 2px outline, round caps and joins (design-guidelines §6)
    trend: '<path d="M3 17l5.5-5.5 4 4L20 8"/><path d="M15 8h5v5"/>', funnel: '<path d="M4 5h16l-6 7.5V18l-4 2v-7.5z"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15.5 3.7A9 9 0 0 1 20.3 8.5H15.5z"/>', listcheck: '<path d="m4 7 2 2 3.5-3.5M4 16.5l2 2 3.5-3.5M13 8h7M13 17.5h7"/>',
    scatter: '<path d="M4 4v16h16"/><circle cx="9" cy="14.5" r="1.6"/><circle cx="13" cy="10.5" r="1.6"/><circle cx="17.5" cy="7" r="1.6"/>', eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    botai: '<rect x="3" y="10" width="15" height="11" rx="3"/><path d="M10.5 10V6.5M8 6.5h5"/><circle cx="8" cy="15.5" r="1.3"/><circle cx="13" cy="15.5" r="1.3"/><path d="M18.5 1.5 19.6 4.4 22.5 5.5 19.6 6.6 18.5 9.5 17.4 6.6 14.5 5.5 17.4 4.4z" style="stroke:var(--knock,var(--card));stroke-width:4.5;fill:var(--knock,var(--card))"/><path d="M18.5 1.5 19.6 4.4 22.5 5.5 19.6 6.6 18.5 9.5 17.4 6.6 14.5 5.5 17.4 4.4z" style="fill:currentColor;stroke:none"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', bot: '<rect x="4" y="9" width="16" height="11" rx="3"/><path d="M12 9V5M9 5h6"/><circle cx="9" cy="14.5" r="1.4"/><circle cx="15" cy="14.5" r="1.4"/><path d="M3 13h1M20 13h1"/>'
  };
  A.ico = (n, extra = '') => `<svg viewBox="0 0 24 24" ${extra} aria-hidden="true">${A.I[n]}</svg>`;
  // Medicine capsule (design-guidelines/capsule-logo.svg): product logo and hero art. Keeps the .cross class so layout is unchanged.
  const CAPSULE = '<g transform="rotate(-40 32 32)"><path d="M32 19H19a13 13 0 000 26h13z" fill="#ffffff" stroke="#9fd3b1" stroke-width="2"/><circle cx="17" cy="28" r="2.4" fill="#cfeadb"/><circle cx="24.5" cy="34" r="2.8" fill="#bfe3cd"/><circle cx="17.5" cy="38.5" r="2.2" fill="#cfeadb"/><circle cx="26" cy="26.5" r="2.1" fill="#e2f3e8"/><path d="M32 19h13a13 13 0 010 26H32z" fill="#2c7a49"/><path d="M34 22h9a9 9 0 013.5 1.5" stroke="#7fcf98" stroke-width="2.5" stroke-linecap="round" fill="none"/></g>';
  A.cross = (s = 200) => `<svg class="cross" width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true">${CAPSULE}</svg>`;
  A.logo = () => `<svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">${CAPSULE}</svg>`;

  /* ---------- shell + router ---------- */
  const NAV = [
    ['Overview', [['#/', 'home', 'Dashboard']]],
    ['Reports', [['#/literature', 'book', 'Literature monitoring'], ['#/inbox', 'inbox', 'Triage inbox', 'inbox'], ['#/workbench', 'bench', 'Case workbench']]],
    ['MedDRA coding', [['#/meddra', 'flask', 'MedDRA coding']]],
    ['Signals', [['#/signals', 'pulse', 'Signal detection', 'sig'], ['#/ask', 'chat', 'Ask the evidence']]],
    ['Trust', [['#/audit', 'link', 'Audit trail']]]
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
      <div class="me"><div class="av">${esc((A.user.name || 'U')[0])}</div><div style="min-width:0"><b>${esc(A.user.name)}</b><span>${esc(A.user.role)}</span></div><button class="iconbtn" style="width:44px;height:44px;margin-left:auto;box-shadow:none" title="Sign out" id="signout"><svg viewBox="0 0 24 24">${A.I.out}</svg></button></div></aside>
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
  A.start = () => { if (!location.hash) location.hash = '#/'; render(); };
})(window);
