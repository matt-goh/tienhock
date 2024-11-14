import React, {
  useState,
  useRef,
  useEffect,
  SetStateAction,
  Dispatch,
  useCallback,
} from "react";
import {
  PopoverOption,
  SidebarData as OriginalSidebarData,
  SidebarItem,
} from "./SidebarData";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarButton from "./SidebarButton";
import SidebarSubButton from "./SidebarSubButton";
import SidebarOption from "./SidebarOption";
import SidebarPopover from "./SidebarPopover";
import { useProfile } from "../../contexts/ProfileContext";
import ProfileSwitcherModal from "../ProfileSwitcherModal";
import "../../index.css";
import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconSwitchHorizontal,
  IconUserCircle,
} from "@tabler/icons-react";
import { API_BASE_URL } from "../../configs/config";

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
  const [openPayrollOptions, setOpenPayrollOptions] = useState<string[]>([
    "production",
    "pinjam",
  ]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
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
  const { currentStaff, isInitializing } = useProfile();
  const location = useLocation();
  const navigate = useNavigate();

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
          const found = findSidebarItem(item.subItems, name);
          if (found) return found;
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

  // Update SidebarData when profile state changes
  useEffect(() => {
    const updatedSidebarData = [...OriginalSidebarData];
    if (!currentStaff || isInitializing) {
      updatedSidebarData.splice(0, 1);
    }
    setSidebarData(updatedSidebarData);
  }, [currentStaff, isInitializing]);

  // Set default open items whenever SidebarData changes
  useEffect(() => {
    const defaultOpenItems = SidebarData.filter((item) => item.defaultOpen).map(
      (item) => item.name
    );
    setOpenItems((prevItems) => {
      // Merge existing open items with new default open items
      const newOpenItems = new Set([...prevItems, ...defaultOpenItems]);
      return Array.from(newOpenItems);
    });
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
      if (currentStaff?.id) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/bookmarks/${currentStaff.id}`
          );
          const data = await response.json();
          setBookmarks(data);
          setBookmarkedItems(
            new Set(data.map((bookmark: any) => bookmark.name))
          );
        } catch (error) {
          console.error("Error fetching bookmarks:", error);
        }
      }
    };

    fetchBookmarks();
  }, [currentStaff?.id]);

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
      setBookmarkedItems((prev) => {
        const newSet = new Set(prev);
        newSet.add(name);
        return newSet;
      });
      const itemData = findSidebarItem(SidebarData, name);
      if (itemData) {
        setBookmarks((prev) => [...prev, { id: Date.now(), name }]);
      }
    } else {
      setBookmarkedItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(name);
        return newSet;
      });
      setBookmarks((prev) => prev.filter((bookmark) => bookmark.name !== name));
    }
  };

  const isVisible = isPinned || isHovered;

  const handleTitleClick = () => {
    navigate("/");
  };

  const handleToggle = (item: string) => {
    setOpenItems((prevItems) =>
      prevItems.includes(item)
        ? prevItems.filter((i) => i !== item)
        : [...prevItems, item]
    );
  };

  const handlePayrollToggle = (option: string) => {
    setOpenPayrollOptions((prevOptions) =>
      prevOptions.includes(option)
        ? prevOptions.filter((i) => i !== option)
        : [...prevOptions, option]
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
  };

  const handleSidebarMouseLeave = () => {
    if (!isPinned) {
      sidebarHoverTimeout.current = setTimeout(() => {
        setIsHovered(false);
      }, 300);
    }
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
              <ul className="mt-1.5 space-y-1.5">
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
                        itemData.popoverOptions && (
                          <SidebarPopover
                            options={itemData.popoverOptions}
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
                {item.name === "Payroll"
                  ? renderPayrollItems(item.subItems)
                  : renderSubItems(item.subItems)}
              </ul>
            )}
          </SidebarButton>
        );
      } else {
        return renderSidebarOption(item);
      }
    });
  };

  const renderPayrollItems = (items: SidebarItem[]) => {
    return items.map((item) => (
      <SidebarSubButton
        key={item.name}
        name={item.name}
        icon={renderIcon(item.icon)}
        isOpen={openPayrollOptions.includes(item.name.toLowerCase())}
        onToggle={() => handlePayrollToggle(item.name.toLowerCase())}
      >
        {openPayrollOptions.includes(item.name.toLowerCase()) &&
          item.subItems && (
            <ul className="mt-1.5 space-y-1">
              {item.subItems.map(renderSidebarOption)}
            </ul>
          )}
      </SidebarSubButton>
    ));
  };

  const renderSubItems = (items: SidebarItem[]) => {
    return items.map(renderSidebarOption);
  };

  const renderSidebarOption = (item: SidebarItem) => {
    const buttonRef = getRefForItem(item.name);
    const hasPopover = !!item.popoverOptions && item.popoverOptions.length > 0;
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
            options={item.popoverOptions!}
            onMouseEnter={handlePopoverMouseEnter}
            onMouseLeave={() => handlePopoverMouseLeave()}
            buttonRef={buttonRef}
          />
        )}
      </React.Fragment>
    );
  };

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
      <div className="flex-none h-[72px] flex justify-between items-center py-4 bg-default-100/75 z-10 relative">
        {/* Header bottom shadow */}
        <div className="pointer-events-none absolute inset-x-0 -bottom-6 h-6 z-[1] bg-gradient-to-b from-default-100 via-default-100/25 to-transparent"></div>

        <h2
          className="text-xl font-bold text-center ml-8 cursor-pointer"
          onClick={handleTitleClick}
        >
          Tien Hock
        </h2>
        <button
          onClick={() => setIsPinned(!isPinned)}
          className="flex items-center justify-center p-2 mr-3.5 h-[34px] w-[34px] rounded-lg hover:bg-default-200 active:bg-default-300"
        >
          {isPinned ? (
            <IconArrowBarToLeft stroke={2} />
          ) : (
            <IconArrowBarToRight stroke={2} />
          )}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto sidebar-scrollbar mt-1">
        <div className="text-default-700 font-medium text-left">
          <ul className="mx-0.5 space-y-1 text-base">
            {renderSidebarItems(SidebarData)}
          </ul>
        </div>
      </div>

      {/* Profile Switcher */}
      <div className="flex-none h-[64px] bg-default-100/75 relative">
        {/* Profile top shadow */}
        <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 z-[1] bg-gradient-to-t from-default-100 via-default-100/25 to-transparent"></div>

        <div className="mx-4 h-full flex items-center">
          <button
            onClick={() => setIsProfileModalOpen(true)}
            className="w-full px-3 py-2.5 flex items-center rounded-lg hover:bg-default-200 active:bg-default-300 border border-default-300 transition-colors duration-200"
          >
            <div className="flex w-full justify-between">
              <div className="flex items-center">
                <IconUserCircle
                  className="flex-shrink-0 mr-3 text-default-700"
                  stroke={1.5}
                />
                <span className="text-sm font-medium text-default-700">
                  {currentStaff?.id || "Select Profile"}
                </span>
              </div>
              <div className="flex items-center">
                <IconSwitchHorizontal
                  stroke={1.75}
                  size={18}
                  className="text-default-700"
                />
              </div>
            </div>
          </button>
        </div>

        <ProfileSwitcherModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
        />
      </div>
    </div>
  );
};

export default Sidebar;
