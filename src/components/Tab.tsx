// src/components/Tab.tsx
import React, { useState } from "react";

interface TabProps {
  children: React.ReactElement[];
  labels: string[];
  tabWidth?: string;
  defaultActiveTab?: number;
}

const Tab: React.FC<TabProps> = ({
  children,
  labels,
  tabWidth = "w-[8rem]",
  defaultActiveTab = 0, // Default to first tab if not specified
}) => {
  const [activeTab, setActiveTab] = useState(defaultActiveTab);

  return (
    <div className="w-full">
      <div
        className={`flex px-1 w-fit bg-default-100 rounded-lg whitespace-nowrap`}
      >
        {labels.map((label, index) => (
          <button
            key={index}
            type="button"
            className={`px-4 py-2 my-1 text-center text-sm font-medium transition-all duration-200 ${tabWidth} ${
              index === activeTab
                ? "bg-white rounded-lg"
                : "text-default-700 hover:text-default-800"
            }`}
            onClick={() => setActiveTab(index)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="">{children[activeTab]}</div>
    </div>
  );
};

export default Tab;
