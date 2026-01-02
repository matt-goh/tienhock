// src/components/Navbar/NavbarMenu.tsx
import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { IconChevronDown } from "@tabler/icons-react";
import { SidebarItem } from "../../pages/pagesRoute";
import NavbarDropdown from "./NavbarDropdown";

interface NavbarMenuProps {
  items: SidebarItem[];
  bookmarkedItems?: Set<string>;
  onBookmarkUpdate?: (name: string, isBookmarked: boolean) => void;
  showBookmarkIcon?: boolean;
  onNavigate?: () => void;
}

export default function NavbarMenu({
  items,
  bookmarkedItems = new Set(),
  onBookmarkUpdate,
  showBookmarkIcon = false,
  onNavigate,
}: NavbarMenuProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const buttonRefs = useRef<{ [key: string]: React.RefObject<HTMLButtonElement> }>({});
  const location = useLocation();
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown when route changes
  useEffect(() => {
    setOpenDropdown(null);
  }, [location.pathname]);

  // Filter out the Bookmarks category (handled separately)
  const menuItems = items.filter((item) => item.name !== "Bookmarks");

  // Helper function to check if item has navigable sub-items
  // (excludes showInPopover items and items with route parameters)
  const hasNavigableSubItems = (item: SidebarItem): boolean => {
    if (!item.subItems || item.subItems.length === 0) return false;
    return item.subItems.some(
      (subItem) => subItem.path && !subItem.showInPopover && !subItem.path.includes(":")
    );
  };

  const getButtonRef = (name: string) => {
    if (!buttonRefs.current[name]) {
      buttonRefs.current[name] = React.createRef<HTMLButtonElement>();
    }
    return buttonRefs.current[name];
  };

  const handleMouseEnter = (name: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setOpenDropdown(name);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 150);
  };

  const handleButtonClick = (name: string) => {
    setOpenDropdown(openDropdown === name ? null : name);
  };

  const handleItemClick = () => {
    setOpenDropdown(null);
    if (onNavigate) {
      onNavigate();
    }
  };

  const isMenuActive = (item: SidebarItem): boolean => {
    if (item.path && location.pathname.startsWith(item.path)) {
      return true;
    }
    if (item.subItems) {
      return item.subItems.some(
        (subItem) => subItem.path && location.pathname.startsWith(subItem.path)
      );
    }
    return false;
  };

  const renderMenuItem = (item: SidebarItem) => {
    const hasSubItems = hasNavigableSubItems(item);
    const isActive = isMenuActive(item);
    const buttonRef = getButtonRef(item.name);

    // Items with navigable subItems show dropdown
    if (hasSubItems) {
      return (
        <div
          key={item.name}
          className="relative"
          onMouseEnter={() => handleMouseEnter(item.name)}
          onMouseLeave={handleMouseLeave}
        >
          <button
            ref={buttonRef}
            onClick={() => handleButtonClick(item.name)}
            className={`
              flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium
              transition-all duration-150 active:scale-[0.98]
              ${isActive
                ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                : "text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700"
              }
            `}
          >
            {item.icon && <item.icon size={18} stroke={1.5} />}
            <span>{item.name}</span>
            <IconChevronDown
              size={16}
              className={`transition-transform duration-200 ${
                openDropdown === item.name ? "rotate-180" : ""
              }`}
            />
          </button>

          <NavbarDropdown
            items={item.subItems!}
            isOpen={openDropdown === item.name}
            anchorRef={buttonRef}
            onClose={() => setOpenDropdown(null)}
            onItemClick={handleItemClick}
            categoryName={item.name}
            bookmarkedItems={bookmarkedItems}
            onBookmarkUpdate={onBookmarkUpdate}
            showBookmarkIcon={showBookmarkIcon}
            onMouseEnter={() => handleMouseEnter(item.name)}
            onMouseLeave={handleMouseLeave}
          />
        </div>
      );
    }

    // Items with path but no subItems are direct links
    if (item.path) {
      return (
        <Link
          key={item.name}
          to={item.path}
          onClick={() => onNavigate?.()}
          className={`
            flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium
            transition-colors duration-150
            ${isActive
              ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
              : "text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700"
            }
          `}
        >
          {item.icon && <item.icon size={18} stroke={1.5} />}
          <span>{item.name}</span>
        </Link>
      );
    }

    return null;
  };

  return (
    <nav className="hidden lg:flex items-center gap-1">
      {menuItems.map(renderMenuItem)}
    </nav>
  );
}
