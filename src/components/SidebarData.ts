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

export interface PopoverOption {
  name: string;
  link: string;
}

export interface SidebarItem {
  name: string;
  icon?: Icon;
  link?: string;
  subItems?: SidebarItem[];
  popoverOptions?: PopoverOption[];
  defaultOpen?: boolean;
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
            link: "/payroll/production/mee",
            popoverOptions: [
              { name: "Mee Option 1", link: "#" },
              { name: "Mee Option 2", link: "#" },
            ],
          },
          {
            name: "Bihun",
            link: "/payroll/production/bihun",
            popoverOptions: [
              { name: "Bihun Option 1", link: "#" },
              { name: "Bihun Option 2", link: "#" },
            ],
          },
        ],
      },
      {
        name: "Pinjam",
        icon: IconInvoice,
        subItems: [
          { name: "Entry", link: "/payroll/pinjam/entry" },
          {
            name: "Summary",
            link: "/payroll/pinjam/summary",
          },
        ],
      },
    ],
  },
  {
    name: "Stock",
    icon: IconPackage,
    subItems: [
      { name: "Opening", link: "/stock/opening" },
      { name: "Card", link: "/stock/card" },
    ],
  },
  {
    name: "Statement",
    icon: IconFileInvoice,
    subItems: [
      { name: "Option 1", link: "/statement/option1" },
      { name: "Option 2", link: "/statement/option2" },
    ],
  },
  {
    name: "Catalogue",
    icon: IconListDetails,
    subItems: [
      { name: "Staff", link: "/catalogue/staff" },
      { name: "Job", link: "/catalogue/job" },
      { name: "Job Category", link: "/catalogue/job_category" },
      { name: "Section", link: "/catalogue/section" },
      { name: "Location", link: "/catalogue/location" },
      { name: "Bank", link: "/catalogue/bank" },
      { name: "Tax", link: "/catalogue/tax" },
      {
        name: "Nationality",
        icon: IconListDetails,
        link: "/catalogue/nationality",
      },
      { name: "Race", link: "/catalogue/race" },
      { name: "Agama", link: "/catalogue/agama" },
    ],
    defaultOpen: true,
  },
];