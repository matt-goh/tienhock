import { getWebSocketUrl, NODE_ENV } from "../configs/config";
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
  private isDevelopment: boolean;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.isDevelopment = NODE_ENV === "development";
  }

  private getOrCreateSessionId(): string {
    return sessionPersistenceService.getSessionId();
  }

  private getWebSocketUrlWithFallback(): string {
    try {
      const wsUrl = getWebSocketUrl();
      if (this.isDevelopment) {
        // In development, try to connect to local server first
        const localWsUrl = wsUrl.replace(
          "ws://localhost:5000",
          "ws://localhost:5001"
        );
        return localWsUrl;
      }
      return wsUrl;
    } catch (error) {
      console.error("Error getting WebSocket URL:", error);
      // Fallback URL for development
      return this.isDevelopment
        ? "ws://localhost:5001/api/ws"
        : "ws://localhost:5000/api/ws";
    }
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
        const wsUrl = this.getWebSocketUrlWithFallback();
        this.ws = new WebSocket(wsUrl);

        const timeoutId = setTimeout(() => {
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            if (this.isDevelopment) {
              console.warn(
                "Development WebSocket connection timed out, attempting fallback..."
              );
              // Try fallback URL in development
              this.tryFallbackConnection().catch((error) => {
                if (this.connectionRejector) {
                  this.connectionRejector(error);
                }
              });
            } else if (this.connectionRejector) {
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

        this.setupWebSocketHandlers();
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

  private async tryFallbackConnection(): Promise<void> {
    // Try alternative development port if initial connection fails
    const fallbackUrl = "ws://localhost:5000/api/ws";
    console.log("Attempting fallback connection to:", fallbackUrl);

    this.ws = new WebSocket(fallbackUrl);
    return new Promise((resolve, reject) => {
      const fallbackTimeout = setTimeout(() => {
        reject(new Error("Fallback connection timeout"));
      }, 5000);

      this.ws!.onopen = () => {
        clearTimeout(fallbackTimeout);
        console.log("Connected to fallback WebSocket server");
        resolve();
      };

      this.ws!.onerror = () => {
        clearTimeout(fallbackTimeout);
        reject(new Error("Fallback connection failed"));
      };
    });
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

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
      console.log(`WebSocket closed with code ${event.code}`);
      if (!this.isDisconnecting) {
        this.handleDisconnection();
      }
      if (this.connectionRejector && this.ws?.readyState !== WebSocket.OPEN) {
        this.connectionRejector(
          new Error("WebSocket closed before connection established")
        );
      }
      this.connectionPromise = null;
      this.connectionResolver = null;
      this.connectionRejector = null;
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      if (this.connectionRejector) {
        this.connectionRejector(new Error("WebSocket connection failed"));
      }
      this.connectionPromise = null;
      this.connectionResolver = null;
      this.connectionRejector = null;
    };
  }

  private handleDisconnection() {
    if (this.isDisconnecting) return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      console.log(
        `Attempting reconnection (${this.reconnectAttempts + 1}/${
          this.maxReconnectAttempts
        })`
      );
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
