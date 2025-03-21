import { IconFileInvoice } from "@tabler/icons-react";
import { SidebarItem } from "./pagesRoute";

import InvoicePageJP from "./Invoice/InvoicePageJP";
import InvoiceDetailsPageJP from "./Invoice/InvoiceDetailsPageJP";

export const JellyPollySidebarData: SidebarItem[] = [
  {
    name: "Sales",
    icon: IconFileInvoice,
    subItems: [
      {
        name: "Invoice",
        path: "/sales/invoice",
        component: InvoicePageJP,
        subItems: [
          {
            name: "Invoice Details",
            path: "/sales/invoice/:id",
            component: InvoiceDetailsPageJP,
          },
          {
            name: "Create New Invoice Page",
            path: "/sales/invoice/create",
            component: InvoiceDetailsPageJP,
          },
        ],
      },
    ],
  },
];
