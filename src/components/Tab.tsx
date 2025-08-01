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
        className={`flex p-0.5 w-fit bg-default-100 rounded-lg whitespace-nowrap`}
      >
        {labels.map((label, index) => (
          <button
            key={index}
            type="button"
            className={`px-4 py-2 text-center text-sm font-medium transition-all duration-200 rounded-md m-0.5 ${tabWidth} ${
              index === activeTab
                ? "bg-white shadow-sm"
                : "text-default-700 hover:text-default-900 hover:bg-white/60"
            }`}
            onClick={() => setActiveTab(index)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4">{children[activeTab]}</div>
    </div>
  );
};

export default Tab;
