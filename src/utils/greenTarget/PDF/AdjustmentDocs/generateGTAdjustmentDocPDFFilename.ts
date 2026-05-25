// src/utils/greenTarget/PDF/AdjustmentDocs/generateGTAdjustmentDocPDFFilename.ts

// Minimal shape so the filename helper doesn't need to know about full GT
// doc structure — accepts anything with id + date_issued.
export interface GTAdjustmentDocFilenameInput {
  id: string;
  date_issued: string | null;
}

export const generateGTAdjustmentDocPDFFilename = (
  docs: GTAdjustmentDocFilenameInput[]
): string => {
  if (!docs || docs.length === 0) {
    return "no-greentarget-adjustment-docs.pdf";
  }

  if (docs.length === 1) {
    return `GT_${docs[0].id}.pdf`;
  }

  const sorted = [...docs].sort((a, b) => {
    const ta = a.date_issued ? new Date(a.date_issued).getTime() : 0;
    const tb = b.date_issued ? new Date(b.date_issued).getTime() : 0;
    return ta - tb;
  });

  const formatDate = (iso: string | null | undefined): string => {
    if (!iso) return "nodate";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "nodate";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  };

  const startDate = formatDate(sorted[0].date_issued);
  const endDate = formatDate(sorted[sorted.length - 1].date_issued);

  if (startDate === endDate) {
    return `GT_AdjustmentDocs_${startDate}.pdf`;
  }
  return `GT_AdjustmentDocs_${startDate}_to_${endDate}.pdf`;
};
