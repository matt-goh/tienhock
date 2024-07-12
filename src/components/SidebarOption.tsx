// SidebarOption.tsx
import React from "react";
import { IconChevronRight } from "@tabler/icons-react";

interface SidebarOptionProps {
  name: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  hasSubMenu?: boolean;
  buttonRef?: React.RefObject<HTMLLIElement>;
  isActive?: boolean;
}

const SidebarOption: React.FC<SidebarOptionProps> = ({
  name,
  onMouseEnter,
  onMouseLeave,
  hasSubMenu,
  buttonRef,
  isActive,
}) => {
  return (
    <li
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={buttonRef}
    >
      <a
        href="#"
        className={`block group flex items-center py-2 pl-7 pr-2 transition-colors duration-200 rounded-lg focus:outline-none ${
          isActive ? "bg-gray-100 active:bg-gray-200 hover:text-gray-600" : "hover:bg-gray-100 active:bg-gray-200 hover:text-gray-600"
        }`}
      >
        <svg width="24" height="24" className="mr-2"></svg>
        {name}
        {hasSubMenu && (
          <IconChevronRight
            width="20"
            height="20"
            stroke={2}
            className={`icon icon-tabler icons-tabler-outline icon-tabler-chevron-right transition-all duration-300 right-2 absolute ${
              isActive ? "opacity-100 hover:text-gray-600" : "opacity-0 group-hover:opacity-100 hover:text-gray-600"
            }`}
          />
        )}
      </a>
    </li>
  );
};

export default SidebarOption;
