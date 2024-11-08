import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { Staff, ActiveSession } from "../types/types";
import { websocketService } from "../services/websocketService";
import { API_BASE_URL } from "../config";
import { sessionPersistenceService } from "../services/sessionPersistenceService";

interface ProfileContextType {
  currentStaff: Staff | null;
  activeSessions: ActiveSession[];
  switchProfile: (staff: Staff) => Promise<void>;
  isInitializing: boolean;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const mountedRef = useRef(false);

  const checkSessionState = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/session-state/${websocketService.getSessionId()}`,
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
      console.error("Error checking session state:", error);
      setCurrentStaff(null);
    } finally {
      setIsInitializing(false);
    }
  }, []);

  // Create stable handler functions using useCallback
  const handleProfileChange = useCallback(async (data: { staffId: string; sessionId: string }) => {
    if (mountedRef.current && data.sessionId === websocketService.getSessionId()) {
      await checkSessionState();
    }
  }, [checkSessionState]);

  const handleSessionsUpdate = useCallback((data: { sessions: ActiveSession[] }) => {
    if (mountedRef.current) {
      setActiveSessions(data.sessions);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const initializeWebSocket = async () => {
      if (!mountedRef.current) return;

      try {
        // Try to restore session first
        const storedSession = sessionPersistenceService.getStoredSession();
        if (storedSession?.staffId) {
          setCurrentStaff({ id: storedSession.staffId, name: "", job: [] });
        }

        // Subscribe to WebSocket events
        websocketService.subscribe("profile_changed", handleProfileChange);
        websocketService.subscribe("active_sessions", handleSessionsUpdate);

        await websocketService.connect();

        if (mountedRef.current) {
          await checkSessionState();
        }
      } catch (error) {
        if (mountedRef.current) {
          console.error("Failed to initialize WebSocket:", error);
          setIsInitializing(false);
        }
      }
    };

    initializeWebSocket();

    // Set up periodic last active updates
    const updateInterval = setInterval(() => {
      sessionPersistenceService.updateLastActive();
    }, 60000);

    // Cleanup function
    return () => {
      mountedRef.current = false;
      clearInterval(updateInterval);
      websocketService.unsubscribe("profile_changed", handleProfileChange);
      websocketService.unsubscribe("active_sessions", handleSessionsUpdate);
      websocketService.disconnect();
    };
  }, [checkSessionState, handleProfileChange, handleSessionsUpdate]);

  const switchProfile = async (staff: Staff) => {
    if (!mountedRef.current) return;

    try {
      setIsInitializing(true);

      const response = await fetch(`${API_BASE_URL}/api/switch-profile`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          staffId: staff.id,
          sessionId: websocketService.getSessionId(),
          deviceInfo: {
            userAgent: navigator.userAgent,
            deviceType: "Desktop",
            timestamp: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to switch profile");
      }

      const result = await response.json();

      if (mountedRef.current) {
        setCurrentStaff(result.staff);
        sessionPersistenceService.saveSession(staff.id);

        websocketService.send("profile_switch", {
          staffId: staff.id,
          sessionId: websocketService.getSessionId(),
        });
      }
    } catch (error) {
      console.error("Error switching profile:", error);
      throw error;
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <ProfileContext.Provider
      value={{ currentStaff, activeSessions, switchProfile, isInitializing }}
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