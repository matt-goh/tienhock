// SidebarButton.tsx
import React from 'react';

interface SidebarButtonProps {
  name: string;
  icon: React.ReactNode;
  onClick: () => void;
  children?: React.ReactNode;
}

const SidebarButton: React.FC<SidebarButtonProps> = ({
  name,
  icon,
  onClick,
  children,
}) => {
  return (
    <li className="m-2">
      <button
        onClick={onClick}
        className="block flex py-2 pl-4 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200 hover:text-gray-600 rounded-full focus:outline-none w-full text-left"
      >
        {icon}
        <span className="font-semibold ml-2">{name}</span>
      </button>
      {children}
    </li>
  );
};

export default SidebarButton;