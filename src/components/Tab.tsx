import React, { useState } from 'react';

interface TabProps {
  children: React.ReactElement[];
  labels: string[];
}

const Tab: React.FC<TabProps> = ({ children, labels }) => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="w-full">
      <div className={`flex px-1 w-fit bg-gray-100 rounded-lg`}>
        {labels.map((label, index) => (
          <button
            key={index}
            type="button"
            className={`px-4 py-2 my-1 text-sm font-medium transition-all duration-200 ${
              index === activeTab
                ? 'bg-white rounded-lg'
                : 'text-gray-700 hover:text-gray-800'
            }`}
            onClick={() => setActiveTab(index)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5">{children[activeTab]}</div>
    </div>
  );
};

export default Tab;