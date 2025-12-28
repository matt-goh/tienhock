// src/components/Navbar/NavbarUserMenu.tsx
import { Switch } from "@headlessui/react";
import {
  IconUserCircle,
  IconLogout,
  IconMoon,
  IconDatabaseExport,
} from "@tabler/icons-react";
import { useAuth } from "../../contexts/AuthContext";
import { useState, useRef, useEffect } from "react";
import BackupModal from "../BackupModal";

export default function NavbarUserMenu() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle hover open/close
  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleLogout = async () => {
    try {
      setIsOpen(false);
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const toggleDarkMode = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDarkMode(!isDarkMode);
  };

  const handleBackupClick = () => {
    setIsOpen(false);
    setTimeout(() => {
      setIsBackupModalOpen(true);
    }, 0);
  };

  return (
    <>
      <div
        className="relative"
        ref={dropdownRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-default-100 active:bg-default-200 transition-colors duration-200">
          <IconUserCircle
            className="text-default-600"
            size={24}
            stroke={1.5}
          />
          <span className="hidden sm:block text-sm font-medium text-default-700 max-w-[100px] truncate">
            {user?.id || "User"}
          </span>
        </button>

        {isOpen && (
          <div className="absolute right-0 z-50 mt-2 w-56 bg-white border border-default-200 rounded-lg shadow-lg animate-in fade-in zoom-in-95 duration-100">
            <div className="px-1 py-1">
              {/* Dark Mode Toggle */}
              <div
                onClick={toggleDarkMode}
                className="h-9 group flex w-full items-center justify-between rounded-md px-2 text-sm text-default-700 hover:bg-default-100 active:bg-default-200 transition-colors duration-200 cursor-pointer"
              >
                <div className="flex items-center">
                  <IconMoon className="mr-2 h-5 w-5" stroke={1.5} />
                  Dark Mode
                </div>
                <Switch
                  checked={isDarkMode}
                  onChange={() => setIsDarkMode(!isDarkMode)}
                  className={`${
                    isDarkMode ? "bg-default-400" : "bg-default-200"
                  } relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200`}
                >
                  <span
                    className={`${
                      isDarkMode ? "translate-x-5" : "translate-x-1"
                    } inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200`}
                  />
                </Switch>
              </div>

              {/* Backup Option */}
              <button
                className="h-9 group flex w-full items-center rounded-md px-2 text-sm text-default-700 hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                onClick={handleBackupClick}
              >
                <IconDatabaseExport
                  className="mr-2 h-5 w-5"
                  stroke={1.5}
                />
                Backup
              </button>

              {/* Logout Option */}
              <button
                className="h-9 group flex w-full items-center rounded-md px-2 text-sm text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors duration-200"
                onClick={handleLogout}
              >
                <IconLogout className="mr-2 h-5 w-5" stroke={1.5} />
                Logout
              </button>
            </div>
          </div>
        )}
      </div>

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
      />
    </>
  );
}
