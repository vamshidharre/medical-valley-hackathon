# Challenge slides and where we stand

Written 2026-11-13 (day 2 of 3). Source: the challenge owner pitch decks in the organisers' Google Drive folder
("Challenge Owner Pitch"): `Challenge1_BMD.pdf`, `Challenge2_OTH-AW.pdf`, `Challenge3_Exasol.pdf`. We are in
Challenge 3. The PDFs are not copied into the repo.

## 1. What the Exasol deck says (Challenge 3, 8 slides)

| # | Slide | Message | What judges will look for |
|---|---|---|---|
| 1 | The question | Would you trust an AI with your health? A confident answer is not the same as a trustworthy one. | Our app must not sound confident when it should not be. |
| 2 | The real problem | Healthcare has plenty of data (patient history, lab results, hospital systems, research) but it is not connected. The task: turn scattered information into decisions people can trust. | We **combine several data sources** into one decision. |
| 3 | The trust test | Bad: "Everything looks normal." with no sources. Good: "Here is the evidence. One result is missing. Please review with a clinician." Tagline: evidence shown, uncertainty flagged, human review. | **This slide is the scoring rubric.** Every AI output in our demo should look like the right-hand box. |
| 4 | Your mission | Choose a meaningful problem, build an app people want, explain why its insights deserve trust. "One rule: Earn Trust." | The pitch needs a clear "why you can trust it" part, not just features. |
| 5 | Pick your mission | Help a patient, help a hospital, help a researcher, or surprise them. No fixed track. | Pharmacovigilance is a "surprise us" pick. Good, but we must explain the pain in one sentence. |
| 6 | Your toolkit | Healthcare data (synthetic or authorised) → Exasol Personal (explore, combine, analyse) → your AI app (any model, agent, interface). | Exasol is **the middle of the pipeline**. They expect the data to live and be analysed in Exasol. |
| 7 | The build | Pick one user and one pain → connect representative data → build one useful workflow → prove evidence and uncertainty → show human oversight. "A believable prototype beats a perfect slide deck." | **Five checkpoints.** Judges will tick these off. One workflow, working live. |
| 8 | The invitation | Don't just build an AI demo, build something that matters. Could you trust it with your own health? | End the pitch on the human impact. |

Footer on every slide: "Exasol, the sovereign agentic database". Exasol is selling two ideas: **sovereign**
(data stays under your control) and **agentic** (AI agents work directly on the database). A solution that
shows both speaks the sponsor's language.

### The other two challenges (for context only)

- **Challenge 1, BioMedical Design (BMD):** need-driven innovation. Find a real, validated clinical need first,
  then a solution. Their example need: heart-failure patients on many medicines cannot describe their pills to
  clinicians ("three white tablets and a yellow one"), especially after generic switches.
- **Challenge 2, OTH Amberg-Weiden:** "Meet your AI patient", a virtual patient for training medical students in
  history taking, with Apple Vision Pro headsets provided.

Neither changes our plan. BMD's method (state the need as "a way to [solve problem] for [population] in order
to [outcome]") is a useful way to write our one-sentence problem.

## 2. Are we on the winning path?

**Short answer: the idea fits the challenge well; the build does not yet show what the sponsor is judging.**
The biggest risk is that Exasol, the sponsor's own product, is installed but unused, and the two apps are not
connected. With one day left, the plan in [ATHERIA_PIPELINE.md](ATHERIA_PIPELINE.md) (four stages, MCP, AWS,
ML encoder) is too big to finish. Cut it down.

### Scorecard against slide 7 (the five checkpoints) and slide 3 (the trust test)

| Checkpoint | Status | Evidence |
|---|---|---|
| 1 Pick one user and one pain | **Partly.** We have two users (patient in SafeReport, safety reviewer in Atheria) and no written problem statement. README "Our project" says "To be written." | `README.md` |
| 2 Connect representative data | **Weak.** Data is synthetic (good), but it lives in browser JavaScript, not in Exasol. Exasol is installed locally and **empty**. No Exasol code in the repo. | `PV Teams/atheria-web/js/data.js`, `docs/ATHERIA_PIPELINE.md` |
| 3 Build one useful workflow | **Partly.** Each app works alone. Patient report does not reach the reviewer, so there is no single end-to-end workflow yet. | `safereport/server.py`, `PV Teams/atheria-web/` |
| 4 Prove evidence and uncertainty | **Good, in Atheria.** Missing core elements are flagged, "insufficient" verdicts exist, confidence is shown, signal statistics (PRR, chi-squared, Evans criteria) are fixed rules. | `js/engine.js`, `js/views-a.js`, `js/views-b.js` |
| 5 Show human oversight | **Good, in Atheria.** Reviewer approves; hash-chained audit trail. | `js/core.js` (`A.auditAdd`), `js/views-b.js` |
| Slide 3 trust test, live | **At risk.** AI case extractions are cached outputs and the chat is an offline stand-in; SafeReport runs in demo mode until an API key is set. A judge who asks "is this live?" must get an honest answer. | `PV Teams/atheria-web/README.md`, `safereport/README.md` |
| Slide 6, Exasol in the middle | **Missing.** This is the gap most likely to cost us the win. | |
| Slide 4, explain why it deserves trust | **Not written.** No pitch, no "why trust it" story yet. | |

### What we have that most teams will not

- A real regulated workflow (pharmacovigilance has legal deadlines and audits), not a chatbot.
- Trust is built into the design already: fixed statistical rules decide, AI only proposes, a human approves,
  every step is in a tamper-evident audit log. That is exactly slide 3.
- Two sides of one problem: the patient who reports and the company that must act on it. That is slide 2's
  "connected intelligence".

## 3. What to do in the time left (recommended, in this order)

Aim: one live story that ticks all five checkpoints, with Exasol visibly doing the analysis.

1. **Write the one sentence now** (BMD format): "A way for drug-safety reviewers to turn scattered side-effect
   reports into a checked, evidence-backed safety signal, so that real risks to patients are found sooner and
   no AI decision goes unchecked." Put it in `README.md` → "Our project".
2. ~~**Load the data into Exasol.**~~ **Done 2026-11-13:** `db/load_exasol.py` created `PV.REPORTS` (1,261),
   `PV.AUDIT` (120, chain verifies) and the `PV.SIGNALS` view.
3. ~~**Signal detection as SQL in Exasol.**~~ **Done 2026-11-13:** Atheria at
   http://localhost:8765/atheria/?demo=1 reads `PV.SIGNALS` through `GET /api/pv/signals`, shows an Exasol
   badge, the SQL, and a cross-check against the browser calculation (102 of 102 pairs agree). Case rows behind a
   signal stay in the browser copy: team decided 2026-11-13 not to move them to Exasol.
4. **Connect the apps once:** SafeReport submit writes a row to Exasol `reports`; Atheria's inbox reads it. One
   small FastAPI endpoint in `safereport/server.py`. This makes the demo one story from patient to reviewer.
5. **One agent answer, slide-3 style:** the reviewer asks a question (for example "is this a new signal?"); the
   agent queries Exasol through the MCP server and answers with the rows it used, what is missing, and "a
   reviewer must confirm". Needs an LLM key; if none, skip and say so rather than fake it.
6. **Pitch line on sovereignty:** the database runs locally, synthetic data never leaves the machine. That is
   Exasol's own selling point.
7. **Turn on simple mode** from [UI_SIMPLIFICATION.md](UI_SIMPLIFICATION.md) for the demo path only (three
   screens). Judges have a few minutes.

**Cut for now:** AWS, the ML MedDRA encoder (use the cached codes, or a small synthetic term list with top-3
matches if time allows), more dashboards, new features.

### Demo script (3 minutes)

1. Patient reports a side effect in SafeReport (30 s).
2. It arrives in Atheria. AI proposes the case details; two fields are flagged missing; reviewer fills one and
   approves (60 s). Audit log shows both the AI proposal and the human decision.
3. Signal view: Exasol SQL shows this drug-event pair crossing the fixed thresholds, with the cases behind it,
   and says plainly where evidence is not enough (60 s).
4. Close on slide 3's two boxes: "Our app always gives the right-hand answer." (30 s).

### Honesty rule (this also wins)

Say on screen which parts are live and which are cached or scripted. The challenge is about trust; a judge
catching an unlabelled fake would sink us faster than a missing feature.

## 4. Questions for the team

1. When exactly is submission and the final pitch on 14 November?
2. Who builds which step above?
3. Do we have an LLM API key (Anthropic or via the organisers' AWS sandbox) for the live agent in step 5?
4. Did the organisers hand out a healthcare dataset? If yes, should it replace or join our synthetic reports?
5. Is anyone writing the slides and the 3-minute pitch?
