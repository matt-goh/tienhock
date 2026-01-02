// src/components/Navbar/NavbarUserMenu.tsx
import { Switch } from "@headlessui/react";
import {
  IconUserCircle,
  IconLogout,
  IconMoon,
  IconDatabaseExport,
} from "@tabler/icons-react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useState, useRef, useEffect } from "react";
import BackupModal from "../BackupModal";

export default function NavbarUserMenu() {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
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

  const handleToggleDarkMode = (e: React.MouseEvent) => {
    e.preventDefault();
    toggleDarkMode();
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
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 transition-colors duration-200">
          <IconUserCircle
            className="text-default-600 dark:text-gray-400"
            size={24}
            stroke={1.5}
          />
          <span className="hidden sm:block text-sm font-medium text-default-700 dark:text-gray-200 max-w-[100px] truncate">
            {user?.id || "User"}
          </span>
        </button>

        {isOpen && (
          <div className="absolute right-0 z-50 mt-2 w-56 bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 rounded-lg shadow-lg animate-in fade-in zoom-in-95 duration-100">
            <div className="px-1 py-1">
              {/* Dark Mode Toggle */}
              <div
                onClick={handleToggleDarkMode}
                className="h-9 group flex w-full items-center justify-between rounded-md px-2 text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 transition-colors duration-200 cursor-pointer"
              >
                <div className="flex items-center">
                  <IconMoon className="mr-2 h-5 w-5" stroke={1.5} />
                  Dark Mode
                </div>
                <Switch
                  checked={isDarkMode}
                  onChange={toggleDarkMode}
                  className={`${
                    isDarkMode ? "bg-sky-500" : "bg-default-200 dark:bg-gray-600"
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
                className="h-9 group flex w-full items-center rounded-md px-2 text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 transition-colors duration-200"
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
                className="h-9 group flex w-full items-center rounded-md px-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 active:bg-red-100 dark:active:bg-red-900/50 transition-colors duration-200"
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
