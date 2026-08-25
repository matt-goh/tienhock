// src/routes/index.js

// Auth routes
import authRouter from "./auth/auth.js";
import sessionsRouter from "./auth/sessions.js";
import { authMiddleware } from "../middleware/auth.js";

// Admin routes
import backupRouter from "./admin/backup.js";

// User routes
import bookmarksRouter from "./user/bookmarks.js";
import accountCodeFavouritesRouter from "./user/account-code-favourites.js";

// Catalogue routes
import customerValidationRouter from "./catalogue/customer-validation.js";
import employeePayCodesRouter from "./catalogue/employee-pay-codes.js";
import customerProductsRouter from "./catalogue/customer-products.js";
import customerBranchesRouter from "./catalogue/customer-branches.js";
import jobCategoriesRouter from "./catalogue/job-categories.js";
import staffOptionsRouter from "./catalogue/staff-options.js";
import jobPayCodesRouter from "./catalogue/job-pay-codes.js";
import jobLocationMappingsRouter from "./catalogue/job-location-mappings.js";
import productPayCodesRouter from "./catalogue/product-pay-codes.js";
import salesmanIkutPayCodesRouter from "./catalogue/salesman-ikut-pay-codes.js";
import jobDetailsRouter from "./catalogue/job-details.js";
import customerRouter from "./catalogue/customers.js";
import payCodesRouter from "./catalogue/pay-codes.js";
import payRateSchedulesRouter from "./catalogue/pay-rate-schedules.js";
import productRouter from "./catalogue/products.js";
import staffRouter from "./catalogue/staffs.js";
import taxRouter from "./catalogue/taxes.js";
import jobRouter from "./catalogue/jobs.js";

// Catalogue - Entity routes
import nationalitiesRouter from "./catalogue/entities/nationalities.js";
import locationsRouter from "./catalogue/entities/locations.js";
import sectionsRouter from "./catalogue/entities/sections.js";
import departmentsRouter from "./catalogue/entities/departments.js";
import banksRouter from "./catalogue/entities/banks.js";
import racesRouter from "./catalogue/entities/races.js";
import agamaRouter from "./catalogue/entities/agama.js";

// Accounting routes
import debtorsRouter from "./accounting/debtors.js";
import accountCodesRouter from "./accounting/account-codes.js";
import ledgerTypesRouter from "./accounting/ledger-types.js";
import journalEntriesRouter from "./accounting/journal-entries.js";
import journalVouchersRouter from "./accounting/journal-vouchers.js";
import financialReportsRouter from "./accounting/financial-reports.js";
import bankStatementRouter from "./accounting/bank-statement.js";
import auditExportsRouter from "./accounting/audit-exports.js";
import openingBalancesRouter from "./accounting/opening-balances.js";
import materialsRouter from "./accounting/materials.js";
import suppliersRouter from "./accounting/suppliers.js";
import purchaseInvoicesRouter from "./accounting/purchase-invoices.js";
import selfBilledInvoicesRouter from "./accounting/self-billed-invoices.js";
import supplierPaymentsRouter from "./accounting/supplier-payments.js";
import bankInsRouter from "./accounting/bank-ins.js";

// Sales routes
import invoiceRouter from "./sales/invoices/invoices.js";
import paymentsRouter from "./sales/invoices/payments.js";
import receiptsRouter from "./sales/receipts.js";
import eInvoiceRouter from "./sales/invoices/e-invoices.js";
import adjustmentDocsRouter from "./sales/adjustment-docs/index.js";

// Payroll routes
import dailyWorkLogsRouter from "./payroll/daily-work-logs.js";
import monthlyWorkLogsRouter from "./payroll/monthly-work-logs.js";
import holidaysRouter from "./payroll/holidays.js";
import monthlyPayrollsRouter from "./payroll/monthly-payrolls.js";
import leaveManagementRoutes from "./payroll/leave-management.js";
import incentivesRoutes from "./payroll/incentives.js";
import othersRecordsRouter from "./payroll/others-records.js";
import employeePayrollsRouter from "./payroll/employee-payrolls.js";
import contributionRatesRouter from "./payroll/contribution-rates.js";
import midMonthPayrollsRouter from "./payroll/mid-month-payrolls.js";
import pinjamRecordsRouter from "./payroll/pinjam-records.js";
import salaryReportRouter from "./payroll/salary-report.js";
import eCarumanRouter from "./payroll/e-caruman.js";
import cp8dRouter from "./payroll/cp8d.js";

// Stock routes
import productionEntriesRouter from "./stock/production-entries.js";
import stockRouter from "./stock/stock.js";
import estimatedReportRouter from "./stock/estimated-report.js";

// Green Target routes
import greenTargetCustomerRouter from "./greentarget/customers.js";
import greenTargetLocationRouter from "./greentarget/locations.js";
import greenTargetDumpsterRouter from "./greentarget/dumpsters.js";
import greenTargetRentalRouter from "./greentarget/rentals.js";
import greenTargetInvoiceRouter from "./greentarget/invoices.js";
import greenTargetEInvoiceRouter from "./greentarget/einvoice.js";
import greenTargetPaymentRouter from "./greentarget/payments.js";
import greenTargetSalesReportRouter from "./greentarget/sales-report.js";
import greenTargetDashboardRouter from "./greentarget/dashboard.js";
import greenTargetPayrollEmployeesRouter from "./greentarget/payroll-employees.js";
import greenTargetEmployeePayCodesRouter from "./greentarget/employee-pay-codes.js";
import greenTargetMonthlyPayrollsRouter from "./greentarget/monthly-payrolls.js";
import greenTargetMonthlyWorkLogsRouter from "./greentarget/monthly-work-logs.js";
import greenTargetEmployeePayrollsRouter from "./greentarget/employee-payrolls.js";
import greenTargetPickupDestinationsRouter from "./greentarget/pickup-destinations.js";
import greenTargetPayrollRulesRouter from "./greentarget/payroll-rules.js";
import greenTargetPinjamRecordsRouter from "./greentarget/pinjam-records.js";
import greenTargetMidMonthPayrollsRouter from "./greentarget/mid-month-payrolls.js";
import greenTargetAdjustmentDocsRouter from "./greentarget/adjustment-docs.js";
import greenTargetIncentivesRouter from "./greentarget/incentives.js";
import greenTargetOthersRecordsRouter from "./greentarget/others-records.js";
import greenTargetDailyLoriHabukRouter from "./greentarget/daily-lori-habuk.js";
import greenTargetSalaryReportRouter from "./greentarget/salary-report.js";
import greenTargetLeaveManagementRouter from "./greentarget/leave-management.js";
import greenTargetECarumanRouter from "./greentarget/e-caruman.js";
import greenTargetCp8dRouter from "./greentarget/cp8d.js";
import greenTargetCustomerSignupsRouter from "./greentarget/customer-signups.js";
import greenTargetFinancialReportsRouter from "./greentarget/accounting/financial-reports.js";
import greenTargetAccountLedgerRouter from "./greentarget/accounting/account-ledger.js";
import greenTargetOpeningBalancesRouter from "./greentarget/accounting/opening-balances.js";
import greenTargetJournalEntriesRouter from "./greentarget/accounting/journal-entries.js";
import createGreenTargetAccountCodesRouter, {
  createGreenTargetLedgerTypesRouter,
} from "./greentarget/accounting/account-codes.js";
import createGreenTargetDebtorsRouter from "./greentarget/accounting/debtors.js";
import greenTargetJournalVouchersRouter from "./greentarget/accounting/journal-vouchers.js";

// Jellypolly routes
import jellypollyInvoiceRouter from "./jellypolly/invoices.js";
import jellypollyPaymentRouter from "./jellypolly/payments.js";
import jellypollyEInvoiceRouter from "./jellypolly/e-invoices.js";
import jellypollyDebtorsRouter from "./jellypolly/debtors.js";
import jellypollyAccountLedgerRouter from "./jellypolly/account-ledger.js";
import jellypollyAdjustmentDocsRouter from "./jellypolly/adjustment-docs.js";
import jellypollyMonthlyPayrollsRouter from "./jellypolly/monthly-payrolls.js";
import jellypollyEmployeePayrollsRouter from "./jellypolly/employee-payrolls.js";
import jellypollyMonthlyWorkLogsRouter from "./jellypolly/monthly-work-logs.js";
import jellypollyDailyWorkLogsRouter from "./jellypolly/daily-work-logs.js";
import jellypollyDailyPlasticRouter from "./jellypolly/daily-plastic.js";
import jellypollyPinjamRecordsRouter from "./jellypolly/pinjam-records.js";
import jellypollyMidMonthPayrollsRouter from "./jellypolly/mid-month-payrolls.js";
import jellypollyIncentivesRouter from "./jellypolly/incentives.js";
import jellypollyOthersRecordsRouter from "./jellypolly/others-records.js";
import jellypollySalaryReportRouter from "./jellypolly/salary-report.js";
import jellypollyECarumanRouter from "./jellypolly/e-caruman.js";
import jellypollyCp8dRouter from "./jellypolly/cp8d.js";
import jellypollyStaffsRouter from "./jellypolly/staffs.js";
import jellypollyJobsRouter from "./jellypolly/jobs.js";
import jellypollyPayCodesRouter from "./jellypolly/pay-codes.js";
import jellypollyJobPayCodesRouter from "./jellypolly/job-pay-codes.js";
import jellypollyEmployeePayCodesRouter from "./jellypolly/employee-pay-codes.js";
import jellypollyPayRateSchedulesRouter from "./jellypolly/pay-rate-schedules.js";
import jellypollyProductPayCodesRouter from "./jellypolly/product-pay-codes.js";
import jellypollyLeaveManagementRouter from "./jellypolly/leave-management.js";
import jellypollyProductionEntriesRouter from "./jellypolly/production-entries.js";
import jellypollyLocationsRouter from "./jellypolly/locations.js";
import jellypollyJobLocationMappingsRouter from "./jellypolly/job-location-mappings.js";

// Excel routes
import paymentExportRouter from "./excel/payment-export.js";
import companyPaymentExportRouter from "./excel/company-payment-export.js";
import staffRecordsExportRouter from "./excel/staff-records-export.js";

import {
  MYINVOIS_API_BASE_URL,
  MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET,
  MYINVOIS_GT_CLIENT_ID,
  MYINVOIS_GT_CLIENT_SECRET,
  MYINVOIS_JP_CLIENT_ID,
  MYINVOIS_JP_CLIENT_SECRET,
} from "../configs/config.js";

const checkRestoreState = (req, res, next) => {
  // Skip restore check for backup-related endpoints
  if (req.path.startsWith("/api/backup/")) {
    return next();
  }

  if (req.app.locals.isRestoringDatabase) {
    return res.status(503).json({
      error: "Service temporarily unavailable",
      code: "57P01",
      message: "Database restore in progress",
    });
  }
  next();
};

export default function setupRoutes(app, pool) {
  // MyInvois API Configuration
  const myInvoisConfig = {
    MYINVOIS_API_BASE_URL,
    MYINVOIS_CLIENT_ID,
    MYINVOIS_CLIENT_SECRET,
  };
  const myInvoisGTConfig = {
    MYINVOIS_API_BASE_URL,
    MYINVOIS_GT_CLIENT_ID,
    MYINVOIS_GT_CLIENT_SECRET,
  };
  const myInvoisJPConfig = {
    MYINVOIS_API_BASE_URL,
    MYINVOIS_JP_CLIENT_ID,
    MYINVOIS_JP_CLIENT_SECRET,
  };

  // Auth routes
  app.use("/api/auth", authRouter(pool));

  // Excel routes (before auth middleware - has its own API key auth)
  app.use("/api/excel/payment-export", paymentExportRouter(pool));
  app.use(
    "/jellypolly/api/excel/payment-export",
    companyPaymentExportRouter(pool, {
      payrollSchema: "jellypolly",
      staffSchema: "jellypolly",
    })
  );
  app.use(
    "/greentarget/api/excel/payment-export",
    companyPaymentExportRouter(pool, {
      payrollSchema: "greentarget",
      staffSchema: "public",
    })
  );
  app.use("/api/excel/staff-records-export", staffRecordsExportRouter(pool));

  // Add auth middleware to protect other routes
  app.use("/api", authMiddleware(pool));
  app.use("/api", checkRestoreState);
  app.use("/api/sessions", sessionsRouter(pool));

  // Admin routes
  app.use("/api/backup", backupRouter(pool));

  // User routes
  app.use("/api/bookmarks", bookmarksRouter(pool));
  app.use(
    "/api/account-code-favourites",
    accountCodeFavouritesRouter(pool)
  );

  // Accounting routes
  app.use("/api/debtors", debtorsRouter(pool));
  app.use("/api/account-codes", accountCodesRouter(pool));
  app.use("/api/ledger-types", ledgerTypesRouter(pool));
  app.use("/api/journal-entries", journalEntriesRouter(pool));
  app.use("/api/journal-vouchers", journalVouchersRouter(pool));
  app.use("/api/financial-reports", financialReportsRouter(pool));
  app.use("/api/bank-statement", bankStatementRouter(pool));
  app.use("/api/audit-exports", auditExportsRouter(pool));
  app.use("/api/opening-balances", openingBalancesRouter(pool));
  app.use("/api/materials", materialsRouter(pool));
  app.use("/api/suppliers", suppliersRouter(pool));
  app.use("/api/purchase-invoices", purchaseInvoicesRouter(pool));
  app.use(
    "/api/general-purchases",
    selfBilledInvoicesRouter(pool, myInvoisConfig)
  );
  app.use(
    "/api/self-billed-invoices",
    selfBilledInvoicesRouter(pool, myInvoisConfig)
  );
  app.use("/api/supplier-payments", supplierPaymentsRouter(pool));

  // Sales routes
  app.use("/api/invoices", invoiceRouter(pool, myInvoisConfig));
  app.use("/api/payments", paymentsRouter(pool));
  app.use("/api/receipts", receiptsRouter(pool));
  app.use("/api/bank-ins", bankInsRouter(pool));
  app.use("/api/einvoice", eInvoiceRouter(pool, myInvoisConfig));
  app.use("/api/adjustment-docs", adjustmentDocsRouter(pool, myInvoisConfig));

  // Payroll routes
  app.use("/api/daily-work-logs", dailyWorkLogsRouter(pool));
  app.use("/api/monthly-work-logs", monthlyWorkLogsRouter(pool));
  app.use("/api/holidays", holidaysRouter(pool));
  app.use("/api/monthly-payrolls", monthlyPayrollsRouter(pool));
  app.use("/api/employee-payrolls", employeePayrollsRouter(pool));
  app.use("/api/leave-management", leaveManagementRoutes(pool));
  app.use("/api/incentives", incentivesRoutes(pool));
  app.use("/api/others-records", othersRecordsRouter(pool));
  app.use("/api/contribution-rates", contributionRatesRouter(pool));
  app.use("/api/mid-month-payrolls", midMonthPayrollsRouter(pool));
  app.use("/api/pinjam-records", pinjamRecordsRouter(pool));
  app.use("/api/salary-report", salaryReportRouter(pool));
  app.use("/api/e-caruman", eCarumanRouter(pool));
  app.use("/api/cp8d", cp8dRouter(pool));

  // Stock routes
  app.use("/api/production-entries", productionEntriesRouter(pool));
  app.use("/api/stock", stockRouter(pool));
  app.use("/api/estimated-report", estimatedReportRouter(pool));

  // Green Target routes
  app.use(
    "/greentarget/api/dashboard",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetDashboardRouter(pool)
  );
  app.use(
    "/greentarget/api/customers",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetCustomerRouter(pool)
  );
  app.use(
    "/greentarget/api/locations",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetLocationRouter(pool)
  );
  app.use(
    "/greentarget/api/dumpsters",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetDumpsterRouter(pool)
  );
  app.use(
    "/greentarget/api/rentals",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetRentalRouter(pool)
  );
  app.use(
    "/greentarget/api/invoices",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetInvoiceRouter(pool, myInvoisGTConfig)
  );
  app.use(
    "/greentarget/api/payments",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetPaymentRouter(pool)
  );
  app.use(
    "/greentarget/api/sales-report",
    authMiddleware(pool),
    greenTargetSalesReportRouter(pool)
  );
  app.use(
    "/greentarget/api/einvoice",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetEInvoiceRouter(pool, myInvoisGTConfig)
  );
  app.use(
    "/greentarget/api/payroll-employees",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetPayrollEmployeesRouter(pool)
  );
  app.use(
    "/greentarget/api/employee-pay-codes",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetEmployeePayCodesRouter(pool)
  );
  app.use(
    "/greentarget/api/monthly-payrolls",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetMonthlyPayrollsRouter(pool)
  );
  app.use(
    "/greentarget/api/monthly-work-logs",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetMonthlyWorkLogsRouter(pool)
  );
  app.use(
    "/greentarget/api/employee-payrolls",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetEmployeePayrollsRouter(pool)
  );
  app.use(
    "/greentarget/api/pickup-destinations",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetPickupDestinationsRouter(pool)
  );
  app.use(
    "/greentarget/api/payroll-rules",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetPayrollRulesRouter(pool)
  );
  app.use(
    "/greentarget/api/pinjam-records",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetPinjamRecordsRouter(pool)
  );
  app.use(
    "/greentarget/api/mid-month-payrolls",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetMidMonthPayrollsRouter(pool)
  );
  app.use(
    "/greentarget/api/adjustment-docs",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetAdjustmentDocsRouter(pool, myInvoisGTConfig)
  );
  app.use(
    "/greentarget/api/incentives",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetIncentivesRouter(pool)
  );
  app.use(
    "/greentarget/api/others-records",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetOthersRecordsRouter(pool)
  );
  app.use(
    "/greentarget/api/daily-lori-habuk",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetDailyLoriHabukRouter(pool)
  );
  app.use(
    "/greentarget/api/salary-report",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetSalaryReportRouter(pool)
  );
  app.use(
    "/greentarget/api/leave-management",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetLeaveManagementRouter(pool)
  );
  app.use(
    "/greentarget/api/e-caruman",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetECarumanRouter(pool)
  );
  app.use(
    "/greentarget/api/cp8d",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetCp8dRouter(pool)
  );
  app.use(
    "/greentarget/api/customer-signups",
    greenTargetCustomerSignupsRouter(pool, myInvoisGTConfig)
  );
  // Green Target accounting reports (G5). Read-only over the `greentarget`
  // schema; "bank-statement" mirrors Tien Hock's path so the shared Account
  // Ledger page only needs a base-path swap (handover R7). Session auth like
  // every other accounting route; no restore guard needed for reads.
  app.use(
    "/greentarget/api/financial-reports",
    authMiddleware(pool),
    greenTargetFinancialReportsRouter(pool)
  );
  app.use(
    "/greentarget/api/bank-statement",
    authMiddleware(pool),
    greenTargetAccountLedgerRouter(pool)
  );
  // Green Target opening-balance anchors: mutates the GT books, so it sits
  // behind the same session auth + restore guard as the other GT accounting
  // mutations. Path mirrors Tien Hock's so the shared pages swap base path
  // only; every query is schema-qualified to `greentarget`.
  app.use(
    "/greentarget/api/opening-balances",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetOpeningBalancesRouter(pool)
  );
  // Green Target accounting lookups (G6) and mutations (G7+). Same
  // `greentarget` schema isolation; paths mirror Tien Hock's so the shared
  // pages swap base path only. Since G7 this router also MUTATES the GT
  // books, so it sits behind the same session auth + restore guard TH gets
  // (the JP account-ledger mount is the per-route precedent). The shared
  // frontend api helper already sends x-session-id on every request.
  app.use(
    "/greentarget/api/journal-entries",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetJournalEntriesRouter(pool)
  );
  app.use(
    "/greentarget/api/account-codes",
    authMiddleware(pool),
    checkRestoreState,
    createGreenTargetAccountCodesRouter(pool)
  );
  app.use(
    "/greentarget/api/ledger-types",
    authMiddleware(pool),
    checkRestoreState,
    createGreenTargetLedgerTypesRouter(pool)
  );
  app.use(
    "/greentarget/api/debtors",
    authMiddleware(pool),
    createGreenTargetDebtorsRouter(pool)
  );
  // GT salary Voucher Generator (JBSL/JWDR). Mutates the GT books, so it sits
  // behind the same session auth + restore guard as the journal-entries mount.
  app.use(
    "/greentarget/api/journal-vouchers",
    authMiddleware(pool),
    checkRestoreState,
    greenTargetJournalVouchersRouter(pool)
  );

  // Jellypolly routes
  app.use(
    "/jellypolly/api/invoices",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyInvoiceRouter(pool, myInvoisJPConfig)
  );
  app.use(
    "/jellypolly/api/payments",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyPaymentRouter(pool)
  );
  app.use(
    "/jellypolly/api/einvoice",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyEInvoiceRouter(pool, myInvoisJPConfig)
  );
  app.use(
    "/jellypolly/api/debtors",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyDebtorsRouter(pool)
  );
  app.use(
    "/jellypolly/api/account-ledger",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyAccountLedgerRouter(pool)
  );
  app.use(
    "/jellypolly/api/adjustment-docs",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyAdjustmentDocsRouter(pool, myInvoisJPConfig)
  );
  app.use(
    "/jellypolly/api/monthly-payrolls",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyMonthlyPayrollsRouter(pool)
  );
  app.use(
    "/jellypolly/api/employee-payrolls",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyEmployeePayrollsRouter(pool)
  );
  app.use(
    "/jellypolly/api/monthly-work-logs",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyMonthlyWorkLogsRouter(pool)
  );
  app.use(
    "/jellypolly/api/daily-work-logs",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyDailyWorkLogsRouter(pool)
  );
  app.use(
    "/jellypolly/api/daily-plastic",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyDailyPlasticRouter(pool)
  );
  app.use(
    "/jellypolly/api/pinjam-records",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyPinjamRecordsRouter(pool)
  );
  app.use(
    "/jellypolly/api/mid-month-payrolls",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyMidMonthPayrollsRouter(pool)
  );
  app.use(
    "/jellypolly/api/incentives",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyIncentivesRouter(pool)
  );
  app.use(
    "/jellypolly/api/others-records",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyOthersRecordsRouter(pool)
  );
  app.use(
    "/jellypolly/api/salary-report",
    authMiddleware(pool),
    checkRestoreState,
    jellypollySalaryReportRouter(pool)
  );
  app.use(
    "/jellypolly/api/e-caruman",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyECarumanRouter(pool)
  );
  app.use(
    "/jellypolly/api/cp8d",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyCp8dRouter(pool)
  );
  app.use(
    "/jellypolly/api/staffs",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyStaffsRouter(pool)
  );
  app.use(
    "/jellypolly/api/jobs",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyJobsRouter(pool)
  );
  app.use(
    "/jellypolly/api/pay-codes",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyPayCodesRouter(pool)
  );
  app.use(
    "/jellypolly/api/job-pay-codes",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyJobPayCodesRouter(pool)
  );
  app.use(
    "/jellypolly/api/locations",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyLocationsRouter(pool)
  );
  app.use(
    "/jellypolly/api/job-location-mappings",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyJobLocationMappingsRouter(pool)
  );
  app.use(
    "/jellypolly/api/employee-pay-codes",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyEmployeePayCodesRouter(pool)
  );
  app.use(
    "/jellypolly/api/pay-rate-schedules",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyPayRateSchedulesRouter(pool)
  );
  app.use(
    "/jellypolly/api/product-pay-codes",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyProductPayCodesRouter(pool)
  );
  app.use(
    "/jellypolly/api/leave-management",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyLeaveManagementRouter(pool)
  );
  app.use(
    "/jellypolly/api/production-entries",
    authMiddleware(pool),
    checkRestoreState,
    jellypollyProductionEntriesRouter(pool)
  );

  // Catalogue - Main routes
  app.use("/api/staffs", staffRouter(pool));
  app.use(
    "/api/customer-validation",
    customerValidationRouter(pool, myInvoisConfig)
  );
  app.use("/api/customers", customerRouter(pool));
  app.use("/api/customer-products", customerProductsRouter(pool));
  app.use("/api/customer-branches", customerBranchesRouter(pool));
  app.use("/api/products", productRouter(pool));
  app.use("/api/taxes", taxRouter(pool));
  app.use("/api/jobs", jobRouter(pool));
  app.use("/api/pay-codes", payCodesRouter(pool));
  app.use("/api/pay-rate-schedules", payRateSchedulesRouter(pool));
  app.use("/api/job-details", jobDetailsRouter(pool));
  app.use("/api/job-pay-codes", jobPayCodesRouter(pool));
  app.use("/api/job-location-mappings", jobLocationMappingsRouter(pool));
  app.use("/api/product-pay-codes", productPayCodesRouter(pool));
  app.use(
    "/api/product-salesman-ikut-pay-codes",
    salesmanIkutPayCodesRouter(pool)
  );
  app.use("/api/job-categories", jobCategoriesRouter(pool));
  app.use("/api/staff-options", staffOptionsRouter(pool));
  app.use("/api/employee-pay-codes", employeePayCodesRouter(pool));

  // Catalogue - Entity routes
  app.use("/api/sections", sectionsRouter(pool));
  app.use("/api/departments", departmentsRouter(pool));
  app.use("/api/locations", locationsRouter(pool));
  app.use("/api/banks", banksRouter(pool));
  app.use("/api/nationalities", nationalitiesRouter(pool));
  app.use("/api/races", racesRouter(pool));
  app.use("/api/agama", agamaRouter(pool));
}
