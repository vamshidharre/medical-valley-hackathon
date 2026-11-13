"""Nemotron OCR v2 as a tiny HTTP service. Run this on a Linux + NVIDIA GPU machine.

    POST /ocr   multipart field "file" (png/jpg)  ->  {"text": "...", "lines": [{text, confidence, box}]}
    GET  /health

SafeReport calls it when NEMOTRON_URL is set. Start:  uvicorn service:app --host 0.0.0.0 --port 9000
"""
import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile

app = FastAPI(title="Nemotron OCR v2")
_ocr = None


def get_ocr():
    global _ocr
    if _ocr is None:
        from nemotron_ocr.inference.pipeline_v2 import NemotronOCRV2
        # lang="en" = English word-level model; omit for the multilingual default
        _ocr = NemotronOCRV2(lang=os.getenv("NEMOTRON_LANG") or None) if os.getenv("NEMOTRON_LANG") else NemotronOCRV2()
    return _ocr


@app.get("/health")
def health():
    return {"ok": True, "model": "nvidia/nemotron-ocr-v2"}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    suffix = ".png" if (file.content_type or "").endswith("png") else ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix) as f:
        f.write(data); f.flush()
        try:
            preds = get_ocr()(f.name, merge_level="paragraph")
        except Exception as e:
            raise HTTPException(500, f"Nemotron OCR failed: {e}")
    # paragraph-merged boxes -> reading order: top to bottom, then left to right
    preds = sorted(preds, key=lambda p: (round(p["upper"], 2), p["left"]))
    lines = [{"text": p["text"], "confidence": float(p["confidence"]),
              "box": [p["left"], p["upper"], p["right"], p["lower"]]} for p in preds]
    return {"text": "\n".join(p["text"] for p in preds), "lines": lines}
