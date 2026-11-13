# UI simplification plan (parked)

Status: **suggested on 2026-11-13, not started.** The team will come back to this after the pipeline work in
[ATHERIA_PIPELINE.md](ATHERIA_PIPELINE.md).

## Recommendation

Do not redesign anything. Hide most of the company portal behind a "simple mode", lead every screen with one
plain-language verdict, and make the demo one story from patient to reviewer.

## What is wrong today

The patient app (SafeReport) is already simple: one screen per step, one action per screen. The company portal
(Atheria) is where the overload is. Measured on the running app at a 768 px tall window:

| Portal screen | Length | What is on it |
|---|---|---|
| Dashboard | about 5 screens of scrolling | 13 cards, 15 charts |
| Signal detail | about 6 screens | 4 tabs, 11 sections on the first tab |
| Audit trail | about 10 screens | about 2,150 words |
| Side menu | | 9 items in 3 groups |

A judge sees the app for a few minutes. Nine menu items and words like "PRR", "Evans criteria" and "ICSR" make
them work to find the point.

## The idea: one story, three portal screens

Demo story: a patient reports a side effect, it lands in the company inbox, the reviewer sees what the AI read
with the evidence, the reviewer approves.

1. **Inbox** replaces the dashboard as the home page: a list of what needs the reviewer, nothing else.
2. **Case** shows the source text on the left and the AI's findings on the right. Each finding links to its
   highlighted quote. Missing or conflicting facts sit in an amber box. Approve and Reject at the bottom.
3. **Signal** opens with one sentence, for example "Zelvora + QT prolongation: not confirmed, 19 of 20 cases
   unlikely". The statistics go behind a "Show the numbers" toggle.

These three screens cover all five trust requirements of the challenge (see the root README).

## Steps, in order

| # | Step | Rough effort | Notes |
|---|---|---|---|
| 1 | Simple mode in the portal | 2 h | `A.simple` already exists in `PV Teams/atheria-web/js/core.js` (set to `false`, used once in `views-simple.js`). Turn it on by default; cut the menu to Inbox, Signals, Audit; make the inbox the home page; collapse detail sections. `?full=1` brings everything back, so nothing is deleted. |
| 2 | Plain words | 30 min | "Triage inbox" to "New reports", "ICSR" to "valid report", "PRR 14.2" to "reported 14x more than expected". Keep the technical term as a tooltip. |
| 3 | Light theme by default | 5 min | The dark theme washes out on projectors. |
| 4 | Connect the two apps | 1-2 h | Today a report submitted in SafeReport never appears in Atheria. Largely covered by stage 1 of the pipeline plan. |
| 5 | Skip sign-up in the patient app for the demo | 15 min | Start at "photograph the medicine" with a pre-filled profile. |

Steps 1 to 3 give most of the benefit. Step 4 makes the demo one continuous flow.

## Rules for whoever does this

- Work on a new branch off `AdiBranch`; the portal is a teammate's code.
- Hide, do not delete. Every hidden screen must still open with `?full=1`.
