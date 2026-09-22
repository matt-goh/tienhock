# January 2026 four-account correction — 13 September 2026 KL

> **Latest,22 September2026 KL:** User supplied corrected flour credit notes and a comparison sheet updated19 September. Both flour purchases already match; all eight CoGM values match. The sheet gives January TB14,056,981.54, superseding the prior handwritten targets. After another dev refresh, JP plus the confirmed January four-account correction were applied together and verified in dev; production pending. Older applied/hold/question statuses below are historical. See [latest evidence, remaining differences and combined production paste](CORE_CONFIRMATIONS_2026-09-22.md).


> **Latest status,19 September2026:** User confirmed the January JP707.45 / CR_JP8,952 debit split was intentional. Only JP's June opening has now been corrected to594.10 in dev; production pending. All12 monthly TB/BS checks balance and JP statement/ledger/ageing agree. January-June match the confirmed red totals. Earlier dev four-account application was overwritten by the production refresh; its old SSH script remains on hold. July/August flour questions remain. See [JP split correction](JP_SPLIT_CORRECTION_2026-09-19.md) for the separate new JP-only production paste and verification. Older statuses below are historical.


> **19 September 2026 recheck: HOLD production execution.** Dev has been replaced
> with the latest production copy, so the dev-applied status below is historical.
> The refreshed copy has neither correction journal and is unbalanced by DR8,952
> from June onward. The unchanged migration safely rejects it before inserting
> any journals. JP January is now 707.45 plus CR_JP 8,952, while JP June remains
> 9,546.10; its current May roll-forward is 594.10. January-May already match the
> latest requested red totals; the old correction targets the blue January total.
> Separate July/August flour-journal changes also affect the later red comparisons.
> No accounting changes were committed in this recheck and production was not
> accessed. Evidence: `out/audit-2026-january-four-account-recheck-2026-09-19/RECHECK.md`.
> Follow-up: four rollback-only scenarios verified that either JP allocation can
> balance the reports. JP's earlier auditor allocation is known; confirm only
> whether the later reversion in current data was intentional.
> July credit-note amount/allocation and August's old 70,000 versus current 7,000
> also need source review. A plain BM clarification is saved as `WHATSAPP_BM.txt`
> alongside the recheck. No replacement production script is approved yet.
> The user reaffirmed red monthly targets and the four January account amounts.
> Do not re-ask either; their combined reconciliation remains outstanding.


Status: **applied to dev on 13 September 2026 KL**, verified at 11:24:30 KL;
exact rerun and unchanged-data verification completed at 11:25:55 KL.
New journal IDs are **13211** (January) and **13212** (August offset).
**Production is pending** and has not been queried or changed in this task.

## Confirmed evidence and scope

The user supplied three photographs of an ERP January Trial Balance printed
11 September 2026, with handwritten corrections, and relayed:

> Tolong ubah amount AC_TM ACD_PCB ACW_PCB MBTEL in Trial Balance.

The message separately confirms MBTEL: new program RM2,328.20, legacy RM1,969.90,
difference RM358.30, and the January target of RM14,056,981.54 on both sides.
These account-level instructions supersede the earlier request for the January
breakdown behind that target. Do not ask for the same breakdown again.

| Account | Before January close | Confirmed January close | DR-positive adjustment |
|---|---:|---:|---:|
| AC_TM | CR 619.80 | CR 261.50 | +358.30 |
| ACD_PCB | DR 7,231.60 | DR 1,446.35 | -5,785.25 |
| ACW_PCB | CR 9,114.65 | CR 3,329.40 | +5,785.25 |
| MBTEL | DR 2,328.20 | DR 1,969.90 | -358.30 |

Both TB columns reduce by RM6,143.55, from RM14,063,125.09 to **RM14,056,981.54**.
No other account amount or financial-statement note is authorized for correction
by these photos. Original scan/CSV fixtures remain the historical source, not
retroactively rewritten to this corrected state.

## Source tracing and the existing August correction

The four accounts have only 1 January opening anchors, with amounts AC_TM -408.85,
ACD_PCB +1,446.35, ACW_PCB -7,231.60 and MBTEL zero. No later checkpoint exists.
The migration rejects changed openings or new later checkpoints, which could
otherwise hide a historical correction in later reports.

Original imported `PBE041/01` (13 January, journal 4204) debits the workers' PCB
RM5,785.25 to ACD_PCB. This source error was already corrected by **JV2608-12**
(31 August, journal 12722), DR ACW_PCB / CR ACD_PCB RM5,785.25. Its old correction
was intentionally in the open period. It therefore corrected August onwards,
but not the January TB that the user now explicitly requests to correct.
The separate **JV2608-10** is RM1,446.35 for a 03/2024 amendment and is unrelated.

The telephone amount matches two imported payments already charged to MBTEL:
RM189.75 in `PV009/01` (22 January, journal 4500, line 11910) and RM168.55 in
`PV011/01` (30 January, journal 4711, line 11913). The user-confirmed target is
implemented as DR AC_TM / CR MBTEL RM358.30. The two payment rows are preserved
as provenance; no payment, bank line or original imported amount is edited.

## Implementation

[Migration](../../dev/migrations/2026-09-13_january_tb_four_account_correction.sql)
adds two balanced J-type journals with explicit cross-references:

| New reference | Date | Debit | Credit |
|---|---|---|---|
| JV2601-CORR-0913 | 31 Jan 2026 | ACW_PCB 5,785.25; AC_TM 358.30 | ACD_PCB 5,785.25; MBTEL 358.30 |
| JV2608-PCB-OFFSET-0913 | 31 Aug 2026 | ACD_PCB 5,785.25 | ACW_PCB 5,785.25 |

The August entry offsets **only** the duplicate PCB effect of JV2608-12 once the
January correction is included. This leaves August and later PCB balances
unchanged relative to the before-state. January–July PCB balances receive the
requested correction; telephone expense/accrual corrections carry forward from
January. Both prior August journals, every imported journal, all opening anchors,
stock values and account mappings remain unchanged.

This is an explicit historical data correction based on the user's new evidence.
The ordinary pre-June posting lock remains enabled and no report formula changes.
The migration records execution as `audit-correction-20260913`, not as Helen.
Source-less correction journals retain normal report and ledger visibility.

Guards check the exact four account notes/openings, original PCB and telephone
payment lines, the full two-line content of JV2608-12, the January baseline and
all twelve 2026 TB/BS balances. A partial migration, changed existing correction,
conflicting reference or unexpected opening aborts. An exact rerun inserts nothing.
All existing journal headers/lines are compared before/after inside the transaction.

## Report effects and remaining issues

- January expense Note 5 becomes **RM142,737.59**, down RM358.30.
- January profit becomes **RM110,768.22**, up RM358.30, matching BS Current Year Profit.
- January accrual Note 1 becomes **RM268,547.69**, matching the photographed BS.
- CoGM remains **RM537,223.39**; revenue, cost of sales and assets are unchanged.
- The remaining difference to photographed profit RM142,263.77 is now exactly
  **RM31,495.55**, equal to ARI's opening credit. These corrections do not establish
  whether that prior-year allowance should affect 2026 profit. ARI and CL_AFI stay
  unchanged; do not use this numerical equality as a replacement for adjustment evidence.
- January's confirmed TB target is resolved by these four amounts. February–August
  still need their own account-level reconciliation against the previously supplied
  blue totals; do not declare all months resolved. The carry-forward effects are
  intentional, and August's existing PCB correction is specifically offset.
- September–December checks use currently recorded data, not certified completed
  future-month accounts.

## Verification and backup

Private artifacts: `out/audit-2026-january-four-account-correction/`.

- `before-dev.dump`: 4,268,922 bytes; SHA-256
  `9bda50b253277c8f736ca424956fdf3f6796f74660bbd5c97194db87d2f2d73e`.
  The custom archive's table of contents was read successfully; no restore was performed.
- `before-reports.json`: actual TB, IS, BS and CoGM handlers for all twelve months,
  the existing August correction journals, and protected-table fingerprints.
- `rollback-rehearsal.txt`: the full SQL reaches all target amounts and then rolls back.
- `rehearsal-verification.json`: actual handlers agree with every expected account
  delta, all TB/BS balance, and CoGM/revenue/cost-of-sales/assets are unchanged.
  Changed-August-correction and partial-marker cases were both rejected and rolled back.
- Rehearsals may consume sequence values even when rolled back; journal ID gaps
  are expected and do not indicate duplicate postings.
- `dev-apply.txt`: two headers/six lines added, four targets and twelve report
  controls verified, final COMMIT. `dev-rerun.txt` confirms `already applied: t`.
- `after-reports.json`, `rerun-reports.json`, `verification.json`: all actual
  report account deltas match; rerun changes nothing; original August journals
  and fingerprints of accounts/openings/notes/stock/import staging are unchanged.
- Applied migration SHA-256:
  `23a27a1d82b7911efaae31a53f39565185213c5d86fc802b5751ffb95f357d30`.

The live after-state against the previously confirmed handwritten targets is:

| Month | Corrected dev TB, each side | Prior handwritten target | Dev minus target |
|---|---:|---:|---:|
| January | 14,056,981.54 | 14,056,981.54 | 0.00 |
| February | 14,583,354.01 | 14,585,854.01 | -2,500.00 |
| March | 15,205,209.41 | 15,207,287.16 | -2,077.75 |
| April | 15,890,165.23 | 15,892,242.98 | -2,077.75 |
| May | 16,387,302.53 | 16,389,380.28 | -2,077.75 |
| June | 17,079,745.87 | 17,081,923.62 | -2,177.75 |
| July | 17,891,462.74 | 17,893,540.49 | -2,077.75 |
| August | 18,207,140.51 | 18,249,376.39 | -42,235.88 |

These are a new live snapshot, not rewritten historical fixtures. Each later
month still needs its own account breakdown/adjustment reconciliation. In
particular, the August PCB balances were already corrected before this task;
their net change in this task is zero.

No build, lint or TypeScript check was run. This is a data migration, not an app change.

## Production application

Use a fresh production backup under the existing admin procedure. Preserve its
filename/hash. The local dev dump above is not a production backup. Run the reviewed
file with an authorized database role; ordinary runtime permissions are unchanged:

```sh
psql -X -v ON_ERROR_STOP=1 -d tienhock_prod -f dev/migrations/2026-09-13_january_tb_four_account_correction.sql
```

The file is one transaction. An error must be investigated; do not remove a guard
or run selected inserts. A successful run prints the four January balances,
twelve balanced monthly controls, both new journal references and final COMMIT.
An unchanged rerun reports `already applied: t` and inserts no further rows.
After production execution, verify January TB RM14,056,981.54, the four signed
account amounts above, January profit RM110,768.22 and the unchanged August PCB
balances. Record the production result before marking production complete.
