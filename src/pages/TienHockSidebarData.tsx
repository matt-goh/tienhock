//src/pages/TienHockSidebarData.tsx
import {
  IconBookmark,
  IconFileInvoice,
  IconListDetails,
  IconUserDollar,
  IconCalendarEvent,
  IconCalculator,
  IconCash,
} from "@tabler/icons-react";
import { SidebarItem } from "./pagesRoute";
import { JOB_CONFIGS } from "../configs/payrollJobConfigs";

// Invoice related imports
import InvoiceListPage from "./Invoice/InvoiceListPage";
import InvoiceFormPage from "./Invoice/InvoiceFormPage";
import InvoiceDetailsPage from "./Invoice/InvoiceDetailsPage";

// Sales related imports
import SalesSummaryPage from "./Sales/SalesSummaryPage";

// Payroll related imports
import DailyLogListPage from "./Payroll/DailyLogListPage";
import DailyLogEntryPage from "./Payroll/DailyLogEntryPage";
import DailyLogDetailsPage from "./Payroll/DailyLogDetailsPage";
import DailyLogEditPage from "./Payroll/DailyLogEditPage";
import HolidayCalendarPage from "./Payroll/HolidayCalendarPage";
import ContributionRatesPage from "./Payroll/ContributionRatesPage";
import MonthlyPayrollsPage from "./Payroll/MonthlyPayrollsPage";
import MonthlyPayrollDetailsPage from "./Payroll/MonthlyPayrollDetailsPage";
import PayrollProcessingPage from "./Payroll/PayrollProcessingPage";
import EmployeePayrollDetailsPage from "./Payroll/EmployeePayrollDetailsPage";
import MidMonthPayrollPage from "./Payroll/MidMonthPayrollPage";

// Catalogue related imports
// Staff
import StaffPage from "./Catalogue/StaffPage";
import StaffAddPage from "./Catalogue/StaffAddPage";
import StaffFormPage from "./Catalogue/StaffFormPage";

// Customer
import CustomerPage from "./Catalogue/CustomerPage";
import CustomerAddPage from "./Catalogue/CustomerAddPage";
import CustomerFormPage from "./Catalogue/CustomerFormPage";

// Other catalogues
import PayCodePage from "./Catalogue/PayCodePage";
import ProductPage from "./Catalogue/ProductPage";
import JobPage from "./Catalogue/JobPage";
import JobCategoryPage from "./Catalogue/JobCategoryPage";
import TaxPage from "./Catalogue/TaxPage";
import BasicPage from "./Catalogue/BasicPage";

// Function to generate payroll subitems for each job type
const generatePayrollSubItems = (): SidebarItem[] => {
  const payrollSubItems: SidebarItem[] = [];

  // Add each production type dynamically
  Object.values(JOB_CONFIGS).forEach((jobConfig) => {
    const jobTypeLower = jobConfig.id.toLowerCase();

    payrollSubItems.push({
      name: jobConfig.name,
      path: `/payroll/${jobTypeLower}-production`,
      component: (props: any) => (
        <DailyLogListPage jobType={jobConfig.id} {...props} />
      ),
      subItems: [
        {
          name: `New ${jobConfig.name} Entry`,
          path: `/payroll/${jobTypeLower}-entry`,
          component: (props: any) => (
            <DailyLogEntryPage jobType={jobConfig.id} {...props} />
          ),
          showInPopover: true,
        },
        {
          name: "View Log",
          path: `/payroll/${jobTypeLower}-production/:id`,
          component: (props: any) => (
            <DailyLogDetailsPage jobType={jobConfig.id} {...props} />
          ),
        },
        {
          name: "Edit Log",
          path: `/payroll/${jobTypeLower}-production/:id/edit`,
          component: (props: any) => (
            <DailyLogEditPage jobType={jobConfig.id} {...props} />
          ),
        },
      ],
    });
  });

  // Add Monthly Payrolls
  payrollSubItems.push({
    name: "Monthly Payrolls",
    path: "/payroll/monthly-payrolls",
    component: MonthlyPayrollsPage,
    subItems: [
      {
        name: "Payroll List",
        path: "/payroll/monthly-payrolls/list",
        component: MonthlyPayrollsPage,
      },
      {
        name: "Payroll Details",
        path: "/payroll/monthly-payrolls/:id",
        component: MonthlyPayrollDetailsPage,
      },
      {
        name: "Process Payroll",
        path: "/payroll/monthly-payrolls/:id/process",
        component: PayrollProcessingPage,
      },
      {
        name: "Employee Payroll Details",
        path: "/payroll/employee-payroll/:id",
        component: EmployeePayrollDetailsPage,
      },
    ],
  });

  payrollSubItems.push({
    name: "Mid-month Pay",
    path: "/payroll/mid-month-payrolls",
    component: MidMonthPayrollPage,
    icon: IconCash,
  });

  // Add Holiday Calendar at the end
  payrollSubItems.push({
    name: "Holiday Calendar",
    path: "/payroll/holiday-calendar",
    component: HolidayCalendarPage,
    icon: IconCalendarEvent,
  });

  payrollSubItems.push({
    name: "Contribution Rates",
    path: "/payroll/contribution-rates",
    component: ContributionRatesPage,
    icon: IconCalculator,
  });

  return payrollSubItems;
};

export const TienHockSidebarData: SidebarItem[] = [
  {
    name: "Bookmarks",
    icon: IconBookmark,
    subItems: [],
    defaultOpen: true,
  },
  {
    name: "Payroll",
    icon: IconUserDollar,
    subItems: generatePayrollSubItems(),
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
    ],
  },
  {
    name: "Catalogue",
    icon: IconListDetails,
    subItems: [
      {
        name: "Staff",
        path: "/catalogue/staff",
        component: StaffPage,
        subItems: [
          {
            name: "New Staff",
            path: "/catalogue/staff/new",
            component: StaffAddPage,
            showInPopover: true,
          },
          {
            name: "Staff Edit",
            path: "/catalogue/staff/:id",
            component: StaffFormPage,
          },
        ],
      },
      {
        name: "Customer",
        path: "/catalogue/customer",
        component: CustomerPage,
        subItems: [
          {
            name: "New Customer",
            path: "/catalogue/customer/new",
            component: CustomerAddPage,
            showInPopover: true,
          },
          {
            name: "Staff Edit",
            path: "/catalogue/customer/:id",
            component: CustomerFormPage,
          },
        ],
      },
      {
        name: "Product",
        path: "/catalogue/product",
        component: ProductPage,
      },
      {
        name: "Job",
        path: "/catalogue/job",
        component: JobPage,
      },
      {
        name: "Pay Codes",
        path: "/catalogue/pay-codes",
        component: PayCodePage,
      },
      {
        name: "Job Category",
        path: "/catalogue/job_category",
        component: JobCategoryPage,
      },
      {
        name: "Section",
        path: "/catalogue/section",
        component: () => (
          <BasicPage
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
          <BasicPage
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
          <BasicPage
            title="Bank Catalogue"
            apiEndpoint="banks"
            tableKey="catalogueBank"
          />
        ),
      },
      {
        name: "Tax",
        path: "/catalogue/tax",
        component: TaxPage,
      },
      {
        name: "Nationality",
        path: "/catalogue/nationality",
        component: () => (
          <BasicPage
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
          <BasicPage
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
          <BasicPage
            title="Agama Catalogue"
            apiEndpoint="agama"
            tableKey="catalogueAgama"
          />
        ),
      },
    ],
  },
];
