import {
  IconPackage,
  IconBookmark,
  IconListDetails,
} from "@tabler/icons-react";
import { Icon } from "@tabler/icons-react";
import React from "react";

// Import components here
import CatalogueJobCategoryPage from "../../pages/Catalogue/CatalogueJobCategoryPage";
import CatalogueStaffFormPage from "../../pages/Catalogue/CatalogueStaffFormPage";
import CatalogueAddStaffPage from "../../pages/Catalogue/CatalogueAddStaffPage";
import CatalogueCustomerPage from "../../pages/Catalogue/CatalogueCustomerPage";
import CatalogueProductPage from "../../pages/Catalogue/CatalogueProductPage";
import CatalogueBasicPage from "../../pages/Catalogue/CatalogueBasicPage";
import CatalogueStaffPage from "../../pages/Catalogue/CatalogueStaffPage";
import InvoisDetailsPage from "../../pages/Invois/InvoisDetailsPage";
import InvoisUploadPage from "../../pages/Invois/InvoisUploadPage";
import CatalogueJobPage from "../../pages/Catalogue/CatalogueJobPage";
import CatalogueTaxPage from "../../pages/Catalogue/CatalogueTaxPage";
import InvoisPage from "../../pages/Invois/InvoisPage";
import PDFViewerPage from "../../pages/Invois/PDFViewerPage";

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
        component: CatalogueStaffPage,
        subItems: [
          {
            name: "New Staff",
            path: "/catalogue/staff/new",
            component: CatalogueAddStaffPage,
          },
          {
            name: "Staff Edit",
            path: "/catalogue/staff/:id",
            component: CatalogueStaffFormPage,
          },
        ],
      },
      {
        name: "Customer",
        path: "/catalogue/customer",
        component: CatalogueCustomerPage,
      },
      {
        name: "Product",
        path: "/catalogue/product",
        component: CatalogueProductPage,
      },
      {
        name: "Job",
        path: "/catalogue/job",
        component: CatalogueJobPage,
      },
      {
        name: "Job Category",
        path: "/catalogue/job_category",
        component: CatalogueJobCategoryPage,
      },
      {
        name: "Section",
        path: "/catalogue/section",
        component: () => (
          <CatalogueBasicPage
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
          <CatalogueBasicPage
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
          <CatalogueBasicPage
            title="Bank Catalogue"
            apiEndpoint="banks"
            tableKey="catalogueBank"
          />
        ),
      },
      {
        name: "Tax",
        path: "/catalogue/tax",
        component: CatalogueTaxPage,
      },
      {
        name: "Nationality",
        path: "/catalogue/nationality",
        component: () => (
          <CatalogueBasicPage
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
          <CatalogueBasicPage
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
          <CatalogueBasicPage
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
