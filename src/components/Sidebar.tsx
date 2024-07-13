// Sidebar.tsx
import React, { useState, useRef } from "react";
import {
  IconBookmark,
  IconBuildingFactory2,
  IconInvoice,
  IconListDetails,
  IconPackage,
  IconReportMoney,
  IconFileInvoice,
} from "@tabler/icons-react";
import SidebarButton from "./SidebarButton";
import SidebarSubButton from "./SidebarSubButton";
import SidebarOption from "./SidebarOption";
import SidebarPopover from "./SidebarPopover";

const Sidebar: React.FC = () => {
  const [openItems, setOpenItems] = useState<string[]>(["bookmarks"]);
  const [openPayrollOptions, setOpenPayrollOptions] = useState<string[]>([]);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const [isPopoverHovered, setIsPopoverHovered] = useState<boolean>(false);
  const [isButtonHovered, setIsButtonHovered] = useState<boolean>(false);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const meeButtonRef = useRef<HTMLLIElement>(null);
  const bihunButtonRef = useRef<HTMLLIElement>(null);

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

  return (
    <div className="fixed top-0 left-0 h-full bg-white w-[254px] flex flex-col">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm p-4">
        <h2 className="text-xl font-bold text-center">Tien Hock</h2>
      </div>
      <div className="flex-1 overflow-y-auto sidebar-scrollbar">
        <div className="text-gray-500 font-medium text-left">
          <ul className="space-y-2 text-base">
            <SidebarButton
              name="Bookmarks"
              icon={<IconBookmark stroke={1.5} />}
              onClick={() => handleToggle("bookmarks")}
            />
            <SidebarButton
              name="Payroll"
              icon={<IconReportMoney stroke={1.5} />}
              onClick={() => handleToggle("payroll")}
            >
              {openItems.includes("payroll") && (
                <ul className="mt-2 space-y-1">
                  <SidebarSubButton
                    name="Production"
                    icon={
                      <IconBuildingFactory2 stroke={1.5} className="mr-2" />
                    }
                    isOpen={openPayrollOptions.includes("production")}
                    onToggle={() => handlePayrollToggle("production")}
                  >
                    <SidebarOption
                      name="Mee"
                      onMouseEnter={() => handleMouseEnter("mee")}
                      onMouseLeave={handleMouseLeave}
                      hasSubMenu={true}
                      buttonRef={meeButtonRef}
                      isActive={hoveredOption === "mee"}
                    />
                    {hoveredOption === "mee" && (
                      <SidebarPopover
                        options={[
                          { name: "Mee Option 1", link: "#" },
                          { name: "Mee Option 2", link: "#" },
                        ]}
                        onMouseEnter={handlePopoverMouseEnter}
                        onMouseLeave={handlePopoverMouseLeave}
                        buttonRef={meeButtonRef}
                      />
                    )}
                    <SidebarOption
                      name="Bihun"
                      onMouseEnter={() => handleMouseEnter("bihun")}
                      onMouseLeave={handleMouseLeave}
                      hasSubMenu={true}
                      buttonRef={bihunButtonRef}
                      isActive={hoveredOption === "bihun"}
                    />
                    {hoveredOption === "bihun" && (
                      <SidebarPopover
                        options={[
                          { name: "Bihun Option 1", link: "#" },
                          { name: "Bihun Option 2", link: "#" },
                        ]}
                        onMouseEnter={handlePopoverMouseEnter}
                        onMouseLeave={handlePopoverMouseLeave}
                        buttonRef={bihunButtonRef}
                      />
                    )}
                  </SidebarSubButton>
                  <SidebarSubButton
                    name="Pinjam"
                    icon={<IconInvoice stroke={1.5} className="mr-2" />}
                    isOpen={openPayrollOptions.includes("pinjam")}
                    onToggle={() => handlePayrollToggle("pinjam")}
                  >
                    <SidebarOption name="Entry" />
                    <SidebarOption name="Summary" />
                  </SidebarSubButton>
                </ul>
              )}
            </SidebarButton>
            <SidebarButton
              name="Stock"
              icon={<IconPackage stroke={1.5} />}
              onClick={() => handleToggle("stock")}
            >
              {openItems.includes("stock") && (
                <ul className="mt-2 space-y-1">
                  <SidebarOption name="Opening" />
                  <SidebarOption name="Card" />
                </ul>
              )}
            </SidebarButton>
            <SidebarButton
              name="Statement"
              icon={<IconFileInvoice stroke={1.5} />}
              onClick={() => handleToggle("statement")}
            >
              {openItems.includes("statement") && (
                <ul className="mt-2 space-y-1">
                  <SidebarOption name="Option 1" />
                  <SidebarOption name="Option 2" />
                </ul>
              )}
            </SidebarButton>
            <SidebarButton
              name="Catalogue"
              icon={<IconListDetails stroke={1.5} />}
              onClick={() => handleToggle("catalogue")}
            >
              {openItems.includes("catalogue") && (
                <ul className="mt-2 space-y-1">
                  <SidebarOption name="Staff" />
                  <SidebarOption name="Job" />
                  <SidebarOption name="Products/Services" />
                  <SidebarOption name="Section" />
                  <SidebarOption name="Job Location" />
                  <SidebarOption name="Nationality" />
                  <SidebarOption name="Race" />
                  <SidebarOption name="Agama" />
                </ul>
              )}
            </SidebarButton>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
