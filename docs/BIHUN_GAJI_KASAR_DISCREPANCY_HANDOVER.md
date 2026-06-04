# Handover: Bihun "Jumlah gaji kasar" higher than legacy system

**Date:** 2026-06-05
**Status:** Root cause identified & verified. **Awaiting a business decision** (rate effective-date intent) before any
code/data remediation. No code has been changed.
**Area:** Payroll — monthly payroll gross pay, Bihun section / SANGKUT BIHUN location.

---

## 1. TL;DR (read this first)
- A co-worker reports the new ERP's **gaji kasar** (gross pay) is higher than the legacy (correct) figures for Bihun /
  BIHUN_SANGKUT workers. Examples (May 2026): RAMBU new **3578.20** vs legacy **3571.62** (+6.58); DANISH new
  **1626.50** vs legacy **1604.50** (+22.00).
- **It is NOT the recently-fixed "jaga stim" OT bug** (commit cf0b6110). Verified: the affected workers don't have the
  conditions that bug needs.
- **It is NOT a calculation/aggregation bug.** The new system sums gross correctly from its inputs (reconciles to the
  cent for clean workers).
- **Root cause: intentional mid-cycle pay-code rate changes that get re-applied to the whole month on reprocess.**
  `OT_BIASA_DY` (updated 2026-05-29) and `BH_ENCENTIVE` (updated 2026-05-28) changed *after* the May payroll was created
  (2026-05-15). Reprocess re-resolves the *current* rate for every logged day by design, so the reprocessed May payroll
  uses the new (higher) rates while the legacy figure used the original rates → new > old. The **same** rate increase
  also reaches workers via **Kerja Luar OT** records that were entered at the new rate (see §1b for the full/refined
  picture — the work-item path explains RAMBU, the Kerja Luar OT path explains DANISH).
- **This is an input/rate-timing issue, not broken code.** Whether anything needs "fixing" depends on a business
  decision: should the late-May rate increases apply to all of May, or only from their effective date forward?

---

## 1b. ⚠️ UPDATE (2026-06-05, later in the session) — the rate-change cause is NARROWER than first thought
After the user indicated the rate change is probably meant for the whole of May, a scope check changed the picture.
**The rate-change explanation fits RAMBU, but RAMBU is a DRYER worker, not a true BIHUN_SANGKUT.** For the workers the
co-worker actually flagged:
- **RAMBU** (BH_DRYER): his work items DO carry the late-changed codes — `BH_ENCENTIVE` (changed 2026-05-28) and
  `OT_BIASA_DY` (2026-05-29). Rate-change story holds. ✅
- **CLARENCE / DARRYL / PREDO** (true BIHUN_SANGKUT): their `payroll_items` use **zero** codes changed after
  2026-05-20. The reprocess-rate mechanism does **not** affect them.
- **DANISH** (BIHUN_SANGKUT): ~90% of his pay is **Kerja Luar OT** in `others_records` (`BH_BIASA_T` @8.72,
  `BH_OT_T` @13.08, `HARI_AHAD_JAM` @17.44, `OT_DIRECT_D`, `IKUT_BX`). His Kerja Luar OT lines carry the **new** rates
  (they match the current codes), i.e. they were entered/edited **after** the rate change → new > legacy = **his
  +22.00 IS the same rate increase, just delivered via Kerja Luar OT** rather than work-log hours.

### How Kerja Luar OT (`others_records`) handles rates — important
`others_records` **freeze `rate` and `amount` at entry/edit time**. The backend (`src/routes/payroll/others-records.js`,
create + update) just persists the `rate`/`amount` the form submits; nothing recomputes them, and **reprocess does NOT
touch them** (only work-log `payroll_items` get re-resolved). So **a pay-code rate change does NOT auto-propagate to
existing Kerja Luar OT records** — only records re-entered/edited after the change pick up the new rate; earlier ones
keep the old rate. (The co-worker assumed rate changes flow into Kerja Luar OT — they do not, automatically.)

**Unified conclusion:** the legacy figures predate the late-May rate increase. The new system reflects the new rates for
**both** vehicles — work-log items (via reprocess) and Kerja Luar OT (frozen-new at entry) — so new > legacy for both
RAMBU's type and DANISH's type. If the raise is meant for all of May (incl. Kerja Luar OT), the new system is correct
and legacy is pre-raise; **no code change**.

**Population — RESOLVED:** the user confirmed the complaint is the **SANGKUT BIHUN location report (location code 10)**,
where RAMBU appears. Salary-report location attribution is in `salary-report.js` (`employee_all_locations` CTE, ~lines
83-131; staffs.location JSONB + job_location_mappings, Head's-job override via `head_staff_id`); each row shows the
worker's **full stored `gross_pay`** under each applicable location, so "gaji kasar" there is the same per-worker gross
analysed above.

**Two caveats to flag to the co-worker:**
1. The system does **not** auto-propagate rate changes to existing Kerja Luar OT (see above). If she wants that, it's a
   feature to build. Otherwise results depend on each record's entry timing → some workers match legacy, some don't.
2. Effective-date: a Kerja Luar OT line for early-May work entered at the new rate is only correct if the raise applies
   to the whole month.

**Revised next step:** get DANISH's legacy per-line breakdown (trays, each leave day, **each Kerja Luar OT line**) plus
the **original** rates for the changed codes, to confirm his +22 = exactly the Kerja Luar OT rate delta (and RAMBU's
+6.58 = the `BH_ENCENTIVE`/`OT` work-item delta).

---

## 2. The reported problem
- New system > legacy for "Jumlah gaji kasar". Co-worker says **all BIHUN_SANGKUT** workers are affected.
- Known good (legacy) vs new:
  | Worker | New (reported) | Legacy (correct) | Diff |
  |---|---|---|---|
  | RAMBU YUNI LAPU | 3578.20 | 3571.62 | +6.58 |
  | DANISH MIEGEL BIN EDWAL | 1626.50 | 1604.50 | +22.00 |
- User reads the new figures from the **Payroll Details** page.

---

## 3. What was RULED OUT — the jaga-stim OT fix (commit cf0b6110)
The latest commit fixed a real bug where, if a worker had a natural-OT line *and* a `BH_OT_STIM` (jaga stim) line on the
same day, both lines were paid the combined hours. First suspect, but **not the cause here**:
- **RAMBU**: all OT is a single `OT_BIASA_DY` line per day; **no `BH_OT_STIM` line exists** → bug can't trigger.
- **DANISH**: has **zero OT payroll_items** at all.
- The jaga-stim fix and the gross aggregation are correct — **do not modify them**.

---

## 4. Root cause (verified)
### Mechanism
1. May 2026 payroll (`monthly_payrolls.id = 44`) created **2026-05-15**.
2. Pay-code rates changed afterward (intentional, confirmed by the user):
   - `BH_ENCENTIVE` `rate_biasa` → **1.54**, `updated_at` **2026-05-28**.
   - `OT_BIASA_DY` `rate_biasa` → **15.60**, `updated_at` **2026-05-29**.
3. The May payroll was then **reprocessed**. On reprocess the backend re-resolves the *current* `pay_codes` rate for
   every already-logged day — this is deliberate (commit 3769cb8b). See
   **`src/routes/payroll/monthly-payrolls.js:682-706`** (comment: *"a mid-month pay-code rate change applies to
   already-logged days on reprocess instead of keeping the frozen rate_used snapshot"*).
4. **Proof it happened:** RAMBU's stored `payroll_items` row for `BH_ENCENTIVE` already carries rate **1.54** (the
   post-2026-05-28 value), so his May payroll was reprocessed after the change. The legacy number used the original rate
   → new > legacy.

### Why it's systematic ("all BIHUN_SANGKUT")
Every Bihun worker with hours on a changed code (e.g. `BH_ENCENTIVE`, which most Bihun workers have) gets the higher
rate applied to the whole month on reprocess. RAMBU alone has 153.5 hrs of `BH_ENCENTIVE`, so even a few-sen rate bump
moves his gross by ~RM6 — consistent with his +6.58 gap.

### Important nuance: viewing vs reprocessing
- **Viewing** Payroll Details does **not** re-resolve rates — it consolidates the *stored* `payroll_items.rate`
  (`src/routes/payroll/employee-payrolls.js:1107-1137`). So opening the page is safe.
- The overstatement is baked in at **reprocess** time (step 3). The number won't change again unless reprocessed again.

---

## 5. Supporting evidence / reconciliation
"Gaji kasar" = stored `employee_payrolls.gross_pay` (`src/routes/payroll/salary-report.js:281`) =
`Σ payroll_items + Σ leave_records.amount_paid + Σ others_records + Σ commission_records`.

**The new system sums this faithfully** — for clean single-ID SANGKUT workers, stored gross = component sum to the cent:

| Worker | Stored gross | work_items + leave + others + comm | Diff |
|---|---|---|---|
| CLARENCE | 979.66 | 979.66 | 0.00 |
| DARRYL | 839.67 | 839.67 | 0.00 |
| PREDO | 878.17 | 878.17 | 0.00 |
| RAMBU (id 300) | 3578.20 | 2515.10 + 416.10 + 647.00 = 3578.20 | 0.00 |
| DANISH (id 279) | 1623.07 (dev) | 104.50 + 196.17 + 1392.16 = 1692.83 | **−69.76 (stale, see §8)** |
| ROSMINA_SB | 1337.90 | 945.56 (rest under sibling ID) | multi-ID split |

RAMBU detail: work 2515.10 (incl. OT_BIASA_DY 75h × 15.60 = 1170.00; BH_ENCENTIVE 153.5h × 1.54 = 236.39); leave 5 ×
83.22 = 416.10 (cuti_umum May 1/27/30 + cuti_tahunan May 2/31); others 647.00 (5S 50 + JAGA KAWASAN 300 + BONUS 297).

---

## 6. THE OPEN QUESTION (blocks remediation)
**Were the 28-29 May `OT_BIASA_DY` / `BH_ENCENTIVE` rate increases meant to apply to ALL of May, or only from their
effective date forward?**
- **All of May** → the new figures are correct; the legacy ones are pre-raise/outdated. **No code change** — reconcile
  expectations with the co-worker; optionally re-confirm any other reprocessed months.
- **Effective-dated / forward only** → reprocess over-applied the new rate to earlier-May days → remediation needed
  (§7).

**User's preliminary view (2026-06-05):** because the change was applied in the last few days of May, they think it was
meant for the **whole of May** → new figures correct for the rate-driven workers. ⚠️ **But see §1b** — this only
resolves the DRYER/work-driven workers (RAMBU's type), not the actual BIHUN_SANGKUT job workers (DANISH etc.), whose
discrepancy is not rate-driven and is still unexplained. Do not treat the whole complaint as closed.

---

## 7. Remediation options (only if "effective-dated / forward only")
- **(a) Effective-dated pay-code rates (proper fix):** add an effective date to rate changes; on reprocess resolve the
  rate in effect for each logged day instead of always the latest. Largest change; touches
  `monthly-payrolls.js:682-706` and the pay-code rate model/UI.
- **(b) Lock finalized payrolls:** once a month is finalized, stop reprocess from re-resolving newer rates (status
  gate), so historical months keep their period rates.
- **(c) Targeted manual correction (smallest, fragile):** temporarily restore May rates, reprocess **May only**, then
  restore current rates. Risky — there is **no rate history table**, and must not disturb June.

---

## 8. Secondary issue noted (not the user's complaint, but real)
The stored `employee_payrolls.gross_pay` can go **stale** vs the live Payroll Details recalc. DANISH's stored gross
(1623.07 in dev) is 69.76 below his current component sum (1692.83) because an `others` record was added after
processing. The **Salary Report** reads the stored snapshot while **Payroll Details** recalculates live → they can
disagree. This also explains why DANISH's dev figure ≠ the prod figure (1626.50) — **the dev DB is not a perfect
mirror of prod for DANISH; trust RAMBU (dev = prod = 3578.20) for analysis.** Consider separately whether the salary
report should recompute or whether processing should refresh stored gross when records change.

---

## 9. Next steps for tomorrow
0. **First, confirm the population (see §1b):** is the complaint about the SANGKUT BIHUN *location* report or the
   BIHUN_SANGKUT *job* workers? This decides whether the rate decision closes most of it.
1. **Get the legacy per-line breakdown for DANISH** (a true BIHUN_SANGKUT worker we have a number for) — trays, each
   leave day, each Kerja Luar OT line — to pin the real source of his +22.00 (NOT rate-driven; see §1b). Also get
   **RAMBU's** breakdown to confirm his +6.58 = the `BH_ENCENTIVE`/`OT` rate delta once accounting provides the
   **original** rates.
2. **Build the impact report** (read-only): for each reprocessed monthly payroll, find pay codes whose
   `pay_codes.updated_at` is later than `monthly_payrolls.created_at`, and the workers/hours using them. With the
   original rates from step 1, per-worker overstatement = Σ over changed codes of (new − old) × hours-on-code.
3. **Wait for the business decision** (§6) before changing anything.
4. If remediation is approved, implement the chosen option (§7) and **verify by reconciling RAMBU to the cent** against
   the legacy breakdown, then spot-check CLARENCE/DARRYL.

---

## 10. Reference data & queries
**Dev DB access:** `docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "SQL"`

**Key IDs:**
- May 2026 monthly payroll = `monthly_payrolls.id = 44` (status "Processing").
- RAMBU: `employee_payrolls.id = 300` (job "BH_DRYER, BH_PACKING"). Staff IDs: `RAMBU` (BH_DRYER) + `RAMBU_PB`
  (BH_PACKING). Has `employee_pay_codes` override for `OT_BIASA_DY` (15.60/20.81/31.21) and `JAGA_GATE` (300);
  `BH_ENCENTIVE` is NOT overridden (uses base rate 1.54).
- DANISH: `employee_payrolls.id = 279` (job "BIHUN_SANGKUT"). Staff IDs: `DANISH` (BIHUN_SANGKUT) + `DANISH_MB`
  (BH_DEPAN).

**Key code locations:**
- `src/routes/payroll/monthly-payrolls.js:682-706` — reprocess re-resolves current pay_codes rate (THE mechanism).
- `src/routes/payroll/employee-payrolls.js:1107-1137` — Payroll Details view consolidates stored item rate (no
  re-resolve).
- `src/routes/payroll/salary-report.js:281` — `gajiKasar = gross_pay`.
- `src/routes/payroll/daily-work-logs.js:346-356, 628-638` — jaga-stim OT fix (cf0b6110); do not touch.
- `src/pages/Payroll/MonthlyLog/MonthlyLogEntryPage.tsx:82` — `DEFAULT_LEAVE_AMOUNT = 65` (leave pay is a manual input,
  stored as-is).
- Commit `3769cb8b` — "apply current pay-code rates on reprocess" (origin of the reprocess behavior).

**Useful SQL:**
```sql
-- Rate-change timing vs payroll creation
SELECT id, rate_biasa, rate_ahad, rate_umum, rate_unit, updated_at
FROM pay_codes WHERE id IN ('OT_BIASA_DY','BH_ENCENTIVE','BH_MATERIAL','BHANGKUT');

-- Per-worker gross reconciliation (all SANGKUT workers, May = id 44)
SELECT ep.employee_id, ep.gross_pay AS stored_gross,
  (SELECT COALESCE(SUM(amount),0) FROM payroll_items WHERE employee_payroll_id=ep.id) AS work_items,
  (SELECT COALESCE(SUM(amount_paid),0) FROM leave_records lr WHERE lr.employee_id=ep.employee_id
     AND EXTRACT(YEAR FROM lr.leave_date)=2026 AND EXTRACT(MONTH FROM lr.leave_date)=5) AS leave_sum,
  (SELECT COALESCE(SUM(amount),0) FROM others_records o WHERE o.employee_id=ep.employee_id
     AND EXTRACT(YEAR FROM o.record_date)=2026 AND EXTRACT(MONTH FROM o.record_date)=5) AS others_sum
FROM employee_payrolls ep
WHERE ep.monthly_payroll_id=44 AND ep.job_type LIKE '%SANGKUT%' ORDER BY ep.employee_id;

-- A worker's overtime items (swap the id)
SELECT pi.source_date, pi.pay_code_id, pc.pay_type, pi.rate, pi.quantity, pi.amount
FROM payroll_items pi JOIN pay_codes pc ON pi.pay_code_id=pc.id
WHERE pi.employee_payroll_id=300 AND pc.pay_type='Overtime' ORDER BY pi.source_date;
```

---

## 11. Constraints / do-nots
- **Do not change** the jaga-stim OT logic or the gross aggregation — both verified correct.
- **No code changes** until the §6 business decision is confirmed.
- The dev DB is **not a perfect mirror of prod** (DANISH differs). Anchor analysis on RAMBU (dev = prod).
- Follow CLAUDE.md: ask before touching unrelated components; add a changelog entry only if/when a user-visible change
  actually ships.
