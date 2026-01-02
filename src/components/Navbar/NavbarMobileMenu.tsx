// src/components/Navbar/NavbarMobileMenu.tsx
import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Transition } from "@headlessui/react";
import {
  IconX,
  IconChevronDown,
  IconChevronRight,
  IconBookmarkFilled,
  IconLogout,
  IconCheck,
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

// Company theme colors
const companyThemes: Record<string, { bg: string; text: string; border: string }> = {
  tienhock: { bg: "bg-sky-50 dark:bg-sky-900/30", text: "text-sky-700 dark:text-sky-300", border: "border-sky-200 dark:border-sky-800" },
  greentarget: { bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
  jellypolly: { bg: "bg-rose-50 dark:bg-rose-900/30", text: "text-rose-700 dark:text-rose-300", border: "border-rose-200 dark:border-rose-800" },
};

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
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { activeCompany, setActiveCompany, companies } = useCompany();

  const theme = companyThemes[activeCompany.id] || companyThemes.tienhock;

  // Close menu on route change
  useEffect(() => {
    onClose();
    setExpandedCategory(null);
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

  const getCompanyLogo = (companyId: string, size: number = 24) => {
    switch (companyId) {
      case "greentarget":
        return <GreenTargetLogo width={size} height={size} />;
      default:
        return <TienHockLogo width={size} height={size} />;
    }
  };

  const handleCompanyChange = (company: typeof activeCompany) => {
    setActiveCompany(company);
    setShowCompanySwitcher(false);
    const homePath = company.routePrefix ? `/${company.routePrefix}` : "/";
    navigate(homePath);
    onClose();
  };

  // Filter menu items - only top-level categories, exclude Bookmarks
  const menuCategories = navData.filter((item) => item.name !== "Bookmarks");

  // Get navigable items for a category (filter out showInPopover, items without path, and items with route parameters)
  const getNavigableItems = (category: SidebarItem): SidebarItem[] => {
    if (!category.subItems) return [];
    return category.subItems.filter(
      (item) => item.path && !item.showInPopover && !item.path.includes(":")
    );
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
        <div className="fixed inset-y-0 left-0 z-50 w-[85%] max-w-[320px] bg-white dark:bg-gray-800 shadow-xl flex flex-col">
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b border-default-200 dark:border-gray-700 ${theme.bg}`}>
            <div className="flex items-center gap-3">
              {getCompanyLogo(activeCompany.id)}
              <span className={`font-bold text-lg ${theme.text}`}>{activeCompany.name}</span>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg ${theme.text} hover:bg-white/50 transition-colors`}
            >
              <IconX size={22} />
            </button>
          </div>

          {/* Company Switcher */}
          <div className="border-b border-default-200 dark:border-gray-700">
            <button
              onClick={() => setShowCompanySwitcher(!showCompanySwitcher)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
            >
              <span>Switch Company</span>
              <IconChevronDown
                size={16}
                className={`text-default-400 dark:text-gray-500 transition-transform duration-200 ${showCompanySwitcher ? "rotate-180" : ""}`}
              />
            </button>

            {/* Company Dropdown */}
            <Transition
              show={showCompanySwitcher}
              enter="transition-all duration-200 ease-out"
              enterFrom="max-h-0 opacity-0"
              enterTo="max-h-[200px] opacity-100"
              leave="transition-all duration-150 ease-in"
              leaveFrom="max-h-[200px] opacity-100"
              leaveTo="max-h-0 opacity-0"
            >
              <div className="overflow-hidden bg-default-50 dark:bg-gray-900/50">
                {companies.map((company) => {
                  const isActive = company.id === activeCompany.id;
                  const itemTheme = companyThemes[company.id] || companyThemes.tienhock;
                  return (
                    <button
                      key={company.id}
                      onClick={() => handleCompanyChange(company)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${
                        isActive ? `${itemTheme.bg} ${itemTheme.text}` : "hover:bg-default-100 dark:hover:bg-gray-700 text-default-700 dark:text-gray-200"
                      }`}
                    >
                      {getCompanyLogo(company.id, 20)}
                      <span className="flex-1 text-left font-medium text-sm">
                        {company.name}
                      </span>
                      {isActive && <IconCheck size={16} className={itemTheme.text} />}
                    </button>
                  );
                })}
              </div>
            </Transition>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto py-2">
            {/* Bookmarks Section */}
            {shouldShowBookmarks && bookmarks.length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => setExpandedCategory(expandedCategory === "Bookmarks" ? null : "Bookmarks")}
                  className={`w-full flex items-center justify-between py-3 px-4 ${
                    expandedCategory === "Bookmarks" ? "bg-sky-50 dark:bg-sky-900/30" : "hover:bg-default-50 dark:hover:bg-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <IconBookmarkFilled size={20} className="text-sky-500 dark:text-sky-400" />
                    <span className="font-medium text-default-800 dark:text-gray-100">Bookmarks</span>
                    <span className="bg-sky-500 dark:bg-sky-600 text-white text-xs px-2 py-0.5 rounded-full">
                      {bookmarks.length}
                    </span>
                  </div>
                  <IconChevronRight
                    size={18}
                    className={`text-default-400 dark:text-gray-500 transition-transform duration-200 ${
                      expandedCategory === "Bookmarks" ? "rotate-90" : ""
                    }`}
                  />
                </button>
                <Transition
                  show={expandedCategory === "Bookmarks"}
                  enter="transition-all duration-200 ease-out"
                  enterFrom="max-h-0 opacity-0"
                  enterTo="max-h-[400px] opacity-100"
                  leave="transition-all duration-150 ease-in"
                  leaveFrom="max-h-[400px] opacity-100"
                  leaveTo="max-h-0 opacity-0"
                >
                  <div className="overflow-hidden bg-default-50 dark:bg-gray-900/50">
                    {bookmarks.map((bookmark) => {
                      const itemData = findNavItem(navData, bookmark.name);
                      if (!itemData || !itemData.path) return null;
                      return (
                        <Link
                          key={bookmark.id}
                          to={itemData.path}
                          onClick={onClose}
                          className={`flex items-center py-2.5 px-4 pl-12 text-sm ${
                            isItemActive(itemData.path)
                              ? "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30"
                              : "text-default-600 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700"
                          }`}
                        >
                          {bookmark.name}
                        </Link>
                      );
                    })}
                  </div>
                </Transition>
              </div>
            )}

            {/* Navigation Categories */}
            {menuCategories.map((category) => {
              const navigableItems = getNavigableItems(category);
              const hasItems = navigableItems.length > 0;
              const isExpanded = expandedCategory === category.name;

              // If category has no sub-items but has a path, render as direct link
              if (!hasItems && category.path) {
                return (
                  <Link
                    key={category.name}
                    to={category.path}
                    onClick={onClose}
                    className={`flex items-center gap-3 py-3 px-4 ${
                      isItemActive(category.path)
                        ? "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                        : "text-default-700 dark:text-gray-200 hover:bg-default-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    {category.icon && <category.icon size={20} stroke={1.5} />}
                    <span className="font-medium">{category.name}</span>
                  </Link>
                );
              }

              // Category with sub-items
              if (hasItems) {
                return (
                  <div key={category.name}>
                    <button
                      onClick={() => setExpandedCategory(isExpanded ? null : category.name)}
                      className={`w-full flex items-center justify-between py-3 px-4 ${
                        isExpanded ? "bg-default-50 dark:bg-gray-900/50" : "hover:bg-default-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {category.icon && <category.icon size={20} stroke={1.5} />}
                        <span className="font-medium text-default-800 dark:text-gray-100">{category.name}</span>
                      </div>
                      <IconChevronRight
                        size={18}
                        className={`text-default-400 dark:text-gray-500 transition-transform duration-200 ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
                    </button>
                    <Transition
                      show={isExpanded}
                      enter="transition-all duration-200 ease-out"
                      enterFrom="max-h-0 opacity-0"
                      enterTo="max-h-[600px] opacity-100"
                      leave="transition-all duration-150 ease-in"
                      leaveFrom="max-h-[600px] opacity-100"
                      leaveTo="max-h-0 opacity-0"
                    >
                      <div className="overflow-hidden bg-default-50 dark:bg-gray-900/50">
                        {navigableItems.map((item) => (
                          <Link
                            key={item.path}
                            to={item.path!}
                            onClick={onClose}
                            className={`flex items-center py-2.5 px-4 pl-12 text-sm ${
                              isItemActive(item.path)
                                ? "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30"
                                : "text-default-600 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700"
                            }`}
                          >
                            {item.name}
                          </Link>
                        ))}
                      </div>
                    </Transition>
                  </div>
                );
              }

              return null;
            })}
          </div>

          {/* Footer - User Info & Logout */}
          <div className="border-t border-default-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-default-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-default-600 dark:text-gray-300">
                    {user?.id?.charAt(0)?.toUpperCase() || "U"}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-default-800 dark:text-gray-100 text-sm">{user?.id || "User"}</p>
                  <p className="text-xs text-default-500 dark:text-gray-400">Logged in</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors text-sm font-medium"
              >
                <IconLogout size={18} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </>
  );
}
