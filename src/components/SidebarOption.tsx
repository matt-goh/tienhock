import React from "react";
import { IconChevronRight } from "@tabler/icons-react";
import { Link } from "react-router-dom";

interface SidebarOptionProps {
  name: string;
  link?: string; // New prop for the link
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  buttonRef?: React.RefObject<HTMLLIElement>;
  isActive?: boolean;
}

const SidebarOption: React.FC<SidebarOptionProps> = ({
  name,
  link,
  onMouseEnter,
  onMouseLeave,
  buttonRef,
  isActive,
}) => {
  const commonClasses = `block group flex items-center py-2 pl-7 pr-2 transition-colors duration-200 rounded-lg focus:outline-none ${
    isActive
      ? "bg-gray-200/90 active:bg-gray-300/90 hover:text-gray-800"
      : "hover:bg-gray-200/90 active:bg-gray-300/90 hover:text-gray-800"
  }`;

  const content = (
    <>
      <svg width="24" height="24" className="mr-2"></svg>
      {name}
      <IconChevronRight
        width="18"
        height="18"
        stroke={2.5}
        className={`icon icon-tabler icons-tabler-outline icon-tabler-chevron-right transition-all duration-300 right-2 absolute ${
          isActive
            ? "opacity-100 hover:text-gray-600"
            : "opacity-0 group-hover:opacity-100 hover:text-gray-600"
        }`}
      />
    </>
  );

  return (
    <li
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={buttonRef}
    >
      {link ? (
        <Link to={link} className={commonClasses}>
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
