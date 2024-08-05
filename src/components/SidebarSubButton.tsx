import React from "react";

interface SidebarSubButtonProps {
  name: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

const SidebarSubButton: React.FC<SidebarSubButtonProps> = ({
  name,
  icon,
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <li className="relative">
      <button
        onClick={onToggle}
        className="flex group items-center block w-full py-2 pl-4 pr-2 text-left hover:bg-gray-200/90 active:bg-gray-300/90 hover:text-gray-800 transition-colors duration-200 rounded-lg focus:outline-none"
      >
        <span className="flex items-center">
          {icon}
          <span className="ml-3">{name}</span>
        </span>
      </button>
      {isOpen && children && <ul className="mt-1.5 space-y-1">{children}</ul>}
    </li>
  );
};

export default SidebarSubButton;
