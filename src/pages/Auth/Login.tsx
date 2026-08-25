import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  IconArrowRight,
  IconLock,
  IconId,
  IconEye,
  IconEyeOff,
  IconUpload,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import { Trans, useTranslation } from "react-i18next";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import LoadingSpinner from "../../components/LoadingSpinner";
import TienHockLogo from "../../utils/TienHockLogo";
import { useCompany, COMPANIES } from "../../contexts/CompanyContext";
import { api } from "../../routes/utils/api";
import { DB_NAME } from "../../configs/config";

interface RestoreStatus {
  status: "IDLE" | "RESTORING" | "COMPLETED" | "FAILED";
  phase: string | null;
  message?: string | null;
}

const SQL_REPLACEMENT_PENDING_KEY: string =
  "developmentSqlReplacementPending";
const RESTORE_STATUS_POLL_MS: number = 2000;
const RESTORE_IDLE_GRACE_POLLS: number = 15;

const setSqlReplacementPending = (isPending: boolean): void => {
  try {
    if (isPending) {
      sessionStorage.setItem(SQL_REPLACEMENT_PENDING_KEY, "true");
    } else {
      sessionStorage.removeItem(SQL_REPLACEMENT_PENDING_KEY);
    }
  } catch {
    // The progress UI still works when browser storage is unavailable.
  }
};

const Login: React.FC = () => {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation("common");
  const [ic_no, setIcNo] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sqlFileToReplaceFrom, setSqlFileToReplaceFrom] =
    useState<File | null>(null);
  const [showSqlReplaceConfirmDialog, setShowSqlReplaceConfirmDialog] =
    useState<boolean>(false);
  const [isReplacingDatabase, setIsReplacingDatabase] =
    useState<boolean>(false);
  const [isPollingRestoreStatus, setIsPollingRestoreStatus] =
    useState<boolean>(false);
  const [restorePhase, setRestorePhase] = useState<string | null>(null);
  const sqlFileInputRef = useRef<HTMLInputElement | null>(null);
  const skipBeforeUnloadPromptRef = useRef<boolean>(false);
  const reloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { setActiveCompany } = useCompany();

  useEffect((): void => {
    if (!import.meta.env.DEV) return;

    let hasPendingReplacement: boolean = false;
    try {
      hasPendingReplacement =
        sessionStorage.getItem(SQL_REPLACEMENT_PENDING_KEY) === "true";
    } catch {
      return;
    }

    if (hasPendingReplacement) {
      setIsReplacingDatabase(true);
      setRestorePhase("INITIALIZATION");
      setIsPollingRestoreStatus(true);
    }
  }, []);

  useEffect((): (() => void) | undefined => {
    if (!isPollingRestoreStatus) return undefined;

    let cancelled: boolean = false;
    let statusTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryCount: number = 0;
    let idleCount: number = 0;

    const scheduleNextStatusCheck = (delay: number): void => {
      statusTimeout = setTimeout((): void => {
        void pollRestoreStatus();
      }, delay);
    };

    const finishWithError = (message: string): void => {
      setSqlReplacementPending(false);
      setIsPollingRestoreStatus(false);
      setIsReplacingDatabase(false);
      setRestorePhase(null);
      setSqlFileToReplaceFrom(null);
      toast.error(message);
    };

    const pollRestoreStatus = async (): Promise<void> => {
      try {
        const status: RestoreStatus = await api.get(
          "/api/backup/restore/status"
        );
        if (cancelled) return;

        if (status.phase) {
          setRestorePhase(status.phase);
        }

        if (status.status === "COMPLETED") {
          setIsPollingRestoreStatus(false);
          setRestorePhase("COOLDOWN");
          toast.success(
            status.phase === "RECOVERED"
              ? tCommon("Database recovery completed!")
              : tCommon("Database replaced successfully!")
          );
          if (status.message) {
            toast.error(status.message, { duration: 10000 });
          }

          skipBeforeUnloadPromptRef.current = true;
          reloadTimeoutRef.current = setTimeout((): void => {
            setSqlReplacementPending(false);
            window.location.reload();
          }, 750);
          return;
        }

        if (status.status === "FAILED") {
          const failureMessage: string = status.message
            ? status.message
            : tCommon(
                "Database replacement failed. The existing database was not replaced."
              );
          finishWithError(failureMessage);
          return;
        }

        if (status.status === "IDLE") {
          // Startup recovery runs asynchronously and can briefly remain IDLE
          // before it reports RESTORING or RECOVERED.
          idleCount += 1;
          if (idleCount <= RESTORE_IDLE_GRACE_POLLS) {
            scheduleNextStatusCheck(RESTORE_STATUS_POLL_MS);
            return;
          }

          finishWithError(
            tCommon(
              "The server restarted before the database operation finished. The current database was not confirmed as replaced."
            )
          );
          return;
        }

        idleCount = 0;
        retryCount = 0;
        scheduleNextStatusCheck(RESTORE_STATUS_POLL_MS);
      } catch (error: unknown) {
        if (cancelled) return;

        console.error("Database replacement status check failed:", error);
        retryCount = Math.min(retryCount + 1, 4);
        const retryDelay: number = Math.min(
          RESTORE_STATUS_POLL_MS * 2 ** Math.max(0, retryCount - 1),
          10000
        );
        scheduleNextStatusCheck(retryDelay);
      }
    };

    void pollRestoreStatus();

    return (): void => {
      cancelled = true;
      if (statusTimeout) {
        clearTimeout(statusTimeout);
      }
    };
  }, [isPollingRestoreStatus, tCommon]);

  useEffect((): (() => void) | undefined => {
    if (!isReplacingDatabase) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (skipBeforeUnloadPromptRef.current) return;

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return (): void => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isReplacingDatabase]);

  useEffect((): (() => void) => {
    return (): void => {
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
      }
    };
  }, []);

  const handleLogin = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();

    if (ic_no.length < 14) {
      toast.error(t("Please enter a valid IC number"));
      return;
    }

    if (!password.trim()) {
      toast.error(t("Please enter your password"));
      return;
    }

    setIsLoading(true);

    try {
      await login(ic_no, password);

      // Check for saved company preference
      const savedCompanyId = localStorage.getItem("activeCompany");
      let targetPath = "/";

      if (savedCompanyId) {
        const company = COMPANIES.find((c) => c.id === savedCompanyId);
        if (company) {
          setActiveCompany(company);
          targetPath = company.routePrefix ? `/${company.routePrefix}` : "/";

          setTimeout(() => {
            navigate(targetPath);
          }, 50);
          return;
        }
      }

      navigate(targetPath);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSqlFileSelected = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const file: File | undefined = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setSqlFileToReplaceFrom(file);
    setShowSqlReplaceConfirmDialog(true);
  };

  const closeSqlReplaceConfirmation = (): void => {
    setShowSqlReplaceConfirmDialog(false);
    setSqlFileToReplaceFrom(null);
  };

  const handleReplaceDatabaseFromSql = async (): Promise<void> => {
    const file: File | null = sqlFileToReplaceFrom;
    if (!file) return;
    let uploadRequestStarted: boolean = false;

    try {
      setShowSqlReplaceConfirmDialog(false);
      setSqlReplacementPending(true);
      setIsReplacingDatabase(true);
      setRestorePhase("INITIALIZATION");
      skipBeforeUnloadPromptRef.current = false;

      const sqlContent: string = await file.text();
      uploadRequestStarted = true;
      await api.post("/api/backup/upload-sql", { sqlContent });

      setSqlFileToReplaceFrom(null);
      setIsPollingRestoreStatus(true);
    } catch (error: unknown) {
      console.error("Database replacement failed:", error);
      const hasHttpStatus: boolean =
        typeof error === "object" && error !== null && "status" in error;

      if (uploadRequestStarted && !hasHttpStatus) {
        // The server may have accepted the upload even if its response was
        // lost. Let the shared status state machine determine the outcome.
        setSqlFileToReplaceFrom(null);
        setIsPollingRestoreStatus(true);
        return;
      }

      const failureMessage: string =
        error instanceof Error && error.message
          ? error.message
          : tCommon("Failed to replace database from SQL.");
      setSqlReplacementPending(false);
      setIsPollingRestoreStatus(false);
      setIsReplacingDatabase(false);
      setRestorePhase(null);
      setSqlFileToReplaceFrom(null);
      toast.error(failureMessage);
    }
  };

  const formatIcNo = (value: string): string => {
    const digits = value.replace(/\D/g, "");

    if (digits.length <= 6) {
      return digits;
    } else if (digits.length <= 8) {
      return `${digits.slice(0, 6)}-${digits.slice(6)}`;
    } else {
      return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(
        8,
        12
      )}`;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-950">
      <div className="relative max-w-md w-full">
        {/* Main login card */}
        <div className="bg-white/80 dark:bg-gray-800/90 backdrop-blur-sm border border-white/20 dark:border-gray-700 rounded-2xl shadow-2xl p-8 transform transition-all duration-300 hover:shadow-3xl">
          {/* Header */}
          <div className="flex items-center mb-8">
            <div className="mr-6 w-24 h-24 rounded-2xl flex items-center justify-center shadow-lg bg-white dark:bg-gray-700">
              <TienHockLogo width={60} height={60} />
            </div>
            <div>
              <h1 className="text-3xl font-bold mb-1 text-gray-900 dark:text-gray-100">
                {t("Welcome Back")}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {t("Sign in to your account to continue")}
              </p>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* IC Number Field */}
            <div className="space-y-1">
              <label
                htmlFor="ic_no"
                className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-2"
              >
                {t("IC Number")}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 w-12 flex items-center justify-center">
                  <IconId
                    className="text-default-500 dark:text-gray-400 group-focus-within:text-default-600 dark:group-focus-within:text-gray-300 transition-colors duration-200"
                    size={20}
                    stroke={1.5}
                  />
                </div>
                <input
                  id="ic_no"
                  name="ic_no"
                  type="text"
                  placeholder="000000-00-0000"
                  required
                  disabled={isReplacingDatabase}
                  className="pl-10 pr-4 pt-3 pb-[12.5px] h-11 w-full border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:border-sky-400 dark:focus:border-sky-400 transition-colors focus:outline-none font-medium text-default-500 dark:text-gray-100 group-focus-within:text-default-600 dark:group-focus-within:text-gray-100 tracking-wide placeholder-gray-400 dark:placeholder-gray-500"
                  value={ic_no}
                  onChange={(e) => {
                    const formatted = formatIcNo(e.target.value);
                    if (formatted.length <= 14) {
                      setIcNo(formatted);
                    }
                  }}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-2"
              >
                {t("Password")}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 w-12 flex items-center justify-center">
                  <IconLock
                    className="text-default-500 dark:text-gray-400 group-focus-within:text-default-600 dark:group-focus-within:text-gray-300 transition-colors duration-200"
                    size={20}
                    stroke={1.5}
                  />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("Enter your password")}
                  required
                  disabled={isReplacingDatabase}
                  className="pl-10 pr-4 pt-3 pb-[12.5px] h-11 w-full border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:border-sky-400 dark:focus:border-sky-400 transition-colors focus:outline-none font-medium text-default-500 dark:text-gray-100 group-focus-within:text-default-600 dark:group-focus-within:text-gray-100 tracking-wide placeholder-gray-400 dark:placeholder-gray-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  disabled={isReplacingDatabase}
                  className="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-default-400 dark:text-gray-500 hover:text-default-600 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <IconEyeOff size={20} stroke={1.5} />
                  ) : (
                    <IconEye size={20} stroke={1.5} />
                  )}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <div className="pt-2">
              <Button
                type="submit"
                disabled={isLoading || isReplacingDatabase}
                icon={IconArrowRight}
                iconPosition="right"
                variant="filled"
                color="sky"
                size="lg"
                className="w-full relative overflow-hidden group"
                additionalClasses="bg-gradient-to-r from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-lg hover:shadow-xl transform hover:scale-[1.01] transition-all duration-300 disabled:transform-none disabled:shadow-xl rounded-lg"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    {t("Signing in...")}
                  </div>
                ) : (
                  t("Sign In")
                )}
              </Button>
            </div>
          </form>

          {import.meta.env.DEV && (
            <div className="mt-6 border-t border-default-200 pt-6 dark:border-gray-700">
              <input
                ref={sqlFileInputRef}
                type="file"
                accept=".sql"
                onChange={handleSqlFileSelected}
                aria-label={tCommon("Replace Database from SQL")}
                className="hidden"
              />
              <Button
                type="button"
                onClick={(): void => sqlFileInputRef.current?.click()}
                disabled={isLoading || isReplacingDatabase}
                icon={IconUpload}
                variant="outline"
                color="rose"
                className="w-full"
              >
                {tCommon("Replace Database from SQL")}
              </Button>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-xs text-default-500 dark:text-gray-400">
              {t("Need help? Contact system admin")}
            </p>
          </div>
        </div>

        {/* Bottom branding */}
        <div className="text-center mt-6">
          <p className="text-sm text-default-500 dark:text-gray-400">Tien Hock ERP System</p>
        </div>
      </div>

      {import.meta.env.DEV && isReplacingDatabase && (
        <Dialog
          open={isReplacingDatabase}
          onClose={(): void => {}}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-white/85 backdrop-blur-sm dark:bg-gray-950/85" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <DialogPanel className="flex w-full max-w-md flex-col items-center space-y-3 rounded-2xl border border-default-200 bg-white p-8 text-center shadow-2xl dark:border-gray-700 dark:bg-gray-800">
              <LoadingSpinner size="lg" hideText />
              <div className="space-y-2">
                <DialogTitle className="text-lg font-medium text-default-900 dark:text-gray-100">
                  {tCommon("Replacing Database")}
                </DialogTitle>
                <p
                  className="text-default-600 dark:text-gray-300"
                  aria-live="polite"
                >
                  {restorePhase === "INITIALIZATION"
                    ? tCommon("Preparing database replacement...")
                    : restorePhase === "DATABASE_VALIDATION"
                    ? tCommon(
                        "Validating the SQL backup in a temporary database..."
                      )
                    : restorePhase === "DATABASE_REPLACE"
                    ? tCommon("Replacing the current database...")
                    : restorePhase === "CLEANUP"
                    ? tCommon("Removing the previous database...")
                    : restorePhase === "DATABASE_RESTORE"
                    ? tCommon("Loading the selected SQL backup...")
                    : restorePhase === "COOLDOWN"
                    ? tCommon("Finalizing restore process...")
                    : tCommon(
                        "Please wait while the database is being replaced"
                      )}
                </p>
                <p className="text-sm text-default-500 dark:text-gray-400">
                  {tCommon("Please keep this window open until it finishes.")}
                </p>
              </div>
            </DialogPanel>
          </div>
        </Dialog>
      )}

      <ConfirmationDialog
        isOpen={import.meta.env.DEV && showSqlReplaceConfirmDialog}
        onClose={closeSqlReplaceConfirmation}
        onConfirm={handleReplaceDatabaseFromSql}
        title={tCommon("Replace Entire Database?")}
        message={
          <div className="space-y-3">
            <p>
              <Trans
                t={tCommon}
                i18nKey="This validates the selected SQL backup first, then permanently replaces all current data in <strong>{{db}}</strong>."
                values={{ db: DB_NAME }}
                components={{ strong: <strong /> }}
              />
            </p>
            <p className="break-all rounded-lg bg-default-100 px-3 py-2 font-medium text-default-700 dark:bg-gray-700 dark:text-gray-200">
              {sqlFileToReplaceFrom?.name}
            </p>
            <p>
              {tCommon(
                "Data that is not in this backup will be deleted. Make sure all users have saved their work before continuing."
              )}
            </p>
            <p>
              {tCommon(
                "Only continue with a trusted PostgreSQL backup from your own production system; database dumps contain executable definitions."
              )}
            </p>
          </div>
        }
        confirmButtonText={tCommon("Yes, Replace Database")}
        variant="danger"
      />
    </div>
  );
};

export default Login;
