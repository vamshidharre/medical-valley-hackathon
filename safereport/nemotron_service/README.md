# Nemotron OCR v2 service (GPU machine)

`nvidia/nemotron-ocr-v2` is a local model: it is **not** served by Hugging Face inference, and needs
Linux amd64 + an NVIDIA GPU (Ampere/Hopper/Lovelace/Blackwell), CUDA toolkit (`nvcc`), Python 3.12.

```bash
git lfs install && git clone https://huggingface.co/nvidia/nemotron-ocr-v2 nemotron-ocr
python3.12 -m venv .venv && . .venv/bin/activate
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
(cd nemotron-ocr && pip install --no-build-isolation -v .)
pip install fastapi uvicorn python-multipart
uvicorn service:app --host 0.0.0.0 --port 9000
```
Then on the machine running SafeReport, add to `safereport/.env`:
```
NEMOTRON_URL=http://<gpu-host>:9000
```
SafeReport then uses Nemotron for OCR and falls back to local Tesseract if the service is unreachable.
