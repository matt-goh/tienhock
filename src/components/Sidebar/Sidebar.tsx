import React, {
  useState,
  useRef,
  useEffect,
  SetStateAction,
  Dispatch,
} from "react";
import { SidebarData, SidebarItem } from "./SidebarData";
import { useLocation } from "react-router-dom";
import SidebarButton from "./SidebarButton";
import SidebarSubButton from "./SidebarSubButton";
import SidebarOption from "./SidebarOption";
import SidebarPopover from "./SidebarPopover";
import "../../index.css";
import { IconArrowBarToLeft, IconArrowBarToRight } from "@tabler/icons-react";

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
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const [isButtonHovered, setIsButtonHovered] = useState<boolean>(false);
  const [isPopoverHovered, setIsPopoverHovered] = useState<boolean>(false);
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const sidebarHoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const buttonRefs = useRef<{ [key: string]: React.RefObject<HTMLLIElement> }>(
    {}
  );
  const location = useLocation();

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

  const handlePinButtonMouseEnter = () => {
    setShowTooltip(true);
  };

  const handlePinButtonMouseLeave = () => {
    setShowTooltip(false);
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
        transition-all duration-300 ease-in-out w-[254px]
        ${isVisible ? "opacity-100" : "opacity-0 pointer-events-none"}
        sidebar-transition group/sidebar
      `}
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
    >
      <div className="relative flex justify-between items-center py-4">
        <h2 className="text-xl font-bold text-center pl-8">Tien Hock</h2>
        <button
          onClick={() => setIsPinned(!isPinned)}
          onMouseEnter={handlePinButtonMouseEnter}
          onMouseLeave={handlePinButtonMouseLeave}
          className="flex items-center justify-center p-2 mr-3.5 h-[34px] w-[34px] rounded-lg hover:bg-default-200 active:bg-default-300"
        >
          {isPinned ? (
            <IconArrowBarToLeft stroke={2} />
          ) : (
            <IconArrowBarToRight stroke={2} />
          )}
        </button>
        {showTooltip && (
          <div
            className={`absolute ${
              isPinned ? "-right-[84px]" : "-right-[68px]"
            } z-10 px-2 py-1 w-auto font-semibold text-xs text-default-900 text-center bg-default-200 rounded-lg shadow-sm ml-2 top-1/2 transform -translate-y-1/2`}
          >
            {isPinned ? "Unpin sidebar" : "Pin sidebar"}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto sidebar-scrollbar h-[calc(100vh-4rem)]">
        <div className="text-default-700 font-medium text-left">
          <ul className="mx-0.5 space-y-2 text-base">
            {renderSidebarItems(SidebarData)}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
