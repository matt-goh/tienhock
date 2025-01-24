import {
  IconPackage,
  IconBookmark,
  IconListDetails,
} from "@tabler/icons-react";
import { Icon } from "@tabler/icons-react";
import React from "react";

// Import components here
import CustomerFormPage from "./pages/Catalogue/CustomerFormPage";
import InvoisDetailsPage from "./pages/Invois/InvoisDetailsPage";
import CustomerAddPage from "./pages/Catalogue/CustomerAddPage";
import JobCategoryPage from "./pages/Catalogue/JobCategoryPage";
import InvoisUploadPage from "./pages/Invois/InvoisUploadPage";
import StaffFormPage from "./pages/Catalogue/StaffFormPage";
import CustomerPage from "./pages/Catalogue/CustomerPage";
import StaffAddPage from "./pages/Catalogue/StaffAddPage";
import PDFViewerPage from "./pages/Invois/PDFViewerPage";
import ProductPage from "./pages/Catalogue/ProductPage";
import BasicPage from "./pages/Catalogue/BasicPage";
import StaffPage from "./pages/Catalogue/StaffPage";
import InvoisPage from "./pages/Invois/InvoisPage";
import JobPage from "./pages/Catalogue/JobPage";
import TaxPage from "./pages/Catalogue/TaxPage";

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
        name: "Invois",
        path: "/sales/invois",
        component: InvoisPage,
        subItems: [
          {
            name: "Invois Details",
            path: "/sales/invois/:id",
            component: InvoisDetailsPage,
          },
          {
            name: "Invois PDF Viewer",
            path: "/pdf-viewer",
            component: PDFViewerPage,
          },
          {
            name: "Imported Invois Page",
            path: "/sales/invois/imported",
            component: InvoisUploadPage,
          },
          {
            name: "Imported Invois Details",
            path: "/sales/invois/imported/:id",
            component: InvoisDetailsPage,
          },
          {
            name: "Create New Invois Page",
            path: "/sales/invois/create",
            component: InvoisDetailsPage,
          },
        ],
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
