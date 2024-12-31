// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { sessionService } from "../services/SessionService";
import { API_BASE_URL } from "../configs/config";

interface User {
  id: string;
  name: string;
  ic_no: string;
  job: string[];
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (ic_no: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const sessionId = sessionService.getSessionId();
      if (!sessionId) {
        setIsLoading(false);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/auth/validate-session`,
        {
          headers: {
            "x-session-id": sessionId,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error("Auth status check failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (ic_no: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        // Add API_BASE_URL
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ic_no, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }

      const data = await response.json();
      sessionService.updateStoredSession(data.sessionId);
      setUser(data.user);
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      const sessionId = sessionService.getSessionId();
      await sessionService.endSession();
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
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
