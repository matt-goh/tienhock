# Jan-May 2026 legacy sales-to-invoice reconciliation

Date checked: 2026-07-13  
Database: refreshed production snapshot after the guarded legacy import  
Status: accounting-ledger parity exact; literal ERP source-record parity needs
additional invoice/item evidence and explicit MyInvois decisions

The user confirmed on 2026-07-13 that every source-record difference must
ultimately be reconciled. The items below are therefore open evidence gaps, not
accepted permanent differences. They do not block production deployment of the
already exact, standalone `IMP` ledger projection.

## Matching rules

- ERP invoice dates use the Asia/Kuala_Lumpur local date:
  `(to_timestamp(createddate::bigint / 1000.0) AT TIME ZONE
  'Asia/Kuala_Lumpur')::date`. UTC date conversion would move 323 rows.
- Cancelled invoices and consolidated wrapper invoices are excluded.
- Numeric legacy references match ERP IDs after leading-zero normalization;
  `F` prefixes remain significant.
- ERP `CASH` invoices map to `CASH_SALES`; ERP `INVOICE` invoices map to
  `CR_SALES`.
- Credit sales must debit the resolved debtor child account (`customer id`,
  then the approved `-D` collision suffix). Cash sales must have the matching
  `CH_REV1` collection projection.
- Imported journals are the legacy accounting truth. This comparison explains
  source-versus-ERP document differences; it does not rewrite the import.

## Population and value bridge

| Population | Rows | Amount |
|---|---:|---:|
| Plan-era ERP inventory, including 5 consolidated wrappers | 2,168 | RM4,661,888.65 |
| Consolidated wrappers excluded | 5 | RM1,326,822.80 |
| ERP non-wrapper invoices | 2,163 | RM3,335,065.85 |
| ERP numeric invoices | 2,124 | RM3,335,065.85 |
| ERP `F`-prefixed free-only invoices | 39 | RM0.00 |
| Legacy normal numeric sales rows | 2,082 | RM3,336,484.25 |
| Legacy auxiliary `F` rows | 39 | RM0.00 |
| Imported sales lines (`CASH_SALES` / `CR_SALES`) | 2,121 | RM3,336,484.25 CR |

There are 2,071 direct numeric-reference matches. Of those, 2,057 agree on
reference, local date, amount, sales account, and debtor/collection account;
the remaining 14 are the exact named exceptions below. Two further invoices
have uniquely provable source-reference typos, producing 2,073 source-document
matches in total.

Legacy normal sales exceed ERP numeric invoices by **RM1,418.40**:

- RM1,391.00 from eight positive legacy sales with no ERP invoice; and
- RM27.40 net from the two matched amount differences.

The monthly value bridge is January +RM997.80 and February +RM420.60 on the
legacy side; March, April, and May have no value difference. Sales-account
category totals still shift in months containing the eight payment-term
differences.

## Named exceptions

### Source-reference typos with unique evidence matches

| Legacy reference / particulars | ERP invoice | Date | Customer | Type | Amount |
|---|---|---|---|---|---:|
| `135699` / `0135699` | `013569` | 2026-01-16 | TSEN-KY | CASH | RM100.00 |
| `15306` / `015306` | `05306` | 2026-04-04 | ROSE | INVOICE | RM15.90 |

Each match is unique on local date, customer, type, and amount, with no
competing ERP candidate.

### Amount differences

| Invoice | Date | Customer | Legacy | ERP | Legacy − ERP |
|---|---|---|---:|---:|---:|
| `026120` | 2026-01-12 | RAMBU | RM46.60 | RM47.20 | −RM0.60 |
| `013581` | 2026-02-02 | FELLECIA | RM42.00 | RM14.00 | +RM28.00 |

ERP `026120` contains RM14.60 + RM32.60. ERP `013581` contains one SBH line,
quantity 1 at RM14.00.

### One-day date differences

`013595` and `013596` are dated 2026-02-24 in legacy and 2026-02-25 in ERP.
Their amounts, sale terms, sales accounts, and customer accounts agree.

### Sale-term / sales-account differences

Legacy remains the imported accounting treatment:

| Legacy treatment | ERP treatment | Invoices |
|---|---|---|
| `CR_SALES` | CASH | `34304` RM2,431.60; `34402` RM530.00; `34439` RM1,729.20; `34832` RM530.00 |
| `CASH_SALES` | INVOICE | `2004559` RM115.80; `2004601` RM34.80; `2004628` RM870.00; `2004882` RM870.00 |

### Debtor identity differences

Of 885 reference-matched credit rows, 883 used the exact resolved ERP debtor at
the time of this check. The two identified exceptions were:

- `63263`: ERP customer `AA-T`, legacy debtor `AA`. Both records have the same
  address and phone but different branch names.
- `63760`: ERP customer `FRESHMART`, legacy debtor `NEW FRESHMART`. Both refer
  to the same business name through duplicate customer identities. **Resolved
  2026-07-16:** the user supplied both customer ledgers and approved the
  correction. Invoice `63760`, receipt allocation `TF090626-1` and its RM1,415
  debtor credit now consistently use `NEW FRESHMART`; the migration also pins
  the exact printed particulars and cheque references. See
  `dev/migrations/2026-07-16_freshmart_ledger_reconciliation.sql`.

All 1,186 reference-matched cash rows have the exact `CH_REV1` counterpart.

### Legacy main rows with no ERP invoice

| Reference | Customer | Legacy treatment | Amount |
|---|---|---|---:|
| `013573` | JIMMY | Credit | RM280.00 |
| `013575` | BIUNG | Credit | RM280.00 |
| `026134` | LUV | Credit | RM29.20 |
| `026140` | CHU | Credit | RM230.00 |
| `013576` | HELEN | Cash | RM36.00 |
| `026141` | TONY | Credit | RM143.20 |
| `026162` | HELEN | Cash | RM32.60 |
| `101640` | RE CHAI | Credit | RM0.00 |
| `026169` | JINO | Cash | RM360.00 |

The eight positive rows total RM1,391.00. Every row is backed by a balanced
THLD/THDB or THLD/CH_REV1 source group; none was synthesized by the importer.

### Zero-value projection differences

- ERP-only: exactly 90 invoices / RM0.00:
  - 51 numeric zero invoices — 48 return-only documents totaling 229 returned
    units, plus 3 free-only documents totaling 26 free units; and
  - 39 `F`-prefixed free-only invoices totaling 148 free units.
  Across all 90 documents, that is 229 returned units and 174 free units.
- Legacy auxiliary `F`: exactly 39 two-line zero
  `CASH_SALES`/`CH_REV1` groups. Thirty-eight share a base reference with a
  normal legacy sale; 36 of those bases map to ERP invoices and all 36 contain
  free products. `F013573` and `F013575` attach to the two missing base ERP
  invoices above; `F031583` is orphaned.

The legacy auxiliary rows and ERP `F` invoices are informational/free-product
projections, while the numeric ERP-only set contains operational return/FOC
documents. None adds sales value, and they must not be mechanically netted or
converted into paid sales.

## What “1:1” currently proves

The posted `IMP` journals are already a literal 1:1 accounting projection of
THLD/THDB: every retained row, amount, running balance, account close, and
opening checkpoint is exact. The differences above compare that proven legacy
ledger with the separate ERP operational invoice registry.

Literal `invoices` / `order_details` / `payments` parity cannot be constructed
from THLD/THDB alone. The ledger exports do not contain product lines,
quantities, salesperson data, tax bases, or complete FOC/return-document
details. Normal invoice APIs must not be used for historical repairs because
they would also create duplicate `S` journals beside the exact `IMP` journals.
Any approved source-record repair must therefore be a guarded direct migration
that leaves `IMP` untouched and keeps historical payment projections
nonposting.

Every named existing invoice is either individually MyInvois-valid or belongs
to a valid consolidated wrapper. The complete RM1,418.40 source-value bridge
would also change those submitted wrapper totals: January by +RM997.80 and
February by +RM420.60. Source-record rewriting is therefore a compliance and
audit decision, not an import cleanup.

## Source-record repair evidence

### Deterministic changes if legal history may be amended

- Dates: move `013595` and `013596` from local 25 February to 24 February,
  preserving their local clock time. Their payment dates are already
  24 February.
- ERP `INVOICE` → legacy cash: set `2004559`, `2004601`, `2004628`, and
  `2004882` to CASH/paid/zero balance and create nonposting automatic cash
  projections. This would reduce `credit_used` for `KY` by RM115.80, `1M` by
  RM34.80, `AFRID` by RM870.00, and `SENANG` by RM870.00.
- ERP CASH → legacy credit: set `34304`, `34402`, `34439`, and `34832` to
  INVOICE while keeping them fully paid. Their existing automatic rows would
  become nonposting genuine payments through `BANK_PBB`: `MIB000627` (cheque),
  `TT280126-1`, `TT190226-1`, and `TT050526` (the TT rows are strongly inferred
  as online transfers from the 2026 convention).
- Debtors: `63263` would move from `AA-T` to `AA`. The `63760` case was approved
  and corrected on 2026-07-16: the invoice moved from `FRESHMART` to
  `NEW FRESHMART`, together with its June receipt allocation and RM1,415 debtor
  credit, so the receipt/source/ledger chain is coherent.

The remaining items are deterministic from the available accounting evidence,
but changing submitted or consolidated source documents still requires
explicit approval. The `63760` approval and correction is the recorded
exception above.

### Evidence still missing

- Reference typos: literal parity would rename ERP `013569` → `0135699` and
  `05306` → `015306`. Both IDs are embedded in valid consolidated-wrapper
  child lists and their foreign keys do not cascade. The safer recommendation
  is a unique legacy-reference alias rather than rewriting legal primary keys.
- `026120`: RM47.20 must become RM46.60 for literal legacy parity, but the
  ledger cannot prove whether `1-MNL` should fall from RM7.30 to RM7.00 or a
  different item should absorb RM0.60.
- `013581`: RM14.00 must become RM42.00; SBH quantity 1 → 3 at RM14.00 is the
  likely repair, but it would add two sold units and needs the original invoice
  or explicit inference approval.
- The nine legacy-only headers have proven dates, customers, terms, totals, and
  settlement paths, but no product lines or salesperson data. Header-only
  fabrication is not 1:1 source parity.
- The 90 ERP-only zero documents carry real operational stock facts: 229
  returned units and 174 free units. Removing them would erase stock movement;
  adding artificial zero `IMP` rows would break Excel parity.
- The 39 auxiliary legacy `F` groups are already exact in accounting. For 36
  matched base invoices, separate source documents could only be built by
  moving—not copying—the existing free-product lines. `F013573`, `F013575`,
  and orphan `F031583` still lack item/quantity evidence.

## Decisions/evidence required before source mutation

1. Preserve valid MyInvois IDs/wrappers with legacy aliases, or rewrite
   submitted historical source records and wrapper totals.
2. Supply the original legacy invoice/item export for the two amount cases,
   nine missing invoices, and unresolved FOC documents—or explicitly approve
   the named inferences where possible.
3. Retain the 90 zero-value operational documents, or supply legacy stock
   evidence proving how their 229 returns and 174 free units should be
   represented.
4. Approve the remaining `63263` debtor change and the inferred TT payment
   methods. The `63760` / Freshmart debtor correction was approved and applied
   on 2026-07-16 from the supplied customer-ledger PDFs.

Except for separately approved and documented repairs such as `63760`, no
invoice, order, customer, payment, MyInvois, or journal source row is authorized
for mutation until the remaining items are decided. This does not reduce the
exact legacy accounting parity already achieved by `IMP`.
