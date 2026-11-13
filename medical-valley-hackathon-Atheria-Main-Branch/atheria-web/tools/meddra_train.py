r"""
Trains js/meddra_model.js from the symptomify dataset.

Not run by the site — a one-off offline training script, kept here for reproducibility.
Expects ../../symptomify/{train,dev,test}.json (one JSON object per line: VAERS-style
vaccine adverse-event reports, each with symptom_text and symptoms_original, the real
MedDRA Preferred Terms already assigned to it).

Pipeline (must match js/engine.js's classifyMedDRA_ML exactly, since the browser
re-implements this scoring by hand, with no server and no scikit-learn):
  1. Restrict to single-symptom reports (one unambiguous label per case) whose label is
     among the 40 most frequent such labels — enough support per class, small enough to
     run as a classroom-sized, fully inspectable model.
  2. Features: lowercase \w\w+ tokens, unigrams + adjacent bigrams, raw count x idf,
     NO per-document L2 normalisation (sklearn's default norm='l2' is turned off) --
     this is the one design choice made specifically so a browser can reproduce the
     exact feature vector with nothing more than string ops and a lookup table.
  3. Multinomial logistic regression (lbfgs, C=3.0) on that feature matrix.
  4. Export the full dense coefficient matrix (no pruning) plus the vocabulary's idf
     weights to js/meddra_model.js, along with a bundled sample of 220 real held-out
     dev-set rows so the shipped page can re-verify live accuracy in the browser.

Usage: python3 meddra_train.py   (takes ~80s; needs scikit-learn, numpy)
"""
import json, random, re, time, sys, os
from collections import Counter
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score

random.seed(42)
HERE = os.path.dirname(os.path.abspath(__file__))
SYMPTOMIFY = os.path.join(HERE, "..", "..", "symptomify")
OUT_JS = os.path.join(HERE, "..", "js", "meddra_model.js")

TOP40 = ["Product storage error", "Expired product administered", "Product administered to patient of inappropriate age",
         "Unevaluable event", "Inappropriate schedule of product administration", "Herpes zoster", "Pain in extremity", "Rash",
         "Interchange of vaccine products", "Dizziness", "Urticaria", "Tinnitus", "Incorrect dose administered", "Headache",
         "Lymphadenopathy", "Death", "Syncope", "Injection site pain", "Extra dose administered", "Pyrexia", "Pruritus",
         "COVID-19", "Vaccination site pain", "Product preparation issue", "Underdose", "Fatigue", "Arthralgia",
         "Hypoaesthesia", "Wrong product administered", "Pain", "No adverse event", "Poor quality product administered",
         "Paraesthesia", "Incomplete course of vaccination", "Malaise", "Vaccination complication", "Myalgia", "Diarrhoea",
         "Injection site rash", "Product dose omission issue"]
TOPSET = set(TOP40)
CAP_PER_CLASS = 3000
VOCAB_SIZE = 4500
TOPN_SAMPLE_EVAL = 220


def iter_single_label(path):
    with open(path) as f:
        for line in f:
            d = json.loads(line)
            syms = d.get("symptoms_original", [])
            if len(syms) == 1 and syms[0] in TOPSET:
                txt = (d.get("symptom_text") or "").strip()
                if len(txt) >= 5:
                    yield txt, syms[0]


def load_train():
    counts = Counter(lbl for _, lbl in iter_single_label(os.path.join(SYMPTOMIFY, "train.json")))
    rows = []
    for txt, lbl in iter_single_label(os.path.join(SYMPTOMIFY, "train.json")):
        p = min(1.0, CAP_PER_CLASS / counts[lbl])
        if random.random() < p:
            rows.append((txt, lbl))
    return rows


def main():
    t0 = time.time()
    train_rows = load_train()
    dev_rows = list(iter_single_label(os.path.join(SYMPTOMIFY, "dev.json")))
    test_rows = list(iter_single_label(os.path.join(SYMPTOMIFY, "test.json")))
    print(f"train={len(train_rows)} dev={len(dev_rows)} test={len(test_rows)}  ({time.time()-t0:.0f}s)", file=sys.stderr)

    Xtr_txt, ytr = [t for t, l in train_rows], [l for t, l in train_rows]
    Xdv_txt, ydv = [t for t, l in dev_rows], [l for t, l in dev_rows]
    Xte_txt, yte = [t for t, l in test_rows], [l for t, l in test_rows]

    vec = TfidfVectorizer(lowercase=True, token_pattern=r"(?u)\b\w\w+\b", ngram_range=(1, 2),
                           stop_words="english", min_df=5, max_features=VOCAB_SIZE,
                           norm=None, use_idf=True, smooth_idf=True, sublinear_tf=False)
    Xtr = vec.fit_transform(Xtr_txt)
    Xdv, Xte = vec.transform(Xdv_txt), vec.transform(Xte_txt)

    clf = LogisticRegression(max_iter=600, C=3.0, solver="lbfgs")
    clf.fit(Xtr, ytr)

    pdv, pte = clf.predict(Xdv), clf.predict(Xte)
    metrics = {
        "dev_accuracy": round(accuracy_score(ydv, pdv), 4), "dev_macro_f1": round(f1_score(ydv, pdv, average="macro"), 4),
        "test_accuracy": round(accuracy_score(yte, pte), 4), "test_macro_f1": round(f1_score(yte, pte, average="macro"), 4),
        "dev_n": len(dev_rows), "test_n": len(test_rows)
    }
    print("metrics:", metrics, file=sys.stderr)

    vocab = vec.vocabulary_
    terms = [t for t, _ in sorted(vocab.items(), key=lambda kv: kv[1])]
    classes = list(clf.classes_)
    export = {
        "version": "1.0.0",
        "algorithm": "TF-IDF (1-2 grams, raw count x idf, no per-document normalisation) + multinomial logistic regression (dense)",
        "trained_on": "symptomify (VAERS-style vaccine adverse-event reports): train.json, stratified sample",
        "n_train_rows": len(train_rows), "n_classes": len(classes), "n_terms": len(terms),
        "classes": classes, "metrics": metrics,
        "intercepts": [float(round(x, 5)) for x in clf.intercept_],
        "terms": terms, "idf": [float(round(x, 5)) for x in vec.idf_],
        "weights": [[float(round(v, 4)) for v in row] for row in clf.coef_],
    }
    random.seed(7)
    sample = random.sample(dev_rows, TOPN_SAMPLE_EVAL)
    export["sample_eval"] = [{"text": t[:1500], "label": l} for t, l in sample]
    export["sample_eval_note"] = f"{TOPN_SAMPLE_EVAL} reports sampled from the held-out dev split (never used in training). Re-scored live in your browser with the exact model shipped here."

    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("/* Trained MedDRA auto-coder: TF-IDF (1-2 grams) + multinomial logistic regression,\n")
        f.write("   trained on the symptomify dataset (VAERS-style vaccine adverse-event reports).\n")
        f.write("   See README for provenance. Generated by this script, not hand-written. */\n")
        f.write("window.MEDDRA_MODEL = " + json.dumps(export, separators=(",", ":")) + ";\n")
    print(f"wrote {OUT_JS} ({os.path.getsize(OUT_JS)} bytes), total {time.time()-t0:.0f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
