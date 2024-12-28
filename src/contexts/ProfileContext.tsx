import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { sessionService } from "../services/SessionService";
import { API_BASE_URL } from "../configs/config";
import { toast } from "react-hot-toast";
import type {
  Staff,
  ActiveSession,
  SessionError,
  ProfileContextType,
  DeviceInfo,
} from "../types/types";

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const POLL_INTERVAL = 30000;

  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState(0);
  const mountedRef = useRef(false);
  const pollIntervalRef = useRef<NodeJS.Timeout>();

  const clearError = useCallback(() => setError(null), []);

  const handleError = useCallback((error: unknown, fallbackMessage: string) => {
    console.error(fallbackMessage, error);

    let errorMessage: string;
    if (error instanceof Error && "code" in error) {
      const sessionError = error as SessionError;
      switch (sessionError.code) {
        case "SESSION_EXPIRED":
          errorMessage = "Your session has expired. Please refresh the page.";
          break;
        case "NETWORK_ERROR":
          errorMessage = "Network error. Please check your connection.";
          break;
        case "INITIALIZATION_ERROR":
          errorMessage = "Failed to initialize. Please refresh the page.";
          break;
        default:
          errorMessage = sessionError.message;
      }
    } else {
      errorMessage = error instanceof Error ? error.message : fallbackMessage;
    }

    setError(errorMessage);
    toast.error(errorMessage);
  }, []);

  const checkSessionState = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/session-state/${sessionService.getSessionId()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.hasActiveProfile && data.staff) {
        setCurrentStaff(data.staff);
      } else {
        setCurrentStaff(null);
      }
    } catch (error) {
      handleError(error, "Error checking session state");
      setCurrentStaff(null);
    } finally {
      setIsInitializing(false);
    }
  }, [handleError]);

  const fetchActiveSessions = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/active`);
      if (!response.ok) throw new Error("Failed to fetch sessions");
      const data = await response.json();
      if (mountedRef.current) {
        setActiveSessions(data.sessions);
      }
    } catch (error) {
      handleError(error, "Error fetching sessions");
    }
  }, [handleError]);

  const pollSessionEvents = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/sessions/events?lastEventId=${lastEventId}`
      );
      if (!response.ok) throw new Error("Failed to fetch session events");

      const events = await response.json();
      if (events.length > 0 && mountedRef.current) {
        setLastEventId(events[events.length - 1].id);

        // Check if any events affect the current session
        const currentSessionEvents = events.filter(
          (event: { session_id: string }) =>
            event.session_id === sessionService.getSessionId()
        );

        // Only fetch session state if relevant events exist
        if (currentSessionEvents.length > 0) {
          await checkSessionState();
          await fetchActiveSessions();
        }
      }
    } catch (error) {
      handleError(error, "Error polling session events");
    }
  }, [lastEventId, checkSessionState, fetchActiveSessions, handleError]);

  useEffect(() => {
    mountedRef.current = true;

    const initializeSession = async () => {
      if (!mountedRef.current) return;

      try {
        await sessionService.initialize();
        await checkSessionState();
        await fetchActiveSessions();

        // Start polling with longer interval
        pollIntervalRef.current = setInterval(pollSessionEvents, POLL_INTERVAL);
      } catch (error) {
        handleError(error, "Failed to initialize session");
      } finally {
        if (mountedRef.current) {
          setIsInitializing(false);
        }
      }
    };

    initializeSession();

    return () => {
      mountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [checkSessionState, fetchActiveSessions, pollSessionEvents, handleError]);

  const switchProfile = async (staff: Staff) => {
    if (!mountedRef.current) return;

    try {
      setIsInitializing(true);
      setError(null);

      const deviceInfo: DeviceInfo = {
        userAgent: navigator.userAgent,
        deviceType: /Mobile|Android|iPhone/i.test(navigator.userAgent)
          ? "Mobile"
          : "Desktop",
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(
        `${API_BASE_URL}/api/sessions/${sessionService.getSessionId()}/switch-profile`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            staffId: staff.id,
            deviceInfo,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to switch profile");
      }

      const result = await response.json();

      if (mountedRef.current) {
        setCurrentStaff(result.staff);
        sessionService.updateStoredSession(staff.id);
        await fetchActiveSessions();
        toast.success(`Switched to ${staff.name}'s profile`);
      }
    } catch (error) {
      handleError(error, "Error switching profile");
      throw error;
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <ProfileContext.Provider
      value={{
        currentStaff,
        activeSessions,
        switchProfile,
        isInitializing,
        error,
        clearError,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return context;
};

export type { Staff, ActiveSession, SessionError, ProfileContextType };
