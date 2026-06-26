// src/utils/adjustments/formatDocId.js
// Server-side twin of formatDocId.ts. Adjustment Document IDs are stored
// URL-safe with dashes (e.g. "TH-CN-26-1") but presented with slashes
// (e.g. "TH/CN/26/1") on documents/e-invoices. Only the new numbering scheme
// is reformatted; legacy/other ids pass through unchanged.
const NEW_ID_RE = /^(TH|JP|GT)-(CN|DN|RN)-(\d{2})-(\d+)$/;

export function formatAdjustmentDocId(id) {
  if (!id) return id ?? "";
  const m = NEW_ID_RE.exec(id);
  return m ? `${m[1]}/${m[2]}/${m[3]}/${m[4]}` : id;
}
