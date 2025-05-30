// src/components/Sidebar/SidebarButton.tsx

import { IconChevronRight } from "@tabler/icons-react";
import React from "react";
import { useNavigate } from "react-router-dom";

interface SidebarButtonProps {
  name: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onClick: () => void;
  children?: React.ReactNode;
  path?: string;
  onNavigate?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  buttonRef?: React.RefObject<HTMLElement>;
}

const SidebarButton: React.FC<SidebarButtonProps> = ({
  name,
  icon,
  isOpen,
  onClick,
  children,
  path,
  onNavigate,
  onMouseEnter,
  onMouseLeave,
  buttonRef,
}) => {
  const navigate = useNavigate();

  // Handle click differently based on whether it's a navigation or dropdown toggle
  const handleClick = (e: React.MouseEvent) => {
    if (path) {
      e.preventDefault();
      if (onNavigate) {
        onNavigate();
      }
      navigate(path);
    } else {
      onClick();
    }
  };

  return (
    <li
      className="m-1.5 my-1"
      ref={buttonRef as React.RefObject<HTMLLIElement>}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        onClick={handleClick}
        className="relative group/button flex items-center py-2 pl-4 pr-2 hover:bg-default-200/90 hover:text-default-800 active:bg-default-300/90 transition-colors duration-200 rounded-lg focus:outline-none w-full text-left"
      >
        {icon}
        <span className="font-semibold ml-3">{name}</span>
        <IconChevronRight
          width="18"
          height="18"
          stroke={2.25}
          className={`icon icon-tabler icons-tabler-outline icon-tabler-chevron-right absolute right-3 opacity-0 hover:text-default-600 group-hover/button:opacity-100 transform transition-all duration-300 ${
            isOpen && !path ? "rotate-90" : ""
          }`}
        />
      </button>
      {children}
    </li>
  );
};

export default SidebarButton;
