# SafeReport plan: AWS OCR, AWS LLM, then Exasol

Status: **planned 2026-11-13 (day 2 of 3), not started. Blocked on AWS access** (see section 2).
Part of the cut-down plan in [CHALLENGE_SLIDES_AND_GAP_ANALYSIS.md](CHALLENGE_SLIDES_AND_GAP_ANALYSIS.md), steps 4 and 5.

## 1. Target flow

```
Patient photographs the medicine pack (SafeReport, browser)
  -> AWS Textract        reads the printed text            (OCR)
  -> AWS Bedrock model   turns the text into fields: name, dose, batch, manufacturer;
                         also runs the side-effect interview (the chat)
  -> patient reviews and edits the fields (already built)
  -> backend writes the report to Exasol: PV.REPORTS (+ an event in PV.AUDIT)
  -> Atheria shows it in the reviewer inbox, read from Exasol
```

Trust rules (challenge slide 3) that this flow must keep: show the raw OCR text next to each extracted field,
flag fields that could not be read, let the human edit everything, never let the AI submit by itself, and show on
screen whether a step was live or scripted.

## 2. Do we have access? (checked 2026-11-13 on Vamshi's laptop)

| Needed | Status | Detail |
|---|---|---|
| AWS credentials | **No** | AWS CLI is not installed. `~/.aws` holds only an empty-looking `sso/cache` folder created today at 11:14, most likely Kiro's own sign-in, which is not an AWS account for Textract or Bedrock. No `AWS_*` environment variables. |
| `boto3` (AWS Python library) | Yes | Version 1.44.2 in `safereport/.venv`. |
| Textract and Bedrock enabled in the account | **Unknown** | Bedrock models must be switched on per model, per region, by an account admin. |
| Exasol, local | **Yes** | `127.0.0.1:8563`, schema `PV` already loaded. Works without any sandbox. See [ATHERIA_PIPELINE.md](ATHERIA_PIPELINE.md). |
| Exasol, shared "server" | Not seen | No organiser-provided Exasol host or credentials were found. Local is enough for the demo. |
| Kiro | Not an AWS API login | Kiro is a coding assistant. Its sign-in does not give our app Textract or Bedrock access. |

### Update 2026-11-13: access comes from AWS Workshop Studio, not SSO

The sandbox is the "Healthcare GenAI Hackathon" event on AWS Workshop Studio
(`catalog.us-east-1.prod.workshops.aws`); the event page says the main service is **Amazon Bedrock**. Credentials
are temporary keys from the event dashboard ("Get AWS CLI credentials": `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`), valid for a few hours. SSO (`aws configure sso`) is not needed.
The AWS CLI 2.40.2 is installed (`C:\Program Files\Amazon\AWSCLIV2\aws.exe`). Textract is not named by the event,
so it may not be allowed; a Bedrock vision model can read the pack photo and extract the fields in one call.

### How SafeReport connects to AWS (built 2026-11-13, not yet tested with real keys)

`safereport/server.py` has a switch: `LLM_ENGINE=bedrock` makes `claude()` return `anthropic.AnthropicBedrock`,
the same client API pointed at Bedrock, so OCR-by-vision, field extraction, chat and listen all go through AWS
with no other code change. Setup:

1. Copy `safereport/.env.example` to `safereport/.env` and paste the three AWS values, the region, and a Bedrock
   model id that is enabled and accepts images in `SAFEREPORT_MODEL`. `.env` is in `.gitignore`.
2. Restart the server. `GET /api/health` should show `"claude": true`.
3. Keys expire: paste fresh ones from the event page when calls start failing, then restart.

Open: which Bedrock models are enabled in this sandbox. If only non-Claude models (for example Amazon Nova) are
available, `AnthropicBedrock` will not work and the code needs the Bedrock `Converse` API instead.

### What to ask the organisers (all of this is needed)

1. How do we sign in to the AWS sandbox: SSO start URL, account ID and role name, or an access key?
2. Which region? (Prefer `eu-central-1`, Frankfurt, to match the "sovereign" story, if Bedrock models are offered there.)
3. Is **Amazon Textract** allowed, and which **Bedrock models** are enabled (model IDs)?
4. Is there a shared Exasol in the sandbox, and what are its host, port and user?
5. Budget or rate limits for the sandbox?

Once we have them: install the AWS CLI, `aws configure sso` (or set keys in `safereport/.env`, never in git), then
verify with three calls: `sts get-caller-identity`, one Textract `DetectDocumentText` on a sample pack photo, one
Bedrock `Converse` call.

## 3. Build steps (each ends in a check)

| # | Step | Check |
|---|---|---|
| 1 | Get AWS access and verify the three calls above | All three succeed from `safereport/.venv` |
| 2 | **OCR:** new engine `OCR_ENGINE=aws` in `safereport/server.py`: Textract `DetectDocumentText` on the uploaded photo, return the lines as `raw_text` | A sample pack photo returns readable text; failure falls back to today's engines |
| 3 | **Field extraction:** send `raw_text` to a Bedrock model through the `Converse` API with a JSON schema (name, dose, batch, manufacturer, each with the source line); reuse the existing prompts in `server.py` | Fields filled; unreadable ones returned empty and flagged, not guessed |
| 4 | **Chat:** route `/api/chat` and `/api/listen` through Bedrock `Converse` when `LLM_ENGINE=bedrock` (keep Claude and demo mode as fallbacks) | Interview asks for the most important missing field |
| 5 | **Submit to Exasol:** new `POST /api/report` writes a row to `PV.REPORTS` (`report_source = 'safereport'`) and an event to `PV.AUDIT` that follows the existing hash chain in `db/load_exasol.py`; returns the report ID | Row visible in Exasol; chain still verifies |
| 6 | **Atheria inbox from Exasol:** `GET /api/inbox` reads new SafeReport rows; the portal lists them | Submit in SafeReport, see it in Atheria within a refresh |
| 7 | **Trust display:** show raw OCR text beside the fields, a "could not read" flag, "live" or "demo" badge per step | Matches the right-hand box of challenge slide 3 |

Fallbacks if AWS access does not arrive in time: keep the current Claude vision path (needs `ANTHROPIC_API_KEY`),
or demo mode, and say so on screen. Do not fake a live AWS call.

## 4. Seeing what is in Exasol (there is no built-in UI)

Exasol Personal has no web interface. Three options, simplest first:

1. **Command line:** `exasol connect`, then SQL, for example `SELECT COUNT(*) FROM PV.REPORTS;`. Run
   `exasol connect -d default` if several deployments exist.
2. **A SQL client such as DBeaver** (free, has an Exasol driver). Server `127.0.0.1`, port `8563`, user `sys`,
   password from `C:\Users\vamsh\.exasol\personal\deployments\default\secrets.json`, certificate validation off.
   Gives a table browser and result grids.
3. **A small "Data" page in Atheria** (about 1 hour): list reports read from Exasol. Worth doing only if the demo
   needs to show the database live, which also serves the "Exasol in the middle" point of the pitch.

## 5. Privacy

Textract and Bedrock receive the photo and text. Use only synthetic or sample medicine packs and made-up patient
details. No real patient data, in line with the rules in [AGENTS.md](../AGENTS.md).

## 6. Open questions

1. Who has the AWS sandbox login: you, Aditya, or still with the organisers?
2. Who builds steps 2 to 4 (AWS) and who builds steps 5 and 6 (Exasol and Atheria)? They can run in parallel.
3. When is the final pitch on 14 November?
