// services/SessionService.ts
import { API_BASE_URL } from "../configs/config";

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
  private readonly SESSION_KEY = "profileSwitcher_session";
  private readonly SESSION_ID_KEY = "profileSwitcher_sessionId";
  private currentSessionId: string;
  private initialized: boolean = false;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor() {
    this.currentSessionId = this.initializeSessionId();
  }

  private initializeSessionId(): string {
    try {
      let existingSessionId = localStorage.getItem(this.SESSION_ID_KEY);
      if (!existingSessionId) {
        existingSessionId = this.generateSessionId();
        localStorage.setItem(this.SESSION_ID_KEY, existingSessionId);
      }
      return existingSessionId;
    } catch (error) {
      console.error("Failed to initialize session ID:", error);
      return this.generateSessionId();
    }
  }

  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random}`;
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
    if (this.initialized) return;

    try {
      const storedSession = this.getStoredSession();

      const response = await fetch(`${API_BASE_URL}/api/sessions/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: this.currentSessionId,
          staffId: storedSession?.staffId || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      this.startHeartbeat();
      this.initialized = true;
    } catch (error) {
      throw this.createSessionError(
        "Failed to initialize session",
        "INITIALIZATION_ERROR",
        error as Error
      );
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat().catch(console.error);
    }, 30000); // 30 seconds
  }

  async sendHeartbeat(): Promise<void> {
    if (!this.initialized) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/sessions/${this.currentSessionId}/heartbeat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          // Session not found - reinitialize
          this.initialized = false;
          await this.initialize();
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }
    } catch (error) {
      console.error("Failed to send heartbeat:", error);
    }
  }

  async login(ic_no: string, password: string): Promise<AuthenticatedSession> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
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
      const session: AuthenticatedSession = {
        sessionId: data.sessionId,
        staffId: data.user.id,
        user: data.user,
      };

      this.saveSession(session);
      this.currentSessionId = data.sessionId;
      await this.initialize();

      return session;
    } catch (error) {
      throw this.createSessionError(
        "Login failed",
        "NETWORK_ERROR",
        error as Error
      );
    }
  }

  async validateSession(): Promise<AuthenticatedUser | null> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/sessions/state/${this.currentSessionId}`,
        {
          headers: {
            "session-id": this.currentSessionId,
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.staff;
    } catch (error) {
      console.error("Session validation failed:", error);
      return null;
    }
  }

  getSessionId(): string {
    return this.currentSessionId;
  }

  getStoredSession(): StoredSession | null {
    try {
      const sessionData = localStorage.getItem(this.SESSION_KEY);
      if (!sessionData) return null;

      const session: StoredSession = JSON.parse(sessionData);
      return session;
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
      console.error("Error saving session:", error);
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
    await this.endSession();
    this.clearSession();
    // Generate new session ID for anonymous tracking
    this.currentSessionId = this.generateSessionId();
    localStorage.setItem(this.SESSION_ID_KEY, this.currentSessionId);
  }

  async endSession(): Promise<void> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/sessions/${this.currentSessionId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      this.clearSession();
      this.initialized = false;

      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = undefined;
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
