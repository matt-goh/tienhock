# Legacy Report Verification Fixtures — Permanent Audit Evidence

This directory holds the **only independent proof of the Jan–May 2026 books**: the nine scanned
legacy-system reports (Jan–May monthly Trial Balances, May Balance Sheet / Detail Income
Statement / CoGM / Trade Debtor List), the deterministic CSV fixtures transcribed from them, and
the harness that keeps the ERP 1:1 with them. The full record lives in
`docs/Account/LEGACY_REPORT_VERIFICATION_PLAN.md` (Phases V0–V4) and
`docs/Account/LEGACY_REPORT_RECONCILIATION.md`.

## Layout

- `data/` — **PRIVATE, gitignored, never delete.** The nine source scan PDFs and the ten
  transcribed CSV fixtures (customer data). Permanent audit evidence.
- `generated/` — gitignored. Rendered scan pages plus the validation/comparison JSON reports
  (regenerable by re-running the gates; kept for provenance).
- Tracked: `source-manifest.json` (SHA-256 pins of every source PDF and fixture),
  `scan-code-exceptions.json` (the named printed→ERP code exceptions),
  `render-pdf.mjs` / `crop-page.mjs` (scan renderers), `validate-fixtures.mjs` (V0 file-only
  validator), `verify-legacy-reports.mjs` (V1+ DB comparison harness), this README.

## Retention rule

The scans and fixtures are **permanent**: do not delete, move, compress away, or commit them.
They are the audit evidence behind the V2 opening-stock correction (63 `CS_*` zero fences + 62
`OS_*` anchors = RM626,875.15) and the V3 closing-stock / debtor parity. Everything is
hash-pinned: if a hash or arithmetic gate ever fails, treat the fixture as right until the scan
image itself proves otherwise (house rule — no silent fixture edits).

## Standing regression gate

Requires the `tienhock_dev_db` Docker container. Run both; expect `ALL CHECKS PASSED` and
`ALL STAGES GREEN`:

```bash
node dev/import/legacy-report-fixtures/validate-fixtures.mjs
node dev/import/legacy-report-fixtures/verify-legacy-reports.mjs
```

`VERIFY_DB=<name> node dev/import/legacy-report-fixtures/verify-legacy-reports.mjs` runs the
harness against a different database in the same container (used for clone rehearsals; default
`tienhock`).

The harness pins the post-V3 state: TB 880/880 exact, Trade Debtor List 150/150 exact
(including signed-ledger FIFO aging), statements 36/40 exact plus the four named
`GP-202604-0001` drift lines (±RM7,261.51 — a genuine April invoice keyed after the scans were
exported). Any further backdated Jan–May production entry fails the gate loudly: confirm
genuineness, then re-pin as another named deviation; never silence it.
