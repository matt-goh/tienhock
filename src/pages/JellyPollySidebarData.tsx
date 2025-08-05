import {
  IconFileInvoice,
  IconReportMoney,
  IconBookmark,
} from "@tabler/icons-react";
import { SidebarItem } from "./pagesRoute";

// Invoice related imports
import InvoiceListPage from "./JellyPolly/InvoiceListPage";
import InvoiceFormPage from "./JellyPolly/InvoiceFormPage";
import InvoiceDetailsPage from "./JellyPolly/InvoiceDetailsPage";

// Sales related imports
import SalesSummaryPage from "./Sales/SalesSummaryPage";
import PaymentPage from "./JellyPolly/PaymentPage";

// Accounting related imports (to be created)
import DebtorsReportPage from "./JellyPolly/DebtorsReportPage";

export const JellyPollySidebarData: SidebarItem[] = [
  {
    name: "Bookmarks",
    icon: IconBookmark,
    subItems: [],
    defaultOpen: true,
  },
  {
    name: "Accounting",
    icon: IconReportMoney,
    subItems: [
      {
        name: "Debtors",
        path: "/sales/debtors",
        component: DebtorsReportPage,
      },
    ],
  },
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
            showInPopover: true,
          },
          // Route for viewing an existing invoice
          {
            name: "Invoice Details",
            path: "/sales/invoice/:id",
            component: InvoiceDetailsPage,
          },
        ],
      },
      {
        name: "Sales Summary",
        path: "/sales/summary",
        component: SalesSummaryPage,
      },
      {
        name: "Payments",
        path: "/sales/payments",
        component: PaymentPage,
      },
    ],
    defaultOpen: true,
  },
];
