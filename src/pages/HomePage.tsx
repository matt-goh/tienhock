// src/pages/HomePage.tsx
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCompany } from "../contexts/CompanyContext";
import {
  IconFileInvoice,
  IconListDetails,
  IconUserDollar,
  IconChevronRight,
  IconReportMoney,
  IconPackage,
} from "@tabler/icons-react";
import TienHockLogo from "../utils/TienHockLogo";
import GreenTargetLogo from "../utils/GreenTargetLogo";
import { TienHockNavData } from "./TienHockNavData";
import { GreenTargetNavData } from "./GreenTargetNavData";
import { JellyPollyNavData } from "./JellyPollyNavData";
import { SidebarItem } from "./pagesRoute";

interface NavigationItem {
  name: string;
  path: string;
  icon?: React.ElementType;
  description?: string;
  subItems?: NavigationSubItem[];
}

interface NavigationSubItem {
  name: string;
  path: string;
}

interface CompanySection {
  company: {
    id: string;
    name: string;
    logo: React.ReactNode;
    color: string;
    bgColor: string;
    borderColor: string;
  };
  items: NavigationItem[];
}

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setActiveCompany, companies } = useCompany();

  // Extract subitems from sidebar data, excluding specific patterns
  const extractSubItems = (items: SidebarItem[]): NavigationSubItem[] => {
    const subItems: NavigationSubItem[] = [];
    items.forEach((item) => {
      if (
        item.path &&
        !item.path.includes(":") &&
        !item.name.includes("New") &&
        !item.name.includes("Edit") &&
        !item.name.includes("List")
      ) {
        subItems.push({ name: item.name, path: item.path });
      }
      if (item.subItems) {
        subItems.push(...extractSubItems(item.subItems));
      }
    });
    return subItems;
  };

  // Build Tien Hock items with detailed sub-item lists
  const buildTienHockItems = (): NavigationItem[] => {
    const items: NavigationItem[] = [];

    TienHockNavData.forEach((category) => {
      // Exclude "Bookmarks" category
      if (category.name !== "Bookmarks" && category.subItems) {
        let icon: React.ElementType | undefined;
        let description: string | undefined;

        switch (category.name) {
          case "Accounting":
            icon = IconReportMoney;
            description = "Manage financial records and transactions";
            break;
          case "Payroll":
            icon = IconUserDollar;
            description = "Manage employee payroll and payments";
            break;
          case "Sales":
            icon = IconFileInvoice;
            description = "Invoices and sales management";
            break;
          case "Catalogue":
            icon = IconListDetails;
            description = "Manage staff, customers, products, etc";
            break;
          case "Stock":
            icon = IconPackage;
            description = "Manage inventory and stock levels";
            break;
        }

        items.push({
          name: category.name,
          path: category.subItems[0]?.path || "/",
          icon,
          description,
          subItems: extractSubItems(category.subItems),
        });
      }
    });

    return items;
  };

  const getDescriptionForGreenTarget = (name: string): string => {
    const descriptions: Record<string, string> = {
      Dashboard: "Overview and analytics",
      Rentals: "Manage dumpster rentals",
      Invoices: "Billing and invoicing",
      Payments: "Track payments and transactions",
      Debtors: "Track outstanding payments",
      Customers: "Customer management",
      Dumpsters: "Dumpster management",
    };
    return descriptions[name] || "";
  };

  // Build Green Target items as simple navigation cards
  const buildGreenTargetItems = (): NavigationItem[] => {
    return GreenTargetNavData.map((item) => ({
      name: item.name,
      path: `/greentarget${item.path || ""}`,
      icon: item.icon,
      description: getDescriptionForGreenTarget(item.name),
    }));
  };

  const getDescriptionForJellyPolly = (name: string): string => {
    const descriptions: Record<string, string> = {
      Accounting: "Financial reports and debtors management",
      Sales: "Sales and invoice management",
      Invoice: "Create and manage invoices",
      "Sales Summary": "Sales analytics and reporting",
      Payments: "Track and manage payments",
      Debtors: "Monitor outstanding receivables",
    };
    return descriptions[name] || "";
  };

  // Build Jelly Polly items as simple navigation cards
  const buildJellyPollyItems = (): NavigationItem[] => {
    const items: NavigationItem[] = [];

    JellyPollyNavData.forEach((category) => {
      if (category.subItems) {
        category.subItems.forEach((subItem) => {
          if (
            subItem.path &&
            !subItem.path.includes(":") &&
            !subItem.name.includes("New") &&
            !subItem.name.includes("Details")
          ) {
            items.push({
              name: subItem.name,
              path: `/jellypolly${subItem.path}`,
              icon: category.icon,
              description: getDescriptionForJellyPolly(subItem.name),
            });
          }
        });
      }
    });

    return items;
  };

  // Build company sections and reorder based on the current URL
  const buildCompanySections = (): CompanySection[] => {
    const sections: CompanySection[] = [
      {
        company: {
          id: "tienhock",
          name: "Tien Hock",
          logo: <TienHockLogo width={36} height={36} />,
          color: "text-sky-600 dark:text-sky-400",
          bgColor: "bg-gradient-to-r from-sky-50 via-sky-50 to-blue-50 dark:from-sky-900/30 dark:via-sky-900/20 dark:to-blue-900/20",
          borderColor: "border-sky-100 dark:border-sky-800",
        },
        items: buildTienHockItems(),
      },
      {
        company: {
          id: "greentarget",
          name: "Green Target",
          logo: <GreenTargetLogo width={36} height={36} />,
          color: "text-emerald-600 dark:text-emerald-400",
          bgColor: "bg-gradient-to-r from-emerald-50 via-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:via-emerald-900/20 dark:to-teal-900/20",
          borderColor: "border-emerald-100 dark:border-emerald-800",
        },
        items: buildGreenTargetItems(),
      },
      {
        company: {
          id: "jellypolly",
          name: "Jelly Polly",
          logo: <TienHockLogo width={36} height={36} />,
          color: "text-rose-600 dark:text-rose-400",
          bgColor: "bg-gradient-to-r from-rose-50 via-rose-50 to-pink-50 dark:from-rose-900/30 dark:via-rose-900/20 dark:to-pink-900/20",
          borderColor: "border-rose-100 dark:border-rose-800",
        },
        items: buildJellyPollyItems(),
      },
    ];

    let currentCompanyId = "tienhock";
    if (location.pathname.startsWith("/greentarget")) {
      currentCompanyId = "greentarget";
    } else if (location.pathname.startsWith("/jellypolly")) {
      currentCompanyId = "jellypolly";
    }

    const currentSection = sections.find(
      (s) => s.company.id === currentCompanyId
    );
    const otherSections = sections.filter(
      (s) => s.company.id !== currentCompanyId
    );

    return currentSection ? [currentSection, ...otherSections] : sections;
  };

  const companySections = buildCompanySections();

  const handleNavigate = (companyId: string, path: string) => {
    const company = companies.find((c) => c.id === companyId);
    if (company) {
      setActiveCompany(company);
      navigate(path);
    }
  };

  return (
    <div className="space-y-3">
      {companySections.map((section) => (
        <section
          key={section.company.id}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
        >
          {/* Company Header */}
          <div
            className={`${section.company.bgColor} px-5 py-3`}
          >
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-white/60 dark:bg-gray-800/60 rounded-lg shadow-sm backdrop-blur-sm">
                {section.company.logo}
              </div>
              <div>
                <h2
                  className={`text-lg font-semibold ${section.company.color} tracking-tight`}
                >
                  {section.company.name}
                </h2>
              </div>
            </div>
          </div>

          {/* Items Container */}
          <div className="p-4">
            {section.company.id === "tienhock" ? (
              // Hierarchical Layout for Tien Hock
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {section.items.map((category) => {
                  const Icon = category.icon;
                  return (
                    <div
                      key={category.name}
                      className="flex flex-col rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 hover:bg-white dark:hover:bg-gray-800 hover:shadow-sm hover:border-gray-200 dark:hover:border-gray-600 transition-all duration-200"
                    >
                      <div className="flex items-start gap-3 p-3 pb-2">
                        {Icon && (
                          <div
                            className={`${section.company.bgColor} p-2 rounded-lg shadow-sm`}
                          >
                            <Icon
                              size={20}
                              className={section.company.color}
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                            {category.name}
                          </h3>
                          {category.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">
                              {category.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mx-3 border-t border-gray-100 dark:border-gray-700" />
                      <div className="p-2 flex-grow">
                        <div className="space-y-0.5">
                          {category.subItems && category.subItems.length > 0 ? (
                            category.subItems.map((subItem) => (
                              <button
                                key={subItem.path}
                                onClick={() =>
                                  handleNavigate(
                                    section.company.id,
                                    subItem.path
                                  )
                                }
                                className="group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-150"
                              >
                                <span>{subItem.name}</span>
                                <IconChevronRight
                                  size={14}
                                  className="text-gray-400 dark:text-gray-500 opacity-0 transition-opacity group-hover:opacity-100"
                                />
                              </button>
                            ))
                          ) : (
                            <p className="px-2.5 py-1.5 text-sm text-gray-400 dark:text-gray-500 italic">
                              No items available.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Card Layout for Green Target and Jelly Polly
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      onClick={() =>
                        handleNavigate(section.company.id, item.path)
                      }
                      className="group p-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 hover:bg-white dark:hover:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm transition-all duration-200 text-left"
                    >
                      <div className="flex items-start gap-2.5">
                        {Icon && (
                          <div
                            className={`${section.company.bgColor} p-1.5 rounded-lg shadow-sm`}
                          >
                            <Icon
                              size={18}
                              className={section.company.color}
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm flex items-center">
                            {item.name}
                            <IconChevronRight
                              size={14}
                              className="ml-1 text-gray-400 dark:text-gray-500 opacity-0 transition-opacity group-hover:opacity-100 flex-shrink-0"
                            />
                          </h3>
                          {item.description && (
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-tight">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
};

export default HomePage;
