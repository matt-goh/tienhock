import { getWebSocketUrl } from "../config";
import { sessionPersistenceService } from "./sessionPersistenceService";

export class WebSocketService {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private readonly reconnectDelay: number = 3000;
  private isDisconnecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private connectionResolver: (() => void) | null = null;
  private connectionRejector: ((error: Error) => void) | null = null;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
  }

  private getOrCreateSessionId(): string {
    return sessionPersistenceService.getSessionId();
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isDisconnecting = false;

    this.connectionPromise = new Promise((resolve, reject) => {
      this.connectionResolver = resolve;
      this.connectionRejector = reject;

      try {
        const wsUrl = getWebSocketUrl();
        this.ws = new WebSocket(wsUrl);

        const timeoutId = setTimeout(() => {
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            if (this.connectionRejector) {
              this.connectionRejector(
                new Error("WebSocket connection timeout")
              );
            }
          }
        }, 5000);

        this.ws.onopen = () => {
          clearTimeout(timeoutId);
          this.reconnectAttempts = 0;

          // Get stored session data for registration
          const storedSession = sessionPersistenceService.getStoredSession();

          // Determine if this is a new registration or reconnection
          const messageType = storedSession?.staffId ? "reconnect" : "register";

          this.send(messageType, {
            sessionId: this.sessionId,
            staffId: storedSession?.staffId || null,
            deviceInfo: {
              userAgent: navigator.userAgent,
              deviceType: "Desktop",
              timestamp: new Date().toISOString(),
            },
          });

          if (this.connectionResolver) {
            this.connectionResolver();
          }
          this.connectionPromise = null;
          this.connectionResolver = null;
          this.connectionRejector = null;
        };

        // Rest of the WebSocket setup remains the same...
        this.ws.onmessage = (event) => {
          if (this.isDisconnecting) return;
          try {
            const message = JSON.parse(event.data);
            const handlers = this.messageHandlers.get(message.type);
            if (handlers) {
              handlers.forEach((handler) => handler(message.data));
            }
          } catch (error) {
            console.error("WebSocket message handling error:", error);
          }
        };

        this.ws.onclose = (event) => {
          clearTimeout(timeoutId);
          if (!this.isDisconnecting) {
            this.handleDisconnection();
          }
          if (
            this.connectionRejector &&
            this.ws?.readyState !== WebSocket.OPEN
          ) {
            this.connectionRejector(
              new Error("WebSocket closed before connection established")
            );
          }
          this.connectionPromise = null;
          this.connectionResolver = null;
          this.connectionRejector = null;
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeoutId);
          if (this.connectionRejector) {
            this.connectionRejector(new Error("WebSocket connection failed"));
          }
          this.connectionPromise = null;
          this.connectionResolver = null;
          this.connectionRejector = null;
        };
      } catch (error) {
        if (this.connectionRejector) {
          this.connectionRejector(
            error instanceof Error ? error : new Error("Connection failed")
          );
        }
        this.connectionPromise = null;
        this.connectionResolver = null;
        this.connectionRejector = null;
      }
    });

    return this.connectionPromise;
  }

  private cleanup() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      // Store reference to avoid null check issues
      const ws = this.ws;
      this.ws = null;

      // Remove all listeners first
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;

      // Only close if not already closing/closed
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }

    // Clear connection promise state
    this.connectionPromise = null;
    this.connectionResolver = null;
    this.connectionRejector = null;
  }

  private handleDisconnection() {
    if (this.isDisconnecting) return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      console.error(
        `Failed to reconnect after ${this.maxReconnectAttempts} attempts`
      );
      this.reconnectAttempts = 0;
    }
  }

  private scheduleReconnect() {
    if (this.isDisconnecting || this.reconnectTimeout) return;

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.reconnectAttempts++;
      if (!this.isDisconnecting) {
        this.connect().catch(() => {});
      }
    }, this.reconnectDelay);
  }

  subscribe(messageType: string, handler: (data: any) => void) {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, new Set());
    }
    this.messageHandlers.get(messageType)!.add(handler);
  }

  unsubscribe(messageType: string, handler: (data: any) => void) {
    const handlers = this.messageHandlers.get(messageType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.messageHandlers.delete(messageType);
      }
    }
  }

  async send(type: string, data: any) {
    if (this.isDisconnecting) return;

    try {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        await this.connect();
      }

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type, ...data }));
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      throw error;
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  disconnect() {
    this.isDisconnecting = true;

    // Clear all handlers first
    this.messageHandlers.clear();

    // Clean up WebSocket and timeouts
    this.cleanup();

    // Reset state
    this.reconnectAttempts = 0;
    this.isDisconnecting = false;
  }
}

export const websocketService = new WebSocketService();
