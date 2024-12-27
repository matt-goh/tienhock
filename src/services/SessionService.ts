// services/SessionService.ts
import { API_BASE_URL } from "../configs/config";

export interface StoredSession {
  sessionId: string;
  staffId: string | null;
  deviceInfo: {
    userAgent: string;
    deviceType: string;
    timestamp: string;
  };
  lastActive: string;
  metadata?: Record<string, unknown>;
}

export interface SessionError extends Error {
  code: 'INITIALIZATION_ERROR' | 'NETWORK_ERROR' | 'STORAGE_ERROR' | 'SESSION_EXPIRED' | 'INVALID_STATE';
}

class SessionService {
  private readonly SESSION_KEY = 'profileSwitcher_session';
  private readonly SESSION_ID_KEY = 'profileSwitcher_sessionId';
  private readonly SESSION_EXPIRY_DAYS = 30;
  private currentSessionId: string;
  private initialized: boolean = false;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor() {
    this.currentSessionId = this.initializeSessionId();
    this.cleanupExpiredSessions();
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
      console.error('Failed to initialize session ID:', error);
      // Fallback to memory-only session ID if localStorage is unavailable
      return this.generateSessionId();
    }
  }

  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const userAgent = navigator.userAgent.split('').reduce((hash, char) => 
      ((hash << 5) - hash) + char.charCodeAt(0), 0);
    return `${timestamp}-${random}-${Math.abs(userAgent)}`;
  }

  private createSessionError(message: string, code: SessionError['code'], originalError?: Error): SessionError {
    const error = new Error(message) as SessionError;
    error.code = code;
    error.cause = originalError;
    return error;
  }

  private getCurrentDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      deviceType: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
      timestamp: new Date().toISOString(),
    };
  }

  private isSessionExpired(lastActive: string): boolean {
    const lastActiveDate = new Date(lastActive);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - this.SESSION_EXPIRY_DAYS);
    return lastActiveDate < expiryDate;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const storedSession = this.getStoredSession();
      const deviceInfo = this.getCurrentDeviceInfo();

      const response = await fetch(`${API_BASE_URL}/api/sessions/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.currentSessionId,
          staffId: storedSession?.staffId || null,
          deviceInfo,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Start heartbeat after successful initialization
      this.startHeartbeat();
      this.initialized = true;
    } catch (error) {
      const sessionError = this.createSessionError(
        'Failed to initialize session',
        'INITIALIZATION_ERROR',
        error as Error
      );
      throw sessionError;
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
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          // Session not found or expired - reinitialize
          this.initialized = false;
          await this.initialize();
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      // Update last active timestamp in local storage
      const storedSession = this.getStoredSession();
      if (storedSession) {
        storedSession.lastActive = new Date().toISOString();
        this.saveSession(storedSession);
      }
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
      // Don't throw here to prevent crashing the heartbeat interval
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

      // Validate session
      if (session.sessionId !== this.currentSessionId) {
        throw this.createSessionError(
          'Session ID mismatch',
          'INVALID_STATE'
        );
      }

      if (this.isSessionExpired(session.lastActive)) {
        this.clearSession();
        throw this.createSessionError(
          'Session has expired',
          'SESSION_EXPIRED'
        );
      }

      return session;
    } catch (error) {
      console.error('Error retrieving stored session:', error);
      // Clear invalid session data
      this.clearSession();
      return null;
    }
  }

  private saveSession(session: StoredSession): void {
    try {
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      console.error('Error saving session:', error);
      throw this.createSessionError(
        'Failed to save session',
        'STORAGE_ERROR',
        error as Error
      );
    }
  }

  updateStoredSession(staffId: string | null): void {
    const session: StoredSession = {
      sessionId: this.currentSessionId,
      staffId,
      deviceInfo: this.getCurrentDeviceInfo(),
      lastActive: new Date().toISOString(),
    };

    this.saveSession(session);
  }

  private cleanupExpiredSessions(): void {
    const session = this.getStoredSession();
    if (session && this.isSessionExpired(session.lastActive)) {
      this.clearSession();
    }
  }

  async endSession(): Promise<void> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/sessions/${this.currentSessionId}`,
        {
          method: 'DELETE',
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
        'Failed to end session',
        'NETWORK_ERROR',
        error as Error
      );
    }
  }

  private clearSession(): void {
    try {
      localStorage.removeItem(this.SESSION_KEY);
      // Note: We keep the sessionId for device tracking
    } catch (error) {
      console.error('Error clearing session:', error);
    }
  }
}

export const sessionService = new SessionService();