// src/components/Navbar/NavbarBookmarks.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Transition } from "@headlessui/react";
import {
  IconBookmark,
  IconBookmarkFilled,
  IconChevronRight,
  IconPlus,
} from "@tabler/icons-react";
import { Bookmark } from "../../hooks/useBookmarks";
import { SidebarItem, PopoverOption } from "../../pages/pagesRoute";

interface NavbarBookmarksProps {
  bookmarks: Bookmark[];
  bookmarkedItems: Set<string>;
  onBookmarkUpdate: (name: string, isBookmarked: boolean) => void;
  findNavItem: (
    items: SidebarItem[],
    name: string
  ) => (SidebarItem & { popoverOptions?: PopoverOption[] }) | null;
  navData: SidebarItem[];
  onNavigate?: () => void;
}

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

export default function NavbarBookmarks({
  bookmarks,
  bookmarkedItems,
  onBookmarkUpdate,
  findNavItem,
  navData,
  onNavigate,
}: NavbarBookmarksProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<{ [key: string]: HTMLElement | null }>({});
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const location = useLocation();

  // Handle hover open/close for the main dropdown
  const handleDropdownMouseEnter = useCallback(() => {
    if (dropdownHoverTimeoutRef.current) {
      clearTimeout(dropdownHoverTimeoutRef.current);
    }
    setIsOpen(true);
  }, []);

  const handleDropdownMouseLeave = useCallback(() => {
    dropdownHoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setHoveredItem(null);
    }, 150);
  }, []);

  // Calculate dropdown position (centered under button using transform)
  useEffect(() => {
    if (buttonRef.current && isOpen) {
      const rect = buttonRef.current.getBoundingClientRect();
      const anchorCenter = rect.left + rect.width / 2;

      setDropdownPosition({
        top: rect.bottom + 8,
        left: anchorCenter,
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setHoveredItem(null);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close dropdown on route change
  useEffect(() => {
    setIsOpen(false);
    setHoveredItem(null);
  }, [location.pathname]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (dropdownHoverTimeoutRef.current) {
        clearTimeout(dropdownHoverTimeoutRef.current);
      }
    };
  }, []);

  const handleRemoveBookmark = (e: React.MouseEvent, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    onBookmarkUpdate(name, false);
  };

  const handleItemClick = () => {
    setIsOpen(false);
    setHoveredItem(null);
    if (onNavigate) {
      onNavigate();
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

  // Get popover options for hovered bookmark
  const getHoveredItemPopoverOptions = (): PopoverOption[] => {
    if (!hoveredItem) return [];
    const itemData = findNavItem(navData, hoveredItem);
    if (!itemData) return [];
    return getPopoverOptions(itemData);
  };

  const hoveredPopoverOptions = getHoveredItemPopoverOptions();

  // Popover content (rendered via portal)
  const popoverContent = hoveredItem && hoveredPopoverOptions.length > 0 && (
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
        {hoveredPopoverOptions.map((option) => (
          <Link
            key={option.path}
            to={option.path}
            onClick={handleItemClick}
            className="flex items-center gap-2 px-3 py-2 text-sm text-sky-600 hover:bg-sky-50 transition-colors"
          >
            <IconPlus size={16} />
            <span>{option.name}</span>
          </Link>
        ))}
      </div>
    </Transition>
  );

  // Dropdown content
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
        className="fixed z-[100] w-72 bg-white border border-default-200 rounded-lg shadow-lg -translate-x-1/2"
        style={{
          top: dropdownPosition.top,
          left: dropdownPosition.left,
        }}
        onMouseEnter={handleDropdownMouseEnter}
        onMouseLeave={handleDropdownMouseLeave}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-default-200">
          <h3 className="font-semibold text-default-800 flex items-center gap-2">
            <IconBookmarkFilled size={18} className="text-sky-500" />
            Bookmarks
          </h3>
          <p className="text-xs text-default-500 mt-0.5">
            Quick access to your saved pages
          </p>
        </div>

        {/* Bookmarks List */}
        <div className="max-h-[320px] overflow-y-auto p-2">
          {bookmarks.length === 0 ? (
            <div className="px-4 py-6 text-center text-default-500">
              <IconBookmark size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No bookmarks yet</p>
              <p className="text-xs mt-1">
                Click the bookmark icon on any menu item to save it here
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {bookmarks.map((bookmark) => {
                const itemData = findNavItem(navData, bookmark.name);
                if (!itemData || !itemData.path) return null;

                const isActive = isItemActive(itemData.path);
                const popoverOptions = getPopoverOptions(itemData);
                const hasPopover = popoverOptions.length > 0;
                const isHovered = hoveredItem === bookmark.name;

                return (
                  <div
                    key={bookmark.id}
                    ref={(el) => { itemRefs.current[bookmark.name] = el; }}
                    onMouseEnter={() => hasPopover && handleItemMouseEnter(bookmark.name)}
                    onMouseLeave={handleItemMouseLeave}
                    className="relative"
                  >
                    <Link
                      to={itemData.path}
                      onClick={handleItemClick}
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
                      <span className="truncate">{bookmark.name}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleRemoveBookmark(e, bookmark.name)}
                          className={`p-1 rounded hover:bg-default-200 transition-opacity ${
                            isHovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
                          title="Remove bookmark"
                        >
                          <IconBookmarkFilled
                            size={14}
                            className="text-sky-500"
                          />
                        </button>
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
              })}
            </div>
          )}
        </div>
      </div>
    </Transition>
  );

  return (
    <>
      <div
        onMouseEnter={handleDropdownMouseEnter}
        onMouseLeave={handleDropdownMouseLeave}
      >
        <button
          ref={buttonRef}
          className={`
            flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
            transition-colors duration-150
            ${isOpen
              ? "bg-sky-100 text-sky-700"
              : "text-default-700 hover:bg-default-100"
            }
          `}
        >
          {bookmarks.length > 0 ? (
            <IconBookmarkFilled size={18} className="text-sky-500" />
          ) : (
            <IconBookmark size={18} />
          )}
          <span className="hidden sm:inline">Bookmarks</span>
          {bookmarks.length > 0 && (
            <span className="bg-sky-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {bookmarks.length}
            </span>
          )}
        </button>
      </div>

      {/* Render dropdown and popover via portal */}
      {createPortal(
        <>
          {dropdownContent}
          {popoverContent}
        </>,
        document.body
      )}
    </>
  );
}
