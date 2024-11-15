import { IconLoader2, IconReload, IconServer } from "@tabler/icons-react";
import { useState, useEffect, useRef } from "react";
import { ReactNode } from "react";
import { API_BASE_URL } from "./configs/config";
import toast from "react-hot-toast";
import App from "./App";
import Button from "./components/Button";

interface HealthService {
  status: string;
  activeSessions?: number;
}

interface HealthData {
  status: string;
  services: {
    database: HealthService;
    websocket: HealthService;
  };
  error?: string;
}

const WithConnectionStatus = ({ children }: { children: ReactNode }) => {
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const hasShownSuccessToast = useRef(false);
  const wasDisconnected = useRef(false);

  const getErrorMessage = (error: unknown): string => {
    let errorStr = "";

    // Convert error to string format for checking
    if (error instanceof TypeError) {
      return "Unable to connect to server. Please check if the server is running.";
    } else if (error instanceof Error) {
      errorStr = error.message;
    } else if (typeof error === "string") {
      errorStr = error;
    } else {
      errorStr = String(error);
    }

    // Check for database connection error
    if (errorStr.includes("getaddrinfo ENOTFOUND")) {
      return "Unable to connect to database. Please check database connection and try again.";
    }

    return errorStr;
  };

  // Effect for showing toasts based on connection status changes
  useEffect(() => {
    if (connectionStatus === "connected" && (!hasShownSuccessToast.current || wasDisconnected.current)) {
      toast.success(
        (t) => (
          <div className="flex flex-col space-y-1">
            <span className="font-medium">Connected to server successfully</span>
          </div>
        ),
        { duration: 3000 }
      );
      hasShownSuccessToast.current = true;
      wasDisconnected.current = false;
    } else if (connectionStatus === "error" && errorMessage) {
      wasDisconnected.current = true;
      toast.error(
        (t) => (
          <div className="flex items-center space-x-2">
            <div className="flex flex-col space-y-1">
              <span className="font-medium">{errorMessage}</span>
              <span className="text-xs">
                Please check your connection and try again
              </span>
            </div>
            <Button
              size="sm"
              color="rose"
              onClick={() => {
                toast.dismiss(t.id);
                window.location.reload();
              }}
            >
              Retry
            </Button>
          </div>
        ),
        { duration: Infinity }
      );
    }
  }, [connectionStatus, errorMessage]);

  // Effect for checking connection
  useEffect(() => {
    let mounted = true;

    const checkConnection = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        const data: HealthData = await response.json();

        if (!mounted) return;

        if (data.status === "unhealthy") {
          throw new Error(data.error || "Server is not responding properly");
        }

        setConnectionStatus("connected");
      } catch (error: unknown) {
        if (!mounted) return;
        
        const message = getErrorMessage(error);
        setErrorMessage(message);
        setConnectionStatus("error");
      }
    };

    checkConnection();

    // Set up periodic health checks
    const interval = setInterval(checkConnection, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (connectionStatus === "connecting") {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-default-50">
        <div className="text-center space-y-4 p-4">
          <IconServer className="h-12 w-12 text-sky-500 mx-auto" stroke={1.5} />
          <h2 className="text-xl font-semibold text-default-900">
            Connecting to server...
          </h2>
          <p className="text-default-500">
            Please wait while the system establish connection
          </p>
          <div className="flex justify-center">
            <IconLoader2
              className="h-5 w-5 animate-spin text-sky-500"
              stroke={1.5}
            />
          </div>
        </div>
      </div>
    );
  }

  if (connectionStatus === "error") {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-default-50 p-4">
        <div className="max-w-xl w-full text-center space-y-4">
          <h2 className="text-xl font-semibold text-default-900">
            Connection Error
          </h2>
          <p className="text-default-500">{errorMessage}</p>
          <Button
            icon={IconReload}
            variant="default"
            color="rose"
            onClick={() => window.location.reload()}
          >
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const AppWithConnection = () => {
  return (
    <WithConnectionStatus>
      <App />
    </WithConnectionStatus>
  );
};

export default AppWithConnection;