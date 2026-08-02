// dev/import/greentarget-legacy/backfill-g7-organic.mjs
//
// ⚠ SUPERSEDED — HISTORICAL RECORD ONLY. This script refuses to run.
//
// Phase G7 (28 Jul 2026) used this script to post the organic journals for the
// three Green Target documents keyed between the 2026-07-01 cutover and G7
// going live, by calling the REAL shipped services:
//
//   invoice 325 (2026/01012, RM200, active)  -> syncGTSalesJournalEntry
//   invoice 326 (2026/01014, RM250, paid)    -> syncGTSalesJournalEntry
//   payment 197 (invoice 326, RV26/07/01)    -> syncGTPaymentJournalEntry
//
// GT-P1 (30 Jul 2026) replaced the per-PAYMENT journal with a per-RECEIPT one:
// `greentarget.receipts` is now the durable header and owns exactly one
// consolidated `GTR-{receipt_id}` REC journal (one aggregate DR PBB_1, one
// debtor credit per allocation), which is the shape the legacy RV#/#/# groups
// actually print. `syncGTPaymentJournalEntry` and its update/cancel siblings
// were deleted from
// `src/routes/greentarget/accounting/payment-journal.js` because leaving them
// exported was a double-post hazard: re-running this script would have added a
// second `REC-197` journal beside the receipt journal that already carries the
// same RM250, and its verify() gate (`reference_no === "REC-197"`) no longer
// describes the live data at all.
//
// The three documents this script backfilled were subsequently re-synced onto
// their GT-P1 accounts by `apply-july-lifecycle-decisions.mjs` and
// `backfill-july-automatic-journals.mjs` (handover §10i, GT-P4). Those two
// scripts are the supported way to reconcile July documents; use them instead.

console.error(
  [
    "backfill-g7-organic.mjs is superseded and will not run.",
    "",
    "GT-P1 moved the receipt journal from the payment to the receipt header,",
    "so this script's per-payment posting path no longer exists. Re-running it",
    "would double-post payment 197.",
    "",
    "Use instead:",
    "  node dev/import/greentarget-legacy/apply-july-lifecycle-decisions.mjs",
    "  node dev/import/greentarget-legacy/backfill-july-automatic-journals.mjs",
    "",
    "See docs/Account/GT_ACCOUNTING_HANDOVER.md sections 10i (GT-P1, GT-P4).",
  ].join("\n")
);
process.exitCode = 1;
