// src/pages/JellyPollyNavData.tsx
import {
  IconFileInvoice,
  IconReportMoney,
} from "@tabler/icons-react";
import { SidebarItem } from "./pagesRoute";

// Invoice related imports
import InvoiceListPage from "./JellyPolly/InvoiceListPage";
import InvoiceFormPage from "./JellyPolly/InvoiceFormPage";
import InvoiceDetailsPage from "./JellyPolly/InvoiceDetailsPage";

// Sales related imports
import JellyPollySalesSummaryPage from "./Sales/JellyPollySalesSummaryPage";
import PaymentPage from "./JellyPolly/PaymentPage";

// Adjustment Documents (Credit / Debit / Refund Notes)
import JPAdjustmentDocsListPage from "./JellyPolly/AdjustmentDocs/JPAdjustmentDocsListPage";
import JPAdjustmentDocsFormPage from "./JellyPolly/AdjustmentDocs/JPAdjustmentDocsFormPage";
import JPAdjustmentDocsDetailsPage from "./JellyPolly/AdjustmentDocs/JPAdjustmentDocsDetailsPage";

// Accounting related imports (to be created)
import DebtorsReportPage from "./JellyPolly/DebtorsReportPage";

export const JellyPollyNavData: SidebarItem[] = [
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
        component: JellyPollySalesSummaryPage,
      },
      {
        name: "Payments",
        path: "/sales/payments",
        component: PaymentPage,
      },
      {
        name: "Adjustment Documents",
        path: "/sales/adjustment-docs",
        component: JPAdjustmentDocsListPage,
        subItems: [
          {
            name: "New Adjustment Document",
            path: "/sales/adjustment-docs/new",
            component: JPAdjustmentDocsFormPage,
            showInPopover: true,
          },
          {
            name: "Adjustment Document Details",
            path: "/sales/adjustment-docs/:id",
            component: JPAdjustmentDocsDetailsPage,
          },
        ],
      },
    ],
    defaultOpen: true,
  },
];
