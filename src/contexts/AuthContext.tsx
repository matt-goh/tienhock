// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { sessionService, AuthenticatedUser } from "../services/SessionService";

interface AuthContextType {
  isAuthenticated: boolean;
  user: AuthenticatedUser | null;
  login: (ic_no: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      const storedSession = sessionService.getStoredSession();

      // If we're on the login page, don't attempt to restore a session
      // We still initialize the session ID but don't try to validate it
      const isLoginPage = window.location.pathname === "/login";

      if (isLoginPage) {
        setIsLoading(false);
        return;
      }

      // If there's a cached user in the session, set it immediately to prevent flicker
      if (storedSession?.user) {
        setUser(storedSession.user);
      }

      // Only call initialize if not on login page
      try {
        const sessionState = await sessionService.initialize();

        if (sessionState.staff && sessionState.hasActiveProfile) {
          setUser(sessionState.staff);
        } else if (storedSession?.user) {
          // Clear invalid session
          await sessionService.logout();
          setUser(null);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
        sessionService
          .logout()
          .catch((e) => console.warn("Error during forced logout:", e));
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (ic_no: string, password: string) => {
    try {
      const session = await sessionService.login(ic_no, password);
      if (session.user) {
        setUser(session.user);
      }
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await sessionService.logout();
      setUser(null);
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    }
  };

  // Listen for session expiry events
  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
    };

    window.addEventListener("sessionExpired", handleSessionExpired);
    return () =>
      window.removeEventListener("sessionExpired", handleSessionExpired);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!user,
        user,
        login,
        logout,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
