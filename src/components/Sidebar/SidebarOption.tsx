import React from "react";
import {
  IconBookmark,
  IconBookmarkFilled,
  IconChevronRight,
} from "@tabler/icons-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useCompany } from "../../contexts/CompanyContext";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";

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
  const { user, isLoading } = useAuth();
  const { activeCompany } = useCompany();
  const navigate = useNavigate();

  const handleBookmarkClick = async (e: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    e.preventDefault();
    e.stopPropagation();

    if (!name) return;

    // Create a loading toast that we can update later
    const toastId = toast.loading(
      isBookmarked ? "Removing bookmark..." : "Adding bookmark..."
    );

    try {
      if (isBookmarked) {
        await api.delete(
          `/api/bookmarks/${user?.id}/${encodeURIComponent(name)}`
        );
        await onBookmarkUpdate(name, false);
        // Update the loading toast with success message
        toast.success(`Removed "${name}" from bookmarks`, {
          id: toastId,
        });
      } else {
        await api.post("/api/bookmarks", {
          staffId: user?.id,
          name,
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
      return `transition-all duration-200 right-[1.6rem] absolute cursor-pointer opacity-0 group-hover/option:opacity-100 hover:text-default-600`;
    }
    return `transition-all duration-200 right-[1.6rem] absolute cursor-pointer ${
      isActive || isBookmarked
        ? "opacity-100 hover:text-default-600"
        : "opacity-0 group-hover/option:opacity-100 hover:text-default-600"
    }`;
  };

  const shouldShowBookmark = user && path && activeCompany.id === "tienhock";

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

  // Don't show the Bookmarks section at all if not authenticated
  if (isInBookmarksSection && (!user || isLoading)) {
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
        <button className={commonClasses}>{content}</button>
      )}
    </li>
  );
};

export default SidebarOption;
