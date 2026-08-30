// src/pages/Catalogue/StaffDetailsPage.tsx
// Read-only "at a glance" view of a single staff member. All fields are shown
// as plain text; payroll rows link to their full details, and the only editable
// part is the Associated Pay Codes section (shared with StaffFormPage). An
// "Edit" button opens the full editable form at /catalogue/staff/:id/edit.
import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  IconPencil,
  IconCrown,
  IconUsers,
  IconUserPlus,
  IconExternalLink,
  IconChevronDown,
  IconCash,
} from "@tabler/icons-react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useLocationMappingsCache } from "../../utils/catalogue/useLocationMappingsCache";
import { useStaffFormOptions } from "../../hooks/useStaffFormOptions";
import StaffPayCodesSection from "../../components/Catalogue/StaffPayCodesSection";
import StaffLocationsDisplay from "../../components/Catalogue/StaffLocationsDisplay";

interface SameNameStaff {
  id: string;
  name: string;
  headStaffId: string | null;
  job: string[];
  isHead: boolean;
}

interface StaffPayrollHistoryResponse {
  id: number | string;
  year: number | string;
  month: number | string;
  job_type?: string | null;
  section?: string | null;
  gross_pay?: number | string | null;
  net_pay?: number | string | null;
  setelah_digenapkan?: number | string | null;
}

interface StaffPayrollSummary {
  id: number;
  year: number;
  month: number;
  jobType: string;
  section: string;
  grossPay: number | null;
  displayedTotal: number | null;
  isRoundedTotal: boolean;
}

const parsePayrollAmount = (
  value: number | string | null | undefined
): number | null => {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }
  const amount: number = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

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
  const { t } = useTranslation("catalogue");
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
      toast.success(t("Head staff updated successfully"));
    } catch (e) {
      console.error("Error setting head staff:", e);
      toast.error(t("Failed to update head staff"));
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
        title={t("Manage which record is the Head")}
      >
        <IconCrown size={14} className={isThisHead ? "" : "text-amber-500"} />
        <span>
          {isThisHead
            ? t("Head")
            : headSibling
              ? t("Head: {{id}}", { id: headSibling.id })
              : t("Set Head")}
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
                {t("Same-Name Staff ({{total}})", {
                  total: siblings.length,
                })}
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
                {t("Add")}
              </button>
            </div>
            <p className="px-2 pb-2 text-xs text-default-400 dark:text-gray-500">
              {t(
                "Choose who is the Head — used for location determination in salary reports."
              )}
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
                            {t("HEAD")}
                          </span>
                        )}
                        {s.id === staff.id && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded">
                            {t("Current")}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-default-500 dark:text-gray-400 truncate block">
                        {s.job.length > 0
                          ? s.job.join(", ")
                          : t("No job assigned")}
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
                      title={t("View this staff")}
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

const StaffPayrollQuickView: React.FC<{ staff: Employee }> = ({ staff }) => {
  const { t, i18n } = useTranslation("catalogue");
  const [payrolls, setPayrolls] = useState<StaffPayrollSummary[]>([]);
  const [loadingPayrolls, setLoadingPayrolls] = useState<boolean>(true);
  const [payrollError, setPayrollError] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);

  useEffect(() => {
    let cancelled: boolean = false;

    const fetchPayrolls = async (): Promise<void> => {
      setLoadingPayrolls(true);
      setPayrollError(false);

      try {
        const response: StaffPayrollHistoryResponse[] =
          await api.get<StaffPayrollHistoryResponse[]>(
            `/api/employee-payrolls/staff/${encodeURIComponent(
              staff.id
            )}/history`
          );
        const payrollHistory: StaffPayrollHistoryResponse[] = Array.isArray(
          response
        )
          ? response
          : [];
        const matchingPayrolls: StaffPayrollSummary[] = payrollHistory
          .flatMap(
            (payroll: StaffPayrollHistoryResponse): StaffPayrollSummary[] => {
              const payrollId: number = Number(payroll.id);
              const year: number = Number(payroll.year);
              const month: number = Number(payroll.month);
              if (
                !Number.isInteger(payrollId) ||
                payrollId <= 0 ||
                !Number.isInteger(year) ||
                year <= 0 ||
                !Number.isInteger(month) ||
                month < 1 ||
                month > 12
              ) {
                return [];
              }

              const netPay: number | null = parsePayrollAmount(payroll.net_pay);
              const isRoundedTotal: boolean =
                payroll.setelah_digenapkan != null;
              return [
                {
                  id: payrollId,
                  year,
                  month,
                  jobType: payroll.job_type || "",
                  section: payroll.section || "",
                  grossPay: parsePayrollAmount(payroll.gross_pay),
                  displayedTotal: isRoundedTotal
                    ? parsePayrollAmount(payroll.setelah_digenapkan)
                    : netPay,
                  isRoundedTotal,
                },
              ];
            }
          )
          .sort(
            (first: StaffPayrollSummary, second: StaffPayrollSummary): number =>
              second.year - first.year ||
              second.month - first.month ||
              second.id - first.id
          );

        if (!cancelled) setPayrolls(matchingPayrolls);
      } catch (fetchError: unknown) {
        console.error("Error fetching staff payroll history:", fetchError);
        if (!cancelled) {
          setPayrolls([]);
          setPayrollError(true);
        }
      } finally {
        if (!cancelled) setLoadingPayrolls(false);
      }
    };

    void fetchPayrolls();

    return (): void => {
      cancelled = true;
    };
  }, [staff.id, retryCount]);

  const locale: string = i18n.resolvedLanguage || i18n.language || "en-MY";
  const currencyFormatter: Intl.NumberFormat = new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  });
  const periodFormatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
  });
  const formatPeriod = (year: number, month: number): string =>
    periodFormatter.format(new Date(year, month - 1, 1));
  const formatPayrollAmount = (amount: number | null): string =>
    amount === null ? t("Not available") : currencyFormatter.format(amount);

  return (
    <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700 bg-default-50/60 dark:bg-gray-900/20">
      <div className="mb-2 flex items-center gap-2">
        <IconCash
          size={18}
          aria-hidden={true}
          className="text-emerald-600 dark:text-emerald-400"
        />
        <h2 className="text-sm font-semibold text-default-800 dark:text-gray-100">
          {t("Payroll")}
        </h2>
        {!loadingPayrolls && !payrollError && (
          <span className="rounded-full bg-white dark:bg-gray-800 px-2 py-0.5 text-xs text-default-500 dark:text-gray-400 border border-default-200 dark:border-gray-700">
            {t(
              payrolls.length === 1 ? "{{count}} record" : "{{count}} records",
              { count: payrolls.length }
            )}
          </span>
        )}
      </div>

      {loadingPayrolls ? (
        <div className="flex h-20 items-center justify-center">
          <LoadingSpinner size="sm" />
        </div>
      ) : payrollError ? (
        <div className="flex h-16 items-center justify-between gap-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 text-sm text-amber-700 dark:text-amber-300">
          <span>{t("Payroll history could not be loaded.")}</span>
          <button
            type="button"
            onClick={(): void =>
              setRetryCount((count: number): number => count + 1)
            }
            className="flex-shrink-0 font-medium hover:underline"
          >
            {t("Try again")}
          </button>
        </div>
      ) : payrolls.length === 0 ? (
        <p className="py-4 text-sm text-default-500 dark:text-gray-400">
          {t("No payroll records found for this staff.")}
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {payrolls.map((payroll: StaffPayrollSummary) => {
            const period: string = formatPeriod(payroll.year, payroll.month);
            const jobAndSection: string = [payroll.jobType, payroll.section]
              .filter((value: string): boolean => Boolean(value))
              .join(" · ");

            return (
              <Link
                key={payroll.id}
                to={`/payroll/employee-payroll/${payroll.id}`}
                className="group min-w-[15rem] max-w-[15rem] rounded-md border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 transition-colors hover:border-sky-300 dark:hover:border-sky-600 hover:bg-sky-50/50 dark:hover:bg-sky-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                title={t("View payroll details for {{period}}", { period })}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-default-800 dark:text-gray-100">
                    {period}
                  </span>
                  <IconExternalLink
                    size={15}
                    aria-hidden={true}
                    className="text-default-400 transition-colors group-hover:text-sky-600 dark:group-hover:text-sky-400"
                  />
                </div>
                <p
                  className="mt-0.5 truncate text-xs text-default-500 dark:text-gray-400"
                  title={jobAndSection}
                >
                  {jobAndSection || t("None")}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3 border-t border-default-100 dark:border-gray-700 pt-1.5">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-default-400 dark:text-gray-500">
                      {t("Gross")}
                    </p>
                    <p className="text-xs font-medium text-default-700 dark:text-gray-200">
                      {formatPayrollAmount(payroll.grossPay)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-default-400 dark:text-gray-500">
                      {t(
                        payroll.isRoundedTotal ? "Rounded Total" : "Net Pay"
                      )}
                    </p>
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatPayrollAmount(payroll.displayedTotal)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

const StaffDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("catalogue");
  const { id } = useParams<{ id: string }>();
  const { allStaffs, loading: loadingStaffs } = useStaffsCache();
  const { jobs } = useJobsCache();
  const { locations, jobMappings } = useLocationMappingsCache();

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
        setError(t("Staff member not found."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, allStaffs, loadingStaffs, t]);

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
        <BackButton fallbackPath="/catalogue/staff" />
        <div className="mt-4 p-4 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded">
          {error || t("Staff member not found.")}
        </div>
      </div>
    );
  }

  const jobName = (jobId: string): string =>
    jobs.find((j) => j.id === jobId)?.name || jobId;

  const locName = (code: string): string =>
    locations.find((l) => l.id === code)?.name || code;

  // Locations set directly on the staff (kept in sync with the Location page).
  const directLocations = (
    Array.isArray(staff.location) ? staff.location : []
  ).map((code) => ({ code, name: locName(code) }));

  // Locations inherited from the staff's jobs via job -> location mappings.
  const jobLocations = (staff.job || [])
    .map((jobId) => {
      const code = jobMappings.byJob[jobId];
      if (!code) return null;
      return { jobId, jobName: jobName(jobId), code, name: locName(code) };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-default-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <BackButton fallbackPath="/catalogue/staff" />
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
                    {t("Resigned")}
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
            {t("Edit")}
          </Button>
        </div>

        <StaffPayrollQuickView staff={staff} />

        {/* Read-only fields */}
        <div className="px-6 py-5">
          <Section title={t("Personal")}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5">
              <Field label={t("ID")} value={staff.id} />
              <Field label={t("Name")} value={staff.name} />
              <Field label={t("Telephone Number")} value={staff.telephoneNo} />
              <Field label={t("Email")} value={staff.email} />
              <Field label={t("Gender")} value={staff.gender} />
              <Field label={t("Nationality")} value={staff.nationality} />
              <Field label={t("Birthdate")} value={staff.birthdate} />
              <Field label={t("Address")} value={staff.address} />
            </div>
          </Section>

          <Section title={t("Work")}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5">
              <div className="space-y-1">
                <p className="text-xs font-medium text-default-500 dark:text-gray-400">
                  {t("Jobs")}
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
              <StaffLocationsDisplay
                directLocations={directLocations}
                jobLocations={jobLocations}
              />
              <Field label={t("Date Joined")} value={staff.dateJoined} />
            </div>
            {/* Editable pay codes (the only interactive part of this page) */}
            <StaffPayCodesSection employee={staff} />
          </Section>

          <Section title={t("Documents")}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5">
              <Field label={t("IC Number")} value={staff.icNo} />
              <Field
                label={t("Bank Account Number")}
                value={staff.bankAccountNumber}
              />
              <Field label={t("EPF Number")} value={staff.epfNo} />
              <Field label={t("Income Tax Number")} value={staff.incomeTaxNo} />
              <Field label={t("SOCSO Number")} value={staff.socsoNo} />
              <Field label={t("Document")} value={staff.document} />
              <Field label={t("Department")} value={staff.department} />
              <Field label={t("KWSP Number")} value={staff.kwspNumber} />
            </div>
          </Section>

          <Section title={t("Income Tax Information")}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
              <Field label={t("Marital Status")} value={staff.maritalStatus} />
              {staff.maritalStatus === "Married" && (
                <Field
                  label={t("Spouse Employment Status")}
                  value={staff.spouseEmploymentStatus}
                />
              )}
              <Field
                label={t("Number of Children")}
                value={staff.numberOfChildren ?? 0}
              />
            </div>
          </Section>

          <Section title={t("Contribution Settings")}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5">
              <Field
                label={t("EPF Age")}
                value={t(
                  CONTRIBUTION_AGE_LABELS[staff.epfAgeOverride ?? "auto"]
                )}
              />
              <Field
                label={t("EPF Rate Type")}
                value={t(
                  EPF_NATIONALITY_LABELS[
                    staff.epfNationalityOverride ?? "auto"
                  ]
                )}
              />
              <Field
                label={t("SOCSO Age")}
                value={t(
                  CONTRIBUTION_AGE_LABELS[staff.socsoAgeOverride ?? "auto"]
                )}
              />
              <Field
                label={t("SIP Age")}
                value={t(
                  CONTRIBUTION_AGE_LABELS[staff.sipAgeOverride ?? "auto"]
                )}
              />
            </div>
          </Section>

          <Section title={t("Additional")}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-5">
              <Field label={t("Payment Type")} value={staff.paymentType} />
              <Field
                label={t("Payment Preference")}
                value={staff.paymentPreference}
              />
              <Field label={t("Race")} value={staff.race} />
              <Field label={t("Agama")} value={staff.agama} />
              <Field label={t("Date Resigned")} value={staff.dateResigned} />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
};

export default StaffDetailsPage;
