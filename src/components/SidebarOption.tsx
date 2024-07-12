// SidebarOption.tsx
import React from "react";
import { IconChevronRight } from "@tabler/icons-react";

interface SidebarOptionProps {
  name: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  hasSubMenu?: boolean;
  buttonRef?: React.RefObject<HTMLLIElement>;
}

const SidebarOption: React.FC<SidebarOptionProps> = ({
  name,
  onMouseEnter,
  onMouseLeave,
  hasSubMenu,
  buttonRef,
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
        className="block flex items-center py-2 pl-7 pr-2 hover:bg-gray-200 active:bg-gray-300 transition-colors duration-200 rounded-lg focus:outline-none"
      >
        <svg width="24" height="24" className="mr-2"></svg>
        {name}
        {hasSubMenu && (
          <IconChevronRight
            width="20"
            height="20"
            stroke={2}
            className="icon icon-tabler icons-tabler-outline icon-tabler-chevron-right right-2 absolute"
          />
        )}
      </a>
    </li>
  );
};

export default SidebarOption;
