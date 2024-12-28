import { useState, useEffect, Fragment } from "react";
import { Staff, ActiveSession } from "../types/types";
import { useProfile } from "../contexts/ProfileContext";
import {
  Dialog,
  Transition,
  TransitionChild,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { IconDevices2, IconUserCircle, IconSearch } from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import { sessionService } from "../services/SessionService";
import { API_BASE_URL } from "../configs/config";
import { toast } from "react-hot-toast";
import clsx from "clsx";

interface ProfileSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileSwitcherModal({
  isOpen,
  onClose,
}: ProfileSwitcherModalProps) {
  const { activeSessions, switchProfile, currentStaff } = useProfile();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [lastEventId, setLastEventId] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (isOpen) {
      const initializeModal = async () => {
        try {
          await fetchStaffList();
          if (isMounted) {
            setShowSessions(false);
            setSearchQuery("");
          }
        } catch (error) {
          console.error("Error initializing modal:", error);
        }
      };

      initializeModal();
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const getDeviceInfo = (session: ActiveSession) => {
    const defaultInfo = {
      deviceType: "Unknown",
      userAgent: "Unknown Device",
    };

    if (!session.deviceInfo) return defaultInfo;

    try {
      const deviceInfo =
        typeof session.deviceInfo === "string"
          ? JSON.parse(session.deviceInfo)
          : session.deviceInfo;

      return {
        deviceType: deviceInfo.deviceType || defaultInfo.deviceType,
        userAgent: deviceInfo.userAgent || defaultInfo.userAgent,
      };
    } catch (error) {
      console.error("Error parsing device info:", error);
      return defaultInfo;
    }
  };

  const formatLastActive = (lastActive: string | null | undefined): string => {
    if (!lastActive) return "Unknown time";

    try {
      const date = new Date(lastActive);
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return "Invalid date";
      }
      return `Active ${formatDistanceToNow(date)} ago`;
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Invalid date";
    }
  };

  const fetchActiveSessions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/active`);
      if (!response.ok) throw new Error("Failed to fetch sessions");
      const data = await response.json();
      setSessions(data.sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      toast.error("Failed to load active sessions");
    }
  };

  const pollSessionEvents = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/sessions/events?lastEventId=${lastEventId}`
      );
      if (!response.ok) throw new Error("Failed to fetch session events");

      const events = await response.json();
      if (events.length > 0) {
        setLastEventId(events[events.length - 1].id);
        await fetchActiveSessions();
      }
    } catch (error) {
      console.error("Error polling session events:", error);
    }
  };

  const fetchStaffList = async () => {
    setError("");
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/staffs/office`);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid data format received");

      setStaffList(data);
    } catch (error) {
      console.error("Error fetching staff list:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load staff list";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileSelect = async (staff: Staff) => {
    if (staff.id === currentStaff?.id) {
      onClose();
      return;
    }

    setIsLoading(true);
    try {
      // Close modal immediately
      onClose();
      // Then perform the profile switch
      await switchProfile(staff);
      sessionService.updateStoredSession(staff.id);
      onClose();
    } catch (error) {
      console.error("Error switching profile:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to switch profile";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredStaff = staffList.filter((staff) =>
    staff.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentSessionId = sessionService.getSessionId();

  return (
    <Transition
      appear
      show={isOpen}
      as={Fragment}
      beforeLeave={() => {
        // Cleanup state before transition starts
        setSearchQuery("");
        setShowSessions(false);
        setError("");
        setIsLoading(false);
      }}
    >
      <Dialog as="div" className="relative z-50" onClose={onClose} static>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-xl text-left align-middle transform transition-all">
                <div className="flex justify-between items-center mb-4">
                  <DialogTitle className="text-lg font-bold text-default-900">
                    {showSessions ? "Active Sessions" : "Switch Profile"}
                  </DialogTitle>
                  <button
                    onClick={() => setShowSessions(!showSessions)}
                    className="p-2 rounded-lg hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                    aria-label={
                      showSessions ? "Show profiles" : "Show sessions"
                    }
                  >
                    <IconDevices2 stroke={1.5} />
                  </button>
                </div>

                {!showSessions ? (
                  <>
                    <div className="relative mb-4">
                      <IconSearch
                        className="absolute left-3 top-2.5 text-default-400"
                        size={20}
                      />
                      <input
                        type="text"
                        placeholder="Search staff..."
                        className={clsx(
                          "w-full pl-10 pr-4 py-2 border border-default-300 rounded-lg",
                          "focus:border-default-500 focus:ring-1 focus:ring-default-500",
                          "disabled:bg-default-50 disabled:cursor-not-allowed"
                        )}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto space-y-2">
                      {isLoading ? (
                        <div className="text-center py-8 text-default-500">
                          <p className="font-medium">Loading staff...</p>
                        </div>
                      ) : filteredStaff.length === 0 ? (
                        <div className="text-center py-8 text-default-500">
                          {searchQuery ? (
                            <>
                              <p className="font-medium">No staff found</p>
                              <p className="text-sm mt-1">
                                No results for "{searchQuery}"
                              </p>
                            </>
                          ) : (
                            <p className="font-medium">No staff available</p>
                          )}
                        </div>
                      ) : (
                        filteredStaff.map((staff) => (
                          <button
                            key={staff.id}
                            onClick={() => handleProfileSelect(staff)}
                            className={clsx(
                              "w-full flex items-center justify-between p-3 rounded-lg",
                              "hover:bg-default-100 active:bg-default-200 transition-colors",
                              "disabled:cursor-not-allowed disabled:opacity-50",
                              staff.id === currentStaff?.id && "bg-default-100"
                            )}
                            disabled={isLoading}
                          >
                            <div className="flex items-center space-x-3">
                              <IconUserCircle className="text-default-700" />
                              <span className="font-medium text-default-700">
                                {staff.name}
                              </span>
                            </div>
                            {staff.id === currentStaff?.id && (
                              <span className="text-xs text-center bg-sky-100 text-sky-800 px-3 py-1 rounded-full">
                                Current Profile
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <div className="max-h-[60vh] overflow-y-auto space-y-3">
                    {sessions.map((session) => {
                      const sessionStaff = staffList.find(
                        (s) => s.id === session.staffId
                      );
                      const deviceInfo = getDeviceInfo(session);

                      return (
                        <div
                          key={`session-${session.sessionId}`}
                          className="p-3 rounded-lg border border-default-200"
                        >
                          <div className="flex items-center justify-between">
                            <div key={`info-${session.sessionId}`}>
                              <p
                                key={`name-${session.sessionId}`}
                                className="font-medium text-default-900"
                              >
                                {sessionStaff?.name || "No profile selected"}
                              </p>
                              <p
                                key={`device-${session.sessionId}`}
                                className="text-sm text-default-500"
                              >
                                {deviceInfo.deviceType} - {deviceInfo.userAgent}
                              </p>
                            </div>
                            {session.sessionId === currentSessionId && (
                              <span
                                key={`current-${session.sessionId}`}
                                className="text-xs text-center bg-sky-100 text-sky-800 px-3 py-1 rounded-full"
                              >
                                Current Device
                              </span>
                            )}
                          </div>
                          <p
                            key={`active-${session.sessionId}`}
                            className="text-xs text-default-400 mt-1"
                          >
                            {formatLastActive(session.lastActive)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {error && (
                  <p className="text-red-500 text-sm mt-2 text-center">
                    {error}
                  </p>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
