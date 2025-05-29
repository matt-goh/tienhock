// src/routes/index.js

// Auth routes
import authRouter from "./auth/auth.js";
import sessionsRouter from "./auth/sessions.js";
import { authMiddleware } from "../middleware/auth.js";

// Admin routes
import backupRouter from "./admin/backup.js";

// User routes
import sidebarRouter from "./user/sidebar.js";

// Catalogue routes
import customerValidationRouter from "./catalogue/customer-validation.js";
import employeePayCodesRouter from "./catalogue/employee-pay-codes.js";
import customerProductsRouter from "./catalogue/customer-products.js";
import customerBranchesRouter from "./catalogue/customer-branches.js";
import jobCategoriesRouter from "./catalogue/job-categories.js";
import staffOptionsRouter from "./catalogue/staff-options.js";
import jobPayCodesRouter from "./catalogue/job-pay-codes.js";
import jobDetailsRouter from "./catalogue/job-details.js";
import customerRouter from "./catalogue/customers.js";
import payCodesRouter from "./catalogue/pay-codes.js";
import productRouter from "./catalogue/products.js";
import staffRouter from "./catalogue/staffs.js";
import taxRouter from "./catalogue/taxes.js";
import jobRouter from "./catalogue/jobs.js";

// Catalogue - Entity routes
import nationalitiesRouter from "./catalogue/entities/nationalities.js";
import locationsRouter from "./catalogue/entities/locations.js";
import sectionsRouter from "./catalogue/entities/sections.js";
import banksRouter from "./catalogue/entities/banks.js";
import racesRouter from "./catalogue/entities/races.js";
import agamaRouter from "./catalogue/entities/agama.js";

// Sales routes
import invoiceRouter from "./sales/invoices/invoices.js";
import paymentsRouter from "./sales/invoices/payments.js";
import eInvoiceRouter from "./sales/invoices/e-invoices.js";

// Payroll routes
import dailyWorkLogsRouter from "./payroll/daily-work-logs.js";
import holidaysRouter from "./payroll/holidays.js";
import monthlyPayrollsRouter from "./payroll/monthly-payrolls.js";
import employeePayrollsRouter from "./payroll/employee-payrolls.js";
import contributionRatesRouter from "./payroll/contribution-rates.js";
import midMonthPayrollsRouter from "./payroll/mid-month-payrolls.js";

// Green Target routes
import greenTargetCustomerRouter from "./greentarget/customers.js";
import greenTargetLocationRouter from "./greentarget/locations.js";
import greenTargetDumpsterRouter from "./greentarget/dumpsters.js";
import greenTargetRentalRouter from "./greentarget/rentals.js";
import greenTargetInvoiceRouter from "./greentarget/invoices.js";
import greenTargetEInvoiceRouter from "./greentarget/einvoice.js";
import greenTargetPaymentRouter from "./greentarget/payments.js";

// Jellypolly routes
import jellypollyInvoiceRouter from "./jellypolly/invoices.js";
import jellypollyPaymentRouter from "./jellypolly/payments.js";
import jellypollyEInvoiceRouter from "./jellypolly/e-invoices.js";

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

  // Add auth middleware to protect other routes
  app.use("/api", authMiddleware(pool));
  app.use("/api", checkRestoreState);
  app.use("/api/sessions", sessionsRouter(pool));

  // Admin routes
  app.use("/api/backup", backupRouter(pool));

  // User routes
  app.use("/api/bookmarks", sidebarRouter(pool));

  // Sales routes
  app.use("/api/invoices", invoiceRouter(pool, myInvoisConfig));
  app.use("/api/payments", paymentsRouter(pool));
  app.use("/api/einvoice", eInvoiceRouter(pool, myInvoisConfig));

  // Payroll routes
  app.use("/api/daily-work-logs", dailyWorkLogsRouter(pool));
  app.use("/api/holidays", holidaysRouter(pool));
  app.use("/api/monthly-payrolls", monthlyPayrollsRouter(pool));
  app.use("/api/employee-payrolls", employeePayrollsRouter(pool));
  app.use("/api/contribution-rates", contributionRatesRouter(pool));
  app.use("/api/mid-month-payrolls", midMonthPayrollsRouter(pool));

  // Green Target routes
  app.use("/greentarget/api/customers", greenTargetCustomerRouter(pool));
  app.use("/greentarget/api/locations", greenTargetLocationRouter(pool));
  app.use("/greentarget/api/dumpsters", greenTargetDumpsterRouter(pool));
  app.use("/greentarget/api/rentals", greenTargetRentalRouter(pool));
  app.use(
    "/greentarget/api/invoices",
    greenTargetInvoiceRouter(pool, myInvoisGTConfig)
  );
  app.use("/greentarget/api/payments", greenTargetPaymentRouter(pool));
  app.use(
    "/greentarget/api/einvoice",
    greenTargetEInvoiceRouter(pool, myInvoisGTConfig)
  );

  // Jellypolly routes
  app.use(
    "/jellypolly/api/invoices",
    jellypollyInvoiceRouter(pool, myInvoisJPConfig)
  );
  app.use("/jellypolly/api/payments", jellypollyPaymentRouter(pool));
  app.use(
    "/jellypolly/api/einvoice",
    jellypollyEInvoiceRouter(pool, myInvoisJPConfig)
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
  app.use("/api/job-details", jobDetailsRouter(pool));
  app.use("/api/job-pay-codes", jobPayCodesRouter(pool));
  app.use("/api/job-categories", jobCategoriesRouter(pool));
  app.use("/api/staff-options", staffOptionsRouter(pool));
  app.use("/api/employee-pay-codes", employeePayCodesRouter(pool));

  // Catalogue - Entity routes
  app.use("/api/sections", sectionsRouter(pool));
  app.use("/api/locations", locationsRouter(pool));
  app.use("/api/banks", banksRouter(pool));
  app.use("/api/nationalities", nationalitiesRouter(pool));
  app.use("/api/races", racesRouter(pool));
  app.use("/api/agama", agamaRouter(pool));
}
