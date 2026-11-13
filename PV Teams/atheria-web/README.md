# Atheria web

Website version of the Atheria pharmacovigilance platform (ICSR triage + signal investigation).

Run: `python3 server.py` in this folder (needs `pip install flask python-dotenv requests`), open
http://localhost:8790 (add `?demo=1` to skip sign-in). Everything except one route is still a static
site with no build step: all rules, statistics, guardrails and the hash-chained audit run in the browser.
Plain `python3 -m http.server` also still works for browsing the site — only the live Claude button needs `server.py`.

Real vs stand-in: AI case extractions are the cached outputs from the original project's database; the new-report
reader, summary drafter and chat are offline stand-ins (no model call). The 120 original audit events verify in-browser.

**Live AI, for real**: in the Triage inbox, a record's detail panel has an "Enable AI" button (shown while the
page's own Before/After AI toggle is set to Before). Clicking it sends that one record's text to the real
Anthropic API — `server.py`'s `POST /api/extract` — which asks Claude to find the four ICSR criteria (patient,
reporter, product, event), each with a verbatim quote. The browser then re-verifies every quote actually appears
in the text (same `locateQuote` guardrail the rest of the app uses) before counting it, and `val_001` — not the
model — decides the outcome. Copy `.env.example` to `.env` and put a real `ANTHROPIC_API_KEY` in it, then restart
`server.py`; without a key, the button honestly reports that it isn't configured rather than faking a result.
One record at a time, on demand — nothing is pre-computed or batched.

MedDRA coding (`#/meddra`) is a genuinely trained model, not a stand-in: TF-IDF (1–2 word phrases, raw count × idf,
no per-document normalisation) feeding a multinomial logistic regression, trained offline in scikit-learn on
**symptomify** (`../symptomify/{train,dev,test}.json`) — a large VAERS-style dataset of vaccine adverse-event reports,
each already labelled with its MedDRA Preferred Term. 40 of the best-supported terms were used; `js/meddra_model.js`
ships the vocabulary, idf weights and the full dense coefficient matrix (no pruning), so every number shown — dev
accuracy, test accuracy, macro-F1 — is reproducible from that one file plus `js/engine.js`'s `classifyMedDRA_ML`. The
page also re-scores a bundled sample of 220 held-out dev reports live, in the browser, on every load. Training script:
`tools/meddra_train.py` (not shipped to the site). Honest limit, stated on the page itself: the model is trained on
vaccine adverse-event text, not on this app's own fictional drugs, so predictions on this app's own cases demonstrate
the pipeline, not a validated clinical mapping for this product set.
