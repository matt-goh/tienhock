import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "./Button";
import LoadingSpinner from "./LoadingSpinner";
import { api } from "../routes/utils/api";
import {
  IconDatabasePlus,
  IconRefresh,
  IconAlertTriangle,
  IconClock,
  IconUpload,
} from "@tabler/icons-react";
import { API_BASE_URL, DB_NAME } from "../configs/config";
import toast from "react-hot-toast";
import ConfirmationDialog from "./ConfirmationDialog";
import { sessionService } from "../services/SessionService";

// Use Vite's built-in MODE for frontend environment detection
const NODE_ENV = import.meta.env.MODE;

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Backup {
  filename: string;
  size: number;
  created: string;
}

const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose }) => {
  const defaultBackUpName = `backup_${DB_NAME}`;
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupName, setBackupName] = useState(defaultBackUpName);
  const [showBackupNameInput, setShowBackupNameInput] = useState(false);
  const [statusCheckInterval, setStatusCheckInterval] =
    useState<NodeJS.Timeout | null>(null);
  const [restorePhase, setRestorePhase] = useState<string | null>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);
  const tableBodyRef = useRef<HTMLDivElement>(null);
  const [backupToDelete, setBackupToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Reset backup name when modal closes
  useEffect(() => {
    if (!isOpen) {
      setBackupName(defaultBackUpName);
      setShowBackupNameInput(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const checkForScrollbar = () => {
      if (tableBodyRef.current) {
        const hasVerticalScrollbar =
          tableBodyRef.current.scrollHeight > tableBodyRef.current.clientHeight;
        setHasScrollbar(hasVerticalScrollbar);
      }
    };

    checkForScrollbar();
    // Add resize observer to check when content changes
    const resizeObserver = new ResizeObserver(checkForScrollbar);
    if (tableBodyRef.current) {
      resizeObserver.observe(tableBodyRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [backups]);

  const fetchBackups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get("/api/backup/list");
      setBackups(response);
    } catch (error: any) {
      console.error("Failed to fetch backups:", error);
      if (!error.message?.includes("maintenance")) {
        setError("Failed to fetch backups. Please try refreshing.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const checkRestoreStatus = useCallback(async () => {
    try {
      const status = await api.get("/api/backup/restore/status");

      // Update restore phase
      if (status.phase) {
        setRestorePhase(status.phase);
      }

      if (status.status === "COMPLETED") {
        if (statusCheckInterval) {
          clearInterval(statusCheckInterval);
          setStatusCheckInterval(null);
        }

        setRestorePhase("COOLDOWN");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        toast.success(
          uploading ? "SQL imported successfully!" : "Database restored successfully!"
        );
        await new Promise((resolve) => setTimeout(resolve, 500));

        setRestorePhase(null);
        setRestoring(false);
        setUploading(false);
        onClose();
        window.location.reload();

        return true;
      }

      return false;
    } catch (error: any) {
      // Check if error is due to maintenance mode
      if (error?.message?.includes("maintenance")) {
        // Don't treat maintenance mode as an error
        // Keep showing loading state and continue polling
        setRestorePhase("DATABASE_RESTORE");
        return false;
      }

      // For other errors, handle as before
      console.error("Status check failed:", error);
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        setStatusCheckInterval(null);
      }
      setRestorePhase(null);
      setRestoring(false);
      setUploading(false);
      return false;
    }
  }, [statusCheckInterval, onClose, uploading]);

  const handleCreateBackup = async () => {
    try {
      setLoading(true);
      setError(null);
      await api.post("/api/backup/create", { name: backupName || undefined });
      toast.success("Backup created successfully!");
      setBackupName("");
      setShowBackupNameInput(false);
      await fetchBackups();
    } catch (error) {
      console.error("Backup creation failed:", error);
      setError("Failed to create backup. Please try again.");
      toast.error("Failed to create backup. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!backupToDelete) return;

    try {
      setLoading(true);
      setError(null);
      setShowDeleteConfirmDialog(false);
      await api.post("/api/backup/delete", { filename: backupToDelete });
      toast.success("Backup deleted successfully!");
      await fetchBackups();
    } catch (error) {
      console.error("Failed to delete backup:", error);
      setError("Failed to delete backup. Please try again.");
      toast.error("Failed to delete backup. Please try again.");
    } finally {
      setLoading(false);
      setBackupToDelete(null);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) return;

    try {
      setRestoring(true);
      setError(null);
      setShowConfirmDialog(false);

      await api.post("/api/backup/restore", { filename: selectedBackup });

      const interval = setInterval(() => {
        checkRestoreStatus();
      }, 2000);

      setStatusCheckInterval(interval);
    } catch (error) {
      console.error("Restore failed:", error);
      setError("Database restore failed. Please try again in a few moments.");
      toast.error("Failed to restore backup. Please try again.");
      setRestoring(false);
    }
  };

  const handleDownload = async (filename: string) => {
    try {
      setLoading(true);

      // Use the same pattern as the api utility but handle blob response
      const sessionId = sessionService.getSessionId();
      const response = await fetch(
        `${API_BASE_URL}/api/backup/download/${encodeURIComponent(filename)}`,
        {
          headers: {
            "Content-Type": "application/json",
            "x-session-id": sessionId,
          },
        }
      );

      // Check if response is ok before trying to get blob
      if (!response.ok) {
        // Try to get error message from JSON response
        try {
          const errorData = await response.json();
          throw new Error(
            errorData.message || errorData.error || "Download failed"
          );
        } catch {
          throw new Error(`Download failed with status: ${response.status}`);
        }
      }

      // Get the filename from response headers or use the original filename
      const contentDisposition = response.headers.get("Content-Disposition");
      let downloadFilename = filename.replace(".gz", ".sql");

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          downloadFilename = filenameMatch[1];
        }
      }

      // Create blob and download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Backup downloaded successfully!");
    } catch (error: any) {
      console.error("Download failed:", error);
      toast.error(`Failed to download backup: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSql = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);

      // Read file as text
      const sqlContent = await file.text();

      // Send to backend
      await api.post("/api/backup/upload-sql", { sqlContent });

      // Start polling for status (reuse existing restore status polling)
      const interval = setInterval(() => {
        checkRestoreStatus();
      }, 2000);
      setStatusCheckInterval(interval);
    } catch (error: any) {
      console.error("SQL upload failed:", error);
      setError("Failed to upload SQL file. Please try again.");
      toast.error("Failed to upload SQL file.");
      setUploading(false);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  useEffect(() => {
    return () => {
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        toast.dismiss("restore-status");
      }
    };
  }, [statusCheckInterval]);

  useEffect(() => {
    if (!isOpen && statusCheckInterval) {
      clearInterval(statusCheckInterval);
      setStatusCheckInterval(null);
      toast.dismiss("restore-status");
    }
  }, [isOpen, statusCheckInterval]);

  useEffect(() => {
    if (isOpen) {
      const fetchInitialData = async () => {
        try {
          await fetchBackups();
        } catch (error) {
          console.error("Initial backup fetch failed:", error);
        }
      };

      fetchInitialData();
    }
  }, [isOpen, fetchBackups]);

  return (
    <>
      <Transition appear show={isOpen} as={React.Fragment}>
        <Dialog
          className="fixed inset-0 z-50 overflow-y-auto"
          open={isOpen}
          onClose={restoring || uploading ? () => {} : onClose}
        >
          <div className="min-h-screen px-4 text-center">
            <TransitionChild
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <DialogPanel className="fixed inset-0 bg-black/50 dark:bg-black/70" />
            </TransitionChild>

            <span className="inline-block h-screen align-middle">&#8203;</span>

            <TransitionChild
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="inline-block w-full max-w-5xl p-6 my-4 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-2xl">
                {/* Modal Header */}
                <div className="flex justify-between items-center">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                  >
                    Database Backups
                  </DialogTitle>
                  <div className="flex items-center space-x-2">
                    {restorePhase === "COOLDOWN" && (
                      <div className="flex items-center px-2 py-1 text-sm rounded-full bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                        <IconClock size={16} className="mr-1" />
                        <span>Finalizing...</span>
                      </div>
                    )}
                    <span className="px-2 py-1 text-sm rounded-full bg-default-100 dark:bg-gray-700 text-default-700 dark:text-gray-200">
                      {NODE_ENV === "development" ? "Development" : NODE_ENV}
                    </span>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="mt-4 p-4 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded-lg flex items-center">
                    <IconAlertTriangle className="mr-2" size={20} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Hidden file input for SQL upload */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleUploadSql}
                  accept=".sql"
                  className="hidden"
                />

                {/* Action Buttons */}
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center space-x-2">
                      {!showBackupNameInput ? (
                        <>
                          <Button
                            onClick={() => setShowBackupNameInput(true)}
                            disabled={loading || restoring || uploading}
                            icon={IconDatabasePlus}
                          >
                            Create New Backup
                          </Button>
                          {NODE_ENV === "development" && (
                            <Button
                              onClick={() => fileInputRef.current?.click()}
                              disabled={loading || restoring || uploading}
                              variant="outline"
                              icon={IconUpload}
                            >
                              Upload SQL
                            </Button>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            placeholder={defaultBackUpName}
                            value={backupName}
                            onChange={(e) => setBackupName(e.target.value)}
                            className="px-3 py-2 w-44 border border-default-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-default-500 dark:focus:border-sky-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                          <Button
                            onClick={handleCreateBackup}
                            disabled={loading || restoring}
                          >
                            Create
                          </Button>
                          <Button
                            onClick={() => {
                              setShowBackupNameInput(false);
                              setBackupName(defaultBackUpName);
                            }}
                            variant="outline"
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={fetchBackups}
                      disabled={loading || restoring}
                      variant="outline"
                      icon={IconRefresh}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>

                {/* Table Section */}
                <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="relative">
                    {/* Fixed Header */}
                    <div
                      className={`bg-default-50 dark:bg-gray-800 border-b border-default-200 dark:border-gray-700 ${
                        hasScrollbar ? "pr-[17px]" : ""
                      }`}
                    >
                      <table className="w-full table-fixed">
                        <colgroup>
                          <col className="w-[35%]" />
                          <col className="w-[20%]" />
                          <col className="w-[15%]" />
                          <col className="w-[30%]" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th className="px-6 py-3 text-left font-medium text-default-500 dark:text-gray-400">
                              Filename
                            </th>
                            <th className="px-6 py-3 text-left font-medium text-default-500 dark:text-gray-400">
                              Created
                            </th>
                            <th className="px-6 py-3 text-left font-medium text-default-500 dark:text-gray-400">
                              Size
                            </th>
                            <th className="px-6 py-3 text-left font-medium text-default-500 dark:text-gray-400">
                              Actions
                            </th>
                          </tr>
                        </thead>
                      </table>
                    </div>

                    {/* Scrollable Body */}
                    <div
                      ref={tableBodyRef}
                      className="max-h-[calc(100vh-280px)] overflow-y-auto"
                    >
                      <table className="w-full table-fixed">
                        <colgroup>
                          <col className="w-[35%]" />
                          <col className="w-[20%]" />
                          <col className="w-[15%]" />
                          <col className="w-[30%]" />
                        </colgroup>
                        <tbody className="bg-white dark:bg-gray-800">
                          {loading ? (
                            <tr>
                              <td colSpan={4} className="px-6 py-8 text-center">
                                <LoadingSpinner />
                              </td>
                            </tr>
                          ) : backups.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-6 py-3 text-center text-default-500 dark:text-gray-400"
                              >
                                No backups found
                              </td>
                            </tr>
                          ) : (
                            [...backups]
                              .sort(
                                (a, b) =>
                                  new Date(b.created).getTime() -
                                  new Date(a.created).getTime()
                              )
                              .map((backup) => (
                                <tr
                                  key={backup.filename}
                                  className="border-b border-default-200 dark:border-gray-700 last:border-0"
                                >
                                  <td className="px-6 py-3 text-default-700 dark:text-gray-200 truncate">
                                    {backup.filename}
                                  </td>
                                  <td className="px-6 py-3 text-default-700 dark:text-gray-200">
                                    {formatDate(backup.created)}
                                  </td>
                                  <td className="px-6 py-3 text-default-700 dark:text-gray-200">
                                    {formatSize(backup.size)}
                                  </td>
                                  <td className="px-6 py-3">
                                    <div className="flex items-center space-x-2">
                                      {restoring &&
                                      selectedBackup === backup.filename ? (
                                        <div className="flex items-center space-x-2">
                                          <LoadingSpinner size="sm" hideText />
                                          <span className="text-sm text-default-500 dark:text-gray-400">
                                            {restorePhase === "COOLDOWN"
                                              ? "Finalizing..."
                                              : "Restoring..."}
                                          </span>
                                        </div>
                                      ) : (
                                        <>
                                          <Button
                                            onClick={() => {
                                              setSelectedBackup(
                                                backup.filename
                                              );
                                              setShowConfirmDialog(true);
                                            }}
                                            disabled={restoring || loading}
                                            variant="outline"
                                            size="sm"
                                          >
                                            Restore
                                          </Button>
                                          <Button
                                            onClick={() =>
                                              handleDownload(backup.filename)
                                            }
                                            disabled={restoring || loading}
                                            variant="outline"
                                            size="sm"
                                            color="sky"
                                          >
                                            Download
                                          </Button>
                                          <Button
                                            onClick={() => {
                                              setBackupToDelete(
                                                backup.filename
                                              );
                                              setShowDeleteConfirmDialog(true);
                                            }}
                                            disabled={restoring || loading}
                                            variant="outline"
                                            size="sm"
                                            color="rose"
                                          >
                                            Delete
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                {/* Full Modal Loading Overlay */}
                {(restoring || uploading) && (
                  <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="flex flex-col items-center space-y-3 p-6 rounded-lg text-center">
                      <LoadingSpinner size="lg" hideText />
                      <div className="space-y-2">
                        <h3 className="text-lg font-medium text-default-900 dark:text-gray-100">
                          {uploading ? "Importing SQL" : "Restoring Database"}
                        </h3>
                        <p className="text-default-600 dark:text-gray-300">
                          {restorePhase === "INITIALIZATION"
                            ? "Preparing for restore..."
                            : restorePhase === "CLEANUP"
                            ? "Cleaning up existing data..."
                            : restorePhase === "DATABASE_RESTORE"
                            ? uploading
                              ? "Importing SQL file..."
                              : "Restoring database from backup..."
                            : restorePhase === "SESSION_RESTORE"
                            ? "Restoring active sessions..."
                            : restorePhase === "COOLDOWN"
                            ? "Finalizing restore process..."
                            : uploading
                            ? "Please wait while the SQL is being imported"
                            : "Please wait while the database is being restored"}
                        </p>
                        <p className="text-sm text-default-500 dark:text-gray-400">
                          Please do not close this window or refresh the page
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>

      <ConfirmationDialog
        isOpen={showConfirmDialog}
        onClose={() => {
          setShowConfirmDialog(false);
          setSelectedBackup(null);
        }}
        onConfirm={handleRestore}
        title="Confirm Database Restore"
        message="Please ensure all users have saved their work before proceeding. Are you sure you want to restore this backup?"
        confirmButtonText="Yes, Restore Database"
        variant="default"
      />

      <ConfirmationDialog
        isOpen={showDeleteConfirmDialog}
        onClose={() => {
          setShowDeleteConfirmDialog(false);
          setBackupToDelete(null);
        }}
        onConfirm={handleDelete}
        title="Confirm Backup Deletion"
        message="Are you sure you want to delete this backup? This action cannot be undone."
        confirmButtonText="Yes, Delete Backup"
        variant="danger"
      />
    </>
  );
};

export default BackupModal;
