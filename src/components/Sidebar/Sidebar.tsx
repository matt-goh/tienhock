import React, {
  useState,
  useRef,
  useEffect,
  SetStateAction,
  Dispatch,
} from "react";
import { SidebarData, SidebarItem } from "./SidebarData";
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

interface SidebarProps {
  isPinned: boolean;
  isHovered: boolean;
  setIsPinned: (pinned: boolean) => void;
  setIsHovered: Dispatch<SetStateAction<boolean>>;
}

const Sidebar: React.FC<SidebarProps> = ({
  isPinned,
  isHovered,
  setIsPinned,
  setIsHovered,
}) => {
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [openPayrollOptions, setOpenPayrollOptions] = useState<string[]>([
    "production",
    "pinjam",
  ]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const { currentStaff } = useProfile();
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const [isButtonHovered, setIsButtonHovered] = useState<boolean>(false);
  const [isPopoverHovered, setIsPopoverHovered] = useState<boolean>(false);
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const sidebarHoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const buttonRefs = useRef<{ [key: string]: React.RefObject<HTMLLIElement> }>(
    {}
  );
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const defaultOpenItems = SidebarData.filter((item) => item.defaultOpen).map(
      (item) => item.name
    );
    setOpenItems(defaultOpenItems);
  }, []);

  useEffect(() => {
    const currentPath = location.pathname;
    let foundActiveRoute = false;

    const checkRouteMatch = (item: SidebarItem) => {
      if (item.path && currentPath.startsWith(item.path)) {
        setActiveRoute(item.name);
        foundActiveRoute = true;
      }
      if (item.popoverOptions) {
        item.popoverOptions.forEach((option) => {
          if (option.path && currentPath.startsWith(option.path)) {
            setActiveRoute(item.name);
            foundActiveRoute = true;
          }
        });
      }
      if (item.subItems) {
        item.subItems.forEach(checkRouteMatch);
      }
    };

    SidebarData.forEach(checkRouteMatch);

    if (!foundActiveRoute) {
      setActiveRoute(null);
    }
  }, [location]);

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

  const handleMouseEnter = (option: string) => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
    setHoveredOption(option);
    setIsButtonHovered(true);
  };

  const handleMouseLeave = () => {
    setIsButtonHovered(false);
    hoverTimeout.current = setTimeout(() => {
      if (!isPopoverHovered) {
        setHoveredOption(null);
      }
    }, 300);
  };

  const handlePopoverMouseEnter = () => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
    setIsPopoverHovered(true);
  };

  const handlePopoverMouseLeave = () => {
    setIsPopoverHovered(false);
    hoverTimeout.current = setTimeout(() => {
      if (!isButtonHovered) {
        setHoveredOption(null);
      }
    }, 300);
  };

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
    if (!buttonRefs.current[item.name]) {
      buttonRefs.current[item.name] = React.createRef<HTMLLIElement>();
    }
    const buttonRef = buttonRefs.current[item.name];
    const hasPopover = !!item.popoverOptions && item.popoverOptions.length > 0;
    const isActive = activeRoute === item.name || hoveredOption === item.name;

    return (
      <React.Fragment key={item.name}>
        <SidebarOption
          name={item.name}
          path={item.path}
          onMouseEnter={() => handleMouseEnter(item.name)}
          onMouseLeave={handleMouseLeave}
          buttonRef={buttonRef}
          isActive={isActive}
        />
        {hoveredOption === item.name && hasPopover && (
          <SidebarPopover
            options={item.popoverOptions!}
            onMouseEnter={handlePopoverMouseEnter}
            onMouseLeave={handlePopoverMouseLeave}
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
                <IconUserCircle className="flex-shrink-0 mr-3 text-default-700" stroke={1.5} />
                <span className="text-sm font-medium text-default-700">
                  {currentStaff?.id || "Select Profile"}
                </span>
              </div>
              <div className="flex items-center">
                <IconSwitchHorizontal stroke={1.75} size={18} className="text-default-700"/>
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
