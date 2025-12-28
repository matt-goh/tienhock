// src/components/Navbar/NavbarBookmarks.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Transition } from "@headlessui/react";
import {
  IconBookmark,
  IconBookmarkFilled,
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

export default function NavbarBookmarks({
  bookmarks,
  bookmarkedItems,
  onBookmarkUpdate,
  findNavItem,
  navData,
  onNavigate,
}: NavbarBookmarksProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
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
  }, [location.pathname]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
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
    if (onNavigate) {
      onNavigate();
    }
  };

  const isItemActive = (path?: string): boolean => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

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
        {/* Bookmarks List */}
        <div className="max-h-[480px] overflow-y-auto p-2">
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

                return (
                  <Link
                    key={bookmark.id}
                    to={itemData.path}
                    onClick={handleItemClick}
                    className={`
                      group flex items-center justify-between px-3 py-2 rounded-md text-sm
                      transition-colors duration-150
                      ${isActive
                        ? "bg-sky-50 text-sky-700"
                        : "text-default-700 hover:bg-default-100"
                      }
                    `}
                  >
                    <span className="truncate">{bookmark.name}</span>
                    <button
                      onClick={(e) => handleRemoveBookmark(e, bookmark.name)}
                      className="p-1 rounded hover:bg-default-200 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove bookmark"
                    >
                      <IconBookmarkFilled
                        size={14}
                        className="text-sky-500"
                      />
                    </button>
                  </Link>
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
        </button>
      </div>

      {/* Render dropdown via portal */}
      {createPortal(dropdownContent, document.body)}
    </>
  );
}
