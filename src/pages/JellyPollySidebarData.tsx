import { IconFileInvoice } from "@tabler/icons-react";
import { SidebarItem } from "./pagesRoute";

import InvoicePage from "./Invoice/InvoicePage";
import InvoiceDetailsPage from "./Invoice/InvoiceDetailsPage";

export const JellyPollySidebarData: SidebarItem[] = [
  {
    name: "Sales",
    icon: IconFileInvoice,
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
            name: "Create New Invoice Page",
            path: "/sales/invoice/create",
            component: InvoiceDetailsPage,
          },
        ],
      },
    ],
  },
];
