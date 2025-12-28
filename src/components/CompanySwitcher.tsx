// src/components/CompanySwitcher.tsx
import React, { useState, useRef, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany, Company } from "../contexts/CompanyContext";
import { Transition } from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import TienHockLogo from "../utils/TienHockLogo";
import GreenTargetLogo from "../utils/GreenTargetLogo";

interface CompanySwitcherProps {
  onNavigate?: () => void;
}

// Company theme colors
const companyThemes: Record<string, { bg: string; text: string; border: string; activeBg: string }> = {
  tienhock: {
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200",
    activeBg: "bg-sky-100",
  },
  greentarget: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    activeBg: "bg-emerald-100",
  },
  jellypolly: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
    activeBg: "bg-rose-100",
  },
};

const CompanySwitcher: React.FC<CompanySwitcherProps> = ({ onNavigate }) => {
  const { activeCompany, setActiveCompany, companies } = useCompany();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  const theme = companyThemes[activeCompany.id] || companyThemes.tienhock;

  // Handle hover open/close
  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const getCompanyLogo = (companyId: string, size: number = 20) => {
    switch (companyId) {
      case "greentarget":
        return <GreenTargetLogo width={size} height={size} />;
      case "tienhock":
      case "jellypolly":
      default:
        return <TienHockLogo width={size} height={size} />;
    }
  };

  const getCompanyTheme = (companyId: string) => {
    return companyThemes[companyId] || companyThemes.tienhock;
  };

  const handleCompanyChange = (company: Company) => {
    if (company.id === activeCompany.id) {
      setIsOpen(false);
      return;
    }

    setActiveCompany(company);
    setIsOpen(false);

    // Navigate to the company homepage
    const homePath = company.routePrefix ? `/${company.routePrefix}` : "/";
    navigate(homePath);

    if (onNavigate) {
      onNavigate();
    }
  };

  return (
    <div
      className="relative"
      ref={dropdownRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger Button */}
      <button
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg border
          transition-all duration-200
          ${theme.bg} ${theme.border} ${theme.text}
          hover:shadow-sm active:scale-[0.98]
        `}
      >
        {getCompanyLogo(activeCompany.id, 22)}
        <span className="font-semibold text-sm">{activeCompany.name}</span>
        <IconChevronDown
          size={16}
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown Menu */}
      <Transition
        show={isOpen}
        as={Fragment}
        enter="transition ease-out duration-150"
        enterFrom="opacity-0 scale-95 -translate-y-1"
        enterTo="opacity-100 scale-100 translate-y-0"
        leave="transition ease-in duration-100"
        leaveFrom="opacity-100 scale-100 translate-y-0"
        leaveTo="opacity-0 scale-95 -translate-y-1"
      >
        <div className="absolute left-0 mt-2 w-52 bg-white rounded-xl shadow-lg z-50 border border-default-200 overflow-hidden">
          {/* Company Options */}
          <div className="p-1.5">
            {companies.map((company) => {
              const isActive = company.id === activeCompany.id;
              const itemTheme = getCompanyTheme(company.id);

              return (
                <button
                  key={company.id}
                  onClick={() => handleCompanyChange(company)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                    transition-all duration-150
                    ${isActive
                      ? `${itemTheme.activeBg} ${itemTheme.text}`
                      : "hover:bg-default-100 text-default-700"
                    }
                  `}
                >
                  {/* Logo with colored background */}
                  <div className={`p-1.5 rounded-lg ${itemTheme.bg}`}>
                    {getCompanyLogo(company.id, 20)}
                  </div>

                  {/* Company Name */}
                  <span className={`flex-1 text-left font-medium text-sm ${isActive ? itemTheme.text : ""}`}>
                    {company.name}
                  </span>

                  {/* Active Indicator */}
                  {isActive && (
                    <IconCheck size={18} className={itemTheme.text} stroke={2.5} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Transition>
    </div>
  );
};

export default CompanySwitcher;
