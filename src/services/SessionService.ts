// services/SessionService.ts
import { api } from "../routes/utils/api";

export interface AuthenticatedUser {
  id: string;
  name: string;
  ic_no: string;
  job: string[];
  isSecurityAdmin?: boolean;
}

export interface StoredSession {
  sessionId: string;
  staffId: string | null;
  user?: AuthenticatedUser | null;
}

export interface SessionError extends Error {
  code: "INITIALIZATION_ERROR" | "NETWORK_ERROR" | "STORAGE_ERROR";
  cause?: Error;
}

export interface AuthenticatedSession extends StoredSession {
  user: AuthenticatedUser | null;
}

export interface SessionState {
  staff: AuthenticatedUser | null;
  hasActiveProfile: boolean;
}

class SessionService {
  private readonly SESSION_KEY = "app_session";
  private readonly SESSION_ID_KEY = "app_sessionId";
  private currentSessionId: string;
  private stateCheckInterval?: NodeJS.Timeout;
  private lastCheckTime: number = 0;
  private MINIMUM_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes between activity-based checks
  private REGULAR_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes for background check

  constructor() {
    this.currentSessionId =
      "cookie-session";
    try {
      localStorage.removeItem(this.SESSION_ID_KEY);
      const cached: StoredSession | null = this.getStoredSession();
      if (cached && cached.sessionId !== "cookie-session") this.clearSession();
    } catch { /* Login remains available when browser storage is disabled. */ }
    this.startStateCheck();
    this.setupActivityBasedChecks();
  }

  private getStoredSessionId(): string | null {
    try {
      return localStorage.getItem(this.SESSION_ID_KEY);
    } catch (error) {
      console.error("Failed to get stored session ID:", error);
      return null;
    }
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

  // New method for activity-based checks
  private setupActivityBasedChecks(): void {
    // Record initial check time
    this.lastCheckTime = Date.now();

    // Function to check session state if enough time has passed
    const checkOnActivity = () => {
      const now = Date.now();
      if (now - this.lastCheckTime > this.MINIMUM_CHECK_INTERVAL) {
        this.checkState().catch(console.error);
        this.lastCheckTime = now;
      }
    };

    // Check on relevant user activities
    if (typeof window !== "undefined") {
      // Navigation events
      window.addEventListener("popstate", checkOnActivity);

      // User interaction events
      document.addEventListener("click", checkOnActivity);

      // Window focus events
      window.addEventListener("focus", checkOnActivity);

      // Custom events that might be dispatched on important actions
      window.addEventListener("app:importantAction", checkOnActivity);
    }
  }

  async initialize(): Promise<SessionState> {
    try {
      const storedSession = this.getStoredSession();

      const response = await api.post("/api/sessions/initialize", {
        sessionId: this.currentSessionId,
        staffId: storedSession?.staffId || null,
      });

      if (response.requireReconnect) {
        // Server is indicating we need to start fresh
        this.clearSession();
        throw this.createSessionError(
          "Server requires reconnection",
          "INITIALIZATION_ERROR"
        );
      }

      if (!this.getStoredSessionId()) {
        localStorage.setItem(this.SESSION_ID_KEY, this.currentSessionId);
      }

      // Update the last check time since we just did a check
      this.lastCheckTime = Date.now();

      // Update stored session with staff data if available
      if (response.staff) {
        this.updateStoredSession(response.staff.id, response.staff);
      }

      return {
        staff: response.staff || null,
        hasActiveProfile: response.hasActiveProfile,
      };
    } catch (error) {
      // If there's a connection error, don't throw - allow the app to function
      // in a degraded state and attempt reconnection later
      if (
        error instanceof Error &&
        (error.message.includes("Network Error") ||
          error.message.includes("Failed to fetch"))
      ) {
        console.warn(
          "Network error during session initialization, will retry later"
        );
        return {
          staff: null,
          hasActiveProfile: false,
        };
      }

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
    // Extended to 30 minutes instead of 5
    this.stateCheckInterval = setInterval(() => {
      this.checkState().catch(console.error);
    }, this.REGULAR_CHECK_INTERVAL);
  }

  async checkState(): Promise<SessionState> {
    if (!this.getStoredSession()?.user) return { staff: null, hasActiveProfile: false };
    try {
      // Use the state endpoint to check session without creating/updating it
      const response = await api.get(
        "/api/sessions/state"
      );

      // Update the last check time
      this.lastCheckTime = Date.now();

      if (response.staff) {
        this.updateStoredSession(response.staff.id, response.staff);
      }

      return {
        staff: response.staff || null,
        hasActiveProfile: response.hasActiveProfile,
      };
    } catch (error: any) {
      // Check for specific error codes that indicate session issues
      if (
        error.response?.data?.code === "SESSION_NOT_FOUND" ||
        error.response?.data?.requireLogin
      ) {
        // Fire session expired event
        window.dispatchEvent(new Event("sessionExpired"));
      }

      console.error("Session state check failed:", error);
      return {
        staff: null,
        hasActiveProfile: false,
      };
    }
  }

  // Find this method and replace the catch block:
  async login(ic_no: string, password: string): Promise<AuthenticatedSession> {
    try {
      const data = await api.post("/api/auth/login", {
        ic_no,
        password,
      });

      const session: AuthenticatedSession = {
        sessionId: data.sessionId,
        staffId: data.user.id,
        user: data.user,
      };

      this.currentSessionId = data.sessionId;
      localStorage.setItem(this.SESSION_ID_KEY, this.currentSessionId);
      this.saveSession(session);
      this.startStateCheck();

      // Update the last check time after login
      this.lastCheckTime = Date.now();

      return session;
    } catch (error: any) {
      // Extract the actual error message from the API response
      const errorMessage = error?.message || "Login failed";

      throw this.createSessionError(
        errorMessage,
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
    await this.endSession();
  }

  async endSession(): Promise<void> {
    // Keep the UI signed in if revocation fails, so logout can be retried.
    await api.post("/api/auth/logout", {});
    this.clearSession();
    this.currentSessionId = "cookie-session";
    if (this.stateCheckInterval) clearInterval(this.stateCheckInterval);
  }

  private clearSession(): void {
    try {
      localStorage.removeItem(this.SESSION_KEY);
      localStorage.removeItem(this.SESSION_ID_KEY);
    } catch (error) {
      console.error("Error clearing session:", error);
    }
  }
}

export const sessionService = new SessionService();
