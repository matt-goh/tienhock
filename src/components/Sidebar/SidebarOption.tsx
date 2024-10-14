import React from "react";
import { IconChevronRight } from "@tabler/icons-react";
import { Link } from "react-router-dom";

interface SidebarOptionProps {
  name: string;
  path?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  buttonRef?: React.RefObject<HTMLLIElement>;
  isActive?: boolean;
}

const SidebarOption: React.FC<SidebarOptionProps> = ({
  name,
  path,
  onMouseEnter,
  onMouseLeave,
  buttonRef,
  isActive,
}) => {
  const commonClasses = `block group/option flex items-center ml-10 pl-3 py-2 pr-2 transition-colors duration-200 rounded-lg focus:outline-none relative ${
    isActive
      ? "bg-default-200/90 active:bg-default-300/90 hover:text-default-800"
      : "hover:bg-default-200/90 active:bg-default-300/90 hover:text-default-800"
  }`;

  const content = (
    <>
      {name}
      <IconChevronRight
        size={18}
        stroke={2.25}
        className={`icon icon-tabler icons-tabler-outline icon-tabler-chevron-right transition-all duration-300 right-2 absolute ${
          isActive
            ? "opacity-100 hover:text-default-600"
            : "opacity-0 group-hover/option:opacity-100 hover:text-default-600"
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
      {path ? (
        <Link to={path} className={commonClasses}>
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
