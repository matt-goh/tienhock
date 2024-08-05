import React, { useState, useRef, useEffect } from "react";
import { SidebarData, SidebarItem } from "./SidebarData";
import { useLocation } from "react-router-dom";
import SidebarButton from "./SidebarButton";
import SidebarSubButton from "./SidebarSubButton";
import SidebarOption from "./SidebarOption";
import SidebarPopover from "./SidebarPopover";

const Sidebar: React.FC = () => {
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [openPayrollOptions, setOpenPayrollOptions] = useState<string[]>([
    "production",
    "pinjam",
  ]);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const [isButtonHovered, setIsButtonHovered] = useState<boolean>(false);
  const [isPopoverHovered, setIsPopoverHovered] = useState<boolean>(false);
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const buttonRefs = useRef<{ [key: string]: React.RefObject<HTMLLIElement> }>(
    {}
  );
  const location = useLocation();

  useEffect(() => {
    // Set initial open state based on defaultOpen property
    const defaultOpenItems = SidebarData.filter((item) => item.defaultOpen).map(
      (item) => item.name
    );
    setOpenItems(defaultOpenItems);
  }, []);

  useEffect(() => {
    // Update active route when location changes
    const currentPath = location.pathname;
    let foundActiveRoute = false;

    const checkRouteMatch = (item: SidebarItem) => {
      if (item.link && currentPath.startsWith(item.link)) {
        setActiveRoute(item.name);
        foundActiveRoute = true;
      }
      if (item.popoverOptions) {
        item.popoverOptions.forEach((option) => {
          if (option.link && currentPath.startsWith(option.link)) {
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
          link={item.link}
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
    <div className="relative top-0 left-0 h-screen bg-gray-100/75 w-[254px] flex flex-col">
      <div className="relative py-4">
        <h2 className="text-xl font-bold text-center">Tien Hock</h2>
      </div>
      <div className="flex-1 overflow-y-auto sidebar-scrollbar">
        <div className="text-gray-700 font-medium text-left">
          <ul className="mx-1 space-y-2 text-base">
            {renderSidebarItems(SidebarData)}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
