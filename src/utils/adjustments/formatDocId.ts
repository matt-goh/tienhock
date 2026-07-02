// src/utils/adjustments/formatDocId.ts
// Adjustment Document IDs are stored URL-safe with dashes (e.g. "TH-CN-26-1")
// so they can be used directly as route/path segments, but are displayed to
// users with slashes (e.g. "TH/CN/26/1"). Only the new numbering scheme is
// reformatted — legacy ids (e.g. "CN-2026-0001") and other ids pass through
// unchanged.
const NEW_ID_RE = /^(TH|JP|GT)-(CN|DN|RN)-(\d{2})-(\d+)$/;

export interface ParsedAdjustmentDocId {
  company: "TH" | "JP" | "GT";
  type: "CN" | "DN" | "RN";
  year: string;
  runningNumber: string;
}

export interface AdjustmentDocIdSource {
  id?: string | null;
  display_id?: string | null;
}

export function formatAdjustmentDocId(id?: string | null): string {
  if (!id) return id ?? "";
  const m = NEW_ID_RE.exec(id.replace(/\//g, "-"));
  return m ? `${m[1]}/${m[2]}/${m[3]}/${m[4]}` : id;
}

export function parseAdjustmentDocId(
  id?: string | null
): ParsedAdjustmentDocId | null {
  if (!id) return null;
  const m = NEW_ID_RE.exec(id.replace(/\//g, "-"));
  if (!m) return null;
  return {
    company: m[1] as ParsedAdjustmentDocId["company"],
    type: m[2] as ParsedAdjustmentDocId["type"],
    year: m[3],
    runningNumber: m[4],
  };
}

export function buildAdjustmentDocId(
  company: ParsedAdjustmentDocId["company"],
  type: ParsedAdjustmentDocId["type"],
  year: string,
  runningNumber: string | number
): string {
  return `${company}-${type}-${year}-${Number(runningNumber)}`;
}

export function getAdjustmentDocDisplayId(
  doc?: AdjustmentDocIdSource | null
): string {
  return doc?.display_id || doc?.id || "";
}

export function formatAdjustmentDocDisplayId(
  doc?: AdjustmentDocIdSource | null
): string {
  return formatAdjustmentDocId(getAdjustmentDocDisplayId(doc));
}
