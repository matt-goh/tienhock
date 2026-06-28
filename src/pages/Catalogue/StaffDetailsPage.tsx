// src/pages/Catalogue/StaffDetailsPage.tsx
// Read-only "at a glance" view of a single staff member. All fields are shown
// as plain text; the only editable part is the Associated Pay Codes section
// (shared with StaffFormPage). An "Edit" button opens the full editable form
// at /catalogue/staff/:id/edit.
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  IconPencil,
  IconCrown,
  IconUsers,
  IconUserPlus,
  IconExternalLink,
  IconChevronDown,
} from "@tabler/icons-react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useStaffFormOptions } from "../../hooks/useStaffFormOptions";
import StaffPayCodesSection from "../../components/Catalogue/StaffPayCodesSection";

interface SameNameStaff {
  id: string;
  name: string;
  headStaffId: string | null;
  job: string[];
  isHead: boolean;
}

const mapDisplayNameToId = (
  displayName: string | undefined,
  options: { id: string; name: string }[]
): string => {
  if (!displayName) return "";
  const byName = options.find(
    (o) => o.name.toLowerCase() === displayName.toLowerCase()
  );
  if (byName) return byName.id;
  const byId = options.find((o) => o.id === displayName);
  return byId ? displayName : "";
};

// Head-configuration control shown in the page header next to the ID pill.
// Only renders when the staff shares a name with other records (the case where
// a "Head" needs to be designated for location-based salary reporting).
const SameNameHeadControl: React.FC<{ staff: Employee }> = ({ staff }) => {
  const navigate = useNavigate();
  const { refreshStaffs } = useStaffsCache();
  const { options } = useStaffFormOptions();
  const [siblings, setSiblings] = useState<SameNameStaff[]>([]);
  const [isUnique, setIsUnique] = useState(true);
  const [loading, setLoading] = useState(true);
  const [settingHead, setSettingHead] = useState(false);

  const fetchSiblings = useCallback(async () => {
    if (!staff.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/staffs/same-name/${staff.id}`);
      setSiblings(res.sameNameStaff || []);
      setIsUnique(res.isUniqueName);
    } catch (e) {
      console.error("Error fetching same-name staff:", e);
      setSiblings([]);
      setIsUnique(true);
    } finally {
      setLoading(false);
    }
  }, [staff.id]);

  useEffect(() => {
    fetchSiblings();
  }, [fetchSiblings]);

  const handleSetHead = async (newHeadId: string) => {
    if (!staff.name || settingHead) return;
    const currentHead = siblings.find((s) => s.isHead);
    if (currentHead?.id === newHeadId) return;
    setSettingHead(true);
    try {
      await api.put("/api/staffs/set-head", {
        headStaffId: newHeadId,
        staffName: staff.name,
      });
      await fetchSiblings();
      await refreshStaffs();
      toast.success("Head staff updated successfully");
    } catch (e) {
      console.error("Error setting head staff:", e);
      toast.error("Failed to update head staff");
    } finally {
      setSettingHead(false);
    }
  };

  const handleAddNew = () => {
    const prefillData = {
      name: staff.name,
      telephoneNo: staff.telephoneNo,
      email: staff.email,
      gender: staff.gender,
      nationality: mapDisplayNameToId(staff.nationality, options.nationalities),
      birthdate: staff.birthdate,
      address: staff.address,
      icNo: staff.icNo,
      bankAccountNumber: staff.bankAccountNumber,
      epfNo: staff.epfNo,
      incomeTaxNo: staff.incomeTaxNo,
      socsoNo: staff.socsoNo,
      paymentType: staff.paymentType,
      paymentPreference: staff.paymentPreference,
      race: mapDisplayNameToId(staff.race, options.races),
      agama: mapDisplayNameToId(staff.agama, options.agama),
      maritalStatus: staff.maritalStatus,
      spouseEmploymentStatus: staff.spouseEmploymentStatus,
      numberOfChildren: staff.numberOfChildren,
      kwspNumber: staff.kwspNumber,
      department: staff.department,
    };
    navigate("/catalogue/staff/new", { state: { prefillData } });
  };

  // Nothing to configure when this is a unique name.
  if (loading || isUnique || siblings.length <= 1) return null;

  const headSibling = siblings.find((s) => s.isHead);
  const isThisHead = headSibling?.id === staff.id;

  return (
    <Popover className="relative">
      <PopoverButton
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-sm font-medium rounded-full border transition-colors focus:outline-none ${
          isThisHead
            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700 hover:bg-amber-200/70 dark:hover:bg-amber-900/60"
            : "bg-default-100 dark:bg-gray-700 text-default-700 dark:text-gray-200 border-default-200 dark:border-gray-600 hover:bg-default-200 dark:hover:bg-gray-600"
        }`}
        title="Manage which record is the Head"
      >
        <IconCrown size={14} className={isThisHead ? "" : "text-amber-500"} />
        <span>
          {isThisHead
            ? "Head"
            : headSibling
            ? `Head: ${headSibling.id}`
            : "Set Head"}
        </span>
        <span className="text-xs px-1.5 rounded-full bg-white/60 dark:bg-black/20">
          {siblings.length}
        </span>
        <IconChevronDown size={14} />
      </PopoverButton>
      <PopoverPanel className="absolute left-0 z-30 mt-2 w-80 origin-top-left rounded-xl border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
        {({ close }) => (
          <div className="p-2">
            <div className="flex items-center justify-between px-2 py-1.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-default-800 dark:text-gray-100">
                <IconUsers size={16} className="text-default-500" />
                Same-Name Staff ({siblings.length})
              </div>
              <button
                type="button"
                onClick={() => {
                  close();
                  handleAddNew();
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors"
              >
                <IconUserPlus size={14} />
                Add
              </button>
            </div>
            <p className="px-2 pb-2 text-xs text-default-400 dark:text-gray-500">
              Choose who is the Head — used for location determination in salary
              reports.
            </p>
            <div className="max-h-72 overflow-auto space-y-1">
              {siblings.map((s) => (
                <div
                  key={s.id}
                  onClick={() => handleSetHead(s.id)}
                  className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                    settingHead ? "cursor-wait opacity-60" : "cursor-pointer"
                  } ${
                    s.isHead
                      ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700"
                      : "bg-white dark:bg-gray-800 border-default-200 dark:border-gray-700 hover:border-sky-300 dark:hover:border-sky-600"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        s.isHead
                          ? "border-amber-500 bg-amber-500"
                          : "border-default-300 dark:border-gray-600"
                      }`}
                    >
                      {s.isHead && (
                        <IconCrown size={10} className="text-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-medium text-default-800 dark:text-gray-100">
                          {s.id}
                        </span>
                        {s.isHead && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
                            HEAD
                          </span>
                        )}
                        {s.id === staff.id && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded">
                            Current
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-default-500 dark:text-gray-400 truncate block">
                        {s.job.length > 0 ? s.job.join(", ") : "No job assigned"}
                      </span>
                    </div>
                  </div>
                  {s.id !== staff.id && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        close();
                        navigate(`/catalogue/staff/${s.id}`);
                      }}
                      className="p-1.5 text-default-400 hover:text-sky-500 dark:hover:text-sky-400 flex-shrink-0"
                      title="View this staff"
                    >
                      <IconExternalLink size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </PopoverPanel>
    </Popover>
  );
};

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
                <SameNameHeadControl staff={staff} />
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
