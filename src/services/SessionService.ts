// services/SessionService.ts
import { api } from "../routes/utils/api";

export interface AuthenticatedUser {
  id: string;
  name: string;
  ic_no: string;
  job: string[];
}

export interface StoredSession {
  sessionId: string;
  staffId: string | null;
  user?: AuthenticatedUser | null;
}

export interface SessionError extends Error {
  code: "INITIALIZATION_ERROR" | "NETWORK_ERROR" | "STORAGE_ERROR";
}

export interface AuthenticatedSession extends StoredSession {
  user: AuthenticatedUser | null;
}

class SessionService {
  private readonly SESSION_KEY = "app_session";
  private readonly SESSION_ID_KEY = "app_sessionId";
  private currentSessionId: string;
  private stateCheckInterval?: NodeJS.Timeout;

  constructor() {
    this.currentSessionId =
      this.getStoredSessionId() || this.generateSessionId();
    this.startStateCheck();
  }

  private getStoredSessionId(): string | null {
    try {
      return localStorage.getItem(this.SESSION_ID_KEY);
    } catch (error) {
      console.error("Failed to get stored session ID:", error);
      return null;
    }
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private createSessionError(
    message: string,
    code: SessionError["code"],
    originalError?: Error
  ): SessionError {
    const error = new Error(message) as SessionError;
    error.code = code;
    error.cause = originalError;
    return error;
  }

  async initialize(): Promise<void> {
    try {
      const storedSession = this.getStoredSession();

      await api.post("/api/sessions/register", {
        sessionId: this.currentSessionId,
        staffId: storedSession?.staffId || null,
      });

      if (!this.getStoredSessionId()) {
        localStorage.setItem(this.SESSION_ID_KEY, this.currentSessionId);
      }
    } catch (error) {
      throw this.createSessionError(
        "Failed to initialize session",
        "INITIALIZATION_ERROR",
        error as Error
      );
    }
  }

  private startStateCheck(): void {
    if (this.stateCheckInterval) {
      clearInterval(this.stateCheckInterval);
    }
    // Check every 5 minutes
    this.stateCheckInterval = setInterval(() => {
      this.checkState().catch(console.error);
    }, 5 * 60 * 1000);
  }

  async checkState(): Promise<{
    staff: AuthenticatedUser | null;
    hasActiveProfile: boolean;
  }> {
    try {
      const response = await api.get(
        `/api/sessions/state/${this.currentSessionId}`
      );
      if (response.staff) {
        this.updateStoredSession(response.staff.id, response.staff);
      }
      return {
        staff: response.staff || null,
        hasActiveProfile: response.hasActiveProfile,
      };
    } catch (error) {
      console.error("Session state check failed:", error);
      return {
        staff: null,
        hasActiveProfile: false,
      };
    }
  }

  async login(ic_no: string, password: string): Promise<AuthenticatedSession> {
    try {
      const data = await api.post("/api/auth/login", {
        ic_no,
        password,
        sessionId: this.currentSessionId,
      });

      const session: AuthenticatedSession = {
        sessionId: data.sessionId,
        staffId: data.user.id,
        user: data.user,
      };

      this.currentSessionId = data.sessionId;
      localStorage.setItem(this.SESSION_ID_KEY, this.currentSessionId);
      this.saveSession(session);

      return session;
    } catch (error) {
      throw this.createSessionError(
        "Login failed",
        "NETWORK_ERROR",
        error as Error
      );
    }
  }

  getSessionId(): string {
    return this.currentSessionId;
  }

  getStoredSession(): StoredSession | null {
    try {
      const sessionData = localStorage.getItem(this.SESSION_KEY);
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      console.error("Error retrieving stored session:", error);
      this.clearSession();
      return null;
    }
  }

  private saveSession(session: StoredSession): void {
    try {
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      throw this.createSessionError(
        "Failed to save session",
        "STORAGE_ERROR",
        error as Error
      );
    }
  }

  updateStoredSession(
    staffId: string | null,
    user: AuthenticatedUser | null = null
  ): void {
    const session: StoredSession = {
      sessionId: this.currentSessionId,
      staffId,
      user,
    };
    this.saveSession(session);
  }

  async logout(): Promise<void> {
    try {
      await this.endSession();
    } finally {
      this.clearSession();
      // Generate new session ID for anonymous tracking
      this.currentSessionId = this.generateSessionId();
      localStorage.setItem(this.SESSION_ID_KEY, this.currentSessionId);
    }
  }

  async endSession(): Promise<void> {
    try {
      await api.delete(`/api/sessions/${this.currentSessionId}`);
      this.clearSession();
      if (this.stateCheckInterval) {
        clearInterval(this.stateCheckInterval);
      }
    } catch (error) {
      throw this.createSessionError(
        "Failed to end session",
        "NETWORK_ERROR",
        error as Error
      );
    }
  }

  private clearSession(): void {
    try {
      localStorage.removeItem(this.SESSION_KEY);
    } catch (error) {
      console.error("Error clearing session:", error);
    }
  }
}

export const sessionService = new SessionService();
