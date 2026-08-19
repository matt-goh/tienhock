// src/pages/GreenTarget/Payroll/GTCP8DPage.tsx
// Green Target CP8D — shared CP8DPage on the GT-scoped API mount
// (greentarget.cp8d_records; staff picker stays on the shared public.staffs cache).
import React from "react";
import CP8DPage from "../../Payroll/Statutory/CP8DPage";

const GTCP8DPage: React.FC = () => (
  <CP8DPage apiBasePath="/greentarget/api/cp8d" persistKey="gtCp8dYear" />
);

export default GTCP8DPage;
