// src/components/Navbar/NavbarUserMenu.tsx
import { Switch } from "@headlessui/react";
import {
  IconUserCircle,
  IconLogout,
  IconMoon,
  IconDatabaseExport,
  IconHistory,
  IconExternalLink,
  IconLanguage,
} from "@tabler/icons-react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  LANGUAGE_SHORT_LABELS,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
  resolveLanguage,
} from "../../i18n";
import BackupModal from "../BackupModal";
import ChangelogModal from "../ChangelogModal";

const GT_SIGNUP_PREVIEW_PATH = "/greentarget/dev/customer-signup-preview";

export default function NavbarUserMenu() {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { t, i18n } = useTranslation("nav");
  const [isOpen, setIsOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const activeLanguage: SupportedLanguage = resolveLanguage(
    i18n.resolvedLanguage || i18n.language
  );
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const canAccessSignupPreview: boolean =
    import.meta.env.DEV && user?.id === "MATTHEW";

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

  const handleChangelogClick = () => {
    setIsOpen(false);
    setTimeout(() => {
      setIsChangelogOpen(true);
    }, 0);
  };

  const handleSignupPreviewClick = (): void => {
    setIsOpen(false);
    window.open(GT_SIGNUP_PREVIEW_PATH, "_blank", "noopener,noreferrer");
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
            {user?.id || t("User")}
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
                  {t("Dark Mode")}
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

              {/* Language Selector */}
              <div className="px-2 py-1.5">
                <div className="flex items-center text-sm text-default-700 dark:text-gray-200 mb-1.5">
                  <IconLanguage className="mr-2 h-5 w-5" stroke={1.5} />
                  {t("Language")}
                </div>
                <div className="flex rounded-md border border-default-200 dark:border-gray-600 overflow-hidden">
                  {SUPPORTED_LANGUAGES.map((lang: SupportedLanguage) => {
                    const isActive = activeLanguage === lang;
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void i18n.changeLanguage(lang);
                        }}
                        className={`flex-1 px-1 py-2 text-xs font-medium whitespace-nowrap transition-colors duration-150 ${
                          isActive
                            ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                            : "text-default-600 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        {LANGUAGE_SHORT_LABELS[lang]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {canAccessSignupPreview && (
                <button
                  className="h-9 group flex w-full items-center rounded-md px-2 text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 transition-colors duration-200"
                  onClick={handleSignupPreviewClick}
                >
                  <IconExternalLink
                    className="mr-2 h-5 w-5 flex-shrink-0"
                    stroke={1.5}
                  />
                  <span className="truncate min-w-0">
                    {t("Customer Signup Preview")}
                  </span>
                </button>
              )}

              {/* Changelog Option */}
              <button
                className="h-9 group flex w-full items-center rounded-md px-2 text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 transition-colors duration-200"
                onClick={handleChangelogClick}
              >
                <IconHistory className="mr-2 h-5 w-5" stroke={1.5} />
                {t("Changelog")}
              </button>

              {/* Backup Option */}
              <button
                className="h-9 group flex w-full items-center rounded-md px-2 text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 transition-colors duration-200"
                onClick={handleBackupClick}
              >
                <IconDatabaseExport
                  className="mr-2 h-5 w-5"
                  stroke={1.5}
                />
                {t("Backup")}
              </button>

              {/* Logout Option */}
              <button
                className="h-9 group flex w-full items-center rounded-md px-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 active:bg-red-100 dark:active:bg-red-900/50 transition-colors duration-200"
                onClick={handleLogout}
              >
                <IconLogout className="mr-2 h-5 w-5" stroke={1.5} />
                {t("Logout")}
              </button>
            </div>
          </div>
        )}
      </div>

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
      />

      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
      />
    </>
  );
}
