import {
  IconBookmark,
  IconBuildingFactory2,
  IconInvoice,
  IconListDetails,
  IconPackage,
  IconReportMoney,
  IconFileInvoice,
} from "@tabler/icons-react";
import { Icon } from "@tabler/icons-react";
import React from "react";

// Import your components here
import CatalogueStaffPage from "../pages/CatalogueStaffPage";
import CatalogueAddStaffPage from "../pages/CatalogueAddStaffPage";
import CatalogueStaffFormPage from "../pages/CatalogueStaffFormPage";
import CatalogueJobPage from "../pages/CatalogueJobPage";
import CatalogueJobCategoryPage from "../pages/CatalogueJobCategoryPage";
import CatalogueBasicPage from "../pages/CatalogueBasicPage";
import CatalogueTaxPage from "../pages/CatalogueTaxPage";

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
    name: "Payroll",
    icon: IconReportMoney,
    subItems: [
      {
        name: "Production",
        icon: IconBuildingFactory2,
        subItems: [
          {
            name: "Mee",
            path: "/payroll/production/mee",
            popoverOptions: [
              { name: "Mee Option 1", path: "/payroll/production/mee/option1" },
              { name: "Mee Option 2", path: "/payroll/production/mee/option2" },
            ],
          },
          {
            name: "Bihun",
            path: "/payroll/production/bihun",
            popoverOptions: [
              {
                name: "Bihun Option 1",
                path: "/payroll/production/bihun/option1",
              },
              {
                name: "Bihun Option 2",
                path: "/payroll/production/bihun/option2",
              },
            ],
          },
        ],
      },
      {
        name: "Pinjam",
        icon: IconInvoice,
        subItems: [
          { name: "Entry", path: "/payroll/pinjam/entry" },
          {
            name: "Summary",
            path: "/payroll/pinjam/summary",
          },
        ],
      },
    ],
  },
  {
    name: "Stock",
    icon: IconPackage,
    subItems: [
      { name: "Opening", path: "/stock/opening" },
      { name: "Card", path: "/stock/card" },
    ],
  },
  {
    name: "Statement",
    icon: IconFileInvoice,
    subItems: [
      {
        name: "e-Invois",
        path: "/statement/e-invois",
        component: CatalogueStaffPage,
      },
    ],
    defaultOpen: true,
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
            apiEndpoint="agamas"
            tableKey="catalogueAgama"
          />
        ),
      },
    ],
    defaultOpen: true,
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
