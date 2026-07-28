# ESTIMATED REPORT HANDOVER — Closing Stock P&L / Estimated Unit Cost (MEE & BIHUN)

Status: **Phase 4 COMPLETE — frontend shipped (2026-07-28); Phase 5 PDF next (handoff ready in §11 — start there in a fresh session)** | Started: 2026-07-23 | Owner: Kimi (planning/Q&A) → Claude (Phase 1) → Claude (Phase 2) → GPT-5.6 Sol (Phase 3) → Kimi (Phase 4)

Phase 3 runs the shipped engine against the complete June fixture with **392 exact
checks, 70 explicitly derived/documented deltas and 0 failures** (§9). Both approved
data fixes are applied to dev through a guarded, idempotent migration; production is
still pending. Every remaining delta is explicitly classified and gated — no formula
or mapping guess was added. Q15 was resolved on 2026-07-28 (co-worker keyed the
mis-posted RM40 diesel difference correctly in production — see §2 item 15); Q14
remains deliberately deferred under §7.2 and can be corrected from source evidence
during any later phase.

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

### 1.1 Report math (reverse-engineered; canonical and handwritten evidence separated)

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
- `FINAL = P/L + ADD_BACK` (new input). Against the printed atomic rows, June targets
  are MEE 9,658.83 → **−22,679.30** and BIHUN 6,662.66 → **77,185.09**. The handwritten
  BIHUN 83,345.09 uses a separate JAGUNG stock scenario and is retained as evidence,
  not as the canonical parity target.

Unit-cost page:
- `PRODUCTION` = Σ `production_entries.bags_packed` for saleable products
  (MEE 20,691 ✓ / BIHUN 30,092 ✓ incl. 2-APPLE; excludes type-BUNDLE, HANCUR_BH,
  KARUNG_HANCUR (price 0), SBH/SMEE).
- Every cost row: `UNIT = AMOUNT / PRODUCTION`.
- `TOTAL = ingredients + packing + salary + salesman + habuk + expenses_line`
- `FINAL UNIT COST = (TOTAL + machine_repair − add_back) / PRODUCTION`. Canonical
  printed-source targets recomputed from the atomic rows are **MEE 8.872433 / BIHUN
  14.255106**. The handwritten 8.872386 / 14.050356 values are internally inconsistent
  or use the alternate JAGUNG scenario; they are annotations, not engine targets.
  Current post-fix live values are 8.812917 / 14.246057 (§9.2).
- `expenses_line` = 50% shared pool + product transportation (MEE 63,729.82 /
  BIHUN 64,238.82; diff = BTRA 509.00 ✓ vs June journals). `MBRMB` belongs in this
  shared pool at 50%; it must not also be added to the separate machine-repair line.

### 1.2 Data-source mapping (cross-checked against dev DB)

| Report section | Source |
|---|---|
| PRODUCT | `invoices`+`order_details` (same filter as `/api/invoices/sales/products`) |
| CLOSING STOCK | `material_stock_entries` month M `adjustment_value` per mapped material/variant/bucket; `CS_MFIN/CS_BFIN` = Σ `material_stock_kilang_entries.stock_value` month M |
| OPENING STOCK | same, month M−1 — since Phase 1 the CS and OS rows are ONE `estimated_report_lines` row (`code`/`description` + `opening_code`/`opening_description`) so both sides can never drift apart |
| PURCHASE | posted journal lines on `PU_*`/`PM_*`/`BFT_*` accounts, Σ(debit−credit), month window |
| RETURNS (`MRET`/`BRET`) | physical returns from `order_details.returnproduct × order_details.price`, mapped by `products.type` (`MEE` → MRET, `BH` → BRET), using the PRODUCT invoice filters |
| Expenses (journal rows) | posted journal lines per account-code set × 50% |
| Salary machine/packing | exact legacy account formula, read **from posted journals only — no payroll fallback** (Q12 answered). Salary + employer EPF/SOCSO/SIP reach those accounts through the **JVSL payroll voucher generator** (`location_account_mappings`), which maps to precisely the formula codes; levy (`ML_*`/`BL_*`) is keyed by hand and must never be entered twice |
| Add Back | new keyed input per month per product line |
| Accumulative | anchored seed + monthly P/L accumulation |

Key semantic discovery: **`material_stock_entries` rows for a month ARE the counted
closing stock** (qty × unit_cost = closing value); e.g. M1 Garam May 629.76 = OS_MGRM1,
June 287.99 = CS_MGRM1. Opening(month M) = closing(month M−1).

### 1.3 Line→material mapping (June-verified)

MEE: MGRM1→M1, MTH11→M2, MSOD1/MSOD2→M3 variants, MSD→M3B, MTEP1→M23B, MTEP2→M23C,
MTEP3→M23, MTAP→M22, MPMB→Q8 BIG set {M14,M15,M16,M17,M20,M21,M28,M29,M31},
MPMS→the remaining active MEE packing materials, MFIN→kilang. BIHUN: BJAG→B3,
BSDM→SODIUM_1/2, BTH2→B2, BBER→B19, BSAG/KOW/LS→B20 (whole family on the LS line),
BTAP→B17, BPMB→Q8 BIG set {B12,B13,B14,B15,B18A,B29,B31}, BPMS→the remaining active
BIHUN packing materials, BFIN→kilang.

### 1.4 Anchors (accumulative P/L seeds, as of 2026-06-01)

- MEE: **−166,900.31** (printed accum −199,238.44 − printed June P/L −32,338.13)
- BIHUN: **404,935.44** (printed accum 475,457.87 − printed June P/L 70,522.43;
  the handwritten-corrected P/L 76,682.43 was a boss manual adjustment using
  hand-corrected JAGUNG stock figures — DB reproduces the printed values)
- **Both confirmed by the user** (Q7).

---

## 2. Open questions (for user / co-worker) — numbered, keep updated

### Round 1 (answered by user 2026-07-23)

1. ~~Journal `000199` PU_BBER 405,000.00 → 40,500.00~~ **APPLIED TO DEV 2026-07-28 through §5 FIX-1; production pending.**
2. ~~Missing June entries PU_MSD 540.00 / MRET 1,519.10 / BRET 265.10~~ **SUPERSEDED by Round 2:** only PU_MSD may need a real PUR journal after source-document confirmation. MRET/BRET are derived sales-return report rows and must not be keyed as manual journals merely to feed this report (see Q11).
3. ~~Sales deltas (1-MNL +20/+146.00, 2-BCM3 +205/+3,499.00)~~ **CONFIRMED: DB is truth.**
4. ~~OTHERS row~~ **ANSWERED (C.1):** OTHERS = EMPTY_BAG + EMPTY_BAG(S) sales only, split 50/50 MEE/BIHUN. (SISA stays its own row.)
5. ~~Salary machine/packing (C.2)~~ User: derived from **account codes** in the formula pages (e.g. SALARY & WAGES = MBS_O+MBS_PK+MBS_TS+MBS_M+…), not directly from payroll. Verified: **no June journal postings exist for salary accounts** (Jan–May only, via IMP) → account-code route yields 0 for June. The payroll/JV bridge alone was within ~1%; Q12 subsequently proved the entire June residual is the posted levy. **Settled 2026-07-25: the source is the account codes, populated by the JVSL payroll voucher — no bridge, no fallback.**
6. ~~Machine repair split (C.3)~~ User's formula: MEE = `(MBRM+MBUM)/2 + MRM+MUM`; BIHUN = `(MBRM+MBUM)/2 + BRM+BUM`. Tested against June journals — **doesn't add up → Q13.**
7. ~~Accumulative seeds~~ **CONFIRMED:** MEE −166,900.31 / BIHUN 404,935.44 @ 2026-06-01.
8. ~~SMALL/BIG packing assignment~~ **CONFIRMED:** MEE BIG = {M14,M15,M16,M17,M20,M21,M28,M29,M31} (ids 56,58,59,60,63,66,64,65,57); BIHUN BIG = {B12,B13,B14,B15,B18A,B29,B31} (ids 79,81,82,85,84,83,80). The 0.30 June keyed typo was **corrected in dev by §5 FIX-2 on 2026-07-28**; production pending.
9. ~~SAGO family on CS_LS line~~ **CONFIRMED** (report implies it).
10. ~~P&L EXPENSES vs unit-cost residue (216.61/207.21)~~ **CLOSED AS FAR AS AVAILABLE EVIDENCE ALLOWS IN PHASE 3:** the legacy pages contradict one another and expose no P&L account breakdown; keep the internally auditable engine formula (§7.3/§9.3).

### Round 2 (answered by user 2026-07-24; **co-worker answers received 2026-07-25 — all three CLOSED**)

> **Q11 — CLOSED.** Co-worker: *"ini bahan tiada sudah kena guna untuk Mee… Dan tiada
> pembelian"* — Sodium Tripolyphosphate is no longer used for Mee and there was **no
> purchase**. So no PUR journal is to be keyed, and the printed June RM540.00 is a
> legacy-only figure our data will never reproduce. `PU_MSD`/`CS_MSD`/`OS_MSD` and the
> unit-cost SODIUM TRIPOLYPHOSPHATE row stay in the report and stay permanently 0.00,
> and must never raise a missing-data warning. **Permanent expected deltas:** unit-cost
> MEE ingredient row 540.00 → 0.00, MEE ingredients subtotal 65,641.64 → 65,101.64,
> MEE purchase total 50,440.00 → 49,900.00. No seed change was needed; the line `notes`
> now record the answer.
>
> **Q12 — CLOSED. Policy: journal-only, no payroll fallback.** Co-worker: the salary
> reference JV is the **"voucher generator"**, which holds all director and employee
> salaries; and *"I do not need to key in the levy JV for July 2026."* Verified in the
> DB: `location_account_mappings` maps the **JVSL** voucher (salary / overtime /
> epf_employer / socso_employer / sip_employer / bonus / commission) onto exactly the
> accounts the legacy formulas name — `MS_MM`/`ME_MM`/`MSC_MM`/`MBSIP_MM`,
> `MS_PM`/`ME_PM`/`MSC_PM`/`MBSIP_PM`, `BS_MB`/`BE_MB`/`BSC_MB`/`BSIP_MB`,
> `BS_PB`/`BE_PB`/`BSC_PB`/`BSIP_PB`, plus `MBS_*`/`MBE_*`/`MBSC_*`/`MBSIP_*` — and
> **JVDR** onto `MBDRS`/`MBDRE`/`MBDRSC`/`MBDRSIP`. It even reproduces the legacy
> formula's odd asymmetry (`MBSIP_MM` for mee vs `BSIP_MB` for bihun), which is strong
> independent confirmation that the seeded account sets are right. **Levy is not in the
> voucher mapping and stays manual — do not key it twice.** The report therefore just
> sums posted journal lines; nothing else is needed in Phase 2. See the ACTION in §7.
>
> **Q13 — CLOSED, formula confirmed verbatim.** Co-worker: *"MBRM + MBUM = 50%, MRM +
> MUM = 100%, MBRMB 50% tidak masuk dalam Machine Repair, Masuk dalam EXPENSES"* —
> which is **exactly what Phase 1 already seeded**, for both product lines
> (bihun uses `BRM`/`BUM` at 100%). `MBRMB` stays at 50% inside the EXPENSES row
> "REPAIR AND MAINTENANCE (BOILER)" and never in MACHINE REPAIR. No seed change needed.
> The remaining RM191.29 (MEE) / RM273.24 (BIHUN) difference against the June print is
> therefore **not** a formula problem — it is a June source-classification difference,
> and moves to Phase 3 parity (see §7).

*Items 11–13 below record the state before the co-worker replied. They are kept for the
audit trail and are SUPERSEDED by the answers above — do not act on them directly.*

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

### Round 3 (raised by the Phase 1 baseline replay, 2026-07-25 — not yet sent)

14. **June MEE small-packing stock is RM883.60 higher in the system than printed.**
    `CS_MPMS` seeds to 82,769.54 against a printed 81,885.94. The mapping is not at
    fault: the same membership reproduces `CS_MPMB`, `OS_MPMB`, `CS_BPMS` and `OS_BPMS`
    exactly and `OS_MPMS` to within RM0.08. This is a June keying difference on the MEE
    packing sheet, the same class as FIX-2, and needs a line-by-line comparison against
    the June source sheet. Do not adjust the mapping to close it.

15. ~~**VRE-DIESEL (LORI SALESMAN SAHAJA) is RM20.00 short.**~~ **CLOSED 2026-07-28 —
    co-worker answered and fixed it in production.** Rosa: *"Kurang key in RM40 di
    PV003/06, Bill amount RM 93..tapi Rosa key in RM53... Sekarang Rosa cari RM40 dia
    masuk apa account Ok jumpa sudah...Rosa key in CA_WA @ RM40, sudah ubah sini...boleh
    check balik sana"*. Root cause confirmed against the dev DB: the journal is
    **PCE003/06** (C-type, id 2963, 2026-06-10, total RM10,258.65) — line 16 debits
    `OIL6389` **RM53.00** for a PETRON MININTOD bill (23/05/2026) whose real amount was
    **RM93.00**, and line 67 parks the balancing **RM40.00 on `CA_WA`** with blank
    particulars. Rosa re-pointed the RM40 in **production**; the six-vehicle salesman
    diesel pool gains exactly RM40.00, i.e. **+RM20.00 per product line after the 50%
    split — precisely the Q15 delta.** The dev DB still holds the unfixed rows (CA_WA
    40.00 + OIL6389 53.00), so the verifier keeps showing this delta until the next
    production→dev refresh; re-run `verify-estimated-report.mjs` after that refresh and
    expect the VRE-DIESEL/SALESMAN rows to go exact. *(Original analysis: the six-vehicle
    salesman set (2962, 6893, 6389, 4688, 9901, 1016) is proven correct by its sister
    row — VRE-OTHERS lands on 357.20 exactly only because `R9901` is included. With the
    same six vehicles VRE-DIESEL gave 1,065.85 against a printed 1,085.85.)*

~~**Fixture-metadata handoff note:** the JSON still used superseded PU_MSD/MRET/BRET and
payroll labels.~~ **DONE IN PHASE 3:** the printed amounts remain intact, while the
metadata now records Q11/Q12, confirmed packing membership, the corrected `MTH11` code,
and the applied dev data fixes.

### 2.1 Bahasa Melayu messages

Q11 / Q12 / Q13 were **sent and answered** (answers above); kept for the record.
Q14 is **still to send**. Q15 was **answered directly by the co-worker on 2026-07-28**
(Rosa found and fixed the RM40 mis-keying in production — §2 item 15), so its message
below was never sent and stays for the record only.

**Q11 — PU_MSD RM540** *(answered: no purchase, material discontinued)*

> Hi, boleh tolong semak pembelian Sodium Tripolyphosphate (PU_MSD) RM540 untuk Jun
> 2026? Amaun ini ada dalam Estimated Report lama tetapi belum ada jurnal dalam sistem.
> Kalau memang ada pembelian sebenar dan belum direkod di akaun lain, tolong key jurnal
> PUR: debit PU_MSD RM540 dan kredit akaun supplier yang betul, guna tarikh, nombor
> invois/rujukan dan butiran ikut dokumen asal. Lepas key, tolong bagi saya tarikh,
> rujukan dan akaun supplier yang digunakan. Kalau sebenarnya sudah direkod di akaun
> lain, jangan key lagi supaya tidak duplicate — bagitahu saya dahulu. Sekali boleh
> confirm ya, bahan ini memang sudah tidak digunakan lagi sekarang?

**Q12 — jurnal gaji Jun** *(answered: salaries come from the JVSL voucher generator)*

> Hi, nak confirm jurnal gaji untuk Estimated Cost Jun 2026. Jurnal levy `JV26/06/07`
> sudah ada dalam sistem: Mee Mesin RM146.09, Mee Packing RM117.90, Bihun Mesin
> RM187.61 dan Bihun Packing RM193.05. Jadi levy ini tak perlu key lagi supaya tidak
> duplicate. Tetapi saya masih tak jumpa posting Jun untuk akaun gaji, KWSP majikan,
> SOCSO majikan dan SIP majikan bagi Mesin/Packing. Adakah jurnal gaji dan caruman Jun
> ini masih belum key in? Kalau belum, boleh tolong key ikut jumlah sebenar payroll dan
> pecahan akaun Mee/Bihun Mesin/Packing yang betul, kemudian bagi saya nombor rujukan
> jurnal? Kalau sebenarnya sudah direkod dalam jurnal atau akaun lain, boleh share
> rujukan itu dahulu supaya kami tidak duplicate.

**Q13 — Machine Repair** *(answered: formula confirmed exactly as seeded)*

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

**Q14 — stock plastik kecil Mee Jun**

> Hi, boleh tolong semak stock plastik kecil (SMALL PLASTIC-MEE) bagi Jun 2026? Ikut
> sistem jumlahnya RM82,769.54, tetapi laporan lama tunjuk RM81,885.94 — beza
> RM883.60. Untuk Mei jumlahnya hampir sama (beza RM0.08 sahaja), dan plastik besar Mee
> serta plastik kecil/besar Bihun pula padan tepat, jadi masalahnya cuma pada key-in
> bulan Jun. Boleh tolong banding senarai stock plastik kecil Mee Jun satu per satu
> dengan borang asal, dan bagitahu item mana yang tersalah kuantiti atau harga? Terima
> kasih.

**Q15 — diesel lori salesman Jun** *(answered 2026-07-28: PCE003/06 bill RM93 keyed as
RM53 on OIL6389, the missing RM40 parked on CA_WA; Rosa re-pointed it in production —
§2 item 15. Message below never sent, kept for the record.)*

> Hi, nak semak diesel untuk lori salesman bulan Jun 2026. Ikut jurnal, diesel untuk
> lori salesman (SAB2962, SAB6893, SAB6389, SAB4688, SAB9901Y, SD1016T) berjumlah
> RM2,131.70, jadi 50% ialah RM1,065.85. Tetapi laporan lama tunjuk RM1,085.85, bermakna
> ada lagi RM40.00 yang belum masuk. Boleh tolong semak sama ada ada satu resit diesel
> lori salesman Jun yang belum key in, atau yang tersalah masuk ke lori/akaun lain?
> Terima kasih.

---

## 3. Phase checklist

- [x] **Phase 0 — Fixtures & handover** (2026-07-23): PDF + page PNGs +
      `expected-june-2026.json` + README in `dev/import/closing-stock-report/`; this doc.
- [x] **Phase 1 — Migration** (2026-07-25): `dev/migrations/2026-07-25_estimated_report_foundation.sql`
      creates and seeds `estimated_report_lines`, `estimated_report_line_sources`,
      `estimated_report_inputs`, `estimated_report_anchors`; AGENTS.md/CLAUDE.md schema
      updated (88 → 92 tables). Applied to the dev DB and verified idempotent. See §6.
- [x] **Phase 2 — Backend** (2026-07-25): `src/routes/stock/estimated-report-engine.js`
      (computation) + `src/routes/stock/estimated-report.js` (router) mounted
      `/api/estimated-report` in `src/routes/index.js`. Report data, Add Back
      GET/PUT, mappings GET/PUT + options, journal formula evaluation, sales-return
      mapping, multi-month ACCUMULATIVE. Salary is journal-only, as Q12 settled.
      See §8.
- [x] **Phase 3 — Parity verification** (2026-07-28):
      `dev/import/closing-stock-report/verify-estimated-report.mjs` runs the shipped
      engine against the June fixture and guards all atomic/derived values; §5 fixes
      applied to dev and proven idempotent; Q10 reconciled as an irreducible legacy
      page-to-page discrepancy; Q14/Q15 explicitly deferred per the user. See §9.
- [x] **Phase 4 — Frontend** (2026-07-28): `src/pages/Stock/Reports/EstimatedReportPage.tsx`,
      nav "Reports" group in `src/pages/TienHockNavData.tsx` (`/stock/reports/estimated`),
      drilldowns (join on the engine-emitted `lineId`), Add Back input, mappings modal
      (`src/components/Stock/EstimatedReportMappingModal.tsx`). Renders live API/engine
      values only; fixture targets remain verifier references. **Authorization decision
      (user, 2026-07-28): the report is for ALL logged-in staff** — no boss-only rule,
      so the existing global `authMiddleware` is the whole policy and the nav item is
      visible to everyone. Changelog entry shipped with the page. See §10.
- [ ] **Phase 5 — PDF printing**: `src/utils/stock/EstimatedReportPDF.tsx` via
      `printPdfBlob` (P&L + unit cost pages per product line). Full handoff in §11.
- [ ] **Phase 6 — Wrap-up**: apply any evidence-backed Q14/Q15 corrections received,
      production migration rollout, changelog entry,
      AGENTS.md/CLAUDE.md updates, bug-scan offer.

## 4. Progress log

- 2026-07-28 — **Post-Phase-4 UI fixes (user feedback).** (1) The mappings modal's
  `SearchableCombobox` rendered every matching option with no cap, so the account
  picker mounted ~600 options at once and stalled the page; it now renders at most
  50 with a "type to narrow down" hint (same idea as `AccountCodeCombobox`'s
  load-increment). (2) The Add Back input existed but was an unlabeled box with no
  placeholder in the P&L footer — the user could not find it. It is now a
  highlighted sky panel labelled ADD BACK with a `0.00` placeholder and a hint,
  sitting between P/L and FINAL P/L. **Handover prepared for Phase 5 (§11)** the
  same day; Phase 5 starts in a fresh session.
- 2026-07-28 — **Phase 4 done.** Frontend shipped: the report page
  (`/stock/reports/estimated`, Stock → Reports nav group), the mappings modal,
  drilldowns joined on the engine's `lineId`, the Add Back input, and the changelog
  entry. **Authorization resolved by the user: all logged-in staff** — no boss-only
  guard was added anywhere. Verified the page's TypeScript interfaces field-by-field
  against `estimated-report-engine.js`'s actual response. One API limitation found:
  a line's `notes` cannot be cleared through `PUT /mappings/:lineId` (the router's
  `COALESCE` keeps the old value on null) — setting/changing works. See §10.
- 2026-07-28 — **Q15 CLOSED (co-worker fix in production).** Rosa traced the missing
  RM40.00 in the salesman diesel pool to **PCE003/06** (C journal id 2963,
  2026-06-10): a PETRON MININTOD bill of RM93.00 was keyed as RM53.00 on `OIL6389`
  (line 16) and the balancing RM40.00 was parked on `CA_WA` (line 67, blank
  particulars). She re-pointed the RM40 in **production**; the six-vehicle pool gains
  RM40.00 = +RM20.00 per product line after the 50% split, exactly the Q15 delta.
  Verified against dev that the pre-fix rows are as described; dev itself is
  deliberately left unfixed, so the dev verifier keeps reporting the VRE-DIESEL /
  SALESMAN delta until the next production→dev refresh, after which
  `verify-estimated-report.mjs` must show those rows exact. **Phase 4 started** the
  same day, without waiting for Q14.
- 2026-07-28 — **Phase 3 done.** Added the standalone June parity verifier, which
  imports the production engine directly, forces the Kuala Lumpur invoice window,
  compares money in sen and units at six decimals, exercises both handwritten Add
  Back values inside an always-rolled-back transaction, and fails on any difference
  outside the documented atomic delta set. Post-fix result: **392 exact checks / 70
  expected direct-and-cascading deltas / 0 failures / 11 explanatory notes**. Applied
  `2026-07-28_estimated_report_parity_data_fixes.sql` to dev: journal `000199` is now
  RM40,500.00 and B14 June stock row 171 is RM282.20; a second run proved the exact
  no-op path. Refreshed fixture metadata and the DB notes in AGENTS.md/CLAUDE.md.
  Q10 cannot be derived from the surviving legacy P&L pages, so the internally
  consistent live formula remains authoritative (§9.3). Production is untouched.

- 2026-07-25 — **Phase 2 done.** Backend engine + router delivered and verified
  against the June fixture (§8). No schema, journal, stock, sales or payroll row was
  touched, and no data was keyed. **Root-caused the long-standing "sales deltas":
  they were a UTC month-window artefact — on the correct Asia/Kuala_Lumpur window
  both product lines hit the printed SALES total exactly.** `expected-june-2026.json`
  metadata was corrected accordingly (the superseded Q11/Q12 labels too). Test
  fixtures cleaned up: the ten `pages/cs-p*.png` renders were deleted (regenerable
  from the PDF, and the transcription has no `ocr_uncertain` values left); the source
  PDF and the JSON stay until Phase 3 signs off.
- 2026-07-23 — Plan approved. All 10 pages transcribed and reverse-engineered; the
  June figures originally marked `verified_db` in the fixture were reproduced (see §1).
  Phase 0 done; later live-source/formula deltas are tracked in Q11–Q13.
- 2026-07-23 — Round-1 Q&A: user answered all 10 questions (see §2). Verified C.2/C.3
  against the DB (doesn't fully add up → Q12/Q13), root-caused the 0.30 (Q8 → FIX-2),
  confirmed PUR leg conventions and that PU_MSD/MRET/BRET have no posting history
  (→ Q11). User: Phase 1 implementation goes to GPT 5.6 Sol; SQL fixes below are
  approved but NOT yet applied.
- 2026-07-25 — **Q12 fully verified against fresh production data.** A production DB
  import brought `JVSL/06/26` into dev (the voucher had only ever existed in prod, which
  is why dev showed zero salary). The Phase 1 tables, seed and every material/product/
  account reference survived the import untouched, and the stock replay is identical to
  before. **All twelve journal-derived payroll rows now equal the printed June figures to
  the cent**, and the salesman group's only remaining difference is Q15's RM20.00. The
  EXPENSES residual collapsed from −34,325.94 to +20.91. Nothing in the schema or seeds
  needed changing. Added a deployment/DB-refresh note to §7.1.
- 2026-07-25 — **Q11/Q12/Q13 answered and closed.** No mapping or formula change was
  needed: Q13's confirmed formula is exactly what Phase 1 had already seeded, and Q11
  confirms `PU_MSD` is permanently zero. Q12 resolved the last policy question —
  **journal-only, no payroll fallback** — after verifying that `location_account_mappings`
  wires the JVSL/JVDR voucher generator onto precisely the legacy formula accounts. The
  migration was amended in place (line `notes` only, no schema or mapping change) and
  re-applied. Root cause of the salary gap identified: **no JVSL voucher has ever been
  generated**, for any month. Open items consolidated into the new §7.
- 2026-07-25 — **Phase 1 done.** Schema + seeds applied to dev (135 lines, 447 source
  members); no data, journal, stock or sales row was touched. Every legacy formula
  account code from pages 3–8 was checked against `account_codes` — **all exist**, so
  there is nothing to report back on missing codes. The seeded mappings were replayed
  against June/May data and reproduce the printed stock, kilang and purchase figures
  exactly, apart from the deltas tabulated in §6.2. Two mapping assumptions and four
  legacy-formula quirks are recorded in §6.3/§6.4 for the co-worker round. The §5 data
  fixes are still **NOT applied** — they belong to Phase 3 parity work.
- 2026-07-24 — Round-2 Q&A only; **no Phase 1/code/data changes made**. PU_MSD remains
  an optional formula account, with its printed June RM540 pending source confirmation.
  MRET/BRET are now mapped to physical sales returns rather than manual journals; the
  current June source deltas are documented in Q11. The four salary gaps were fully
  reconciled to the existing levy journal, while the remaining salary journal/fallback
  policy awaits co-worker confirmation. MBRMB is confirmed once
  in the shared 50/50 expense pool; the separate machine-repair split remains open.

## 5. Approved data fixes — APPLIED TO DEV 2026-07-28; PRODUCTION PENDING

Canonical migration: `dev/migrations/2026-07-28_estimated_report_parity_data_fixes.sql`.
It runs both corrections in one serializable transaction, locks the exact rows, accepts
only the complete old or complete final state, rejects partial/drifted data, asserts
row counts and runs postflight checks. The first dev run applied both changes; a second
run completed as an exact no-op. These are data corrections only — no schema/table-count
change. Apply the same migration to production before the report ships.

### FIX-1 — DONE IN DEV (approved A.1): journal `000199` PU_BBER 405,000.00 → 40,500.00

Journal id 3902, entry_type PUR, 2026-06-22, manual (source_type NULL — no source
rebuild can overwrite the edit). Particulars `300BAG XRM135` prove 40,500.00. The
guarded migration corrected both `PU_BBER` / `CR_PN` lines and the cached header totals;
the June `PU_BBER` report row is now **130,631.40**, matching the print exactly.

### FIX-2 — DONE IN DEV (approved B.3): June bihun packing B14 unit cost 282.50 → 282.20

`material_stock_entries` id 171 (2026/6, bihun, material 82 = B14, variant 118 =
`8.50 x 33.2KG (SG)`): 1 bag × 8.50/kg × 33.2 kg = **282.20**, keyed as 282.50. May used
282.20 for the same variant. This single typo explains the whole 0.30: after the fix,
June BIHUN BIG packing = 16,891.45 ✓ and total packing = 47,886.59 ✓ (both match the
legacy print exactly; SMALL was already exact at 30,183.94 + tape 811.20).

**Connected limitation (not changed without separate approval):** variant 118's
`material_variants.default_unit_cost` is still 282.50. The stock API can reuse that
fallback for a future month with no saved row, so the typo could recur. The approved
FIX-2 named June row 171 only; Phase 3 deliberately did not widen that data change.

### RESOLVED — NO journal to be created: PU_MSD RM540.00

**Closed 2026-07-25.** The co-worker confirmed the material is no longer used for Mee
and that **no purchase exists** (*"ini bahan tiada sudah kena guna untuk Mee… Dan tiada
pembelian"*). No PUR journal is to be keyed — doing so would invent a transaction. The
printed June RM540.00 stays a legacy-only figure; `PU_MSD` and the `MSD` stock line
remain in the report at a permanent 0.00 and must never raise a missing-data warning.

MRET/BRET are explicitly removed from this pending-journal list. They are mapped from
sales `returnproduct × invoice-line price` as described in Q11; manual return journals
would risk double-counting.

---

## 6. Phase 1 — delivered schema, verified baseline, and open assumptions

Migration: `dev/migrations/2026-07-25_estimated_report_foundation.sql` (applied to dev
2026-07-25, re-run clean → idempotent). It creates schema and mappings ONLY: no journal
is posted, and no sales / stock / journal / payroll row is modified.

### 6.1 Schema as built (differs from the Phase-1 sketch — read this)

Four tables, not five. Column detail lives in CLAUDE.md/AGENTS.md; the two deliberate
departures from the original plan are:

- **`estimated_report_expense_rows` was not created.** Expense rows are ordinary
  `estimated_report_lines` (`page='unit_cost'`, `section='expenses'`). A separate table
  would have duplicated the same shape for no gain.
- **`estimated_report_line_materials` became `estimated_report_line_sources`.** A report
  line's members are not only materials — they are also account codes, products, product
  types and other lines. One polymorphic child table with a `source_type` discriminator
  and a shape CHECK (the existing `receipt_allocations` pattern) replaces what would have
  been four near-identical child tables, and gives Phase 4 a single mappings surface.

Three structural decisions worth knowing before Phase 2:

1. **CS and OS are one row.** `estimated_report_lines.section='stock'` carries
   `code`/`description` (closing) plus `opening_code`/`opening_description`, with a CHECK
   that only stock rows have them. Opening stock of month M *is* closing stock of month
   M−1, so one mapping serves both and they cannot be edited out of sync.
2. **`product_line='shared'` expresses the legacy 50/50 split.** A MEE report reads
   `product_line IN ('mee','shared')`. The split itself lives in
   `estimated_report_line_sources.percentage` (50.00 shared-pool, 100.00 product-specific
   such as `MTRA`/`BTRA`, `MS_SM`/`BS_SM`, `MRM`/`BRM`). This is why the shared expense
   pool is seeded once, not twice.
3. **`source_kind` on the line says how to evaluate it**, `sign` on the member says
   whether it adds or subtracts. `stock_flow` rows (the 16 unit-cost ingredient/packing
   rows) are pure line references: a referenced *stock* line contributes
   `opening − closing`, a referenced *purchase* line contributes its amount. All 16
   legacy formulas collapse to that shape with no exceptions.

Seeded volume: 135 lines / 447 source members —
pl.stock 23/86, pl.purchase 20/20, pl.product 8/10, unit_cost.expenses 47/160,
unit_cost.salesman 8/68, unit_cost.habuk 5/32, unit_cost.ingredient 10/27,
unit_cost.packing 6/12, unit_cost.salary 4/20, unit_cost.machine_repair 2/8,
unit_cost.production 2/4.

**Every account code printed on formula pages 3–8 exists in `account_codes`.** There is
nothing missing for the user to create. (`OILBFORK` is the one code the legacy VRE-DIESEL
formula omits relative to its sister formulas — and no such account exists, so the
omission is correct, not a transcription gap.)

### 6.2 Phase 1 pre-fix baseline replay: seeded mappings vs the printed June report

Replayed straight from the seeded tables against June (closing) / May (opening) data.
Everything not listed below is **exact**: BERAS 194,663.40 / 208,934.50, JAGUNG
21,546.00 / 38,829.00, CS_LS 67,370.40 / OS_LS 57,072.30, both kilang lines,
CS_MPMB 23,461.25 / OS_MPMB 27,531.25, CS_BPMS 30,183.94 / OS_BPMS 45,167.88, both
selotape lines, all TEPUNG/GARAM/SODA lines, `PU_BJAG` 17,280.00, `PU_BSAG` 107,580.00,
`PU_MTEP` 49,900.00, `BTRA` 509.00, and production 20,691 / 30,092 bags.

| Row | Seeded mapping gives | Printed | Delta | Status |
|---|---|---|---|---|
| `CS_MPMS` (June MEE small packing) | 82,769.54 | 81,885.94 | **+883.60** | NEW — see below |
| `OS_MPMS` (May MEE small packing) | 85,789.29 | 85,789.37 | −0.08 | keying noise |
| `CS_BPMB` (June BIHUN big packing) | 16,891.75 | 16,891.45 | +0.30 | FIX-2 applied to dev in Phase 3 |
| `PU_BBER` | 495,131.40 | 130,631.40 | +364,500.00 | FIX-1 applied to dev in Phase 3 |
| MEE MACHINE REPAIR | 4,391.59 | 4,200.30 | +191.29 | Q13 formula CLOSED; residual = source classification |
| BIHUN MACHINE REPAIR | 2,045.98 | 2,319.22 | −273.24 | Q13 formula CLOSED; residual = source classification |
| EXPENSES line (MEE) | 63,750.73 | 63,729.82 | +20.91 | Q12 CLOSED; small payroll residual — see below |
| EXPENSES line (BIHUN) | 64,259.73 | 64,238.82 | +20.91 | Q12 CLOSED; same residual |
| `PU_MSD` | 0.00 | 540.00 | −540.00 | Q11 CLOSED — permanent, expected, correct |
| VRE-DIESEL (LORI SALESMAN SAHAJA) | 1,065.85 | 1,085.85 | −20.00 | Q15 CLOSED 2026-07-28 — RM40 mis-key fixed in production; dev retains the delta until the next prod→dev refresh |

**Re-verified 2026-07-25 after a fresh production DB was imported into dev, which brought
the June `JVSL/06/26` payroll voucher (RM181,699.10, posted) with it.** The Phase 1
tables and seed survived the import intact (135 lines / 447 members / 2 anchors) and
every material, variant, product and account reference still resolves — the stock replay
is byte-identical to the pre-import run. **All twelve journal-derived payroll rows now
land on the printed June figures exactly:**

| Row | Ours | Printed |
|---|---|---|
| MEE SALARY MACHINE / PACKING | 17,068.69 / 14,551.85 | identical ✓ |
| BIHUN SALARY MACHINE / PACKING | 28,793.96 / 22,390.70 | identical ✓ |
| SALARY SALESMAN (MEE / BIHUN) | 7,414.01 / 7,414.03 | identical ✓ |
| SALARY IKUT LORI (MEE / BIHUN) | 5,374.34 / 5,374.35 | identical ✓ |
| SALARY JAGA API / SALARY HABUK | 2,605.06 / 0.00 | identical ✓ |
| STAFF MESSING / BURNING MATERIALS | 1,287.00 / 1,943.90 | identical ✓ |

Subtotals follow: MEE salary 31,620.54 ✓, BIHUN salary 51,184.66 ✓, habuk 4,548.96 ✓.
The salesman subtotal is 15,498.40 / 15,498.43 against a printed 15,518.40 / 15,518.43 —
**the entire group delta is Q15's RM20.00 and nothing else.** This is decisive
confirmation that the seeded account sets, the 50/100 percentage split and the
journal-only policy are all correct.

The EXPENSES residual shrank from −34,325.94 to **+20.91** (both lines identically, so
still entirely inside the shared pool = +RM41.82 before the 50% split). Its whole source
is the four JVSL-fed rows, which post RM68,693.70 where the print implies RM68,651.88:
SALARY & WAGES 62,325.05, EPF 5,321.00, SOCSO 951.55, SIP 96.10. No `_PK` (PEKEBUN)
account has a June posting, so the legacy formula's omission of `MBSIP_PK` costs nothing
this month. RM41.82 on RM68,693.70 is 0.06% and is almost certainly a payroll figure that
moved after the legacy report was printed — now an explicitly gated Phase 3 delta, not
a mapping fault.
It is unrelated to Q15 (different account families; 41.82 ≠ 40.00).

Three results are worth stating plainly:

- **The packing SMALL/BIG membership rule is correct.** Q8's BIG sets reproduce
  `CS_MPMB`, `OS_MPMB`, `CS_BPMS` and `OS_BPMS` exactly, and `OS_MPMS` to within RM0.08.
  The **RM883.60 on June `CS_MPMS` is therefore a June keying difference, not a mapping
  error** — it is the same class of problem as FIX-2 and should be chased the same way
  (compare the June MEE packing sheet line by line). It was not previously quantified.
- **The EXPENSES gap was identical to the cent on both product lines**, which proved the
  whole shortfall sat in the *shared* 50% pool and none of it in the product-specific
  transportation members — i.e. RM68,651.88 of June payroll expense missing from
  `MBS_*`/`MBE_*`/`MBSC_*`/`MBSIP_*`. **Root cause: the `JVSL` payroll voucher existed
  only in production, never in dev.** Jan–May salary reached these accounts through the
  legacy `IMP` import (RM103k–110k/month); dev's June had only the manual levy JV plus
  `JVDR/06/26`. Once the production DB was imported, `JVSL/06/26` arrived and every
  salary row snapped to the printed value — resolved, see the re-verification above.
- **The salesman VRE-OTHERS set is confirmed to run past the scan's right-margin cut.**
  Including vehicles `9901` and `1016` makes June land on 357.20 exactly
  (`R6389` 509.60 + `R6893` 197.60 + `R9901` 7.20 = 714.40 × 50%). The companion
  VRE-DIESEL row is nonetheless RM20.00 short (RM40.00 in the pool) with the same six
  vehicles, and no June `OIL*` posting accounts for RM40.00 — **new, unexplained, and
  worth adding to the co-worker round.**

### 6.3 Mapping assumptions the co-worker should confirm

Both are unverifiable from data (the materials have no entries in any month), so the seed
records a defensible choice rather than leaving stock able to vanish silently:

- **`M23D` "Stork W - Johor Bahru" → `CS_MTEP3`/`OS_MTEP3` (STORK W).** Mapped on the
  label match. `MTEP3` currently resolves entirely from `M23` "Flour - Lahad Datu", which
  is what reproduces the printed 7,486.08 / 14,392.88.
- **`B18` "Tepung Beras 25KG" is deliberately left UNMAPPED.** It has no obvious legacy
  line (the BIHUN report has no rice-flour row), and guessing `BBER` would silently
  inflate BERAS. If it is ever keyed it will not appear in the report until mapped.

Also seeded on the same reasoning: `SODIUM_TRIP`→`MSD`, `JAGUNG_1..4`→`BJAG`,
`SODIUM_2`/`B1`→`BSDM`, `TH2`/`TH2_2`→`BTH2`, `BERAS`→`BBER`, `SAGO`→`BSAG`, and the
generic `PM_SMALL`/`PM_BIG`/`SELOTAPE` materials into the small/big/tape lines of both
buckets. The inactive pre-system materials (`GARAM`, `GARAM_2`, `TH1`, `SODA_ASH_1/2`,
`TEPUNG`) are intentionally not mapped — they are superseded and have never been keyed.

### 6.4 Legacy-formula quirks preserved as printed (do not "fix" in Phase 2)

- **`MBKH` is counted twice**, at 50% each: once inside EXPENSES row 23 "REPAIR AND
  MAINTENANCE (BOILER)" (`MBRMB+PU_CHEM+MBKH`) and again as the HABUK group's "BURNING
  MATERIALS (HABUK/KAYU)" (`MBKH`). June: RM1,943.90 lands in both. Q13 confirmed
  `MBRMB` belongs in EXPENSES but said nothing about `MBKH`; keeping the double count
  is also what best fits the printed June EXPENSES total (it leaves the small ~RM216.61
  / ~RM207.21 residue of Q10 rather than a ~RM1,727 one). Seeded as printed — flag it to
  the boss rather than silently deduplicating.
- **SIP omits `MBSIP_PK`** while SALARY & WAGES, EPF and SOCSO all include their `_PK`
  (PEKEBUN) member. Seeded as printed.
- ~~**The fixture JSON called the TH-1 stock code `CS_MTHT1`/`OS_MTHT1`.**~~ **FIXED IN
  PHASE 3:** fixture metadata now uses the printed/seeded `CS_MTH11`/`OS_MTH11` codes.
- The `PU_MSD` purchase line and the `MSD` stock line carry an explicit "permanently
  zero — never warn" note in `estimated_report_lines.notes` (Q11 answered: material
  discontinued for Mee, no purchase exists or is expected).

---

## 7. What is still open

**Nothing blocks Phase 4.** The report is journal-only with no fallback policy left to
decide, every mapping is seeded, and the Phase 3 parity gate is green (§9).

### 7.1 Actions

- ~~Generate and post the June 2026 `JVSL` payroll voucher.~~ **DONE 2026-07-25** — it
  already existed in production; the dev DB simply did not have it. A fresh production
  import brought `JVSL/06/26` (RM181,699.10, posted) into dev and all twelve payroll rows
  now match the print exactly. No voucher needs generating.
- ~~**Apply the §5 data fixes to dev.**~~ **DONE 2026-07-28** through the guarded
  `2026-07-28_estimated_report_parity_data_fixes.sql`; rerun verified idempotent.
  Production application remains a Phase 6 deployment action.
- **Deployment / DB-refresh note:** `dev/migrations/2026-07-25_estimated_report_foundation.sql`
  must be applied to **production** before the report ships, and **re-applied after any
  production→dev database import** if that import ever drops the `estimated_report_*`
  tables. The 2026-07-25 import left them intact and every material/variant/product/account
  reference still resolved, but that is not guaranteed for future imports. The migration is
  idempotent, so re-running it is always safe — note only that re-running **resets the
  seeded mappings to their defaults**, discarding later edits made through the Phase 4
  mappings modal.
- **Production rollout:** also apply
  `dev/migrations/2026-07-28_estimated_report_parity_data_fixes.sql` before exposing the
  report. It is safe to rerun and aborts on any state other than the exact old/final rows.

### 7.2 Questions still to ask the co-worker

- **Q14** — June MEE small-packing stock is RM883.60 higher than the print. Mapping is
  proven correct; needs a line-by-line check of the June MEE packing sheet.
- ~~**Q15** — VRE-DIESEL (LORI SALESMAN SAHAJA) is RM20.00 short (RM40.00 in the pool) and
  no June `OIL*` posting explains it.~~ **CLOSED 2026-07-28** — Rosa traced it to
  PCE003/06 (bill RM93 keyed as RM53 on `OIL6389`, the RM40 balance parked on `CA_WA`)
  and re-pointed the RM40 in production; see §2 item 15. The dev DB still shows the
  unfixed rows until the next production→dev refresh.

Q14 has a ready-to-send Bahasa Melayu message in §2.1 (the Q15 message was never
needed and is kept for the record).

**Deferred-fix protocol (user decision, 2026-07-28):** the answers to Q14/Q15 are NOT
required before Phase 3 and may arrive at any time — during any phase or after
Phase 6 wrap-up. Both are pure source-data corrections with no engine, mapping,
frontend or PDF impact: the report derives every value live, so fixing the source
data automatically corrects the report on the next run. When the user @-references
this handover with the co-worker's answers, the workflow is:

- **Q14** — identify the mis-keyed June MEE small-packing row(s) from the answer and
  correct `material_stock_entries` for year 2026 / month 6 (target delta:
  −RM883.60 on the `CS_MPMS` bucket). Key the correction into June 2026 itself,
  NOT the current month, and note that it shifts June closing stock and therefore
  every later month's derived opening stock by the same amount.
- ~~**Q15** — key the missing RM40.00 June diesel posting (or reclassify the
  mis-posted one) onto the correct salesman-lorry `OIL*` account(s) with a June
  2026 date, per the co-worker's evidence; target delta: +RM20.00 per product line
  after the 50% split.~~ **DONE 2026-07-28 by the co-worker directly in production**
  (PCE003/06: the RM40 was re-pointed off `CA_WA` onto the diesel account — §2 item
  15). No migration or code change from our side was needed; the report picks the
  correction up live. The dev DB is intentionally untouched, so the dev verifier
  still reports this delta until the next production→dev refresh.
- After either fix, re-run `verify-estimated-report.mjs` and update the Phase 3
  delta table (§9.2) plus this section to close the item.

### 7.3 Phase 3 conclusions / remaining legacy-source deltas

- **Q10 — reconciled as an irreducible legacy page-to-page discrepancy.** The printed
  unit-cost groups sum to 119,618.02 MEE / 137,810.09 BIHUN, while the standalone P&L
  EXPENSES figures are 119,401.41 / 137,602.88: gaps of **+216.61 / +207.21**. Pages
  3–8 define only the unit-cost formula; pages 1–2 expose no account breakdown for the
  P&L footer. Rounding, the known `MBKH` double count, SIP omission and vehicle quirks
  cannot produce these gaps. The engine therefore preserves the auditable invariant
  `P&L EXPENSES = salary + salesman + habuk + expense pool + machine repair`; no hidden
  adjustment or journal mutation was invented. Closing Q10 further would require the
  original legacy P&L configuration/account breakdown.
- **EXPENSES payroll residual** — +RM20.94 on both visible lines (+RM41.82 raw shared
  pool plus RM0.03 visible-row rounding), 0.06% of the RM68,693.70 the JVSL voucher
  posts to SALARY & WAGES / EPF / SOCSO / SIP. Almost certainly a payroll snapshot
  that changed after the legacy report was printed.
- **Q13 residual** — engine-minus-print is **+RM191.29 MEE / −RM273.24 BIHUN** on
  MACHINE REPAIR. The formula is
  now confirmed, so this is a June source-classification difference between the legacy
  system and ours. Net across both lines is only RM81.95; the `MBRM`/`MRM`/`BRM` June
  lines are all small itemised purchases, and no single line or clean subset matches the
  deltas, so this needs the legacy breakdown rather than more DB digging.
- **MRET/BRET** — MEE −RM1.30 / BIHUN +RM3.20 versus the print (Q11, Round 2). These
  are genuine and are NOT affected by the month-window fix below.
- ~~**Sales deltas** — 1-MNL +20 bags/+RM146.00 and 2-BCM3 +205 bags/+RM3,499.00.~~
  **CLOSED 2026-07-25 — there is no delta.** Round 1 concluded "the DB is truth, the
  print is stale"; that conclusion was wrong. Both figures came from deriving the
  invoice month with `DATE(TO_TIMESTAMP(createddate/1000))`, which the UTC database
  session evaluates 8 hours behind KL and which therefore swallows the first eight
  hours of 1 July. On the correct Asia/Kuala_Lumpur epoch-ms window (what
  `/api/invoices/sales/products` already uses, and what the engine uses) 1-MNL is
  16,943 / RM121,393.50 and 2-BCM3 is 18,564 / RM307,748.10 — **exactly as printed**,
  and both P&L SALES totals land on the print to the cent. See §8.3.

### 7.4 Low-stakes confirmations (nice to have, not blocking)

- The two mapping assumptions in §6.3 (`M23D` → `MTEP3`; `B18` deliberately unmapped).
  Neither material has ever been keyed, so nothing is affected today.
- Whether the boss is happy that `MBKH` is counted twice by the legacy formulas (§6.4).

---

## 8. Phase 2 — delivered backend

Two new files, one new mount. **No schema change, no migration, no data written** —
the report reads and derives only.

- `src/routes/stock/estimated-report-engine.js` — all SQL and all arithmetic, with no
  Express dependency, so the Phase 3 verifier can import it directly.
- `src/routes/stock/estimated-report.js` — the router.
- `src/routes/index.js` — mounted at `/api/estimated-report` behind the global
  `authMiddleware`. ~~**Known authorization limitation:** every authenticated user can
  currently call it; hiding the Phase 4 nav item does not make the report boss-only.
  Kimi must obtain the user's intended boss identity/role rule and enforce it at the
  route/API layer before production exposure.~~ **RESOLVED 2026-07-28: the user decided
  the report is for ALL logged-in staff**, so the global `authMiddleware` is the
  intended policy and no role guard exists by design.

### 8.1 API surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/estimated-report?year=&month=[&productLine=mee\|bihun]` | The whole report: both pages, both product lines unless filtered |
| GET | `/api/estimated-report/inputs?year=&month=` | Keyed Add Back rows for a month |
| PUT | `/api/estimated-report/add-back` | Upsert `{ productLine, year, month, addBack, notes }` |
| GET | `/api/estimated-report/mappings` | All 135 lines with their resolved source members (material/variant/account/product names included) |
| GET | `/api/estimated-report/mappings/options` | Pickable materials (+variants), account codes, products, product types, stock buckets and referenceable P&L lines |
| PUT | `/api/estimated-report/mappings/:lineId` | Replace one line's members atomically; optional `isActive` / `notes` |

Response shape, per product line: `pl` (products / closingStock / openingStock /
purchases / returns, their totals, `usage`, `gross`, `expenses` + `expenseBreakdown`,
`profitLoss`, `addBack`, `finalProfitLoss`, `accumulative`), `unitCost` (`bagsSold`,
`sales`, `production`, the six cost `groups` each with rows + subtotal,
`totalBeforeRepair`, `machineRepair`, `total`, `addBack`, `finalUnitCost`), plus
`anchor`, `monthlyTrail` and `warnings`.

### 8.2 Phase 2 baseline — historical pre-fix snapshot

This table records the state before Phase 3 applied FIX-1/FIX-2. The current canonical
post-fix table is §9.2. Everything not listed was **exact**, including both SALES totals, both bag counts,
every stock and kilang row, every purchase row except `PU_BBER`, all twelve payroll
rows, production 20,691 / 30,092, and both `expenseBreakdown` salary/habuk subtotals.

| Row | Engine | Printed | Delta | Status |
|---|---|---|---|---|
| MEE `CS_MPMS` (in CLOSING total) | +883.60 | — | +883.60 | Q14, open |
| MEE `OS_MPMS` (in OPENING total) | −0.08 | — | −0.08 | keying noise |
| MEE `PU_MSD` | 0.00 | 540.00 | −540.00 | Q11 CLOSED — permanent and correct |
| MEE `MRET` | 1,517.80 | 1,519.10 | −1.30 | documented source snapshot delta |
| BIHUN `PU_BBER` | 495,131.40 | 130,631.40 | +364,500.00 | FIX-1 applied to dev in Phase 3 |
| BIHUN `CS_BPMB` | 16,891.75 | 16,891.45 | +0.30 | FIX-2 applied to dev in Phase 3 |
| BIHUN `BRET` | 268.30 | 265.10 | +3.20 | documented source snapshot delta |
| SALESMAN subtotal (both lines) | −20.00 | — | −20.00 | Q15 CLOSED 2026-07-28 — fixed in production; dev keeps the delta until refresh |
| MACHINE REPAIR MEE / BIHUN | 4,391.59 / 2,045.98 | 4,200.30 / 2,319.22 | +191.29 / −273.24 | Q13 CLOSED, residual is source classification |
| EXPENSES line (both lines) | 63,750.76 / 64,259.76 | 63,729.82 / 64,238.82 | +20.94 | payroll residual (§7.3) + 0.03 rounding, see below |

The EXPENSES line is **RM0.03 above** the RM20.91 residual recorded in §6.2. That is
policy, not drift: seven shared expense rows land on an exact half-cent when the 50%
split is applied (`CLEANING`, `ELECTRICITY AND WATER`, `OFFICE REFRESHMENT`,
`PRINTING AND STATIONERY`, `SALARY & WAGES`, `SOCSO`, `VRE-DIESEL`). The engine
rounds each **printed row** to the cent and then sums in sen, so the EXPENSES total
always equals the sum of the rows shown above it; the §6.2 SQL replay summed the raw
values and rounded once at the end. Do not "fix" this by rounding later — a total
that disagrees with its own visible rows reads as a bug to the boss.

### 8.3 What Phase 2 settled

- **The sales deltas do not exist.** See §7.3. The engine derives the invoice month
  from an Asia/Kuala_Lumpur epoch-ms window, exactly like
  `/api/invoices/sales/products`; the earlier comparison used a UTC calendar date and
  reached 8 hours into July. Both product lines now match the printed SALES total and
  bag count to the cent. **Note for Phase 3 and beyond: `src/routes/stock/stock.js`
  still derives its month from `DATE(TO_TIMESTAMP(createddate/1000))` on a UTC
  session, so its sales figures carry the same 8-hour shift. Out of scope here, but
  worth raising with the user separately — it is not this report's bug to fix.**
- **`OTHERS` is exact.** EMPTY_BAG + EMPTY_BAG(S) at 50% each = RM75.00 on both pages,
  as seeded. The fixture's old "DB OTH codes total 9,198.40" note was wrong and has
  been corrected.
- **P&L EXPENSES is derived, not read.** It is the sum of the unit-cost cost groups
  (salary + salesman + habuk + expenses + machine repair). That is what leaves Q10's
  ~RM216.61 / ~RM207.21 legacy residue, and it keeps the two pages consistent by
  construction.
- **ACCUMULATIVE walks the months.** `anchor.accumulative` + every month's P/L from
  the anchor month through the requested month, returned as `monthlyTrail`. Stock is
  fetched once per month and reused as the next month's opening, so a July request
  costs one extra month of queries, not two full runs. A request before any anchor
  returns a warning instead of a silent zero, and a runaway anchor (>120 months) is
  rejected rather than looping.
- **A mapped source with no data stays silent.** There are no missing-data warnings at
  all, so `PU_MSD` / `CS_MSD` / `OS_MSD` can never raise one (Q11).

### 8.4 Phase 2 verification performed

Engine run against the dev DB for June 2026 and diffed against
`expected-june-2026.json`; every endpoint exercised over HTTP; `PUT /mappings/:lineId`
round-tripped (write, read back, restore) and its rejections checked — unknown
`source_type`, an unknown account code / material / product, a variant that belongs to
another material, a self-reference and a reference to a non-P&L line all return a
readable 400 and leave the line's members untouched.
Add Back was exercised inside a rolled-back transaction (MEE 9,658.83 flows to FINAL
and to a 0.466813 unit, matching the boss's handwriting), as were a July request (two
months in the trail) and a pre-anchor May request (warning, no crash).

At the Phase 2 checkpoint, report-definition state was unchanged: **135 lines / 447
members / 2 anchors / 0 keyed inputs**. Phase 3 later changed only the two approved
source-data rows in §5; mappings/anchors/inputs remain untouched.
The June Add Back values the boss wrote on the printout (MEE 9,658.83 / BIHUN
6,662.66) are still **not keyed** — they are the user's to enter in Phase 4, or on
request.

### 8.5 Known limitations to watch

- `HANCUR_BH` and `KARUNG_HANCUR` are type `BH` and are excluded from PRODUCTION by
  the seed, but nothing excludes them from the BIHUN sales expansion. They have never
  been sold, so June is unaffected; if they ever are, they will appear as their own
  zero-value product rows and add bags to the printed bag total. Visible, not silent —
  decide with the boss if it ever happens.
- The `sales_products` rows are ordered by `products.sort_order` then id, which is the
  app-wide product order. The legacy print used its own order (it puts `2-BNL(5)`
  before `2-BNL`). Presentation only.
- Add Back is stored per product line per month; there is no company-wide fallback.
- No changelog entry yet — Phase 2 ships nothing a user can see. The entry belongs
  with the Phase 4 page.

---

## 9. Phase 3 — delivered parity verification

Phase 3 is complete as of **2026-07-28**. The report engine and mappings were not
changed: parity work confirmed that every remaining difference is a source snapshot,
an explicit legacy-page contradiction, or a documented handwritten/OCR alternative.

### 9.1 Standalone gate

Run from the repository root:

```text
node dev/import/closing-stock-report/verify-estimated-report.mjs
```

The script imports `computeEstimatedReport` directly (the same engine the API serves),
forces the Asia/Kuala_Lumpur epoch window, opens one repeatable-read transaction, puts
the handwritten June Add Back values into that transaction, computes both reports, and
always rolls the transaction back. It compares money as integer sen, quantities to
0.001 bag and unit costs to six decimals; row coverage is matched by canonical code or
description rather than the legacy print order. Alternate handwritten BIHUN composites
are self-checked separately but never used as engine targets. It also verifies
FIX-1/FIX-2 at their exact final rows and fails if either correction is absent.
Temporary Add Back inserts use explicit negative IDs so PostgreSQL's non-transactional
sequence does not advance; post-run checks confirmed `estimated_report_inputs` stayed
at 0 rows and its sequence stayed at 5.

Final dev run:

```text
392 exact checks / 70 documented direct-and-cascading deltas / 0 failures / 11 notes
```

Exit 0 means there is no unexpected drift; documented deltas remain visible as
`EXPECTED`. Exit 1 means an amount, row set, formula, anchor, approved fix or expected
delta changed. Exit 2 means the fixture, DB or engine could not be evaluated.

### 9.2 Canonical post-fix delta table

Delta is consistently **engine − printed fixture**. FIX-1 and FIX-2 are no longer
deltas: `PU_BBER` is 130,631.40 on both sides and `CS_BPMB` is 16,891.45 on both sides.

| Root comparison | Engine | Printed | Delta | Treatment |
|---|---:|---:|---:|---|
| MEE `CS_MPMS` | 82,769.54 | 81,885.94 | +883.60 | Q14 deferred source-sheet correction |
| MEE `OS_MPMS` | 85,789.29 | 85,789.37 | −0.08 | documented May keying noise |
| MEE `PU_MSD` | 0.00 | 540.00 | −540.00 | Q11 permanent/correct: no purchase exists |
| MEE `MRET` | 1,517.80 | 1,519.10 | −1.30 | physical-return snapshot delta |
| BIHUN `BRET` | 268.30 | 265.10 | +3.20 | physical-return snapshot delta |
| SALESMAN diesel (each line) | 1,065.85 | 1,085.85 | −20.00 | Q15 CLOSED 2026-07-28 — co-worker fixed the RM40 mis-key in production; dev retains this delta until the next prod→dev refresh, then it must go exact |
| Unit EXPENSES MEE / BIHUN | 63,750.76 / 64,259.76 | 63,729.82 / 64,238.82 | +20.94 / +20.94 | JVSL snapshot + visible-row rounding |
| MACHINE REPAIR MEE / BIHUN | 4,391.59 / 2,045.98 | 4,200.30 / 2,319.22 | +191.29 / −273.24 | Q13 formula confirmed; source classification |

Together, those root comparisons account for every downstream difference. The most
useful headline comparisons, after applying the boss's Add Back only inside the
verifier transaction, are:

| Headline | Engine | Canonical printed-source target | Delta |
|---|---:|---:|---:|
| MEE P/L | −31,321.99 | −32,338.13 | +1,016.14 |
| MEE ACCUMULATIVE | −198,222.30 | −199,238.44 | +1,016.14 |
| MEE FINAL P/L (+9,658.83) | −21,663.16 | −22,679.30 | +1,016.14 |
| MEE FINAL UNIT COST | 8.812917 | 8.872433 | −0.059516 |
| BIHUN P/L | 70,584.32 | 70,522.43 | +61.89 |
| BIHUN ACCUMULATIVE | 475,519.76 | 475,457.87 | +61.89 |
| BIHUN FINAL P/L (+6,662.66) | 77,246.98 | 77,185.09 | +61.89 |
| BIHUN FINAL UNIT COST | 14.246057 | 14.255106 | −0.009049 |

The canonical unit targets above are recomputed from the printed atomic rows. They do
not blindly use internally inconsistent OCR/handwritten composite fields: the stored
MEE handwritten 8.872386 differs from its own amount math by 0.000047, while BIHUN
14.050356 uses the separate handwritten JAGUNG stock scenario rather than the printed
DB-backed JAGUNG rows. Likewise, BIHUN's printed ingredient leaves total 276,904.54;
the struck/OCR subtotal says 276,004.54 and the handwritten scenario says 270,744.54.
The BIHUN Add Back unit 0.221409 is also preserved as handwritten evidence, while
6,662.66 / 30,092 rounds to the live engine value **0.221410**.

### 9.3 Q10 reconciliation

The surviving evidence cannot produce one account formula for the legacy P&L EXPENSES
footer. Its unit-cost components total 119,618.02 MEE / 137,810.09 BIHUN, but the two
P&L pages print 119,401.41 / 137,602.88 — unexplained gaps of 216.61 / 207.21. Pages
3–8 define only the unit-cost format; pages 1–2 contain no expense breakdown. Removing
the known `MBKH` duplicate, changing the SIP/vehicle quirks, or changing rounding does
not reconcile either amount.

The safe rule remains the Phase 2 engine invariant:

```text
P&L EXPENSES = SALARY + SALESMAN + HABUK + UNIT EXPENSES + MACHINE REPAIR
```

That keeps the two live pages mutually auditable. The verifier gates the old footer as
a known legacy-page discrepancy and pins the historical gaps at 216.61/207.21; it does
**not** create a hidden adjustment, change mappings, or mutate journals. Only the
original legacy P&L configuration/account breakdown could close this further.

### 9.4 Phase 4 handoff to Kimi

- Backend/API contract remains exactly §8.1; Phase 3 required no engine/router change.
- Build the page and mappings modal named in the Phase 4 checklist. Add Back values are
  still user inputs; the verifier's June values are always rolled back.
- Render **only live API/engine values**. Printed-source fixture targets exist only for
  verifier comparisons; never copy either those targets or BIHUN's alternate handwritten
  JAGUNG totals into UI defaults. Preserve API `warnings` and engine-provided row totals.
- ~~Do not describe nav hiding as boss-only security. The current API has global
  authentication only; obtain the user's boss identity/role rule and add server-side
  authorization before production exposure.~~ **RESOLVED 2026-07-28 — user: all
  logged-in staff.** No authorization work remained for Phase 4.
- Q14 does not block UI work (Q15 was resolved in production on 2026-07-28). When Q14
  evidence arrives, correct the June source rows and rerun the verifier under §7.2; do
  not add report-only overrides.
- Before production exposure, apply both the Phase 1 foundation migration and the
  Phase 3 parity data-fix migration. Add the user-facing changelog entry with Phase 4.
- Connected limitation needing separate user approval: variant 118 still has
  `default_unit_cost = 282.50`, so a future unsaved month can reuse the old fallback;
  the approved correction covered only June stock row 171.

Production rollout checklist (Phase 6, not performed in Phase 3):

1. Take/confirm the approved backup and maintenance window; verify the nine owner
   tables queried by the data-fix guard exist in the production schema.
2. Read-only re-pin journal/header/line IDs `3902`/`10535`/`10536` and stock row `171`
   against their documented natural identities and classify each as exact old/final
   state before writing.
3. Run the Phase 1 foundation migration, then the Phase 3 data-fix migration through
   `psql` with `ON_ERROR_STOP`; do not proceed on any guard failure.
4. Rerun the data-fix migration and require both `ALREADY FINAL` notices, then run the
   parity/report verification against production in the approved window.
5. Replace every current-status "production pending" marker in §2/§5/§7/§9,
   `expected-june-2026.json`, AGENTS.md and CLAUDE.md, and record the migration's
   applied/removal lifecycle in `docs/MIGRATIONS_LOG.md`. Keep §4's historical note
   that production was untouched during Phase 3.

---

## 10. Phase 4 — delivered frontend (2026-07-28)

Two new files, two edited files. **No backend change** — the user decided on
2026-07-28 that the report is for **all logged-in staff**, so the existing global
`authMiddleware` is the whole authorization policy and nothing was added.

- `src/pages/Stock/Reports/EstimatedReportPage.tsx` (new, ~1,064 lines) — the report
  page at `/stock/reports/estimated`. MonthNavigator clamped to June 2026
  (`minDate`), a MEE/BIHUN segmented switcher (one fetch returns both lines), Refresh
  and Mappings buttons. The selected line renders two stacked cards matching the
  legacy printout order: ESTIMATED P&L (products, closing/opening stock, purchases,
  returns, then USAGE → GROSS → EXPENSES breakdown → P/L → Add Back → FINAL P/L →
  ACCUMULATIVE with the anchor caption) and ESTIMATED UNIT COST (production/sales
  summary, the six cost groups with per-row 6-dp units, machine repair, totals,
  FINAL ESTIMATED UNIT COST). API `warnings` render in an amber banner. Money is
  en-MY 2dp, unit costs 6dp, P/L figures use the green/red convention.
- `src/components/Stock/EstimatedReportMappingModal.tsx` (new, ~1,118 lines) —
  groups all 135 lines by page → section → product_line with search; per-line inline
  editor replaces the full `sources` array through `PUT /mappings/:lineId` (plus
  `isActive`/`notes`), surfaces the server's 400 `{message}` via toast, blocks close
  while saving, and triggers a report + mappings refetch on save.
- `src/pages/TienHockNavData.tsx` — new `STOCK_DROPDOWN_COLUMNS.reports` (order 4)
  and the "Estimated P&L & Unit Cost" item under Stock, group "Reports". Routes
  auto-generate from this file, so no separate route registration exists.
- `src/components/ChangelogModal.tsx` — prepended the 2026-07-28 ms/en entry.

Decisions and details worth knowing:

- **Drilldowns join on the engine-emitted `lineId`** (numeric
  `estimated_report_lines.id`), not `line_key`. The engine reuses the stock line's
  `lineId` for its closing AND opening rows (one mapping row carries both
  presentations — §6.1), so both drill into the same member list. The page fetches
  `GET /mappings` once; if that call fails the report still renders, rows just lose
  their chevrons. P&L expense-breakdown figures have no lineIds (they are derived
  from the unit-cost groups), so their drilldown lives in the Unit Cost card.
- **Stacked sections, not sub-tabs**, matching the legacy print order; the product
  line switcher does not refetch.
- `GET /inputs` is intentionally unused — the Add Back value already arrives inside
  the report response.
- **API limitation found (not fixed; backend frozen in Phase 4):** a line's `notes`
  cannot be cleared through `PUT /mappings/:lineId` — the router's
  `COALESCE($3, notes)` keeps the old value when null is sent. Setting or changing
  notes works; clearing is a silent no-op. Flag to the user only if clearing notes
  ever matters.
- Nothing was keyed: the June Add Back values (MEE 9,658.83 / BIHUN 6,662.66) remain
  the user's to enter on the page, as recorded in §8.4.
- TypeScript interfaces on the page were verified field-by-field against the
  engine's actual response shape (products/stock/purchase/returns rows, totals,
  expenseBreakdown, unit-cost groups, anchor, monthlyTrail, warnings). No build or
  typecheck was run (project rule — the user tests manually).

### 10.1 Post-Phase-4 fixes (user feedback, 2026-07-28)

- **Mappings modal dropdown lag:** `SearchableCombobox`
  (`src/components/Stock/EstimatedReportMappingModal.tsx:272`) rendered every
  matching option with no cap — the account picker mounted ~600 options at once.
  It now renders at most 50 options plus a "N more — type to narrow down" hint;
  typing still filters the full list.
- **Add Back input was unfindable:** it was an unlabeled box with no placeholder in
  the P&L footer. It is now a highlighted sky panel labelled ADD BACK (with a
  `0.00` placeholder and a helper line) between P/L and FINAL P/L.

### 10.2 Split into two pages + compact redesign (user feedback, 2026-07-28)

- The single "Estimated P&L & Unit Cost" page is now **two nav pages** under
  **Accounting → Estimated Reports** (a new group stacked under the Setup group
  in the Accounting dropdown, sharing the `accounting-setup` dropdown column;
  first placed under Stock → Reports, moved the same day on user request):
  "Estimated P&L" (`/stock/reports/estimated-pl`) and
  "Estimated Unit Cost" (`/stock/reports/estimated-unit-cost`). The old
  `/stock/reports/estimated` route no longer exists; the `/stock/...` paths were
  kept unchanged even though the pages now live in the Accounting menu.
- `src/pages/Stock/Reports/EstimatedReportPage.tsx` is now a shared component
  taking a `view: "pl" | "unitCost"` prop; `EstimatedPLPage.tsx` and
  `EstimatedUnitCostPage.tsx` are thin wrappers (same pattern as the GT
  accounting page wrappers). Each page keeps its own MEE/BIHUN switcher,
  MonthNavigator, Refresh and Mappings buttons; one fetch still returns both
  product lines.
- Redesigned to the compact `AccountLedgerPage` idiom: no big header/controls
  card — one controls row (line switcher + month left, icon actions right), a
  compact •-separated summary strip carrying the headline figures (P&L: Sales /
  Usage / P/L / Final P/L / Accumulative; unit cost: production / bags sold /
  total / final unit cost), then one card with tighter spacing (`p-4`, compact
  section titles, `TotalRow`/`InfoRow`/`BandRow` helpers). The unit-cost
  production/sales summary cards moved into the strip.
- Add Back stays **editable on the P&L page only**; the unit-cost page shows it
  read-only (as before). The P&L expenses footnote now links to the unit-cost
  page.
- The 2026-07-28 changelog entry was updated in place (same-day refinement of
  the just-shipped feature).

---

## 11. Phase 5 handoff — PDF printing (start here in the fresh session)

**Goal:** print the report as a PDF — the P&L page and the Estimated Unit Cost page
per product line — from the Phase 4 page. The user's original prompt (§0) requires
PDF printing, 1:1 **content** with the live report (not 1:1 legacy visuals), and a
modern clean design.

### 11.1 What to build

1. **`src/utils/stock/EstimatedReportPDF.tsx` (new)** — export
   `generateEstimatedReportPDF(...)` following the established statement-PDF pattern
   in `src/utils/accounting/IncomeStatementPDF.tsx` (read it first): built with
   `@react-pdf/renderer` (already a project dependency — copy how
   `IncomeStatementPDF` imports/uses it), returns/produces a Blob, and prints
   through **`printPdfBlob` from `src/utils/pdfPrintFallback.ts`** (AGENTS.md rule
   19: hidden iframe + new-tab fallback for mobile). Do not invent another print
   path.
2. **Print button in the shared `src/pages/Stock/Reports/EstimatedReportPage.tsx`**
   header actions (it backs BOTH the P&L and unit-cost pages via the `view`
   prop — §10.2), mirroring `IncomeStatementPage.handlePrintPDF`
   (`src/pages/Accounting/Reports/IncomeStatementPage.tsx:142`): `exporting` state,
   `IconPrinter`, "Preparing..." label, `toast.error` on failure. The page already
   holds the full `EstimatedReportResponse` for the selected month — pass that data
   to the generator; **do not refetch and do not hardcode anything**. Since the two
   views are now separate pages, decide with the user whether each page prints only
   its own view or the full four-page set (§11.2 default assumed the single page).

### 11.2 Content decisions (defaults — confirm with the user only if you deviate)

- Print **both product lines** in one PDF (MEE then BIHUN), each with its P&L page
  and its Unit Cost page — four logical pages, matching the legacy printout set.
  (The page's MEE/BIHUN switcher is a view filter only.)
- Content = the live response exactly as rendered on screen: product/stock/
  purchase/returns tables with totals, USAGE → GROSS → EXPENSES breakdown → P/L →
  keyed Add Back → FINAL P/L → ACCUMULATIVE on the P&L page; production/sales
  summary, the six cost groups (amount + unit), machine repair, totals, Add Back,
  FINAL ESTIMATED UNIT COST on the unit-cost page. Unit costs at 6dp, money at 2dp.
- Include a header with report name, product line, and month label
  (`report.period.label`), and a generated-on timestamp if the sibling PDFs do.
- Drilldown/member detail is screen-only; the PDF shows the printed rows like the
  legacy report did. API `warnings` may be printed as a footnote line if trivial,
  otherwise skip.
- Legacy scans for layout reference only: `dev/import/closing-stock-report/`.
  **Never** copy fixture/printed target numbers into the PDF — those exist solely
  for the verifier (§9).

### 11.3 After it works

- Add a changelog entry (`CHANGELOG_ENTRIES` in `src/components/ChangelogModal.tsx`,
  prepend, ms + en, end-user wording) — printing is user-facing.
- Update this handover: mark Phase 5 `[x]`, add a §12 (or extend §11) with what was
  delivered, and log it in §4.

### 11.4 Open items Phase 5 must NOT try to fix (context only)

- **Q14** (June MEE small-packing +RM883.60) is still open — §7.2 protocol applies.
- **Q15 is closed in production**, but the dev DB intentionally keeps the unfixed
  rows, so `verify-estimated-report.mjs` still shows the VRE-DIESEL/SALESMAN delta
  in dev until the next prod→dev refresh (§2 item 15).
- API limitation: a mapping line's `notes` cannot be cleared via
  `PUT /mappings/:lineId` (§10).
- The June Add Back values (MEE 9,658.83 / BIHUN 6,662.66) are still unkeyed — the
  user enters them on the page; the PDF must print whatever is keyed, never the
  handwritten values by default.
- Connected limitation needing separate user approval: material variant 118 still
  has `default_unit_cost = 282.50` (§5 FIX-2 note; §9.4 last bullet).
- Production rollout (Phase 6) checklist is in §9.4 — both migrations
  (`2026-07-25_estimated_report_foundation.sql`,
  `2026-07-28_estimated_report_parity_data_fixes.sql`) must reach production before
  the report is exposed there.
