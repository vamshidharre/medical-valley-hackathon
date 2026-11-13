"""SafeReport server: serves the web app and (optionally) powers it with real OCR + Claude.

The frontend works without this server (simulated AI). When this server is running it
adds:  POST /api/extract  (photo -> OCR -> Claude -> medicine fields)
       POST /api/chat     (Claude-driven side-effect interview)
It reuses the existing OCR service in ../testing_purpose-main/ocr extract unchanged.
"""
import base64
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OCR_DIR = HERE.parent / "testing_purpose-main" / "ocr extract"


def _load_dotenv(path: Path):
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                if v.strip():
                    os.environ[k.strip()] = v.strip().strip('"')


_load_dotenv(HERE / ".env")
from fastapi import FastAPI, File, HTTPException, UploadFile  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

# --- existing OCR service (optional: server still runs if it can't be imported) ---------
OCR_OK, OCR_ERR = False, ""
try:
    sys.path.insert(0, str(OCR_DIR))
    from app.extractor import parse_medicine  # noqa: E402
    from app.preprocess import prepare_image  # noqa: E402
    OCR_OK = True
except Exception as e:  # pragma: no cover
    OCR_ERR = str(e)

MODEL = os.getenv("SAFEREPORT_MODEL", "claude-sonnet-5-5")
# LLM_ENGINE=bedrock sends every model call through Amazon Bedrock (same calls, Bedrock model id in
# SAFEREPORT_MODEL, AWS_REGION and the AWS_* keys in .env). Default: Anthropic API with ANTHROPIC_API_KEY.
LLM_ENGINE = os.getenv("LLM_ENGINE", "anthropic").lower()
_client = None


def claude():
    global _client
    if _client is None:
        if LLM_ENGINE == "bedrock":
            if os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"):
                import anthropic
                _client = anthropic.AnthropicBedrock(
                    aws_region=os.getenv("AWS_REGION", "us-east-1"),
                    aws_access_key=os.getenv("AWS_ACCESS_KEY_ID"),
                    aws_secret_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
                    aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
                    timeout=40,
                )
        elif os.getenv("ANTHROPIC_API_KEY"):
            import anthropic
            _client = anthropic.Anthropic(timeout=40)
    return _client


def ask_claude(system: str, content, max_tokens=900) -> dict:
    """Free-text JSON call (chat / listen). Tolerates code fences and prose around the JSON; retries once."""
    last = ""
    for attempt in range(2):
        msg = claude().messages.create(model=MODEL, max_tokens=max_tokens, system=system,
                                       messages=[{"role": "user", "content": content}])
        text = "".join(b.text for b in msg.content if b.type == "text")
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
        last = f"stop_reason={msg.stop_reason}, reply={text[:120]!r}"
    raise ValueError(f"Claude returned no usable JSON ({last})")


FORM_TOOL = {
    "name": "fill_form",
    "description": "Return the transcription of the pack photo and the filled form fields.",
    "input_schema": {"type": "object", "properties": {
        "name": {"type": "string", "description": "brand name as printed (generic name if no brand)"},
        "dose": {"type": "string", "description": "active ingredient(s) + strength + dosage form"},
        "batch": {"type": "string", "description": "batch / lot number only"},
        "manufacturer": {"type": "string", "description": "company that manufactured or marketed it"},
        "text": {"type": "string", "description": "full transcription of ALL visible text, one line per text line"},
        "boxes": {"type": "object", "description": "Where each value is printed on the image. Coordinates are fractions "
                  "from 0 to 1 of the full image width/height, origin top-left. Omit a key if the value is not visible.",
                  "properties": {k: {"type": "object", "properties": {"x0": {"type": "number"}, "y0": {"type": "number"},
                                 "x1": {"type": "number"}, "y1": {"type": "number"}}, "required": ["x0", "y0", "x1", "y1"]}
                                 for k in ("name", "dose", "batch", "manufacturer")}}},
        "required": ["name", "dose", "batch", "manufacturer", "text", "boxes"]},
}


def ask_claude_tool(system: str, content, max_tokens=4096) -> dict:
    """Structured output via a forced tool call: always valid JSON, no free-text parsing."""
    msg = claude().messages.create(model=MODEL, max_tokens=max_tokens, system=system, tools=[FORM_TOOL],
                                   tool_choice={"type": "tool", "name": "fill_form"},
                                   messages=[{"role": "user", "content": content}])
    for b in msg.content:
        if b.type == "tool_use":
            return dict(b.input)
    raise ValueError(f"Claude gave no result (stop_reason={msg.stop_reason})")


_BOX = {"type": "object", "properties": {"x0": {"type": "number"}, "y0": {"type": "number"},
        "x1": {"type": "number"}, "y1": {"type": "number"}}, "required": ["x0", "y0", "x1", "y1"]}
LOCATE_TOOL = {"name": "locate", "description": "Report where each given text is printed on the image.",
               "input_schema": {"type": "object", "properties": {k: _BOX for k in ("name", "dose", "batch", "manufacturer")}}}
LOCATE_SYSTEM = """You are given a photo of a medicine pack and some text values read from it. For each value, find the exact
place where it is printed and return a TIGHT rectangle around only that text: normally one line or a short phrase, never
neighbouring lines. Coordinates are fractions 0-1 of the whole image width and height, origin top-left (x0,y0 top-left
corner, x1,y1 bottom-right corner). If a value is printed vertically or rotated, box the rotated text. Only report values
you can actually see. Use the locate tool."""


def locate_boxes(b64: str, mt: str, values: dict) -> dict:
    """Focused second pass: ask only for tight boxes around the already-known values."""
    wanted = "\n".join(f"- {k}: {v}" for k, v in values.items() if v)
    msg = claude().messages.create(model=MODEL, max_tokens=800, system=LOCATE_SYSTEM, tools=[LOCATE_TOOL],
        tool_choice={"type": "tool", "name": "locate"},
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}},
            {"type": "text", "text": "Locate these values on the image:\n" + wanted}]}])
    for b in msg.content:
        if b.type == "tool_use":
            return dict(b.input)
    return {}


def _clean_box(b):
    try:
        x0, y0, x1, y1 = (min(max(float(b[c]), 0.0), 1.0) for c in ("x0", "y0", "x1", "y1"))
    except (KeyError, TypeError, ValueError):
        return None
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1} if x1 - x0 > 0.01 and y1 - y0 > 0.005 else None


def _suspicious(b):
    """A box much taller/larger than any single line or phrase is almost certainly wrong."""
    w, h = b["x1"] - b["x0"], b["y1"] - b["y0"]
    return (h > 0.22 and w > h * 0.5 and w > 0.25) or w * h > 0.2


app = FastAPI(title="SafeReport")


@app.get("/api/health")
def health():
    return {"ok": True, "claude": claude() is not None, "model": MODEL,
            "ocr": OCR_OK, "ocr_error": OCR_ERR or None,
            "ocr_provider": f"claude-vision ({MODEL})" if OCR_ENGINE == "claude" else "nemotron-ocr-v2", "extract": (claude() is not None) if OCR_ENGINE == "claude" else bool(HF_TOKEN or NEMOTRON_URL)}


# --------------------------------------------------------------------------- extraction
EXTRACT_SYSTEM = """You fill a medicine-report form from raw OCR text of a medicine pack. The text may be noisy,
out of order, and may include lines read from rotated (vertical) printing, so look at ALL of it.
Return ONLY a JSON object: {"name": str, "dose": str, "batch": str, "manufacturer": str}.
- name: the medicine's brand name as printed (if no brand, the generic name).
- dose: active ingredient(s) with strength and dosage form, e.g. "Paracetamol 650 mg tablet".
- batch: the batch / lot number (labels like Batch, B.No, B. No., Lot, BN). Not the expiry, mfg date, MRP or licence number.
- manufacturer: the company that manufactured or marketed the product (after "Mfd./Manufactured/Marketed by").
Fix obvious OCR character errors only when the correct word is unambiguous (e.g. "Lid" -> "Ltd", "0" vs "O" inside a clearly alphabetic word).
Use "" for anything not present in the text. Never invent values."""


HF_TOKEN = os.getenv("HF_TOKEN", "")
NEMOTRON_URL = os.getenv("NEMOTRON_URL", "").rstrip("/")      # optional self-hosted GPU service
SPACE_ID = os.getenv("NEMOTRON_SPACE", "nvidia/nemotron-ocr-v2")  # NVIDIA's official Space
SPACE_MODEL = "Multilingual (en, zh, ja, ko, ru, …)"
_space = None


def _space_client():
    global _space
    if _space is None:
        from gradio_client import Client
        _space = Client(SPACE_ID, token=HF_TOKEN or None, verbose=False)
    return _space


def _ocr_space_one(path: str) -> str:
    from gradio_client import handle_file
    return _space_client().submit(handle_file(path), SPACE_MODEL, "layout", api_name="/run_ocr").result(timeout=150)[1]


def _meaningful(line: str) -> bool:
    """Filter the junk Nemotron produces when it reads text in the wrong orientation."""
    ln = line.strip()
    if len(ln) < 5:
        return False
    if _BATCH.search(ln) or re.search(r"\b(exp|mfg|mfd|date)\b", ln, re.I):
        return True
    ok = sum(c.isalnum() or c in " .,:/-()%&" for c in ln) / len(ln)
    return ok >= 0.9 and bool(re.search(r"\b(?=[A-Za-z]{3,}\b)[A-Za-z]*[aeiouAEIOU][A-Za-z]*\b", ln))


def _ocr_nemotron(data: bytes) -> str:
    """Nemotron OCR v2 reads horizontal text. Packs often print batch/expiry vertically, so the image is
    read upright and rotated 90 / 270 degrees in parallel; sideways passes keep only meaningful lines."""
    import io
    import tempfile
    from concurrent.futures import ThreadPoolExecutor
    from PIL import Image, ImageOps
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    paths = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, angle in enumerate((0, 90, 270)):
            p = f"{tmp}/v{i}.png"
            (img if angle == 0 else img.rotate(angle, expand=True)).save(p)
            paths.append(p)
        if NEMOTRON_URL:
            import requests

            def one(p):
                r = requests.post(f"{NEMOTRON_URL}/ocr", files={"file": ("p.png", open(p, "rb"), "image/png")}, timeout=150)
                r.raise_for_status()
                return r.json()["text"]
        else:
            one = _ocr_space_one
        upright = one(paths[0])                                 # failure of the main pass is an error
        sideways = []
        if not _parse_text(upright, {})["batch"]:               # save GPU quota: only look sideways if needed
            with ThreadPoolExecutor(2) as ex:
                for f in [ex.submit(one, p) for p in paths[1:]]:
                    try:
                        sideways.append(f.result())
                    except Exception:
                        pass                                    # sideways passes are best-effort
    extra = [ln for t in sideways for ln in t.splitlines() if _meaningful(ln)]
    return _clean("\n".join([upright] + extra))


def _clean(text: str) -> str:
    """Merge passes: drop duplicate lines and fix frequent OCR slips in company suffixes."""
    text = re.sub(r"\b(?:Lid|Ltcl)\b\.?", "Ltd.", text)
    seen, lines = set(), []
    for ln in text.splitlines():
        ln = ln.strip()
        key = re.sub(r"\W", "", ln).lower()
        if len(key) < 2 or key in seen:
            continue
        seen.add(key); lines.append(ln)
    return "\n".join(lines)


_BATCH = re.compile(r"(?:batch|b\.?\s*no|lot|b/?n)\s*(?:no\.?|number|#)?[\s:.\-]*([A-Z0-9][A-Z0-9\-/]{2,14})", re.I)
_MFR = re.compile(r"(?:mfg\.?|manufactured|marketed|mfd\.?)\s*(?:&\s*marketed\s*)?by\s*[:\-]?\s*([A-Za-z][^\n]{3,60})"
                  r"|(?:diproduksi|dipasarkan)\s+oleh\s*[:\-]?\s*([A-Za-z][^\n]{3,60})", re.I)
_CO = re.compile(r"\b(?:[A-Z][A-Za-z&.]+\s){0,3}(?:Pharma(?:ceuticals?)?|Laboratories|Healthcare|Lifesciences|Ltd\.?|Limited|Pvt\.?|Inc\.?|GmbH|Tbk)\b[^\n]{0,25}")
_DOSE = re.compile(r"\b(\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|iu)(?:\s*/\s*\d*\s*(?:ml|mg|g))?)\b", re.I)
_FORM = re.compile(r"\b(tablets?|capsules?|syrup|suspension|injection|cream|ointment|drops|kaplet|sirup)\b", re.I)


def _parse_text(text: str, parsed: dict) -> dict:
    """Pull fields from raw OCR text. Anything not clearly present stays empty (never guessed)."""
    batch = next((m.group(1) for m in _BATCH.finditer(text)
                  if re.search(r"\d", m.group(1)) and not re.fullmatch(r"(?:19|20)\d\d", m.group(1))), "")
    m = _MFR.search(text)
    mfr = ((m.group(1) or m.group(2)).strip(" .:-") if m else "")
    if not mfr:
        c = _CO.search(text)
        mfr = c.group(0).strip(" .:-") if c else ""
    comp = parsed.get("composition") or []
    if comp:
        dose = ", ".join(f"{c['ingredient']} {c['strength']}" for c in comp[:3])
    else:
        d = _DOSE.search(text)
        dose = d.group(1) if d else ""
    f = _FORM.search(text)
    if f and dose and f.group(1).lower() not in dose.lower():
        dose += " " + f.group(1).lower()
    return {"name": parsed.get("name") or "", "dose": dose, "batch": batch, "manufacturer": mfr}


OCR_ENGINE = os.getenv("OCR_ENGINE", "claude").lower()      # claude (default) | nemotron

VISION_SYSTEM = """You are the OCR engine of a medicine-safety app. Look at the photo of a medicine pack, strip or leaflet.
1. Transcribe EVERY piece of text you can see, exactly as printed, one line per text line. Include text printed
   vertically, sideways, upside down, curved around the pack, on coloured banners, on foil, and tiny print.
2. Then fill the form from that text.
Also give `boxes`: for name, dose, batch and manufacturer, a tight rectangle around the printed text the value came
from (x0,y0 = top-left, x1,y1 = bottom-right, as fractions 0-1 of the whole image). For dose use the line that states
the strength; for text printed vertically, give the tall rectangle around it. Be precise: the boxes are drawn on the photo.
Report the result with the fill_form tool.
- name: brand name as printed (if none, the generic name).
- dose: active ingredient(s) with strength and dosage form, e.g. "Paracetamol 650 mg tablet".
- batch: the batch / lot number (labels like Batch, B.No, B. No., Lot, BN). Not expiry, mfg date, MRP or licence numbers.
- manufacturer: the company that manufactured or marketed it (after Mfd./Manufactured/Marketed by).
Use "" for anything you cannot read clearly. Never invent or guess values. If there is no readable text, return empty strings."""


def _prep_for_claude(data: bytes) -> tuple[str, str]:
    """Normalise any upload to an upright JPEG (<= 2000px) that Claude accepts."""
    import io
    from PIL import Image, ImageOps
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    img.thumbnail((2000, 2000))
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode(), "image/jpeg"


@app.post("/api/extract")
async def extract(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    mime = file.content_type or "image/jpeg"
    text, parsed, errors, engine = "", {}, [], ""
    if OCR_ENGINE == "claude":
        if not claude():
            raise HTTPException(503, "Claude OCR needs ANTHROPIC_API_KEY in safereport/.env")
        try:
            b64, mt = _prep_for_claude(data)
        except Exception:
            raise HTTPException(400, "File is not a readable image")
        try:
            r = ask_claude_tool(VISION_SYSTEM, [
                {"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}},
                {"type": "text", "text": "Read this pack."}])
        except Exception as e:
            raise HTTPException(502, f"Claude OCR failed: {str(e)[:250]}")
        text = str(r.get("text") or "").strip()
        out = {k: str(r.get(k) or "").strip() for k in ("name", "dose", "batch", "manufacturer")}
        if not text and not any(out.values()):
            raise HTTPException(422, "No readable text found in the image")
        if text and not out["batch"]:                       # safety net if the model left batch blank
            out["batch"] = _parse_text(text, {})["batch"]
        boxes = {}
        for k, b in (r.get("boxes") or {}).items():
            cb = _clean_box(b)
            if cb and out.get(k):
                boxes[k] = cb
        redo = {k: out[k] for k in ("name", "dose", "batch", "manufacturer")
                if out.get(k) and (k not in boxes or _suspicious(boxes[k]))}
        if redo:                                              # focused re-check of missing / implausible boxes
            try:
                for k, b in locate_boxes(b64, mt, redo).items():
                    cb = _clean_box(b)
                    if cb and k in redo and not _suspicious(cb):
                        boxes[k] = cb
                    elif k in boxes and _suspicious(boxes[k]):
                        boxes.pop(k)
            except Exception:
                for k in redo:
                    if k in boxes and _suspicious(boxes[k]):
                        boxes.pop(k)
        return {**out, "boxes": boxes, "source": "claude-vision", "engine": "Claude Haiku vision", "raw_text": text, "warnings": []}
    # --- optional engine: Nemotron OCR v2 (Hugging Face Space / self-hosted) + Claude to fill the form ---
    try:
        if OCR_OK:
            data, mime = prepare_image(data, mime)
        text = _ocr_nemotron(data)
        engine = "Nemotron OCR v2" + (" (self-hosted)" if NEMOTRON_URL else " (Hugging Face)")
        parsed = parse_medicine(text) if OCR_OK else {}
    except Exception as e:
        errors.append(f"Nemotron OCR: {str(e)[:300]}")
    if claude() and text.strip():
        try:
            r = ask_claude(EXTRACT_SYSTEM, f"OCR text:\n{text}", 400)
            return {**{k: str(r.get(k) or "") for k in ("name", "dose", "batch", "manufacturer")},
                    "source": "ocr+llm", "engine": engine, "raw_text": text, "warnings": errors}
        except Exception as e:
            errors.append(f"LLM: {str(e)[:200]} (used rule-based parsing)")
    if text.strip():
        return {**_parse_text(text, parsed), "source": "ocr", "engine": engine, "raw_text": text, "warnings": errors}
    raise HTTPException(503, "; ".join(errors) or "No readable text found in the image")


OCR_LOG: list[str] = []

# ------------------------------------------------------------------------------- chat
FIELDS_DOC = """Fields to capture (use these exact keys). Priority order: the adverse event first, then the patient's
identifiers, then the rest.
reaction (the adverse event / side effect, in plain words), onset (the onset DATE if known, e.g. "13 Nov 2026",
otherwise relative to the dose, e.g. "3 hours after the first dose"), initials (the patient's initials only, e.g. "R.K."
- never ask for or store the full name), age (e.g. "54 years"), sex, severity (mild/moderate/severe/serious + whether
hospital or doctor care was needed), action (what was done with the medicine: stopped/reduced/continued), outcome
(recovered/improving/ongoing/worse), otherMeds (other medicines, or "None")."""

PATIENT_SYS = f"""You are SafeReport's pharmacovigilance assistant interviewing a PATIENT (a layperson) about a suspected
side effect of the medicine given in the context. Warm, plain language, 1-2 short sentences. Ask exactly ONE question at
a time about the most important missing field. Never diagnose or give treatment advice. If they describe an emergency
(trouble breathing, swollen face/throat, chest pain, fainting) tell them to get emergency care immediately.
{FIELDS_DOC}
Extract every field you can from the transcript (only keys you can fill). When all fields are filled set done=true and
thank them, telling them to review the report.
Return ONLY JSON: {{"fields": {{...}}, "reply": "...", "done": false}}"""

HCP_SYS = f"""You are SafeReport's pharmacovigilance assistant listening in on a 3-way chat between a PATIENT, a healthcare
professional (HCP) and you. Do not interrupt their conversation. Extract report fields from everything said.
Speak only when something important is missing AFTER the HCP has spoken: then address the HCP directly with ONE short
clarifying question (clinical wording is fine). Otherwise set reply to null. When all fields are filled set done=true and
say so briefly. Never give treatment advice.
{FIELDS_DOC}
Return ONLY JSON: {{"fields": {{...}}, "reply": "..." or null, "done": false}}"""


class ChatReq(BaseModel):
    role: str
    med: dict = {}
    messages: list[dict] = []
    fields: dict = {}


@app.post("/api/chat")
def chat(req: ChatReq):
    if not claude():
        raise HTTPException(503, "ANTHROPIC_API_KEY not set")
    system = PATIENT_SYS if req.role == "Patient" else HCP_SYS
    label = {"ai": "AI", "patient": "PATIENT", "hcp": "HCP"}
    transcript = "\n".join(f"{label.get(m.get('who'), 'USER')}: {m.get('text', '')}" for m in req.messages)
    ctx = (f"Medicine: {json.dumps(req.med)}\nAlready captured: {json.dumps(req.fields)}\n"
           f"Reporter role: {req.role}\n\nTranscript:\n{transcript or '(empty)'}")
    try:
        r = ask_claude(system, ctx)
    except Exception as e:
        raise HTTPException(502, f"Claude error: {e}")
    fields = {k: str(v) for k, v in (r.get("fields") or {}).items() if v not in (None, "")}
    return {"fields": fields, "reply": r.get("reply"), "done": bool(r.get("done"))}


LISTEN_SYS = f"""You are SafeReport's pharmacovigilance voice agent. You are listening, through ONE microphone, to a live
consultation between a healthcare professional (HCP: doctor, chemist or other HCP) and a PATIENT about a suspected
side effect of a medicine. The speech-to-text has NO speaker labels and may contain recognition errors.

Your tasks:
1. SPEAKER LABELLING. Split the NEW segments into turns and label each turn "hcp" or "patient".
   HCP: asks clinical/screening questions, gives assessments, advice or instructions, uses clinical wording.
   Patient: describes symptoms and experience, answers the HCP's questions, uses lay language.
   Use the earlier transcript for context (a short answer after an HCP question is the patient). Speech arrives with little
   punctuation and one segment often holds several speakers: split it wherever the speaker changes. A question such as
   "how bad is it" or "did you stop the tablet" in the middle of a segment is a separate HCP turn, and the words after
   it are the patient's answer. Lightly fix obvious recognition errors; never add content that was not said.
2. EXTRACT FIELDS from the WHOLE conversation.
{FIELDS_DOC}
3. FOLLOW-UP. If allow_question is true and important fields are still missing, write ONE short spoken-style question
   to the HCP about the most important missing field (e.g. "Doctor, did the patient stop the medicine?"). If everything
   is captured, say so in one sentence and set done=true. If allow_question is false, or nothing important is missing,
   set question to null. Never repeat a question that is already the last AI line.
Return ONLY JSON: {{"turns": [{{"who": "hcp|patient", "text": "..."}}], "fields": {{...}}, "question": "..." or null, "done": false}}"""


class ListenReq(BaseModel):
    role: str = "Doctor"
    med: dict = {}
    turns: list[dict] = []
    segments: list[str] = []
    fields: dict = {}
    allow_question: bool = False


@app.post("/api/listen")
def listen(req: ListenReq):
    if not claude():
        raise HTTPException(503, "ANTHROPIC_API_KEY not set")
    label = {"ai": "AI", "patient": "PATIENT", "hcp": "HCP"}
    history = "\n".join(f"{label.get(t.get('who'), '?')}: {t.get('text', '')}" for t in req.turns[-30:])
    new = "\n".join(f"- {s}" for s in req.segments)
    ctx = (f"HCP role: {req.role}\nMedicine: {json.dumps(req.med)}\nAlready captured: {json.dumps(req.fields)}\n"
           f"allow_question: {str(req.allow_question).lower()}\n\nEarlier transcript:\n{history or '(none)'}\n\n"
           f"NEW segments to label:\n{new}")
    try:
        r = ask_claude(LISTEN_SYS, ctx, 1200)
    except Exception as e:
        raise HTTPException(502, f"Claude error: {e}")
    turns = [{"who": "hcp" if t.get("who") == "hcp" else "patient", "text": str(t.get("text", "")).strip()}
             for t in (r.get("turns") or []) if str(t.get("text", "")).strip()]
    fields = {k: str(v) for k, v in (r.get("fields") or {}).items() if v not in (None, "")}
    return {"turns": turns, "fields": fields, "question": r.get("question") or None, "done": bool(r.get("done"))}


# --------------------------------------------------------------------------- Atheria: Exasol
class ReportReq(BaseModel):
    drug: str
    event_term: str
    age: int | None = None
    sex: str | None = None
    serious: bool = False
    country: str = "DE"
    narrative: str | None = None
    reporter: dict | None = None
    med: dict | None = None
    fields: dict | None = None


@app.post("/api/report")
def submit_report(req: ReportReq):
    import datetime
    import hashlib

    try:
        sys.path.insert(0, str(HERE.parent / "db"))
        from load_exasol import connect
        conn = connect()
        try:
            # 1. Determine new sequential report ID
            count_sr = conn.execute("SELECT COUNT(*) FROM PV.REPORTS WHERE report_source = 'safereport'").fetchval()
            report_id = f"SR-{(count_sr + 1):04d}"

            # 2. Prepare extraction metadata
            extraction_data = {
                "reporter": req.reporter or {},
                "med": req.med or {},
                "fields": req.fields or {},
                "model": MODEL,
                "engine": LLM_ENGINE,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
            extraction_json = json.dumps(extraction_data, ensure_ascii=False)

            # 3. Insert report into PV.REPORTS
            conn.execute("""
                INSERT INTO PV.REPORTS (
                    report_id, drug, event_term, age, sex, serious, country, received_date, narrative, extraction_json, report_source
                ) VALUES (
                    {report_id}, {drug}, {event_term}, {age}, {sex}, {serious}, {country}, CURRENT_DATE, {narrative}, {extraction_json}, 'safereport'
                )
            """, {
                "report_id": report_id,
                "drug": req.drug or "Unknown",
                "event_term": req.event_term or "Unspecified adverse reaction",
                "age": req.age,
                "sex": (req.sex or "").upper()[:1] or None,
                "serious": req.serious,
                "country": (req.country or "DE").upper()[:2],
                "narrative": req.narrative or "",
                "extraction_json": extraction_json,
            })

            # 4. Append audit record to PV.AUDIT maintaining the cryptographic chain
            last_audit = conn.execute("SELECT seq, event_hash FROM PV.AUDIT ORDER BY seq DESC LIMIT 1").fetchone()
            prev_seq = int(last_audit[0]) if last_audit else 0
            prev_hash = str(last_audit[1]) if last_audit else ("0" * 64)
            new_seq = prev_seq + 1

            ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
            event_type = "REPORT_SUBMITTED"
            actor = (req.reporter or {}).get("name") or "SafeReport User"

            payload_obj = {
                "action": "submitted",
                "drug": req.drug or "Unknown",
                "event_term": req.event_term or "Unspecified adverse reaction",
                "report_id": report_id,
                "reporter_role": (req.reporter or {}).get("role", "patient"),
                "source": "safereport",
            }
            payload_str = json.dumps(payload_obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
            msg = prev_hash + '{"actor":' + json.dumps(actor) + ',"payload":' + payload_str + ',"ts":' + json.dumps(ts) + ',"type":' + json.dumps(event_type) + '}'
            new_hash = hashlib.sha256(msg.encode("utf-8")).hexdigest()

            conn.execute("""
                INSERT INTO PV.AUDIT (seq, ts, event_type, actor, payload_json, prev_hash, event_hash)
                VALUES ({seq}, {ts}, {event_type}, {actor}, {payload_json}, {prev_hash}, {event_hash})
            """, {
                "seq": new_seq,
                "ts": ts,
                "event_type": event_type,
                "actor": actor,
                "payload_json": payload_str,
                "prev_hash": prev_hash,
                "event_hash": new_hash,
            })
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(500, f"Exasol insertion failed: {e}")

    return {"ok": True, "report_id": report_id, "exasol": True}


@app.get("/api/pv/reports")
def pv_reports(source: str | None = None):
    try:
        sys.path.insert(0, str(HERE.parent / "db"))
        from load_exasol import connect
        conn = connect()
        try:
            sql = "SELECT report_id, drug, event_term, age, sex, serious, country, received_date, narrative, report_source FROM PV.REPORTS"
            if source:
                sql += f" WHERE report_source = '{source}'"
            sql += " ORDER BY received_date DESC, report_id DESC"
            rows = conn.execute(sql).fetchall()
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(503, f"Exasol not reachable: {e}")
    return {
        "count": len(rows),
        "reports": [
            {
                "report_id": r[0], "drug": r[1], "event_term": r[2], "age": int(r[3]) if r[3] else None,
                "sex": r[4], "serious": bool(r[5]), "country": r[6], "received_date": str(r[7]),
                "narrative": r[8], "source": r[9]
            } for r in rows
        ]
    }


# Signal statistics are computed by the PV.SIGNALS view in Exasol (created by db/load_exasol.py).
SIGNALS_QUERY = ("SELECT signal_id, drug, event_term, a, b, c, d, prr, ror, ror_lo, ror_hi, chi2, is_signal "
                 "FROM PV.SIGNALS ORDER BY prr DESC, signal_id")


@app.get("/api/pv/signals")
def pv_signals():
    try:
        sys.path.insert(0, str(HERE.parent / "db"))
        from load_exasol import connect
        conn = connect()
        try:
            rows = conn.execute(SIGNALS_QUERY).fetchall()
            view_sql = conn.execute("SELECT view_text FROM EXA_ALL_VIEWS "
                                    "WHERE view_schema = 'PV' AND view_name = 'SIGNALS'").fetchval()
            n_reports = conn.execute("SELECT COUNT(*) FROM PV.REPORTS").fetchval()
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(503, f"Exasol not reachable: {e}")
    num = lambda v: float(v) if v is not None else None
    return {
        "source": "exasol", "query": SIGNALS_QUERY, "view_sql": view_sql, "reports": int(n_reports),
        "rows": [{"signal_id": r[0], "drug": r[1], "event": r[2], "a": int(r[3]), "b": int(r[4]), "c": int(r[5]),
                  "d": int(r[6]), "prr": num(r[7]), "ror": num(r[8]), "ror_lo": num(r[9]), "ror_hi": num(r[10]),
                  "chi2": num(r[11]), "is_signal": bool(r[12])} for r in rows],
    }


# The safety team's portal, served from the same server so it can call /api/pv/*.
app.mount("/atheria", StaticFiles(directory=HERE.parent / "PV Teams" / "atheria-web", html=True), name="atheria")
app.mount("/", StaticFiles(directory=HERE / "web", html=True), name="web")
