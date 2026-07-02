// src/utils/adjustments/PDF/generateAdjustmentDocPDFFilename.ts
import { AdjustmentDocument } from "../../../types/types";

export const generateAdjustmentDocPDFFilename = (
  docs: AdjustmentDocument[],
  companyContext: "tienhock" | "jellypolly" = "tienhock"
): string => {
  if (!docs || docs.length === 0) {
    return "no-adjustment-docs.pdf";
  }

  const prefix = companyContext === "jellypolly" ? "JP" : "TH";

  if (docs.length === 1) {
    return `${prefix}_${docs[0].display_id || docs[0].id}.pdf`;
  }

  const sorted = [...docs].sort((a, b) => {
    const ta = Number(a.createddate) || 0;
    const tb = Number(b.createddate) || 0;
    return ta - tb;
  });

  const formatDate = (unixMs: number): string => {
    const d = new Date(unixMs);
    if (isNaN(d.getTime())) return "nodate";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  };

  const startDate = formatDate(Number(sorted[0].createddate));
  const endDate = formatDate(Number(sorted[sorted.length - 1].createddate));

  if (startDate === endDate) {
    return `${prefix}_AdjustmentDocs_${startDate}.pdf`;
  }
  return `${prefix}_AdjustmentDocs_${startDate}_to_${endDate}.pdf`;
};
