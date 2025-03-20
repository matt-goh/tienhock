import {
  IconBookmark,
  IconBox,
  IconListDetails,
  IconReportAnalytics,
} from "@tabler/icons-react";
import { Icon } from "@tabler/icons-react";
import { Company } from "../contexts/CompanyContext";
import React from "react";

// Import components here
import SalesByProductsPage from "./Sales/SalesByProductsPage";
import SalesBySalesmanPage from "./Sales/SalesBySalesmanPage";
import InvoiceDetailsPage from "./Invoice/InvoiceDetailsPage";
import CustomerFormPage from "./Catalogue/CustomerFormPage";
import CustomerAddPage from "./Catalogue/CustomerAddPage";
import JobCategoryPage from "./Catalogue/JobCategoryPage";
import StaffFormPage from "./Catalogue/StaffFormPage";
import CustomerPage from "./Catalogue/CustomerPage";
import StaffAddPage from "./Catalogue/StaffAddPage";
import PDFViewerPage from "./Invoice/PDFViewerPage";
import ProductPage from "./Catalogue/ProductPage";
import EInvoicePage from "./Invoice/EInvoicePage";
import InvoicePage from "./Invoice/InvoicePage";
import BasicPage from "./Catalogue/BasicPage";
import StaffPage from "./Catalogue/StaffPage";
import JobPage from "./Catalogue/JobPage";
import TaxPage from "./Catalogue/TaxPage";

export interface PopoverOption {
  name: string;
  path: string;
}

export interface SidebarItem {
  name: string;
  icon?: Icon;
  path?: string;
  component?: React.ComponentType<any>;
  subItems?: SidebarItem[];
  popoverOptions?: PopoverOption[];
  defaultOpen?: boolean;
  companyId?: string;
}

export interface RouteItem {
  name: string;
  path: string;
  component: React.ComponentType<any>;
}

// This function will generate routes with the correct prefix for a specific company
export const getCompanyRoutes = (company: Company): SidebarItem[] => {
  // Get company-specific sidebar data
  const companySidebarData = getCompanySidebarData(company.id);

  // If Tien Hock (no prefix), return routes as is
  if (!company.routePrefix) {
    return companySidebarData;
  }

  // For other companies, add the prefix to all routes
  return companySidebarData.map((item) => {
    const newItem = { ...item, companyId: company.id };

    // Add prefix to the path if it exists
    if (item.path) {
      newItem.path = `/${company.routePrefix}${item.path}`;
    }

    // Process sub-items recursively
    if (item.subItems && item.subItems.length > 0) {
      newItem.subItems = item.subItems.map((subItem) => {
        const newSubItem = { ...subItem, companyId: company.id };
        if (subItem.path) {
          newSubItem.path = `/${company.routePrefix}${subItem.path}`;
        }

        // Process deeper sub-items if they exist
        if (subItem.subItems && subItem.subItems.length > 0) {
          newSubItem.subItems = subItem.subItems.map((deepSubItem) => {
            const newDeepSubItem = { ...deepSubItem, companyId: company.id };
            if (deepSubItem.path) {
              newDeepSubItem.path = `/${company.routePrefix}${deepSubItem.path}`;
            }
            return newDeepSubItem;
          });
        }

        return newSubItem;
      });
    }

    // Process popover options
    if (item.popoverOptions && item.popoverOptions.length > 0) {
      newItem.popoverOptions = item.popoverOptions.map((option) => ({
        ...option,
        path: `/${company.routePrefix}${option.path}`,
      }));
    }

    return newItem;
  });
};

export const TienHockSidebarData: SidebarItem[] = [
  {
    name: "Bookmarks",
    icon: IconBookmark,
    subItems: [],
    defaultOpen: true,
  },
  {
    name: "Sales",
    icon: IconReportAnalytics,
    subItems: [
      {
        name: "Invoice",
        path: "/sales/invoice",
        component: InvoicePage,
        subItems: [
          {
            name: "Invoice Details",
            path: "/sales/invoice/:id",
            component: InvoiceDetailsPage,
          },
          {
            name: "Invoice PDF Viewer",
            path: "/pdf-viewer",
            component: PDFViewerPage,
          },
          {
            name: "Create New Invoice Page",
            path: "/sales/invoice/create",
            component: InvoiceDetailsPage,
          },
        ],
      },
      {
        name: "e-Invoice",
        path: "/sales/einvoice",
        component: EInvoicePage,
      },
      {
        name: "Sales by Products",
        path: "/sales/sales-by-products",
        component: SalesByProductsPage,
      },
      {
        name: "Sales by Salesman",
        path: "/sales/sales-by-salesman",
        component: SalesBySalesmanPage,
      },
    ],
  },
  {
    name: "Catalogue",
    icon: IconListDetails,
    subItems: [
      {
        name: "Staff",
        path: "/catalogue/staff",
        component: StaffPage,
        subItems: [
          {
            name: "New Staff",
            path: "/catalogue/staff/new",
            component: StaffAddPage,
          },
          {
            name: "Staff Edit",
            path: "/catalogue/staff/:id",
            component: StaffFormPage,
          },
        ],
      },
      {
        name: "Customer",
        path: "/catalogue/customer",
        component: CustomerPage,
        subItems: [
          {
            name: "New Staff",
            path: "/catalogue/customer/new",
            component: CustomerAddPage,
          },
          {
            name: "Staff Edit",
            path: "/catalogue/customer/:id",
            component: CustomerFormPage,
          },
        ],
      },
      {
        name: "Product",
        path: "/catalogue/product",
        component: ProductPage,
      },
      {
        name: "Job",
        path: "/catalogue/job",
        component: JobPage,
      },
      {
        name: "Job Category",
        path: "/catalogue/job_category",
        component: JobCategoryPage,
      },
      {
        name: "Section",
        path: "/catalogue/section",
        component: () => (
          <BasicPage
            title="Section Catalogue"
            apiEndpoint="sections"
            tableKey="catalogueSection"
          />
        ),
      },
      {
        name: "Location",
        path: "/catalogue/location",
        component: () => (
          <BasicPage
            title="Location Catalogue"
            apiEndpoint="locations"
            tableKey="catalogueLocation"
          />
        ),
      },
      {
        name: "Bank",
        path: "/catalogue/bank",
        component: () => (
          <BasicPage
            title="Bank Catalogue"
            apiEndpoint="banks"
            tableKey="catalogueBank"
          />
        ),
      },
      {
        name: "Tax",
        path: "/catalogue/tax",
        component: TaxPage,
      },
      {
        name: "Nationality",
        path: "/catalogue/nationality",
        component: () => (
          <BasicPage
            title="Nationality Catalogue"
            apiEndpoint="nationalities"
            tableKey="catalogueNationality"
          />
        ),
      },
      {
        name: "Race",
        path: "/catalogue/race",
        component: () => (
          <BasicPage
            title="Race Catalogue"
            apiEndpoint="races"
            tableKey="catalogueRace"
          />
        ),
      },
      {
        name: "Agama",
        path: "/catalogue/agama",
        component: () => (
          <BasicPage
            title="Agama Catalogue"
            apiEndpoint="agama"
            tableKey="catalogueAgama"
          />
        ),
      },
    ],
  },
];

export const GreenTargetSidebarData: SidebarItem[] = [
  {
    name: "Sales",
    icon: IconReportAnalytics,
    subItems: [
      {
        name: "Orders",
        path: "/sales/orders",
        component: () => <div>Green Target Orders</div>, // Placeholder component
      },
    ],
  },
];

export const JellyPollySidebarData: SidebarItem[] = [
  {
    name: "Sales",
    icon: IconReportAnalytics,
    subItems: [
      {
        name: "Invoice",
        path: "/sales/invoice",
        component: InvoicePage,
        subItems: [
          {
            name: "Invoice Details",
            path: "/sales/invoice/:id",
            component: InvoiceDetailsPage,
          },
          {
            name: "Invoice PDF Viewer",
            path: "/pdf-viewer",
            component: PDFViewerPage,
          },
          {
            name: "Create New Invoice Page",
            path: "/sales/invoice/create",
            component: InvoiceDetailsPage,
          },
        ],
      },
    ],
  },
];

// Function to get the appropriate SidebarData based on company ID
export const getCompanySidebarData = (companyId: string): SidebarItem[] => {
  switch (companyId) {
    case "tienhock":
      return TienHockSidebarData;
    case "greentarget":
      return GreenTargetSidebarData;
    case "jellypolly":
      return JellyPollySidebarData;
    default:
      return TienHockSidebarData; // Default to Tien Hock
  }
};

export const flattenRoutes = (items: SidebarItem[]): RouteItem[] => {
  return items.reduce((acc: RouteItem[], item) => {
    if (item.path && item.component) {
      acc.push({
        name: item.name,
        path: item.path,
        component: item.component,
      });
    }
    if (item.subItems) {
      acc.push(...flattenRoutes(item.subItems));
    }
    if (item.popoverOptions) {
      acc.push(
        ...item.popoverOptions
          .filter(() => item.component)
          .map((option) => ({
            name: option.name,
            path: option.path,
            component: item.component as React.ComponentType<any>,
          }))
      );
    }
    return acc;
  }, []);
};

// Generate flattened routes for all companies for routing
export const getAllRoutes = (): RouteItem[] => {
  const tienhockRoutes = flattenRoutes(TienHockSidebarData);

  // Generate prefixed routes for other companies
  const greentargetRoutes = flattenRoutes(
    getCompanyRoutes({
      id: "greentarget",
      name: "Green Target",
      routePrefix: "greentarget",
    })
  );

  const jellypollyRoutes = flattenRoutes(
    getCompanyRoutes({
      id: "jellypolly",
      name: "Jelly Polly",
      routePrefix: "jellypolly",
    })
  );

  // Combine all routes
  return [...tienhockRoutes, ...greentargetRoutes, ...jellypollyRoutes];
};

export const routes = getAllRoutes();
