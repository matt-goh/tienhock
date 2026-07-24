# ESTIMATED REPORT HANDOVER — Closing Stock P&L / Estimated Unit Cost (MEE & BIHUN)

Status: **Round 2 answers recorded — co-worker confirmations still pending; Phase 1 NOT started** | Started: 2026-07-23 | Owner: Kimi (planning/Q&A) → GPT 5.6 Sol (Phase 1+)

This doc tracks the implementation of the boss-only "Estimated P&L & Unit Cost" report
(legacy names: "MEE/BIHUN ESTIMATED" + "ESTIMATED/COST"). It is updated at every phase
checkpoint. Source scan + transcription: `dev/import/closing-stock-report/`.

---

## 0. Original user prompt (verbatim — keep word by word, do not paraphrase)

> Alright we will now undertake a complex project that is difficult to fully understand and mapped out, so please be extra careful in this implementation and do not guess or assume anything. It's closing stock profit and loss/estimated unit cost report for the boss to view. Most of the data are keyed in from @src/pages/Stock/Materials/MaterialStockPage.tsx  @src/pages/Stock/Materials/StockAdjustmentEntryPage.tsx  , product data from the sales system and the purchases are from purchase journals (PUR journal type) (you can already find these in dev db). We can implement this report to start from June only, it's isolated from the regular income statement since it is only a report for boss. I would say this would be in the report category under the stock menu in nav bar, you may disagree if you want.
>
> The ultimate goal of the report is to allow the boss to obtain:
> 1. The profit and loss of MEE and BIHUN by calculating materials/ingredients cost against production sales
> 2. Estimated average unit cost of all products combined
>
> Then the ultimate goals of our implementation:
> 1. To achieve the 2 goals above by mapping account codes with data from the sales, journal and material stock system carefully. We would need to achieve 1:1 data parity with the PDF example given not by hardcoding or importing hard coded SQLs (unless there really is data the user is unable to entry or mapped by us), but by doing what I just said, map the data according to the formulas.
>
> Now refer to scanned legacy examples, they are scanned PDFs so you might need to use OCR to scan the data. If you couldn't see clearly what's in the scanned PDF please do let me know, I will provide you the exact value of what you couldn't see. Do note that most of the code do not have underscore when they do like CS_MGRM1 is shown as CS MGRM1 in the PDF, many codes are like that. I will now explain each page with my own understanding. There might be some things that I don't know where the amounts come from, I will admit when I do so, if you also cannot figure what that unknown thing means, or how it works, just let me know too then I can go ask my co-worker to clarify.
>
> First page: The legacy system called this MEE ESTIMATED report, I think there could be a more suiting name for it, you may choose one for it. Then you can find 4 categories split by lines in this page:
> 1. PRODUCT: all data from the sales system, should be similar to @salesbyproducts
> 2. CLOSING STOCK: These should be data keyed in from the tabs in @src/pages/Stock/Materials/MaterialStockPage.tsx  , but the code here might not be mapped at all (it's explained in the formula pages later, but the codes in the formulas themselves are not mapped to the data I think), so we might have to create a mapping system for these data and code too if you also couldn't find any connection, beside the formula system which will is in later pages.
> 3. OPENING STOCK: Similar to closing stock.
> 4. PURCHASE: These are materials/ingredients that are only entried into the system via PUR - Purchase Invoices in the journal system. The system do not have a way to specifically record these entries since the users record them in books. You should be able to find the codes from the PDF in existing PUR journals.
>
> Then it's footer of the page, it has the following items:
> 1. EXPENSES: These are 50% of the expenses that are curated in the formula which will be explained in later pages.
> 2. P/L: This is the Profit and Loss amount that is derived from calculating the amounts in this page so far.
> 3. ACCUMULATIVE: Not so sure what this is, I think it's accumulated amount since previous months. If you are sure it is then we might have to seed/anchor it. If not sure I can ask the user for you.
> 4. Final Profit/Loss: This is the "Add Back + 9658.53" and the boxed amount "-22679.30" you see written down by the user. This is something that wasn't implemented in the legacy system and we need to add it. Include a add back input in the new page, the amount entered here will be the "Add back" amount shown, 9658.83 in this case.
>
> Second page: BIHOON ESTIMATED. Should be largely the same, just that everything is bihun's specific products, ingredients, and materials. The expenses also would get 50% of the total expenses derived from the expenses formula.
>
> Third page to fifth page, and sixth to eighth: Mee and Bihun formula page, you can find the codes in the formular and againm the underscores are missing in them. This is where you find how the legacy system maps the amounts/account codes. There's also the 50 value in the expenses table, it just means the 50/50 split into MEE and BIHUN expenses. All of the codes should be found in dev db's account codes, if there might be some missing ones do let me know. Some of the codes goes into the ESTIMATED reports, and some goes into the ESTIMATED/COST report like the last pages of these formular pages (MEE or BIHUN MACHINE REPAIR)
>
> Ninth to Tenth pages: BIHUN and MEE ESTIMATED/COST report. You may use a better name for these pages. These last pages are the breakdown of the average cost of producing one product (regardless of the product name). The scanned table might be crooked abit so please be aware. Like in the first row BAG, it's not perfectly aligned with its supposed amount which is 32172/BAG, and the sales too, this misaligned problem is frequent in these 2 pages so please be careful, it's the scanning problem. The PRODUCTION row in bihun is also very misaligned, it should be 30092 in the UNIT/COST column. At the bottom you can find the desired outputs of these 2 pages (6662.66, 0.221409, and 14.050356 which should be the final estimated cost per bihun product), im not exactly sure how it got to those numbers but i know it's derived from calculations in the respective pages. Do ask me if you also cannot figure out how they are calculated too.
>
> So there ya go, we would also need to have PDF printing features for this project. You don't need to 1:1 the visual/UIUX of the legacy reports, but we must achieve 1:1 content with the June legacy report data. We implement these reports in a modern and user friendly design.
>
> Include a handover doc for yourself to track your progress. Do this in phases and update the handover at every major checkpoint. Keep this prompt word by word in the doc for future action reference too so that the nuances in my original prompt don't get lost over planning.

Follow-up (same session): the scanned PDF was provided at `ClosingStockReport.pdf`
(now moved to `dev/import/closing-stock-report/ClosingStockReport.pdf`) to be turned
into fixtures.

---

## 1. Verified findings (planning phase, 2026-07-23)

Full transcription: `dev/import/closing-stock-report/expected-june-2026.json`.

### 1.1 Report math (reverse-engineered, all cross-checked)

P&L page (per product line, per month):
- `SALES` = Σ `order_details.total` for the product line's products (month by
  `invoices.createddate`, not cancelled, not consolidated child, `issubtotal` false,
  returns NOT deducted). `BAGS` = Σ `quantity`; FOC row = Σ `freeproduct`, counted in bags.
- `RETURNS` = Σ (`order_details.returnproduct` × that invoice line's `price`) for the
  product line, exposed under the legacy report labels `MRET` (MEE products) / `BRET`
  (BIHUN products); use the same invoice filters as PRODUCT.
- `USAGE = OS_total + PU_total + RETURNS − CS_total`
- `GROSS = SALES − USAGE` (legacy printed targets: MEE 87,063.28 / BIHUN
  208,125.31; the current live-source sales/return deltas are documented in Q3/Q11).
- `P/L = GROSS − EXPENSES`
- `ACCUMULATIVE = prior accum + current P/L`
- `FINAL = P/L + ADD_BACK` (new input; June: 9,658.83 → −22,679.30 ✓ / 6,662.66 → 83,345.09 ✓)

Unit-cost page:
- `PRODUCTION` = Σ `production_entries.bags_packed` for saleable products
  (MEE 20,691 ✓ / BIHUN 30,092 ✓ incl. 2-APPLE; excludes type-BUNDLE, HANCUR_BH,
  KARUNG_HANCUR (price 0), SBH/SMEE).
- Every cost row: `UNIT = AMOUNT / PRODUCTION`.
- `TOTAL = ingredients + packing + salary + salesman + habuk + expenses_line`
- `FINAL UNIT COST = (TOTAL + machine_repair − add_back) / PRODUCTION`
  (MEE 8.872386 ✓ / BIHUN 14.050356 ✓)
- `expenses_line` = 50% shared pool + product transportation (MEE 63,729.82 /
  BIHUN 64,238.82; diff = BTRA 509.00 ✓ vs June journals). `MBRMB` belongs in this
  shared pool at 50%; it must not also be added to the separate machine-repair line.

### 1.2 Data-source mapping (cross-checked against dev DB)

| Report section | Source |
|---|---|
| PRODUCT | `invoices`+`order_details` (same filter as `/api/invoices/sales/products`) |
| CLOSING STOCK | `material_stock_entries` month M `adjustment_value` per mapped material/variant/bucket; `CS_MFIN/CS_BFIN` = Σ `material_stock_kilang_entries.stock_value` month M |
| OPENING STOCK | same, month M−1 |
| PURCHASE | posted journal lines on `PU_*`/`PM_*`/`BFT_*` accounts, Σ(debit−credit), month window |
| RETURNS (`MRET`/`BRET`) | physical returns from `order_details.returnproduct × order_details.price`, mapped by `products.type` (`MEE` → MRET, `BH` → BRET), using the PRODUCT invoice filters |
| Expenses (journal rows) | posted journal lines per account-code set × 50% |
| Salary machine/packing | exact legacy account formula: salary + employer EPF/SOCSO/SIP + levy for the mapped locations. June payroll/JV math plus the posted levy lines reproduces all four legacy values exactly, but the salary/employer expense accounts themselves have no June posting; authoritative journal-vs-bridge policy remains pending Q12 co-worker confirmation |
| Add Back | new keyed input per month per product line |
| Accumulative | anchored seed + monthly P/L accumulation |

Key semantic discovery: **`material_stock_entries` rows for a month ARE the counted
closing stock** (qty × unit_cost = closing value); e.g. M1 Garam May 629.76 = OS_MGRM1,
June 287.99 = CS_MGRM1. Opening(month M) = closing(month M−1).

### 1.3 Line→material mapping (June-verified)

MEE: MGRM1→M1, MTH11→M2, MSOD1/MSOD2→M3 variants, MSD→M3B, MTEP1→M23B, MTEP2→M23C,
MTEP3→M23, MTAP→M22, MPMS/MPMB→packing materials split (subset-sum TBD), MFIN→kilang.
BIHUN: BJAG→B3, BSDM→SODIUM_1/2, BTH2→B2, BBER→B19, BSAG/KOW/LS→B20 (whole family on
the LS line), BTAP→B17, BPMS/BPMB→packing split, BFIN→kilang.

### 1.4 Anchors (accumulative P/L seeds, as of 2026-06-01)

- MEE: **−166,900.31** (printed accum −199,238.44 − printed June P/L −32,338.13)
- BIHUN: **404,935.44** (printed accum 475,457.87 − printed June P/L 70,522.43;
  the handwritten-corrected P/L 76,682.43 was a boss manual adjustment using
  hand-corrected JAGUNG stock figures — DB reproduces the printed values)
- **Both confirmed by the user** (Q7).

---

## 2. Open questions (for user / co-worker) — numbered, keep updated

### Round 1 (answered by user 2026-07-23)

1. ~~Journal `000199` PU_BBER 405,000.00 → 40,500.00~~ **APPROVED — SQL ready in §5 (FIX-1), not yet applied.**
2. ~~Missing June entries PU_MSD 540.00 / MRET 1,519.10 / BRET 265.10~~ **SUPERSEDED by Round 2:** only PU_MSD may need a real PUR journal after source-document confirmation. MRET/BRET are derived sales-return report rows and must not be keyed as manual journals merely to feed this report (see Q11).
3. ~~Sales deltas (1-MNL +20/+146.00, 2-BCM3 +205/+3,499.00)~~ **CONFIRMED: DB is truth.**
4. ~~OTHERS row~~ **ANSWERED (C.1):** OTHERS = EMPTY_BAG + EMPTY_BAG(S) sales only, split 50/50 MEE/BIHUN. (SISA stays its own row.)
5. ~~Salary machine/packing (C.2)~~ User: derived from **account codes** in the formula pages (e.g. SALARY & WAGES = MBS_O+MBS_PK+MBS_TS+MBS_M+…), not directly from payroll. Verified: **no June journal postings exist for salary accounts** (Jan–May only, via IMP) → account-code route yields 0 for June. The payroll/JV bridge alone was within ~1%; Q12 subsequently proved the entire June residual is the posted levy, so numeric parity is resolved while the authoritative source/fallback policy remains open.
6. ~~Machine repair split (C.3)~~ User's formula: MEE = `(MBRM+MBUM)/2 + MRM+MUM`; BIHUN = `(MBRM+MBUM)/2 + BRM+BUM`. Tested against June journals — **doesn't add up → Q13.**
7. ~~Accumulative seeds~~ **CONFIRMED:** MEE −166,900.31 / BIHUN 404,935.44 @ 2026-06-01.
8. ~~SMALL/BIG packing assignment~~ **CONFIRMED:** MEE BIG = {M14,M15,M16,M17,M20,M21,M28,M29,M31} (ids 56,58,59,60,63,66,64,65,57); BIHUN BIG = {B12,B13,B14,B15,B18A,B29,B31} (ids 79,81,82,85,84,83,80). The 0.30 June delta is a keyed typo — **FIX-2 in §5 approved ("use SQL to fix the 0.30").**
9. ~~SAGO family on CS_LS line~~ **CONFIRMED** (report implies it).
10. P&L EXPENSES vs unit-cost residue (~216.61/~207.21) — user: reconcile after the system is implemented (Phase 3).

### Round 2 (answered by user 2026-07-24; co-worker confirmations remain)

11. **PU_MSD source check pending; MRET/BRET mapped with deltas deferred to Phase 3.**

    - **PU_MSD:** retain it in both the P&L purchase and unit-cost ingredient formulas,
      but treat it as an optional/dormant ingredient. A zero balance or no posting is not
      an error and must not raise a missing-data warning; any future posted amount is still
      included. The account is active but has never had a journal line. The printed June
      RM540 cannot be derived from current data, so ask the co-worker to verify the source
      document. Only if it was a genuine unrecorded purchase (and is not already under
      another account) should they enter a normal balanced PUR journal: DR `PU_MSD`, CR
      the correct supplier/control account, using the real date/reference/particulars.
    - **MRET/BRET:** user identifies these as the value of returned MEE / BIHUN products.
      Map physical sales returns directly: Σ (`returnproduct × invoice-line price`), MEE →
      `MRET`, BH → `BRET`, with the normal active/non-consolidated/non-subtotal/month
      filters. Do **not** require or create MRET/BRET journals just to feed the report.
      Current June data gives MEE RM1,517.80 (199 bags) / BIHUN RM268.30 (16 bags), versus
      legacy RM1,519.10 / RM265.10 (deltas −RM1.30 / +RM3.20). Keep these as historical
      snapshot/data deltas for Phase 3; catalogue-price valuation is not the answer.

12. **Salary machine/packing — June math resolved; missing salary-account journals need confirmation.**
    The June payroll/JV bridge (gross + digenapkan + employer EPF/SOCSO/SIP) initially
    appeared short by RM146.09 / RM117.90 / RM187.61 / RM193.05. Those four differences
    exactly equal the posted June levy lines in `JV26/06/07`:

    - MEE machine: 16,922.60 + `ML_MM` 146.09 = **17,068.69**
    - MEE packing: 14,433.95 + `ML_PM` 117.90 = **14,551.85**
    - BIHUN machine: 28,606.35 + `BL_MB` 187.61 = **28,793.96**
    - BIHUN packing: 22,197.65 + `BL_PB` 193.05 = **22,390.70**

    This fully reconciles all four June legacy targets. These levy entries are already
    posted, so the co-worker must **not** key them again; doing so would duplicate the
    expense. The earlier problem was only that the comparison omitted these existing
    levy accounts.

    One implementation decision remains: the user wants the posted account-code journals
    to reflect the actual amounts, but June currently has the levy journal only and no
    salary/employer EPF/SOCSO/SIP postings on the formula accounts. Await co-worker
    confirmation on whether those June payroll journals are still to be entered. Until
    then, do not freeze the report's journal-only vs payroll/JV bridge fallback policy.
    May mismatches remain a historical validation caveat only; this report starts in June.

13. **Machine repair — MBRMB answered; printed allocation pending co-worker.** User
    confirmed `MBRMB` is a shared expense split 50/50 between MEE and BIHUN. This matches
    both legacy formula pages, where MBRMB appears under EXPENSES at 50%; keep it out of
    the separate MACHINE REPAIR add-on to avoid double-counting. The separate formulas
    remain MEE = `(MBRM+MBUM)/2 + MRM+MUM` and BIHUN =
    `(MBRM+MBUM)/2 + BRM+BUM`. June journals produce RM4,391.59 / RM2,045.98 versus
    printed RM4,200.30 / RM2,319.22 (RM81.95 net missing plus a split mismatch).
    `MUM`/`MBUM`/`BUM` have zero postings all-time. Await the co-worker's exact source,
    transaction reclassification, missing journal, or legacy override.

**Fixture-metadata handoff note:** `expected-june-2026.json` still contains the earlier
labels that call PU_MSD/MRET/BRET "missing June entries" and say salary "must come from
processed payroll." Those printed fixture amounts remain valid, but the old source labels
are superseded by Q11/Q12 above. Per this round's handover-only scope, the JSON was not
edited; update its metadata after the co-worker answers Q12, before parity automation.

### 2.1 Ready-to-send Bahasa Melayu messages

**Q11 — PU_MSD RM540**

> Hi, boleh tolong semak pembelian Sodium Tripolyphosphate (PU_MSD) RM540 untuk Jun
> 2026? Amaun ini ada dalam Estimated Report lama tetapi belum ada jurnal dalam sistem.
> Kalau memang ada pembelian sebenar dan belum direkod di akaun lain, tolong key jurnal
> PUR: debit PU_MSD RM540 dan kredit akaun supplier yang betul, guna tarikh, nombor
> invois/rujukan dan butiran ikut dokumen asal. Lepas key, tolong bagi saya tarikh,
> rujukan dan akaun supplier yang digunakan. Kalau sebenarnya sudah direkod di akaun
> lain, jangan key lagi supaya tidak duplicate — bagitahu saya dahulu. Sekali boleh
> confirm ya, bahan ini memang sudah tidak digunakan lagi sekarang?

**Q12 — jurnal gaji Jun**

> Hi, nak confirm jurnal gaji untuk Estimated Cost Jun 2026. Jurnal levy `JV26/06/07`
> sudah ada dalam sistem: Mee Mesin RM146.09, Mee Packing RM117.90, Bihun Mesin
> RM187.61 dan Bihun Packing RM193.05. Jadi levy ini tak perlu key lagi supaya tidak
> duplicate. Tetapi saya masih tak jumpa posting Jun untuk akaun gaji, KWSP majikan,
> SOCSO majikan dan SIP majikan bagi Mesin/Packing. Adakah jurnal gaji dan caruman Jun
> ini masih belum key in? Kalau belum, boleh tolong key ikut jumlah sebenar payroll dan
> pecahan akaun Mee/Bihun Mesin/Packing yang betul, kemudian bagi saya nombor rujukan
> jurnal? Kalau sebenarnya sudah direkod dalam jurnal atau akaun lain, boleh share
> rujukan itu dahulu supaya kami tidak duplicate.

**Q13 — Machine Repair**

> Hi, saya nak minta tolong semak kiraan Machine Repair dalam laporan Estimated/Cost
> bulan Jun. Formula lama yang tercetak ialah:
>
> - Mee = 50% × (MBRM + MBUM) + MRM + MUM
> - Bihun = 50% × (MBRM + MBUM) + BRM + BUM
>
> Bila ikut jurnal Jun, MBRM ialah RM2,211.00, MRM RM3,286.09 dan BRM RM940.48,
> manakala MBUM/MUM/BUM tiada amaun. Jadi kiraannya ialah Mee RM4,391.59 dan Bihun
> RM2,045.98. Tetapi laporan lama tunjuk Mee RM4,200.30 dan Bihun RM2,319.22. Boleh
> tolong confirm bagaimana dua angka dalam laporan itu dikira? Ada transaksi yang perlu
> dikeluarkan atau dipindahkan antara Mee dan Bihun, akaun lain yang digunakan, atau
> jurnal yang belum dimasukkan? MBRMB (repair boiler) kami akan kira sebagai Expenses
> kongsi 50/50, bukan masukkan sekali lagi dalam Machine Repair, supaya tidak dikira dua
> kali. Kalau ada breakdown lama, boleh share sekali. Terima kasih.

---

## 3. Phase checklist

- [x] **Phase 0 — Fixtures & handover** (2026-07-23): PDF + page PNGs +
      `expected-june-2026.json` + README in `dev/import/closing-stock-report/`; this doc.
- [ ] **Phase 1 — Migration**: tables `estimated_report_lines`,
      `estimated_report_line_materials`, `estimated_report_expense_rows`,
      `estimated_report_inputs`, `estimated_report_anchors` + seeds; AGENTS/CLAUDE schema.
- [ ] **Phase 2 — Backend**: `src/routes/stock/estimated-report.js` mounted
      `/api/estimated-report` (report data, add-back PUT, mappings GET/PUT,
      journal formula evaluation, sales-return mapping, and the salary journal/fallback
      policy after the pending Q12 co-worker confirmation).
- [ ] **Phase 3 — Parity verification**: `verify-estimated-report.mjs` vs fixture;
      delta table here; user/co-worker review of open questions.
- [ ] **Phase 4 — Frontend**: `src/pages/Stock/Reports/EstimatedReportPage.tsx`,
      nav "Reports" group in `src/pages/TienHockNavData.tsx`, drilldowns, Add Back input,
      mappings modal.
- [ ] **Phase 5 — PDF printing**: `src/utils/stock/EstimatedReportPDF.tsx` via
      `printPdfBlob` (P&L + unit cost pages per product line).
- [ ] **Phase 6 — Wrap-up**: data fixes (with approval), changelog entry,
      AGENTS.md/CLAUDE.md updates, bug-scan offer.

## 4. Progress log

- 2026-07-23 — Plan approved. All 10 pages transcribed and reverse-engineered; the
  June figures originally marked `verified_db` in the fixture were reproduced (see §1).
  Phase 0 done; later live-source/formula deltas are tracked in Q11–Q13.
- 2026-07-23 — Round-1 Q&A: user answered all 10 questions (see §2). Verified C.2/C.3
  against the DB (doesn't fully add up → Q12/Q13), root-caused the 0.30 (Q8 → FIX-2),
  confirmed PUR leg conventions and that PU_MSD/MRET/BRET have no posting history
  (→ Q11). User: Phase 1 implementation goes to GPT 5.6 Sol; SQL fixes below are
  approved but NOT yet applied.
- 2026-07-24 — Round-2 Q&A only; **no Phase 1/code/data changes made**. PU_MSD remains
  an optional formula account, with its printed June RM540 pending source confirmation.
  MRET/BRET are now mapped to physical sales returns rather than manual journals; the
  current June source deltas are documented in Q11. The four salary gaps were fully
  reconciled to the existing levy journal, while the remaining salary journal/fallback
  policy awaits co-worker confirmation. MBRMB is confirmed once
  in the shared 50/50 expense pool; the separate machine-repair split remains open.

## 5. Approved data fixes — SQL ready, NOT yet applied

Apply in the dev DB (`docker exec -i tienhock_dev_db psql -U postgres -d tienhock`).
Both are idempotent-guarded (no-op if already fixed). These are DATA fixes, not part of
the Phase 1 schema migration; GPT Sol may apply them directly or fold them into a
guarded data migration.

### FIX-1 (approved A.1): journal `000199` PU_BBER 405,000.00 → 40,500.00

Journal id 3902, entry_type PUR, 2026-06-22, manual (source_type NULL — no source
rebuild can overwrite the edit). Particulars `300BAG XRM135` prove 40,500.00.

```sql
BEGIN;
UPDATE journal_entry_lines SET debit_amount = 40500.00
 WHERE journal_entry_id = 3902 AND account_code = 'PU_BBER' AND debit_amount = 405000.00;
UPDATE journal_entry_lines SET credit_amount = 40500.00
 WHERE journal_entry_id = 3902 AND account_code = 'CR_PN' AND credit_amount = 405000.00;
UPDATE journal_entries SET total_debit = 40500.00, total_credit = 40500.00, updated_at = NOW()
 WHERE id = 3902 AND total_debit = 405000.00;
-- each UPDATE above must report exactly 1 row (0 rows = already fixed)
COMMIT;
```

### FIX-2 (approved B.3): June bihun packing B14 unit cost 282.50 → 282.20 (the 0.30)

`material_stock_entries` id 171 (2026/6, bihun, material 82 = B14, variant 118 =
`8.50 x 33.2KG (SG)`): 1 bag × 8.50/kg × 33.2 kg = **282.20**, keyed as 282.50. May used
282.20 for the same variant. This single typo explains the whole 0.30: after the fix,
June BIHUN BIG packing = 16,891.45 ✓ and total packing = 47,886.59 ✓ (both match the
legacy print exactly; SMALL was already exact at 30,183.94 + tape 811.20).

```sql
UPDATE material_stock_entries
   SET unit_cost = 282.20, adjustment_value = 282.20, updated_at = NOW()
 WHERE id = 171 AND unit_cost = 282.50;  -- 0 rows = already fixed
```

### PENDING CO-WORKER CHECK (not yet an approved fix): PU_MSD RM540.00

Do not create a journal merely to force June parity. The report keeps PU_MSD in its
formula and accepts zero without warning. If the co-worker confirms the printed RM540
was a genuine June purchase not recorded elsewhere, they should key a normal balanced
PUR journal through the journal workflow: DR `PU_MSD`, CR the real supplier/control
account, with the source document's actual date/reference/particulars. This June entry
would not affect `LEGACY_JAN_MAY_INVOICE_RECONCILIATION.md`, which covers Jan–May IMP
journals only.

MRET/BRET are explicitly removed from this pending-journal list. They are mapped from
sales `returnproduct × invoice-line price` as described in Q11; manual return journals
would risk double-counting.
