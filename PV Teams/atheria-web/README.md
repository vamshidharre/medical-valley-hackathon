# Atheria web

Website version of the Atheria pharmacovigilance platform (ICSR triage + signal investigation).

Run: `python3 -m http.server 8000` in this folder, open http://localhost:8000 (add `?demo=1` to skip sign-in).
No build step, no dependencies. All rules, statistics, guardrails and the hash-chained audit run in the browser.

Real vs stand-in: AI case extractions are the cached outputs from the original project's database; the new-report
reader, summary drafter and chat are offline stand-ins (no model call). The 120 original audit events verify in-browser.
