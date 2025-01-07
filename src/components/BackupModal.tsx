import React, { useState, useEffect, useCallback } from "react";
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
} from "@tabler/icons-react";
import { NODE_ENV } from "../configs/config";
import toast from "react-hot-toast";
import ConfirmationDialog from "./ConfirmationDialog";

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose }) => {
  const [backups, setBackups] = useState<
    Array<{
      filename: string;
      size: number;
      created: string;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusCheckInterval, setStatusCheckInterval] =
    useState<NodeJS.Timeout | null>(null);
  const [restorePhase, setRestorePhase] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get("/api/backup/list");
      setBackups(response);
    } catch (error: unknown) {
      console.error("Failed to fetch backups:", error);

      // Type guard to check if error is an object with a message property
      if (error instanceof Error) {
        // Only set error if it's not a maintenance mode error
        if (!error.message.includes("maintenance")) {
          setError("Failed to fetch backups. Please try refreshing.");
        }
      } else {
        setError("Failed to fetch backups. Please try refreshing.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const checkRestoreStatus = useCallback(async () => {
    try {
      const status = await api.get("/api/backup/restore/status");

      // Check for completed status regardless of isRestoring flag
      if (status.status === "COMPLETED") {
        if (statusCheckInterval) {
          clearInterval(statusCheckInterval);
          setStatusCheckInterval(null);
        }

        // Show success toast
        toast.success("Database restored successfully!", {
          duration: 1500, // Display for 2 seconds
        });

        // Wait for 2 seconds before reloading
        setTimeout(() => {
          setRestorePhase(null);
          setRestoring(false);
          onClose();
          window.location.reload();
        }, 1000);

        return true;
      }

      return false;
    } catch (error) {
      console.error("Status check failed:", error);
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        setStatusCheckInterval(null);
      }
      setRestorePhase(null);
      setRestoring(false);
      return false;
    }
  }, [statusCheckInterval, onClose]);

  const handleCreateBackup = async () => {
    try {
      setLoading(true);
      setError(null);

      await api.post("/api/backup/create");
      toast.success("Backup created successfully!");

      // Refresh the backup list
      await fetchBackups();
    } catch (error) {
      console.error("Backup creation failed:", error);
      setError("Failed to create backup. Please try again.");
      toast.error("Failed to create backup. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) return;

    try {
      setRestoring(true);
      setError(null);
      setShowConfirmDialog(false);

      // Start restore operation
      await api.post("/api/backup/restore", { filename: selectedBackup });

      // Set up polling with cleanup
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

  // Format date utility function
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Format size utility function
  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  // Cleanup intervals on unmount or modal close
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
      // Initial backup list fetch
      const fetchInitialData = async () => {
        try {
          await fetchBackups();
        } catch (error) {
          // Silently handle initial fetch error during maintenance
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
          as="div"
          className="fixed inset-0 z-10 overflow-y-auto"
          onClose={onClose}
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
              <DialogPanel className="fixed inset-0 bg-black opacity-30" />
            </TransitionChild>

            <span
              className="inline-block h-screen align-middle"
              aria-hidden="true"
            >
              &#8203;
            </span>

            <TransitionChild
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="inline-block w-full max-w-3xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
                <div className="flex justify-between items-center">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-default-900"
                  >
                    Database Backups
                  </DialogTitle>
                  <div className="flex items-center space-x-2">
                    {restorePhase === "COOLDOWN" && (
                      <div className="flex items-center px-2 py-1 text-sm rounded-full bg-sky-50 text-sky-700">
                        <IconClock size={16} className="mr-1" />
                        <span>Finalizing...</span>
                      </div>
                    )}
                    <span className="px-2 py-1 text-sm rounded-full bg-default-100 text-default-700">
                      {NODE_ENV === "development" ? "Development" : NODE_ENV}
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 p-4 bg-rose-50 text-rose-700 rounded-lg flex items-center">
                    <IconAlertTriangle className="mr-2" size={20} />
                    <span>{error}</span>
                  </div>
                )}

                <div className="mt-4">
                  <div className="flex justify-between items-center mb-4">
                    <Button
                      onClick={() => handleCreateBackup()}
                      disabled={loading || restoring}
                      icon={IconDatabasePlus}
                    >
                      Create New Backup
                    </Button>

                    <Button
                      onClick={fetchBackups}
                      disabled={loading || restoring}
                      variant="outline"
                      icon={IconRefresh}
                    >
                      Refresh
                    </Button>
                  </div>

                  {loading ? (
                    <div className="flex flex-col items-center justify-center my-8 space-y-2">
                      <LoadingSpinner />
                    </div>
                  ) : (
                    <div className="border rounded-lg">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-default-100">
                            <th className="p-3 text-left font-medium text-default-700">
                              Filename
                            </th>
                            <th className="p-3 text-left font-medium text-default-700">
                              Created
                            </th>
                            <th className="p-3 text-left font-medium text-default-700">
                              Size
                            </th>
                            <th className="p-3 text-left font-medium text-default-700">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {backups.map((backup) => (
                            <tr
                              key={backup.filename}
                              className="border-b last:border-0"
                            >
                              <td className="p-3 text-default-700">
                                {backup.filename}
                              </td>
                              <td className="p-3 text-default-700">
                                {formatDate(backup.created)}
                              </td>
                              <td className="p-3 text-default-700">
                                {formatSize(backup.size)}
                              </td>
                              <td className="p-3">
                                {restoring &&
                                selectedBackup === backup.filename ? (
                                  <div className="flex items-center space-x-2">
                                    <LoadingSpinner size="sm" hideText />
                                    <span className="text-sm text-default-500">
                                      {restorePhase === "COOLDOWN"
                                        ? "Finalizing..."
                                        : "Restoring..."}
                                    </span>
                                  </div>
                                ) : (
                                  <Button
                                    onClick={() => {
                                      setSelectedBackup(backup.filename);
                                      setShowConfirmDialog(true);
                                    }}
                                    disabled={restoring}
                                    variant="outline"
                                    size="sm"
                                  >
                                    Restore
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}

                          {backups.length === 0 && (
                            <tr>
                              <td
                                colSpan={4}
                                className="p-3 text-center text-default-500"
                              >
                                No backups found
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
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
        message="Please ensure all users have saved their work and logged out of the system before proceeding. Are you sure you want to restore this backup?"
        confirmButtonText="Yes, Restore Database"
        variant="default"
      />
    </>
  );
};

export default BackupModal;
