import React, {
  useState,
  useRef,
  useEffect,
  SetStateAction,
  Dispatch,
  useCallback,
} from "react";
import {
  SidebarItem,
  PopoverOption,
  getCompanyRoutes,
} from "../../pages/pagesRoute";
import { useLocation } from "react-router-dom";
import SidebarButton from "./SidebarButton";
import SidebarOption from "./SidebarOption";
import SidebarPopover from "./SidebarPopover";
import "../../index.css";
import { IconArrowBarToLeft, IconArrowBarToRight } from "@tabler/icons-react";
import UserMenu from "../UserMenu";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../routes/utils/api";
import CompanySwitcher from "../CompanySwitcher";
import { useCompany } from "../../contexts/CompanyContext";
import {
  getBookmarksFromCache,
  saveBookmarksToCache,
} from "../../utils/bookmarkCache";

interface SidebarProps {
  isPinned: boolean;
  isHovered: boolean;
  setIsPinned: (pinned: boolean) => void;
  setIsHovered: Dispatch<SetStateAction<boolean>>;
}

interface Bookmark {
  id: number;
  name: string;
}

const Sidebar: React.FC<SidebarProps> = ({
  isPinned,
  isHovered,
  setIsPinned,
  setIsHovered,
}) => {
  const [SidebarData, setSidebarData] = useState<SidebarItem[]>([]);
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [hoveredRegularOption, setHoveredRegularOption] = useState<
    string | null
  >(null);
  const [hoveredBookmarkOption, setHoveredBookmarkOption] = useState<
    string | null
  >(null);
  const [activeRegularOption, setActiveRegularOption] = useState<string | null>(
    null
  );
  const [activeBookmarkOption, setActiveBookmarkOption] = useState<
    string | null
  >(null);
  const [lastClickedSource, setLastClickedSource] = useState<
    "regular" | "bookmark" | null
  >(null);
  const [isButtonHovered, setIsButtonHovered] = useState<boolean>(false);
  const [isPopoverHovered, setIsPopoverHovered] = useState<boolean>(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarkedItems, setBookmarkedItems] = useState<Set<string>>(
    new Set()
  );
  const sidebarHoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const { user, isLoading } = useAuth();
  const { activeCompany } = useCompany();
  const location = useLocation();

  const findSidebarItem = useCallback(
    (
      items: SidebarItem[],
      name: string
    ): (SidebarItem & { popoverOptions?: PopoverOption[] }) | null => {
      for (const item of items) {
        if (item.name === name) {
          return item;
        }
        if (item.subItems) {
          // Check regular subItems
          const found = findSidebarItem(item.subItems, name);
          if (found) return found;

          // Check for showInPopover subItems
          const popoverSubItem = item.subItems.find(
            (subItem) => subItem.showInPopover && subItem.name === name
          );
          if (popoverSubItem) return popoverSubItem;
        }
        if (item.popoverOptions) {
          const found = item.popoverOptions.find(
            (option) => option.name === name
          );
          if (found) return { name: found.name, path: found.path };
        }
      }
      return null;
    },
    []
  );

  useEffect(() => {
    const updatedSidebarData = [...SidebarData];
    if (!user || isLoading) {
      updatedSidebarData.splice(0, 1);
    }
    setSidebarData(updatedSidebarData);
  }, [user, isLoading]);

  // Effect to set company-specific sidebar data
  useEffect(() => {
    // Get routes for the active company
    const companySidebarData = getCompanyRoutes(activeCompany);

    // Only show bookmarks for Tien Hock
    if ((!user || isLoading) && activeCompany.id === "tienhock") {
      // Remove bookmarks if user not logged in and it's Tien Hock
      const filteredData = [...companySidebarData];
      filteredData.splice(0, 1);
      setSidebarData(filteredData);
    } else {
      // Otherwise use the company-specific sidebar data
      setSidebarData(companySidebarData);
    }
  }, [user, isLoading, activeCompany]);

  // On mount, set initial open items
  useEffect(() => {
    const defaultOpenItems = SidebarData.filter((item) => item.defaultOpen).map(
      (item) => item.name
    );
    setOpenItems(defaultOpenItems);
  }, [SidebarData]);

  useEffect(() => {
    const currentPath = location.pathname;
    let foundActiveRegular = false;
    let foundActiveBookmark = false;

    const checkRouteMatch = (
      item: SidebarItem,
      isBookmarked: boolean = false
    ) => {
      if (item.path && currentPath.startsWith(item.path)) {
        if (isBookmarked && lastClickedSource === "bookmark") {
          setActiveBookmarkOption(item.name);
          setActiveRegularOption(null);
          foundActiveBookmark = true;
        } else if (!isBookmarked && lastClickedSource === "regular") {
          setActiveRegularOption(item.name);
          setActiveBookmarkOption(null);
          foundActiveRegular = true;
        }
      }

      if (item.popoverOptions) {
        item.popoverOptions.forEach((option) => {
          if (option.path && currentPath.startsWith(option.path)) {
            if (isBookmarked && lastClickedSource === "bookmark") {
              setActiveBookmarkOption(item.name);
              setActiveRegularOption(null);
              foundActiveBookmark = true;
            } else if (!isBookmarked && lastClickedSource === "regular") {
              setActiveRegularOption(item.name);
              setActiveBookmarkOption(null);
              foundActiveRegular = true;
            }
          }
        });
      }

      if (item.subItems) {
        item.subItems.forEach((subItem) =>
          checkRouteMatch(subItem, isBookmarked)
        );
      }
    };

    // If no click source is set yet (initial load), prefer regular items
    if (!lastClickedSource) {
      setLastClickedSource("regular");
    }

    // Reset states first
    setActiveRegularOption(null);
    setActiveBookmarkOption(null);

    // Check all items
    SidebarData.forEach((item) => checkRouteMatch(item, false));
    bookmarks.forEach((bookmark) => {
      const itemData = findSidebarItem(SidebarData, bookmark.name);
      if (itemData) {
        checkRouteMatch(itemData, true);
      }
    });

    if (!foundActiveRegular && !foundActiveBookmark) {
      setActiveRegularOption(null);
      setActiveBookmarkOption(null);
    }
  }, [location, bookmarks, lastClickedSource, SidebarData, findSidebarItem]);

  useEffect(() => {
    const fetchBookmarks = async () => {
      if (user?.id) {
        try {
          // Try to get bookmarks from cache first
          const cachedBookmarks = getBookmarksFromCache(user.id);

          if (cachedBookmarks) {
            // Use cached data
            setBookmarks(cachedBookmarks);
            setBookmarkedItems(
              new Set(cachedBookmarks.map((bookmark) => bookmark.name))
            );
            return;
          }

          // If no cache or expired, fetch from server
          const data = await api.get(`/api/bookmarks/${user.id}`);
          setBookmarks(data);
          setBookmarkedItems(
            new Set(data.map((bookmark: any) => bookmark.name))
          );

          // Save to cache
          saveBookmarksToCache(user.id, data);
        } catch (error) {
          console.error("Error fetching bookmarks:", error);
          setBookmarks([]);
          setBookmarkedItems(new Set());
        }
      }
    };

    fetchBookmarks();
  }, [user?.id]);

  const buttonRefs = useRef<{ [key: string]: React.RefObject<HTMLLIElement> }>(
    {}
  );
  const bookmarkRefs = useRef<{
    [key: string]: React.RefObject<HTMLLIElement>;
  }>({});
  const regularHoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const bookmarkHoverTimeout = useRef<NodeJS.Timeout | null>(null);

  const getRefForItem = (name: string, isBookmarked: boolean = false) => {
    const refMap = isBookmarked ? bookmarkRefs : buttonRefs;
    if (!refMap.current[name]) {
      refMap.current[name] = React.createRef<HTMLLIElement>();
    }
    return refMap.current[name];
  };

  const handleBookmarkUpdate = async (name: string, isBookmarked: boolean) => {
    if (isBookmarked) {
      // Add to local state
      setBookmarkedItems((prev) => {
        const newSet = new Set(prev);
        newSet.add(name);
        return newSet;
      });

      const itemData = findSidebarItem(SidebarData, name);
      if (itemData) {
        // Add to bookmarks array
        const newBookmark = { id: Date.now(), name };
        setBookmarks((prev) => [...prev, newBookmark]);

        // If we have a logged in user, also update the cache
        if (user?.id) {
          // Get current cached bookmarks or use current state if no cache
          const cachedBookmarks = getBookmarksFromCache(user.id) || [
            ...bookmarks,
          ];
          // Add new bookmark to cache
          saveBookmarksToCache(user.id, [...cachedBookmarks, newBookmark]);
        }
      }
    } else {
      // Remove from local state
      setBookmarkedItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(name);
        return newSet;
      });

      // Filter out from bookmarks array
      const updatedBookmarks = bookmarks.filter(
        (bookmark) => bookmark.name !== name
      );
      setBookmarks(updatedBookmarks);

      // If we have a logged in user, also update the cache
      if (user?.id) {
        saveBookmarksToCache(user.id, updatedBookmarks);
      }
    }
  };

  const isVisible = isPinned || isHovered;

  const handleToggle = (item: string) => {
    setOpenItems((prevItems) =>
      prevItems.includes(item)
        ? prevItems.filter((i) => i !== item)
        : [...prevItems, item]
    );
  };

  const clearAllTimeouts = () => {
    if (regularHoverTimeout.current) {
      clearTimeout(regularHoverTimeout.current);
      regularHoverTimeout.current = null;
    }
    if (bookmarkHoverTimeout.current) {
      clearTimeout(bookmarkHoverTimeout.current);
      bookmarkHoverTimeout.current = null;
    }
  };

  const handleMouseEnter = (name: string, isBookmarked: boolean = false) => {
    clearAllTimeouts();

    // Clear the other hover state immediately
    if (isBookmarked) {
      setHoveredRegularOption(null);
      setHoveredBookmarkOption(name);
    } else {
      setHoveredBookmarkOption(null);
      setHoveredRegularOption(name);
    }

    setIsButtonHovered(true);
  };

  const handleMouseLeave = (isBookmarked: boolean = false) => {
    setIsButtonHovered(false);

    const timeoutRef = isBookmarked
      ? bookmarkHoverTimeout
      : regularHoverTimeout;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (!isPopoverHovered) {
        if (isBookmarked) {
          setHoveredBookmarkOption(null);
        } else {
          setHoveredRegularOption(null);
        }
      }
    }, 300);
  };

  const handlePopoverMouseEnter = () => {
    clearAllTimeouts();
    setIsPopoverHovered(true);
  };

  const handlePopoverMouseLeave = (isBookmarked: boolean = false) => {
    setIsPopoverHovered(false);

    const timeoutRef = isBookmarked
      ? bookmarkHoverTimeout
      : regularHoverTimeout;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (!isButtonHovered) {
        if (isBookmarked) {
          setHoveredBookmarkOption(null);
        } else {
          setHoveredRegularOption(null);
        }
      }
    }, 300);
  };

  useEffect(() => {
    // Cleanup timeouts when component unmounts
    return () => {
      clearAllTimeouts();
    };
  }, []);

  const handleSidebarMouseEnter = () => {
    if (sidebarHoverTimeout.current) {
      clearTimeout(sidebarHoverTimeout.current);
      sidebarHoverTimeout.current = null;
    }
    if (!isPinned) {
      setIsHovered(true);
    }
    setIsSidebarHovered(true);
  };

  const handleSidebarMouseLeave = () => {
    if (!isPinned) {
      sidebarHoverTimeout.current = setTimeout(() => {
        setIsHovered(false);
      }, 300);
    }
    setIsSidebarHovered(false);
  };

  const renderIcon = (IconComponent?: SidebarItem["icon"]) => {
    return IconComponent ? (
      <IconComponent stroke={1.5} className="flex-shrink-0" />
    ) : null;
  };

  const renderSidebarItems = (items: SidebarItem[]) => {
    return items.map((item) => {
      if (item.name === "Bookmarks") {
        return (
          <SidebarButton
            key={item.name}
            name={item.name}
            icon={renderIcon(item.icon)}
            onClick={() => handleToggle(item.name)}
            isOpen={openItems.includes(item.name)}
          >
            {openItems.includes(item.name) && (
              <ul className={bookmarks.length > 0 ? "mt-1.5 space-y-1.5" : ""}>
                {bookmarks.map((bookmark) => {
                  const itemData = findSidebarItem(SidebarData, bookmark.name);
                  if (!itemData) return null;

                  const buttonRef = getRefForItem(bookmark.name, true);
                  const isActive =
                    activeBookmarkOption === bookmark.name ||
                    hoveredBookmarkOption === bookmark.name;

                  return (
                    <React.Fragment key={bookmark.id}>
                      <SidebarOption
                        name={bookmark.name}
                        path={itemData.path}
                        onMouseEnter={() =>
                          handleMouseEnter(bookmark.name, true)
                        }
                        onMouseLeave={() => handleMouseLeave(true)}
                        buttonRef={buttonRef}
                        isActive={isActive}
                        isInBookmarksSection={true}
                        isBookmarked={true}
                        onBookmarkUpdate={handleBookmarkUpdate}
                        onNavigate={() => setLastClickedSource("bookmark")}
                      />
                      {hoveredBookmarkOption === bookmark.name &&
                        getPopoverOptionsForItem(itemData).length > 0 && (
                          <SidebarPopover
                            options={getPopoverOptionsForItem(itemData)}
                            onMouseEnter={handlePopoverMouseEnter}
                            onMouseLeave={() => handlePopoverMouseLeave(true)}
                            buttonRef={buttonRef}
                          />
                        )}
                    </React.Fragment>
                  );
                })}
              </ul>
            )}
          </SidebarButton>
        );
      }

      // Check if the top-level item has both a path and component
      if (item.path && item.component) {
        // Render as a clickable button
        return (
          <SidebarButton
            key={item.name}
            name={item.name}
            icon={renderIcon(item.icon)}
            onClick={() => handleToggle(item.name)}
            isOpen={openItems.includes(item.name)}
            path={item.path} // Add the path
            onNavigate={() => setLastClickedSource("regular")} // Add navigation callback
          >
            {openItems.includes(item.name) && item.subItems && (
              <ul className="mt-1.5 space-y-1.5">
                {item.subItems.map(renderSidebarOption)}
              </ul>
            )}
          </SidebarButton>
        );
      }

      // For traditional dropdown categories (no path/component)
      if (item.subItems) {
        return (
          <SidebarButton
            key={item.name}
            name={item.name}
            icon={renderIcon(item.icon)}
            onClick={() => handleToggle(item.name)}
            isOpen={openItems.includes(item.name)}
          >
            {openItems.includes(item.name) && (
              <ul className="mt-1.5 space-y-1.5">
                {renderSubItems(item.subItems)}
              </ul>
            )}
          </SidebarButton>
        );
      } else {
        return renderSidebarOption(item);
      }
    });
  };

  const renderSubItems = (items: SidebarItem[]) => {
    return items.map(renderSidebarOption);
  };

  const renderSidebarOption = (item: SidebarItem) => {
    const buttonRef = getRefForItem(item.name);
    const popoverOptions = getPopoverOptionsForItem(item);
    const hasPopover = popoverOptions.length > 0;
    const isActive =
      activeRegularOption === item.name || hoveredRegularOption === item.name;

    return (
      <React.Fragment key={item.name}>
        <SidebarOption
          name={item.name}
          path={item.path}
          onMouseEnter={() => handleMouseEnter(item.name)}
          onMouseLeave={() => handleMouseLeave()}
          buttonRef={buttonRef}
          isActive={isActive}
          isBookmarked={bookmarkedItems.has(item.name)}
          onBookmarkUpdate={handleBookmarkUpdate}
          onNavigate={() => setLastClickedSource("regular")}
        />
        {hoveredRegularOption === item.name && hasPopover && (
          <SidebarPopover
            options={popoverOptions}
            onMouseEnter={handlePopoverMouseEnter}
            onMouseLeave={() => handlePopoverMouseLeave()}
            buttonRef={buttonRef}
          />
        )}
      </React.Fragment>
    );
  };

  const getPopoverOptionsForItem = useCallback(
    (item: SidebarItem): PopoverOption[] => {
      // Start with any explicitly defined popover options
      const options: PopoverOption[] = [...(item.popoverOptions || [])];

      // Add subItems that have showInPopover flag
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
    },
    []
  );

  return (
    <div
      className={`
        fixed top-0 left-0 h-screen bg-default-100/75 border-r border-default-200
        transition-all duration-100 ease-in-out w-[254px]
        ${isVisible ? "opacity-100" : "opacity-0 pointer-events-none"}
        sidebar-transition group/sidebar flex flex-col
      `}
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
    >
      {/* Header */}
      <div className="flex-none h-fit mt-3 flex justify-between items-center bg-default-100/75 z-10 relative">
        {/* Header bottom shadow */}
        <div className="pointer-events-none absolute inset-x-0 -bottom-6 h-6 z-[1] bg-gradient-to-b from-default-100 via-default-100/25 to-transparent"></div>

        {/* Updated CompanySwitcher placement with logo */}
        <div className="flex-1 flex pl-3">
          <CompanySwitcher onNavigate={() => setLastClickedSource("regular")} />
        </div>

        <div className="flex justify-end pr-3">
          <div className="flex justify-end pr-3">
            <button
              onClick={() => setIsPinned(!isPinned)}
              className="flex items-center justify-center p-2 h-[34px] w-[34px] rounded-lg hover:bg-default-200/90 active:bg-default-300/90 transition-all duration-300 ease-in-out hover:scale-105 active:scale-95"
            >
              {isPinned ? (
                <IconArrowBarToLeft
                  stroke={1.75}
                  size={20}
                  className={`transition-opacity duration-200 ${
                    isSidebarHovered ? "opacity-100" : "opacity-0"
                  }`}
                />
              ) : (
                <IconArrowBarToRight
                  stroke={1.75}
                  size={20}
                  className="transition-opacity duration-200"
                />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto sidebar-scrollbar mt-1">
        <div className="text-default-700 font-medium text-left">
          <ul className="mx-0.5 space-y-1 text-base">
            {renderSidebarItems(SidebarData)}
          </ul>
        </div>
      </div>

      {/* User Menu */}
      <div className="flex-none h-[64px] bg-default-100/75 relative">
        {/* Profile top shadow */}
        <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 z-[1] bg-gradient-to-t from-default-100 via-default-100/25 to-transparent"></div>

        <div className="mx-4 h-full flex items-center">
          <UserMenu />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
