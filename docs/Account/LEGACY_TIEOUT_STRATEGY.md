# Monthly reconciliation & the path to automatic tallies

**Created 6 Aug 2026**, after the June 2026 reclassification project
([JUNE_RECLASS_DESIGN.md](JUNE_RECLASS_DESIGN.md)). Answers: "how do we stop
needing corrections like June's every month?"

## Root cause, measured

All 31 June corrections were **double-keying differences**: every voucher is
keyed once into the legacy program (coworker) and once into the ERP, by two
people, from the same physical receipts. They split into:

- **14 wrong-account choices** — both keys are *plausible*, only one matches
  legacy's convention (BIHUN food-grade rubber → Office Refreshment instead of
  BRM; repair parts → the vehicle's diesel account instead of its repair
  account; a SHELL receipt → the wrong vehicle; factory cable → MEE/BIHUN
  machine repair instead of factory repair).
- **17 sen-level amount miskeys** (46.60 vs 46.65, one receipt split 565/144
  vs 465/244).

No entry-time validation can block a plausible-but-wrong account choice — the
value looks valid in isolation. As long as two humans key the same vouchers
into two systems independently, a handful of differences per month is
**expected**, not an anomaly. There are exactly three ways to shrink that cost:

## Layer 1 — monthly tie-out (LIVE since 6 Aug 2026)

`dev/import/legacy-tieout/tie-out.mjs` (procedure in its README): drop in the
coworker's month-end legacy TB as CSV, run one command, get the list of
differing accounts. A clean month prints `differing accounts: 0`. June 2026
post-reclass prints exactly one row — the documented CR_LD +40.00 legacy print
anomaly. Run it within the first days of each month; fixes are then 10-minute
Journal-page edits while receipts are fresh, and no migration scripts, PDF
forensics or handover docs are ever needed again. This converts reconciliation
from a project into a routine, but it is **detection**, not prevention.

## Layer 1.5 — the keying guide (LIVE since 6 Aug 2026)

[KEYING_GUIDE.md](KEYING_GUIDE.md) lists every vendor/account rule proven
during the June reconciliation (vehicle diesel vs repair, machine-vs-factory
split, staff-messing split) plus the amount-keying habits. It is the human
version of Layer 2: most of June's 14 wrong-account moves were recurring
vendors keyed inconsistently, so a pinned-up reference prevents exactly those.
Its limits: it cannot cover new vendors, and it does nothing for sen-level
typos — which is why the Layer 1 tie-out still runs every month as the net.

## Layer 2 — entry-time vendor→account memory (optional, needs a decision)

A Journal-form assist: when keying a manual journal line, match the vendor in
the particulars (TAOBAO-JING XIAN YOU, SHELL BUNDUSAN, EMART, KFC LINTAS…) to
the account used the last time that vendor appeared, and offer it as the
default. The vendor table in [KEYING_GUIDE.md](KEYING_GUIDE.md) is its seed
data. This would have prevented most of June's 14 wrong-account moves —
they were recurring vendors keyed inconsistently. It does nothing for amount
typos and it is a real feature (vendor-normalisation table, picker UI,
override path), so build it only if the monthly tie-out shows wrong-account
keying is still the dominant residue after a few months.

## Layer 3 — single keying (the only true prevention)

The differences exist *because* the vouchers are keyed twice. If the ERP
becomes the books of record and the legacy program stops being keyed (or is
fed from the ERP), the tally is automatic by construction — there is nothing
left to reconcile. June is the evidence the ERP is ready: after the reclass,
**every account of the June TB ties to legacy's print to the cent**, the
BIHUN/MEE estimated reports reproduce the boss's corrected figures exactly,
and the tie-out tool can prove it monthly in minutes.

What Layer 3 takes, when the boss is ready:

1. Boss declares the ERP the books of record from a chosen month; coworker
   stops keying legacy (keep it read-only for history).
2. The monthly tie-out keeps running for a transition period (2–3 months) as
   the safety net, comparing against any legacy reports still printed.
3. Nothing else changes — invoices, receipts, payroll, journals are already
   keyed in the ERP today; the legacy keying is the duplicate effort.

Until Layer 3 is approved, Layer 1 every month is the discipline that keeps
the two systems to the cent.
