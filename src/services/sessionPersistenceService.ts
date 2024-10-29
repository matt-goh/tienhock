// services/sessionPersistenceService.ts
interface StoredSession {
    sessionId: string;
    staffId: string | null;
    deviceInfo: {
      userAgent: string;
      deviceType: string;
      timestamp: string;
    };
    lastActive: string;
  }
  
  class SessionPersistenceService {
    private readonly SESSION_KEY = 'profileSwitcher_session';
    private readonly SESSION_ID_KEY = 'profileSwitcher_sessionId';
    private readonly SESSION_EXPIRY_DAYS = 30;
    private currentSessionId: string;
  
    constructor() {
      // Initialize or retrieve existing sessionId
      let existingSessionId = localStorage.getItem(this.SESSION_ID_KEY);
      if (!existingSessionId) {
        existingSessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem(this.SESSION_ID_KEY, existingSessionId);
      }
      this.currentSessionId = existingSessionId;
      
      // Clean up expired sessions on initialization
      this.cleanupExpiredSessions();
    }
  
    saveSession(staffId: string | null): void {
      const session: StoredSession = {
        sessionId: this.currentSessionId,
        staffId,
        deviceInfo: {
          userAgent: navigator.userAgent,
          deviceType: 'Desktop',
          timestamp: new Date().toISOString()
        },
        lastActive: new Date().toISOString()
      };
  
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    }
  
    getStoredSession(): StoredSession | null {
      const sessionData = localStorage.getItem(this.SESSION_KEY);
      
      if (!sessionData) {
        return null;
      }
  
      try {
        const session: StoredSession = JSON.parse(sessionData);
        
        // Check if session has expired
        const lastActive = new Date(session.lastActive);
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() - this.SESSION_EXPIRY_DAYS);
  
        if (lastActive < expiryDate) {
          this.clearSession();
          return null;
        }
  
        // Validate that the stored sessionId matches current sessionId
        if (session.sessionId !== this.currentSessionId) {
          this.clearSession();
          return null;
        }
  
        return session;
      } catch (error) {
        console.error('Error parsing stored session:', error);
        this.clearSession();
        return null;
      }
    }
  
    updateLastActive(): void {
      const session = this.getStoredSession();
      if (session) {
        session.lastActive = new Date().toISOString();
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
      }
    }
  
    getSessionId(): string {
      return this.currentSessionId;
    }
  
    clearSession(): void {
      localStorage.removeItem(this.SESSION_KEY);
      // Note: We don't remove the sessionId as it should persist across logouts
    }
  
    private cleanupExpiredSessions(): void {
      const session = this.getStoredSession();
      if (session) {
        const lastActive = new Date(session.lastActive);
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() - this.SESSION_EXPIRY_DAYS);
  
        if (lastActive < expiryDate) {
          this.clearSession();
        }
      }
    }
  }
  
  export const sessionPersistenceService = new SessionPersistenceService();