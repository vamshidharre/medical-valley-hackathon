"""Load Atheria's synthetic seed data into the local Exasol database.

Creates schema PV with:
  REPORTS  1,261 synthetic side-effect reports (from PV Teams/atheria-web/js/data.js)
  AUDIT    120 hash-chained audit events (payload stored as the exact canonical string that was hashed)
  SIGNALS  view: PRR, ROR (95% CI), chi-squared and the Evans criteria per drug-event pair,
           the same fixed rules as js/engine.js computeAll

Tables are only filled when empty, so rows written later (new reports, new audit events) are kept.
--reset drops and reloads everything.

Run from the repo root:
  safereport/.venv/Scripts/python.exe db/load_exasol.py [--reset]
Connection: EXASOL_DSN / EXASOL_USER / EXASOL_PASSWORD, else the local Exasol Personal deployment's secrets.json.
"""
import json
import os
import sys
from pathlib import Path

import pyexasol

ROOT = Path(__file__).resolve().parent.parent
DATA_JS = ROOT / "atheria-web" / "js" / "data.js"

DDL = [
    "CREATE SCHEMA IF NOT EXISTS PV",
    """CREATE TABLE IF NOT EXISTS PV.REPORTS (
        report_id       VARCHAR(20) PRIMARY KEY,
        drug            VARCHAR(100) NOT NULL,
        event_term      VARCHAR(200) NOT NULL,
        age             DECIMAL(3,0),
        sex             CHAR(1),
        serious         BOOLEAN,
        country         CHAR(2),
        received_date   DATE,
        narrative       VARCHAR(20000),
        extraction_json VARCHAR(200000),
        report_source   VARCHAR(30) NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS PV.AUDIT (
        seq          DECIMAL(10,0) PRIMARY KEY,
        ts           VARCHAR(40) NOT NULL,
        event_type   VARCHAR(50) NOT NULL,
        actor        VARCHAR(100) NOT NULL,
        payload_json VARCHAR(200000) NOT NULL,
        prev_hash    CHAR(64) NOT NULL,
        event_hash   CHAR(64) NOT NULL
    )""",
    # Fixed rules, no AI: same formulas and thresholds as js/engine.js (computePair, EVANS).
    # Haldane correction (+0.5 to every cell) when any cell of the 2x2 table is zero.
    """CREATE OR REPLACE VIEW PV.SIGNALS AS
    WITH pairs AS (
        SELECT drug, event_term, COUNT(*) AS a FROM PV.REPORTS GROUP BY drug, event_term
    ), per_drug AS (
        SELECT drug, COUNT(*) AS dn FROM PV.REPORTS GROUP BY drug
    ), per_event AS (
        SELECT event_term, COUNT(*) AS en FROM PV.REPORTS GROUP BY event_term
    ), total AS (
        SELECT COUNT(*) AS n FROM PV.REPORTS
    ), cells AS (
        SELECT p.drug, p.event_term,
               CAST(p.a AS DOUBLE) AS a,
               CAST(pd.dn - p.a AS DOUBLE) AS b,
               CAST(pe.en - p.a AS DOUBLE) AS c,
               CAST(t.n - pd.dn - pe.en + p.a AS DOUBLE) AS d,
               CAST(t.n AS DOUBLE) AS n
        FROM pairs p
        JOIN per_drug pd ON pd.drug = p.drug
        JOIN per_event pe ON pe.event_term = p.event_term
        CROSS JOIN total t
    ), adj AS (
        SELECT cells.*, CASE WHEN LEAST(a, b, c, d) > 0 THEN 0 ELSE 0.5 END AS k FROM cells
    ), stats AS (
        SELECT drug, event_term, a, b, c, d,
               ((a + k) / (a + b + 2 * k)) / ((c + k) / (c + d + 2 * k)) AS prr,
               ((a + k) * (d + k)) / ((b + k) * (c + k)) AS ror,
               SQRT(1 / (a + k) + 1 / (b + k) + 1 / (c + k) + 1 / (d + k)) AS se,
               CASE WHEN (a + b) * (c + d) * (a + c) * (b + d) = 0 THEN 0
                    ELSE n * POWER(GREATEST(0, ABS(a * d - b * c) - n / 2), 2)
                         / ((a + b) * (c + d) * (a + c) * (b + d)) END AS chi2
        FROM adj
    )
    SELECT drug || '__' || event_term AS signal_id, drug, event_term,
           CAST(a AS DECIMAL(10,0)) AS a, CAST(b AS DECIMAL(10,0)) AS b,
           CAST(c AS DECIMAL(10,0)) AS c, CAST(d AS DECIMAL(10,0)) AS d,
           ROUND(prr, 4) AS prr, ROUND(ror, 4) AS ror,
           ROUND(EXP(LN(ror) - 1.96 * se), 4) AS ror_lo, ROUND(EXP(LN(ror) + 1.96 * se), 4) AS ror_hi,
           ROUND(chi2, 4) AS chi2,
           (prr >= 2 AND chi2 >= 4 AND a >= 3) AS is_signal
    FROM stats""",
]


def connect():
    pw = os.environ.get("EXASOL_PASSWORD")
    if not pw:
        secrets = Path.home() / ".exasol" / "personal" / "deployments" / "default" / "secrets.json"
        pw = json.loads(secrets.read_text())["dbPassword"]
    return pyexasol.connect(
        dsn=os.environ.get("EXASOL_DSN", "127.0.0.1:8563"),
        user=os.environ.get("EXASOL_USER", "sys"),
        password=pw,
        websocket_sslopt={"cert_reqs": 0},  # local self-signed certificate
    )


def read_seed():
    text = DATA_JS.read_text(encoding="utf-8")
    return json.loads(text[len("window.DATA="):].rstrip().rstrip(";"))


def report_rows(reports):
    for r in reports:
        narrative = r[8] if len(r) > 8 else None
        extraction = json.dumps(r[9], ensure_ascii=False) if len(r) > 9 and r[9] else None
        yield (r[0], r[1], r[2], r[3], r[4], bool(r[5]), r[6], r[7], narrative, extraction, "synthetic_seed")


def audit_rows(events):
    for e in events:
        yield (e["seq"], e["ts"], e["type"], e["actor"], e["ps"], e["prev_hash"], e["hash"])


def main():
    reset = "--reset" in sys.argv
    seed = read_seed()
    conn = connect()
    if reset:
        conn.execute("DROP SCHEMA IF EXISTS PV CASCADE")
    for stmt in DDL:
        conn.execute(stmt)

    for table, rows in (("REPORTS", report_rows(seed["reports"])), ("AUDIT", audit_rows(seed["audit"]))):
        existing = conn.execute(f"SELECT COUNT(*) FROM PV.{table}").fetchval()
        if existing:
            print(f"PV.{table}: {existing} rows already there, left unchanged (use --reset to reload)")
        else:
            conn.import_from_iterable(rows, ("PV", table))
            print(f"PV.{table}: loaded {conn.execute(f'SELECT COUNT(*) FROM PV.{table}').fetchval()} rows")

    n_pairs, n_signals = conn.execute(
        "SELECT COUNT(*), SUM(CASE WHEN is_signal THEN 1 ELSE 0 END) FROM PV.SIGNALS").fetchone()
    print(f"PV.SIGNALS: {n_pairs} drug-event pairs, {n_signals} meet the Evans criteria")
    conn.close()


if __name__ == "__main__":
    main()
