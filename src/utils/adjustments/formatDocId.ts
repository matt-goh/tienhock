// src/utils/adjustments/formatDocId.ts
// Adjustment Document IDs are stored URL-safe with dashes (e.g. "TH-CN-26-1")
// so they can be used directly as route/path segments, but are displayed to
// users with slashes (e.g. "TH/CN/26/1"). Only the new numbering scheme is
// reformatted — legacy ids (e.g. "CN-2026-0001") and other ids pass through
// unchanged.
const NEW_ID_RE = /^(TH|JP|GT)-(CN|DN|RN)-(\d{2})-(\d+)$/;

export function formatAdjustmentDocId(id?: string | null): string {
  if (!id) return id ?? "";
  const m = NEW_ID_RE.exec(id);
  return m ? `${m[1]}/${m[2]}/${m[3]}/${m[4]}` : id;
}
