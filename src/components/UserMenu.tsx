// components/UserMenu.tsx
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
  Switch,
} from "@headlessui/react";
import {
  IconUserCircle,
  IconLogout,
  IconMoon,
  IconDatabaseExport,
} from "@tabler/icons-react";
import { useAuth } from "../contexts/AuthContext";
import { Fragment, useState } from "react";
import BackupModal from "./BackupModal";

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const toggleDarkMode = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDarkMode(!isDarkMode);
  };

  const handleBackupClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsBackupModalOpen(true);
  };

  return (
    <>
      <Menu as="div" className="w-full relative">
        <MenuButton className="w-full px-3 py-2.5 flex items-center rounded-lg hover:bg-default-200 active:bg-default-300 border border-default-300 transition-colors duration-200">
          <div className="flex w-full justify-between">
            <div className="flex items-center">
              <IconUserCircle
                className="flex-shrink-0 mr-3 text-default-700"
                stroke={1.5}
              />
              <span className="text-sm font-medium text-default-700">
                {user?.id || "Not logged in"}
              </span>
            </div>
          </div>
        </MenuButton>

        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <MenuItems className="absolute right-0 z-20 bottom-[52px] mt-2 w-[220.8px] bg-default-100 border border-default-300 origin-bottom-right rounded-lg focus:outline-none">
            <div className="px-1 py-1">
              {/* Dark Mode Toggle */}
              <MenuItem>
                <div
                  onClick={toggleDarkMode}
                  className="h-9 group flex w-full items-center justify-between rounded-md px-2 text-sm text-default-700 hover:bg-default-200 active:bg-default-300 transition-colors duration-200 cursor-pointer"
                >
                  <div className="flex items-center">
                    <IconMoon
                      className="mr-2 h-5 w-5"
                      aria-hidden="true"
                      stroke={1.5}
                    />
                    Dark Mode
                  </div>
                  <Switch
                    checked={isDarkMode}
                    onChange={() => setIsDarkMode(!isDarkMode)}
                    className={`${
                      isDarkMode ? "bg-default-300" : "bg-default-200"
                    } relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200`}
                  >
                    <span
                      className={`${
                        isDarkMode ? "translate-x-6" : "translate-x-1"
                      } inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200`}
                    />
                  </Switch>
                </div>
              </MenuItem>

              {/* Backup Option */}
              <MenuItem>
                {({ active }) => (
                  <button
                    className="h-9 group flex w-full items-center rounded-md px-2 text-sm text-default-700 hover:bg-default-200 active:bg-default-300 transition-colors duration-200"
                    onClick={handleBackupClick}
                  >
                    <IconDatabaseExport
                      className="mr-2 h-5 w-5"
                      aria-hidden="true"
                      stroke={1.5}
                    />
                    Backup
                  </button>
                )}
              </MenuItem>

              {/* Logout Option */}
              <MenuItem>
                {({ active }) => (
                  <button
                    className="h-9 group flex w-full items-center rounded-md px-2 text-sm text-default-700 hover:bg-default-200 active:bg-default-300 transition-colors duration-200"
                    onClick={handleLogout}
                  >
                    <IconLogout
                      className="mr-2 h-5 w-5"
                      aria-hidden="true"
                      stroke={1.5}
                    />
                    Logout
                  </button>
                )}
              </MenuItem>
            </div>
          </MenuItems>
        </Transition>
      </Menu>

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
      />
    </>
  );
}
