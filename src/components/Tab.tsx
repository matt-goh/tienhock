// src/components/Tab.tsx
import React, { useState, useEffect, useRef } from "react";

interface TabItem {
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
  disabled?: boolean;
}

interface TabProps {
  children: React.ReactElement[];
  labels: (string | TabItem)[];
  tabWidth?: string;
  defaultActiveTab?: number;
  onTabChange?: (tabIndex: number) => void;
  variant?: "underline" | "pill" | "enclosed";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

const Tab: React.FC<TabProps> = ({
  children,
  labels,
  tabWidth,
  defaultActiveTab = 0,
  onTabChange,
  variant = "underline",
  size = "md",
  fullWidth = false,
}) => {
  const [activeTab, setActiveTab] = useState(defaultActiveTab);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTabChange = (index: number) => {
    const tab = normalizeTab(labels[index]);
    if (tab.disabled) return;
    setActiveTab(index);
    onTabChange?.(index);
  };

  // Normalize label to TabItem
  const normalizeTab = (label: string | TabItem): TabItem => {
    if (typeof label === "string") {
      return { label };
    }
    return label;
  };

  // Update indicator position for underline variant
  useEffect(() => {
    if (variant === "underline" && tabsRef.current[activeTab]) {
      const tab = tabsRef.current[activeTab];
      if (tab) {
        setIndicatorStyle({
          width: tab.offsetWidth,
          left: tab.offsetLeft,
        });
      }
    }
  }, [activeTab, variant, labels]);

  // Sync activeTab with defaultActiveTab when it changes
  useEffect(() => {
    setActiveTab(defaultActiveTab);
  }, [defaultActiveTab]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let newIndex = index;
    if (e.key === "ArrowRight") {
      newIndex = (index + 1) % labels.length;
    } else if (e.key === "ArrowLeft") {
      newIndex = (index - 1 + labels.length) % labels.length;
    } else if (e.key === "Home") {
      newIndex = 0;
    } else if (e.key === "End") {
      newIndex = labels.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    // Skip disabled tabs
    while (normalizeTab(labels[newIndex]).disabled && newIndex !== index) {
      if (e.key === "ArrowRight" || e.key === "End") {
        newIndex = (newIndex + 1) % labels.length;
      } else {
        newIndex = (newIndex - 1 + labels.length) % labels.length;
      }
    }
    handleTabChange(newIndex);
    tabsRef.current[newIndex]?.focus();
  };

  // Size classes
  const sizeClasses = {
    sm: "text-xs px-3 py-1.5",
    md: "text-sm px-4 py-2",
    lg: "text-base px-5 py-2.5",
  };

  // Render tab button based on variant
  const renderTab = (label: string | TabItem, index: number) => {
    const tab = normalizeTab(label);
    const isActive = index === activeTab;
    const widthClass = tabWidth || (fullWidth ? "flex-1" : "");

    const baseClasses = `
      relative font-medium transition-colors duration-150 ease-out
      focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2
      dark:focus-visible:ring-offset-gray-800
      ${sizeClasses[size]}
      ${widthClass}
      ${tab.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
    `;

    const variantClasses = {
      underline: `
        border-b-2 border-transparent
        ${isActive
          ? "text-sky-600 dark:text-sky-400"
          : tab.disabled
            ? ""
            : "text-default-500 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200"
        }
      `,
      pill: `
        rounded-lg m-0.5
        ${isActive
          ? "bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 shadow-sm"
          : tab.disabled
            ? ""
            : "text-default-600 dark:text-gray-400 hover:text-default-900 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-700/50"
        }
      `,
      enclosed: `
        border border-transparent rounded-t-lg -mb-px
        ${isActive
          ? "bg-white dark:bg-gray-800 border-default-200 dark:border-gray-700 border-b-white dark:border-b-gray-800 text-default-900 dark:text-gray-100"
          : tab.disabled
            ? ""
            : "text-default-500 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200 hover:bg-default-50 dark:hover:bg-gray-700/50"
        }
      `,
    };

    return (
      <button
        key={index}
        ref={(el) => { tabsRef.current[index] = el; }}
        type="button"
        role="tab"
        aria-selected={isActive}
        aria-controls={`tabpanel-${index}`}
        tabIndex={isActive ? 0 : -1}
        disabled={tab.disabled}
        className={`${baseClasses} ${variantClasses[variant]} inline-flex items-center justify-center gap-2 whitespace-nowrap`}
        onClick={() => handleTabChange(index)}
        onKeyDown={(e) => handleKeyDown(e, index)}
      >
        {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
        <span>{tab.label}</span>
        {tab.badge !== undefined && (
          <span
            className={`
              inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5
              text-xs font-semibold rounded-full
              ${isActive
                ? "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"
                : "bg-default-100 text-default-600 dark:bg-gray-700 dark:text-gray-400"
              }
            `}
          >
            {tab.badge}
          </span>
        )}
      </button>
    );
  };

  // Container classes based on variant
  const containerClasses = {
    underline: "relative flex border-b border-default-200 dark:border-gray-700",
    pill: "flex p-1 w-fit bg-default-100 dark:bg-gray-800/80 rounded-xl",
    enclosed: "flex border-b border-default-200 dark:border-gray-700",
  };

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        role="tablist"
        aria-orientation="horizontal"
        className={`${containerClasses[variant]} ${fullWidth ? "w-full" : "w-fit"}`}
      >
        {labels.map((label, index) => renderTab(label, index))}

        {/* Animated underline indicator */}
        {variant === "underline" && (
          <div
            className="absolute bottom-0 h-[2px] bg-sky-500 dark:bg-sky-400 transition-[left,width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={indicatorStyle}
          />
        )}
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="mt-4"
      >
        {children[activeTab]}
      </div>
    </div>
  );
};

export default Tab;
