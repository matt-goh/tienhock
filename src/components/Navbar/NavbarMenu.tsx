// src/components/Navbar/NavbarMenu.tsx
import React, { useState, useRef } from "react";
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

  // Filter out the Bookmarks category (handled separately)
  const menuItems = items.filter((item) => item.name !== "Bookmarks");

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

  const handleItemClick = (path: string) => {
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
    const hasSubItems = item.subItems && item.subItems.length > 0;
    const isActive = isMenuActive(item);
    const buttonRef = getButtonRef(item.name);

    // Items with subItems show dropdown
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
            className={`
              flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium
              transition-colors duration-150
              ${isActive
                ? "bg-sky-100 text-sky-700"
                : "text-default-700 hover:bg-default-100"
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
              ? "bg-sky-100 text-sky-700"
              : "text-default-700 hover:bg-default-100"
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
