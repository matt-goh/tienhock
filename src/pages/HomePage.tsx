import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCompany } from "../contexts/CompanyContext";
import {
  IconFileInvoice,
  IconListDetails,
  IconUserDollar,
  IconChevronRight,
  IconReportMoney,
} from "@tabler/icons-react";
import TienHockLogo from "../utils/TienHockLogo";
import GreenTargetLogo from "../utils/GreenTargetLogo";
import { TienHockSidebarData } from "./TienHockSidebarData";
import { GreenTargetSidebarData } from "./GreenTargetSidebarData";
import { JellyPollySidebarData } from "./JellyPollySidebarData";
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

    TienHockSidebarData.forEach((category) => {
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
      Debtors: "Track outstanding payments",
      Customers: "Customer management",
      Dumpsters: "Dumpster management",
    };
    return descriptions[name] || "";
  };

  // Build Green Target items as simple navigation cards
  const buildGreenTargetItems = (): NavigationItem[] => {
    return GreenTargetSidebarData.map((item) => ({
      name: item.name,
      path: `/greentarget${item.path || ""}`,
      icon: item.icon,
      description: getDescriptionForGreenTarget(item.name),
    }));
  };

  // Build Jelly Polly items as simple navigation cards
  const buildJellyPollyItems = (): NavigationItem[] => {
    const salesItem = JellyPollySidebarData[0];
    const invoiceSubItem = salesItem?.subItems?.[0];

    return [
      {
        name: "Sales",
        path: invoiceSubItem?.path
          ? `/jellypolly${invoiceSubItem.path}`
          : "/jellypolly",
        icon: salesItem?.icon,
        description: "Sales and invoice management",
      },
    ];
  };

  // Build company sections and reorder based on the current URL
  const buildCompanySections = (): CompanySection[] => {
    const sections: CompanySection[] = [
      {
        company: {
          id: "tienhock",
          name: "Tien Hock",
          logo: <TienHockLogo width={32} height={32} />,
          color: "text-sky-700",
          bgColor: "bg-sky-50",
          borderColor: "border-sky-200",
        },
        items: buildTienHockItems(),
      },
      {
        company: {
          id: "greentarget",
          name: "Green Target",
          logo: <GreenTargetLogo width={32} height={32} />,
          color: "text-emerald-700",
          bgColor: "bg-emerald-50",
          borderColor: "border-emerald-200",
        },
        items: buildGreenTargetItems(),
      },
      {
        company: {
          id: "jellypolly",
          name: "Jelly Polly",
          logo: <TienHockLogo width={32} height={32} />,
          color: "text-rose-700",
          bgColor: "bg-rose-50",
          borderColor: "border-rose-200",
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
    <div className="min-h-screen bg-gray-50 w-full -mt-8">
      {/* Company Sections */}
      <main className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {companySections.map((section) => (
            <section
              key={section.company.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              {/* Company Header */}
              <div
                className={`${section.company.borderColor} ${section.company.bgColor} border-b px-6 py-4`}
              >
                <div className="flex items-center space-x-3">
                  {section.company.logo}
                  <h2
                    className={`text-xl font-semibold ${section.company.color}`}
                  >
                    {section.company.name}
                  </h2>
                </div>
              </div>

              {/* Items Container */}
              <div className="p-6">
                {section.company.id === "tienhock" ? (
                  // Hierarchical Layout for Tien Hock
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                    {section.items.map((category) => {
                      const Icon = category.icon;
                      return (
                        <div
                          key={category.name}
                          className="flex flex-col rounded-lg border border-gray-200 p-4"
                        >
                          <div className="flex items-start space-x-3">
                            {Icon && (
                              <div
                                className={`${section.company.bgColor} p-2 rounded-lg`}
                              >
                                <Icon
                                  size={24}
                                  className={section.company.color}
                                />
                              </div>
                            )}
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900">
                                {category.name}
                              </h3>
                              {category.description && (
                                <p className="text-sm text-gray-500 mt-1">
                                  {category.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="mt-4 pt-4 border-t border-gray-200 flex-grow">
                            <div className="space-y-1.5">
                              {category.subItems &&
                              category.subItems.length > 0 ? (
                                category.subItems.map((subItem) => (
                                  <button
                                    key={subItem.path}
                                    onClick={() =>
                                      handleNavigate(
                                        section.company.id,
                                        subItem.path
                                      )
                                    }
                                    className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors duration-150"
                                  >
                                    <span>{subItem.name}</span>
                                    <IconChevronRight
                                      size={16}
                                      className="text-gray-400 opacity-0 transition-opacity group-hover:opacity-100"
                                    />
                                  </button>
                                ))
                              ) : (
                                <p className="px-2 py-1.5 text-sm text-gray-400 italic">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.path}
                          onClick={() =>
                            handleNavigate(section.company.id, item.path)
                          }
                          className="group relative p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200 text-left"
                        >
                          <div className="flex items-start space-x-3">
                            {Icon && (
                              <div
                                className={`${section.company.bgColor} p-2 rounded-lg`}
                              >
                                <Icon
                                  size={24}
                                  className={section.company.color}
                                />
                              </div>
                            )}
                            <div className="flex-1">
                              <h3 className="font-medium text-gray-900 flex items-center">
                                {item.name}
                                <IconChevronRight
                                  size={16}
                                  className="ml-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100"
                                />
                              </h3>
                              {item.description && (
                                <p className="mt-1 text-sm text-gray-500">
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
      </main>
    </div>
  );
};

export default HomePage;
