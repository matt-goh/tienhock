# I18N (Multi-Language) Rollout Handover

**Status:** Phase 0 **DONE 2026-08-04**. B1 (`common`) **DONE 2026-08-04**. B3 (`invoice`) **DONE 2026-08-07** — all 23 files converted (16 in part 1, 7 in part 2); see §9. BM tone audit applied to all existing ms locales. B2 (`auth`, `nav`) **DONE 2026-08-07**. B4 (`payments`/`adjustments`/`sales`) **DONE 2026-08-07**. B5 (`sales`) **DONE 2026-08-07**. B6 (`catalogue`) **DONE 2026-08-07** – all 15 pages converted. B7 (`catalogue`) **DONE 2026-08-07** – all 27 components under `src/components/Catalogue/**` converted; `catalogue` namespace now has 819 keys per language. B8 (`payroll`) **DONE 2026-08-07** – all 24 payroll pages converted; `payroll` namespace now has 694 keys per language. B9 (`payroll`) **DONE 2026-08-07** – all 34 components under `src/components/Payroll/**` converted (9 in part 1, 25 in part 2); `payroll` namespace now has 967 keys per language. Next: **B10** (Stock pages + components, 23 files).

---

## 0. CONTINUE HERE (fresh session)

**Pick up exactly here:** start **B10** – `src/pages/Stock/**` (12 files) + `src/components/Stock/**` (11 files), 23 files total, namespace `stock`. Recommended split: B10a (12 pages) then B10b (11 components).

`stock` is a NEW namespace: create `src/i18n/locales/ms/stock.json` and `src/i18n/locales/zh-Hans/stock.json` (empty objects are fine) and register `stock` in `src/i18n/index.ts` alongside the existing namespaces. Remember the extractor glob quirk: `**/*.tsx` does NOT match root-level files, so run the extractor once per subfolder (or per file) to cover the whole batch.

Run `node dev/i18n-extract.mjs --ns stock --glob "src/pages/Stock/**/*.tsx"` and the same for `src/components/Stock/**/*.tsx` before starting to see which candidate strings are missing.

`npx tsc --noEmit` currently reports one pre-existing error in `src/pages/Accounting/Reports/AccountLedgerPage.tsx` (unrelated staged accounting work). Do not chase it; verify your batch is clean by confirming it is the ONLY error.

After B10: B11/B12 (Accounting) → B13–B16 (GreenTarget + JellyPolly) → B17/B18 (misc + residue). Follow the batch table in §6.

**Current namespace state:** registered in `src/i18n/index.ts`: `common`, `nav`, `home`, `invoice`, `auth`, `payments`, `adjustments`, `sales`, `catalogue` (819 keys/lang), `payroll` (967 keys/lang). `en/` stays sparse (semantic `common.*` only).

**B8 part 2 notes (2026-08-07):** the five remaining payroll pages are fully converted. Hardcoded Malay display labels were de-Malay-ified to English keys (Digenapkan → Rounding, Jumlah Digenapkan → Rounded Total, Ikut amaun → By amount, Jumlah lain-lain → Total Others, Cuti Records → Leave Records, NAMA PEKERJA → STAFF NAME, GAJI → SALARY, etc.) with the original Malay kept as the `ms` value. `dev/i18n-extract.mjs` was added as the coverage extractor helper (run before translating a batch to see which candidates are missing from the namespace). One pre-existing `tsc` error remains in `src/pages/Accounting/Reports/AccountLedgerPage.tsx` (unrelated staged accounting work); it predates this batch.

**B9 notes (2026-08-07):** all 34 Payroll components converted (+273 keys/lang, 694 → 967). `DynamicContextForm` needed no string edits (its labels come from `src/configs/payrollJobConfigs.ts`, which is outside the batch — config labels like "Jumlah Tepung (Karung)" stay as-is for now; flag to the user if they want those de-Malay-ified). Left raw on purpose: `TIEN HOCK FOOD INDUSTRIES SDN BHD` / `Tien Hock` / `Jelly Polly` (proper nouns), `BUS SCHOOL` (DB default category), `JAGA STIM:` / `FOC:` (pay-code-specific jargon), `Grouped: ` (logic prefix), `d MMM yyyy` (date format), console.error strings, and the `ImportHolidaysModal` example lines / textarea placeholder (sample input data mirroring the English source site). De-Malay-ified: `No. Ahli KWSP Tiada` → key `No EPF Member Number`, the MissingEPF dialog paragraph → English key with original Malay as `ms`, `Jumlah Digenapkan` → `Rounded Total {{amount}}`, `Under 60 (Jenis Pertama)` → `Under 60 (First Type)`, `60 and Above (Jenis Kedua)` → `60 and Above (Second Type)`, and `CompanySalaryReportTables` CUTI labels switched from Malay to the standardized English leave-type keys (`Sick Leave`/`Annual Leave`/`Public Holiday`/`Medical Leave`). `PayrollUnifiedTable`'s module-level `TABLE_HEADER` const became a `TableHeader` component so headers can call the hook; `CompanySalaryReportTables` sub-components each carry their own hook; `Trans` used for sentences with inline markup (AddOthersModal header, ContextLinkedBadge, ImportHolidaysModal paragraph). Manual plurals kept as flat keys (never i18next `count`): `{{count}} record/records`, `{{count}} employee/employees`, `{{count}} date/dates`, `{{selected}} of {{total}} payslip/payslips`, `Print {{count}} Payslip/Payslips`, `Preparing {{count}} payslip/payslips for printing...`, `Add {{count}} row/rows`, `{{count}} duplicate/duplicates found`. `i18n:report` green; `tsc --noEmit` clean except the pre-existing `AccountLedgerPage.tsx` error.

**Per-file workflow (proven):**
1. Add `import { useTranslation } from "react-i18next";` (+ `Trans` when a sentence has inline `<strong>` markup), call `const { t } = useTranslation("payroll");` at the top of the component. Sub-components in the same file need their own hook.
2. Wrap every user-facing literal (JSX text, placeholder/title/aria-label, toasts, dialogs, empty states). Interpolate with `{{var}}`; never concatenate translated fragments.
3. Add every new key to BOTH `src/i18n/locales/ms/payroll.json` and `src/i18n/locales/zh-Hans/payroll.json`. English text IS the key. Keep the BM tone rule (§7): plain English loanwords for technical terms (Konsolidasi, Submission, Cancellation, Pending, History, Summary, Range, Results, Check, Window, Preview, Rounding, Subtotal, Journal Entry, Ledger, Debtor, Sync, Transfer, Browser, Dashboard, Payroll, Production, Override), everyday Malay for everyday words (Simpan, Batal, Padam, Cari, Tambah, Hantar, Bayaran, Jumlah, Baki, Amaun, Tarikh, Masa, Sah, Cek, Tunai).
4. Run `npm run i18n:report` (key symmetry ms/zh) and `npx tsc --noEmit` after each file or small group. Fix immediately.
5. Update the Batch Log (§9) + Status line after finishing the batch. Do NOT run `git add` unless the user asks (they now manage staging themselves).

**Gotchas learned the hard way (read before editing):**
- **NEVER pass non-ASCII through a PowerShell here-string into `node -` / `rg`** – the pipe mangles every non-ASCII char to `?` (this corrupted a locale file once; it was rebuilt from the git index). For locale JSON edits use `apply_patch` directly, or write a UTF-8-safe entries JSON via `apply_patch` and merge it with a short ASCII-only Node script.
- Files are CRLF; `apply_patch` handles them, but the console renders UTF-8 as mojibake. When a patch context line contains a non-ASCII char (em dash U+2014, en dash U+2013, middle dot U+00B7, bullet U+2022), get the exact codepoints with a Node dump first, then type the real character in `apply_patch`, or do that one replacement with a Node regex using `\u2014` etc.
- JSX attribute strings cannot contain `\"` escapes (`i18nKey="...\"...\""` fails tsc). Use a JS expression: `i18nKey={'...'}` or `i18nKey={"...\"...\""}`.
- Dynamic keys are invisible to the key-coverage checker: `t(getMonthName(...))`, `t(dayOfWeek)`, `t(view)`, `t(getDisplayDayType(...))`, `t(status)` need their concrete values in the JSON. Already present in `payroll`: January\u2013December, Monday\u2013Sunday, `summary`/`pinjam`, `Sabtu`, `Biasa/Ahad/Umum Rate`, `Hospital Leave`, `Submitted`/`Processed`.
- Leave-type labels are standardised to `Annual Leave` / `Sick Leave` / `Public Holiday` / `Medical Leave` (ms: Cuti Tahunan / Cuti Sakit / Cuti Umum / Cuti Rawatan) – reuse those keys.
- `getMonthName` (payrollUtils) returns browser-locale month names – leave those dynamic displays as-is when they are not passed through `t()`; the payroll month-name keys above are for the `t(getMonthName(...))` call sites already converted.
- Exclusions still in force (§4): PDF generators, DB content, identifiers, statutory acronyms (EPF/SOCSO/SIP/PCB/KWSP/PERKESO), e-Invoice payloads, bank/export file contents.
- The remaining giant pages contain many repeated table/card/toast strings – many keys already exist in `payroll`; run the coverage extractor before translating to avoid duplicates.

---
**Created:** 2026-08-04
**Owner of this document:** update it after EVERY phase/batch. It is the single source of truth for what is done and what is next.

---

## 1. Goal & Locked Decisions

Translate **all user-facing text** in the ERP (every page, component, modal, toast, menu — down to single words) into multiple languages, auto-detecting the device/browser locale, with a manual override in the navbar user menu.

Locked with the user (2026-08-04):

| Decision | Value |
|---|---|
| Supported languages | **English (`en`)**, **Bahasa Melayu (`ms`)**, **简体中文 (`zh-Hans`)** |
| Traditional Chinese | NOT offered. All `zh-*` device locales (incl. zh-TW/zh-HK) map to `zh-Hans`. |
| Device-locale fallback (unmatched locale) | **`ms`** (Bahasa Melayu) |
| Missing-translation fallback (key not translated yet) | **English** (the key itself, see §3) |
| PDFs (invoices, receipts, payslips, statements, report PDFs) | **EXCLUDED entirely.** Never translate strings inside PDF generators. |
| Data values (staff names, product descriptions, account descriptions, customer names, pay code descriptions) | **NOT translated** — they are database content, not UI text. |

### Scale (measured 2026-08-04)

- 457 `.ts`/`.tsx` files in `src/` — 173 pages, 146 components, 107 utils/hooks/services.
- ~1,791 `toast.*` call sites across 227 files.
- No existing i18n framework. The only bilingual precedent is `src/components/ChangelogModal.tsx` (ms/en fields).

---

## 2. Architecture

### Framework

`react-i18next` + `i18next` + `i18next-browser-languagedetector` (new dependencies). Do NOT build a custom context — with ~5,000 strings and this many files, the standard tooling (interpolation, missing-key handling, namespace splitting) pays for itself immediately.

### File layout

```
src/i18n/
  index.ts                  # i18next init, language mapping, detector config
  locales/
    en/                     # sparse — only semantic keys (see §3)
      common.json
    ms/                     # one JSON per namespace
      common.json  nav.json  auth.json  home.json  invoice.json
      payments.json  adjustments.json  sales.json  catalogue.json
      payroll.json  stock.json  accounting.json
      greentarget.json  jellypolly.json  misc.json
    zh-Hans/                # same namespace files as ms/
      ...
```

All locale files are imported eagerly (bundled). The JSON is small relative to the app bundle; revisit lazy loading only if the bundle measurably suffers.

### Locale detection

`src/i18n/index.ts` configures the detector with order `["localStorage", "navigator"]`, caches the user's manual choice in localStorage (detector default key `i18nextLng`), and maps raw locales:

| Browser locale | Resolved language |
|---|---|
| `en`, `en-*` | `en` |
| `ms`, `ms-*` | `ms` |
| `zh`, `zh-CN`, `zh-SG`, `zh-TW`, `zh-HK`, any `zh-*` | `zh-Hans` |
| anything else | `ms` (locked fallback) |

### Language switcher

A row in `src/components/Navbar/NavbarUserMenu.tsx` (same pattern as the Dark Mode toggle row) offering: **English · Bahasa Melayu · 简体中文**. Selecting one calls `i18n.changeLanguage(code)`; the detector caches it to localStorage. Manual choice always wins over device locale on the next visit.

---

## 3. Key Strategy (read carefully — this is what makes the batches mechanical)

**English source text IS the key.** `t("Save changes")` with no entry anywhere renders "Save changes".

- `ms/*.json` and `zh-Hans/*.json` map English sentence → translation: `"Save changes": "Simpan perubahan"`.
- `en/common.json` holds the only **semantic keys**: a small set of very-high-frequency short words (`common.save`, `common.cancel`, `common.delete`, `common.edit`, `common.search`, `common.loading`, `common.actions`, `common.status`, `common.date`, `common.total`, …) so one edit fixes a word everywhere.
- No key naming debates, no orphan-key hunts; an untranslated string silently falls back to correct English. This is deliberate.
- Exception rule of thumb: if a word appears in 5+ files, promote it to `common.*` during Phase 1; otherwise English-as-key in the module namespace.

**Interpolation:** rewrite template literals —
`toast.error(\`Failed to save invoice ${id}\`)` → `toast.error(t("Failed to save invoice {{id}}", { id }))`.
Do NOT concatenate translated fragments (`t("Invoice") + " " + id`) — word order differs across languages.

**Plurals:** rare in this app; if hit, use i18next `_one`/`_other` suffixes and record the case in §8.

---

## 4. What NOT to translate (hard exclusions for every batch)

1. **PDF generators** — `src/services/*pdf*`, anything matching `*PDF*.tsx`/`*.pdf.ts`, `src/utils/**/pdf*`, pdfmake/react-pdf document definitions. (Locked: PDFs out of scope.)
2. **Database content** — values rendered from the DB (names, descriptions, account codes, pay codes, job names, product ids/descriptions, customer names). Only translate the *labels around them*.
3. **Identifiers** — route paths, API URLs, `id`/`value`/`name` attributes, localStorage keys, `console.*`, error objects sent to logs.
4. **Company/product proper nouns** — "Tien Hock", "Green Target", "Jelly Polly", "MyInvois", bank names (PBB/ABB), statutory acronyms (EPF/KWSP, SOCSO/PERKESO, SIP/EIS, PCB/MTD). Keep them verbatim in all languages.
5. **e-Invoice / MyInvois submission payloads** — strings sent to the tax authority API.
6. `functions/index.js` (Cloudflare share-metadata rewriter) — not app UI.

Date/number formats stay as-is (`dd/MM/yyyy`, date-fns) — do NOT localize formats in this rollout.

---

## 5. Phase Plan

### Phase 0 — Infrastructure (HARD — architect/owner task, NOT for Opus)

Done once, by whoever owns this rollout:

1. `npm install i18next react-i18next i18next-browser-languagedetector --legacy-peer-deps`.
2. Create `src/i18n/index.ts` (init + locale mapping per §2) and the `locales/` skeleton (`common` namespace in all 3 languages; empty module files).
3. Wire `<I18nextProvider>` (or bare `i18n` import) in `src/index.tsx`/`src/main.tsx` — check which entry the app uses.
4. Language switcher row in `NavbarUserMenu.tsx`.
5. **Pilot conversion** proving the pattern end-to-end: `src/components/Navbar/*` + `src/pages/HomePage.tsx` + the 3 `*NavData.tsx` sidebar label files (`nav` namespace). Sidebar labels are data-driven (`SidebarItem.name`) — convert them to `t(...)` lookups at render time, keeping route ids unchanged.
6. `ChangelogModal.tsx`: pick `ms`/`en` by active language (zh falls back to `en` until entries are translated — translating the changelog corpus is NOT in any batch; note it here as a deliberate exclusion unless the user asks).
7. Dev tooling: enable i18next `debug`/`saveMissing` in DEV only (logs missing keys to console) and add a small `dev/i18n-report.mjs` that diffs key sets across `ms/` vs `zh-Hans/` JSON files per namespace (catches keys translated in one language but not the other). Add an `npm run i18n:report` script.
8. Update `AGENTS.md` with a new rule: *"All new user-facing text must be wrapped in `t()` from react-i18next; never add raw string literals to JSX or toasts. Add ms + zh-Hans translations for every new key."*
9. Changelog entry (AGENTS.md rule 16) when the switcher ships.

Success criteria: switching language in the user menu re-renders Navbar + HomePage + sidebar labels in all 3 languages with no reload; a fresh browser profile with `zh-CN` locale lands on 简体中文; an unmatched locale (e.g. `de`) lands on Bahasa Melayu.

### Phase 1 — Shared chrome (Opus batch B1–B2)

Shared top-level components + remaining navbar + auth + home leftovers. High leverage: one pass here translates buttons/dialogs/date pickers used by every page.

### Phase 2+ — Module batches (Opus)

One batch ≈ one module below. Run them in the listed order (most-used first). Within a batch, convert **every** file under the listed globs, including toasts and confirmation dialogs.

---

## 6. Opus Batch List (the easy mechanical work)

**Universal instructions for every batch** — paste this into each Opus prompt along with the batch's globs:

1. Read `docs/I18N_HANDOVER.md` §3 (key strategy) and §4 (exclusions) first. Follow them exactly.
2. In each file: `import { useTranslation } from "react-i18next";`, call `const { t } = useTranslation("<namespace>");`, and wrap EVERY user-facing string literal — JSX text, `placeholder`, `title`, `aria-label`, toast messages, confirmation dialog text, listbox options, table headers, empty-state text. Convert template literals to `{{var}}` interpolation (§3).
3. Add every new key to `src/i18n/locales/ms/<namespace>.json` **and** `src/i18n/locales/zh-Hans/<namespace>.json`. Use the §7 glossary for consistent terms. `en/` files only need entries for `common.*` semantic keys.
4. Do NOT change any behaviour, layout, classnames, or logic. The diff should be strings-only plus the import/hook.
5. Respect the §4 exclusions — in particular, if a file is or contains a PDF document definition, skip it entirely and note it in the batch report.
6. After the batch, run `npx tsc --noEmit` and fix any type errors introduced (user has pre-approved this command for i18n batches — AGENTS.md rule 10 is waived for this).
7. Report: files converted, keys added per language, files skipped (with reason), any strings you were unsure how to translate (list them, don't guess silently).
8. Append one line per finished batch to the Batch Log (§9) in this handover.

**Functional safety (the whole point of this rollout — a translated UI must never change behaviour):**

9. `t()` belongs ONLY at the final display sink: JSX text, JSX attributes (`placeholder`/`title`/`aria-label`), toast/dialog arguments. NEVER inside comparisons (`===`, `!==`, `.includes()`), `filter`/`find`/`sort` predicates, `switch` cases, Map/Set/object keys, `localStorage`/`sessionStorage` reads/writes, URL/route construction, API request bodies or params, regex/parsing, or SQL. If you are unsure whether a string is double-duty (displayed AND used in logic), treat it as logic and leave it raw.
10. Dropdown/listbox options that map a label to a value: translate the LABEL only; the underlying `value` stays the raw English/original string.
11. Never translate anything persisted (DB rows, cached bookmarks, saved filters) or sent to the server — the pilot proves the pattern: bookmarks store English names, only the render is wrapped.
12. Self-check before finishing a batch: `grep` your diff for every `t(` that is NOT inside JSX or a toast/dialog call and justify each one; then in the UI switch language once and re-run the page's search/filter to confirm results are unchanged.

| Batch | Namespace | Scope (globs) | Approx files |
|---|---|---|---|
| B1 | `common` | `src/components/*.tsx` (top level only: Button, ConfirmationDialog, FormComponents, Listbox*, DateNavigator, DateRangePicker, MonthNavigator, Tab, PillSelect, LoadingSpinner, BackButton, Checkbox, StyledListbox, ToolTip, HoverTooltip, StatusIndicator, BackupModal, SafeLink, CompanySwitcher, ContributionListbox, TimeNavigator) | 22 |
| B2 | `auth`, `nav` | `src/pages/Auth/**`, `src/components/Auth/**`, `src/pages/pagesRoute.tsx` (any labels) | ~3 |
| B3 | `invoice` | `src/pages/Invoice/**`, `src/components/Invoice/**` (skip PDF files per §4) | ~23 |
| B4 | `payments`, `adjustments` | `src/pages/Payments/**`, `src/pages/AdjustmentDocs/**`, `src/components/AdjustmentDocs/**`, `src/components/Sales/**` | ~8 |
| B5 | `sales` | `src/pages/Sales/**` | 4 |
| B6 | `catalogue` | `src/pages/Catalogue/**` | 15 |
| B7 | `catalogue` | `src/components/Catalogue/**` | 27 |
| B8 | `payroll` | `src/pages/Payroll/**` | 24 |
| B9 | `payroll` | `src/components/Payroll/**` (split into B9a/B9b if slow) | 34 |
| B10 | `stock` | `src/pages/Stock/**`, `src/components/Stock/**` | 23 |
| B11 | `accounting` | `src/pages/Accounting/**` | 21 |
| B12 | `accounting` | `src/components/Accounting/**` | 8 |
| B13 | `greentarget` | `src/pages/GreenTarget/**` — half 1 (alphabetical) | ~22 |
| B14 | `greentarget` | `src/pages/GreenTarget/**` — half 2 + `src/components/GreenTarget/**` (incl. the PUBLIC customer signup form) | ~33 |
| B15 | `jellypolly` | `src/pages/JellyPolly/**` — half 1 | ~20 |
| B16 | `jellypolly` | `src/pages/JellyPolly/**` — half 2 + `src/components/JellyPolly/**` | ~22 |
| B17 | `misc` | `src/hooks/*.ts`, non-PDF `src/services/*.ts`, `src/utils/**` — ONLY files that emit user-facing strings (toasts/alerts); skip pure logic and all PDF utils | subset of 107 |
| B18 | various | Residue sweep: `src/App.tsx`, error boundaries, `index.html` title, any file with a raw JSX string found by grep | — |

Batch sizing notes: B9/B13–B16 are the big ones; split further at natural sub-directory boundaries if a batch can't finish in one session. Never leave a file half-converted — a file is either fully converted or untouched.

---

## 7. Terminology Glossary (use in EVERY batch — extend, don't contradict)

**BM tone (locked 2026-08-07):** Bahasa Melayu translations deliberately prefer plain English loanwords for technical/formal terms (Konsolidasi, Submission, Cancellation, Confirmation, Pending, Eligible, History, Summary, Range, Results, Check, Window, Preview, Rounding, Subtotal, Journal Entry, Ledger, Debtor, Sync, Transfer, Override, Browser, Dashboard, Payroll, Production, Maintenance, etc.). Formal or 'university-level' Malay (e.g. Pembundaran, Penyatuan, Penghantaran, Pengesahan, Semakan, Tetingkap, Pratonton, Penghutang, Imbangan Duga, Muktamad, Nyahpilih) is avoided. Everyday Malay stays (Simpan, Batal, Padam, Cari, Tambah, Hantar, Bayaran, Jumlah, Baki, Amaun, Tarikh, Masa, Sah, Cek, Tunai). When unsure, use the English word. The table below follows this rule; the Chinese column is unaffected.

| English | 简体中文 | Bahasa Melayu |
|---|---|---|
| Save | 保存 | Simpan |
| Cancel | 取消 | Batal |
| Delete | 删除 | Padam |
| Edit | 编辑 | Edit |
| Search | 搜索 | Cari |
| Loading… | 加载中… | Memuatkan… |
| Customer | 客户 | Pelanggan |
| Supplier | 供应商 | Pembekal |
| Invoice | 发票 | Invois |
| Payment | 付款 | Bayaran |
| Receipt | 收据 | Resit |
| Credit Note | 贷记单 | Nota Kredit |
| Debit Note | 借记单 | Nota Debit |
| Refund Note | 退款单 | Nota Bayaran Balik |
| Stock | 库存 | Stok |
| Product | 产品 | Produk |
| Staff / Employee | 员工 | Kakitangan / Pekerja |
| Payroll | 薪资处理 | Payroll |
| Payslip | 工资单 | Slip Gaji |
| Salary | 工资 | Gaji |
| Leave | 请假 | Cuti |
| Overtime (OT) | 加班 | Lebih Masa (OT) |
| Deduction | 扣款 | Potongan |
| Allowance | 津贴 | Elaun |
| Bonus | 花红 | Bonus |
| Commission | 佣金 | Komisen |
| Advance | 预支 | Advance |
| Salesman | 销售员 | Jurujual |
| Report | 报表 | Laporan |
| Journal Entry | 日记账分录 | Journal Entry |
| Ledger | 分类账 | Ledger |
| Trial Balance | 试算平衡表 | Trial Balance |
| Debtor | 欠款客户 | Debtor |
| Creditor | 供应商欠款 | Creditor |
| Account Code | 会计科目代码 | Kod Akaun |
| Chart of Accounts | 会计科目表 | Chart of Accounts |
| Balance | 余额 | Baki |
| Total | 总计 | Jumlah |
| Date | 日期 | Tarikh |
| Status | 状态 | Status |
| Active / Inactive | 启用 / 停用 | Aktif / Tidak Aktif |
| Confirm / Confirmation | 确认 | Sahkan / Confirmation |
| Are you sure? | 确定吗？ | Adakah anda pasti? |
| No records found | 未找到记录 | Tiada rekod ditemui |
| Production | 生产 | Production |
| Packing | 包装 | Pembungkusan |
| Delivery | 送货 | Delivery |

| Consolidation | 合并 | Konsolidasi |
| Rounding | 舍入 | Rounding |
| Subtotal | 小计 | Subtotal |
| Pending | 待处理 | Pending |
| Eligible | 符合条件 | Eligible |
| History | 历史 | History |
| Summary | 摘要 | Summary |
| Range | 范围 | Range |
| Results | 结果 | Results |
| Check | 检查 | Check |
| Window | 窗口 | Window |
| Preview | 预览 | Preview |
| Online | 在线 | Online |
| Zero Value | 零值 | Zero Value |
| Returns | 退货 | Returns |
| Difference | 差额 | Difference |
| Deselect | 取消选择 | Deselect |
| Collapse / Expand | 折叠 / 展开 | Collapse / Expand |
| Browser | 浏览器 | Browser |
| Dashboard | 仪表板 | Dashboard |
| Maintenance | 维护 | Maintenance |
| Generation | 生成 | Generation |
| Setup | 设置 | Setup |
| People | 人员 | People |
| Dark Mode | 深色模式 | Dark Mode |
| Billing | 计费 | Billing |
| Transfer | 转账 | Transfer |
| Outstanding | 未结清 | outstanding |
| Statement | 报表 | Statement |
| Balance Sheet | 资产负债表 | Balance Sheet |
| Income Statement | 损益表 | Income Statement |
| Sync | 同步 | Sync |
| Skipped | 已跳过 | Skipped |
| Rejected | 已拒绝 | Rejected |
| Accepted | 已接受 | accepted |
| Validation | 验证 | Validation |

Keep statutory acronyms untranslated (EPF, SOCSO, SIP, PCB, KWSP, PERKESO). Malay accounting UI in this codebase already mixes English loanwords (e.g. "Backup", "Statement") — follow existing usage in `ChangelogModal.tsx` entries for tone.

---

## 8. Open Questions / Deferred Items

- **Changelog zh translation** — modal follows active language after Phase 0, but the ~100 existing entries stay ms/en unless the user asks for zh.
- **Server-side error messages** (Express responses surfaced via `err.response.data.message` in toasts) — currently English. Option: map known server message prefixes client-side in `misc.json`. Deferred; revisit after UI batches.
- **date-fns month/day names** — if any picker renders month names in English (`DateNavigator`, `MonthNavigator`), decide per-language month names when B1 hits them; numeric formats stay.
- **Plural cases** — record any encountered here:
  - None yet. B1 deliberately avoided the i18next `count` option (which activates plural key resolution) for `Load more... ({{hidden}} more)` — the variable is named `hidden`, so the single flat key resolves.
- **date-fns month/day names** — RESOLVED in B1 for the picker grids only: `MonthNavigator`/`TimeNavigator` keep their raw English `MONTH_LABELS`/`WEEKDAY_LABELS` arrays as React keys and translate only at render (`{t(monthLabel)}`), so `common` now carries `Jan`…`Dec` and `Mo`…`Su`. The **trigger/display** strings still come from `toLocaleDateString("en-MY", …)` and remain English in every language, per §4's "date formats stay as-is". Revisit only if the user asks for localized long month names.

---

## 9. Batch Log

| Date | Batch | Files converted | Keys added (ms/zh-Hans) | Skipped | Notes |
|---|---|---|---|---|---|
| 2026-08-04 | Phase 0 | `src/i18n/**`, `src/index.tsx`, `Navbar*.tsx` (5), `NavbarUserMenu.tsx`, `HomePage.tsx`, `ChangelogModal.tsx`, `dev/i18n-report.mjs`, `AGENTS.md` rule 20 | common 48 + nav 155 + home 19 (each language) | — | Switcher live in user menu; sidebar/home translated; `npm run i18n:report` green; `tsc --noEmit` clean |
| 2026-08-04 | B3 part 1 (`invoice`) | 16 of 23: `InvoiceGrid`, `PaymentCancellationErrorDialog`, `Pagination`, `ConsolidatedInfoTooltip`, `InvoiceTotals`, `CustomerCombobox`, `LinkedPaymentsTooltip`, `InvoiceSelectionTable`, `MultiCustomerCombobox`, `InvoiceHeader`, `InvoiceCard`, `LineItemsTable`, `InvoiceDailyPrintMenu`, `SubmissionResultsModal`, `InvoiceFilterMenu`, `ReceiptDetailsDialog` | new `invoice` namespace: 220 keys (ms + zh-Hans each) | None 窶・remaining 7 files shipped in B3 part 2 (see B3 part 2 row) | No PDF files exist under these globs, so §4.1 excluded nothing. `npm run i18n:report` green; `tsc --noEmit` clean. Every touched file is fully converted — none left half-done |
| 2026-08-04 | B1 (`common`) | 13 of 22: `BackButton`, `BackupModal`, `ConfirmationDialog`, `ContributionListbox`, `DateNavigator`, `DateRangePicker`, `FormComponents`, `ListboxSelect`, `LoadingSpinner`, `MonthNavigator`, `StatusIndicator`, `StyledListbox`, `TimeNavigator` | common +115 (ms + zh-Hans each); `en/common.json` +2 semantic keys (`day`, `range`) | `Button`, `Checkbox`, `PillSelect`, `Tab`, `SafeLink`, `HoverTooltip`, `ToolTip`, `CompanySwitcher` (no own literals — all text arrives via props/DB); `ChangelogModal` (done in Phase 0) | Also fixed i18n init (see B1 notes). `npm run i18n:report` green; `tsc --noEmit` clean. No changelog entry — Phase 0's entry already announces staged page-by-page coverage |

| 2026-08-07 | B3 part 2 (`invoice`) | `PaymentTable`, `ConsolidatedInvoiceModal`, `PaymentForm`, `ConsolidatedInvoiceDetailsPage`, `InvoiceFormPage`, `InvoiceListPage`, `InvoiceDetailsPage` | invoice +576 keys (ms + zh-Hans each; total 796) | None — no PDF files under the globs | All 7 remaining Invoice files fully converted; `npm run i18n:report` green; `tsc --noEmit` clean. `saleTenders.ts` gained an optional `t` parameter (backward-compatible) so its validation messages translate in the Tien Hock form. |
| 2026-08-07 | BM tone audit (all ms locales) | `ms/common.json`, `ms/nav.json`, `ms/home.json`, `ms/invoice.json` (values only) | 0 new keys | 窶・| Replaced formal/university-level BM with plain English loanwords (Konsolidasi, Submission, Cancellation, Confirmation, Pending, Eligible, History, Summary, Range, Results, Check, Window, Preview, Rounding, Subtotal, Journal Entry, Ledger, Debtor, Sync, Transfer, Browser, Dashboard, Payroll, Production, etc.) per user decision; everyday BM kept. Keys/behaviour untouched; `npm run i18n:report` green |

| 2026-08-07 | B2 (`auth`, `nav`) | `src/pages/Auth/Login.tsx` | new `auth` namespace: 10 keys (ms + zh-Hans each) | `ProtectedRoute.tsx`, `pagesRoute.tsx` (no user-facing literals) | `auth` wired into `src/i18n/index.ts`; `npm run i18n:report` green; `tsc --noEmit` clean |
| 2026-08-07 | B4 (`payments`/`adjustments`/`sales`) | `PaymentPage`, `AdjustmentDocsDetailsPage`, `AdjustmentDocsFormPage`, `AdjustmentDocsListPage`, `AdjustmentDocBadge`, `GTInvoiceAdjustmentDocsSection`, `InvoiceAdjustmentDocsSection`, `SalesSummarySelectionTooltip` | new namespaces: payments 16 + adjustments 226 + sales 25 = 267 keys (ms + zh-Hans each) | `useAdjustmentDocsPaths.ts` (no user-facing literals) | Three new namespaces wired into `src/i18n/index.ts`; `npm run i18n:report` green; `tsc --noEmit` clean |
| 2026-08-07 | B5 (`sales`) | `SalesByProductsPage`, `SalesBySalesmanPage` | sales +68 keys (ms + zh-Hans each; total 93) | `JellyPollySalesSummaryPage`, `SalesSummaryPage` (no user-facing literals) | `npm run i18n:report` green; `tsc --noEmit` clean |
| 2026-08-07 | B6 (`catalogue`) | All 15 files under `src/pages/Catalogue/**`: `CustomerPage`, `CustomerDetailsPage`, `CustomerAddPage`, `CustomerFormPage`, `StaffPage`, `StaffDetailsPage`, `StaffAddPage`, `StaffFormPage`, `StaffRecords`, `ProductPage`, `JobCategoryPage`, `JobPage`, `LocationPage`, `PayCodePage`, `OthersPage` | catalogue +233 keys (ms + zh-Hans each; 166 → 399) | None | `catalogue` namespace registered in `src/i18n/index.ts`. `npm run i18n:report` green; `tsc --noEmit` clean. Fixed remaining raw strings in `JobPage` (list-view header/cards/combobox) and `JobCategoryPage` (Salary/Follow/JV column headers). `ProductPage` permanent-delete `<Trans>` uses a JS expression for the `i18nKey` (JSX attribute strings cannot contain `\"` escapes) |
| 2026-08-07 | B7 (`catalogue`) | All 27 files under `src/components/Catalogue/**`: `RefreshPayCodeCacheButton`, `SelectedTagsDisplay`, `StaffLocationsDisplay`, `CustomersUsingProductTooltip`, `JobsAndEmployeesUsingPayCodeTooltip`, `CustomerCreditSection`, `CustomerCard`, `StaffFilterMenu`, `ProductModal`, `JobCategoryModal`, `NewPayCodeModal`, `NewJobModal`, `PayCodeModal`, `PayRateScheduleManager`, `ProductOrderModal`, `AssociateEmployeesWithJobModal`, `AssociatePayCodesWithJobsModal`, `AssociatePayCodesWithEmployeesModal`, `BatchManageJobPayCodesModal`, `BatchManageEmployeePayCodesModal`, `EditEmployeePayCodeRatesModal`, `EditPayCodeRatesModal`, `CustomerProductsTab`, `CustomerTransactionsTab`, `BranchLinkageModal`, `LocationModal`, `StaffPayCodesSection` | catalogue +410 keys (ms + zh-Hans each; 399 → 819, incl. 10 dynamic lookup keys: Paid/Unpaid/Overdue/Overpaid/Pending/Cancelled, Cannot Delete Job/Location, Job category updated successfully, Staff member updated successfully!) | None | `ProductOrderModal` was hardcoded in Malay and is now translated. `PayRateScheduleManager` month names reuse `common` Jan–Dec keys; Trans used for inline-strong sentences. `npm run i18n:report` green; `tsc --noEmit` clean |
| 2026-08-07 | B8 part 1 (`payroll`) | 18 of 24 files under `src/pages/Payroll/**`: `Leave/CutiManagementPage`, `Statutory/ContributionRatesPage`, `DailyLog/DailyLogEditPage`, `DailyLog/DailyLogSalesmanEditPage`, `MonthlyLog/MonthlyLogEditPage`, `Leave/HolidayCalendarPage`, `Leave/PackingCutiEntryPage`, `AddOn/BonusPage`, `AddOn/OthersAdvancePage`, `AddOn/OthersKerjaLuarOtPage`, `AddOn/PinjamListPage`, `AddOn/MidMonthPayrollPage`, `DailyLog/DailyLogListPage`, `MonthlyLog/MonthlyLogListPage`, `DailyLog/DailyLogDetailsPage`, `MonthlyLog/MonthlyLogDetailsPage`, `Leave/CutiReportPage`, `Statutory/ECarumanPage`, `PayrollPage` | new `payroll` namespace: 399 keys (ms + zh-Hans each) | Remaining 5 files (see next B8 row) | Registered `payroll` in `src/i18n/index.ts`. Leave-type labels standardised to Annual/Sick/Public Holiday/Medical Leave; `CutiReportPage` legend uses Trans; `ECarumanPage` preview tables translated, export file contents left raw. Dynamic lookup keys also added: January\u2013December, Monday\u2013Sunday, `summary`/`pinjam`, `Sabtu`, `Biasa/Ahad/Umum Rate`, `Hospital Leave`. `npm run i18n:report` green; `tsc --noEmit` clean |
| 2026-08-07 | B8 part 2 (`payroll`) | Last 5 files under `src/pages/Payroll/**`: `MonthlyLog/MonthlyLogEntryPage`, `PayrollDetailsPage`, `DailyLog/DailyLogEntryPage`, `DailyLog/DailyLogSalesmanEntryPage`, `SalaryReportPage` | payroll +295 keys (ms + zh-Hans each; 399 -> 694) | None | Hardcoded Malay labels de-Malay-ified to English keys with the original Malay kept as the `ms` value (Digenapkan -> Rounding, Jumlah Digenapkan -> Rounded Total, Ikut amaun -> By amount, Jumlah lain-lain -> Total Others, Cuti Records -> Leave Records, NAMA PEKERJA -> STAFF NAME, GAJI -> SALARY, 1/2 BULAN -> 1/2 MONTH, etc.); statutory acronyms (EPF/SOCSO/SIP/PCB) and column-guide pay-code IDs stay raw. `dev/i18n-extract.mjs` added as the coverage extractor helper. `npm run i18n:report` green; `tsc --noEmit` clean except the pre-existing `AccountLedgerPage.tsx` error from unrelated staged accounting work |
| 2026-08-07 | B9 part 1 (`payroll`) | 9 files under `src/components/Payroll/ContributionRates/**`: `EPFRateEditModal`, `EPFRatesTab`, `IncomeTaxRateCreateModal`, `IncomeTaxRateEditModal`, `IncomeTaxRatesTab`, `SIPRateEditModal`, `SIPRatesTab`, `SOCSORateEditModal`, `SOCSORatesTab` | payroll +62 keys (ms + zh-Hans each; 694 -> 756) | None | Contribution-rate tables/modals fully converted; employee-type labels (`Local Employees (Under 60)` etc.) translated at the render sink via `t(getEmployeeTypeLabel(...))`; wage-range "and above" interpolated; SOCSO `Keilatan`/`SKBBK` and statutory acronyms stay raw; SOCSO group headers de-Malay-ified (`Under 60 (Jenis Pertama)` -> key `Under 60 (First Type)`, `60 and Above (Jenis Kedua)` -> key `60 and Above (Second Type)`). `i18n:report` green; `tsc` clean except pre-existing `AccountLedgerPage.tsx` error |
| 2026-08-07 | B9 part 2 (`payroll`) | 25 files under `src/components/Payroll/**` (root): `ActivitiesTooltip`, `AddIncentiveModal`, `AddManualItemModal`, `AddMidMonthPayrollModal`, `AddOthersModal`, `CompanySalaryReportTables`, `ContextLinkMessages`, `ContextLinkedBadge`, `CrossCompanyTakeHomeCard`, `DynamicContextForm` (no literals), `EditIncentiveModal`, `EditMidMonthPayrollModal`, `EditOthersModal`, `EmployeePayrollTableRow`, `HolidayFormModal`, `ImportHolidaysModal`, `LoadingOverlay`, `ManageActivitiesModal`, `MissingEPFNumberDialog`, `MissingIncomeTaxRatesDialog`, `MonthDayMultiPicker`, `PayrollSectionPrintMenu`, `PayrollUnifiedTable`, `PinjamFormModal`, `SalaryAmountTooltip` | payroll +211 keys (ms + zh-Hans each; 756 -> 967) | None (DynamicContextForm has no own literals; config-driven labels left raw, see B9 notes) | See B9 notes above; `i18n:report` green; `tsc --noEmit` clean except the pre-existing `AccountLedgerPage.tsx` error |
### Phase 0 implementation notes (for batch workers)

- **Sidebar labels are translated at render time** — `TienHockNavData.tsx` / `GreenTargetNavData.tsx` / `JellyPollyNavData.tsx` were NOT modified. Navbar components call `t(item.name, { ns: "nav" })`; the English name is the key. Same for dropdown `group` labels, popover options and bookmark names (bookmark identity stays English — stored bookmarks keep working).
- `ChangelogModal` follows the app language on open (zh → English entries; the corpus stays ms/en per §8) but keeps its own BM/ENG toggle.
- Several files (e.g. `NavbarUserMenu.tsx`, `NavbarMenu.tsx`, `NavbarDropdown.tsx`) have **mixed CRLF/LF line endings**; single-line edits match reliably, multi-line blocks across CRLF regions may not — keep edits small or check with `cat -A`.
- The language switcher is in `NavbarUserMenu.tsx` (3-button segmented row). Detection: localStorage → browser locale; `zh-*` → `zh-Hans`, unmatched → `ms` (`resolveLanguage` in `src/i18n/index.ts`).
### B3 implementation notes (B3 complete 2026-08-07)

- **Namespace registered:** `invoice` is wired into `src/i18n/index.ts` for `ms` and `zh-Hans`. Part 2 only adds keys — no init changes needed.
- **Cross-namespace lookups use the options form**, never a colon: `t("cancel", { ns: "common" })`. `nsSeparator` is `false` (B1 note), so `t("common:cancel")` would be treated as a literal key and silently render the raw string.
- **Status labels are translated at the render sink only.** `InvoiceCard` compares `invoiceStatusStyle.label === "Unpaid" | "Overdue"` to decide whether the badge opens the payment form, and `SubmissionResultsModal`/`ReceiptDetailsDialog` branch on raw server statuses. The helpers (`getInvoiceDisplayStatusLabel` in `src/utils/invoice/invoiceDisplayStatus.ts`, and the local `getStatusLabel`/`getDocInfo`) still return **English**; only `{t(label)}` in JSX is translated. Do not "tidy" this by translating inside the helpers — it would break the click behaviour.
- **Dropdown/filter options:** in `InvoiceFilterMenu` every `id` (`"paid"`, `"Unpaid"`, `"Cash"`, `"null"`, …) is the raw filter/API value and is untouched; only `name` is wrapped. Same rule in `InvoiceHeader`, where the `"I"`/`"C"` pill values stay raw and the options moved into a `useMemo` so the labels can be translated.
- **Module-level helpers that build display text** (`ReceiptDetailsDialog`'s `getAllocationTitle`, `getStatusLabel`, `formatReceiptDate`) now take `t: TFunction` as their last parameter — they sit outside the component and cannot call the hook.
- **Phrase-level interpolation** is used for the cancellation/confirmation sentences in `ReceiptDetailsDialog` (`{{scope}}` is itself a translated noun phrase). This is the documented escape hatch when a sentence has too many shapes for one key; it is still never word-level concatenation (§3).
- **Manual plurals** (no i18next `count`): `("{{total}} more issue)"/"issues"`, `"{{total}} payment"/"payments"`, `"Cheque number"/"numbers"`, `"Journal entry"/"entries"`, `"{{total}} payment amount"/"amounts"`. Interpolation variables are deliberately **not** named `count`, which would activate plural-key resolution and miss the flat key.
- **Not translated on purpose:** `item.description = "LESS AMOUNT"` in `LineItemsTable` (persisted invoice line data, §4.2), the `invoiceStatus` API query string in `InvoiceDailyPrintMenu`, and all salesman/customer/product names.

### B1 implementation notes (read before B2)

- **`src/i18n/index.ts` now sets `keySeparator: false` and `nsSeparator: false`.** This is a required correction to Phase 0, not a preference: with i18next's defaults, `.` is a nested-path separator and `:` is a namespace separator, so English-as-key sentences like `"Nothing found."` or `"Download failed with status: {{status}}"` were being parsed as paths/namespaces instead of looked up flat. All locale files are flat, so nothing else changes. **Every later batch depends on this** — sentence keys with punctuation are the norm from here on.
- **Default prop values that were display strings** (`placeholder = "Select..."`, `placeholder = "Search..."`, `placeholder = "All dates"`, `children = "Back"`) were changed to optional props resolved at the render site (`placeholder ?? t("Select...")`). Callers are unaffected; the string can no longer be baked in before the hook runs.
- **Short high-frequency words use the §3 semantic keys** (`t("cancel")`, `t("confirm")`, `t("create")`, `t("delete")`, `t("download")`, `t("actions")`, `t("back")`, `t("to")`) — these resolve in English through `en/common.json`. Only use a semantic key that already exists in `en/common.json`; anything else must be English-as-key or English renders the raw key. `day` and `range` were added for `TimeNavigator`'s granularity tabs.
- **One deliberate English text change:** `DateRangePicker`'s separator between the two date inputs was the lowercase word `to` and now renders `t("to")` → "To" / "Hingga" / "至".
- **`BackupModal` uses `<Trans>` once** for the "…replaces all current data in **{db}**." sentence, to keep the `<strong>` around the database name without splitting the sentence (§3 forbids concatenating fragments). Pattern: `i18nKey` carries `<strong>{{db}}</strong>`, `components={{ strong: <strong /> }}`. Reuse this whenever a sentence has inline markup.
- **`t` added to `useCallback`/`useEffect` dependency arrays** in `BackupModal` (`fetchBackups`, `checkRestoreStatus`, the navigation-lock effect). `t` changes identity on language switch, which is what makes an open modal re-render in the new language.
- Skipped files are skipped because they own no literals — if a later batch adds one, the file has to be converted then.

- Manual smoke test passed? → **pending user verification** (dev server: switch language in user menu, confirm navbar + sidebar + HomePage re-render in all 3 languages, confirm a `zh-CN` browser profile defaults to 简体中文 and an unmatched locale defaults to Bahasa Melayu).
