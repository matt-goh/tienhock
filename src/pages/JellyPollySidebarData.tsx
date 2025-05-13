import { IconFileInvoice } from "@tabler/icons-react";
import { SidebarItem } from "./pagesRoute";
import InvoiceListPage from "./JellyPolly/InvoiceListPage";
import InvoiceFormPage from "./JellyPolly/InvoiceFormPage";
import InvoiceDetailsPage from "./JellyPolly/InvoiceDetailsPage";

export const JellyPollySidebarData: SidebarItem[] = [
  {
    name: "Sales",
    icon: IconFileInvoice,
    subItems: [
      {
        name: "Invoice",
        path: "/sales/invoice",
        component: InvoiceListPage,
        subItems: [
          // Route for creating a new invoice
          {
            name: "Create New Invoice",
            path: "/sales/invoice/new",
            component: InvoiceFormPage,
          },
          // Route for viewing an existing invoice
          {
            name: "Invoice Details",
            path: "/sales/invoice/:id",
            component: InvoiceDetailsPage,
          },
        ],
      },
    ],
    defaultOpen: true,
  },
];
