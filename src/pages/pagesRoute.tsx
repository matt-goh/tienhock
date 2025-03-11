import {
  IconPackage,
  IconBookmark,
  IconListDetails,
} from "@tabler/icons-react";
import { Icon } from "@tabler/icons-react";
import React from "react";

// Import components here
import InvoiceDetailsPage from "./Invois/InvoiceDetailsPage";
import CustomerFormPage from "./Catalogue/CustomerFormPage";
import CustomerAddPage from "./Catalogue/CustomerAddPage";
import JobCategoryPage from "./Catalogue/JobCategoryPage";
import StaffFormPage from "./Catalogue/StaffFormPage";
import CustomerPage from "./Catalogue/CustomerPage";
import StaffAddPage from "./Catalogue/StaffAddPage";
import PDFViewerPage from "./Invois/PDFViewerPage";
import ProductPage from "./Catalogue/ProductPage";
import EInvoicePage from "./Invois/EInvoicePage";
import InvoicePage from "./Invois/InvoicePage";
import BasicPage from "./Catalogue/BasicPage";
import StaffPage from "./Catalogue/StaffPage";
import JobPage from "./Catalogue/JobPage";
import TaxPage from "./Catalogue/TaxPage";
import SalesByProductsPage from "./Sales/SalesByProductsPage";

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
}

export interface RouteItem {
  name: string;
  path: string;
  component: React.ComponentType<any>;
}

export const SidebarData: SidebarItem[] = [
  {
    name: "Bookmarks",
    icon: IconBookmark,
    subItems: [],
    defaultOpen: true,
  },
  {
    name: "Sales",
    icon: IconPackage,
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

export const routes = flattenRoutes(SidebarData);
