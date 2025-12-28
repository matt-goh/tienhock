// src/components/Navbar/NavbarDropdown.tsx
import React, { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Transition } from "@headlessui/react";
import {
  IconChevronRight,
  IconBookmark,
  IconBookmarkFilled,
  IconPlus,
} from "@tabler/icons-react";
import { SidebarItem, PopoverOption } from "../../pages/pagesRoute";

interface NavbarDropdownProps {
  items: SidebarItem[];
  isOpen: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  onItemClick: (path: string) => void;
  categoryName: string;
  bookmarkedItems?: Set<string>;
  onBookmarkUpdate?: (name: string, isBookmarked: boolean) => void;
  showBookmarkIcon?: boolean;
}

// Determine if a category should use mega menu layout
const shouldUseMegaMenu = (categoryName: string, itemCount: number): boolean => {
  const megaMenuCategories = ["Catalogue", "Payroll"];
  return megaMenuCategories.includes(categoryName) || itemCount > 8;
};

// Get number of columns for mega menu
const getMegaMenuColumns = (itemCount: number): number => {
  if (itemCount <= 6) return 2;
  if (itemCount <= 12) return 3;
  return 4;
};

// Get popover options for an item
const getPopoverOptions = (item: SidebarItem): PopoverOption[] => {
  const options: PopoverOption[] = [...(item.popoverOptions || [])];

  if (item.subItems) {
    item.subItems.forEach((subItem) => {
      if (subItem.showInPopover && subItem.path) {
        options.push({
          name: subItem.name,
          path: subItem.path,
        });
      }
    });
  }

  return options;
};

export default function NavbarDropdown({
  items,
  isOpen,
  anchorRef,
  onClose,
  onItemClick,
  categoryName,
  bookmarkedItems = new Set(),
  onBookmarkUpdate,
  showBookmarkIcon = false,
}: NavbarDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const itemRefs = useRef<{ [key: string]: HTMLElement | null }>({});
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Filter out items without path (non-navigable) and showInPopover items
  const navigableItems = items.filter(
    (item) => item.path && !item.showInPopover
  );

  const isMegaMenu = shouldUseMegaMenu(categoryName, navigableItems.length);
  const columns = getMegaMenuColumns(navigableItems.length);

  // Calculate position based on anchor element (centered using transform)
  useEffect(() => {
    if (anchorRef.current && isOpen) {
      const rect = anchorRef.current.getBoundingClientRect();
      const anchorCenter = rect.left + rect.width / 2;

      setPosition({
        top: rect.bottom + 4,
        left: anchorCenter,
      });
    }
  }, [anchorRef, isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  // Close dropdown on route change
  useEffect(() => {
    onClose();
  }, [location.pathname]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleBookmarkClick = (
    e: React.MouseEvent,
    name: string,
    isBookmarked: boolean
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (onBookmarkUpdate) {
      onBookmarkUpdate(name, !isBookmarked);
    }
  };

  const isItemActive = (path?: string): boolean => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const handleItemMouseEnter = useCallback((itemName: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredItem(itemName);

    // Calculate popover position
    const itemEl = itemRefs.current[itemName];
    if (itemEl) {
      const rect = itemEl.getBoundingClientRect();
      setPopoverPosition({
        top: rect.top,
        left: rect.right + 4,
      });
    }
  }, []);

  const handleItemMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItem(null);
    }, 150);
  }, []);

  const handlePopoverMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  }, []);

  const handlePopoverMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItem(null);
    }, 150);
  }, []);

  const renderDropdownItem = (item: SidebarItem) => {
    if (!item.path) return null;

    const isActive = isItemActive(item.path);
    const isBookmarked = bookmarkedItems.has(item.name);
    const popoverOptions = getPopoverOptions(item);
    const hasPopover = popoverOptions.length > 0;
    const isHovered = hoveredItem === item.name;

    return (
      <div
        key={item.path}
        ref={(el) => { itemRefs.current[item.name] = el; }}
        onMouseEnter={() => hasPopover && handleItemMouseEnter(item.name)}
        onMouseLeave={handleItemMouseLeave}
        className="relative"
      >
        <Link
          to={item.path}
          onClick={() => onItemClick(item.path!)}
          className={`
            group flex items-center justify-between px-3 py-2 rounded-md text-sm
            transition-colors duration-150
            ${isActive
              ? "bg-sky-50 text-sky-700"
              : isHovered
                ? "bg-default-100 text-default-800"
                : "text-default-700 hover:bg-default-100"
            }
          `}
        >
          <span className="truncate">{item.name}</span>
          <div className="flex items-center gap-1">
            {showBookmarkIcon && (
              <button
                onClick={(e) => handleBookmarkClick(e, item.name, isBookmarked)}
                className={`p-0.5 rounded hover:bg-default-200 transition-opacity ${
                  isBookmarked || isHovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                {isBookmarked ? (
                  <IconBookmarkFilled size={16} className="text-sky-500" />
                ) : (
                  <IconBookmark size={16} className="text-default-400" />
                )}
              </button>
            )}
            {hasPopover ? (
              <IconChevronRight
                size={14}
                className={`transition-colors ${isHovered ? "text-sky-500" : "text-default-400"}`}
              />
            ) : (
              <IconChevronRight
                size={14}
                className="text-default-400 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            )}
          </div>
        </Link>
      </div>
    );
  };

  // Find the currently hovered item's popover options
  const currentHoveredItem = navigableItems.find((item) => item.name === hoveredItem);
  const currentPopoverOptions = currentHoveredItem ? getPopoverOptions(currentHoveredItem) : [];

  const dropdownContent = (
    <Transition
      show={isOpen}
      enter="transition ease-out duration-150"
      enterFrom="opacity-0 scale-95"
      enterTo="opacity-100 scale-100"
      leave="transition ease-in duration-100"
      leaveFrom="opacity-100 scale-100"
      leaveTo="opacity-0 scale-95"
    >
      <div
        ref={dropdownRef}
        className={`
          fixed z-[100] bg-white border border-default-200 rounded-lg shadow-lg -translate-x-1/2
          ${isMegaMenu ? "p-4" : "p-2"}
        `}
        style={{
          top: position.top,
          left: position.left,
          minWidth: isMegaMenu ? `${columns * 200}px` : "220px",
          maxWidth: isMegaMenu ? `${columns * 220}px` : "300px",
        }}
      >
        {/* Category Header */}
        <div className="px-3 py-2 border-b border-default-200 mb-2">
          <h3 className="font-semibold text-default-800">{categoryName}</h3>
        </div>

        {/* Items Grid/List */}
        {isMegaMenu ? (
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {navigableItems.map(renderDropdownItem)}
          </div>
        ) : (
          <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
            {navigableItems.map(renderDropdownItem)}
          </div>
        )}
      </div>
    </Transition>
  );

  // Popover for quick actions
  const popoverContent = hoveredItem && currentPopoverOptions.length > 0 && (
    <Transition
      show={true}
      enter="transition ease-out duration-100"
      enterFrom="opacity-0 scale-95"
      enterTo="opacity-100 scale-100"
      leave="transition ease-in duration-75"
      leaveFrom="opacity-100 scale-100"
      leaveTo="opacity-0 scale-95"
    >
      <div
        className="fixed z-[101] bg-white border border-default-200 rounded-lg shadow-lg py-1 min-w-[180px]"
        style={{
          top: popoverPosition.top,
          left: popoverPosition.left,
        }}
        onMouseEnter={handlePopoverMouseEnter}
        onMouseLeave={handlePopoverMouseLeave}
      >
        {currentPopoverOptions.map((option) => (
          <Link
            key={option.path}
            to={option.path}
            onClick={() => {
              onItemClick(option.path);
              setHoveredItem(null);
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-sky-600 hover:bg-sky-50 transition-colors"
          >
            <IconPlus size={16} />
            <span>{option.name}</span>
          </Link>
        ))}
      </div>
    </Transition>
  );

  return createPortal(
    <>
      {dropdownContent}
      {popoverContent}
    </>,
    document.body
  );
}
