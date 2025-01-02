// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { sessionService, AuthenticatedUser } from "../services/SessionService";
import { API_BASE_URL } from "../configs/config";

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
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // First check if we have a stored session
      const storedSession = sessionService.getStoredSession();
      if (!storedSession?.sessionId) {
        setIsLoading(false);
        return;
      }

      // Initialize session service if not already initialized
      await sessionService.initialize();

      // Validate the session
      const validatedUser = await sessionService.validateSession();
      if (validatedUser) {
        setUser(validatedUser);
      } else {
        // Clear invalid session
        await sessionService.logout();
      }
    } catch (error) {
      console.error("Auth Status Check Error:", error);
      // Handle session initialization error
      await sessionService.logout();
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