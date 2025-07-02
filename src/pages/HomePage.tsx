import React from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "../contexts/CompanyContext";
import {
  IconBookmark,
  IconFileInvoice,
  IconListDetails,
  IconUserDollar,
  IconDeviceDesktopAnalytics,
  IconTruck,
  IconReportAnalytics,
  IconUsers,
  IconTrash,
  IconChevronRight,
} from "@tabler/icons-react";
import TienHockLogo from "../utils/TienHockLogo";
import GreenTargetLogo from "../utils/GreenTargetLogo";

interface NavigationItem {
  name: string;
  path: string;
  icon: React.ElementType;
  description?: string;
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
  const { setActiveCompany, companies } = useCompany();

  const companySections: CompanySection[] = [
    {
      company: {
        id: "tienhock",
        name: "Tien Hock",
        logo: <TienHockLogo width={32} height={32} />,
        color: "text-sky-700",
        bgColor: "bg-sky-50",
        borderColor: "border-sky-200",
      },
      items: [
        {
          name: "Bookmarks",
          path: "/",
          icon: IconBookmark,
          description: "Quick access to your favorite pages",
        },
        {
          name: "Payroll",
          path: "/payroll/mee-production",
          icon: IconUserDollar,
          description: "Manage employee payroll and payments",
        },
        {
          name: "Sales",
          path: "/sales/invoice",
          icon: IconFileInvoice,
          description: "Invoices and sales management",
        },
        {
          name: "Catalogue",
          path: "/catalogue/staff",
          icon: IconListDetails,
          description: "Manage staff, customers, and products",
        },
      ],
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
      items: [
        {
          name: "Dashboard",
          path: "/greentarget/dashboard",
          icon: IconDeviceDesktopAnalytics,
          description: "Overview and analytics",
        },
        {
          name: "Rentals",
          path: "/greentarget/rentals",
          icon: IconTruck,
          description: "Manage dumpster rentals",
        },
        {
          name: "Invoices",
          path: "/greentarget/invoices",
          icon: IconFileInvoice,
          description: "Billing and invoicing",
        },
        {
          name: "Debtors",
          path: "/greentarget/debtors",
          icon: IconReportAnalytics,
          description: "Track outstanding payments",
        },
        {
          name: "Customers",
          path: "/greentarget/customers",
          icon: IconUsers,
          description: "Customer management",
        },
        {
          name: "Dumpsters",
          path: "/greentarget/dumpsters",
          icon: IconTrash,
          description: "Dumpster inventory",
        },
      ],
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
      items: [
        {
          name: "Sales",
          path: "/jellypolly/sales/invoice",
          icon: IconFileInvoice,
          description: "Sales and invoice management",
        },
      ],
    },
  ];

  const handleNavigate = (companyId: string, path: string) => {
    const company = companies.find((c) => c.id === companyId);
    if (company) {
      setActiveCompany(company);
      navigate(path);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome to Tien Hock ERP
            </h1>
            <p className="mt-2 text-gray-600">
              Select a company and module to get started
            </p>
          </div>
        </div>
      </div>

      {/* Company Sections */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {companySections.map((section) => (
            <div
              key={section.company.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              {/* Company Header */}
              <div
                className={`${section.company.bgColor} ${section.company.borderColor} border-b px-6 py-4`}
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

              {/* Navigation Items Grid */}
              <div className="p-6">
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
                          <div
                            className={`${section.company.bgColor} p-2 rounded-lg`}
                          >
                            <Icon size={24} className={section.company.color} />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900 flex items-center">
                              {item.name}
                              <IconChevronRight
                                size={16}
                                className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
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
              </div>
            </div>
          ))}
        </div>

        {/* Quick Stats or Additional Info */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Multi-Company Management
            </h3>
            <p className="text-gray-600 text-sm">
              Seamlessly switch between Tien Hock, Green Target, and Jelly Polly
              operations.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Integrated Systems
            </h3>
            <p className="text-gray-600 text-sm">
              Unified payroll, sales, inventory, and customer management across
              all companies.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Real-time Data
            </h3>
            <p className="text-gray-600 text-sm">
              Access up-to-date information and generate reports instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
