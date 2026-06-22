# May 2026 Bank Report discrepancy — handover

## Goal

Find why the May 2026 Bank Report PDF differs from the legacy system after the production DB was imported locally. Do not directly edit payroll data until the reprocess path is verified.

Legacy-confirmed Bank amounts:

| Staff | Legacy | Current prod report | Gap |
|---|---:|---:|---:|
| JIRIM ILUT | 864.85 | 835.85 | 29.00 |
| MOHAMMAD AZLIM BIN SHAFIE | 737.00 | 733.00 | 4.00 |
| NISON BIN KOMONG | 2231.20 | 2215.20 | 16.00 |
| RAMBU YUNI LAPU | 3553.30 | 3526.30 | 27.00 |
| Grand total | 105435.30 | 105359.30 | 76.00 |

## Confirmed JIRIM facts

- Prod payroll row is `employee_payrolls.id = 290`, owned by sibling ID `JIRIM_PB`, with `gross_pay=1760.05`, `net_pay=1551.80`, `setelah_digenapkan=1052.00`.
- The grouped staff name has two May mid-month advances: `JIRIM=300.00` and `JIRIM_PB=200.00` (total 500.00), and JIRIM has monthly Pinjam `79.25 + 136.90 = 216.15`.
- Thus the current Bank result is exactly `1052.00 - 216.15 = 835.85`.
- Before the prod import, the dev payroll row was owned by `JIRIM`, with `gross_pay=1954.05`, `net_pay=1580.40`, `setelah_digenapkan=1081.00`; its Bank result was `1081.00 - 216.15 = 864.85`.

### Why the JIRIM gross should be 1954.05 under the current source records

Independent SQL reconstruction from the imported prod source records:

```
consolidated work items  1369.25
approved leave by name    390.80  (5 x 78.16; all rows are owned by JIRIM)
commission by name        144.00
Others by name             50.00
-------------------------------
expected gross            1954.05
```

The stored prod gross is RM194 lower (`1760.05`). This is the direct source of the RM29 Bank gap after deductions/rounding. Current `recalculateAndUpdatePayroll` in `src/routes/payroll/employee-payrolls.js` queries leave and commission by staff name, so it appears intended to produce the dev/legacy numbers.

## Important failed reprocess observation

The user clicked Re-process after the prod import. `monthly_payrolls.updated_at` changed to `2026-06-22 10:16:24`, so `POST /api/monthly-payrolls/44/process-all` was reached. But payroll row 290 still contains the old values above. Therefore inspect:

1. Browser Network response for `process-all`: `processed_count`, `errors`, and selected employee/job combinations.
2. Server logs for processing errors that may not reach the UI.
3. Which `primaryEmployee` is constructed inside `src/routes/payroll/monthly-payrolls.js` and whether JIRIM + JIRIM_PB are both selected/grouped.
4. Whether the native API server has reloaded the latest `employee-payrolls.js` route (the explicit recalculation call below may otherwise be 404/stale).

## Changes made in this working tree

These are uncommitted and not yet verified end-to-end:

- Added `POST /api/employee-payrolls/:id/recalculate` in `src/routes/payroll/employee-payrolls.js`. It calls `recalculateAndUpdatePayroll` then returns the persisted values.
- Changed Payroll Details Re-process to call this endpoint after `process-all`, and only show success after it returns.
- Added its API helper/type in `src/utils/payroll/payrollUtils.ts`.
- Added a changelog entry.

If the direct recalculation endpoint is reached for row 290, validate whether it returns/persists `gross=1954.05`, `net=1580.40`, `setelah_digenapkan=1081.00`. Do not assume it did just because the UI displayed a success toast.

## Other staff

AZLIM, NISON, and RAMBU have the same stored gross/source totals in the pre-import dev baseline and imported prod data. Their remaining legacy gaps are not explained by JIRIM's sibling/leave issue:

- AZLIM: stored rounded=733.00, no May monthly Pinjam; legacy says 737.00.
- NISON: stored rounded=2305.00, monthly Pinjam=89.80; Bank=2215.20; legacy says 2231.20.
- RAMBU: stored rounded=3545.00, monthly Pinjam=18.70; Bank=3526.30; legacy says 3553.30.

After JIRIM's reprocess path is proven, compare these against the legacy Payroll Details/payslip inputs, not only the Bank PDF. The PDF only prints `bank_data.total` supplied by `src/routes/payroll/salary-report.js`.

