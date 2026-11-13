# Atheria pipeline plan

Status: **agreed in the team meeting on 2026-11-13, not started.** Open questions at the bottom must be answered
before building.

Atheria (the company portal) is to implement four stages. Text in the "Meeting decision" column is what the
team said; everything else is analysis and is marked as such.

## The four stages

| # | Stage | Meeting decision | Human check |
|---|---|---|---|
| 1 | Case intake and triage | Exasol database, MCP, AWS, Exasol agents | Yes: a human checks the result again |
| 2 | MedDRA encoding | ML algorithm, checked against the Exasol database; explainability by an Exasol agent | Not stated in the meeting |
| 3 | Signal detection | Hard coded | Not stated |
| 4 | Audit trail | Exasol agents, stored in the database | Not stated |

## What exists today (checked in the code, 2026-11-13)

Atheria is a static site with no backend: `PV Teams/atheria-web`, served by `python -m http.server`. Everything
runs in the browser. There is no Exasol, MCP or AWS code anywhere in the repo.

| Stage | Today | Where |
|---|---|---|
| 1 Intake and triage | Offline stand-in: `A.triage(text, channel)` applies rules in the browser; inbox is kept in `localStorage`. The 5 sample records are cached outputs from an earlier project. | `js/core.js`, `js/views-a.js` (`inbox`, `report`, `workbench`) |
| 2 MedDRA encoding | No encoder. Cached fields such as `coded_pt` / `coded_llt` with a confidence, labelled MedDRA 27.1, produced earlier by an LLM prompt `coding_meddra_v1.0`. | `js/data.js` |
| 3 Signal detection | Already deterministic: PRR, chi-squared and the Evans criteria (PRR >= 2, chi-squared >= 4, cases >= 3) over 1,261 synthetic reports and 102 drug-event pairs. | `js/engine.js`, `js/views-b.js` |
| 4 Audit trail | Hash-chained event log verified in the browser; 120 original events plus new ones in `localStorage`. | `js/core.js` (`A.auditAdd`), `js/views-b.js` (`audit`) |

SafeReport (the patient app, `safereport/`) has a FastAPI server but does not send reports to Atheria.

## Analysis and suggestions (not yet agreed)

1. **A backend is needed.** Database credentials cannot live in browser JavaScript. Suggestion: extend the
   existing `safereport/server.py` (FastAPI) with endpoints for Atheria and serve the portal from it, so one
   server holds the Exasol connection and both apps share it.
2. **Stage 1 connects the two apps.** SafeReport submit writes a row to an Exasol `reports` table; Atheria's inbox
   reads from it. Triage (is this a valid case: identifiable patient, reporter, suspect drug, adverse event)
   runs on intake, then the reviewer confirms or corrects.
3. **MedDRA is licensed.** The dictionary may only be used with an MSSO subscription. Without one, use a small
   synthetic term list for the demo and say so on screen. Do not commit MedDRA files to the repo.
4. **Stage 2 encoder, simplest version that meets "ML + explainable":** match the reported words to the term
   list by text similarity, show the top 3 candidate terms with scores and the exact words that matched, and
   send anything below a confidence threshold to a human.
5. **Stage 3 can stay as it is** if "hard coded" means fixed rules. Option: run the same counts as SQL in Exasol
   so the numbers come from the database.
6. **Stage 4:** one append-only Exasol table (`who, what, when, before, after, hash, previous_hash`), written by
   the backend on every AI proposal and every human decision. Keep the existing hash chain.
7. **Every stage needs a visible human check** to meet the challenge's rule that a human stays responsible. The
   meeting named it only for stage 1.
8. **Synthetic data only.** No real patient data in the repo or in any cloud service.

## Exasol: what is available (researched 2026-11-13)

The team has no Exasol instance yet. Sources: [Exasol Personal docs v2.4](https://exasol.github.io/exasol-personal/latest/),
[exasol/mcp-server](https://github.com/exasol/mcp-server), [Exasol Community](https://community.exasol.com/).

- **Exasol Personal** is the free, full database for one user, with no data-size limit. It runs locally on
  Windows, macOS or Linux, or in your own AWS, Azure, Exoscale or STACKIT account. Installing it means
  accepting the Exasol Personal licence agreement.
- **Local on Windows** needs Windows 10+ on AMD64 and either Docker Desktop (Linux containers, Docker Engine
  29+) or Podman, which the launcher can install through `winget`. Commands:
  `curl https://downloads.exasol.com/exasol-personal/installer.sh | sh` (the docs give this for WSL), then
  `exasol install local`, then `exasol info` for connection details. Default port 8563, user `sys`, random
  password stored in the deployment's `secrets.json`.
- **AWS is optional.** It needs an AWS account, an IAM user with Exasol's policy, and it costs money while
  running. Local is free and enough for a demo.
- **MCP server:** `exasol mcp enable` starts the official Exasol MCP server next to a local database at
  `http://127.0.0.1:4896/mcp`. It lets an AI agent list schemas and tables and run queries. It is
  **read-only** (write tools disabled), has no authentication, and listens only on the local machine.
  It can also be installed alone (`uv tool install exasol-mcp-server`, Python 3.11+) or embedded in Python.
- **"Exasol agents":** no product with this name was found. What exists is (a) the MCP server, which any AI
  agent can use, and (b) [Exasol Agent Skills](https://github.com/exasol-labs/exasol-agent-skills), which teach
  coding tools such as Claude Code or Codex to install Exasol and write its SQL. The agent itself is ours to
  build: an LLM plus the MCP server.
- **Writing data** (new reports, audit events) cannot go through the MCP server. The backend must write with
  a normal database driver such as `pyexasol`.

### What this means for the four stages

| Stage | Exasol's role |
|---|---|
| 1 Intake and triage | Backend writes each report to a `reports` table (`pyexasol`). An agent can read history through MCP, for example "has this patient or batch been reported before?", and show the rows it used as evidence. |
| 2 MedDRA encoding | Term list stored as a table; the encoder looks candidates up there. The agent explains a coding by quoting the matched term rows. |
| 3 Signal detection | The fixed PRR counts can run as one SQL query over `reports`. |
| 4 Audit trail | Append-only `audit` table written by the backend. An agent can answer "who changed this case and why?" through MCP, read-only. |

### This laptop (checked 2026-11-13)

Windows 11, x64, 15.4 GB RAM. Docker Desktop is installed but was not running, so its engine version is
unverified. `winget`, WSL and `uv` are present. Podman and the `exasol` launcher are not installed.

### Local install on Windows (done 2026-11-13 on Vamshi's laptop)

Decision: run Exasol locally for development; the AWS sandbox from the organisers stays as an option for the
final demo (ask what it includes, for example an LLM through Amazon Bedrock).

**State:** installed and verified. Launcher 2.4.0 at `C:\Users\vamsh\.local\bin\exasol.exe`; database
`2026.2.0-nano.8` running in Docker container `exasol-db-*` (image `exasol/nano`, 812 MB) on `127.0.0.1:8563`,
user `sys`. A test query through `pyexasol` (installed in `safereport/.venv`) returned the user and version.
Deployment files, including the password in `secrets.json`, are in
`C:\Users\vamsh\.exasol\personal\deployments\default`, outside the repo.

Connect from Python (self-signed certificate, so validation is off for local use):

```python
import json, os, pyexasol
pw = json.load(open(os.path.expanduser("~/.exasol/personal/deployments/default/secrets.json")))["dbPassword"]
conn = pyexasol.connect(dsn="127.0.0.1:8563", user="sys", password=pw, websocket_sslopt={"cert_reqs": 0})
```

**MCP server:** enabled with `exasol mcp enable` (2026-11-13). Container `exasol-db-*-sidecar-mcp`
(`exasol/mcp-server:2.2.0`, 663 MB) serves `http://127.0.0.1:4896/mcp`, read-only, no authentication, local
machine only. A plain GET returns HTTP 406, which is normal; MCP clients send the right headers.
To register it in a coding tool run `exasol mcp instructions <client>` (for example `claude-code`).

**Why Docker:** the Exasol database only ships as a Linux container. On Windows the launcher runs it through
Docker Desktop or Podman (Exasol system requirements). Docker was already installed on this laptop; Podman
would have needed a separate install. The database image turned out to be 812 MB, much smaller than the 3 to 4 GB
estimated earlier from Docker Hub (that was the full on-premise image, not the `nano` image Personal uses).

After a reboot: start Docker Desktop (`docker desktop start`), then `exasol status`, and `exasol start` if it
is stopped. The database only listens on this laptop, so teammates cannot reach it over the network.

To repeat the install on another Windows machine: the official `installer.sh` only supports macOS and Linux,
so download the launcher directly from the same Exasol bucket the installer uses. In PowerShell, with Docker
Desktop running:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.local\bin" | Out-Null
curl.exe -fSL "https://x-up.s3.eu-west-1.amazonaws.com/releases/exasol-personal/windows/x86_64/latest/exasol.exe" -o "$env:USERPROFILE\.local\bin\exasol.exe"
& "$env:USERPROFILE\.local\bin\exasol.exe" version
& "$env:USERPROFILE\.local\bin\exasol.exe" install local --container-engine docker
& "$env:USERPROFILE\.local\bin\exasol.exe" info
& "$env:USERPROFILE\.local\bin\exasol.exe" mcp enable
```

The launcher is about 170 MB; the database image is a further 3 to 4 GB. `exasol info` prints the host, port
and where the `sys` password is stored. Put those in `safereport/.env`, never in git.

### Exasol-provided data (checked 2026-11-13)

The organisers said teams can use Exasol's data. Searched the challenge page, the Exasol interview, Exasol
Personal docs and the Exasol community. **No healthcare dataset is published anywhere public.** The only
Exasol sample data is online-shop data: `PRODUCTS` (1,000,000 rows, 27 MiB) and `PRODUCT_REVIEWS`
(1,822,007 rows, 155 MiB), loaded by `exasol connect -f sample.sql` from a public S3 bucket. It is not
healthcare data. Slide 6 of the Exasol deck says teams bring "synthetic or authorised healthcare data";
Exasol supplies the database, not a healthcare dataset (see
[CHALLENGE_SLIDES_AND_GAP_ANALYSIS.md](CHALLENGE_SLIDES_AND_GAP_ANALYSIS.md)). Our own synthetic seed data is
loaded (see below).

**Checked by loading it (2026-11-13):** `SAMPLE.PRODUCTS` (1,000,000 rows) is now in the local Exasol. Columns:
`id, product_category, product_name, price_usd, inventory_count, margin`. It is generic retail goods (12+
categories, 50,000 rows each, for example keyboards, sun shades, craft scissors, power banks), not medicines;
even the "Health & Household" category holds the same kind of goods. `SAMPLE.PRODUCT_REVIEWS` (1.8 M rows): the
import from S3 timed out once (network); a retry was still running when this was written. Neither table helps
pharmacovigilance; drop them with `DROP SCHEMA SAMPLE CASCADE` when no longer wanted.

### Seed data loaded into Exasol (done 2026-11-13)

`db/load_exasol.py` (run with `safereport/.venv/Scripts/python.exe db/load_exasol.py`) created schema `PV`:

| Object | Content |
|---|---|
| `PV.REPORTS` | 1,261 synthetic reports from `js/data.js` (166 with narrative and cached extraction JSON), `report_source = 'synthetic_seed'` |
| `PV.AUDIT` | the 120 hash-chained audit events; `payload_json` is the exact canonical string that was hashed |
| `PV.SIGNALS` | view: PRR, ROR with 95% CI, chi-squared, Evans criteria per drug-event pair |

Verified: `PV.SIGNALS` matches `Engine.computeAll` in `js/engine.js` on all 102 pairs (7 signals, no
differences), and `Engine.verifyChain` accepts the audit chain read back from Exasol. The loader fills a table
only when it is empty, so later rows survive a re-run; `--reset` drops and reloads.

### Atheria reads signals from Exasol (done 2026-11-13)

- `safereport/server.py` now serves Atheria at **http://localhost:8765/atheria/?demo=1** and has
  `GET /api/pv/signals`: rows of `PV.SIGNALS`, the query used, the view's SQL read from `EXA_ALL_VIEWS`, and the
  report count. Returns 503 if Exasol is not reachable.
- On start, Atheria (`js/core.js`, `A.loadDbSignals`) uses those rows for every signal screen and keeps its own
  browser calculation as an independent cross-check. The Signal detection page shows a card "Where these
  numbers come from": Exasol badge, the cross-check result (102 of 102 pairs agree), and the SQL on request.
- Served the old way (`python -m http.server`), Atheria falls back to the browser calculation and says so on
  the page.
- Checked in the browser: Exasol source, 102/102 agree, 7 signals, signal detail opens, fallback message shows
  when the API fails, SafeReport still served at `/`. Case rows behind a signal stay in `js/data.js` (decided
  2026-11-13: not needed). The inbox and audit trail are still browser-only.

## Open questions for the team

1. **Where does Exasol run for the demo:** locally on one laptop (free, recommended) or on AWS?
2. **"Exasol agents":** did the meeting mean our own LLM agent using the Exasol MCP server, as described above?
3. **Which LLM drives the agent?** SafeReport already uses Claude through `ANTHROPIC_API_KEY`; no key is set yet.
4. **AWS:** is it still needed at all if Exasol runs locally?
5. **MedDRA licence:** does anyone have one? If not, is a synthetic term list acceptable?
6. ~~**Signal detection:** keep the in-browser calculation, or move it to SQL in Exasol?~~ Done: SQL in Exasol,
   browser calculation kept as a cross-check.
7. **Who builds which stage, and what is the deadline?**
