// src/pages/HomePage.tsx
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCompany } from "../contexts/CompanyContext";
import { IconChevronRight } from "@tabler/icons-react";
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
  group?: string;
}

interface NavigationGroup {
  name: string;
  items: NavigationSubItem[];
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
  const { activeCompany, setActiveCompany, companies } = useCompany();

  const excludedSubItemNameParts: string[] = [
    "New",
    "Edit",
    "List",
    "Details",
  ];

  const prefixPath = (path: string, routePrefix: string): string =>
    `${routePrefix}${path}`;

  // Extract subitems from sidebar data, excluding specific patterns
  const extractSubItems = (
    items: SidebarItem[],
    routePrefix: string,
    fallbackGroup: string
  ): NavigationSubItem[] => {
    const subItems: NavigationSubItem[] = [];
    items.forEach((item: SidebarItem) => {
      const path: string | undefined = item.path;
      const group: string = item.group || fallbackGroup;
      if (
        path &&
        !path.includes(":") &&
        !item.showInPopover &&
        !excludedSubItemNameParts.some((part: string) =>
          item.name.includes(part)
        )
      ) {
        subItems.push({
          name: item.name,
          path: prefixPath(path, routePrefix),
          group,
        });
      }
      if (item.subItems) {
        subItems.push(...extractSubItems(item.subItems, routePrefix, group));
      }
    });
    return subItems;
  };

  const buildCategorizedItems = (
    navData: SidebarItem[],
    routePrefix: string,
    getDescription: (name: string) => string
  ): NavigationItem[] => {
    const items: NavigationItem[] = [];

    navData.forEach((category: SidebarItem) => {
      // Exclude "Bookmarks" category
      if (category.name !== "Bookmarks" && category.subItems) {
        const path: string = category.subItems[0]?.path || "/";

        items.push({
          name: category.name,
          path: prefixPath(path, routePrefix),
          icon: category.icon,
          description: getDescription(category.name),
          subItems: extractSubItems(
            category.subItems,
            routePrefix,
            category.name
          ),
        });
      }
    });

    return items;
  };

  const getDescriptionForTienHock = (name: string): string => {
    const descriptions: Record<string, string> = {
      Accounting: "Manage financial records and transactions",
      Payroll: "Manage employee payroll and payments",
      Sales: "Invoices and sales management",
      Catalogue: "Manage staff, customers, products, etc",
      Stock: "Manage inventory and stock levels",
    };
    return descriptions[name] || "";
  };

  // Build Tien Hock items with detailed sub-item lists
  const buildTienHockItems = (): NavigationItem[] =>
    buildCategorizedItems(TienHockNavData, "", getDescriptionForTienHock);

  const getDescriptionForGreenTarget = (name: string): string => {
    const descriptions: Record<string, string> = {
      Dashboard: "Overview and analytics",
      Rentals: "Manage dumpster rentals",
      Invoices: "Billing and invoicing",
      Documents: "Credit, debit and refund notes",
      Payments: "Track payments and transactions",
      Payroll: "Employee payroll management",
      Debtors: "Track outstanding payments",
      Customers: "Customer management",
      Dumpsters: "Dumpster management",
    };
    return descriptions[name] || "";
  };

  // Build Green Target items as simple navigation cards
  const buildGreenTargetItems = (): NavigationItem[] => {
    return GreenTargetNavData.map((item: SidebarItem) => ({
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
      Payroll: "Manage Jelly Polly payroll and staff work",
      Stock: "Production records and product stock",
    };
    return descriptions[name] || "";
  };

  // Build Jelly Polly items with the same organized category layout as Tien Hock
  const buildJellyPollyItems = (): NavigationItem[] =>
    buildCategorizedItems(
      JellyPollyNavData,
      "/jellypolly",
      getDescriptionForJellyPolly
    );

  const groupSubItems = (
    subItems: NavigationSubItem[] | undefined
  ): NavigationGroup[] => {
    if (!subItems) {
      return [];
    }

    const groups: NavigationGroup[] = [];
    subItems.forEach((subItem: NavigationSubItem) => {
      const groupName: string = subItem.group || "General";
      const existingGroup: NavigationGroup | undefined = groups.find(
        (group: NavigationGroup) => group.name === groupName
      );

      if (existingGroup) {
        existingGroup.items.push(subItem);
        return;
      }

      groups.push({ name: groupName, items: [subItem] });
    });

    return groups;
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

    let currentCompanyId: string = "tienhock";
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

  const companySections: CompanySection[] = buildCompanySections();

  const handleNavigate = (companyId: string, path: string): void => {
    const company = companies.find((c) => c.id === companyId);
    if (company) {
      setActiveCompany(company);
      navigate(path);
    }
  };

  const renderSubItemButton = (
    section: CompanySection,
    subItem: NavigationSubItem
  ): React.ReactElement => (
    <button
      key={subItem.path}
      onClick={() => handleNavigate(section.company.id, subItem.path)}
      className="group flex w-full min-w-0 items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-150"
    >
      <span className="min-w-0 truncate pr-1">{subItem.name}</span>
      <IconChevronRight
        size={14}
        className="text-gray-400 dark:text-gray-500 opacity-0 transition-opacity group-hover:opacity-100 flex-shrink-0"
      />
    </button>
  );

  const renderGroupedSubItems = (
    section: CompanySection,
    category: NavigationItem
  ): React.ReactElement => {
    const groups: NavigationGroup[] = groupSubItems(category.subItems);
    const shouldShowGroupHeaders: boolean = groups.length > 1;

    if (groups.length === 0) {
      return (
        <p className="px-2.5 py-1.5 text-sm text-gray-400 dark:text-gray-500 italic">
          No items available.
        </p>
      );
    }

    return (
      <div className="space-y-2">
        {groups.map((itemGroup: NavigationGroup) => (
          <div key={itemGroup.name} className="space-y-0.5">
            {shouldShowGroupHeaders && (
              <p className="px-2.5 pt-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                {itemGroup.name}
              </p>
            )}
            {itemGroup.items.map((subItem: NavigationSubItem) =>
              renderSubItemButton(section, subItem)
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderCategoryCard = (
    section: CompanySection,
    category: NavigationItem
  ): React.ReactElement => {
    const Icon: React.ElementType | undefined = category.icon;

    return (
      <div
        key={category.name}
        className="flex flex-col rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 hover:bg-white dark:hover:bg-gray-800 hover:shadow-sm hover:border-gray-200 dark:hover:border-gray-600 transition-all duration-200"
      >
        <div className="flex items-start gap-3 p-3 pb-2">
          {Icon && (
            <div className={`${section.company.bgColor} p-2 rounded-lg shadow-sm`}>
              <Icon size={20} className={section.company.color} />
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
          {renderGroupedSubItems(section, category)}
        </div>
      </div>
    );
  };

  const renderDirectItemButton = (
    section: CompanySection,
    item: NavigationItem
  ): React.ReactElement => {
    const Icon: React.ElementType | undefined = item.icon;

    return (
      <button
        key={item.path}
        onClick={() => handleNavigate(section.company.id, item.path)}
        className="group p-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 hover:bg-white dark:hover:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm transition-all duration-200 text-left"
      >
        <div className="flex items-start gap-2.5">
          {Icon && (
            <div
              className={`${section.company.bgColor} p-1.5 rounded-lg shadow-sm`}
            >
              <Icon size={18} className={section.company.color} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm flex items-center">
              <span className="min-w-0 truncate">{item.name}</span>
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
  };

  return (
    <div className="space-y-3">
      {companySections.map((section: CompanySection) => {
        const shouldShowCompanyHeader: boolean =
          section.company.id !== activeCompany.id;
        const shouldUseCategoryLayout: boolean =
          section.company.id === "tienhock" ||
          section.company.id === "jellypolly";

        return (
          <section
            key={section.company.id}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
          >
            {shouldShowCompanyHeader && (
              <div className={`${section.company.bgColor} px-5 py-3`}>
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-white/60 dark:bg-gray-800/60 rounded-lg shadow-sm backdrop-blur-sm">
                    {section.company.logo}
                  </div>
                  <div>
                    <h2
                      className={`text-lg font-semibold ${section.company.color}`}
                    >
                      {section.company.name}
                    </h2>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4">
              {shouldUseCategoryLayout ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {section.items.map((category: NavigationItem) =>
                    renderCategoryCard(section, category)
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {section.items.map((item: NavigationItem) =>
                    renderDirectItemButton(section, item)
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default HomePage;
