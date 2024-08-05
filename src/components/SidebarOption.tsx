import React from "react";
import { IconChevronRight } from "@tabler/icons-react";
import { Link } from "react-router-dom";

interface SidebarOptionProps {
  name: string;
  link?: string;
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
  const commonClasses = `block group flex items-center ml-10 pl-3 py-2 pr-2 transition-colors duration-200 rounded-lg focus:outline-none relative ${
    isActive
      ? "bg-gray-200/90 active:bg-gray-300/90 hover:text-gray-800"
      : "hover:bg-gray-200/90 active:bg-gray-300/90 hover:text-gray-800"
  }`;

  const content = (
    <>
      <div className="absolute -left-3 -top-1 -bottom-0.5 w-0.5 bg-gray-200/75" />
      {name}
      <IconChevronRight
        size={18}
        stroke={2.25}
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
