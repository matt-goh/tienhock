import {
  Route,
  BrowserRouter,
  Routes,
  useLocation,
  Navigate,
} from "react-router-dom";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { Toaster } from "react-hot-toast";
import { routes } from "./pages/pagesRoute";
import { IconDeviceDesktop } from "@tabler/icons-react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { CompanyProvider } from "./contexts/CompanyContext";
import Login from "./pages/Auth/Login";
import ProtectedRoute from "./components/Auth/ProtectedRoute";
import Sidebar from "./components/Sidebar/Sidebar";
import "./index.css";
import LoadingSpinner from "./components/LoadingSpinner";
import Button from "./components/Button";

const Layout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    const pinnedState = localStorage.getItem("sidebarPinned");
    return pinnedState ? JSON.parse(pinnedState) : true;
  });
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  const [dismissedMobileWarning, setDismissedMobileWarning] =
    useState<boolean>(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const location = useLocation();
  const isPDFRoute = location.pathname === "/pdf-viewer";
  const isVisible = isPinned || isHovered;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebarPinned", JSON.stringify(isPinned));
  }, [isPinned]);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    if (!isPinned) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isPinned) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsHovered(false);
      }, 300);
    }
  };

  const handleSetIsPinned = useCallback((pinned: boolean) => {
    setIsPinned(pinned);
    if (!pinned) {
      setIsHovered(false);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex">
      {/* Only show sidebar if authenticated and not on PDF route */}
      {isAuthenticated && !isPDFRoute && (
        <div
          className={`fixed z-50 top-0 left-0 h-screen sidebar-hidden ${
            isMobile ? "w-0 overflow-hidden" : ""
          }`}
          style={{ width: isMobile ? 0 : isVisible ? "254px" : "3rem" }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <Sidebar
            isPinned={isPinned}
            isHovered={isHovered}
            setIsPinned={handleSetIsPinned}
            setIsHovered={setIsHovered}
          />
        </div>
      )}
      <main
        className={`
    flex justify-center w-full transition-all duration-300 ease-in-out
    ${!isPDFRoute && location.pathname !== "/login" ? "mt-[84px]" : ""} 
    ${
      isAuthenticated && isVisible && !isPDFRoute && !isMobile
        ? "ml-[254px]"
        : ""
    }
    `}
      >
        <Routes>
          {/* Login route */}
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
          />

          {/* Home route */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Navigate to="/" replace />
              </ProtectedRoute>
            }
          />

          {/* Company-specific home routes */}
          <Route
            path="/greentarget"
            element={
              <ProtectedRoute>
                <Navigate to="/greentarget" replace />
              </ProtectedRoute>
            }
          />

          <Route
            path="/jellypolly"
            element={
              <ProtectedRoute>
                <Navigate to="/jellypolly" replace />
              </ProtectedRoute>
            }
          />

          {/* All routes from all companies */}
          {routes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                <ProtectedRoute>
                  {React.createElement(route.component)}
                </ProtectedRoute>
              }
            />
          ))}
        </Routes>
      </main>

      {/* Mobile Warning Overlay */}
      {isMobile && !dismissedMobileWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="max-w-md w-full text-center space-y-6 p-6 bg-white rounded-lg shadow-lg">
            <IconDeviceDesktop
              className="h-16 w-16 mx-auto text-sky-500"
              stroke={1.5}
            />
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-default-900">
                Desktop View Recommended
              </h2>
              <p className="text-default-500">
                This application is optimized for desktop use. Some features may
                not display properly on smaller screens.
              </p>
              <p className="text-sm text-default-400">
                Minimum recommended width: 768px
              </p>
            </div>
            <Button
              onClick={() => setDismissedMobileWarning(true)}
              className="mt-4 w-full"
              color="sky"
            >
              Continue Anyway
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <CompanyProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                padding: "12px",
                fontSize: "0.875rem",
                lineHeight: "1.25rem",
                fontWeight: 500,
              },
            }}
          />
          <Layout />
        </CompanyProvider>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
