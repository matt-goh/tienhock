// src/pages/JellyPolly/Payroll/JPCP8DPage.tsx
// Jelly Polly CP8D — shared CP8DPage on the JP-scoped API mount
// (jellypolly.cp8d_records); the add picker lists jellypolly.staffs, not the
// shared public.staffs cache.
import React, { useMemo } from "react";
import CP8DPage from "../../Payroll/Statutory/CP8DPage";
import { useJPStaffsCache } from "../../../utils/JellyPolly/useJPStaffsCache";

const JPCP8DPage: React.FC = () => {
  const { staffs } = useJPStaffsCache();

  const employeeOptions = useMemo(
    () =>
      staffs.map((staff) => ({
        id: staff.id,
        name: `${staff.name} (${staff.id})`,
      })),
    [staffs]
  );

  return (
    <CP8DPage
      apiBasePath="/jellypolly/api/cp8d"
      persistKey="jpCp8dYear"
      employeeOptions={employeeOptions}
    />
  );
};

export default JPCP8DPage;
