// src/components/CompanySwitcher.tsx
import React, { useState, useRef, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany, Company } from "../contexts/CompanyContext";
import { Transition } from "@headlessui/react";

interface CompanySwitcherProps {
  onNavigate?: () => void;
}

const CompanySwitcher: React.FC<CompanySwitcherProps> = ({ onNavigate }) => {
  const { activeCompany, setActiveCompany, companies } = useCompany();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
    };
  }, []);

  const handleCompanyChange = (company: Company) => {
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
      className={`relative ${
        activeCompany.id === "greentarget" ? "ml-7" : "ml-4"
      } `}
      ref={dropdownRef}
    >
      <button
        className="font-segoe text-xl font-bold w-40 py-2 px-4 rounded-lg transition-colors duration-200 hover:bg-default-200/90 active:bg-default-300/90 hover:text-default-800 focus:outline-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        {activeCompany.name}
      </button>

      <Transition
        show={isOpen}
        as={Fragment}
        enter="transition ease-out duration-200"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition ease-in duration-150"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
      >
        <div className="absolute left-0 mt-1 w-40 space-y-1 bg-white rounded-lg shadow-lg z-50 border border-default-200 p-1">
          {companies.map((company) => (
            <button
              key={company.id}
              className={`w-full text-left rounded-md px-4 py-2.5 font-medium transition-colors duration-200 hover:bg-default-200/90 active:bg-default-300/90 hover:text-default-800 ${
                company.id === activeCompany.id
                  ? "bg-default-100 text-default-800"
                  : "text-default-700"
              }`}
              onClick={() => handleCompanyChange(company)}
            >
              {company.name}
            </button>
          ))}
        </div>
      </Transition>
    </div>
  );
};

export default CompanySwitcher;
