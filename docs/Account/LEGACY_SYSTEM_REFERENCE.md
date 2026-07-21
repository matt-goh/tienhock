# Legacy Accounting System — Reference

Reference notes on the 20-year-old legacy accounting system Tien Hock is replacing, distilled from the user's scans of the legacy chart of accounts, opening balance sheet, trial balance, CoGM, P&L and Balance Sheet (May 2026). Formerly `ACCOUNTING_AUDIT_HANDOVER.md` — the handover *task* it carried is finished (its output is [ACCOUNTING_GAP_ANALYSIS.md](ACCOUNTING_GAP_ANALYSIS.md)); what remains here is the legacy-system detail that has no other source. Current-state of the *new* system: see [ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md).

See also [LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md](LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md) — the user's own walk-through of every legacy trial-balance code prefix.

---

## Account code structure (legacy)

Every code is a **prefix-based mnemonic**. The legacy system had no relational database, so subledger detail (per supplier, per customer, per vehicle, per HP contract) was encoded as GL codes — ~2,754 codes rolling up to ~25 statement lines via the **APPX** column (= the new ERP's `account_codes.fs_note`).

| Prefix | Meaning | FS Note |
|--------|---------|---------|
| `CR_*` | Trade creditor (one code per supplier — CR_LD, CR_NS, CR_LYF, CR_JM, ~80 suppliers) | 13 |
| `CL_TP` | Trade Payables (target consolidation for all `CR_*`) | 13 |
| `CL_NON` | Non-trade payables (CL_GT, CL_GF, CL_JP = inter-company; OC_* = other creditors) | 8 / 10 |
| `CL_GTH`, `CL_WSF` | Amount Due to Director (Goh Thai Ho, Wong Shuk Fun) | 9 |
| `CL_LOAN` → `CL_PB13`, `CL_PB16`, `CL_SCB` | Term loans | 11 |
| `CL_HPA` → `HPA_6893`, `HPA_PILL`, `HPA_SWJ988` etc. | Hire purchase principal | 16 |
| `CL_HPB` → `HPB_6893` etc. (mirrors HPA) | HP interest in suspense | 23 in the legacy APPX; approved ERP presentation is Balance Sheet Note 16 |
| `ACC` → `ACW_EPF`, `ACW_SC`, `ACW_SAL`, `ACW_PCB`, `ACW_SIP`, `AC_TAX`, `AC_SESB`, `AC_TM`, `AC_LEVY`, `AC_INS` | Accruals | 1 |
| `ACD_*` | Director-specific accruals | 1 |
| `NCA_*` → `NCA_FB`, `NCA_MV`, `NCA_PM`, `NCA_OE`, `NCA_FF`, `NCA_PL`, `NCA_RV`, `NCA_CW` | Property, Plant & Equipment | 4 |
| `AD_*` → `AD_FB`, `AD_MV`, `AD_PM`, `AD_OE`, `AD_FF`, `AD_PL`, `AD_RV` | Accumulated depreciation (contra-asset, mirrors NCA) | 4 |
| `CA_*` | Current asset subledger codes (TR=Trade Receivables, CFH=Cash debtors, WA=Workers Advance, prepayments, deposits, inter-co receivables, FD, etc.) | 6 / 8 / 19 / 22 |
| `OS_*` (one per product/material) | Opening Stock | 3-1 / 3-3 / 3-7 |
| `CS_*` (one per product/material) | Closing Stock | 14-1 / 14-2 / 14-3 |
| `PU_*` | Purchase of raw material/ingredient | 3-5 |
| `PU_CHEM`, `PU_MBCHEM` | Purchase of chemical (Maritime & Industrial Engineers) | 3-4 |
| `PM` / `PM_*` | Packing material purchases | 3-2 |
| `BFT_*` (KOW, LS) | Freight In on raw materials (Kowas Transport, Leasing Logistic) | 3-6 |
| `MB*` (MBADV, MBBC, MBC, MBDON, MBEW, MBOR, MBPS, MBRM…) | Admin expense by nature (~40 codes) | 5 |
| `MBS_O`, `MBS_M`, `MBE_*`, `MBSC_*`, `MBSIP_*`, `MBDR*` (and `MS_*`, `BS_*`) | Salaries / EPF / SOCSO / SIP per location | 5 / 5-1 |
| `BT*`, `OIL*`, `R*`, `SV*`, `TAX*`, `TY*`, `INS*`, `PT*` (each with per-vehicle suffix e.g. `BT6304`, `INS6323`) | Vehicle running expenses (battery, diesel, repair, service, road tax, tyre, insurance, patching) — all rolled up into `VRE` (Vehicle Running Expenses) in Schedule B | 5 |
| `CASH_SALES`, `CR_SALES`, `SLS*` | Revenue | 7 |
| `IN_OTH`, `IN_PSU`, `IN_AI`, `IN_PPE` | Other income / gain on disposal | 18-1 / 18-2 |
| `SC` | Share Capital | 21 |
| `RP`, `RP_MTH` | Retained Profit | 20 |
| `DEBTOR` | Total Trade Receivables (control account) | 22 |

## Legacy reports (formats in hand from the user's uploads)

- **Trial Balance** (`TRIAL BALANCE FOR THE MONTH OF 12/2024`) — columns: ACC/CODE, PARTICULAR, **APPX** (= `fs_note`), DEBIT, CREDIT. Totals balance: 20,806,612.63 DR = 20,806,612.63 CR.
- **Cost of Goods Manufactured** — matches the new ERP's CoGM page structure exactly.
- **Detail Income Statement** — Revenue (7) → Cost of Sales (3-1 + CGM − 14-1) = Gross Profit → + Other Operating Income (18-1, 18-2) → − Admin Expenses (Note 5 + Note 15) → Profit from Ops → − Finance Costs (Note 23) → Profit Before Tax → − Tax (Note 3) = Profit for FY.
- **Balance Sheet** — Non-Current Asset (Note 4) + Current Assets (14-1, 14-2, 14-3, 22, 8, 17, 6, 19) − Current Liabilities (13, 1, 10, 9, 16, 11, 12) = Net Assets; Financed By: SC (21) + Retained Profit B/F (20) + Profit for FY.
- **Schedule A — CoGM with prior-year comparison column.**
- **Schedule B — Administrative Expenses (with prior-year comparison)** — itemized rollup of all `MB*` and vehicle codes into named line items: Advertisement, Auditors' Remuneration, Bank Charges, Cleaning, Depreciation, Directors' EPF/Salary/SOCSO, Donations, Electricity & Water, EPF, Entertainment, Hiring of Plant, Insurance, Inspection Fee, Legal & Professional, Levy, License, Medical, Newspaper, Office Refreshment, Penalty, Postage & Telephone, Printing & Stationery, PPE Written Off, Quit Rent, Repair & Maintenance, Secretarial, SOCSO, Staff Uniform, Subscription, Sundry, Staff Messing, Staff Training, Travelling, Transportation, Upkeep of Factory, Upkeep of Machinery, **Vehicle Running Expenses (VRE = Σ BT* + INS* + OIL* + R* + SV* + TAX* + TY* + PT*)**, Work Pass, Safety & Health.
- **Opening Balance as at 1 Sep 2012** — the migration-day setup sheet. Every account listed with DR or CR balance.
- **PBB Bank running ledger** — columns: DATE, JOURNAL, PARTICULARS, CHEQUE, DEBIT, CREDIT, BALANCE (DR/CR). Journal types seen: `RV###/MM` (cash sales receipt), `TRddmmYY` (cheque receipt from debtor), `PBE###/MM` (bulk supplier payment via single cheque), `JV##/MM/##` (manual journal e.g. bank charges), `MIB######`/`PBB######`/`PIB######` (cheque receipts named by drawer's bank), and AMOUNT DUE TO DIRECTOR entries. *(Reproduced by the new Bank Statement report; the May 2026 legacy + real-bank PDFs are the tie-out reference.)*
- **Not found among the uploads** — the new build has no legacy template to copy for: supplier statement, director ledger, HP amortization schedule, fixed asset register, bank reconciliation worksheet.

## Key insights

1. **The "APPX" column = `fs_note`** — the bridge between ~2,754 leaf codes and ~25 statement lines is the same `fs_note` column the new ERP already has. No new bridge needed.
2. **Schedule B is the missing audit-readiness piece.** The new Income Statement shows Note 5 as one number; the legacy breaks it into ~40 line items by expense nature.
3. **VRE rollup is non-trivial.** ~120 per-vehicle codes collapse into one "Vehicle Running Expenses" number in Schedule B. The new system consolidates these codes; the historical rollup pattern is preserved here for reference.
4. **HPA/HPB are paired.** Every hire-purchase contract has a principal account
   (`HPA_*`) and an interest-in-suspense account (`HPB_*`). Monthly entry: DR
   `HPA_*` + DR `HPI` (released interest expense, Note 23) + CR Bank, and CR
   `HPB_*` (reduces the Balance Sheet suspense paired with the payable). The
   ERP therefore presents both `HPA_*` and `HPB_*` in Note 16 while `HPI`
   remains Note 23. A full amortization schedule is still missing (gap 1A-6 /
   Type-2 #6).
5. **The PBB bank running ledger is just a specialised "Account Ledger".** The same view shape works for any account code — supplier, director (`CL_WSF`), prepayment (`CA_INS`), inter-company (`CL_GT`). One generic Account Ledger page solves many missing-report items at once (gap 1B-2).

## Open classification questions (resolved 21 Jul 2026)

1. **`THJ_CK` 2,013.60 / `THJ_SM` 1,919.25** (trial balance, Note 5-1) — Tien Hock paying salaries on behalf of Jelly Polly (inter-company recharge)? If yes, should sit under `CA_MBHJ` (receivable from Jelly Polly), not Note 5-1.
2. **`NT_7484` 70,201.00** (Note 5) — handwriting links this to QR-281 (Quit Rent NT213077484). Confirm it's a quit-rent prepayment mis-classified under Note 5, should be Note 8.
3. **`CL_GT` 59,420.50 DR / `CL_GF` 25,696.82 DR** — debit balances parked on the liability side; actually *receivables from* Green Target / Green Family. Keep the legacy convention or split into receivable/payable?
4. **`BTRA` Transportation 10,731.89** — delivery-out cost (admin, Note 5) vs `BFT_KOW`/`BFT_LS` freight-in on raw materials (CoGM, Note 3-6)?

These are trial-balance *classification* fixes, independent of the feature roadmap — best resolved when the Schedule B / account-ledger work is specced.

**Resolved 21 Jul 2026** by the hash-validated Jan–May 2026 Trial Balance scans: **1** — `THJ_CK`/`THJ_SM` print APPX 5-1 (factory salaries; the inter-company recharge hypothesis rejected). **2** — `NT_7484` prints APPX 5 with a zero balance in all five scanned months (stays Note 5; no Note 8 reclass). **3** — `CL_GT` DR 12,415.60 / `CL_GF` DR 31,696.82 print APPX 8 (legacy convention kept; the V2 migration applied the fs_note move). **4** — `BTRA` prints APPX 5 (administrative transportation, not CoGM freight-in). Evidence: [LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md](LEGACY_TRIAL_BALANCE_CODE_ANALYSIS.md) addenda; regression-pinned by `dev/import/legacy-report-fixtures/verify-legacy-reports.mjs`.

---

*Source scans: `core_tienhock_acc_docs.pdf` (103-page trial balance), `Account-code-documents.pdf` (69-page chart of accounts), `Balance-sheet.pdf`, `Balance-sheet-information.pdf`, plus photos of the legacy reports. Doc renamed & trimmed from ACCOUNTING_AUDIT_HANDOVER.md on 2 Jul 2026.*
