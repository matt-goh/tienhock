// src/pages/JellyPollyNavData.tsx
import {
  IconFileInvoice,
  IconReportMoney,
  IconUserDollar,
  IconPackage,
  IconListDetails,
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

// Accounting related imports
import DebtorsReportPage from "./JellyPolly/DebtorsReportPage";

// Payroll related imports
import JPStaffAssignmentPage from "./JellyPolly/Payroll/JPStaffAssignmentPage";
import JPPayrollPage from "./JellyPolly/Payroll/JPPayrollPage";
import JPPayrollDetailsPage from "./JellyPolly/Payroll/JPPayrollDetailsPage";
import JPSalaryReportPage from "./JellyPolly/Payroll/JPSalaryReportPage";
import JPECarumanPage from "./JellyPolly/Payroll/JPECarumanPage";
import JPMonthlyLogListPage from "./JellyPolly/Payroll/JPMonthlyLogListPage";
import JPMonthlyLogEntryPage from "./JellyPolly/Payroll/JPMonthlyLogEntryPage";
import JPMonthlyLogDetailsPage from "./JellyPolly/Payroll/JPMonthlyLogDetailsPage";
import JPMonthlyLogEditPage from "./JellyPolly/Payroll/JPMonthlyLogEditPage";
import JPDailyLogListPage from "./JellyPolly/Payroll/JPDailyLogListPage";
import JPDailyLogEntryPage from "./JellyPolly/Payroll/JPDailyLogEntryPage";
import JPDailyLogDetailsPage from "./JellyPolly/Payroll/JPDailyLogDetailsPage";
import JPDailyLogEditPage from "./JellyPolly/Payroll/JPDailyLogEditPage";
import JPDailyLogSalesmanEntryPage from "./JellyPolly/Payroll/JPDailyLogSalesmanEntryPage";
import JPDailyLogSalesmanEditPage from "./JellyPolly/Payroll/JPDailyLogSalesmanEditPage";
import JPDailyPlasticEntryPage from "./JellyPolly/Payroll/JPDailyPlasticEntryPage";
import JPBonusPage from "./JellyPolly/Payroll/JPBonusPage";
import JPOthersAdvancePage from "./JellyPolly/Payroll/JPOthersAdvancePage";
import JPOthersKerjaLuarOtPage from "./JellyPolly/Payroll/JPOthersKerjaLuarOtPage";
import JPPinjamListPage from "./JellyPolly/Payroll/JPPinjamListPage";
import JPMidMonthPayrollPage from "./JellyPolly/Payroll/JPMidMonthPayrollPage";

// Catalogue related imports (JP's own staff/pay-code catalogue)
import JPStaffPage from "./JellyPolly/Catalogue/JPStaffPage";
import JPStaffAddPage from "./JellyPolly/Catalogue/JPStaffAddPage";
import JPStaffFormPage from "./JellyPolly/Catalogue/JPStaffFormPage";
import JPStaffDetailsPage from "./JellyPolly/Catalogue/JPStaffDetailsPage";
import JPPayCodePage from "./JellyPolly/Catalogue/JPPayCodePage";
import JPCutiManagementPage from "./JellyPolly/Catalogue/JPCutiManagementPage";

// Stock / production related imports
import JPProductionEntryPage from "./JellyPolly/Stock/JPProductionEntryPage";
import ProductionListPage from "./Stock/ProductionListPage";
import ProductStockMovementPage from "./Stock/ProductStockMovementPage";
import ProductStockAdjustmentEntryPage from "./Stock/ProductStockAdjustmentEntryPage";

// Monthly (Office / Maintenance) page group generator
const monthlyLogSubItems = (
  jobType: "OFFICE" | "MAINTENANCE",
  name: string
): SidebarItem => {
  const slug = jobType.toLowerCase().replace("_", "-");
  return {
    name,
    path: `/payroll/${slug}-monthly`,
    component: (props: any) => (
      <JPMonthlyLogListPage jobType={jobType} {...props} />
    ),
    group: "Monthly Logs",
    subItems: [
      {
        name: `New ${name} Entry`,
        path: `/payroll/${slug}-monthly-entry`,
        component: (props: any) => (
          <JPMonthlyLogEntryPage jobType={jobType} {...props} />
        ),
        showInPopover: true,
      },
      {
        name: "View Log",
        path: `/payroll/${slug}-monthly/:id`,
        component: (props: any) => (
          <JPMonthlyLogDetailsPage jobType={jobType} {...props} />
        ),
      },
      {
        name: "Edit Log",
        path: `/payroll/${slug}-monthly/:id/edit`,
        component: (props: any) => (
          <JPMonthlyLogEditPage jobType={jobType} {...props} />
        ),
      },
    ],
  };
};

// Daily machine page group generator (Ice-Polly / Jelly Cup)
const dailyMachineSubItems = (
  jobType: "ICE_POLLY" | "JELLY_CUP",
  name: string
): SidebarItem => {
  const slug = jobType.toLowerCase().replace("_", "-");
  return {
    name,
    path: `/payroll/${slug}-production`,
    component: (props: any) => (
      <JPDailyLogListPage jobType={jobType} {...props} />
    ),
    group: "Daily Logs",
    subItems: [
      {
        name: `New ${name} Entry`,
        path: `/payroll/${slug}-entry`,
        component: (props: any) => (
          <JPDailyLogEntryPage jobType={jobType} {...props} />
        ),
        showInPopover: true,
      },
      {
        name: "View Log",
        path: `/payroll/${slug}-production/:id`,
        component: (props: any) => (
          <JPDailyLogDetailsPage jobType={jobType} {...props} />
        ),
      },
      {
        name: "Edit Log",
        path: `/payroll/${slug}-production/:id/edit`,
        component: (props: any) => (
          <JPDailyLogEditPage jobType={jobType} {...props} />
        ),
      },
    ],
  };
};

export const JellyPollyNavData: SidebarItem[] = [
  {
    name: "Payroll",
    icon: IconUserDollar,
    subItems: [
      {
        name: "Payrolls",
        path: "/payroll/monthly-payrolls",
        component: JPPayrollPage,
        group: "Payroll",
        subItems: [
          {
            name: "Employee Payroll Details",
            path: "/payroll/details/:id",
            component: JPPayrollDetailsPage,
          },
        ],
      },
      {
        name: "Salary Report",
        path: "/payroll/salary-report",
        component: JPSalaryReportPage,
        group: "Payroll",
      },
      {
        name: "e-Caruman",
        path: "/payroll/e-caruman",
        component: JPECarumanPage,
        group: "Payroll",
      },
      monthlyLogSubItems("OFFICE", "Office"),
      monthlyLogSubItems("MAINTENANCE", "Maintenance"),
      {
        name: "Salesman",
        path: "/payroll/salesman-production",
        component: (props: any) => (
          <JPDailyLogListPage jobType="SALESMAN" {...props} />
        ),
        group: "Daily Logs",
        subItems: [
          {
            name: "New Salesman Entry",
            path: "/payroll/salesman-entry",
            component: (props: any) => (
              <JPDailyLogSalesmanEntryPage {...props} />
            ),
            showInPopover: true,
          },
          {
            name: "View Log",
            path: "/payroll/salesman-production/:id",
            component: (props: any) => (
              <JPDailyLogDetailsPage jobType="SALESMAN" {...props} />
            ),
          },
          {
            name: "Edit Log",
            path: "/payroll/salesman-production/:id/edit",
            component: (props: any) => (
              <JPDailyLogSalesmanEditPage {...props} />
            ),
          },
        ],
      },
      dailyMachineSubItems("ICE_POLLY", "Daily Ice-Polly Machine"),
      dailyMachineSubItems("JELLY_CUP", "Daily Jelly Cup Machine"),
      {
        name: "Daily Machine Plastic",
        path: "/payroll/plastic-entry",
        component: JPDailyPlasticEntryPage,
        group: "Daily Logs",
      },
      {
        name: "Mid-month Pay",
        path: "/payroll/mid-month-payrolls",
        component: JPMidMonthPayrollPage,
        group: "Add-Ons",
      },
      {
        name: "Others (Advance)",
        path: "/payroll/commission",
        component: JPOthersAdvancePage,
        group: "Add-Ons",
      },
      {
        name: "Others (Kerja Luar OT)",
        path: "/payroll/others",
        component: JPOthersKerjaLuarOtPage,
        group: "Add-Ons",
      },
      {
        name: "Bonus",
        path: "/payroll/bonus",
        component: JPBonusPage,
        group: "Add-Ons",
      },
      {
        name: "Pinjam",
        path: "/payroll/pinjam",
        component: JPPinjamListPage,
        group: "Add-Ons",
      },
      {
        name: "Staff Assignment",
        path: "/payroll/staff-assignment",
        component: JPStaffAssignmentPage,
        group: "Setup",
      },
    ],
  },
  {
    name: "Stock",
    icon: IconPackage,
    subItems: [
      {
        name: "Product Stock",
        path: "/stock/movement",
        component: (props: any) => (
          <ProductStockMovementPage productTypes={["JP"]} {...props} />
        ),
        group: "Products",
      },
      {
        name: "Production Records",
        path: "/stock/production-records",
        component: (props: any) => (
          <ProductionListPage
            productTypes={["JP"]}
            apiBasePath="/jellypolly/api/production-entries"
            {...props}
          />
        ),
        group: "Products",
      },
      {
        name: "Production Entry",
        path: "/stock/production",
        component: JPProductionEntryPage,
        group: "Products",
      },
      {
        name: "Product Adjustments",
        path: "/stock/adjustments",
        component: (props: any) => (
          <ProductStockAdjustmentEntryPage productTypes={["JP"]} {...props} />
        ),
        group: "Products",
      },
    ],
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
  {
    name: "Catalogue",
    icon: IconListDetails,
    subItems: [
      {
        name: "Staff",
        path: "/catalogue/staff",
        component: JPStaffPage,
        group: "People",
        subItems: [
          {
            name: "New Staff",
            path: "/catalogue/staff/new",
            component: JPStaffAddPage,
            showInPopover: true,
          },
          {
            name: "Staff Details",
            path: "/catalogue/staff/:id",
            component: JPStaffDetailsPage,
          },
          {
            name: "Staff Edit",
            path: "/catalogue/staff/:id/edit",
            component: JPStaffFormPage,
          },
        ],
      },
      {
        name: "Pay Codes",
        path: "/catalogue/pay-codes",
        component: JPPayCodePage,
        group: "Payroll Setup",
      },
      {
        name: "Cuti Management",
        path: "/catalogue/cuti-management",
        component: JPCutiManagementPage,
        group: "Payroll Setup",
      },
    ],
  },
];
