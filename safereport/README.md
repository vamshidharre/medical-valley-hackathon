# SafeReport

Mobile-first web app (390×844 phone frame on desktop) for reporting medicine side effects (ICSR) to the manufacturer.

Flow: Sign up (once) → Capture medicine (photo / upload / QR) → Extracted details (editable) → Chat (Patient: 1-to-1; Doctor / Chemist / Other HCP: 3-way with live captured-fields panel) → Review & submit → Report issued (ID + timeline) → Follow-up (acknowledgement notification + follow-up questions).

## Run
```
cd safereport
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn server:app --port 8765     # open http://localhost:8765
```
Or just open `web/index.html` in a browser: with no server the app runs entirely on mock data and simulated AI replies.

## Demo mode vs live mode (badge on screen: "Demo AI" / "Live AI")
| | Demo (default) | Live |
|---|---|---|
| Needs | nothing | `ANTHROPIC_API_KEY` in `safereport/.env` (copy `.env.example`) |
| Medicine extraction | canned sample packs (only via the sample button) | photo → **Claude Haiku vision** transcribes all text (horizontal, vertical, rotated) and fills name / dose / batch / manufacturer in one call. Set `OCR_ENGINE=nemotron` to use Nemotron OCR v2 (Hugging Face Space / `NEMOTRON_URL`) instead |
| Chat | keyword-based field capture + scripted questions | Claude interviews the patient / listens in on the 3-way chat (`/api/chat`) |

If a live call fails, the app drops back to demo mode automatically. Model is configurable via `SAFEREPORT_MODEL`.
Follow-up questions and the report timeline are always simulated.

## Files
- `web/` — static frontend (`index.html`, `styles.css`, `app.js`), no build step
- `server.py` — serves `web/` and exposes `/api/health`, `/api/extract`, `/api/chat`; reuses the OCR folder without modifying it
