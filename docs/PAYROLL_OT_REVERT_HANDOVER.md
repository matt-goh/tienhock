# Payroll OT Calculation — REVERT Handover (undo the July 2026 OT salary formula)

Prepared: 2026-07-21
Status: **planning only — no code, schema, or data has been changed by this document**

**Production context (confirmed 2026-07-21):** production **ran the new OT
formula live for a while**. The OT cutoff is **July 2026 and later**, so July
2026 is the only affected payroll month. The user confirmed July 2026 on
production is **not finalized** — no payslips issued, no salaries paid, no
payroll journals posted — so a clean full revert is safe. Decision: **reprocess
July 2026 back to the old configured-rate method on both dev and production**
(no month keeps the new formula). Production therefore also needs the code
revert, a July reprocess, and the DROP migration (see §6.1).

## 1. Why we are reverting

In July 2026 we implemented a new July‑2026‑onwards overtime (OT) salary formula
(salary + eligible additions ÷ 26 or actual worked days ÷ 8 × 1.5/2.0/3.0),
documented in `docs/PAYROLL_OT_CALCULATION_JULY_2026_HANDOVER.md` and
`docs/PAYROLL_OT_CALCULATION_BREAKDOWN.md`.

The user has since confirmed, after consulting **another accountant**, that the
**original OT behaviour** (static configured OT rate × OT hours, from the pay
code / job override / employee override / effective‑month rate schedule) was the
correct one all along. The whole OT change must be undone.

**Ultimate goal:** the payroll system behaves exactly as it did before commit
`490af9a`, including removing the **OT Pay Basis** staff field and restoring the
UI in `StaffFormPage.tsx` / `StaffDetailsPage.tsx` (and their Jelly Polly twins),
removing the **OT Rate Mode** pay‑code field, removing the **Worked Days**
monthly‑log input, and removing the **OT Rate Calculation** panels on the
payroll details pages.

## 2. Why NOT `git reset`/`rebase` (and how we WILL do it)

The OT work is buried under ~13 unrelated commits (bank‑in, invoices,
closing‑stock, legacy‑report accounting work). A hard reset or interactive
rebase back to before the OT work would **destroy all of that later work** and
rewrite shared history — do not do it. The user is right to avoid it.

Instead, revert **per file**, non‑destructively:

- **`git checkout <PRE_OT> -- <file>`** restores a single file's content to a
  past commit. It only stages that file; it does **not** move `HEAD`, switch
  branches, or rewrite history. This is safe and is the main tool here.
- A handful of files were *also* edited by later unrelated commits — those get a
  **surgical hunk removal** instead of a wholesale restore (see §5).
- Schema is undone with a **new forward migration** that `DROP`s the columns.

`git revert 490af9a` is **not recommended**: that commit bundled the code with
doc/changelog/migration edits, and the migration file it added was already
deleted later (commit `d100cf6`), so a straight revert re‑creates noise and
conflicts with the interleaved commits. Per‑file is cleaner and auditable.

Define the pre‑OT baseline once:

```bash
# 0cd22b0f = the docs-only commit immediately BEFORE the big OT impl 490af9a.
# All payroll CODE files are pre-OT at this point.
PRE_OT=490af9aa8af9a2bf721c5416d5e6a7728ec444e1~1   # == 0cd22b0f
```

## 3. The commits being undone

| Commit | Date | What it did | Undo action |
| --- | --- | --- | --- |
| `d06e1e5` | 07‑17 | Added handover doc | Delete the doc (§7) |
| `0cd22b0` | 07‑18 | Updated handover doc | Delete the doc (§7) |
| `490af9a` | 07‑19 | **The implementation** — 35 files, formula core, schema, UI, all 3 companies | Bulk of §4–§6 |
| `d100cf6` | 07‑20 | Removed the OT migration `.sql` file | Nothing — file already gone; we drop columns in §6 |
| `6e283a2` | 07‑20 | "daily log wins" v3 refinement (otFormula, TH/JP processors, docs, changelog) | Folded into §4/§5/§7 |
| `b67f9b2` | 07‑21 | Added OT Pay Basis to staff **details** pages + form tweaks (TH+JP) | Folded into §4 |

Interleaved *unrelated* commits that touched some of the same files (so a blind
restore would lose them): `72f66723` (sticky headers on log‑entry pages),
`627b953c` (invoice bundle → `types.ts`), plus doc/changelog edits. These force
the surgical handling in §5.

## 4. Files to RESTORE WHOLESALE (safe `git checkout $PRE_OT -- …`)

These files were touched **only** by the OT commits and by no later unrelated
commit, so restoring them to `$PRE_OT` is exact and loses nothing.

```bash
git checkout $PRE_OT -- \
  src/components/Catalogue/PayCodeModal.tsx \
  src/pages/Catalogue/StaffFormPage.tsx \
  src/pages/Catalogue/StaffDetailsPage.tsx \
  src/pages/JellyPolly/Catalogue/JPStaffFormPage.tsx \
  src/pages/JellyPolly/Catalogue/JPStaffDetailsPage.tsx \
  src/pages/GreenTarget/Payroll/GTPayrollDetailsPage.tsx \
  src/pages/GreenTarget/Payroll/GTPayrollPage.tsx \
  src/pages/JellyPolly/Payroll/JPPayrollDetailsPage.tsx \
  src/pages/JellyPolly/Payroll/JPPayrollPage.tsx \
  src/pages/Payroll/PayrollDetailsPage.tsx \
  src/pages/Payroll/PayrollPage.tsx \
  src/utils/payroll/payrollUtils.ts \
  src/routes/catalogue/pay-codes.js \
  src/routes/catalogue/staffs.js \
  src/routes/jellypolly/pay-codes.js \
  src/routes/jellypolly/staffs.js \
  src/routes/jellypolly/employee-payrolls.js \
  src/routes/jellypolly/jpPayrollProcessor.js \
  src/routes/jellypolly/monthly-payrolls.js \
  src/routes/jellypolly/monthly-work-logs.js \
  src/routes/greentarget/employee-payrolls.js \
  src/routes/greentarget/monthly-payrolls.js \
  src/routes/greentarget/monthly-work-logs.js \
  src/routes/payroll/employee-payrolls.js \
  src/routes/payroll/monthly-payrolls.js \
  src/routes/payroll/monthly-work-logs.js
```

(26 files.) This single step removes: the OT Pay Basis field + `otPayBasis`
save/normalize logic in both staff forms; the OT Pay Basis read‑only row on both
staff details pages; the OT Rate Mode field in `PayCodeModal`; all
`otFormula`/`computeOTRates`/`buildOTSnapshot` calls, the JP block‑error
threading, the `errors` field in JP monthly processing, and the OT Rate
Calculation panels/imports on the TH/GT/JP payroll details & list pages.

> Sanity check after running: `grep -rl "otFormula\|OTCalculationSnapshot\|ot_calculation\|otPayBasis\|ot_rate_mode\|resolveOTPayBasis\|buildOTSnapshot\|computeOTRates" src/` should return **only** the four surgical files in §5 (plus nothing once §5 and §7 are done).

## 5. Files needing SURGICAL hunk removal (do NOT wholesale‑restore)

Each of these was also edited by a later unrelated commit; keep that later change
and remove only the OT hunks. Use `git show <commit> -- <file>` to see exactly
which lines the OT commit added, then delete those blocks by hand.

### 5.1 `src/types/types.ts`  (OT added in `490af9a`; later touched by `627b953c`)
Remove the three OT insertions, keep everything else:
- in `interface Employee`: the `otPayBasis?: string;` line + its comment (after `sipAgeOverride`);
- in `interface PayCode`: the `ot_rate_mode?: "salary_formula" | "fixed";` line + its comment;
- the entire `interface OTCalculationSnapshot { … }` block, **and** the
  `ot_calculation?: OTCalculationSnapshot | null;` line (+comment) in `interface EmployeePayroll`.

### 5.2 Monthly‑log entry pages — remove the **Worked Days** input
OT added in `490af9a`; later touched by `72f66723` (sticky header — keep it).
- `src/pages/Payroll/MonthlyLog/MonthlyLogEntryPage.tsx`
- `src/pages/GreenTarget/Payroll/GTMonthlyLogEntryPage.tsx`
- `src/pages/JellyPolly/Payroll/JPMonthlyLogEntryPage.tsx`

For each: `git show 490af9a -- <file>` shows the added "Worked Days" state,
handler, payload field, and the input JSX. Delete those additions only.

### 5.3 `src/components/ChangelogModal.tsx` — remove the two OT entries
OT entries added by `490af9a` (dated **2026‑07‑19**) and `6e283a2` (dated
**2026‑07‑20**, "worked‑day count … corrected for staff who hold two jobs").
Delete **both** objects from `CHANGELOG_ENTRIES`. ⚠️ Keep the *other*
2026‑07‑20 entry (Trial Balance / Income Statement / opening stock) — that one is
accounting, not OT.

### 5.4 `CLAUDE.md` and `AGENTS.md` — revert the four schema lines
`490af9a` appended an OT clause to four schema descriptions in **both** files.
Remove the appended clause on each line (leave the rest of the line intact):
- **`staffs`** line — remove `, ot_pay_basis ('monthly_26'|'actual_days'|NULL; …optional override for odd cases…Same column on jellypolly.staffs)`.
- **`pay_codes`** line — remove `, ot_rate_mode ('salary_formula' default | 'fixed'; …same column on jellypolly.pay_codes)`.
- **`employee_payrolls`** line — remove `, ot_calculation (nullable JSONB; …buildOTSnapshot in src/routes/payroll/otFormula.js; same column on greentarget… and jellypolly…)`.
- **`monthly_work_log_entries`** line — remove `, worked_days (nullable numeric(4,1); …same column on greentarget… and jellypolly…)`.

The exact pre‑OT text of each line is the `-` side of `git show 490af9a -- CLAUDE.md`
(and `AGENTS.md`) — copy those four lines back verbatim.

## 6. Schema revert — new DROP migration

The original OT migration (`dev/migrations/2026-07-19_payroll_ot_formula_july2026.sql`)
was **already deleted** from the repo (commit `d100cf6`) but its columns were
applied to the dev DB. Confirmed present in dev right now:

| Column | Tables |
| --- | --- |
| `ot_pay_basis varchar(20)` | `public.staffs`, `jellypolly.staffs` |
| `ot_rate_mode varchar(20) NOT NULL DEFAULT 'salary_formula'` | `public.pay_codes`, `jellypolly.pay_codes` |
| `worked_days numeric(4,1)` | `public.` + `greentarget.` + `jellypolly.monthly_work_log_entries` |
| `ot_calculation jsonb` | `public.` + `greentarget.` + `jellypolly.employee_payrolls` |

**Data footprint in dev (checked 2026‑07‑21):** `ot_pay_basis` set on **0** staff;
`ot_rate_mode <> 'salary_formula'` on **0** pay codes; `worked_days` set on **0**
entries; `ot_calculation` populated on **11** `public.employee_payrolls` rows
(GT/JP: 0) — leftover July‑2026 test reprocesses. So dropping the columns loses
only those 11 audit snapshots; no configured OT settings depend on them.

Create `dev/migrations/2026-07-21_revert_payroll_ot_formula.sql`:

```sql
-- 2026-07-21: Revert the July-2026 OT salary-formula metadata.
-- The OT formula is being removed; OT reverts to configured rate × OT hours.
-- Safe DROPs (IF EXISTS); dev data footprint is only 11 ot_calculation snapshots.
BEGIN;

ALTER TABLE public.staffs                      DROP COLUMN IF EXISTS ot_pay_basis;
ALTER TABLE jellypolly.staffs                  DROP COLUMN IF EXISTS ot_pay_basis;

ALTER TABLE public.pay_codes                   DROP COLUMN IF EXISTS ot_rate_mode;
ALTER TABLE jellypolly.pay_codes               DROP COLUMN IF EXISTS ot_rate_mode;

ALTER TABLE public.monthly_work_log_entries      DROP COLUMN IF EXISTS worked_days;
ALTER TABLE greentarget.monthly_work_log_entries DROP COLUMN IF EXISTS worked_days;
ALTER TABLE jellypolly.monthly_work_log_entries  DROP COLUMN IF EXISTS worked_days;

ALTER TABLE public.employee_payrolls           DROP COLUMN IF EXISTS ot_calculation;
ALTER TABLE greentarget.employee_payrolls      DROP COLUMN IF EXISTS ot_calculation;
ALTER TABLE jellypolly.employee_payrolls       DROP COLUMN IF EXISTS ot_calculation;

COMMIT;
```

Apply in dev:
```bash
docker exec -i tienhock_dev_db psql -U postgres -d tienhock \
  < dev/migrations/2026-07-21_revert_payroll_ot_formula.sql
```

> **Order:** run the **code revert (§4/§5) BEFORE** dropping the columns, so no
> running route reads/writes them mid‑change. In dev it doesn't matter much;
> just don't drop while the old (OT) code is still live.

> **Production (confirmed live):** production ran the new OT formula, so prod
> **does** have all 10 columns and they must be dropped there too — this is not
> optional. **Unlike dev, prod may hold real values** in `ot_pay_basis`,
> `ot_rate_mode` (a code set to `fixed`), and `worked_days` (keyed by a user),
> plus July `ot_calculation` snapshots. Since the feature is being removed
> wholesale that data is obsolete, but **capture the footprint before dropping**
> (query below) so nothing is silently lost, and follow the ordered §6.1
> sequence. Run the same query on prod that §6 shows for dev:
>
> ```sql
> SELECT 'staffs ot_pay_basis' t, count(*) FROM public.staffs WHERE ot_pay_basis IS NOT NULL
> UNION ALL SELECT 'jp staffs ot_pay_basis', count(*) FROM jellypolly.staffs WHERE ot_pay_basis IS NOT NULL
> UNION ALL SELECT 'pay_codes fixed', count(*) FROM public.pay_codes WHERE ot_rate_mode <> 'salary_formula'
> UNION ALL SELECT 'jp pay_codes fixed', count(*) FROM jellypolly.pay_codes WHERE ot_rate_mode <> 'salary_formula'
> UNION ALL SELECT 'mwl worked_days (public/gt/jp)',
>   (SELECT count(*) FROM public.monthly_work_log_entries WHERE worked_days IS NOT NULL)
>   +(SELECT count(*) FROM greentarget.monthly_work_log_entries WHERE worked_days IS NOT NULL)
>   +(SELECT count(*) FROM jellypolly.monthly_work_log_entries WHERE worked_days IS NOT NULL)
> UNION ALL SELECT 'ot_calculation (public/gt/jp)',
>   (SELECT count(*) FROM public.employee_payrolls WHERE ot_calculation IS NOT NULL)
>   +(SELECT count(*) FROM greentarget.employee_payrolls WHERE ot_calculation IS NOT NULL)
>   +(SELECT count(*) FROM jellypolly.employee_payrolls WHERE ot_calculation IS NOT NULL);
> ```

### 6.1 Production rollout sequence (confirmed order)

July 2026 on prod is **not finalized** (no payslips/payments/journals), so no
clawbacks or reconciliation are needed — but the steps must run in this order:

1. **Deploy the reverted code to production** (merge to the `production` branch →
   the `deploy.yml` GitHub Action rebuilds the frontend and restarts
   `tienhock-server`). The old configured-rate OT path is now live. The reverted
   code does not read/write the OT columns, so it runs fine while the columns
   still exist.
2. **Reprocess July 2026 payroll on prod** for all three companies (TH, GT, JP)
   via the normal "Process payroll" flow, so OT items rebuild at the configured
   rates. Spot-check that July OT rates now match June behaviour.
3. **Capture the prod OT-column footprint** (query above), for the record.
4. **Run the DROP migration on the prod DB** (§6). Drop **last**, after code and
   reprocess, so nothing references the columns mid-rollout.

Do the same on dev (deploy = just the reverted working tree; then reprocess dev
July 2026; then apply the DROP migration to `tienhock_dev_db`).

## 7. Files/docs to DELETE

```bash
git rm src/routes/payroll/otFormula.js \
       src/components/Payroll/PayrollProcessingErrorsDialog.tsx \
       docs/PAYROLL_OT_CALCULATION_BREAKDOWN.md \
       docs/PAYROLL_OT_CALCULATION_JULY_2026_HANDOVER.md
```

(The `PayrollProcessingErrorsDialog` import is removed by the §4 wholesale
restores of the three `*PayrollPage.tsx` files, so nothing will import it.)
Decide whether to also delete **this** revert handover once the work is done.

## 8. Data / reprocessing after the revert

- **Both environments must reprocess July 2026** (the only month the formula
  touched) so OT items are rebuilt at the configured rates. Reprocessing is the
  normal "Process payroll" flow — there is no data backfill to write. Do it
  **after** the reverted code is live and **before** dropping `ot_calculation`
  (see §6.1 for the prod order).
- **Dev footprint (checked 2026‑07‑21):** only **11** `public.employee_payrolls`
  rows carry `ot_calculation` snapshots (GT/JP: 0); `ot_pay_basis`,
  `ot_rate_mode`, and `worked_days` are unset everywhere, so dev needs nothing
  beyond reprocessing July + the DROP migration.
- **Prod footprint is unknown** — run the §6 query first. Prod may have real
  `ot_pay_basis` / `ot_rate_mode='fixed'` / `worked_days` values and more July
  `ot_calculation` snapshots. All of it is obsolete once the feature is gone;
  the DROP (§6) discards it. Since July isn't finalized, there are **no paid
  differences to reconcile** — the reprocess simply restores the old numbers.

## 9. Changelog for the revert (Rule 16)

**Decision (confirmed 2026‑07‑21):** simply **delete the two OT changelog
entries** (§5.3) once the revert is done — **no** "reverted" entry is added.
Even though the feature was briefly live on production, the user chose to remove
the entries rather than announce a reversal. Nothing else to add to
`CHANGELOG_ENTRIES` for this change.

## 10. Verification checklist

Code / UI (run the app):
- [ ] Staff form (TH + JP): no "OT Pay Basis (from July 2026)" field / "Overtime Settings" block.
- [ ] Staff details (TH + JP): no "OT Pay Basis" row.
- [ ] Pay Code modal: no "OT Rate Mode (July 2026 onwards)" field.
- [ ] Monthly log entry pages (TH/GT/JP): no "Worked Days" input; sticky header still works.
- [ ] Payroll details (TH/GT/JP): no "OT Rate Calculation" panel.
- [ ] `grep -r` for the OT identifiers over `src/` returns nothing (§4 sanity check).
- [ ] App builds/typechecks (user runs this).

Behaviour:
- [ ] Process a **July 2026** payroll → OT items use the configured pay‑code/override/
      schedule rates (× OT hours), identical to June behaviour. No blocking
      "OT rate could not be derived" errors.
- [ ] Payslip / salary report / bank totals / payroll journal reconcile as before.

Schema:
- [ ] The 10 columns are dropped in dev; `information_schema.columns` shows none.
- [ ] Prod decision made (§6).

## 11. Decisions (all resolved 2026‑07‑21)

1. **Production:** prod ran the new OT formula live; July 2026 is **not
   finalized** (no payslips/payments/journals). → prod gets the code revert, a
   July reprocess, and the DROP migration (§6.1); **reprocess July to old rates**
   on both environments.
2. **Changelog (§9):** **delete** the two OT entries once done; no "reverted"
   entry.
3. **This handover:** **keep it for now** — do not delete until the revert has
   fully landed (dev + prod). Revisit deletion afterwards.

## 12. Appendix — full inventory (38 OT‑touched paths)

- **Delete (4):** `src/routes/payroll/otFormula.js`,
  `src/components/Payroll/PayrollProcessingErrorsDialog.tsx`,
  `docs/PAYROLL_OT_CALCULATION_BREAKDOWN.md`,
  `docs/PAYROLL_OT_CALCULATION_JULY_2026_HANDOVER.md`.
- **Already gone (1):** `dev/migrations/2026-07-19_payroll_ot_formula_july2026.sql`.
- **Wholesale restore (26):** listed in §4.
- **Surgical (7):** `src/types/types.ts`, the 3 monthly‑log entry pages,
  `src/components/ChangelogModal.tsx`, `CLAUDE.md`, `AGENTS.md` (§5).
- **New DROP migration (1 new file):** §6.
