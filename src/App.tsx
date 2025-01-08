import {
  Route,
  BrowserRouter,
  Routes,
  useLocation,
  Navigate,
} from "react-router-dom";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { Toaster } from "react-hot-toast";
import { routes } from "./components/Sidebar/SidebarData";
import { IconDeviceDesktop } from "@tabler/icons-react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Auth/Login";
import ProtectedRoute from "./components/Auth/ProtectedRoute";
import Sidebar from "./components/Sidebar/Sidebar";
import "./index.css";
import LoadingSpinner from "./components/LoadingSpinner";

const Layout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    const pinnedState = localStorage.getItem("sidebarPinned");
    return pinnedState ? JSON.parse(pinnedState) : true;
  });
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 1024);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const location = useLocation();
  const isPDFRoute = location.pathname === "/pdf-viewer";
  const isVisible = isPinned || isHovered;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
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

  if (isMobile) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-default-50 p-4">
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
              This application is optimized for desktop use. Please open it on a
              larger screen.
            </p>
            <p className="text-sm text-default-400">
              Minimum recommended width: 1024px
            </p>
          </div>
        </div>
      </div>
    );
  }

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
          className="fixed top-0 left-0 h-screen sidebar-hidden"
          style={{ width: isVisible ? "254px" : "6rem" }}
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
    ${!isPDFRoute && location.pathname !== "/login" ? "py-[68px]" : ""} 
    ${isAuthenticated && isVisible && !isPDFRoute ? "ml-[254px]" : ""}
  `}
      >
        <Routes>
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to="/sales/invois" replace />
              ) : (
                <Login />
              )
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Navigate to="/sales/invois" replace />
              </ProtectedRoute>
            }
          />
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
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
