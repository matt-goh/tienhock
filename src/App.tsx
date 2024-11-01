import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { ProfileProvider } from "./contexts/ProfileContext";
import { Toaster } from "react-hot-toast";
import { routes } from "./components/Sidebar/SidebarData";
import Sidebar from "./components/Sidebar/Sidebar";
import "./index.css";

const App: React.FC = () => {
  // Initialize state directly from localStorage
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    const pinnedState = localStorage.getItem("sidebarPinned");
    return pinnedState ? JSON.parse(pinnedState) : true;
  });
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // We only need this effect now, since initial state is handled in useState
  useEffect(() => {
    localStorage.setItem("sidebarPinned", JSON.stringify(isPinned));
  }, [isPinned]);

  const isVisible = isPinned || isHovered;

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

  return (
    <ProfileProvider>
      <Router>
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
        <div className="flex">
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
          <main
            className={`
            flex justify-center w-full py-[68px] transition-all duration-300 ease-in-out
            ${isVisible ? "ml-[254px]" : ""}
          `}
          >
            <Routes>
              {routes.map((route: any) => (
                <Route
                  key={route.path}
                  path={route.path}
                  element={React.createElement(route.component)}
                />
              ))}
            </Routes>
          </main>
        </div>
      </Router>
    </ProfileProvider>
  );
};

export default App;
