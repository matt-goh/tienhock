# Green Target Accounting — Build-Out & Legacy Jan–Jun 2026 Import (Handover Plan)

**Created 25 Jul 2026. Status: PHASES G0–G8 COMPLETE — LIVE IN PRODUCTION since 28 Jul 2026 (G4 and G5 on 27 Jul
2026, G6 and G7 on 28 Jul 2026, G8 production rollout 28 Jul night — record in §10f) —
see the execution records in §9. Source intake and the staging pipeline exist and pass every gate; all
66 scan pages are transcribed and validated; the `greentarget` accounting tables, the 34-note GT
catalogue and the 503-account chart of accounts are all loaded; **the Jan–Jun 2026 legacy ledger is
imported as 1,705 posted journals / 4,401 lines with 501 opening anchors that balance to exactly 0.00**;
and **the report engines now reproduce all six printed Trial Balances, the printed Income Statement and
the printed Balance Sheet exactly, with the ledger reproducing the printed row order for all 2,968
printed rows.** All seven open questions in §4 were answered on 25 Jul 2026, and the two G0 raised were
resolved by evidence during G1. G3 settled the `BTFS` disposition and the APPX-vs-statement-note
mapping (`fs_note` holds the printed APPX verbatim — see §9, G3). G4 settled the derived CD_SD cash
leg (user-approved), the four `(ref, date)` collisions, and `posting_sequence`. G5 settled the
backend-clone question and produced the §3d operational bridge
([GT_OPERATIONAL_BRIDGE.md](GT_OPERATIONAL_BRIDGE.md)). G6 shipped the frontend: the GT Accounting
nav section (Journal Entries, Account Ledger, Trial Balance, Income Statement, Balance Sheet, Chart
of Accounts) runs the shared TH pages over GT route clones, and the GT Debtors report is re-pointed
at the imported ledger (June 2026 total RM156,782.22). G7 enabled journal maintenance, and the
28 Jul follow-up enabled Chart of Accounts create/edit maintenance while keeping codes immutable
and providing no delete workflow. **G7 shipped organic posting: GT
invoices, payments and adjustments dated on/after 2026-07-01 now own balanced journals in the
`greentarget` schema, manual journals are keyed from the shared Journal pages, and the R8 posting
lock rejects every pre-July GT mutation with 409. The bridge §5 process decision was made: enter
everything in the ERP.** The one outstanding input across the whole project is still the user
approval of `debtor-map.json` (both mappings stay unapproved; every organic receivable falls back to
`CD_SD` until then). ⚠ **The dev database was then replaced with production data,
which removed every GT accounting row G2/G3/G4 created — see §10 for what survives and how to rebuild
it** (the rebuild has since been done; all 230 gates are green). This
document is the entry point for the Green Target (GT) accounting project. It is
written for a fresh session that has not seen the Tien Hock (TH) work, and it front-loads the
findings that were already measured on 25 Jul 2026 so nobody re-derives them.

**Goal:** give Green Target Waste Treatment Sdn Bhd (712282-M) a real general ledger — chart of
accounts, journals, ledgers, Trial Balance, Income Statement, Balance Sheet, debtor parity — seeded
by importing the legacy system's **January–June 2026** ledger exports as posted journals, and then
posting organically from **1 July 2026** onward. This mirrors what was already delivered for Tien
Hock, whose four reference documents are:

- [LEGACY_JAN_MAY_IMPORT_PLAN.md](LEGACY_JAN_MAY_IMPORT_PLAN.md) — the ledger import (read §1–§3, §6, §7)
- [LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md](LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md) — ledger vs operational-invoice bridge
- [LEGACY_REPORT_VERIFICATION_PLAN.md](LEGACY_REPORT_VERIFICATION_PLAN.md) — scans → fixtures → automated harness (read §4, §5)
- [LEGACY_REPORT_RECONCILIATION.md](LEGACY_REPORT_RECONCILIATION.md) — the sign-off evidence format

## Core principle — isolated data, shared mechanics

**Green Target's accounting data is completely isolated from Tien Hock's.** GT has its own chart of
accounts, its own journals, its own openings, its own notes, its own debtors. No GT row lives in a
`public` accounting table, no GT amount ever reaches a TH report, and no TH decision (including the
still-unrolled-out TH V2/V3 report work) can move a GT number.

**How the data is handled, and the frontend that shows it, are deliberately the same.** Same
double-entry model, same anchor-based opening semantics, same `fs_note` → statement bridge, same
import/staging/provenance discipline, same React pages driven by config. Copy the mechanics; never
share the data.

---

## 0. How to use this document

0. **⚠ Read §10 first if you are picking this up after 27 Jul 2026.** The development database was
   replaced with a copy of production immediately after G5, which removed every GT accounting row
   that G2/G3/G4 created. Nothing is lost — it all rebuilds from tracked, hash-pinned sources — but
   two G4 migrations and a generator hardcode the *development* Tien Hock baseline and will abort
   until they are re-baselined. §10 has the blockers and the rebuild runbook.
1. **Read §3 before touching any source file.** It contains a date-encoding rule that will silently
   corrupt every imported date if you get it wrong, and it is *different* from the Tien Hock rule.
2. **Ask, do not guess.** The scans are photographs of dot-matrix printouts and the Excel exports are
   machine-mangled. If a page will not render, a figure is illegible, a column is ambiguous, an
   account code cannot be resolved, or the legacy semantics of a journal family are unclear —
   **stop and ask the user.** They have the physical documents and answer quickly. A named question
   costs one message; a wrong inference costs a whole phase and can silently poison the books. This
   is the house rule that made the TH import work.
3. **Never invent a balancing figure.** If something does not reconcile, name it as a limitation with
   its exact amount and evidence pointer, exactly as the TH documents do.
4. **Do not re-read the raw legacy files to "get oriented."** §2 and §3 already record their shape,
   volumes, and quirks. Open them only when the phase you are executing actually needs their content.
5. Update this file with a per-phase execution record (files changed + verification results) as
   phases complete — same convention as the TH documents.

---

## 1. Where Green Target stands today

| Area | State |
|---|---|
| GL / journals / chart of accounts | **None.** GT has zero accounting tables, zero journals, zero account codes. |
| Accounting pages | **One:** `/greentarget/debtors` — [src/pages/GreenTarget/DebtorsReportPage.tsx](../../src/pages/GreenTarget/DebtorsReportPage.tsx) is a thin config wrapper around the shared [src/pages/Accounting/DebtorsReportPage.tsx](../../src/pages/Accounting/DebtorsReportPage.tsx), pointed at `/greentarget/api/payments/debtors`. It reads the **operational invoice/payment subledger**, not a ledger. |
| Operational data | `greentarget.invoices` (153 rows total, **37 issued Jan–Jun 2026**, 2 from Jul), `greentarget.payments` (**15 in Jan–Jun 2026**), `greentarget.rentals` (157), `greentarget.customers` (47), `greentarget.adjustment_documents` (0 rows; table exists). |
| Schema | 32 tables in the `greentarget` schema — all operational/payroll. `greentarget.invoices` has **no** `journal_entry_id`; `greentarget.payments` has no `journal_entry_id` and no `bank_account`. |
| Ledger participation | GT is explicitly **outside** the shared TH ledger (`CLAUDE.md`: "GT is outside the shared ledger"). GT adjustment documents deliberately post no journal. |

TH's accounting surface, which GT must reach a subset of: [src/pages/Accounting/](../../src/pages/Accounting/)
(account codes, journal entries + details, bank-in, voucher generator, location mappings, purchases)
and [src/pages/Accounting/Reports/](../../src/pages/Accounting/Reports/) (Account Ledger, Trial
Balance, Income Statement, Balance Sheet, CoGM). Backend: [src/routes/accounting/](../../src/routes/accounting/)
(~18.5k lines across 24 files).

---

## 2. Source evidence inventory (measured 25 Jul 2026)

Everything below was measured directly; treat it as established fact.

Current location: `GT_Account_Legacy_Data/` at the repository root. **This is untracked but NOT
gitignored, and it contains customer data.** Moving and ignoring it is step 1 of Phase G0.

### 2a. The two ledger exports (raw `.xlsx` — TH's were the same workbooks, handed over already parsed to CSV)

| File | Bytes | Sheet dimension | Sections (accounts) | `BALANCE C/FWD` rows | Dated rows | Journal families |
|---|---:|---|---:|---:|---:|---|
| `EXCEL GTLD (JAN-JUNE 2026).xlsx` | 237,078 | `A1:H5158` | 474 | 474 | 3,259 | `#/#` 1,015 · `PB#/#` 789 · `RV#/#/#` 472 · `PBEB#/#` 223 · `JBSL/#/#` 130 · `I#/#` 100 · `JWDR/#/#` 43 · `JV#/#/#` 11 · `PBE#/#` 2 |
| `EXCEL GTDB (JAN-JUNE 2026).xlsx` | 23,335 | `A1:H326` | 28 | 28 | 211 | `RV#/#/#` 94 · `I#/#` 89 |

- GTLD = general ledger (the analogue of THLD). GTDB = trade-debtor ledger (analogue of THDB).
- **Column layout is identical to TH**: `A row_index, B ACC/NO (or date), C JOURNAL, D PARTICULAR,
  E CHEQUE, F DR, G CR, H BALANCE`. Same section anatomy: header row (`code`,,`description`), blank,
  `BALANCE C/FWD` with a `DR`/`CR`-suffixed running balance, transaction rows, blank rows.
- Scale: roughly **2,785 GL + 183 debtor transaction rows** (dated rows minus C/FWD rows). This is
  **~4× smaller than the TH import** (which had 10,068 lines). GT is a genuinely small ledger.
- The 28 GT debtors are: `AE ENTERPRISE, ALPS, BAJA-STONE, BAKTI, BW, BWL, CD, CD2014, CD2015,
  CD_SD, CHARM, GREAT, INNOSURIA, ITCC, JAARI, KBOX, KEN, LEE DECOR, MARCOCO, NURI, PAN, PAUMIN,
  RUMAH MERAH, SABARINA, SOGORAYA, SUN TARGET, SUTERA, TH`. Note **`TH` — Tien Hock is a Green
  Target debtor** (intercompany; see §4 open question 4).

### 2b. The nine scanned reports (`.pdf`)

All nine are **pure image scans** — zero embedded fonts, JPEG page images. They must be rendered and
transcribed by eye; there is no text layer to extract. The existing renderer works on them unchanged
(proven on `GT_BALANCE_SHEET.pdf` during planning):

```bash
node dev/import/legacy-report-fixtures/render-pdf.mjs <pdf> <outPrefix> all 2
```

| File | Pages | Content |
|---|---:|---|
| `GT_TRIAL_BALANCE_JAN26.pdf` … `JUN26.pdf` (6 files) | 11 each = 66 | Monthly Trial Balances, Jan–Jun 2026 |
| `GT_ACCOUNTCODE.pdf` | 24 | ~~Chart of accounts — high value~~ **SUPERSEDED, see §9 (G1).** It is a 2010-vintage GL master with no note column. The six Trial Balances carry the full 2026 chart with descriptions *and* note numbers. **Do not transcribe.** |
| `GT_INCOME_STATEMENT.pdf` | 2 | Detail Income Statement — ~~06/2026 only~~ **year-to-date Jan–Jun 2026, proven arithmetically in §9 (G1)**, despite the printed "FOR THE MONTH OF 06/2026" header |
| `GT_BALANCE_SHEET.pdf` | 1 | Balance Sheet for **06/2026** |

**Total transcription surface: 66 pages** (was estimated at 93 before `GT_ACCOUNTCODE.pdf` was
dropped and the two statements were transcribed during the G1 scaffolding pass).

### 2c. The June 2026 Balance Sheet (read during planning — use as the headline gate)

Report header: `GREEN TARGET WASTE TREATMENT SDN BHD (712282-M) — BALANCE SHEET FOR THE MONTH OF 06/2026`.
Same printed format and same APPX note-number system as TH.

| Line | Note | Amount |
|---|---|---:|
| Property, plant and equipment | 4 | 18,129.00 |
| Trade receivable | 22 | **156,782.22** |
| Non-trade receivables, deposit & prepayments | 8 | .00 |
| Amount due to directors | 9 | 138,812.10 |
| Tax recoverable | 25 | 24,139.50 |
| Input tax | 17 | ( .00) |
| Cash in hand | 6 | .00 |
| Cash at bank | 19 | 28,468.37 |
| *Current assets total* | | 348,202.19 |
| Trade payable | 13 | ( 5,621.20) |
| Accruals | 1 | .00 |
| Other creditors | 10 | 91,566.25 |
| Hire purchase payable | 16 | .00 |
| Term loans | 11 | .00 |
| *Less: current liabilities* | | ( 85,945.05) |
| Net current assets | | 262,257.14 |
| **Net assets** | | **280,386.14** |
| Share capital | 21 | 100,000.00 |
| Retained profit — B/F | 20 | 226,944.53 |
| Profit for the financial year | DN | 16,369.61 |
| | | 343,314.14 |
| Deferred tax liabilities (long-term) | 12 | ( 62,928.00) |
| **Financed by** | | **280,386.14** |

Every subtotal recomputes and the statement balances. **There are no inventory lines at all** — GT is
a service company, so there is **no CoGM report, no opening/closing stock, and none of the TH V2/V3
stock machinery applies.** That removes the single largest source of complexity from the TH project.

---

## 3. Critical findings — established, do not re-derive

### 3a. ⚠ The date encoding rule (THE most important thing in this document)

**The legacy system's behaviour is identical for both companies — only the artifact we were handed
differs.** Tien Hock's raw export was the same kind of Excel workbook as Green Target's; what reached
`dev/import/legacy-jan-may/data/` was a CSV *already parsed out of it*, which flattened Excel's
US-date mangling into the two-format `DD/MM/YYYY` vs `MM-DD-YY` display-text rule described in the TH
plan §1b. **Green Target's files are the raw `.xlsx`, so the same mangling is still held as cell
types.** Same underlying corruption, one layer earlier — so the recovery rule looks different even
though the legacy source is the same:

Column B (`ACC/NO` / date) on transaction rows contains **two distinct cell kinds**:

| Cell kind | What it means | How to read it |
|---|---|---|
| **Numeric**, style `s=2` (`numFmtId="14"`, i.e. `mm-dd-yy`) — GTLD 1,464 cells, GTDB 106 cells | The original text was `DD/MM/YYYY` with **day ≤ 12**, so Excel *could* parse it US-style and silently swapped day and month before storing a serial. | Convert the serial to a date (1900 system, `date1904` is absent), then **swap month and day back**. The serial's month component is the true **day**; the serial's day component is the true **month**. |
| **Shared string** — GTLD 1,795 cells, GTDB 105 cells | The original text had **day > 12**, so Excel could not read it as a US date and left it as literal text. | Parse literally as `DD/MM/YYYY`. |

Worked proof (GTDB rows 10–13, customer `ALPS`, verified by the running-balance chain and by the
journal references themselves):

| Cell | Serial | Renders as | True date | Cross-check |
|---|---:|---|---|---|
| B10 | 46023 | 01-01-26 | **1 Jan 2026** | `BALANCE C/FWD` opening 180.00 DR |
| B11 | 46205 | 07-02-26 | **7 Feb 2026** | journal `RV26/02/24` → RV #24 of month **02** ✓ |
| B12 | 46058 | 02-05-26 | **2 May 2026** | invoice `I2026/0057` ✓, chain 0.00 → 180.00 DR |
| B13 | 46208 | 07-05-26 | **7 May 2026** | journal `RV26/05/16` → RV #16 of month **05** ✓, chain → .00 DR |

After swapping, that account's rows are date-monotonic (1 Jan → 7 Feb → 2 May → 7 May) and the
running balance walks perfectly. Without swapping, they read Jan 1 → Jul 2 → Feb 5 → Jul 5, which is
neither monotonic nor inside the export period.

**Hard invariants your parser must assert (they are the reason this rule is safe):**

1. Every numeric date cell must have **both** components ≤ 12 (raw serial max observed: GTLD 46362 =
   "12-06-26" → 12 Jun 2026; GTDB 46359 = "12-03-26" → 12 Mar 2026). A numeric cell whose serial-day
   component is > 12 would be unswappable — abort and ask.
2. Every string date cell must have a **day component > 12** (samples: `24/03/2026`, `31/03/2026`,
   `15/04/2026`, `16/01/2026`, `19/02/2026`, `30/06/2026`). A string with day ≤ 12 means Excel's
   behaviour was not uniform — abort and ask.
3. **After conversion, every date must fall in 2026-01-01 … 2026-06-30.** Raw serials range up to
   2026-12-06; post-swap they must all land inside the period. This single gate catches any
   mis-application of the rule loudly.
4. Per account, dates must be non-decreasing, and the DR/CR/BALANCE chain must walk from `BALANCE
   C/FWD` to the printed close for every active account (TH proved 423/423; GT must prove all of its
   ~502 sections or name the exact malformed rows, as TH did for `MBRM` and `ROTH`).

**Consequence for tooling:** do not open these files in Excel and re-save, and do not convert them
with a naive `xlsx`-library `cellDates: true` read — that yields the swapped date. Do **not** "fix" it
by first exporting to CSV either: that reproduces the TH artifact and its harder-to-verify text rule.
Parse the sheet XML (or use a library in raw-value mode) and apply the rule explicitly. A ~40-line
reader over `xl/worksheets/sheet1.xml` + `xl/sharedStrings.xml` is sufficient; one was used to
establish all the figures in §2a and can be rebuilt in minutes.

### 3b. GT's chart of accounts collides with TH's — the schema decision is forced

Of the **474 GT GL account codes, 69 already exist in `public.account_codes` with different meanings**
— including `CR_SALES`, `CH_REV2`, `CL_TAX`, `CL_WSF`, `CA_LC`, `AC_DR`, `AC_GST`, `FD_PBB`, and a
family of `BT*`/`CR_*` codes. GT cannot share `public.account_codes` (its `code` is unique).

### 3c. The APPX note catalogue is seeded from TH's, but must be its own copy

GT gets its **own** `greentarget.financial_statement_notes` (isolation principle). Seed it from the
TH catalogue, which is a good starting point — all 15 note codes on GT's Balance Sheet already exist
in `public.financial_statement_notes` and match semantically — then apply these GT differences:

- Note **`25` (Tax Recoverable) does not exist** in the TH catalogue and must be created for GT.
- Note **`9`** is `liability` / "Amount Due to Director" in TH, but GT prints it inside **current
  assets** (138,812.10 debit). A single shared row could not carry both placements — another reason
  the catalogue is cloned rather than shared.
- GT's Balance Sheet has a **`LONG-TERM LIABILITIES` block** (deferred tax, note 12) that the TH
  layout does not render.
- GT uses **no** stock notes (`3-*`, `14-*`) at all — drop them from the GT copy rather than
  carrying dead rows.

### 3d. GT's operational registry is far sparser than its ledger — by design, not by accident

TH's ERP had near-parity with its legacy ledger (2,163 ERP invoices vs 2,121 legacy sales rows). GT
does not: **37 ERP invoices Jan–Jun 2026 versus ~89 legacy `I####/####` debtor rows, and 15 ERP
payments versus ~94 legacy `RV` rows.**

**The user confirmed the cause on 25 Jul 2026: the GT ERP was only ever used to submit e-Invoices.
Non-e-Invoice sales were never entered at all.** So the ERP registry is a deliberate subset, not
corrupt data. Consequences, which are settled:

- There is **no TH-style invoice-level reconciliation phase.** Do not attempt to force parity, and
  never fabricate ERP invoices to match legacy rows. The deliverable is a short named bridge
  (how many legacy documents have an ERP counterpart, how many do not, and why) — nothing more.
- The imported legacy ledger is the **only** complete record of Jan–Jun 2026 GT trading.
- See the operational risk in §7 about what must change from 1 July for the GL to stay complete.

### 3e. The legacy debtor population and the ERP customer list are effectively disjoint

Matching all 28 GTDB debtor sections against the 47 `greentarget.customers` rows returns only **two**
candidates, and even those are inexact:

| Legacy debtor | ERP customer |
|---|---|
| `PAUMIN` | PAUMIN HARDWARE SDN BHD (#17) |
| `SUTERA` | SUTERA SERIMEWAH SDN BHD (#20) |

The other 26 have no ERP counterpart at all. The cause is the same as §3d: ERP customers were created
only for e-Invoice submissions and carry full legal names, while the legacy ledger uses short trading
codes. This directly shapes the debtor design — see **R6**.

---

## 4. Settled decisions — all confirmed by the user on 25 Jul 2026

Do not re-litigate these.

| # | Decision | Rationale |
|---|---|---|
| R1 ✅ | **Clone the accounting tables into the `greentarget` schema** — `greentarget.account_codes`, `journal_entries`, `journal_entry_lines`, `journal_entry_types`, `ledger_types`, `account_opening_balances`, `financial_statement_notes`, `import_legacy_rows` — rather than adding a `company_id` to the shared public tables. GT gets **its own chart of accounts**, fully isolated. | §3b (69 hard code collisions) makes sharing impossible without a company key; §3c shows even the note catalogue conflicts. The repo already establishes schema-cloning as *the* multi-company pattern (`greentarget.*` and `jellypolly.*` payroll, adjustment docs, locations). Cloning touches zero TH code paths, so it cannot regress the audited TH books. |
| R2 ✅ | **Cutover date 2026-07-01.** Jan–Jun is imported legacy truth; GT posts organically from 1 July. | The exports and the Balance Sheet both end at 06/2026. |
| R3 ✅ | **Import model identical to TH**: group rows by `(journal_ref, date)` across both files → one journal + lines; `entry_type = 'IMP'` internal; deterministic unique `reference_no`; repeatable `display_reference` for the printed ref; `source_type='legacy_import'` + staging group key for provenance; exact per-line particulars/cheque refs/display order. | Proven design; the presentation/provenance model is already documented in the TH plan §2. |
| R4 ✅ | **Openings as 2026-01-01 anchors** in `greentarget.account_opening_balances`, with explicit `0.00` fences for active zero-opening accounts — never a synthetic opening journal. | TH §5; the anchor rule is already implemented in the report engines you will be copying. |
| R5 ✅ | **No CoGM, no stock machinery.** | §2c — GT has no inventory lines. |
| R6 ✅ **(revised — read carefully)** | **The 28 GTDB debtor sections become `greentarget` debtor child accounts created by the import, from the ledger — NOT auto-generated from `greentarget.customers`.** Do not port TH's `debtorSync` behaviour as-is. Instead: (a) the import creates one debtor child per legacy code; (b) a tracked, user-approved `debtor-map.json` links a legacy code to a `greentarget.customers.customer_id` where one genuinely exists; (c) any future sync is **non-destructive** — it may never delete or rename an import-owned child, and it may not mint a child for an ERP customer that has no ledger presence without approval. | §3e: only 2 of 28 legacy debtors match an ERP customer. TH's 1:1 `customers`→child sync assumed near-total overlap; applying it here would create ~47 parallel debtor accounts beside the 28 real ones and split the receivable in two. The legacy ledger is the authority for who owes GT money (user-confirmed: ERP customer data is incomplete, GTDB is the debtor evidence). |
| R7 ✅ | **Reports/pages are built by parameterizing the existing TH pages** (the `DebtorsReportPage` config-prop pattern), not by forking them. | One code path, two companies; GT gets fixes for free. Isolation is a *data* rule, not a code rule. |
| R8 ✅ | **Apply a GT posting lock before 2026-07-01**, mirroring TH's narrow application-level `ACCOUNTING_PERIOD_LOCKED` guard (HTTP 409) on GT accounting mutations. | Consistent with TH, and the imported Jan–Jun ledger is immutable evidence that must not be edited through ordinary screens. Keep it as narrow and honest as TH's: it is not a full period close, and direct SQL/migrations bypass it by design (TH plan §9). |

**R6 clarification (28 Jul 2026):** authorised users may manually create a GT account from Chart of
Accounts, including a manually approved debtor child. R6 still forbids *automatic* account creation
by invoice/payment posting or a customer sync. The application never renames or deletes a code; a
posted service must continue to resolve an already-existing active account.

### The seven blocking questions — ANSWERED 25 Jul 2026

| # | Question | User's answer |
|---|---|---|
| 1 | Confirm R1 (schema clone) and R2 (1 Jul cutover) | **Both correct.** Clone; cutover 1 July 2026. |
| 2 | Which accounting pages does GT need? | **The recommended minimum, as listed below.** Anything else is added later only if users ask. |
| 3 | Is GT ERP invoicing simply not adopted? | **Correct — the ERP was used only to submit e-Invoices. Non-e-Invoice sales were never entered.** See §3d. |
| 4 | `TH` as a GT debtor — intercompany handling | **They are independent.** No cross-company automatic posting; reconcile manually. |
| 5 | Is there a GT Trade Debtor List or creditor/AP scan? | **No.** The only other source is the ERP customer list, which is incomplete. **Treat GTDB as the debtor evidence** (control total: June trade receivable 156,782.22). |
| 6 | What period does the Income Statement cover? | ~~06/2026 only — not year-to-date.~~ **SUPERSEDED 25 Jul 2026: it is year-to-date Jan–Jun 2026.** Its revenue of 265,208.20 is the exact six-month movement of `TGA + TGB + WS_OTH + WS_OTH4`, and page 2 is titled "PROFIT FOR THE FINANCIAL YEAR". The legacy printer puts a "FOR THE MONTH OF" header on cumulative reports — the Trial Balances do the same. See §9 (G1). |
| 7 | Does GT need a posting lock? | **Yes, since TH has one** — do it because it is consistent and logical, per R8. |

**Confirmed page scope (build these):** Chart of Accounts · Journal Entries (list / detail / edit) ·
Account Ledger · Trial Balance · Income Statement · Balance Sheet · Bank Statement · Opening
Balances · the existing Debtors report, re-pointed at the new ledger.

**Explicitly out of scope (do not build unless the user later asks):** CoGM · Material Stock ·
Journal Voucher generator · Purchases / self-billed / supplier payments · Bank-In & RV registry ·
Estimated P&L.

---

## 5. Phase plan, compute allocation, and model choice

Compute guidance below assumes a "session" is one fresh context window worked to roughly 60–70%
capacity. **Effort** is the thinking/verification intensity to allocate, not wall-clock.

| Phase | Content | Model | Effort | Est. sessions | Gate to next |
|---|---|---|---|---:|---|
| **G0** | Source intake: move `GT_Account_Legacy_Data/` → `dev/import/greentarget-legacy/data/` + gitignore; SHA-256 pin all 11 files in `source-manifest.json`; build the xlsx reader implementing §3a; emit a deterministic staging CSV + JSON audit report; prove every balance chain and all four §3a invariants; enumerate journal families, aliases, and any malformed rows. **File-only, no database.** | **Opus** | High | 1–2 | Every section's chain walks; all dates inside Jan–Jun 2026; staging SHA-256 recorded; every exception named |
| **G1** | Transcribe the 93 scan pages into deterministic CSV fixtures (6 TBs, chart of accounts, IS, BS) under `dev/import/greentarget-report-fixtures/`; hash-pin PDFs and fixtures; write `validate-fixtures.mjs` proving every printed subtotal/control recomputes. **File-only, no database.** | **Sonnet** | Medium (high token volume) | 3–5 | `ALL CHECKS PASSED`; each TB's printed DR = CR; BS recomputes to 280,386.14 |
| **G2** | Architecture + guarded migration creating the `greentarget` accounting tables (R1); GT note catalogue incl. note `25` and the note-9/long-term-liability differences; update the schema blocks in `CLAUDE.md` **and** `AGENTS.md`. | **Opus** | High | 1 | Migration applies and reruns as a no-op; zero impact on any TH table |
| **G3** | Load the chart of accounts from the G1 fixture (474+ codes, descriptions, hierarchy) and map every account to its printed APPX note; reconcile the mapping against the TB and BS/IS totals *before* importing anything. | **Opus** (mapping design) → **Sonnet** (bulk entry) | High | 1–2 | Every account in the TBs resolves; every nonzero account reaches an active note; no leaks |
| **G4** | The import itself: staging table, hash-validated load, six idempotent monthly journal batches, 2026-01-01 opening anchors, `verify-import.sql`. | **Opus** | Very high | 2–3 | All journals balanced; DR = CR global; every month-end per-account close equals the printed TB; reruns are exact no-ops |
| **G5** | GT report engines (Trial Balance, Income Statement, Balance Sheet, Account Ledger, Bank Statement) reading the GT tables + anchors, and `verify-legacy-reports.mjs` comparing them to all six TBs, the IS, and the BS. Also produce the **short named operational bridge** from §3d (how many legacy documents have an ERP counterpart and why the rest do not) — this replaces TH's invoice-reconciliation project, and is a page, not a phase. | **Opus** | Very high | 2–3 | 6/6 TBs exact; BS balances at 280,386.14; IS matches for 06/2026; every difference named with an evidence pointer |
| **G6** | Frontend: parameterize the TH accounting pages and wire the GT routes/nav (confirmed page scope in §4); re-point the GT Debtors report at the new ledger. Can run **in parallel with G4/G5** — different files. | **Sonnet** | Medium | 2–3 | Pages render GT data; TH pages unchanged (they must keep passing their own harness) |
| **G7** | Organic posting from 2026-07-01: add `journal_entry_id`/`bank_account` to `greentarget.invoices`/`payments`, GT sales + receipt + adjustment journal services, the non-destructive debtor sync of R6, and the R8 posting lock. | **Opus** | Very high | 2–3 | Every GT document type posts a balanced journal; cancellation reverses cleanly; debtor ledger ties to the debtors report; pre-1-Jul mutations return 409 |
| **G8** | Production cutover: read-only inventory, validated rollback backup, rehearse on a fresh production copy, apply, verify, deploy, changelog entry. | **Opus** | High | 1 | Same gates green on production; rollback proven before the first write |

**Total: roughly 15–22 sessions.**

### Why these model choices

- **Opus for G0, G2, G3, G4, G5, G7, G8.** These are the phases where a wrong decision is *silent and
  permanent*: a swapped date, a duplicated journal, a mis-mapped note, a non-idempotent migration, a
  cancellation cascade that orphans a journal. They involve holding many interacting constraints at
  once and designing guards that fail loudly. This is exactly where the TH project's cost was
  justified — and note that the TH import needed judgment calls (malformed source rows, a control-vs-
  subledger drift, an unbalanced opening set) that no amount of mechanical care would have produced.
- **Sonnet for G1 and G6.** G1 is high-volume, low-reasoning transcription whose correctness is
  enforced by arithmetic validators, not by model judgment — if a digit is misread, the printed
  subtotal stops recomputing and the fixture fails loudly. That makes it the single best
  cost/benefit swap in the project (it is also the largest token consumer). G6 is pattern-following
  against an existing, working reference implementation. **Escalate to Opus** for any scan page that
  fails its arithmetic gate twice, and for the first page of each new document type (to establish the
  column model the rest of the pages follow).
- **Split G3 deliberately:** decide the mapping with Opus, then let Sonnet enter the bulk rows under
  the gates Opus wrote.

### Suggested directory layout (mirror the TH structure so the pattern is recognizable)

```
dev/import/greentarget-legacy/            # ledger import (analogue of legacy-jan-may/)
  data/                                   # GITIGNORED: the 2 xlsx (+ optionally the 9 PDFs)
  generated/                              # GITIGNORED
  source-manifest.json  account-aliases.json  README.md
  prepare-staging.mjs  load-staging.mjs
  post-monthly-journals.sql  insert-opening-anchors.sql  verify-import.sql
dev/import/greentarget-report-fixtures/   # scans + fixtures (analogue of legacy-report-fixtures/)
  data/  generated/                       # GITIGNORED
  source-manifest.json  validate-fixtures.mjs  verify-legacy-reports.mjs  README.md
```

Add both `data/` and `generated/` paths to `.gitignore` in the same commit that moves the files —
the existing entries at `.gitignore:15-21` are the template. The renderer at
[render-pdf.mjs](../../dev/import/legacy-report-fixtures/render-pdf.mjs) works on the GT scans as-is
and does not need to be duplicated.

---

## 6. Verification targets (fill in as evidence arrives)

Every one of these is a hard equality; any residual must be named, quantified, and user-approved.

| Check | Expected |
|---|---|
| Every GTLD/GTDB section's running-balance chain walks C/FWD → printed close | all sections, or named malformed rows |
| All converted dates inside 2026-01-01 … 2026-06-30 | 100% |
| Imported journals balanced; global DR = CR | 0.00 difference — **✅ G4**, DR = CR = 947,665.14 |
| Per-account close at each of the six month-ends vs the printed TB | equal, all six months — **✅ G4**, 2,850 exact comparisons, 0 mismatches |
| Each printed TB's own DR = CR control | equal |
| Six printed Trial Balances vs the **report engine**, per account, in printed order | **✅ G5**, 2,850 comparisons, 0 mismatches; engine grand total = printed grand total exactly |
| **Account Ledger reproduces the printed ROW ORDER** | **✅ G5**, exhaustive — 2,968 printed rows across all 501 accounts, 0 divergence |
| `BTFS` prints blank/blank rather than `.00` on all six TBs | **✅ G5**, the engine emits no row for it |
| June Balance Sheet: net assets = financed by | **280,386.14** — **✅ G5**, every line reproduces |
| June Trade receivable (note 22) vs Σ GTDB debtor closes at 30 Jun | **156,782.22** — **✅ G5** |
| June profit for the financial year | **16,369.61** — **✅ G5** |
| Retained profit B/F | **226,944.53** — **✅ G5** |
| Income Statement for 06/2026 (**year-to-date Jan–Jun**, per §9 G1) vs the GT engine | **✅ G5**, every line exact, incl. Schedule 5 (APPX 5) 72,111.34 |
| Operational bridge: how many legacy documents have an ERP counterpart, and why the rest do not | **✅ G5** — [GT_OPERATIONAL_BRIDGE.md](GT_OPERATIONAL_BRIDGE.md); 35 of 1,100 sales documents, 0 of 89 credit sales, one named RM50.00 disagreement |
| All 28 legacy debtor codes exist as GT debtor children; the approved `debtor-map.json` covers every one that has an ERP customer | 28/28 accounts; mapping explicit (2 known candidates, §3e) |
| Opening anchor set balances (or the exact residue is named, as TH's RM1,456,480.37 was) | **✅ G4 — exactly 0.00, no residue at all**, once CD_SD carries its evidenced 76,415.40 |
| Re-running any migration/batch | exact no-op — **✅ G4**, checksum incl. all timestamps unchanged |
| TH harness after every GT phase (`validate-fixtures.mjs`, `verify-legacy-reports.mjs`) | still `ALL CHECKS PASSED` / `ALL STAGES GREEN` |

---

## 7. Risks and known limitations

- **The date rule (§3a) is the single highest-risk item in the project.** It is mechanically
  verifiable, so build the gate before the parser.
- **Scanned-source transcription risk.** House rule inherited from TH: if a hash or arithmetic gate
  fails, treat the fixture as right until the scan image itself proves otherwise. Never silently edit
  a fixture to make a gate pass.
- **Only one Balance Sheet (06/2026) and one Income Statement exist.** Jan–May statement parity is
  not independently evidenced; the six TBs still prove every account movement and opening level. Say
  so explicitly in the sign-off rather than implying full-year statement parity.
- **§3d** — GT's operational registry cannot support TH-style invoice-level reconciliation. Do not
  fabricate ERP invoices to match legacy rows.
- **⚠ Operational risk, raise with the user before G7 ships.** Because the GT ERP has only ever
  received e-Invoice sales (§3d), the organic ledger will be **incomplete from day one** unless the
  users start entering *every* GT invoice and payment from 1 July 2026 — not just the e-Invoice ones.
  This is a process change, not a code change, and no amount of engineering compensates for it. If
  full entry is not realistic, the honest alternative is to keep posting GT's ledger from manually
  keyed journals and treat the operational screens as a partial feed; that choice must be made
  explicitly, because it changes what the Trial Balance means after the cutover.
- **The debtor sync must stay non-destructive (R6).** A future session that "fixes" GT's debtor sync
  to match TH's 1:1 `customers` behaviour would silently split the receivable across two parallel
  account populations. The 28 import-owned children are the authority.
- **Privacy:** the exports and scans contain customer data. They must never leave the machine, never
  be committed, and never be sent to an external OCR service. Render and read them locally.
- **Intercompany `TH` debtor:** GT's `TH` debtor account and Tien Hock's books are independent
  (user-confirmed). Never auto-post one company's document into the other's ledger; the two sides are
  reconciled by hand.
- **Do not touch the TH books.** GT work must not modify `public.account_codes`,
  `public.journal_entries`, the TH report engines' behaviour, or the TH fixtures. The TH harness is
  the regression gate that proves this.
- **The TH production database still carries the pre-V2 import-era state**; the V2/V3 report work is
  development-only pending separate approval. Do not entangle GT's rollout with that decision.
- Two legacy journals sharing `(ref, date)` will merge into one imported journal — same visible rows,
  one entry behind them. Acceptable (TH precedent), but check whether GT's `#/#` family (1,015 rows,
  the largest and not yet characterized) makes this common; if so, raise it before G4.
- The `#/#`, `PB#/#`, `PBEB#/#`, `JBSL/#/#`, and `JWDR/#/#` journal families have **not** been
  semantically decoded yet. Decoding them (probably in G0 from particulars + account pairs, with the
  user confirming) is a G0/G3 deliverable, not an assumption to carry forward.

---

## 8. Conventions this project must follow

- `CLAUDE.md` rule 13: any schema change updates the schema blocks in **both** `CLAUDE.md` and
  `AGENTS.md`.
- `CLAUDE.md` rule 16: add a `CHANGELOG_ENTRIES` entry (ISO date + `ms` + `en`, prepended, end-user
  wording) when a user-visible GT accounting page or number ships.
- `CLAUDE.md` rule 17: never derive a `yyyy-MM-dd` string from a DB/API date via UTC or substring;
  use `format(new Date(value), 'yyyy-MM-dd')`. This project is entirely about dates — it is the rule
  most likely to be violated.
- `CLAUDE.md` rule 12: reach the dev database with
  `docker exec -i tienhock_dev_db psql -U postgres -d tienhock -c "SQL"`.
- Migrations live in `dev/migrations/` named `YYYY-MM-DD_description.sql`, are guarded (assert the
  expected precondition, abort on anything else), idempotent, and rerun as verified no-ops.

---

---

## 9. Execution record

### Phase G0 — source intake — ✅ COMPLETE (25 Jul 2026)

**File-only. No database, no schema, no TH file touched.**

**Files created**

| Path | Tracked | What |
|---|---|---|
| `dev/import/greentarget-legacy/read-xlsx.mjs` | yes | Dependency-free ZIP + sheet-XML reader returning **raw** cells. Performs no date interpretation by design. |
| `dev/import/greentarget-legacy/prepare-staging.mjs` | yes | The intake pipeline and all gates. `--check-only` supported. |
| `dev/import/greentarget-legacy/prove-date-rule.mjs` | yes | Standalone proof the §3a swap is load-bearing. |
| `dev/import/greentarget-legacy/source-manifest.json` | yes | SHA-256 + byte-length + expected-count pins for **all 11** handed-over files. |
| `dev/import/greentarget-legacy/account-aliases.json` | yes | Every audited decision: exclusions, opening-date exceptions, the nine decoded journal families, the named cash gap. |
| `dev/import/greentarget-legacy/README.md` | yes | Phase summary, warnings, open questions. |
| `dev/import/greentarget-legacy/generated/greentarget_jan_jun_staging.csv` | no | 3,469 staging rows, SHA-256 `694553057e6251895a34c0a5cc530643849e24e4ef758fc4d1002e427a2ffecd`. |
| `dev/import/greentarget-legacy/generated/validation-report.json` | no | Full audit record, incl. `perSectionChains` (per-account opening + all six month-ends + close) for G5. |

Sources moved out of the repository root and gitignored (`.gitignore:23-29`): the 2 workbooks to
`dev/import/greentarget-legacy/data/`, the 9 scans to `dev/import/greentarget-report-fixtures/data/`.
Copies were SHA-256 verified before the originals were removed. `GT_Account_Legacy_Data/` no longer exists.

**Gate results — `ALL CHECKS PASSED`**

| Gate | Result |
|---|---|
| §3a invariant 1 — numeric serials with both components ≤ 12 | 1,570 / 1,570 |
| §3a invariant 2 — text dates with day > 12 | 1,900 / 1,900 |
| §3a invariant 3 — recovered transaction dates inside Jan–Jun 2026 | 2,968 / 2,968 |
| §3a invariant 4 — balance chain `C/FWD` → printed close | **502 / 502** (TH managed 423/423 with 2 named malformed) |
| Month order non-decreasing per section | 502 / 502 |
| **2026-06-30 closing trial balance** | **DR = CR = 2,896,809.54** |
| Balance Sheet tie-outs computed from the raw workbooks | **7 / 7 exact** |
| Journal families documented with matching row counts + balance flags | 9 / 9 |
| Staging SHA-256 stable across repeated runs; guards fail loudly when tampered | verified |

Six §6 verification targets are already met at G0: trade receivable **156,782.22**, cash at bank
28,468.37, tax recoverable 24,139.50, deferred tax 62,928.00, share capital 100,000.00, retained
profit b/f **226,944.53**.

**Findings that change later phases**

- **No malformed rows at all.** No line normalizations, no control bytes, no unparsable dates or
  balances. GT's export is materially cleaner than TH's.
- **Journal families decoded (§7 deliverable, done):** `#/#` = cash/counter sales invoice (credits
  `TGA`/`TGB` revenue); `I#/#` = credit sales invoice (GTLD revenue ↔ GTDB debtor, both sides exactly
  46,848.20); `RV#/#/#` = receipt voucher (always debits `PBB_1`); `PB#/#` = cheque payment voucher
  (every row carries a physical cheque no.); `PBEB#/#` = electronic bank payment (column E is the bank
  transaction id); `PBE#/#` = one payment keyed `PBE` instead of `PBEB`; `JBSL/#/#` = monthly payroll
  journal; `JWDR/#/#` = monthly directors' remuneration journal; `JV#/#/#` = journal vouchers.
- **§7's `(ref, date)` merge concern is measured and small:** exactly **4** collisions, all in the
  `#/#` family (1,015 rows → 1,011 groups). Listed in the validation report.
- **`GTLD DEBTOR` excluded** — static control section, zero transactions, and its printed `C/FWD`
  156,782.22 is the **30 June** total, not a 1 January opening (GTDB detail opens 159,409.32, moves
  −2,627.10, closes 156,782.22). Same decision TH made for its own `DEBTOR`.
- **⚠ `GTDB CD_SD` opening-date exception** — "CASH DEBTORS (SUNDRY DEBTORS)", 65,705.40, zero
  transactions, `C/FWD` dated **2026-06-30**. Its true 1 January opening is not evidenced. TH had the
  same class of exception (`THDB SUN`). **Blocks a G4 decision.**
- **⚠ The unprinted cash-in-hand account — one structural gap explains every imbalance in both
  workbooks.** Counter sales credit revenue with no debit (CR 218,360.00); bankings debit the bank
  with no credit (DR 229,070.00). Implied 2026-01-01 opening **DR 10,710.00**, closing .00. The chart
  contains `CH_REV2` "CAH RECEIVED (2)" but the export prints it with a 0.00 opening and zero
  transactions. The **closing** TB balances exactly without adjustment; the opening set is short
  10,710.00 DR and the Jan–May month-end TBs do not balance. Implied month-end balances —
  **20,210.00 / 7,190.00 / 3,672.00 / 6,250.00 / 740.00 / .00** — are a falsifiable prediction
  **G1 must test against the six Trial Balance scans**; the June Balance Sheet independently prints
  "Cash in hand (note 6) .00", which agrees. G0 deliberately staged the source verbatim and invented
  nothing. **Blocks a G4 decision.**

**Two questions were raised for the user — both were then RESOLVED BY EVIDENCE during the G1
scaffolding pass; see below. No user decision is needed.**

**Correction to §3a of this document:** the cell-kind counts quoted there (GTLD 1,464 numeric /
1,795 string; GTDB 106 / 105) count *dated rows only*. Column B also holds the account code on every
section-header row, so the raw shared-string cell counts are higher (GTLD 2,270, GTDB 134). Both
figures are consistent; the parser distinguishes header rows by column B holding a non-date string.

**Correction to §3a invariant 4:** "per account, dates must be non-decreasing" does **not** hold for
Green Target. The legacy report orders rows within an account by month and then by document type, so
**477 of 502** sections are date-monotonic while **502 of 502** are month-monotonic. The balance chain
is the authoritative ordering check and it walks for every section. The pipeline asserts month
monotonicity, not date monotonicity.

**Correction to §5:** the suggested layout listed `load-staging.mjs`, `post-monthly-journals.sql`,
`insert-opening-anchors.sql` and `verify-import.sql` under G0's directory; those are G4 deliverables
and were not created.

---

### Phase G1 — scaffolding pass — ✅ COMPLETE (25 Jul 2026). Transcription complete 25 Jul 2026 (see below).

Per §5's own rule ("escalate to Opus … for the first page of each new document type, to establish the
column model the rest of the pages follow"), this pass read one page of each of the four document
types, defined the fixture schemas, wrote the validator, and transcribed the two statement fixtures
as exemplars. **What remains for Sonnet is the six Trial Balances — mechanical work under gates that
already fail loudly.**

**Files created** — all tracked, in `dev/import/greentarget-report-fixtures/`:
`source-manifest.json` (scan pins + every expected value), `validate-fixtures.mjs` (the layered
gate), `README.md` (column models + protocol), and the two completed fixtures
`data/gt-bs-2026-06.csv` and `data/gt-is-2026-06.csv` (gitignored, like all fixture data).

**The validator is layered so a misread digit cannot survive.** Internally the scan's own printed
arithmetic must recompute; externally **every** transcribed figure is compared to the G0 ledger —
about 2,800 exact per-account comparisons across the six months. Proven by fault injection: changing
one digit produced `AC 2010 (AC_2010) printed 9,999.99 but the G0 ledger closes 2026-01 at 0.00`.
Untranscribed fixtures report `MISSING`, not `FAIL`, so it can be run after every page.

#### ⚠ Both G0 open questions are RESOLVED — there is no missing account

The Trial Balance scans answered both at once. The printed TB nets all debtors into a **single
`DEBTOR / TRADE DEBTOR / APPX 22` line**, and that line carries the unbanked counter-sale cash as well
as trade debtors:

| | 31 Jan | 30 Jun |
|---|---:|---:|
| GTDB per-customer detail (G0) | 160,956.72 | 156,782.22 |
| G0's implied unbanked cash | 20,210.00 | .00 |
| **= printed DEBTOR control** | **181,166.72** | **156,782.22** |
| Printed TB grand total, DR = CR | **2,681,186.33** | **2,896,808.53** |

Every figure reconstructs **exactly** from the G0 ledger, and all six months balance under this model.
Jan, Feb and Jun were read off their scans and match to the cent; Mar/Apr/May are pinned predictions
for G1 to confirm.

So: **the cash sits in `CD_SD` "CASH DEBTORS (SUNDRY DEBTORS)"**, whose GTDB section prints only a
static 30-June snapshot with no transaction detail — which is exactly why G0 saw it as an
opening-date anomaly. The two questions were one question.

- `CD_SD` true opening at **2026-01-01 = 76,415.40** (printed 65,705.40 + 10,710.00).
- Month-end path: 85,915.40 / 72,895.40 / 69,377.40 / 71,955.40 / 66,445.40 / 65,705.40.
- No new account code is needed, and **`CH_REV2` is NOT the answer** — it is genuinely dormant.
- G4 anchors `CD_SD` at 76,415.40 and derives its movement rows; the residual then vanishes and every
  month-end trial balance balances.

#### Other findings, in order of impact

1. **The Income Statement is YEAR-TO-DATE, not the month of June — this corrects §4 question 6.**
   The header reads "FOR THE MONTH OF 06/2026", but revenue 265,208.20 is the six-month movement of
   `TGA + TGB + WS_OTH + WS_OTH4`, and page 2 is titled "PROFIT FOR THE FINANCIAL YEAR". The legacy
   printer uses the same "FOR THE MONTH OF" header on the Trial Balances, which are likewise
   cumulative. Update §2b and §4 accordingly.
2. **The whole G3 note mapping is validated in advance.** `APPX` on the Trial Balance *is* the
   `fs_note` number, and every Income Statement line was reconstructed exactly from G0 ledger
   accounts grouped by it — EPF 8,206.00, repair & maintenance 65,868.30, salaries 63,485.50, SOCSO
   1,238.10, vehicle running 37,929.35, admin expenses 72,111.34. The account lists are recorded in
   `printedIncomeStatementExpectations.lines[].ledgerAccounts`. G3 should start from these, not from
   scratch.
3. **`GT_ACCOUNTCODE.pdf` should not be transcribed — this corrects §2b.** §2b called it "high value:
   it should supply code → description → classification directly". It does not. Its header reads
   `PAGE 1  09:47:12  01 MAR 2010`: it is a 2010-vintage GL master with two columns
   (`GL.MASTER`, `PARTICULAR`), **no note/classification column**, listing accounts that no longer
   exist. The six 2026 Trial Balances carry the full chart *with* descriptions *and* the note number,
   superseding it entirely. **G1's surface drops from 93 pages to 66.**
4. **Printed account codes use a space where the ledger uses an underscore** (`AC 2010` → `AC_2010`,
   `BKSC KH` → `BKSC_KH`). Systematic, not an exception list; the validator applies and checks it.
   It does not apply to the four GTDB debtor codes that contain genuine spaces, which never appear on
   the TB.
5. **The Balance Sheet's brackets mean two different things** — a sign on line items, "less" on
   subtotals — so the current-liabilities subtotal is the *negated* sum of its lines. Recorded as
   `bracketConvention`; G5's Balance Sheet engine must reproduce it.
6. **The Income Statement references "(SCHEDULE 5)" but the schedule is not in the PDF.** The
   administrative-expense breakdown must be derived from TB accounts carrying `APPX 5`; their sum is
   72,111.34, confirmed exactly.

**Next:** G1 transcription (six Trial Balances, 66 pages, Sonnet) and G2 (schema clone) are both
unblocked and independent of each other.

---

### Phase G1 — Trial Balance transcription — ✅ COMPLETE (25 Jul 2026)

All 66 remaining pages (`gt-tb-2026-01.csv` … `gt-tb-2026-06.csv`, 11 pages each) transcribed and
validated. `node dev/import/greentarget-report-fixtures/validate-fixtures.mjs` (no `--only`) now
reports every fixture PASS except the one recurring, genuine finding below — the same result on every
month, not an intermittent transcription error.

**Method.** Every account's code, description and month-end balance were cross-checked against the G0
ledger (`dev/import/greentarget-legacy/generated/validation-report.json`) while reading each rendered
page, not copied blind — the printed order matches the ledger's section order exactly, which made
misreads immediately visible as a mismatch against an independently-derived figure. One page (March,
page 5, a landscape/rotated render) was initially misread by one row at low render scale; re-rendering
at `scale=4` and re-reading caught and corrected it before it was ever written to a fixture — recorded
here as the reason every landscape TB page should be sanity-checked at higher scale if anything looks
off. Total: **2,838 exact external comparisons** (473 non-excluded GTLD accounts × 6 months), 0
mismatches.

**Finding — `BTFS` "BATTERY FORKLIFT (KB)" has no G0 ledger counterpart, on all six months.** Printed
on every Trial Balance directly after `BTJCB`, APPX `2-10`, with DEBIT and CREDIT genuinely blank (not
`.00` like every other zero-balance row — the only account printed that way anywhere in the six TBs).
Confirmed absent from the raw staging CSV by grep, not just the summary JSON; every other prefix family
with a generic "Forklift Shovel" account (`BT`, `INS`, `OIL`, `R`, `SV`, `TY`) has exactly one such
account and no separate KB-side variant, so this is not a class G0 missed — it is this one code, never
exercised, with no section header in the raw GTLD workbook. The fixtures transcribe it verbatim
(blank/blank) per the house rule; `validate-fixtures.mjs` fails this one line on every month by design,
and a coverage WARN ("474 accounts + DEBTOR; the ledger has 473") accompanies it on every month for the
same reason. **This needs an explicit G3/G4 decision** — most likely carrying `BTFS` as a zero-movement
account with no G0-derived postings, same as any other account G0 never saw a transaction for.

**Mar/Apr/May predictions confirmed, not just Jan/Feb/Jun.** All three previously-unconfirmed
`printedTrialBalanceExpectations` entries (`debtorControlCents`, `grandTotalCents` for 2026-03/04/05)
were read directly off the scans during this pass and match the pinned predictions to the cent — no
disagreement to report. `source-manifest.json` itself was left unedited (updating `scanConfirmed` is a
G1-scaffolding-owned field, out of scope for a transcription pass), but the values are now independently
scan-verified in fact.

**Files changed:** `dev/import/greentarget-report-fixtures/data/gt-tb-2026-{01..06}.csv` (gitignored,
not tracked); `dev/import/greentarget-report-fixtures/README.md` (status table + BTFS finding). No
scaffolding file (`validate-fixtures.mjs`, `source-manifest.json`) was modified.

---

### Phase G2 — schema clone + note catalogue — ✅ COMPLETE (26 Jul 2026)

**The first phase that writes to the database.** It creates *structure and lookups only*: no account
code, no journal, no line, no opening anchor. G3 loads the chart; G4 imports the ledger.

**Files changed**

| Path | What |
|---|---|
| `dev/migrations/2026-07-26_greentarget_accounting_foundation.sql` | The whole phase. Guarded, idempotent, one transaction. |
| `CLAUDE.md`, `AGENTS.md` | New **Green Target Accounting (greentarget schema)** block, inserted before the GT Customers block, byte-identical in both (rule 13). |

No changelog entry — G2 ships no user-visible page or number (rule 16).

**What was created — 8 tables and 1 VIEW**

`greentarget.{ledger_types, journal_entry_types, financial_statement_notes, account_codes,
journal_entries, journal_entry_lines, account_opening_balances, import_legacy_rows}` +
`greentarget.account_codes_hierarchy`.

**`account_codes_hierarchy` is a VIEW, not a table — this was the open design question and it is
settled by evidence.** `pg_get_viewdef` shows `public.account_codes_hierarchy` is a recursive CTE over
`account_codes`, not a physical table. GT's copy is the identical CTE re-pointed at
`greentarget.account_codes`. Cloning it as a table would have created a stale snapshot that G3's
474-code load would silently desynchronise from the real chart. A guard in the migration aborts if
`public.account_codes_hierarchy` ever stops being a view.

**The note catalogue — 34 notes (16 balance-sheet, 18 income-statement)**

Seeded entirely from G1's validated fixtures; nothing was re-derived. Every row's `description`
records the printed scan line and its Trial Balance APPX evidence. Three deliberate design decisions:

1. **New GT-only column `statement_block`.** TH's engine derives placement from `category` alone, and
   that cannot express GT's printed layout in three independent ways: note `4` is a NON-CURRENT asset
   under its own heading, note `9` is a director account printed *inside current assets* as a debit,
   and note `12` is a liability in a LONG-TERM LIABILITIES block TH does not render at all.
   `category`/`report_section`/`normal_balance` are kept unchanged (same vocabulary as TH, so R7's
   shared pages work); `statement_block` is authoritative for where a line prints. A CHECK pairs each
   block to its own statement, and **`report_section` rejects `cogm` outright — R5 enforced by the
   database, not by convention.**
2. **`parent_note` is NULL for every GT note, deliberately.** On TH, `3-x`/`14-x`/`18-x` genuinely
   roll up. On GT's printed statements nothing does: note `2` "Burning Material" and note `2-1` "EPF
   Contribution" are *sibling* direct-cost lines each carrying its own amount. `parent_note='2'` would
   have falsely asserted that EPF sums into Burning Material.
3. **The three GT/TH collisions are encoded the GT way**, and the migration's verify block asserts all
   three rather than trusting the seed: `9` = asset/debit in `current_assets`; `18-2` = "Installation
   Services" (with `18-3` = "Other Income", which TH lacks entirely); `23` = "Term Loan" under
   `finance_costs`. Stock notes `3-1`…`3-7`, `14-1`…`14-3`, `5-1` and `18-1` are absent; bare note `3`
   (Tax Expenses) is kept; "DN" was **not** created.

**Corrects §3c of this document.** §3c said "all 15 note codes on GT's Balance Sheet already exist in
`public.financial_statement_notes`" and named only note `25` as new. G1's Trial Balance transcription
superseded that: **13 notes had to be created** (`2`, `2-1`…`2-10`, `18-3`, `25`), and `9`/`18-2`/`23`
are semantic collisions rather than matches. §3c's conclusion — clone, never share — was right for a
stronger reason than it stated.

**Other user decisions taken this phase**

- **`greentarget.account_codes.fs_note` carries a FOREIGN KEY** to
  `greentarget.financial_statement_notes` — a deliberate divergence from TH, which leaves it
  unconstrained. GT's catalogue is fully evidenced, so an unknown note is a transcription or mapping
  error and G3's chart load should abort loudly rather than silently leak an account out of every
  statement. Proven by fault injection: `fs_note='3-1'` is rejected, `'2-10'` is accepted.
- **Note names stored Title Case**, matching TH's existing 33 rows so the shared R7 pages render both
  companies consistently; the exact ALL-CAPS printed wording is preserved in `description`.
- **`journal_entry_types` seeded with `IMP` only.** The nine decoded legacy families ride in
  `journal_entries.legacy_entry_type`, which is unconstrained free text in TH too. Operational types
  arrive in G7 with the services that post them — nothing speculative.
- **`import_legacy_rows.source_kind` accepts `GTLD/GTDB/DERIVED`**, not TH's `THLD/THDB`.

**The three G1 loose ends — dispositions**

1. **`BTFS`** — accommodated with **no schema change**. Nothing in `account_codes` requires an account
   to have ledger movement, and `account_opening_balances` rows are optional, so G3 can seed `BTFS`
   (`fs_note='2-10'`, `is_active=true`) with zero journal lines and zero anchor. **Still needs the
   explicit G3/G4 decision**; G2 only guarantees it will not be blocked by the schema.
2. **INPUT TAX 17 vs APPX 10 — this is a pattern of three, not a one-off.** Reading the June TB found
   the same disagreement twice more, both finance costs:

   | Account | Description | TB APPX | Statement note |
   |---|---|---|---|
   | `INPUT.TAX` | INPUT TAX | 10 | BS **17** |
   | `FC TL` | TERM LOANS- INTEREST EXPENSES | 11 | IS **23** |
   | `FC HP` | HIRE PURCHASE-INTEREST EXPENSES | 16 | IS prints **no note at all** |

   All three are expense/asset accounts filed on the Trial Balance under their *balance-sheet
   counterpart's* note. All three are `.00` in June so nothing breaks arithmetically. **Notes `17` and
   `23` therefore have zero TB accounts** and are seeded as statement-only notes with the evidence in
   their `description`. **G3 must map them explicitly and must not assume APPX ≡ statement note.**
3. **"DN"** — treated as a printer marker. Not created, and the verify block asserts it is absent.

**Gate results — all green**

| Gate | Result |
|---|---|
| Migration applies cleanly | ✅ `G2 OK: 8 tables + 1 view … 6 ledger types, 1 entry type(s), 34 notes (16 BS / 18 IS)` |
| Rerun is an **exact** no-op | ✅ deterministic checksum over all objects, seed rows **and `updated_at`** identical before/after: `37272ef6dd311dad408c910b089fc2bc`. Seeds use `ON CONFLICT DO UPDATE … WHERE row IS DISTINCT FROM EXCLUDED`, so an unchanged rerun does not even touch a timestamp. |
| Zero impact on Tien Hock | ✅ migration asserts `public.{account_codes 2825, journal_entries 8188, journal_entry_lines, financial_statement_notes 33, account_opening_balances}` unmoved, inside the same transaction |
| TH `validate-fixtures.mjs` | ✅ `ALL CHECKS PASSED` |
| TH `verify-legacy-reports.mjs` | ✅ `ALL STAGES GREEN` |
| GT `validate-fixtures.mjs` | ✅ unchanged: 6 failures, all the known `BTFS` line, + the 6 accompanying coverage WARNs. `473 balances compared to the ledger, 0 mismatched` on every month. |
| Guards are not decorative | ✅ fault-injected 5 probes: unknown `fs_note` rejected / valid one accepted; `report_section='cogm'` rejected; block↔statement mismatch rejected; `source_kind='THLD'` rejected |

**Nothing blocks G3.** The chart-of-accounts load has its target tables, its note catalogue, and a
foreign key that will fail loudly on any account whose APPX does not resolve.

---

### Phase G3 — chart of accounts + note mapping — ✅ COMPLETE (26 Jul 2026)

**503 accounts were loaded. At the original G3 phase boundary there was no journal, line or opening
anchor.** The chart is **generated, not hand-typed**: a typed chart could not be
re-verified against its sources, and every field it needs (code, description, printed APPX note,
printed order) was already machine-readable in two independently-validated artifacts.

The 28 Jul runtime-maintenance update changes only the rerun contract: those 503 codes are now a
required legacy subset of a growing live chart. The migration no longer asserts later-phase tables
are empty, rejects extra accounts, or repairs an existing row. It inserts a missing legacy identity
and otherwise preserves all user-managed fields byte-for-byte.

**Files changed**

| Path | Tracked | What |
|---|---|---|
| `dev/import/greentarget-legacy/verify-chart.mjs` | yes | **Written before the loader.** Property-based gates read the database and independent sources — required legacy identity/provenance, exact untouched-seed fidelity, structural validation of intentional overrides/live rows, the named traps, hierarchy, phase boundaries, TH baseline, and printed-statement reconciliation from the immutable evidence mapping. |
| `dev/import/greentarget-legacy/build-chart.mjs` | yes | Derives the 503 rows and **writes the migration itself**. `--check-only` proves the file on disk still matches the sources. |
| `dev/migrations/2026-07-26_greentarget_chart_of_accounts.sql` | yes | Generated. Guarded, idempotent, non-destructive, one transaction. The live-safe rerun uses `ON CONFLICT DO NOTHING`; current sha256 `abe56e5f…`. |
| `dev/import/greentarget-legacy/debtor-map.json` | yes | R6 artifact. 28 debtors, 2 ERP candidates, **0 approved** — see the open question below. |
| `dev/import/greentarget-legacy/generated/gt-chart-of-accounts.csv` | no | The reviewable 503-row chart. sha256 `ce4274b4…` |
| `CLAUDE.md`, `AGENTS.md` | yes | GT accounting block updated, byte-identical in both (rule 13). |

No changelog entry — G3 ships no user-visible page or number (rule 16).

**Population** — 503 = 473 real GTLD ledger accounts + `BTFS` + the `DEBTOR` control + 28 GTDB
debtor children. `ledger_type`: TD 29 · BK 5 · TC 29 · GL 440. CS/OS remain seeded and unused (R5).

#### The architectural decision: `fs_note` holds the printed **APPX**, verbatim

The user's steer was *"the most logical and cleanest approach … closest to 1:1 parity with the legacy
data"*, and that resolves the APPX-vs-statement question against the intuitive answer. **The legacy
system's per-account note field IS the APPX** — the Trial Balance prints it straight from the account
master, whereas the Balance Sheet and Income Statement line notes are a *separate statement layout*.
The proof is on the printed IS itself: its "HIRE PURCHASE INTEREST" line carries **no note at all**,
which no per-account note field could ever produce. So the APPX is the legacy datum and the statement
note is an interpretation of it.

Storing the APPX therefore gives: one rule, no override file, no NULL notes, the FK universally
enforcing, `account_codes` 1:1 with the legacy account master, and **all seven printed reports
reproducing with zero exceptions**. The interpretation is deferred to G5, where it belongs.

**Consequences, deliberate and recorded in the database, not just here:**

| Account | Description | fs_note (TB APPX) | Statement placement |
|---|---|---|---|
| `INPUT.TAX` | INPUT TAX | `10` Other Creditors | BS current assets, note **17** |
| `FC TL` | TERM LOANS- INTEREST EXPENSES | `11` Term Loans | IS finance costs, note **23** |
| `FC HP` | HIRE PURCHASE-INTEREST EXPENSES | `16` HP Payable | IS finance costs, **no note printed** |

All three are **.00 in all six months with 0 ledger transaction rows**, so the choice is
arithmetically free today — verified, and asserted by the verifier so it stops being free loudly.
Each row carries its statement placement in `account_codes.notes`, and notes `17` and `23` carry zero
accounts. **⚠ G5's note→line mapping must not assume APPX ≡ statement note**, and must place
hire-purchase interest in finance costs explicitly, since GT's note `23` is Term Loan (TH's `23` is
Hire Purchase Interest — the documented collision).

#### The other three decisions

2. **`DEBTOR` is a real account** (`is_system`, `TD`, note `22`, description "TRADE DEBTOR") with the
   28 GTDB debtors as `parent_code` children — the only hierarchy GT's chart has, and exactly TH's
   shape. `ADD` "ALLOWANCE FOR DOUBTFUL DEBTS" carries APPX 22 too but stays a **flat GL** account:
   it is a contra account, not a subledger member, so it can never distort the debtor control.
3. **The 28 debtor children were created here**, from the GTDB *ledger* sections (R6: from the
   ledger, never from `greentarget.customers`), so G4 is purely about journals and its journal lines
   have accounts to FK to.
4. **`BTFS` is carried active** under its printed APPX `2-10` with no ledger movement — and G4 must
   give it **no opening anchor**. That is not an oversight: the report engines only surface accounts
   that have an anchor or a posted line (`ANCHORED_ACCOUNT_BALANCES_CTES`), so its *absence* from the
   anchor set is precisely what reproduces the blank/blank way the scans print it, distinct from the
   `.00` every other zero account prints.

**`ledger_type` rule** — one three-line rule from printed evidence, no per-account judgment, keyed on
the APPX so it is stable under any reading of `fs_note`: GTDB section → `TD`; APPX 19 (Cash At Bank) →
`BK`; APPX 13 (Trade Payable) → `TC`; everything else → `GL`. This matches TH's shape (BK↔19, TC↔13,
TD↔subledger) so R7's shared pages behave identically, and it makes the TH trial-balance engine's
`groupTd` netting reproduce GT's printed single `DEBTOR` control line for free.

#### Gate results — all green

| Gate | Result |
|---|---|
| Every one of the 474 TB accounts plus the 28 GTDB debtors resolves | ✅ all 503 legacy identities required; post-cutover accounts are allowed beside them |
| Every account reaches an ACTIVE note; no NULL `fs_note`; the FK was not dropped | ✅ |
| **June closes grouped by mapped note reproduce every printed IS and BS line** | ✅ **exact, every line, no residual** — revenue 265,208.20 · EPF 8,206.00 · R&M 65,868.30 · salaries 63,485.50 · SOCSO 1,238.10 · vehicle 37,929.35 · Schedule 5 72,111.34 · trade receivable 156,782.22 · and all 16 BS notes |
| Printed `DEBTOR` control, all six months | ✅ debtor children + the **named** CD_SD cash gap (20,210.00 / 7,190.00 / 3,672.00 / 6,250.00 / 740.00 / .00) = the printed control, to the cent |
| Migration applies cleanly | ✅ original 503-row load proven; current payload remains exactly 503 evidence-derived rows |
| Rerun is a non-destructive no-op for existing codes | `ON CONFLICT DO NOTHING`: seeded/edited rows and additional live accounts are never overwritten or rejected; only a missing legacy identity is inserted |
| Zero impact on Tien Hock | ✅ asserted inside the transaction (`public.account_codes` 2,825 / `journal_entries` 8,188 / `financial_statement_notes` 33 unmoved) |
| G3 stays in its lane | It never writes `journal_entries`, `journal_entry_lines`, `account_opening_balances` or `import_legacy_rows`; their later G4/G7 population is tolerated on rerun |
| TH `validate-fixtures.mjs` / `verify-legacy-reports.mjs` | ✅ `ALL CHECKS PASSED` / `ALL STAGES GREEN` |
| GT `validate-fixtures.mjs` | ✅ unchanged: the same 6 known `BTFS` failures + 6 coverage WARNs; `473 balances compared to the ledger, 0 mismatched` every month |
| Guards are not decorative | Payload faults still fail loudly: unresolvable `fs_note`, unknown `ledger_type`, duplicate code and missing payload parent. Live extras and intentional overrides are outside the payload's ownership; the verifier byte-checks untouched `G3_CHART_LOAD` rows and structurally validates overridden/live rows. |

#### Findings and open items for later phases

1. **The whole note mapping was already right.** Every one of the 30 populated note groups tied out
   to the printed statements on the first pass, with no residual anywhere. G1's advance validation
   held completely.
2. **A structural signal worth reusing:** every account under a P&L note has a **zero** 1 January
   opening, and every BS-note account may not — 0 exceptions across 473 accounts. That is an
   independent confirmation of the classification, and a cheap invariant for G4/G5 to re-assert.
3. **⚠ `debtor-map.json` has 0 approved mappings and needs the user.** Only 2 of 28 legacy debtors
   have an ERP candidate, and **neither is proven**: `PAUMIN` matches "PAUMIN HARDWARE SDN BHD"
   modulo punctuation (strong), but `SUTERA`'s ledger description is "SUTERA MEGAH SDN BHD" while ERP
   customer #20 is "SUTERA SERIMEWAH SDN BHD" — **a different company name**. Nothing consumes the
   file yet; it must be approved before G7's non-destructive sync reads it.
4. **The GT harness's 6 `BTFS` failures are permanent and correct.** They compare the fixture to the
   G0 *ledger*, and `BTFS` genuinely has no ledger section. G3 decided the *chart* question; it does
   not and should not clear that harness line.
5. **G4 inherits two decisions from G0/G1, unchanged:** `CD_SD` anchors at **76,415.40** (not the
   printed 65,705.40) with derived movement rows, and `BTFS` gets **no anchor at all**.

---

### Phase G4 — the ledger import — ✅ COMPLETE (27 Jul 2026)

**1,705 posted journals, 4,401 lines, 501 opening anchors summing to EXACTLY 0.00.** Every month-end
per-account close reproduces the printed Trial Balance scans — 2,850 exact comparisons across all six
months, zero residual anywhere.

**Files changed**

| Path | Tracked | What |
|---|---|---|
| `dev/import/greentarget-legacy/verify-import.sql` | yes | **Written before the loader.** Read-only acceptance gates: staging population, derived-row marking, source-chain reconstruction, header/line fidelity, per-journal balance, anchors, the 501×6 month-end close matrix, every named control total, TH isolation. |
| `dev/import/greentarget-legacy/verify-import.mjs` | yes | The **external** verifier. Never reads staging: it reads balances the way a report engine will (anchor + posted lines) and compares them to the six G1 Trial Balance fixtures. 62 gates, 2,850 per-account comparisons. |
| `dev/import/greentarget-legacy/build-import-staging.mjs` | yes | Derives the 1,434 CD_SD rows from the hash-pinned G0 staging and **writes the anchors migration itself**. `--check-only` proves everything on disk is still derivable. |
| `dev/import/greentarget-legacy/load-staging.mjs` | yes | Hash-validated `\copy`, one transaction, refuses to commit an unapproved population. |
| `dev/import/greentarget-legacy/post-monthly-journals.sql` | yes | One idempotent monthly batch, `-v month_start=`. Run six times. |
| `dev/migrations/2026-07-27_greentarget_import_date_encoding.sql` | yes | The one schema change: the `date_encoding` provenance column. |
| `dev/migrations/2026-07-27_greentarget_opening_anchors.sql` | yes | Generated. 501 anchors, guarded, idempotent, self-contained. |
| `dev/import/greentarget-legacy/verify-chart.mjs` | yes | **Modified:** its four G3 phase-boundary gates asserted the G4 tables were EMPTY. They now assert the exact G4 population. Still 55 gates. |
| `dev/import/greentarget-legacy/README.md` | yes | G4 runbook, the derived-leg rationale, the `posting_sequence` finding. |
| `CLAUDE.md`, `AGENTS.md` | yes | GT accounting block updated, byte-identical in both (rule 13). |
| `generated/greentarget_import_staging.csv` | no | 4,903 rows, sha256 `6e42b830…4229c32`. |
| `generated/import-derivation-report.json` | no | Full audit record of the derivation and every gate. |

No changelog entry — G4 ships no user-visible page or number (rule 16). G5 will.

#### The four decisions the user made on 26 Jul 2026

1. **Synthesise the 1,433 derived CD_SD lines — YES, one line per group.** This was the phase's single
   largest judgement call and the one G0 explicitly refused to make alone.
2. **The 4 `(ref, date)` collisions — MERGE, confirming R3.** Reading the four pairs settles §7's
   question: each is *one invoice printed on two rows* — same reference, same date, same revenue
   account, **identical particulars** (`2026/00401` is TGB 200.00 + 36.00, both `/CD-LIST`). Merging
   produces the document that actually exists; splitting would assert two invoices share one number.
3. **`posting_sequence` — a within-month ordinal reproducing the printed order** (see below).
4. **Keep `date_encoding`** as a real column on `greentarget.import_legacy_rows`.

#### The derived CD_SD leg — forced, not chosen

The prior phases had already named the gap; G4 re-proved it from the staging CSV before writing
anything, and found the structural fact that removes all discretion:

| Family | Groups | Source imbalance | Derived leg |
|---|---:|---:|---|
| `#/#` counter sales | 1,011 | −218,360.00 (credits revenue only) | DR CD_SD |
| `RV#/#/#` receipts | 421 | +228,350.00 (debits PBB_1 only) | CR CD_SD |
| `JV26/06/77` | 1 | +720.00 | CR CD_SD |
| **net** | **1,433** | **+10,710.00** | |

**No RV group is mixed.** All 472 RV groups are either fully balanced against a debtor (51) or have
no debtor leg at all (421) — zero partial cases. So each unbalanced group's derived amount is its own
imbalance and nothing else; there is no allocation to get wrong, and every imported journal balances
individually. `JV26/06/77` was confirmed semantically as well as arithmetically: it debits PBB_1
720.00 citing four `#/#` cash-sale invoice numbers, i.e. a counter-cash banking keyed as a JV.

**Four independent falsifiable gates, all exact:**

| Prediction | Result |
|---|---|
| CD_SD month-ends 85,915.40 / 72,895.40 / 69,377.40 / 71,955.40 / 66,445.40 / 65,705.40 | exact, all six |
| Opening anchor set sums to **exactly 0.00** | exact — **no named residue**, unlike TH's RM1,456,480.37 |
| All six month-end trial balances balance DR = CR | exact (2,681,187.34 … 2,896,809.54) |
| 28 debtor children = the printed DEBTOR control, all six months | exact (181,166.72 … 156,782.22) |

Derived rows can never pass as transcribed source: `source_kind='DERIVED'`, `date_encoding='derived'`,
`provenance='derived_cash_debtors_leg'`, `repaired=true`,
`special_case='cd_sd_unbanked_counter_cash'`, `source_physical_line` NULL,
`injected_after_physical_line` pointing at the printed row they follow, and particulars suffixed
`(DERIVED - COUNTER CASH RECEIVED/BANKED)` so a printed ledger shows it too. They are appended at
`stage_sequence` 10000+, so the 3,469 source rows keep their exact G0 sequence and the derived leg
always sorts last inside its journal.

**The 1.01 is not a discrepancy.** A per-account trial balance is exactly 1.01 above the printed grand
total every month, because the printed TB nets the KBOX (−0.01) and RUMAH MERAH (−1.00) credit
balances inside its single DEBTOR control line. Asserted as `= 101 cents`, not tolerated as a range.

#### ⚠ `posting_sequence` — GT's print order is by MONTH, and it is not the date

This corrects a natural assumption carried from TH (whose column is documented as within-*day*).
GT's legacy report orders an account's rows by month and then by document type: `JWDR/06/26` dated
30 Jun prints **before** `PBEB004/06` dated 12 Jun. Only 477 of 502 sections are date-monotonic;
all 502 are month-monotonic (G0's own correction).

Measured three candidate rules against the printed precedence graph of all 502 sections:

| Ordering | Violations per month |
|---|---|
| by entry date, then reference | 18–24 |
| by staging row order (first appearance) | 10–20 |
| **by `(month, journal_ref)` in C collation** | **0, all six months** |

The families sort into `#/#` < `I#/#` < `JBSL` < `JV` < `JWDR` < `PB` < `PBE` < `PBEB` < `RV`, which
is simply bytewise reference order — the legacy printer sorts the reference string. `posting_sequence`
stores that dense 1..N within-month ordinal. **G5 must order a ledger by
`(DATE_TRUNC('month', entry_date), posting_sequence, journal_entry_lines.display_order)`.** A
topological sort of the precedence graph was built and discarded once the simple rule proved exact —
it would have been an opaque map with no independent check.

#### Gate results — all green

| Gate | Result |
|---|---|
| Every imported journal balances; global DR = CR | ✅ 0.00 difference, DR = CR = 947,665.14 |
| **Opening anchor set balances to exactly 0.00** | ✅ 501 anchors, 0 cents, all dated 2026-01-01 |
| Per-account close at each of six month-ends vs the printed TB | ✅ **2,850 exact comparisons, 0 mismatches** |
| All six CD_SD month-ends | ✅ 85,915.40 / 72,895.40 / 69,377.40 / 71,955.40 / 66,445.40 / 65,705.40 |
| June trade receivable; printed DEBTOR control each month | ✅ 156,782.22; all six exact |
| Exactly 501 anchors; `DEBTOR` and `BTFS` have none, and no journal line either | ✅ |
| Migrations + batches rerun as **exact** no-ops | ✅ `INSERT 0 0` on all six batches and the anchors upsert; md5 over journals, lines, anchors and staging **including every `created_at`/`updated_at`/`posted_at`** identical before/after: `ba0c506c6c07a958cef3e7e909b99c61` |
| Zero impact on Tien Hock | ✅ asserted inside every transaction (`public.account_codes` 2,825 / `journal_entries` 8,188 / `financial_statement_notes` 33) |
| `verify-chart.mjs` | ✅ `ALL CHECKS PASSED (55 gates)` |
| `verify-import.sql` | ✅ `G4 VERIFY OK` |
| `verify-import.mjs` | ✅ `ALL CHECKS PASSED (62 gates, 2850 per-account comparisons)` |
| TH `validate-fixtures.mjs` / `verify-legacy-reports.mjs` | ✅ `ALL CHECKS PASSED` / `ALL STAGES GREEN` |
| GT `validate-fixtures.mjs` | ✅ unchanged: the same 6 known `BTFS` failures + 6 coverage WARNs; `473 balances compared to the ledger, 0 mismatched` every month |
| Guards are not decorative | ✅ **11 fault injections, all fired** (below) |

**Fault injections:** a posted line altered by 1 cent · CD_SD anchored at the printed 65,705.40
instead of 76,415.40 · BTFS given a zero anchor · an extra journal posted inside the window · a
`posting_sequence` changed · a per-line cheque reference wiped · a DERIVED staging row disguised as
`GTLD` · a derived cash leg deleted from staging · the import staging CSV tampered (hash pin) · the
generated anchors migration hand-edited (`--check-only`) · the G0 staging CSV tampered (hash pin).

**One finding worth carrying forward:** the cheque-reference probe's *restore* was itself wrong, and
`verify-import.sql` caught it (`One or more imported journal lines differ from staging`) while
`verify-import.mjs` passed — the JS verifier only counts the 1,014 cheque references, it does not
compare them per line. **Run both verifiers.** They cover different failure classes by design, and
this was a live demonstration rather than a theory.

#### Findings and open items for later phases

1. **Nothing needed a new account, and nothing needed inventing beyond the approved cash leg.** All
   4,401 lines FK-resolved against G3's 503-account chart on the first attempt.
2. **G3's structural signal held and is now re-asserted in SQL:** every account under an
   income-statement note opens at zero on 2026-01-01, 0 exceptions.
3. **R8's posting lock stays in G7, per the handover.** G4 deliberately ships no application-level
   guard: the imported ledger is immutable evidence, but nothing can reach it through a screen yet
   because no GT accounting route or page exists. G7 adds the lock together with the services that
   would otherwise be able to mutate the period.
4. **`debtor-map.json` still has 0 approved mappings** and still needs the user before G7's
   non-destructive sync reads it. G4 does not consume it. `SUTERA` remains the unproven candidate
   (ledger "SUTERA MEGAH SDN BHD" vs ERP "SUTERA SERIMEWAH SDN BHD" — a different company).
5. **G5 inherits three hard constraints:** the note→line mapping must not assume APPX ≡ statement
   note (G3); ledgers must order by `(month, posting_sequence, display_order)`, not by date; and the
   printed Trial Balance grand total is 1.01 below a per-account one by design.

---

### Phase G5 — report engines + parity harness — ✅ COMPLETE (27 Jul 2026)

**The GT report engines reproduce every printed legacy report exactly: all six Trial Balances
(2,850 per-account comparisons), the June Income Statement, the June Balance Sheet, and — the gate
that proves `posting_sequence` is used correctly — the printed ROW ORDER of all 2,968 printed ledger
rows across all 501 accounts.** `ALL STAGES GREEN (113 gates)`.

No changelog entry — G5 ships no user-visible page or number (rule 16). G6 will.

**Files changed**

| Path | Tracked | What |
|---|---|---|
| `src/routes/greentarget/accounting/report-engine.js` | yes | The engines as **pure functions of a `pool`**: `buildTrialBalance`, `buildIncomeStatement`, `buildBalanceSheet`, `buildAccountLedger`, `listLedgerAccounts`, plus `APPX_STATEMENT_OVERRIDES` and the printed block layout. |
| `src/routes/greentarget/accounting/financial-reports.js` | yes | Thin router: `/notes`, `/trial-balance/:y/:m`, `/income-statement/:y/:m`, `/balance-sheet/:y/:m`. |
| `src/routes/greentarget/accounting/account-ledger.js` | yes | Thin router: `/accounts`, `/:code/range/:start/:end`, `/:code/:y/:m`. |
| `src/routes/index.js` | yes | Mounts both at `/greentarget/api/financial-reports` and `/greentarget/api/bank-statement`. |
| `dev/import/greentarget-report-fixtures/verify-legacy-reports.mjs` | yes | The harness. 5 stages, 113 gates. |
| `docs/Account/GT_OPERATIONAL_BRIDGE.md` | yes | The §3d bridge. Every figure gated by the `bridge` stage. |
| `dev/import/greentarget-report-fixtures/README.md` | yes | G5 harness section; the `BTFS` disposition closed. |
| `CLAUDE.md`, `AGENTS.md` | yes | GT accounting block status sentence, byte-identical in both (rule 13). |

**No schema change, no migration, no data change.** G5 is entirely read-only; the harness asserts
that every GT journal is still an untouched `legacy_import`.

#### The decision the user made: CLONE the backend, do not parameterize it

R7 settles that *pages* are parameterized; it does not settle the backend, and the JP precedent
(`src/routes/jellypolly/account-ledger.js`) cloned. The user chose to clone, and the semantics
justify it independently of isolation — a parameterized `financial-reports.js` would have become a
fork made of if-statements inside the one file the audited TH books depend on:

- TH's `EXACT_FISCAL_OPENING_STOCK_CTE` and `closing_stock_values` injection have **no GT analogue**
  (R5, enforced by a database CHECK).
- TH derives placement from `category`; GT needs `statement_block`. TH's
  `nonCurrentLiabilityNotes = ["11","16"]` is simply **wrong** for GT, which prints 11 and 16 in
  CURRENT liabilities and 12 in a LONG-TERM block TH does not render.
- TH's Trial Balance orders by `(ledger_type, code)`; GT must order by the printed `sort_order`.
- GT alone needs the APPX overrides, the bracket convention, and `(month, posting_sequence)` ordering.

Isolation is now **structural, not a promise**: a `regressions` gate statically scans every SQL
template literal in the three GT files and fails on any table reference that is not
`greentarget.`-qualified — then proves no CTE name shadows a real table, so a bare name can never
excuse a real leak. This is the one bug a schema clone is most likely to have and it would otherwise
be silent: an unqualified `account_codes` reads TH's 2,825-row chart and the GT report still looks
plausible.

#### The harness runs the shipped code

TH's harness re-implements its engines' SQL query-for-query. **This one imports and executes
`report-engine.js` itself** against the dev database via `pg`, so the verified logic and the served
logic cannot diverge. That is why the engines are pure functions and the routers are ~40 lines each.

| Stage | Proves | Gates |
|---|---|---:|
| `tb` | all six printed Trial Balances, every line, **in printed order**, plus the netted control and grand totals | 54 |
| `statements` | the June IS and BS line by line, the overrides, each line's account composition | 17 |
| `ledger` | all 501 accounts: printed row order, six month-end running balances, derived flagging, the five bank statements | 17 |
| `bridge` | the §3d counts, so `GT_OPERATIONAL_BRIDGE.md` cannot rot | 12 |
| `regressions` | schema isolation, GT population unmoved, TH untouched | 13 |

#### Findings

1. **The engine's Trial Balance grand total equals the printed grand total EXACTLY — the 1.01 is not
   a residual the report carries.** G4 correctly measured a *per-account* trial balance as 1.01 above
   the printed total. The report engine nets the 28 debtor children into the printed DEBTOR control,
   which absorbs the two credit balances, so the grouped total lands on the printed figure to the
   cent in all six months. Running with `ledger_type=TD` itemises them, and the harness asserts that
   run carries exactly 101 cents of credit — KBOX −0.01 and RUMAH MERAH −1.00, and **only** those
   two, in every month. Both figures are right; they are different reports.
2. **The printed-row-order gate is exhaustive, not sampled.** §5 asked for sampling. Ascending
   `stage_sequence` within one account *is* the order the legacy report printed it, so the engine's
   row sequence can be compared to the hash-pinned staging population for every account at once —
   all 2,968 printed rows, zero divergence. DERIVED rows are excluded from both sides because they
   were never printed and therefore carry no printed-order evidence.
3. **The Balance Sheet balances by construction, and `is_balanced` is a real gate on a real
   invariant.** Σ(all as-of nets) = 0, and every GT income-statement account opens at 0.00 on
   2026-01-01, so Σ(balance-sheet accounts) is exactly the presented profit. The BS takes its profit
   line from the *same* `buildIncomeStatement` call rather than recomputing it, so the two statements
   cannot drift. The harness asserts the zero-opening invariant separately: if an IS account ever
   acquires a nonzero anchor, the BS stops balancing and says so.
4. **§4 question 6 confirmed a third time.** The Income Statement is year-to-date; the engine's
   period basis is explicit (`basis: "year_to_date"`).
5. **`GET /notes` and `GET /accounts` were added beyond the five engines** — the Account Ledger
   contract cannot function without an account list, and `fs_note` codes are meaningless without
   names. Both are read-only. GT still has no mutating accounting endpoint; that is G7's, with the
   R8 posting lock.

#### The operational bridge — one finding changes how it must be read

[GT_OPERATIONAL_BRIDGE.md](GT_OPERATIONAL_BRIDGE.md) replaces TH's whole invoice-reconciliation
project. The finding that makes it exact rather than approximate:

**`greentarget.invoices.invoice_number` IS the legacy document reference** (ERP invoice 287 carries
`2026/00054`). The GT ERP is an **e-Invoice submission register laid over the legacy `#/#`
counter-sales family** — not a parallel sales system. Matching on the natural keys hides this
completely: an ERP `date_issued` is the *submission* date and lags the legacy sale by 0–47 days
(mean 12.7), so a (date, amount) match finds 2 of 36 pairs while an exact reference match finds
**35 of 37**. Anyone re-deriving this by date will wrongly conclude the two systems are unrelated.

- **35 of 1,100 legacy sales documents have an ERP counterpart — 3.2% by count, 2.9% by value.**
- **0 of the 89 legacy credit sales does.** The entire 156,782.22 receivable exists only in the
  imported ledger's 28 debtor children, with no operational counterpart at all.
- **0 of the 15 ERP payments matches a legacy receipt voucher, structurally**: every ERP invoice is a
  counter sale, which the legacy system collects at the counter into `CD_SD` on the sale date, so
  there is no separate receipt document to match.
- Two ERP invoices have no legacy journal and both are explained, not missing: `2026/00496(A)` is an
  `(A)`-suffixed re-submission of `2026/00496` (the original ERP row is cancelled) and
  `2025/02258(a)` is a **2025** document e-Invoiced in February 2026, outside the import window.
- **One named residual, RM50.00, not reconciled:** `2026/00099` is 180.00 in the ERP and 230.00 in
  the imported ledger. **The ledger is authoritative** — it is hash-pinned and reconciles to the
  printed Trial Balance to the cent, while the ERP figure participates in no independently-evidenced
  total. Nothing was adjusted in either direction. It is the only disagreement among the 35 pairs.

#### Gate results — all green

| Gate | Result |
|---|---|
| 6/6 Trial Balances exact, per account, all 475 printed lines | ✅ 2,850 comparisons, 0 mismatches |
| Trial Balance **printed order** reproduced | ✅ all six months, positional |
| Engine grand total = printed grand total | ✅ exact, all six months (see finding 1) |
| Printed DEBTOR control | ✅ 181,166.72 / 161,995.37 / 159,051.57 / 162,811.37 / 156,180.77 / 156,782.22 |
| June Balance Sheet: net assets = financed by | ✅ **280,386.14**, every line reproduces |
| June Income Statement (YTD Jan–Jun), every line | ✅ revenue 265,208.20 · EPF 8,206.00 · R&M 65,868.30 · salaries 63,485.50 · SOCSO 1,238.10 · vehicle 37,929.35 · Schedule 5 (APPX 5, 22 accounts) 72,111.34 |
| Each IS line's exact account composition vs the manifest | ✅ every line |
| Named June figures | ✅ trade receivable 156,782.22 · profit 16,369.61 · retained b/f 226,944.53 · cash at bank 28,468.37 · tax recoverable 24,139.50 · deferred tax 62,928.00 · share capital 100,000.00 · cash in hand .00 |
| `BTFS` prints blank/blank, never `.00` | ✅ engine emits no row on all six months |
| **Account Ledger printed ROW ORDER** | ✅ **2,968 rows, 501 accounts, 0 divergence** |
| Ledger month-end balances vs the scans | ✅ all accounts × six month-ends |
| The five bank statements close at CASH AT BANK | ✅ 28,468.37 |
| Derived CD_SD rows flagged | ✅ 1,433, all on CD_SD, none elsewhere |
| Schema isolation (static scan + shadow check) | ✅ 3 files, 0 unqualified references |
| GT population unmoved / TH untouched | ✅ 1705 / 4401 / 501 / 4903 / 503 / 34 and 2825 / 8188 / 33 |
| `verify-chart.mjs` | ✅ `ALL CHECKS PASSED (55 gates)` |
| `verify-import.sql` / `verify-import.mjs` | ✅ `G4 VERIFY OK` / `ALL CHECKS PASSED (62 gates)` |
| TH `validate-fixtures.mjs` / `verify-legacy-reports.mjs` | ✅ `ALL CHECKS PASSED` / `ALL STAGES GREEN` |
| GT `validate-fixtures.mjs` | ✅ unchanged: the same 12 known `BTFS` failures + 6 coverage WARNs; `473 balances compared, 0 mismatched` every month |
| Guards are not decorative | ✅ **10 fault injections, all fired** (below) |

**Fault injections:** ledger ordered by date instead of `(month, posting_sequence)` · the
anchored-balance filter replaced by `WHERE true` so the whole chart is surfaced · Trial Balance
ordered by code instead of the printed `sort_order` · the `INPUT.TAX` APPX override removed · the
current-liabilities "less" bracket convention lost · the DEBTOR control stopped netting · a table
reference stripped of its `greentarget.` prefix · `BTFS` given a zero anchor · an income-statement
account given a nonzero anchor · a posted line altered by 1 cent.

**One finding from the injection pass, worth carrying forward:** the trap-3 injection *initially
appeared not to fire*. The cause was in the injection, not the gate — `report-engine.js` quotes the
`WHERE ap.anchor_date IS NOT NULL OR am.code IS NOT NULL` clause verbatim in a warning comment above
it, so a naive first-occurrence string replacement patched the **comment** and left the SQL intact.
Re-run against the real clause it fired four gates at once, naming `BTFS` at printed position 62.
**A fault injection that passes is not evidence the gate is weak until you have proved the fault was
actually injected.**

#### Open items for later phases

1. **G6 is unblocked and can start immediately.** The API shape is settled: the Trial Balance and
   ledger payloads match TH's contract field for field (so the shared pages need a base-path swap),
   while the two statements return an ordered **block-keyed** structure driven by `statement_block`,
   because TH's `category`-derived layout cannot express GT's printed page.
2. **`debtor-map.json` still has 0 approved mappings** and still needs the user before G7's
   non-destructive sync reads it. G5 does not consume it.
3. **The RM50.00 `2026/00099` disagreement is named, not resolved.** No action is required for the
   ledger, which is authoritative; it is recorded so a future session does not "discover" it.
4. **⚠ The process decision in the bridge §5 must be made before G7 ships.** From 1 July the GL is
   fed by the operational screens, which today carry 2.9% of revenue and 0% of receivables.

---

### Phase G6 — frontend pages + debtors re-point — ✅ COMPLETE (28 Jul 2026)

**At G6 completion, the GT Accounting section went live: six shared TH pages served Green Target through an optional
`company="greentarget"` prop (R7), backed by initial read-only GT route clones, and the GT Debtors
report is re-pointed at the imported ledger.** TH behaviour is unchanged — every prop defaults to
Tien Hock and every TH config/endpoint/localStorage key keeps its original value. Changelog entry
shipped (rule 16). G7 subsequently enabled journal mutations; the 28 Jul chart-maintenance follow-up
subsequently enabled account create/edit.

**Files changed**

| Path | Tracked | What |
|---|---|---|
| `src/routes/greentarget/accounting/journal-entries.js` | yes | New read-only clone: `GET /` (TH's `{ entries, total, limit, offset }` envelope, same filters) and `GET /:id` (lines with per-line display refs + joined account descriptions, `source: null`). |
| `src/routes/greentarget/accounting/account-codes.js` | yes | Initially a read-only `GET /?flat=true` clone plus the `/ledger-types` router; the 28 Jul follow-up added authenticated create/edit endpoints. |
| `src/routes/greentarget/accounting/debtors.js` | yes | New ledger-backed debtors: `GET /`, `GET /statement/:code`, `GET /general-statement` emitting the shared page's exact shapes from the 28 TD children; aging as a monthly FIFO roll-forward from the 2026-01-01 anchors. |
| `src/routes/index.js` | yes | Mounts `/greentarget/api/journal-entries`, `/account-codes`, `/ledger-types`, `/debtors`. |
| `src/pages/Accounting/{JournalEntryListPage,JournalDetailsPage,AccountCodeListPage,DebtorsReportPage}.tsx`, `src/pages/Accounting/Reports/{TrialBalancePage,AccountLedgerPage,IncomeStatementPage,BalanceSheetPage}.tsx` | yes | Optional `company` prop (or, for Debtors, the existing config) with TH defaults; GT branches swap base paths, hide mutating/TH-only UI, and keep TH byte-identical when the prop is absent. |
| `src/utils/accounting/useAccountingCache.ts` | yes | `useAccountCodesCache` / `useLedgerTypesCache` take an optional company (TH default; GT keys/endpoints suffixed). |
| `src/utils/accounting/{TrialBalancePDF,JournalVoucherPDFMake}.ts(x)` | yes | Optional branding params with TH defaults. |
| `src/utils/accounting/{GTIncomeStatementPDF,GTBalanceSheetPDF}.tsx` | yes | New GT PDF variants driven by the block-keyed payload (sibling files; TH PDFs untouched). |
| `src/pages/GreenTarget/Accounting/GT*.tsx` (7 wrappers) | yes | 30-line config wrappers in the established `DebtorsReportPage` pattern. |
| `src/pages/GreenTarget/DebtorsReportPage.tsx` | yes | Re-pointed at `/greentarget/api/debtors*`; customer drill deep-links `account-ledger?account=CODE`; `invoiceDetailsPath` omitted (bill rows are legacy journal refs). Shared page's three drill paths became optional config fields with guarded call sites. |
| `src/pages/GreenTargetNavData.tsx` | yes | New Accounting section (Journal Entries + details, Account Ledger, Trial Balance, Income Statement, Balance Sheet, Chart of Accounts) with Debtors under Reports, and a new Sales section grouping Invoices / Payments / Documents; top-level order aligned with TH/JP (Accounting → Payroll → Sales → operational). All routes keep their existing paths. |
| `dev/import/greentarget-report-fixtures/verify-legacy-reports.mjs` | yes | Regressions scan covers the three new routers; `EXTRACT(field FROM x)` no longer false-positives the FROM/JOIN table-reference regex. |
| `src/components/ChangelogModal.tsx`, `AGENTS.md`, `CLAUDE.md` | yes | Changelog entry + GT status sentence (byte-identical in both, rule 13). |

**Decisions**

- **At G6, everything was read-only (superseded by G7/chart maintenance).** All 1,705 GT journals are `IMP`, which TH already renders read-only;
  GT adds belt-and-braces gates. No create/edit forms (JournalEntryPage, AccountCodeFormPage stay
  TH-only); the R8 posting lock and mutations are G7's. "Bank Statement" and "Opening Balances" need
  no GT pages — a bank statement is the Account Ledger pointed at a BK account, and anchors surface
  read-only in the ledger payload (`opening_balance`/`opening_source`).
- **Debtors re-point (user-approved approach):** the shared page is kept and fed by ledger-backed
  endpoints. Each TD child is a "customer" (id = account code); per month: a `BALANCE B/F` row when
  opening ≠ 0, one bill row per debit line (`invoice_number` = legacy display ref), and a
  `RECEIPTS` row holding the month's credit lines as payments. Customer totals are exact:
  `amount = opening + Σdebits`, `paid = Σcredits`, `balance = closing` (signed; KBOX −0.01 and
  RUMAH MERAH −1.00 preserved). The general statement is a natural fit (`bal_bf / current_invoices
  / payment / total_due`); the per-debtor statement is the running account ledger.
- **IS/BS render GT's printed layout**, not TH's: block loop with `subtotal_ref`-driven bands
  (GROSS PROFIT / OPERATING PROFIT / PROFIT BEFORE TAXATION / PROFIT FOR THE FINANCIAL YEAR; NET
  ASSETS / TOTAL FINANCED BY), YTD basis label on the IS, and GT PDF variants reproducing the legacy
  scan look. `ReportSourceGuide` (TH-specific copy) is hidden on all GT report paths.
- **GT localStorage keys are namespaced** (`:greentarget` / `gtJournalEntryList*`), so the GT pages
  never restore or overwrite TH filter/scroll caches — important because 69 account codes collide.

**Findings**

1. **TH's journal list envelope is `{ entries, total, limit, offset }`** (not `{ data/rows, ... }`) —
   the clone copies the real envelope, so the shared list page works unmodified.
2. **The isolation scanner false-positived `EXTRACT(YEAR FROM je.entry_date)`** as an unqualified
   table reference. Fixed in the scanner (the SQL was already fully `greentarget.`-qualified); the
   gate still fires on real leaks — verified because it caught `debtors.js` by name before the fix.
3. **The GT debtors statement 404s on the `DEBTOR` control and unknown codes** — only the 28
   children are debtors.
4. TH favourites still fetch in the background on GT CoA/ledger pages (hooks can't be conditional;
   results never applied to GT views) — same as the JP precedent.

**Gate results — all green**

| Gate | Result |
|---|---|
| `verify-legacy-reports.mjs` | ✅ `ALL STAGES GREEN (116 gates)` — regressions scan now covers all six GT routers |
| `verify-chart.mjs` / `verify-import.mjs` | ✅ 55 gates / 62 gates, 2,850 comparisons |
| Debtors grand total 06/2026 | ✅ **156,782.22** exactly (= printed note 22), over HTTP and in-process; general-statement `total_due` ties; bare `GET /` defaults to 6/2026 |
| IS / BS over HTTP | ✅ profit 16,369.61 YTD; BS balanced, net assets = financed by = 280,386.14 |
| Journal list / detail | ✅ 1,705 total; legacy refs (`RV26/06/76`), `source: null`, per-line account descriptions |
| CoA / ledger-types | ✅ 503 / 6 rows over HTTP |
| Frontend modules | ✅ all 14 touched/created modules transform through Vite without error |
| TH pages unchanged | ✅ by construction: props/configs/localStorage keys default to TH; no TH endpoint touched |

**Not verified:** click-through of the GT pages in a browser (per rule 10 the user tests manually);
the GT IS/BS PDF print output against the scans (data path verified; visual check is the user's).

#### Open items for later phases

1. **`debtor-map.json` still has 0 approved mappings** — needed before G7's non-destructive sync.
2. **⚠ The bridge §5 process decision** (enter every invoice/payment from 1 July, or keep manual
   journals) must be made before G7 ships.
3. The RM50.00 `2026/00099` disagreement remains named, not resolved.
4. The old operational `/greentarget/api/payments/debtors*` endpoints are now unused by any page;
   removal is a G7 cleanup, not G6 scope.

---

### Phase G7 — organic posting + posting lock — ✅ COMPLETE (28 Jul 2026)

**Green Target now posts its own journals.** Every GT invoice, payment and adjustment dated on/after
**2026-07-01** owns a balanced journal in the `greentarget` schema, synced from the operational
lifecycle; manual journals are created/edited/cancelled/restored from the shared Journal pages; and a
hard posting lock (R8) rejects **every** GT mutation dated before 2026-07-01 with HTTP 409
(`ACCOUNTING_PERIOD_LOCKED`). The Jan–Jun import stays immutable — proven by all three harnesses,
re-pinned to the legacy subset and green. Changelog entry shipped (rule 16).

#### The two pre-G7 decisions, settled

1. **Bridge §5 process decision (user): "Enter everything in the ERP."** Operational entry is the
   source of truth from 1 July; G7's posting services keep the GL complete. No parallel manual
   journal workflow.
2. **`debtor-map.json` stays at 0 approved mappings** (the approval question went unanswered). Safe
   default: every organic receivable falls back to `CD_SD`, the same sundry-debtors account that
   carried all 1,011 legacy counter sales. Approving a mapping later is a file edit; only
   *subsequent* journals use it — posted journals are never rewritten (R6: no account is ever
   created or back-mutated).

#### Journal shapes (new; the import contained zero adjustment journals and zero tax postings)

| Document | Type | Shape | reference_no | display_reference |
|---|---|---|---|---|
| Invoice | `S` | DR receivable / CR revenue (gross; **no tax line** — all 153 operational invoices carry tax 0) | `invoice_number` | `invoice_number` |
| Payment | `REC` | DR `PBB_1` / CR receivable (legacy keyed every receipt against PBB_1 — GT's books have no cash-in-hand account) | `REC-{payment_id}` (hidden unique) | `internal_reference` (e.g. `RV26/07/01`) |
| Credit Note | `CN` | DR revenue / CR receivable | doc id `GT-CN-26-1` | `GT/CN/26/1` |
| Debit Note | `DN` | DR receivable / CR revenue | doc id | slash-rendered id |
| Refund Note (paired) | `RN` | DR receivable / CR `PBB_1` | doc id | slash-rendered id |

**Account resolution.** Receivable: the customer's APPROVED debtor-map link, else `CD_SD`. Revenue:
mapped debtor → `WS_OTH` (`WS_OTH4` for the TH intercompany debtor); unmapped counter sale → `TGB`
when any linked rental uses a B-prefixed tong (B1–B17 = TONG B), else `TGA`. The B-prefix rule is
consistent with all 35 ERP-matched legacy counter sales (every one `TGA` with a plain-numbered
tong); the `TGB` branch rests on the structural tong split. **First live proof came from the
backfill itself:** invoice `2026/01012`'s rental is tong `B17` → `TGB`; `2026/01014`'s is tong `29`
→ `TGA`. Adjustment revenue resolves from the original invoice's own journal (organic first, then
the imported one), falling back to the rule above.

**Cutover / straddle rules.** Invoice create/update/cancel/delete dated before the open date → 409.
A payment posts a journal **only when its owning invoice is dated on/after the open date** — a
pre-cutover invoice's money already lives in the immutable import, so an organic receipt would
double it (the operational balance update still proceeds). Pending cheques post nothing until
confirmed; the journal then dates to `payment_date`. **The lock is stricter than Tien Hock's**: it
guards ALL GT mutations including hand-keyed journals, per the G7 gate "pre-1-Jul mutations return
409". `posting_sequence` for organic journals is MAX+1 within the entry month, keeping the dense
1..N invariant the ledger's (month, sequence, display_order) ordering relies on.

**System journals detach exactly like TH**: hand-editing an S/REC/CN/DN/RN journal (or any journal
with a source) sets `manual_override`, preserves the entry type, and the owning service stops
re-syncing it — but cancelling the source document still cancels it. Verified live below.

#### The backfill — three documents, posted through the shipped services

Exactly three documents existed between the 1 July cutover and G7 going live, and zero adjustment
documents. `dev/import/greentarget-legacy/backfill-g7-organic.mjs` posts them by calling the REAL
services (never hand-built SQL), so the backfill proves the same code path every future document
takes: invoices `325` (`2026/01012`, RM200) and `326` (`2026/01014`, RM250) via
`syncGTSalesJournalEntry`, payment `197` (`RV26/07/01`, RM250, online) via `syncGTPaymentJournalEntry`.
Result: journals `3712`–`3714`, balanced, back-linked, `posting_sequence` 1–3. The script is
idempotent (the services adopt by back-link/source first).

#### Files changed

| Path | What |
|---|---|
| `dev/migrations/2026-07-28_greentarget_g7_organic_posting.sql` | Applied to dev. Adds `journal_entry_id` to `greentarget.invoices`/`payments`/`adjustment_documents`, `bank_account` to `payments`; seeds entry types `S/REC/CN/DN/RN/JV`; guards the 1,705-journal import first. |
| `src/routes/greentarget/accounting/posting-lock.js` | New. `GREEN_TARGET_ACCOUNTING_OPEN_DATE = '2026-07-01'`; the error carries both `status` and `statusCode` 409; `toLocalAccountingDateString` (rule-17-safe local formatting). |
| `src/routes/greentarget/accounting/debtor-map.js` | New. Reads `debtor-map.json`, exposes APPROVED mappings only + `GT_SUNDRY_DEBTOR_ACCOUNT = 'CD_SD'`. |
| `src/routes/greentarget/accounting/posting-utils.js` | New. `ensureGTAccountsExist` (never mints, R6), `nextGTPostingSequence`, `insertGTJournal`, `replaceGTJournal`, `cancelGTJournal`. |
| `src/routes/greentarget/accounting/{sales,payment,adjustment}-journal.js` | New. The three sync/cancel services above; payment adds `updateGTPaymentJournalReference` for reference-only edits. |
| `src/routes/greentarget/{invoices,payments,adjustment-docs}.js` | Sync/cancel wired into every lifecycle path; lock asserted BEFORE any MyInvois side effect; **the three old `/payments/debtors*` endpoints removed** (G6 open item 4). |
| `src/routes/greentarget/accounting/journal-entries.js` | Mutation half: `GET /types`, `GET /next-reference/:type`, `POST /`, `PUT /:id` (detach semantics), `POST /:id/cancel`, `POST /:id/restore` — all behind the lock; `GET /:id` now resolves a real `source` link (invoice/payment/adjustment) instead of `null`. No DELETE (posted-on-create) and no cheque endpoints (GT cheques are per-line). |
| `src/routes/index.js` | The GT journal-entries mount now sits behind `authMiddleware` + `checkRestoreState` (JP precedent) since it mutates. |
| `src/pages/Accounting/JournalEntryPage.tsx` | `company` prop: GT fetches its own types + `?flat=true` accounts directly (TH caches still fire, unused — known waste), company-scoped last-type key (`gtJournalEntryLastType`, default `JV`), no quick-add/favourites/delete for GT. |
| `src/pages/Accounting/{JournalEntryListPage,JournalDetailsPage}.tsx` | GT: New/edit/cancel/restore enabled (delete stays TH-only); details page fetches GT types; list empty-state offers "create a new entry". |
| `src/pages/GreenTarget/Accounting/GTJournalEntryPage.tsx`, `src/pages/GreenTargetNavData.tsx` | New wrapper + `/accounting/journal-entries/new` and `/:id/edit` routes (`/new` declared before `/:id`). |
| `src/types/types.ts` | `"JV"` added to `JournalEntryType`. |
| `dev/import/greentarget-report-fixtures/verify-legacy-reports.mjs` | Regressions stage re-pinned to the LEGACY subset; isolation scan now covers all six G7 service files; new lock gate "no organic journal before 2026-07-01"; ledger transaction-count gate = 4,401 + measured organic lines. |
| `dev/import/greentarget-legacy/verify-import.{mjs,sql}` | Every population/provenance/cheque/total gate scoped to `source_type='legacy_import'`; mirror R8 gate added. The dense `posting_sequence` gate stays global on purpose — organic posting must keep it. |

#### Gate results — all green

| Gate | Result |
|---|---|
| `verify-legacy-reports.mjs` | ✅ `ALL STAGES GREEN (123 gates)` — every Jan–Jun reproduction gate unchanged |
| `verify-import.mjs` | ✅ `ALL CHECKS PASSED (63 gates, 2,850 per-account comparisons)` |
| `verify-import.sql` | ✅ runs to COMMIT |
| Lock | ✅ pre-cutover invoice create → 409; pre-cutover manual journal → 409 (`ACCOUNTING_PERIOD_LOCKED`) |
| Manual journal lifecycle over HTTP | ✅ create 201 / edit 200 / cancel / restore; balanced; `posting_sequence` assigned |
| Invoice → S journal | ✅ DR `CD_SD` / CR `TGA` RM100, back-linked, seq assigned |
| Payment → REC journal | ✅ DR `PBB_1` (cheque_reference carried) / CR `CD_SD`, `REC-{id}` + `RV26/07/99` display, `bank_account` back-filled |
| Detach | ✅ hand-edit of an S journal via the journal route sets `manual_override`, keeps type `S` |
| Cancel cascades | ✅ payment cancel cancels its REC; invoice cancel cancels its S **despite the detach** |
| Invoice delete | ✅ post-cutover delete cancels the journal and removes the document |
| Backfill | ✅ 3 journals, balanced, linked; idempotent re-run safe |
| Debtor ledger ties to debtors report | ✅ July: `CD_SD` 65,705.40 B/F + 200 + 250 − 250 = **65,905.40**; debtors grand total **156,982.22** = TB DEBTOR control (June 156,782.22 + 200.00) |
| CD_SD account ledger | ✅ opening 65,705.40 (anchor semantics across the cutover); organic rows in (month, posting_sequence, display_order) order with correct running balances; `REC-197` internals hidden behind `RV26/07/01` |

**Not verified:** browser click-through of the GT journal form (per rule 10 the user tests
manually); adjustment-document posting is exercised only by the service code (zero adjustment
documents exist yet — first live CN/DN/RN will be the user's).

#### Open items for later phases

1. **`debtor-map.json` still has 0 approved mappings** — approving PAUMIN (strong evidence) / SUTERA
   (weak) is a file edit that changes only future journals.
2. The RM50.00 `2026/00099` disagreement remains named, not resolved.
3. TH caches (types/accounts/favourites) still fetch in the background on the GT journal form —
   accepted waste, same as the JP precedent; results never applied to GT views.
4. **G8 (production cutover)**: the G7 migration (`2026-07-28_greentarget_g7_organic_posting.sql`)
   joins the production apply list, and production's post-cutover documents need the same backfill —
   re-run `backfill-g7-organic.mjs` there AFTER the schema migration (it calls the shipped services,
   so it needs the server code deployed, or run it on the server).

---

### Post-G7 — Chart of Accounts maintenance — ✅ COMPLETE (28 Jul 2026)

Green Target users can now add an account and edit an existing account from Accounting → Chart of
Accounts. The shared account form is company-aware and uses GT's own account/ledger-type/report-note
routes and cache. The backend exposes authenticated `POST /greentarget/api/account-codes` and
`PUT /greentarget/api/account-codes/:code` endpoints plus the detail/children/overview reads needed
by the form.

The GT Tree view keeps terminal child accounts when it builds the hierarchy, so `DEBTOR` exposes its
28 imported debtor children with expand/collapse controls and any future parent assignment appears
the same way. The other legacy accounts remain roots because that is the structure in the source data.

**Live maintenance policy**

- Create requires a unique code, non-empty description, an active GT ledger type and an active GT
  financial-statement note. An optional parent must exist and be active. `NEW`, `CHILDREN`, `.` and
  `..` are reserved by the page routes and cannot be used as account codes.
- Edit may change description, ledger type, parent, report note, sort order, status and notes. Parent
  changes reject self/descendant cycles and recalculate the branch's denormalised `level` values.
  Every save supplies the row's `expected_updated_at`; a stale edit receives 409 and must reload
  instead of silently overwriting another user's work.
- The account code is the immutable identity. It is disabled on edit, the API rejects a rename, and
  GT has no delete endpoint or delete button.
- A system account keeps its active status, parent, ledger type and report note. An ordinary account
  with journal history or an opening anchor must remain active so historical balances stay visible;
  an account with children must be emptied/re-parented before deactivation.
- A trade-debtor (`TD`) account is always a direct child of the `DEBTOR` system control, always uses
  report note `22`, and must remain a leaf. A TD child cannot be selected as another account's parent.
- Posting services still never create an account automatically (R6). Manual creation is an explicit
  user decision and does not connect an ERP customer to a debtor automatically.

**Legacy/rebuild contract**

- G3 still derives and validates exactly **503** evidence rows. Those codes (and their
  `created_by='G3_CHART_LOAD'` provenance) remain mandatory identities; additional live accounts are
  allowed and are not counted as import drift.
- The G3 migration now inserts missing legacy identities with `ON CONFLICT DO NOTHING`. A rerun does
  not overwrite a seeded row's user-managed fields, does not reject an extra account, and does not
  require the later G4/G7 tables to be empty.
- The G3 migration and `verify-chart.mjs` byte-check untouched G3 rows. A row whose `updated_by`
  records a user/API actor is treated as an intentional override and instead receives live
  structural/FK/no-null checks; the exact original APPX/description/order/hierarchy remains verified
  from the immutable source payload.
- G4's anchor and monthly-posting guards validate the exact legacy identities they consume rather
  than asserting the whole live chart has 503 rows. The Jan–Jun staging, 501 anchors, 1,705 imported
  journals, 4,401 imported lines and every per-account close remain pinned exactly; organic accounts
  and post-1-Jul journals are outside those population counts.
- The G5 fixture harness continues exact Trial Balance/statement comparisons while the seeded report
  metadata is untouched. After an intentional report-shaping seed edit, those historical engine
  comparisons are explicitly reported as not applicable; immutable fixtures, source payload,
  imported lines and historical closes are still verified independently.

**Read-only verification (28 Jul 2026):** G3 generator `--check-only` matched both generated files;
G4 staging/anchor `--check-only` passed; `verify-chart.mjs` passed 59 gates; `verify-import.mjs`
passed 64 gates and 2,850 per-account comparisons; and the full G5 harness passed all 123 gates.
JavaScript syntax checks and `git diff --check` also passed. No build/type/lint command was run.

No schema or database migration was added for this follow-up: the existing table already carries all
required fields and constraints. The tracked G3/opening migrations were regenerated from their
updated generators; no database mutation was run as part of this maintenance change.

---

## 10. ⚠ The dev database is being replaced with production data (27 Jul 2026)

**Immediately after G5 was committed, the user replaced the development database with a copy of
production.** Production has never had any GT accounting migration applied, so **every GT accounting
row created by G2, G3 and G4 is gone from the dev database**: the 8 tables and the hierarchy view,
the 34-note catalogue, the 503-account chart, the 1,705 journals / 4,401 lines, the 501 opening
anchors, and the 4,903 staging rows.

**Nothing is lost, and this is not a setback** — it is the design working. Every one of those rows was
*derived* from hash-pinned sources by tracked, idempotent, re-runnable code. What lives on disk is the
authority; the database was only ever a projection of it.

### 10a. What survives, and what has to be rebuilt

| | State after the refresh |
|---|---|
| The two source workbooks (`greentarget-legacy/data/`) | ✅ untouched — gitignored, on disk, SHA-256 pinned |
| The 8 G1 fixture CSVs (`greentarget-report-fixtures/data/`) | ✅ untouched |
| The generated artifacts (staging CSVs, validation + derivation reports, chart CSV) | ✅ untouched |
| All tracked scripts, migrations, verifiers, engines and docs | ✅ committed |
| **Everything inside the `greentarget` schema** | ❌ **gone — rebuild with 10c** |

### 10b. ⚠ Three hard blockers you will hit, and they are not what they look like

The G2 and G3 migrations are **baseline-independent** — they snapshot the Tien Hock counts into a
temp table at the start of their own transaction and assert they are unchanged at the end, so they
apply cleanly against any database. **G4's do not.** They hardcode the *development* Tien Hock
baseline and will abort the whole transaction on production data:

| Blocker | Location | Failure |
|---|---|---|
| Hardcoded TH baseline | `dev/migrations/2026-07-27_greentarget_import_date_encoding.sql:112` | `RAISE EXCEPTION 'Tien Hock moved: account_codes %, journal_entries %'` |
| Hardcoded TH baseline | `dev/migrations/2026-07-27_greentarget_opening_anchors.sql:658` | same |
| **The generator hardcodes it too** | `dev/import/greentarget-legacy/build-import-staging.mjs:785` | regenerating the anchors migration **reproduces the blocker**, so fixing only the `.sql` is not enough |

Ten verifier gates carry the same literals: `verify-chart.mjs:544-546`, `verify-import.mjs:479-481`,
and `verify-legacy-reports.mjs:1015-1017` (plus a comment at `:946`).

**`(2825, 8188)` is `public.account_codes` and `public.journal_entries` on the DEVELOPMENT database.
Production will differ** — §7 records that production still carries the pre-V2 import-era state while
the V2/V3 report work is development-only. So when these fire, **Tien Hock has not "moved" in any
meaningful sense; the baseline has.**

Re-baselining is therefore legitimate and expected — but it must be a **measured re-baseline, not a
loosening**. Read the new figures out of the refreshed database, write those literals in, and record
in this section what they were and when. Do not delete the guards, do not widen them to a range, and
do not replace them with "greater than zero": their entire job is to prove GT work cannot move Tien
Hock's books, and that job is unchanged.

```sql
-- the two numbers to re-baseline with, after the refresh
SELECT (SELECT count(*) FROM public.account_codes)             AS account_codes,
       (SELECT count(*) FROM public.journal_entries)           AS journal_entries,
       (SELECT count(*) FROM public.financial_statement_notes) AS fs_notes;
```

**Also verify before relying on it:** the standing regression gate for all GT work has been "the Tien
Hock harness is still green" (`dev/import/legacy-report-fixtures/verify-legacy-reports.mjs` →
`ALL STAGES GREEN`). That harness compares against the dev database's **V2 state, which production
does not have**. Expect it to fail after the refresh through no fault of GT's, and re-establish what
the GT regression gate is before treating a red TH harness as a GT signal.

### 10c. Rebuild runbook — in this order

Prerequisite: `greentarget-legacy/generated/` must be populated. It survived the refresh, but if it
is ever empty, `node dev/import/greentarget-legacy/prepare-staging.mjs` regenerates it from the
workbooks.

**The migration `.sql` files referenced below were removed from `dev/migrations/` after the G8
production rollout (2026-07-28) — recover any of them with
`git show 50e63344:dev/migrations/<filename>` (see docs/MIGRATIONS_LOG.md, "Removed 28 Jul 2026
(third batch)").**

```bash
# 1. G2 — schema, lookups, the 34-note catalogue        (baseline-independent, applies as-is)
docker exec -i tienhock_dev_db psql -U postgres -d tienhock -v ON_ERROR_STOP=1 \
  -f - < dev/migrations/2026-07-26_greentarget_accounting_foundation.sql

# 2. G3 — the 503-account chart                          (baseline-independent, applies as-is)
docker exec -i tienhock_dev_db psql -U postgres -d tienhock -v ON_ERROR_STOP=1 \
  -f - < dev/migrations/2026-07-26_greentarget_chart_of_accounts.sql

# 3. G4 — RE-BASELINE 10b's three locations FIRST, then run the G4 runbook in
#    dev/import/greentarget-legacy/README.md: date_encoding migration ->
#    build-import-staging.mjs -> load-staging.mjs -> six monthly batches -> anchors migration.

# 4. Re-baseline the ten verifier gates, then prove the rebuild:
docker exec -i tienhock_dev_db psql -U postgres -d tienhock -v ON_ERROR_STOP=1 \
  -f - < dev/import/greentarget-legacy/verify-import.sql   # -> G4 VERIFY OK
node dev/import/greentarget-legacy/verify-chart.mjs                       # -> 55 gates
node dev/import/greentarget-legacy/verify-import.mjs                      # -> 62 gates
node dev/import/greentarget-report-fixtures/verify-legacy-reports.mjs     # -> 113 gates
```

**The rebuild is proven complete when all four report `ALL CHECKS PASSED` / `ALL STAGES GREEN`.**
Those 230 gates are exactly the evidence that the refreshed database reproduces the printed scans, so
nothing about the GT ledger needs to be taken on trust after the swap.

### 10d. What this does NOT change

- **No GT figure is in question.** The six Trial Balances, the Income Statement, the Balance Sheet and
  the printed row order were all reproduced from hash-pinned sources; rebuilding re-derives the same
  rows, and the verifiers re-prove it rather than assuming it.
- **G6 (frontend) is unaffected** as a code task, but it cannot be tested end-to-end until the rebuild
  is done — the GT routes will return empty or error against a database with no `greentarget`
  accounting tables.
- **G8 (production cutover) is DONE — see §10f.** Every migration reached `tienhock_prod` on
  2026-07-28 and all four verifiers passed there. `.github/workflows/deploy.yml` still does **not**
  run migrations: any future GT migration needs the same manual prod apply.

### 10e. Second refresh + measured re-baseline (28 Jul 2026, G8 rehearsal)

The dev database was replaced with a fresh production copy again on 28 Jul 2026 (~21:40 KL) for the
G8 rehearsal. **New measured TH baseline: `public.account_codes` = 2,827, `public.journal_entries`
= 8,238, `public.financial_statement_notes` = 33** (was 2,825 / 8,188 / 33). The new literals are
written into the three §10b locations (`2026-07-27_greentarget_import_date_encoding.sql`,
`2026-07-27_greentarget_opening_anchors.sql` — regenerated via `build-import-staging.mjs`, never
hand-edited — and `build-import-staging.mjs:788`) and all ten verifier gates (`verify-chart.mjs`,
`verify-import.mjs`, `verify-legacy-reports.mjs`, `verify-import.sql`). The guards stay exact-match;
re-measure at the moment of the real production apply, since any office work before then moves them.

**The 28 Jul refresh also settled the stale "prod PENDING" labels.** Tonight's production dump
contains: the TH V2 anchors (62 `legacy-report-v2` rows, 21 Jul) + fs_note remap + V3
`closing_stock_values`, the foreign-GP unlink (OP/LGP `fs_note` NULL), the JP cancelled-invoice
zeroing, the estimated report foundation (135 lines), **GT G2 + G3 (34 notes + 503 accounts,
applied by the user on 27 Jul 15:18)**, and journal 2991 restored via the migration (28 Jul 16:44).
Rosa's Q15 diesel fix (keyed in production 28 Jul) is present, proving the dump is current
production and not a dev copy. **Consequence for G8: G2/G3 are already in production and must NOT
be re-applied there (G2's data-tables-empty guard aborts by design once populated); G8's apply list
is G4 (×2) + G7 + `backfill-g7-organic.mjs` only, with the verifiers proving G2/G3 content.**

**Rehearsal result on the refreshed copy (all green):** G4 date-encoding OK → staging load OK →
six monthly batches (1,705 journals / 4,401 lines) → anchors OK (501, summing 0.00) → G7 migration +
backfill (3 organic journals, ids 1706–1708, invoices 325/326 + payment 197 — the same three pre-G7
documents exist in production) → `verify-import.sql` G4 VERIFY OK, `verify-chart.mjs` 59 gates,
`verify-import.mjs` 64 gates + 2,850 comparisons, `verify-legacy-reports.mjs` 123 gates. The TH
harness (`legacy-report-fixtures/verify-legacy-reports.mjs`) now passes everything **except** the
frozen June five-ledger fingerprint — all five account aggregates (lines/zeroLines/DR/CR cents) are
byte-identical to the frozen V2 expectation and the IMP projection/checkpoints/statements are exact;
only the content hash moved, consistent with today's legitimate prod metadata changes (the 2991
restore). Re-pinning that hash is a TH-side decision, not a GT signal.

### 10f. Phase G8 — production rollout — ✅ COMPLETE (28 Jul 2026, ~23:00–24:00 KL)

Everything §10e rehearsed was applied to `tienhock_prod` on the Hetzner server the same night,
after a BackupModal safety backup and with the office offline. G2/G3 were NOT re-run (they were
already live since 27 Jul 15:18 and G2's data-tables-empty guard would have aborted by design).
Apply order and results — every number identical to the rehearsal:

1. `2026-07-27_greentarget_import_date_encoding.sql` → `G4 date_encoding OK` (the TH-baseline guard
   passing here confirmed prod was still at 2,827 / 8,238 / 33).
2. `load-staging.mjs` → staging CSV sha256 `6e42b830…` validated, COPY 4,903, same summary table.
3. `post-monthly-journals.sql` × 6 → 1,705 journals / 4,401 lines.
4. `2026-07-27_greentarget_opening_anchors.sql` → 501 anchors summing to exactly 0.00.
5. `2026-07-28_greentarget_g7_organic_posting.sql`.
6. `backfill-g7-organic.mjs` → journals 1706/1707/1708 (invoice 325 `2026/01012` RM200 S,
   invoice 326 `2026/01014` RM250 S, payment 197 `RV26/07/01` RM250 REC), balanced, back-linked,
   `posting_sequence` 1–3 — the same three pre-G7 documents as dev.
7. All four verifiers green: `verify-import.sql` **G4 VERIFY OK** (six month-ends exact),
   `verify-chart.mjs` **59 gates**, `verify-import.mjs` **64 gates + 2,850 comparisons**,
   `verify-legacy-reports.mjs` **ALL STAGES GREEN (123 gates)** — including the Tien Hock
   isolation gates (2,827 / 8,238 / 33 unmoved).

**Three server-environment gotchas, now documented so the next rollout doesn't rediscover them:**
(a) `verify-chart.mjs` and `verify-import.mjs` were docker-only; they were patched with the same
`GT_IMPORT_DB_MODE=direct` support `load-staging.mjs` already had (default unchanged = dev docker,
re-verified locally after the patch). (b) The gitignored inputs the verifiers read —
`generated/validation-report.json` and `greentarget-report-fixtures/data/*.csv` — are not in the
repo and had to be scp'd to the server. (c) The `postgres` user could not traverse
`/home/tienhock` until `chmod o+x ~` and `chmod -R a+rX ~/tienhock-app` were applied (scp-created
directories come down `750`).

**Live spot-check passed:** GT Trial Balance 06/2026 (2,896,808.53 balanced, DEBTOR 156,782.22),
CD_SD ledger June close 65,705.40, GT Debtors report 156,782.22 with ledger deep-links, and the TH
Estimated P&L June values (PU_BBER 130,631.40 / CS_BBER 194,663.40, the verifier-pinned figures —
the estimated parity fixes were applied to prod in the same window, see
ESTIMATED_REPORT_HANDOVER.md §5). The GT ledger in production is now live and authoritative;
the only outstanding GT input remains the unapproved `debtor-map.json` (receivables fall back to
`CD_SD` until the user approves mappings).

---

*Update this file with a per-phase execution record as phases complete. Entry point for all
accounting work remains [ACCOUNTING_PROGRESS.md](ACCOUNTING_PROGRESS.md).*
