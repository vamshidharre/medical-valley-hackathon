#!/usr/bin/env python3
"""
Atheria web — static file server, one real AI endpoint, one real database.

Serves this folder exactly like `python3 -m http.server`, plus:
  - POST /api/extract, /api/extract_case — the genuinely live AI calls: a
    report's or case's free text goes to the real Anthropic API (Claude),
    which returns structured facts with verbatim quotes.
  - POST /api/exasol/literature, POST /api/exasol/case_review,
    GET /api/exasol/status — the genuinely live database calls: literature
    sweep results and confirmed case reviews are written to a real local
    Exasol database (schema ATHERIA_PV), the same one this project's Exasol
    MCP server is connected to. Nothing else in this file is AI or a real
    external system — the rest of the site still runs its deterministic
    rules and statistics entirely in the browser, as before.

Setup:
  Use this project's own virtualenv (keeps pyexasol off the system Python):
    python3 -m venv .venv
    ./.venv/bin/pip install flask python-dotenv requests pyexasol
  cp .env.example .env        # then put your real Claude key in .env
  ./.venv/bin/python server.py   # serves on http://127.0.0.1:8790

The Claude key is read server-side from .env (via python-dotenv) or the
shell environment — never sent to or embedded in the browser. Exasol
connects as the local starter kit's admin user, with the password read at
run time from its own credentials file (never logged, never embedded in the
browser either). The frontend only ever calls this server's own routes.
"""
import datetime
import hashlib
import json
import os

from flask import Flask, Response, jsonify, request, send_from_directory

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # .env support is optional; plain environment variables still work

try:
    import requests
except ImportError:
    requests = None

try:
    import pyexasol
except ImportError:
    pyexasol = None

HERE = os.path.dirname(os.path.abspath(__file__))
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5").strip()
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

EXASOL_DSN = os.environ.get("EXASOL_DSN", "127.0.0.1:8563").strip()
EXASOL_USER = os.environ.get("EXASOL_USER", "sys").strip()
EXASOL_PASSWORD_FILE = os.environ.get("EXASOL_PASSWORD_FILE", os.path.expanduser("~/.exasol-starter-kit/credentials/personal_sys_password")).strip()
EXASOL_SCHEMA = "ATHERIA_PV"


def exasol_connect():
    if pyexasol is None:
        raise RuntimeError("The 'pyexasol' package is not installed. Run: ./.venv/bin/pip install pyexasol")
    if not os.path.exists(EXASOL_PASSWORD_FILE):
        raise RuntimeError(f"Exasol password file not found at {EXASOL_PASSWORD_FILE}. Set EXASOL_PASSWORD_FILE or start the local Exasol starter kit (exakit start).")
    with open(EXASOL_PASSWORD_FILE) as fh:
        password = fh.read().strip()
    return pyexasol.connect(dsn=EXASOL_DSN, user=EXASOL_USER, password=password, websocket_sslopt={"cert_reqs": 0}, schema=EXASOL_SCHEMA)


app = Flask(__name__)

TOOL = {
    "name": "extract_icsr_criteria",
    "description": "Extract the four ICSR validity criteria from a pharmacovigilance report. For each, say whether it is present in the text, and if so, the exact verbatim quote that proves it.",
    "input_schema": {
        "type": "object",
        "properties": {
            k: {
                "type": "object",
                "properties": {
                    "present": {"type": "boolean", "description": "True only if this is clearly stated in the text."},
                    "quote": {"type": ["string", "null"], "description": "Exact words copied character-for-character from the source text. Null if not present. Never paraphrase."}
                },
                "required": ["present"]
            }
            for k in ["identifiable_patient", "identifiable_reporter", "suspect_product", "adverse_event"]
        },
        "required": ["identifiable_patient", "identifiable_reporter", "suspect_product", "adverse_event"]
    }
}

SYSTEM = (
    "You are a pharmacovigilance intake reader. You read one report's free text and decide, "
    "strictly from the words actually written, whether each of four ICSR criteria is present: "
    "an identifiable patient, an identifiable reporter, a suspect product, and an adverse event. "
    "For every criterion you mark present, you must quote the exact words from the text that prove "
    "it — copied character-for-character, never paraphrased, never translated, never summarised. "
    "If the text does not clearly establish a criterion, mark it absent. Never guess or infer beyond "
    "what is written. Call the extract_icsr_criteria tool with your answer, and nothing else."
)

CASE_FIELDS = ["patient_demographics", "product_and_dose", "onset", "dechallenge", "rechallenge", "seriousness", "concomitant_medications", "outcome"]
CASE_TOOL = {
    "name": "extract_case_detail",
    "description": "Extract a detailed pharmacovigilance case review from a confirmed ICSR's free text, one field at a time, each with a verbatim quote.",
    "input_schema": {
        "type": "object",
        "properties": {
            k: {
                "type": "object",
                "properties": {
                    "value": {"type": "string", "description": "A short value or category for this field (e.g. 'positive', 'negative', 'not done', 'unknown', or a short description). Use 'unknown' if the text does not say."},
                    "quote": {"type": ["string", "null"], "description": "Exact words copied character-for-character from the source text supporting this value. Null if the field is unknown."}
                },
                "required": ["value"]
            }
            for k in CASE_FIELDS
        },
        "required": CASE_FIELDS
    }
}
CASE_SYSTEM = (
    "You are a pharmacovigilance case reviewer. This case has already been confirmed as a valid ICSR by a human "
    "reviewer — your job now is a deeper field-by-field read of the same free text, strictly from the words "
    "actually written. For each field, give a short value and, if the text supports it, the exact verbatim quote "
    "that proves it — copied character-for-character, never paraphrased. If the text does not say, the value must "
    "be 'unknown' (or 'not done' for dechallenge/rechallenge if explicitly stated as not attempted) and the quote "
    "must be null. Never guess or infer beyond what is written. Fields: patient_demographics (age, sex, any "
    "identifying detail), product_and_dose (the suspect product and its dose/frequency if stated), onset (time "
    "from starting the product to the event), dechallenge (what happened when the product was stopped: positive/"
    "negative/not done/unknown), rechallenge (what happened if the product was restarted: positive/negative/not "
    "done/unknown), seriousness (why the event is or is not serious, e.g. hospitalisation), concomitant_medications "
    "(other medications mentioned, or 'none mentioned'), outcome (recovered/recovering/not recovered/fatal/"
    "unknown). Call the extract_case_detail tool with your answer, and nothing else."
)


def call_claude(system, tools, text):
    if not ANTHROPIC_API_KEY:
        return None, (jsonify({"ok": False, "error": "ANTHROPIC_API_KEY is not set. Add it to a .env file next to server.py (see .env.example), then restart the server."}), 501)
    if requests is None:
        return None, (jsonify({"ok": False, "error": "The 'requests' package is not installed on the server. Run: pip install requests"}), 500)
    if not text:
        return None, (jsonify({"ok": False, "error": "No text provided."}), 400)
    if len(text) > 8000:
        text = text[:8000]

    try:
        resp = requests.post(
            ANTHROPIC_URL,
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": ANTHROPIC_MODEL,
                "max_tokens": 1536,
                "system": system,
                "tools": tools,
                "messages": [{"role": "user", "content": "Report text:\n\n" + text}],
            },
            timeout=30,
        )
    except Exception as e:
        return None, (jsonify({"ok": False, "error": f"Could not reach the Anthropic API: {e}"}), 502)

    if resp.status_code != 200:
        try:
            detail = resp.json().get("error", {}).get("message", resp.text[:300])
        except Exception:
            detail = resp.text[:300]
        return None, (jsonify({"ok": False, "error": f"Anthropic API error ({resp.status_code}): {detail}"}), 502)

    data = resp.json()
    tool_block = next((b for b in data.get("content", []) if b.get("type") == "tool_use"), None)
    if not tool_block:
        return None, (jsonify({"ok": False, "error": "The model did not return structured output."}), 502)
    return (tool_block.get("input", {}), data), None


@app.route("/api/extract", methods=["POST"])
def extract():
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()
    result, err = call_claude(SYSTEM, [TOOL], text)
    if err:
        return err
    elements, data = result
    return jsonify({"ok": True, "elements": elements, "model": data.get("model", ANTHROPIC_MODEL), "usage": data.get("usage", {})})


@app.route("/api/extract_case", methods=["POST"])
def extract_case():
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()
    result, err = call_claude(CASE_SYSTEM, [CASE_TOOL], text)
    if err:
        return err
    fields, data = result
    return jsonify({"ok": True, "fields": fields, "model": data.get("model", ANTHROPIC_MODEL), "usage": data.get("usage", {})})


# ---------------------------------------------------------------------------
# Exasol — the one real database in this build. Literature sweep results and
# confirmed case reviews are written here, in schema ATHERIA_PV, on the same
# local Exasol instance this project's Exasol MCP server is connected to.
# Writes use the kit's admin connection (pyexasol) because the MCP path is
# deliberately read-only (SELECT-only) — by design, not an oversight; the MCP
# server itself was used to create and verify this schema. Anything written
# here is immediately visible to a SELECT through the MCP server too.
# ---------------------------------------------------------------------------

@app.route("/api/exasol/literature", methods=["POST"])
def exasol_literature():
    body = request.get_json(silent=True) or {}
    rows = body.get("rows") or []
    if not rows:
        return jsonify({"ok": False, "error": "No rows provided."}), 400
    try:
        C = exasol_connect()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502
    try:
        inserted = 0
        for r in rows:
            source_hash = hashlib.sha256((r.get("abstract_text") or "").encode("utf-8")).hexdigest()
            row_id = source_hash[:32]
            exists = C.execute("SELECT COUNT(*) FROM ATHERIA_PV.LITERATURE_PAPERS WHERE ID = {id}", {"id": row_id}).fetchval()
            if exists:
                continue
            C.execute(
                "INSERT INTO ATHERIA_PV.LITERATURE_PAPERS (ID, PMID, QUERY_TEXT, TITLE, ABSTRACT_TEXT, OUTCOME, "
                "CRITERIA_PATIENT, CRITERIA_REPORTER, CRITERIA_PRODUCT, CRITERIA_EVENT, SOURCE_HASH, INGESTED_AT) "
                "VALUES ({id}, {pmid}, {q}, {title}, {abstract}, {outcome}, {cp}, {cr}, {cpr}, {ce}, {hash}, {ts})",
                {
                    "id": row_id, "pmid": r.get("pmid"), "q": (r.get("query") or "")[:500], "title": (r.get("title") or "")[:2000],
                    "abstract": (r.get("abstract_text") or "")[:10000], "outcome": r.get("outcome"),
                    "cp": bool(r.get("criteria_patient")), "cr": bool(r.get("criteria_reporter")),
                    "cpr": bool(r.get("criteria_product")), "ce": bool(r.get("criteria_event")),
                    "hash": source_hash, "ts": datetime.datetime.utcnow(),
                },
            )
            inserted += 1
        C.commit()
        total = C.execute("SELECT COUNT(*) FROM ATHERIA_PV.LITERATURE_PAPERS").fetchval()
    except Exception as e:
        return jsonify({"ok": False, "error": f"Exasol write failed: {e}"}), 502
    finally:
        C.close()
    return jsonify({"ok": True, "inserted": inserted, "skipped_duplicates": len(rows) - inserted, "total_in_exasol": total})


@app.route("/api/exasol/case_review", methods=["POST"])
def exasol_case_review():
    body = request.get_json(silent=True) or {}
    rec = body.get("record_id")
    if not rec:
        return jsonify({"ok": False, "error": "No record_id provided."}), 400
    f = body.get("fields") or {}
    row_id = hashlib.sha256((rec + str(body.get("reviewed_at") or "")).encode("utf-8")).hexdigest()[:32]
    try:
        C = exasol_connect()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502
    try:
        def fv(k):
            v = f.get(k) or {}
            return (v.get("value") or "")[:2000]
        C.execute(
            "INSERT INTO ATHERIA_PV.CASE_REVIEWS (ID, RECORD_ID, CHANNEL, FINAL_OUTCOME, PATIENT_DEMOGRAPHICS, "
            "PRODUCT_AND_DOSE, ONSET, DECHALLENGE, RECHALLENGE, SERIOUSNESS, CONCOMITANT_MEDICATIONS, OUTCOME_FIELD, "
            "FIELDS_ACCEPTED, FIELDS_REJECTED, FIELDS_TOTAL, CASE_MODEL, REVIEWED_BY, REVIEWED_AT) "
            "VALUES ({id}, {rec}, {channel}, {outcome}, {patient}, {product}, {onset}, {dechal}, {rechal}, "
            "{serious}, {concom}, {outf}, {acc}, {rej}, {tot}, {model}, {reviewer}, {ts})",
            {
                "id": row_id, "rec": rec, "channel": body.get("channel"), "outcome": body.get("final_outcome"),
                "patient": fv("patient_demographics"), "product": fv("product_and_dose"), "onset": fv("onset"), "dechal": fv("dechallenge"),
                "rechal": fv("rechallenge"), "serious": fv("seriousness"), "concom": fv("concomitant_medications"), "outf": fv("outcome"),
                "acc": int(body.get("accepted") or 0), "rej": int(body.get("rejected") or 0), "tot": int(body.get("total") or 0),
                "model": body.get("model"), "reviewer": body.get("reviewed_by"), "ts": datetime.datetime.utcnow(),
            },
        )
        C.commit()
        total = C.execute("SELECT COUNT(*) FROM ATHERIA_PV.CASE_REVIEWS").fetchval()
    except Exception as e:
        return jsonify({"ok": False, "error": f"Exasol write failed: {e}"}), 502
    finally:
        C.close()
    return jsonify({"ok": True, "total_in_exasol": total})


@app.route("/api/exasol/status", methods=["GET"])
def exasol_status():
    try:
        C = exasol_connect()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502
    try:
        lit = C.execute("SELECT COUNT(*) FROM ATHERIA_PV.LITERATURE_PAPERS").fetchval()
        cases = C.execute("SELECT COUNT(*) FROM ATHERIA_PV.CASE_REVIEWS").fetchval()
    except Exception as e:
        return jsonify({"ok": False, "error": f"Exasol read failed: {e}"}), 502
    finally:
        C.close()
    return jsonify({"ok": True, "schema": EXASOL_SCHEMA, "dsn": EXASOL_DSN, "literature_papers": lit, "case_reviews": cases})


@app.route("/", endpoint="root")
def root():
    return send_from_directory(HERE, "index.html")


@app.route("/<path:path>", endpoint="static_files")
def static_files(path):
    full = os.path.join(HERE, path)
    if os.path.isdir(full):
        path = os.path.join(path, "index.html")
    return send_from_directory(HERE, path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8790))
    if not ANTHROPIC_API_KEY:
        print(f"[server] WARNING: ANTHROPIC_API_KEY not set — /api/extract will return an error until it is. See .env.example.")
    print(f"[server] Atheria web serving http://127.0.0.1:{port}  (model: {ANTHROPIC_MODEL})")
    app.run(host="127.0.0.1", port=port, debug=False)
