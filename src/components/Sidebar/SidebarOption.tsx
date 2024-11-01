import React from "react";
import {
  IconBookmark,
  IconBookmarkFilled,
  IconChevronRight,
} from "@tabler/icons-react";
import { Link, useNavigate } from "react-router-dom";
import { useProfile } from "../../contexts/ProfileContext";
import { API_BASE_URL } from "../../config";
import toast from "react-hot-toast";

interface SidebarOptionProps {
  name: string;
  path?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  buttonRef?: React.RefObject<HTMLLIElement>;
  isActive?: boolean;
  isInBookmarksSection?: boolean;
  isBookmarked: boolean;
  onBookmarkUpdate: (name: string, isBookmarked: boolean) => Promise<void>;
  onNavigate?: () => void;
}

const SidebarOption: React.FC<SidebarOptionProps> = ({
  name,
  path,
  onMouseEnter,
  onMouseLeave,
  buttonRef,
  isActive,
  isInBookmarksSection = false,
  isBookmarked,
  onBookmarkUpdate,
  onNavigate,
}) => {
  const { currentStaff, isInitializing } = useProfile();
  const navigate = useNavigate();

  const handleBookmarkClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!currentStaff?.id) {
      toast.error("Please select a profile to bookmark items");
      return;
    }

    if (!name) return;

    // Create a loading toast that we can update later
    const toastId = toast.loading(
      isBookmarked ? "Removing bookmark..." : "Adding bookmark..."
    );

    try {
      if (isBookmarked) {
        await fetch(
          `${API_BASE_URL}/api/bookmarks/${
            currentStaff.id
          }/${encodeURIComponent(name)}`,
          {
            method: "DELETE",
          }
        );
        await onBookmarkUpdate(name, false);
        // Update the loading toast with success message
        toast.success(`Removed "${name}" from bookmarks`, {
          id: toastId,
        });
      } else {
        await fetch(`${API_BASE_URL}/api/bookmarks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            staffId: currentStaff.id,
            name,
          }),
        });
        await onBookmarkUpdate(name, true);
        // Update the loading toast with success message
        toast.success(`Added "${name}" to bookmarks`, {
          id: toastId,
        });
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      // Update the loading toast with error message
      toast.error(
        `Failed to ${isBookmarked ? "remove" : "add"} bookmark: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        {
          id: toastId,
        }
      );
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (path) {
      e.preventDefault();
      onNavigate?.();
      navigate(path);
    }
  };

  const commonClasses = `block group/option flex items-center ml-10 pl-3 py-2 pr-2 transition-colors duration-200 rounded-lg focus:outline-none relative ${
    isActive
      ? "bg-default-200/90 active:bg-default-300/90 hover:text-default-800"
      : "hover:bg-default-200/90 active:bg-default-300/90 hover:text-default-800"
  }`;

  const BookmarkIcon = isBookmarked ? IconBookmarkFilled : IconBookmark;

  const getBookmarkIconClasses = () => {
    if (isInBookmarksSection) {
      return `transition-all duration-200 right-8 absolute cursor-pointer opacity-0 group-hover/option:opacity-100 hover:text-default-600`;
    }
    return `transition-all duration-200 right-8 absolute cursor-pointer ${
      isActive || isBookmarked
        ? "opacity-100 hover:text-default-600"
        : "opacity-0 group-hover/option:opacity-100 hover:text-default-600"
    }`;
  };

  // Only show bookmark icon if there's a selected profile and it's not initializing
  const shouldShowBookmark = currentStaff && !isInitializing && path;

  const content = (
    <>
      {name}
      {shouldShowBookmark && (
        <BookmarkIcon
          size={18}
          className={getBookmarkIconClasses()}
          onClick={handleBookmarkClick}
        />
      )}
      <IconChevronRight
        size={18}
        stroke={2.25}
        className={`icon icon-tabler icons-tabler-outline icon-tabler-chevron-right transition-all duration-200 right-2 absolute ${
          isActive
            ? "opacity-100 hover:text-default-600"
            : "opacity-0 group-hover/option:opacity-100 hover:text-default-600"
        }`}
      />
    </>
  );

  // Don't show the Bookmarks section at all if no profile is selected
  if (isInBookmarksSection && (!currentStaff || isInitializing)) {
    return null;
  }

  return (
    <li
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={buttonRef}
    >
      {path ? (
        <Link to={path} className={commonClasses} onClick={handleClick}>
          {content}
        </Link>
      ) : (
        <a href="#" className={commonClasses}>
          {content}
        </a>
      )}
    </li>
  );
};

export default SidebarOption;