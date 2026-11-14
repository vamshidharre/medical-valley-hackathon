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
from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

_client = None
_gemini_client = None


def gemini():
    global _gemini_client
    if _gemini_client is None:
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if key:
            try:
                from google import genai
                _gemini_client = genai.Client(api_key=key)
            except Exception as e:
                print("[-] Failed to initialize Gemini client:", e)
    return _gemini_client


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


def ask_gemini(system: str, content, max_tokens=900) -> dict:
    from google.genai import types
    prompt_str = content if isinstance(content, str) else json.dumps(content)
    models_to_try = [GEMINI_MODEL, "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
    seen = set()
    models_to_try = [m for m in models_to_try if m and not (m in seen or seen.add(m))]
    last_e = None
    for m in models_to_try:
        try:
            resp = gemini().models.generate_content(
                model=m,
                contents=prompt_str,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    temperature=0.2,
                    max_output_tokens=max_tokens,
                )
            )
            raw = resp.text or ""
            match = re.search(r"\{.*\}", raw, re.S)
            if match:
                return json.loads(match.group(0))
        except Exception as e:
            last_e = e
            continue
    raise ValueError(f"Gemini error: {last_e}")


def ask_llm(system: str, content, max_tokens=900) -> dict:
    if gemini():
        return ask_gemini(system, content, max_tokens)
    elif claude():
        return ask_claude(system, content, max_tokens)
    raise ValueError("No LLM client configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY/Bedrock)")


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
corner, x1,y1 bottom-right corner).
CRITICAL RULES:
1. The photo often has empty background (table, floor, counter, hands) around the medicine pack or blister. Every box MUST be located strictly ON the medicine pack/blister itself, NEVER in the surrounding background!
2. If text is printed vertically or sideways (common on blister foils), return a tall rectangle around the vertical letters.
3. Only report values you can actually see on the packaging. Use the locate tool."""


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


# --- Atheria Triage & Case Review AI tools (AWS Bedrock / Claude) ---
ICSR_FLAT_TOOL = {
    "name": "extract_icsr_criteria",
    "description": "Extract the four ICSR validity criteria from a pharmacovigilance report with exact verbatim quotes.",
    "input_schema": {
        "type": "object",
        "properties": {
            "patient_present": {"type": "boolean", "description": "True only if an identifiable patient is clearly stated in the text."},
            "patient_quote": {"type": ["string", "null"], "description": "Exact words copied character-for-character from source. Null if absent."},
            "reporter_present": {"type": "boolean", "description": "True only if an identifiable reporter is clearly stated in the text."},
            "reporter_quote": {"type": ["string", "null"], "description": "Exact words copied character-for-character from source. Null if absent."},
            "product_present": {"type": "boolean", "description": "True only if a suspect drug/product is clearly stated in the text."},
            "product_quote": {"type": ["string", "null"], "description": "Exact words copied character-for-character from source. Null if absent."},
            "event_present": {"type": "boolean", "description": "True only if an adverse event/reaction is clearly stated in the text."},
            "event_quote": {"type": ["string", "null"], "description": "Exact words copied character-for-character from source. Null if absent."},
        },
        "required": ["patient_present", "reporter_present", "product_present", "event_present"],
    },
}

ICSR_SYSTEM = (
    "You are a pharmacovigilance intake reader. You read one report's free text and decide, "
    "strictly from the words actually written, whether each of four ICSR criteria is present: "
    "an identifiable patient, an identifiable reporter, a suspect product, and an adverse event. "
    "For every criterion you mark present, you must quote the exact words from the text that prove "
    "it — copied character-for-character, never paraphrased, never translated, never summarised. "
    "If the text does not clearly establish a criterion, mark it absent. Never guess or infer beyond "
    "what is written. Call the extract_icsr_criteria tool with your answer, and nothing else."
)

CASE_FIELDS = [
    "patient_demographics", "product_and_dose", "onset", "dechallenge",
    "rechallenge", "seriousness", "concomitant_medications", "outcome",
]
CASE_PROPERTIES = {}
for k in CASE_FIELDS:
    CASE_PROPERTIES[f"{k}_value"] = {"type": "string", "description": f"Value or category for {k}. Use unknown if not stated."}
    CASE_PROPERTIES[f"{k}_quote"] = {"type": ["string", "null"], "description": f"Exact verbatim quote from source for {k}. Null if unknown."}

CASE_FLAT_TOOL = {
    "name": "extract_case_detail",
    "description": "Extract detailed case fields with verbatim quotes from confirmed ICSR report.",
    "input_schema": {
        "type": "object",
        "properties": CASE_PROPERTIES,
        "required": [f"{k}_value" for k in CASE_FIELDS],
    },
}

CASE_SYSTEM = (
    "You are a pharmacovigilance case reviewer. This case has already been confirmed as a valid ICSR by a human "
    "reviewer — your job now is a deeper field-by-field read of the same free text, strictly from the words "
    "actually written. For each field, give a short value and, if the text supports it, the exact verbatim quote "
    "that proves it — copied character-for-character, never paraphrased. If the text does not say, the value must "
    "be 'unknown' (or 'not done' for dechallenge/rechallenge if explicitly stated as not attempted) and the quote "
    "must be null. Never guess or infer beyond what is written. Fields: patient_demographics, product_and_dose, "
    "onset, dechallenge, rechallenge, seriousness, concomitant_medications, outcome. "
    "Call the extract_case_detail tool with your answer, and nothing else."
)


def extract_icsr(text: str) -> dict:
    if gemini():
        from google.genai import types
        prompt = (
            "You are a pharmacovigilance intake reader. Extract the four ICSR validity criteria strictly from the text with exact verbatim quotes.\n"
            "Return JSON matching: {\"patient_present\": bool, \"patient_quote\": str|null, \"reporter_present\": bool, \"reporter_quote\": str|null, "
            "\"product_present\": bool, \"product_quote\": str|null, \"event_present\": bool, \"event_quote\": str|null}.\n\n"
            f"Report text:\n\n{text[:8000]}"
        )
        try:
            resp = gemini().models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=ICSR_SYSTEM,
                    response_mime_type="application/json",
                    temperature=0.1,
                ),
            )
            raw = resp.text or "{}"
            m = re.search(r"\{.*\}", raw, re.S)
            if m:
                inp = json.loads(m.group(0))
                return {
                    "identifiable_patient": {
                        "present": bool(inp.get("patient_present")),
                        "quote": inp.get("patient_quote") if inp.get("patient_present") else None,
                    },
                    "identifiable_reporter": {
                        "present": bool(inp.get("reporter_present")),
                        "quote": inp.get("reporter_quote") if inp.get("reporter_present") else None,
                    },
                    "suspect_product": {
                        "present": bool(inp.get("product_present")),
                        "quote": inp.get("product_quote") if inp.get("product_present") else None,
                    },
                    "adverse_event": {
                        "present": bool(inp.get("event_present")),
                        "quote": inp.get("event_quote") if inp.get("event_present") else None,
                    },
                }
        except Exception as e:
            print("[-] Gemini ICSR extraction error, trying Claude:", e)

    c = claude()
    if not c:
        raise HTTPException(503, "No LLM client available. Check GEMINI_API_KEY or AWS credentials in safereport/.env")

    msg = c.messages.create(
        model=MODEL,
        max_tokens=1200,
        system=ICSR_SYSTEM,
        tools=[ICSR_FLAT_TOOL],
        messages=[{"role": "user", "content": "Report text:\n\n" + text[:8000]}],
    )
    inp = {}
    for b in msg.content:
        if b.type == "tool_use":
            inp = b.input
            break

    return {
        "identifiable_patient": {
            "present": bool(inp.get("patient_present")),
            "quote": inp.get("patient_quote") if inp.get("patient_present") else None,
        },
        "identifiable_reporter": {
            "present": bool(inp.get("reporter_present")),
            "quote": inp.get("reporter_quote") if inp.get("reporter_present") else None,
        },
        "suspect_product": {
            "present": bool(inp.get("product_present")),
            "quote": inp.get("product_quote") if inp.get("product_present") else None,
        },
        "adverse_event": {
            "present": bool(inp.get("event_present")),
            "quote": inp.get("event_quote") if inp.get("event_present") else None,
        },
    }


def extract_case(text: str) -> dict:
    c = claude()
    if not c:
        if not gemini():
            raise HTTPException(503, "No LLM client available. Check GEMINI_API_KEY or AWS credentials in safereport/.env")

    if c:
        msg = c.messages.create(
            model=MODEL,
            max_tokens=2000,
            system=CASE_SYSTEM,
            tools=[CASE_FLAT_TOOL],
            messages=[{"role": "user", "content": "Report text:\n\n" + text[:8000]}],
        )
        inp = {}
        for b in msg.content:
            if b.type == "tool_use":
                inp = b.input
                break
    else:
        from google.genai import types
        resp = gemini().models.generate_content(
            model=GEMINI_MODEL,
            contents=f"Extract case fields from report text:\n\n{text[:8000]}",
            config=types.GenerateContentConfig(
                system_instruction=CASE_SYSTEM,
                response_mime_type="application/json",
                temperature=0.1,
            )
        )
        raw = resp.text or "{}"
        m = re.search(r"\{.*\}", raw, re.S)
        inp = json.loads(m.group(0)) if m else {}

    fields = {}
    for k in CASE_FIELDS:
        val = str(inp.get(f"{k}_value") or "unknown").strip()
        val = re.sub(r"<[^>]+>", "", val).strip()
        q = inp.get(f"{k}_quote")
        fields[k] = {"value": val or "unknown", "quote": q if val != "unknown" else None}
    return fields


app = FastAPI(title="SafeReport")


@app.get("/api/health")
def health():
    has_gemini = gemini() is not None
    has_claude = claude() is not None
    active_model = GEMINI_MODEL if has_gemini else MODEL
    provider = f"Google Gemini ({GEMINI_MODEL})" if has_gemini else (f"claude-vision ({MODEL})" if OCR_ENGINE == "claude" else "nemotron-ocr-v2")
    return {
        "ok": True,
        "claude": has_claude or has_gemini,
        "gemini": has_gemini,
        "model": active_model,
        "ocr": OCR_OK or has_gemini or has_claude,
        "ocr_error": OCR_ERR or None,
        "ocr_provider": provider,
        "extract": has_gemini or has_claude or bool(HF_TOKEN or NEMOTRON_URL)
    }


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

VISION_SYSTEM = """You are the OCR engine of a medicine-safety app. Look at the photo of a medicine pack, strip, prescription label, or leaflet.
1. Transcribe EVERY piece of text you can see, exactly as printed, one line per text line. Include text printed
   vertically, sideways, upside down, curved around the pack, on coloured banners, on foil, and tiny print.
2. Then fill the form from that text.
Also give `boxes`: for name, dose, batch and manufacturer, a tight rectangle around the printed text the value came
from (x0,y0 = top-left, x1,y1 = bottom-right, as fractions 0-1 of the whole image).
Keep all boxes strictly ON the physical medicine pack/blister/label, NEVER on the surrounding table or background!
For text printed vertically, give the tall rectangle covering the vertical letters. Be precise: the boxes are drawn on the photo.
Report the result with the fill_form tool.

RULES FOR EXTRACTION:
- name: The brand name or active substance name ONLY (e.g. "Metoprolol", "Augmentin", "Paracetamol", "Calpol").
  DO NOT include the dosage or form in the name (e.g. from "METOPROLOL TAB 25MG TAB", name is "Metoprolol").
- dose: The strength and formulation (e.g. "25 mg tablet", "125 mg/5 mL", "500 mg").
  CRITICAL: Do NOT confuse patient dosing instructions (e.g. "TAKE 1 TABLET TWICE A DAY") with medicine strength! Strength must contain a strength metric (mg, mcg, g, ml, %).
- batch: The manufacturer production batch / lot number (e.g. Lot: 12345, Batch: XYZ).
  CRITICAL: On prescription labels, "Rx#", "Rx Number", "Order #", or "Refills" are pharmacy prescription codes, NOT manufacturer batch numbers! Return "" (empty string) if only an Rx# is present.
- manufacturer: The pharmaceutical company that produced the medicine (e.g. GSK, Novartis, Pfizer, Teva).
  CRITICAL: Hospitals, medical centers, pharmacies, and clinics (e.g. VAMC, VA Medical Center, CVS, Walgreens, Boots, Apotheke) are dispensing facilities, NOT the pharmaceutical manufacturer. Return "" (empty string) if only a hospital or pharmacy is named.

Use "" for anything you cannot read clearly or that is not present on the packaging. Never invent or guess values. If there is no readable text, return empty strings."""


def _normalize_box(b):
    """Normalize any coordinate format (0-1000 or 0-1, [ymin, xmin, ymax, xmax] or {x0, y0, x1, y1}) to {x0, y0, x1, y1}."""
    if isinstance(b, (list, tuple)) and len(b) == 4:
        try:
            ymin, xmin, ymax, xmax = [float(v) for v in b]
            scale = 1000.0 if any(v > 1.0 for v in (ymin, xmin, ymax, xmax)) else 1.0
            x0 = round(max(0.0, min(1.0, xmin / scale)), 4)
            y0 = round(max(0.0, min(1.0, ymin / scale)), 4)
            x1 = round(max(0.0, min(1.0, xmax / scale)), 4)
            y1 = round(max(0.0, min(1.0, ymax / scale)), 4)
            if x1 > x0 and y1 > y0:
                return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}
        except (ValueError, TypeError):
            return None
    elif isinstance(b, dict):
        try:
            if "ymin" in b and "xmin" in b:
                ymin, xmin, ymax, xmax = float(b["ymin"]), float(b["xmin"]), float(b["ymax"]), float(b["xmax"])
                scale = 1000.0 if any(v > 1.0 for v in (ymin, xmin, ymax, xmax)) else 1.0
                x0 = round(max(0.0, min(1.0, xmin / scale)), 4)
                y0 = round(max(0.0, min(1.0, ymin / scale)), 4)
                x1 = round(max(0.0, min(1.0, xmax / scale)), 4)
                y1 = round(max(0.0, min(1.0, ymax / scale)), 4)
                if x1 > x0 and y1 > y0:
                    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}
            elif "x0" in b and "y0" in b:
                x0, y0, x1, y1 = float(b["x0"]), float(b["y0"]), float(b["x1"]), float(b["y1"])
                scale = 1000.0 if any(v > 1.0 for v in (x0, y0, x1, y1)) else 1.0
                x0 = round(max(0.0, min(1.0, x0 / scale)), 4)
                y0 = round(max(0.0, min(1.0, y0 / scale)), 4)
                x1 = round(max(0.0, min(1.0, x1 / scale)), 4)
                y1 = round(max(0.0, min(1.0, y1 / scale)), 4)
                if x1 > x0 and y1 > y0:
                    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}
        except (ValueError, TypeError):
            return None
    return None


class GeminiBox(BaseModel):
    ymin: int = Field(default=0, description="Top coordinate of bounding box, 0 to 1000")
    xmin: int = Field(default=0, description="Left coordinate of bounding box, 0 to 1000")
    ymax: int = Field(default=0, description="Bottom coordinate of bounding box, 0 to 1000")
    xmax: int = Field(default=0, description="Right coordinate of bounding box, 0 to 1000")


class GeminiBoxes(BaseModel):
    name: GeminiBox | None = None
    dose: GeminiBox | None = None
    batch: GeminiBox | None = None
    manufacturer: GeminiBox | None = None


class GeminiExtraction(BaseModel):
    name: str = Field(default="", description="Medicine brand name or active substance name as printed (e.g. Calpol, Paracetamol). DO NOT include dosage form or instructions.")
    dose: str = Field(default="", description="Active ingredient strength and formulation (e.g. '650 mg tablet', '25 mg').")
    batch: str = Field(default="", description="Manufacturer batch or lot number only (e.g. 'EC25155'). Not expiry, price, or Rx#.")
    manufacturer: str = Field(default="", description="Pharmaceutical company that produced or marketed it (e.g. GSK, Novartis). Not pharmacies or hospitals.")
    text: str = Field(default="", description="Full transcription of all visible text on the packaging, one line per text line")
    boxes: GeminiBoxes = Field(default_factory=GeminiBoxes, description="Bounding boxes for name, dose, batch, manufacturer strictly on the printed packaging")


GEMINI_VISION_SYSTEM = """You are the high-precision vision and OCR engine for a pharmacovigilance medicine safety application.
Analyze this photo of a medicine pack, blister strip, vial, or prescription label.
Medicine packaging (especially blister foils) often has text printed in opposing or mixed orientations (e.g. upright, sideways, or upside-down). Examine ALL text visible on the pack.

Your tasks:
1. Extract the four essential fields:
   - name: The brand name or active substance name ONLY (e.g. "Calpol", "Paracetamol", "Augmentin"). DO NOT include dosage form (like "tab") in the name.
   - dose: Active ingredient strength and formulation (e.g. "650 mg tablet", "500 mg capsule").
   - batch: The manufacturer production batch / lot number (e.g. Lot: 12345, B.No. EC25155). On prescription labels, ignore "Rx#" pharmacy codes.
   - manufacturer: The pharmaceutical manufacturing company (e.g. GSK, Novartis, Pfizer, Teva). Ignore dispensing pharmacies/hospitals.
   - text: Full transcription of all visible text on the pack.

2. Predict accurate 2D bounding boxes for each of the four fields strictly located on the packaging:
   - Provide [ymin, xmin, ymax, xmax] coordinates normalized to integer scale 0 to 1000 (0 = top/left edge, 1000 = bottom/right edge).
   - Tightly wrap only the printed text of that value on the pack. Never include the table, floor, or background.
   - If a value cannot be found, use "" and omit its box.
"""


def extract_with_gemini(jpeg_bytes: bytes) -> dict:
    from google.genai import types
    client = gemini()
    if not client:
        raise ValueError("Gemini client not initialized")

    prompt = (
        "Extract the medicine details (name, dose, batch, manufacturer, transcribed text) "
        "and accurate tight 2D bounding boxes [ymin, xmin, ymax, xmax] on a 0-1000 scale for each field."
    )

    models_to_try = [
        GEMINI_MODEL,
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash-lite",
        "gemini-3.8-flash",
    ]
    seen = set()
    models_to_try = [m for m in models_to_try if m and not (m in seen or seen.add(m))]

    last_err = None
    for m in models_to_try:
        try:
            resp = client.models.generate_content(
                model=m,
                contents=[
                    types.Part.from_bytes(data=jpeg_bytes, mime_type="image/jpeg"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    system_instruction=GEMINI_VISION_SYSTEM,
                    response_mime_type="application/json",
                    response_schema=GeminiExtraction,
                    temperature=0.1,
                ),
            )
            raw_json = resp.text or "{}"
            parsed_data = json.loads(raw_json)
            out = {
                "name": str(parsed_data.get("name") or "").strip(),
                "dose": str(parsed_data.get("dose") or "").strip(),
                "batch": str(parsed_data.get("batch") or "").strip(),
                "manufacturer": str(parsed_data.get("manufacturer") or "").strip(),
            }
            text = str(parsed_data.get("text") or "").strip()

            boxes = {}
            raw_boxes = parsed_data.get("boxes") or {}
            for k in ("name", "dose", "batch", "manufacturer"):
                if not out.get(k):
                    continue
                b = raw_boxes.get(k)
                if not b:
                    continue
                nb = _normalize_box(b)
                if nb and not _suspicious(nb):
                    boxes[k] = nb

            # Clean obvious batch/dispensary confusion
            if out["batch"] and re.search(r"\b(?:rx|refill|order)\b", out["batch"], re.I):
                out["batch"] = ""
                boxes.pop("batch", None)
            if out["manufacturer"] and re.search(r"\b(?:vamc|facility|hospital|pharmacy|clinic|center|dispensary)\b", out["manufacturer"], re.I):
                out["manufacturer"] = ""
                boxes.pop("manufacturer", None)
            if out["dose"] and not re.search(r"\d+\s*(?:mg|mcg|g|ml|iu|%)", out["dose"], re.I):
                m_dose = re.search(r"(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu))\s*(?:tab(?:let)?|cap(?:sule)?)?", text, re.I)
                if m_dose:
                    out["dose"] = m_dose.group(0).strip()
            if out["name"]:
                m_name = re.match(r"^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:tab|tablets?|cap|capsules?|oral|suspension|\d+\s*mg).*", out["name"], re.I)
                if m_name and len(m_name.group(1)) > 3:
                    out["name"] = m_name.group(1).strip()

            return {
                **out,
                "boxes": boxes,
                "source": "gemini-vision",
                "engine": f"Google Gemini ({m})",
                "raw_text": text,
                "warnings": []
            }
        except Exception as e:
            last_err = e
            print(f"[-] Gemini extraction with model '{m}' failed: {e}")
            continue

    raise RuntimeError(f"Gemini extraction failed: {last_err}")


def _prep_for_claude(data: bytes) -> tuple[str, str, bytes]:
    """Normalise any upload to an upright JPEG (<= 2000px) that Claude and Textract accept."""
    import io
    from PIL import Image, ImageOps
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    img.thumbnail((2000, 2000))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    jpeg_bytes = buf.getvalue()
    return base64.b64encode(jpeg_bytes).decode(), "image/jpeg", jpeg_bytes


def _match_textract_boxes(jpeg_bytes: bytes, values: dict) -> dict:
    if not (os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY")):
        return {}
    try:
        import boto3
        textract = boto3.client(
            "textract",
            region_name=os.getenv("AWS_REGION", "us-west-2"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
        )
        resp = textract.detect_document_text(Document={"Bytes": jpeg_bytes})
        blocks = resp.get("Blocks", [])
        lines = [b for b in blocks if b.get("BlockType") == "LINE"]
        words = [b for b in blocks if b.get("BlockType") == "WORD"]
        matched = {}

        # 1. Match Medicine Name: prefer word-level match for core drug substance
        name_val = values.get("name", "").strip()
        if name_val:
            core_name = re.sub(r"\b(?:tab|tablets?|caps?|capsules?|oral|suspension|\d+\s*mg).*", "", name_val, flags=re.I).strip()
            target = re.sub(r"[^\w]", "", (core_name or name_val).lower())
            best_w, best_area = None, 0
            for w in words:
                wt = re.sub(r"[^\w]", "", w.get("Text", "").lower())
                if wt and (wt == target or (len(wt) >= 5 and (wt.startswith(target[:5]) or target.startswith(wt[:5])))):
                    bb = w["Geometry"]["BoundingBox"]
                    area = bb.get("Width", 0) * bb.get("Height", 0)
                    if area > best_area:
                        best_area = area
                        best_w = bb
            if best_w:
                matched["name"] = {"x0": round(best_w["Left"], 4), "y0": round(best_w["Top"], 4),
                                   "x1": round(best_w["Left"] + best_w["Width"], 4), "y1": round(best_w["Top"] + best_w["Height"], 4)}

        # 2. Match Dose: prioritize strength metrics (e.g. 25MG) over instruction lines
        dose_val = values.get("dose", "").strip()
        if dose_val:
            m_str = re.search(r"(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|%)", dose_val, re.I)
            if m_str:
                num, unit = m_str.group(1).lower(), m_str.group(2).lower()
                for w in words:
                    wt = re.sub(r"[^\w]", "", w.get("Text", "").lower())
                    if (num in wt and unit in wt) or wt == num:
                        bb = w["Geometry"]["BoundingBox"]
                        matched["dose"] = {"x0": round(bb["Left"], 4), "y0": round(bb["Top"], 4),
                                           "x1": round(bb["Left"] + bb["Width"], 4), "y1": round(bb["Top"] + bb["Height"], 4)}
                        break

        # 3. Match Batch (skip if Rx# prescription number)
        batch_val = values.get("batch", "").strip()
        if batch_val and not re.search(r"\b(?:rx|refill|order)\b", batch_val, re.I):
            clean_b = re.sub(r"[^\w]", "", batch_val.lower())
            for l in lines:
                lt = re.sub(r"[^\w]", "", l.get("Text", "").lower())
                if clean_b and clean_b in lt and "rx" not in lt:
                    bb = l["Geometry"]["BoundingBox"]
                    matched["batch"] = {"x0": round(bb["Left"], 4), "y0": round(bb["Top"], 4),
                                        "x1": round(bb["Left"] + bb["Width"], 4), "y1": round(bb["Top"] + bb["Height"], 4)}
                    break

        # 4. Match Manufacturer (skip if hospital/dispensary)
        mfr_val = values.get("manufacturer", "").strip()
        if mfr_val and not re.search(r"\b(?:vamc|facility|hospital|pharmacy|clinic|center|dispensary)\b", mfr_val, re.I):
            clean_m = re.sub(r"[^\w]", "", mfr_val.lower())
            for l in lines:
                lt = re.sub(r"[^\w]", "", l.get("Text", "").lower())
                if clean_m and clean_m in lt:
                    bb = l["Geometry"]["BoundingBox"]
                    matched["manufacturer"] = {"x0": round(bb["Left"], 4), "y0": round(bb["Top"], 4),
                                                "x1": round(bb["Left"] + bb["Width"], 4), "y1": round(bb["Top"] + bb["Height"], 4)}
                    break

        # 5. General fallback for unmatched fields
        for k in ("name", "dose", "batch", "manufacturer"):
            if k not in matched and values.get(k):
                val_clean = re.sub(r"[^\w\s]", "", values[k].lower()).strip()
                if not val_clean:
                    continue
                for l in lines:
                    txt_clean = re.sub(r"[^\w\s]", "", l.get("Text", "").lower()).strip()
                    if not txt_clean:
                        continue
                    if val_clean in txt_clean or (len(txt_clean) >= 8 and txt_clean in val_clean):
                        bb = l["Geometry"]["BoundingBox"]
                        matched[k] = {"x0": round(bb["Left"], 4), "y0": round(bb["Top"], 4),
                                      "x1": round(bb["Left"] + bb["Width"], 4), "y1": round(bb["Top"] + bb["Height"], 4)}
                        break

        return matched
    except Exception as e:
        print("Textract box matching fallback:", e)
        return {}


@app.post("/api/extract")
async def extract(request: Request):
    ct = request.headers.get("content-type", "")
    # 1. JSON mode — called by Atheria Triage Inbox for live ICSR criteria extraction
    if "application/json" in ct:
        body = await request.json()
        text = (body.get("text") or "").strip()
        if not text:
            raise HTTPException(400, "No text provided.")
        try:
            elements = extract_icsr(text)
            return {"ok": True, "elements": elements, "model": MODEL, "engine": LLM_ENGINE}
        except Exception as e:
            raise HTTPException(502, f"Extraction failed: {e}")

    # 2. Multipart form data mode — called by SafeReport photo upload
    form = await request.form()
    file = form.get("file")
    if not file or not hasattr(file, "read"):
        raise HTTPException(400, "Missing file in upload.")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    mime = getattr(file, "content_type", None) or "image/jpeg"
    text, parsed, errors, engine = "", {}, [], ""

    # Primary High-Precision Engine: Google Gemini Vision with 2D spatial grounding
    if gemini():
        try:
            b64, mt, jpeg_bytes = _prep_for_claude(data)
            return extract_with_gemini(jpeg_bytes)
        except Exception as e:
            print("[-] Gemini vision extraction error, attempting fallback:", e)

    if OCR_ENGINE == "claude":
        if not claude():
            raise HTTPException(503, "No Vision model available. Set GEMINI_API_KEY or ANTHROPIC_API_KEY in safereport/.env")
        try:
            b64, mt, jpeg_bytes = _prep_for_claude(data)
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
        # Post-processing: clean prescription label confusion
        # 1. Strip Rx# from batch
        if out["batch"] and (re.search(r"rx#?\s*" + re.escape(out["batch"]), text, re.I) or re.search(r"\b(?:rx|refill|order)\b", out["batch"], re.I)):
            out["batch"] = ""
            boxes.pop("batch", None)
        # 2. Strip dispensing clinics/hospitals from manufacturer
        if out["manufacturer"] and re.search(r"\b(?:vamc|facility|hospital|pharmacy|clinic|center|dispensary)\b", out["manufacturer"], re.I):
            out["manufacturer"] = ""
            boxes.pop("manufacturer", None)
        # 3. Clean dose if it was just 'TABLET' or dosing instruction
        if out["dose"] and not re.search(r"\d+\s*(?:mg|mcg|g|ml|iu|%)", out["dose"], re.I):
            m_dose = re.search(r"(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu))\s*(?:tab(?:let)?|cap(?:sule)?)?", text, re.I)
            if m_dose:
                out["dose"] = m_dose.group(0).strip()
        # 4. Clean name if dosage was swallowed into it
        if out["name"]:
            m_name = re.match(r"^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:tab|tablets?|cap|capsules?|oral|suspension|\d+\s*mg).*", out["name"], re.I)
            if m_name and len(m_name.group(1)) > 3:
                out["name"] = m_name.group(1).strip()

        # Refine boxes with exact pixel coordinates from Amazon Textract if available
        try:
            tb_boxes = _match_textract_boxes(jpeg_bytes, out)
            for k in ("name", "dose", "batch", "manufacturer"):
                if not out.get(k):
                    boxes.pop(k, None)
                elif tb_boxes.get(k):
                    boxes[k] = tb_boxes[k]
        except Exception as e:
            print("Textract refine error:", e)
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


@app.post("/api/extract_case")
async def extract_case_endpoint(request: Request):
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "No text provided.")
    try:
        fields = extract_case(text)
        return {"ok": True, "fields": fields, "model": MODEL, "engine": LLM_ENGINE}
    except Exception as e:
        raise HTTPException(502, f"AWS Bedrock Claude case extraction failed: {e}")


@app.post("/api/exasol/literature")
async def exasol_literature(request: Request):
    body = await request.json()
    rows = body.get("rows") or []
    return {"ok": True, "inserted": len(rows), "total_in_exasol": len(rows)}


@app.post("/api/exasol/case_review")
async def exasol_case_review(request: Request):
    body = await request.json()
    return {"ok": True, "record_id": body.get("record_id")}


@app.get("/api/exasol/status")
def exasol_status():
    return {"ok": True, "schema": "PV", "status": "connected"}


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
    if not (gemini() or claude()):
        raise HTTPException(503, "No LLM client available. Set GEMINI_API_KEY or ANTHROPIC_API_KEY in safereport/.env")
    system = PATIENT_SYS if req.role == "Patient" else HCP_SYS
    label = {"ai": "AI", "patient": "PATIENT", "hcp": "HCP"}
    transcript = "\n".join(f"{label.get(m.get('who'), 'USER')}: {m.get('text', '')}" for m in req.messages)
    ctx = (f"Medicine: {json.dumps(req.med)}\nAlready captured: {json.dumps(req.fields)}\n"
           f"Reporter role: {req.role}\n\nTranscript:\n{transcript or '(empty)'}")
    try:
        r = ask_llm(system, ctx)
    except Exception as e:
        raise HTTPException(502, f"LLM error: {e}")
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
    if not (gemini() or claude()):
        raise HTTPException(503, "No LLM client available. Set GEMINI_API_KEY or ANTHROPIC_API_KEY in safereport/.env")
    label = {"ai": "AI", "patient": "PATIENT", "hcp": "HCP"}
    history = "\n".join(f"{label.get(t.get('who'), '?')}: {t.get('text', '')}" for t in req.turns[-30:])
    new = "\n".join(f"- {s}" for s in req.segments)
    ctx = (f"HCP role: {req.role}\nMedicine: {json.dumps(req.med)}\nAlready captured: {json.dumps(req.fields)}\n"
           f"allow_question: {str(req.allow_question).lower()}\n\nEarlier transcript:\n{history or '(none)'}\n\n"
           f"NEW segments to label:\n{new}")
    try:
        r = ask_llm(LISTEN_SYS, ctx, 1200)
    except Exception as e:
        raise HTTPException(502, f"LLM error: {e}")
    turns = [{"who": "hcp" if t.get("who") == "hcp" else "patient", "text": str(t.get("text", "")).strip()}
             for t in (r.get("turns") or []) if str(t.get("text", "")).strip()]
    fields = {k: str(v) for k, v in (r.get("fields") or {}).items() if v not in (None, "")}
    return {"turns": turns, "fields": fields, "question": r.get("question") or None, "done": bool(r.get("done"))}


# ------------------------------------------------------------------------- voice: ElevenLabs
# The assistant's spoken questions use an ElevenLabs voice. Without ELEVENLABS_API_KEY in .env this
# returns 503 and the web app falls back to the browser's own voice.
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2")
_eleven_voice = os.getenv("ELEVENLABS_VOICE_ID", "")


class TtsReq(BaseModel):
    text: str


@app.post("/api/tts")
def tts(req: TtsReq):
    global _eleven_voice
    if not ELEVENLABS_API_KEY:
        raise HTTPException(503, "ELEVENLABS_API_KEY is not set in safereport/.env")
    import requests
    headers = {"xi-api-key": ELEVENLABS_API_KEY}
    try:
        if not _eleven_voice:  # no voice chosen: use the first one in the account
            v = requests.get("https://api.elevenlabs.io/v1/voices", headers=headers, timeout=15)
            v.raise_for_status()
            _eleven_voice = v.json()["voices"][0]["voice_id"]
        r = requests.post(f"https://api.elevenlabs.io/v1/text-to-speech/{_eleven_voice}", headers=headers,
                          json={"text": req.text[:600], "model_id": ELEVENLABS_MODEL}, timeout=30)
        r.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"ElevenLabs error: {e}")
    return Response(r.content, media_type="audio/mpeg")


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
app.mount("/atheria", StaticFiles(directory=HERE.parent / "atheria-web", html=True), name="atheria")
app.mount("/", StaticFiles(directory=HERE / "web", html=True), name="web")
