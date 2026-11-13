# Project context for AI coding tools

This is the single source of project context for every AI tool (Claude Code, Codex, Cursor, Gemini, others).
`CLAUDE.md` and `GEMINI.md` only import this file. Edit context here, nowhere else.

## What this is

Team entry for the Healthcare Hackathon Bayern, Erlangen: Challenge 3, "Healthcare AI You Can Trust" (challenge
owner: Exasol). The root [README.md](README.md) has the challenge text and its five trust requirements. Every
feature must serve those five requirements.

Domain: pharmacovigilance, the reporting and review of medicine side effects.

## The two apps

| App | Folder | For | Run | URL |
|---|---|---|---|---|
| SafeReport | `safereport/` | Patients and healthcare professionals reporting a side effect | `python -m uvicorn server:app --app-dir safereport --port 8765` from the repo root, using `safereport/.venv` | http://localhost:8765 |
| Atheria | `PV Teams/atheria-web/` | The company's safety team: triage, signals, audit | `python -m http.server 8000 --directory "PV Teams/atheria-web"` | http://localhost:8000/?demo=1 |

- SafeReport: FastAPI backend (`server.py`) plus a static frontend in `web/`. Without `ANTHROPIC_API_KEY` in
  `safereport/.env` it runs in demo mode with scripted replies.
- Atheria: static site, no build step. `?demo=1` skips sign-in. Served by the SafeReport server at
  http://localhost:8765/atheria/?demo=1 it reads signal statistics from Exasol (`PV.SIGNALS`); served alone it
  computes them in the browser. Load Exasol first with `db/load_exasol.py`.
- The apps share a server, but SafeReport reports do not reach Atheria yet.
- Each app has its own README with more detail.

## Current plans

- [docs/CHALLENGE_SLIDES_AND_GAP_ANALYSIS.md](docs/CHALLENGE_SLIDES_AND_GAP_ANALYSIS.md): what the Exasol
  challenge slides ask for, how our work scores against them, and the cut-down plan for the last day. **Read first.**
- [docs/SAFEREPORT_AWS_EXASOL_PLAN.md](docs/SAFEREPORT_AWS_EXASOL_PLAN.md): SafeReport flow (AWS Textract, AWS
  Bedrock, then Exasol), access status and build steps. **Active; blocked on AWS credentials.**
- [docs/ATHERIA_PIPELINE.md](docs/ATHERIA_PIPELINE.md): the four stages to build in Atheria (intake and triage,
  MedDRA encoding, signal detection, audit trail), what exists today, and open questions. **Active.**
- [docs/UI_SIMPLIFICATION.md](docs/UI_SIMPLIFICATION.md): how to simplify the UI. **Parked, do later.**

When a plan changes, update its file so the next tool or teammate has the current state.

## Rules

- **Git:** `main` holds only the README. Team work is on `AdiBranch`. Create a new branch for your own changes;
  do not commit or push unless the user asks.
- **Do not commit:** `.venv/`, `__pycache__/`, `.env`, or any credentials.
- **Data:** synthetic data and fictional drug names only. No real patient data in the repo or in any cloud
  service. Do not commit MedDRA dictionary files (licensed).
- **Trust:** AI proposes, fixed rules decide, a human approves. Show the evidence for each finding, flag
  missing or conflicting information, and never let the AI make the final decision.
- **Scope:** this is a hackathon. Prefer the smallest change that works in a live demo. Hide features instead
  of deleting a teammate's work.
