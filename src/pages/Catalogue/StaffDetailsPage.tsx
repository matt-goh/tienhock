// src/pages/Catalogue/StaffDetailsPage.tsx
// Read-only "at a glance" view of a single staff member. All fields are shown
// as plain text; the only editable part is the Associated Pay Codes section
// (shared with StaffFormPage). An "Edit" button opens the full editable form
// at /catalogue/staff/:id/edit.
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IconPencil } from "@tabler/icons-react";
import { Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import StaffPayCodesSection from "../../components/Catalogue/StaffPayCodesSection";

const CONTRIBUTION_AGE_LABELS: Record<string, string> = {
  auto: "Auto (from birthdate)",
  under_60: "Under 60",
  over_60: "60 & Above",
  none: "Not Eligible",
  "": "Auto (from birthdate)",
};
const EPF_NATIONALITY_LABELS: Record<string, string> = {
  auto: "Auto (from nationality)",
  local: "Local",
  foreign: "Foreign",
  "": "Auto (from nationality)",
};

// A single read-only label + value pair.
const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({
  label,
  value,
}) => {
  const isEmpty =
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value === "number" && Number.isNaN(value));
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-default-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-sm text-default-900 dark:text-gray-100 break-words">
        {isEmpty ? (
          <span className="text-default-400 dark:text-gray-500">—</span>
        ) : (
          value
        )}
      </p>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="border-t border-default-200 dark:border-gray-700 pt-6 mt-6 first:border-t-0 first:pt-0 first:mt-0">
    <h3 className="text-base font-medium text-default-800 dark:text-gray-100 mb-4">
      {title}
    </h3>
    {children}
  </div>
);

const StaffDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { allStaffs, loading: loadingStaffs } = useStaffsCache();
  const { jobs } = useJobsCache();

  const [staff, setStaff] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    if (loadingStaffs) return;

    const cached = allStaffs.find((s) => s.id === id);
    if (cached) {
      setStaff(cached);
      setError(null);
      setLoading(false);
      return;
    }

    // Fallback to API if not present in the cache.
    let cancelled = false;
    setLoading(true);
    api
      .get(`/api/staffs/${id}`)
      .then((data: Employee) => {
        if (cancelled) return;
        setStaff(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error fetching staff details:", err);
        setError("Staff member not found.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, allStaffs, loadingStaffs]);

  if (loading || loadingStaffs) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="container mx-auto px-4 py-6">
        <BackButton onClick={() => navigate("/catalogue/staff")} />
        <div className="mt-4 p-4 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded">
          {error || "Staff member not found."}
        </div>
      </div>
    );
  }

  const jobName = (jobId: string): string =>
    jobs.find((j) => j.id === jobId)?.name || jobId;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-default-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <BackButton onClick={() => navigate("/catalogue/staff")} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                  {staff.name}
                </h1>
                {staff.id && (
                  <span className="px-2.5 py-0.5 text-sm font-mono font-medium bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded-full">
                    {staff.id}
                  </span>
                )}
                {staff.dateResigned && (
                  <span className="px-2.5 py-0.5 text-sm font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                    Resigned
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button
            type="button"
            color="sky"
            icon={IconPencil}
            onClick={() => navigate(`/catalogue/staff/${staff.id}/edit`)}
          >
            Edit
          </Button>
        </div>

        {/* Read-only fields */}
        <div className="px-6 py-5">
          <Section title="Personal">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5">
              <Field label="ID" value={staff.id} />
              <Field label="Name" value={staff.name} />
              <Field label="Telephone Number" value={staff.telephoneNo} />
              <Field label="Email" value={staff.email} />
              <Field label="Gender" value={staff.gender} />
              <Field label="Nationality" value={staff.nationality} />
              <Field label="Birthdate" value={staff.birthdate} />
              <Field label="Address" value={staff.address} />
            </div>
          </Section>

          <Section title="Work">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div className="space-y-1">
                <p className="text-xs font-medium text-default-500 dark:text-gray-400">
                  Jobs
                </p>
                {staff.job && staff.job.length > 0 ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {staff.job.map((jobId) => (
                      <span
                        key={jobId}
                        className="px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded"
                        title={jobId}
                      >
                        {jobName(jobId)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-default-400 dark:text-gray-500">—</p>
                )}
              </div>
              <Field label="Date Joined" value={staff.dateJoined} />
            </div>
            {/* Editable pay codes (the only interactive part of this page) */}
            <StaffPayCodesSection employee={staff} />
          </Section>

          <Section title="Documents">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5">
              <Field label="IC Number" value={staff.icNo} />
              <Field label="Bank Account Number" value={staff.bankAccountNumber} />
              <Field label="EPF Number" value={staff.epfNo} />
              <Field label="Income Tax Number" value={staff.incomeTaxNo} />
              <Field label="SOCSO Number" value={staff.socsoNo} />
              <Field label="Document" value={staff.document} />
              <Field label="Department" value={staff.department} />
              <Field label="KWSP Number" value={staff.kwspNumber} />
            </div>
          </Section>

          <Section title="Income Tax Information">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
              <Field label="Marital Status" value={staff.maritalStatus} />
              {staff.maritalStatus === "Married" && (
                <Field
                  label="Spouse Employment Status"
                  value={staff.spouseEmploymentStatus}
                />
              )}
              <Field
                label="Number of Children"
                value={staff.numberOfChildren ?? 0}
              />
            </div>
          </Section>

          <Section title="Contribution Settings">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5">
              <Field
                label="EPF Age"
                value={CONTRIBUTION_AGE_LABELS[staff.epfAgeOverride ?? "auto"]}
              />
              <Field
                label="EPF Rate Type"
                value={
                  EPF_NATIONALITY_LABELS[staff.epfNationalityOverride ?? "auto"]
                }
              />
              <Field
                label="SOCSO Age"
                value={CONTRIBUTION_AGE_LABELS[staff.socsoAgeOverride ?? "auto"]}
              />
              <Field
                label="SIP Age"
                value={CONTRIBUTION_AGE_LABELS[staff.sipAgeOverride ?? "auto"]}
              />
            </div>
          </Section>

          <Section title="Additional">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-5">
              <Field label="Payment Type" value={staff.paymentType} />
              <Field label="Payment Preference" value={staff.paymentPreference} />
              <Field label="Race" value={staff.race} />
              <Field label="Agama" value={staff.agama} />
              <Field label="Date Resigned" value={staff.dateResigned} />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
};

export default StaffDetailsPage;
