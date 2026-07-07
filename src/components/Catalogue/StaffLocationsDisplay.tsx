// src/components/Catalogue/StaffLocationsDisplay.tsx
// Read-only display of a staff member's locations, used on the staff details
// pages (TH + JP). Shows two categories:
//   - "Assigned": locations set directly on the staff (staffs.location JSONB),
//     kept in sync with the Location page's Employees tab.
//   - "From jobs": locations inherited from the staff's jobs via the
//     job -> location mappings.
// The salary report resolves a staff's location as: first assigned location,
// else the first job-mapped location.
import React from "react";
import { IconMapPin } from "@tabler/icons-react";

interface DirectLocation {
  code: string;
  name: string;
}

interface JobLocation {
  jobId: string;
  jobName: string;
  code: string;
  name: string;
}

interface StaffLocationsDisplayProps {
  directLocations: DirectLocation[];
  jobLocations: JobLocation[];
}

const captionCls =
  "text-[10px] uppercase tracking-wide text-default-400 dark:text-gray-500 shrink-0";
const emptyCls = "text-xs text-default-400 dark:text-gray-500 italic";

const StaffLocationsDisplay: React.FC<StaffLocationsDisplayProps> = ({
  directLocations,
  jobLocations,
}) => {
  const hasAny = directLocations.length > 0 || jobLocations.length > 0;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-default-500 dark:text-gray-400">
        Locations
      </p>
      {!hasAny ? (
        <p className="text-sm text-default-400 dark:text-gray-500">—</p>
      ) : (
        <div className="space-y-1.5">
          {/* Directly assigned */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={captionCls}>Assigned</span>
            {directLocations.length > 0 ? (
              directLocations.map((loc) => (
                <span
                  key={loc.code}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 rounded"
                  title={`${loc.code}: ${loc.name}`}
                >
                  <IconMapPin size={12} />
                  {loc.name}
                </span>
              ))
            ) : (
              <span className={emptyCls}>None</span>
            )}
          </div>

          {/* Inherited from jobs */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={captionCls}>From jobs</span>
            {jobLocations.length > 0 ? (
              jobLocations.map((jl) => (
                <span
                  key={`${jl.jobId}-${jl.code}`}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded"
                  title={`${jl.jobName} → ${jl.code}: ${jl.name}`}
                >
                  {jl.name}
                  <span className="text-[10px] font-normal text-indigo-500/70 dark:text-indigo-300/60">
                    via {jl.jobName}
                  </span>
                </span>
              ))
            ) : (
              <span className={emptyCls}>None</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffLocationsDisplay;
