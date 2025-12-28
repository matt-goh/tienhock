// src/components/Navbar/NavbarMobileMenu.tsx
import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Transition } from "@headlessui/react";
import {
  IconX,
  IconChevronDown,
  IconBookmark,
  IconBookmarkFilled,
  IconLogout,
} from "@tabler/icons-react";
import { SidebarItem, PopoverOption } from "../../pages/pagesRoute";
import { Bookmark } from "../../hooks/useBookmarks";
import { useAuth } from "../../contexts/AuthContext";
import { useCompany } from "../../contexts/CompanyContext";
import TienHockLogo from "../../utils/TienHockLogo";
import GreenTargetLogo from "../../utils/GreenTargetLogo";

interface NavbarMobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  navData: SidebarItem[];
  bookmarks: Bookmark[];
  bookmarkedItems: Set<string>;
  onBookmarkUpdate: (name: string, isBookmarked: boolean) => void;
  findNavItem: (
    items: SidebarItem[],
    name: string
  ) => (SidebarItem & { popoverOptions?: PopoverOption[] }) | null;
  shouldShowBookmarks: boolean;
}

export default function NavbarMobileMenu({
  isOpen,
  onClose,
  navData,
  bookmarks,
  bookmarkedItems,
  onBookmarkUpdate,
  findNavItem,
  shouldShowBookmarks,
}: NavbarMobileMenuProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const location = useLocation();
  const { user, logout } = useAuth();
  const { activeCompany, setActiveCompany, companies } = useCompany();

  // Close menu on route change
  useEffect(() => {
    onClose();
  }, [location.pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const toggleExpanded = (name: string) => {
    setExpandedItems((prev) =>
      prev.includes(name)
        ? prev.filter((item) => item !== name)
        : [...prev, name]
    );
  };

  const handleLogout = async () => {
    try {
      await logout();
      onClose();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const isItemActive = (path?: string): boolean => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const getCompanyLogo = (companyId: string) => {
    switch (companyId) {
      case "greentarget":
        return <GreenTargetLogo width={24} height={24} />;
      default:
        return <TienHockLogo width={24} height={24} />;
    }
  };

  // Filter out the Bookmarks category from navData
  const menuItems = navData.filter((item) => item.name !== "Bookmarks");

  const renderMenuItem = (item: SidebarItem, depth: number = 0) => {
    const hasSubItems = item.subItems && item.subItems.length > 0;
    const isExpanded = expandedItems.includes(item.name);
    const isActive = isItemActive(item.path);
    const paddingLeft = depth * 16 + 16;

    // Filter out showInPopover items for cleaner display
    const visibleSubItems = item.subItems?.filter(
      (sub) => sub.path && !sub.showInPopover
    );

    if (hasSubItems && visibleSubItems && visibleSubItems.length > 0) {
      return (
        <div key={item.name}>
          <button
            onClick={() => toggleExpanded(item.name)}
            className={`
              w-full flex items-center justify-between py-3 px-4 text-left
              transition-colors duration-150
              ${isActive ? "bg-sky-50 text-sky-700" : "hover:bg-default-50"}
            `}
            style={{ paddingLeft }}
          >
            <div className="flex items-center gap-3">
              {item.icon && <item.icon size={20} stroke={1.5} />}
              <span className="font-medium">{item.name}</span>
            </div>
            <IconChevronDown
              size={18}
              className={`transition-transform duration-200 ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
          <Transition
            show={isExpanded}
            enter="transition-all duration-200 ease-out"
            enterFrom="max-h-0 opacity-0"
            enterTo="max-h-[1000px] opacity-100"
            leave="transition-all duration-150 ease-in"
            leaveFrom="max-h-[1000px] opacity-100"
            leaveTo="max-h-0 opacity-0"
          >
            <div className="bg-default-50 overflow-hidden">
              {visibleSubItems.map((subItem) => renderMenuItem(subItem, depth + 1))}
            </div>
          </Transition>
        </div>
      );
    }

    if (item.path) {
      return (
        <Link
          key={item.path}
          to={item.path}
          onClick={onClose}
          className={`
            flex items-center justify-between py-3 px-4
            transition-colors duration-150
            ${isActive ? "bg-sky-50 text-sky-700" : "hover:bg-default-50"}
          `}
          style={{ paddingLeft }}
        >
          <div className="flex items-center gap-3">
            {item.icon && <item.icon size={20} stroke={1.5} />}
            <span>{item.name}</span>
          </div>
          {shouldShowBookmarks && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBookmarkUpdate(item.name, !bookmarkedItems.has(item.name));
              }}
              className="p-1"
            >
              {bookmarkedItems.has(item.name) ? (
                <IconBookmarkFilled size={18} className="text-sky-500" />
              ) : (
                <IconBookmark size={18} className="text-default-400" />
              )}
            </button>
          )}
        </Link>
      );
    }

    return null;
  };

  return (
    <>
      {/* Backdrop */}
      <Transition
        show={isOpen}
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-200"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={onClose}
        />
      </Transition>

      {/* Slide-out Panel */}
      <Transition
        show={isOpen}
        enter="transition-transform duration-300 ease-out"
        enterFrom="-translate-x-full"
        enterTo="translate-x-0"
        leave="transition-transform duration-200 ease-in"
        leaveFrom="translate-x-0"
        leaveTo="-translate-x-full"
      >
        <div className="fixed inset-y-0 left-0 z-50 w-[85%] max-w-[320px] bg-white shadow-xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-default-200">
            <div className="flex items-center gap-3">
              {getCompanyLogo(activeCompany.id)}
              <span className="font-bold text-lg">{activeCompany.name}</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-default-100 transition-colors"
            >
              <IconX size={24} />
            </button>
          </div>

          {/* Company Switcher */}
          <div className="px-4 py-3 border-b border-default-200">
            <p className="text-xs text-default-500 mb-2 font-medium">
              Switch Company
            </p>
            <div className="flex gap-2">
              {companies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => {
                    setActiveCompany(company);
                    onClose();
                  }}
                  className={`
                    flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg
                    text-sm font-medium transition-colors
                    ${company.id === activeCompany.id
                      ? "bg-sky-100 text-sky-700 border border-sky-200"
                      : "bg-default-50 hover:bg-default-100"
                    }
                  `}
                >
                  {getCompanyLogo(company.id)}
                  <span className="truncate">{company.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Bookmarks Section */}
            {shouldShowBookmarks && bookmarks.length > 0 && (
              <div className="border-b border-default-200">
                <button
                  onClick={() => toggleExpanded("Bookmarks")}
                  className="w-full flex items-center justify-between py-3 px-4 text-left hover:bg-default-50"
                >
                  <div className="flex items-center gap-3">
                    <IconBookmarkFilled size={20} className="text-sky-500" />
                    <span className="font-medium">Bookmarks</span>
                    <span className="bg-sky-100 text-sky-700 text-xs px-2 py-0.5 rounded-full">
                      {bookmarks.length}
                    </span>
                  </div>
                  <IconChevronDown
                    size={18}
                    className={`transition-transform duration-200 ${
                      expandedItems.includes("Bookmarks") ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <Transition
                  show={expandedItems.includes("Bookmarks")}
                  enter="transition-all duration-200 ease-out"
                  enterFrom="max-h-0 opacity-0"
                  enterTo="max-h-[500px] opacity-100"
                  leave="transition-all duration-150 ease-in"
                  leaveFrom="max-h-[500px] opacity-100"
                  leaveTo="max-h-0 opacity-0"
                >
                  <div className="bg-default-50 overflow-hidden">
                    {bookmarks.map((bookmark) => {
                      const itemData = findNavItem(navData, bookmark.name);
                      if (!itemData || !itemData.path) return null;

                      return (
                        <Link
                          key={bookmark.id}
                          to={itemData.path}
                          onClick={onClose}
                          className={`
                            flex items-center justify-between py-3 px-4 pl-8
                            transition-colors duration-150
                            ${isItemActive(itemData.path)
                              ? "bg-sky-50 text-sky-700"
                              : "hover:bg-default-100"
                            }
                          `}
                        >
                          <span>{bookmark.name}</span>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onBookmarkUpdate(bookmark.name, false);
                            }}
                            className="p-1"
                          >
                            <IconBookmarkFilled
                              size={16}
                              className="text-sky-500"
                            />
                          </button>
                        </Link>
                      );
                    })}
                  </div>
                </Transition>
              </div>
            )}

            {/* Navigation Items */}
            <div className="py-2">
              {menuItems.map((item) => renderMenuItem(item))}
            </div>
          </div>

          {/* Footer - User Info & Logout */}
          <div className="border-t border-default-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-default-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-default-600">
                    {user?.id?.charAt(0)?.toUpperCase() || "U"}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-default-800">{user?.id || "User"}</p>
                  <p className="text-xs text-default-500">Logged in</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              >
                <IconLogout size={22} />
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </>
  );
}
