# Journal keying guide — expense vouchers (cash/bank)

**Created 6 Aug 2026** from the June 2026 reconciliation: every account below is
the one the legacy program uses, proven line-by-line against the legacy ledger
prints. Key to these accounts from the start and the monthly tie-out
(`dev/import/legacy-tieout/`) stays at zero differences — no corrections needed.

> **Updated 7 Aug 2026.** This guide was derived from the June 2026 legacy
> ledger **print**. Two of its rows turned out to be keying errors in the legacy
> program itself, not in the ERP — the coworker corrected both in legacy (and in
> the ERP) on 7 Aug 2026, and this guide is corrected to match: **KFC → `MBSM_K`**
> (not `MBC`) and **the PAUMIN receipt splits `MBRMF` 565.00 / `MBSAF` 144.00**
> (not 465.00 / 244.00). General rule: when the legacy print and the ERP disagree,
> check the original receipt before assuming the print is right.

## The five rules

1. **Vehicle diesel → the vehicle's OWN `OIL*` account.** Every diesel receipt
   is for a specific vehicle — match the plate/vehicle to the account:
   `OIL6323` SAB6323H · `OIL920` Perodua Ativa QCV920 · `OIL9698` SAB9698C ·
   `OIL9882` Hilux SWJ9882 · `OIL9897` SAB9897R · `OIL9922` SD9922H ·
   `OILFORK` forklift · `OILHT15` Hitachi SAB9515M · `OILHT18` Hitachi
   SAB9518M. Use `OILOTH` only when the vehicle genuinely has no account
   (June: a SHELL receipt for the Ativa was keyed OILOTH — it has `OIL920`).
2. **Vehicle parts/repair → the vehicle's `R*` account, NEVER its `OIL*`
   account.** `R9698` SAB9698C · `R9922` SD9922H · `RBFORK` battery forklift ·
   `ROTH` only for vehicles with no own account. (June: seals and spark plugs
   for SAB9698C were keyed as diesel `OIL9698`.)
3. **Machine/premises parts — ask "what is this part FOR?":**
   - BIHUN machine (incl. consumables: food-grade rubber, packing tape) → `BRM`
   - MEE machine → `MRM`
   - shared MEE+BIHUN machine parts → `MBRM`
   - factory building / shared infrastructure → `MBRMF`
   - Menggatal premises → `MGT`
   The same vendor can land in different accounts depending on the part —
   KK BEARING NKI bearings for the MEE machine → `MRM`, but KK BEARING 6202
   LLU for Menggatal → `MGT`. Read the "FOR …" note on the receipt.
4. **Staff meals → `MBSM_K` (KILANG / factory staff) or `MBSM_O` (OFFICE
   staff)** — pick by WHO the meal was for, not where it was bought.
5. **Split receipts by item, and the legs must sum to the receipt total.**
   One PAUMIN receipt (#2606-2133) = cutting/grinding discs, drill bits and
   insulating tape `MBRMF` 565.00 + gloves/spectacles `MBSAF` 144.00 = 709.00.
   Add each leg up from the receipt's own line items — never estimate the split.

## Vendor → account table (proven against the June 2026 legacy ledgers)

| Vendor / receipt | Correct account | Keyed wrongly as |
|---|---|---|
| TAOBAO-JING XIAN YOU (BIHUN food-grade rubber) | `BRM` | `MBOR` |
| TAOBAO-PIN SHANG MEI SHUO (BIHUN packing tape) | `BRM` | — |
| TAOBAO-SHUANG MEI HARDWARE (springs, MEE machine) | `MRM` | `BRM` |
| TAOBAO-HU HAO FLAGSHIP (drill bits, MEE machine) | `MRM` | — |
| TAOBAO-FOSHAN NAN FANG (bolts, MEE machine) | `MRM` | — |
| TAOBAO-RUI QI GONG JU (drill bits, MEE machine) | `MRM` | — |
| TAOBAO-ZHE JIANG SHEN HONG (springs, MEE machine) | `MRM` | — |
| HV ELECTRICAL — MCB for MEE machine DB | `MRM` | — |
| HV ELECTRICAL — copper cable (factory wiring) | `MBRMF` | `MBRM` |
| STRIKER ELECTRIC (MCB/contactor, MEE machine) | `MRM` | — |
| LASER TRADING (carbide rod, engineering knife) | `MRM` | — |
| V.E ELECTRICAL (thermal couple, MEE machine) | `MRM` | — |
| TAOBAO-BOZHEN (bearing grease, shared machines) | `MBRM` | — |
| TAOBAO-GU DE LI QI HANG (compressor air gun) | `MBRM` | — |
| TAOBAO-HANG ZHOU JIN XIN (gearbox RV63) | `MBRM` | — |
| PAUMIN HARDWARE — cutting discs (565.00 on #2606-2133) | `MBRMF` | — |
| PAUMIN HARDWARE — gloves/spectacles (144.00 on #2606-2133) | `MBSAF` | — |
| TAOBAO-WEI ER DUN (safety boots) | `MBSAF` | — |
| SESB (Menggatal meter) | `MGT` | — |
| 168 HARDWARE (Menggatal) | `MGT` | — |
| BUILDERS EMPORIUM (Menggatal plumbing/pipe) | `MGT` | — |
| TAOBAO-ZHI CHENG ZHOU CHENG (bearings, Menggatal) | `MGT` | — |
| J&T / JBT. AIR NEGERI SABAH (Menggatal) | `MGT` | — |
| BEST MART HOLDING (Menggatal hardware) | `MGT` | — |
| MR. D.I.Y / KTS TRADING / MEGANIK (Menggatal) | `MGT` | — |
| DIN HIONG / MEZIN (Menggatal hardware) | `MGT` | — |
| SABAH FISH MARKETING / SAGMA MARKET (fish food) | `MGT` | — |
| TAOBAO-YI HAO QI HANG (fertilizer stickers) | `MGT` | — |
| TAOBAO-SEN YOU GUAN FANG / JIN SHANG XU MU | `MGT` | — |
| TAOBAO-GI NET / ERMINGZE (wire mesh, Menggatal) | `MGT` | — |
| KK SEAL ENTERPRISE (seals — SAB9698C) | `R9698` | `OIL9698` |
| DIGNITY BRAND (spark plugs — SAB9698C) | `R9698` | `OIL9698` |
| SHELL BUNDUSAN — SAB6323H fuel | `OIL6323` | `OIL9698` |
| SHELL BUNDUSAN — Ativa QCV920 fuel | `OIL920` | `OILOTH` |
| SHELL SYT. EXCEL — SD9922H fuel | `OIL9922` | `OIL9882` |
| EMART (cleaning supplies) | `MBC` | `MBOR` |
| KFC / fast-food restaurants (factory staff meals) | `MBSM_K` | — |
| LIDO MARKET (office groceries) | `MBOR` | `MBSM_K` |
| MIX STORE (office groceries) | `MBOR` | `MBSM_K` |
| HO KEE HAINANESE CHICKEN RICE (factory staff meal) | `MBSM_K` | `MBSM_O` |
| HONG JIA TING / BOWL & SUPERFOOD (factory staff meals) | `MBSM_K` | — |
| ORIENTAL COFFEE (KL) (office staff) | `MBSM_O` | `MBSM_K` |

When a NEW vendor appears and no rule covers it, ask before guessing — one
question is cheaper than one correction.

## Amount keying habits (the other half of June's corrections)

- Copy the sen digits exactly from the receipt/Taobao invoice (46.65, not
  46.60). 17 of June's 31 corrections were sen-level typos.
- After keying a split receipt, check the legs add back to the receipt total.
- The monthly tie-out (`dev/import/legacy-tieout/README.md`) catches whatever
  slips through — run it at every month-end.
