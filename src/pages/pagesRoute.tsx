import React from "react";
import { Icon } from "@tabler/icons-react";
import { Company } from "../contexts/CompanyContext";
import { TienHockSidebarData } from "./TienHockSidebarData";
import { JellyPollySidebarData } from "./JellyPollySidebarData";
import { GreenTargetSidebarData } from "./GreenTargetSidebarData";

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
  showInPopover?: boolean;
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
