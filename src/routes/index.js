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
import customerProductsRouter from "./catalogue/customer-products.js";
import jobCategoriesRouter from "./catalogue/job-categories.js";
import jobDetailsRouter from "./catalogue/job-details.js";
import customerRouter from "./catalogue/customers.js";
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
import eInvoiceRouter from "./sales/invoices/e-invoices.js";

// Green Target routes
import greenTargetCustomerRouter from "./greentarget/customers.js";
import greenTargetLocationRouter from "./greentarget/locations.js";
import greenTargetDumpsterRouter from "./greentarget/dumpsters.js";
import greenTargetRentalRouter from "./greentarget/rentals.js";
import greenTargetInvoiceRouter from "./greentarget/invoices.js";
import greenTargetEInvoiceRouter from "./greentarget/einvoice.js";
import greenTargetPaymentRouter from "./greentarget/payments.js";

// Jellypolly routes
import jellypollyInvoiceRouter from "./sales/invoices/invoicesJP.js";

import {
  MYINVOIS_API_BASE_URL,
  MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET,
  MYINVOIS_GT_CLIENT_ID,
  MYINVOIS_GT_CLIENT_SECRET,
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
  app.use("/api/einvoice", eInvoiceRouter(pool, myInvoisConfig));

  // Green Target routes
  app.use("/greentarget/api/customers", greenTargetCustomerRouter(pool));
  app.use("/greentarget/api/locations", greenTargetLocationRouter(pool));
  app.use("/greentarget/api/dumpsters", greenTargetDumpsterRouter(pool));
  app.use("/greentarget/api/rentals", greenTargetRentalRouter(pool));
  app.use("/greentarget/api/invoices", greenTargetInvoiceRouter(pool));
  app.use("/greentarget/api/payments", greenTargetPaymentRouter(pool));
  app.use(
    "/greentarget/api/einvoice",
    greenTargetEInvoiceRouter(pool, {
      MYINVOIS_API_BASE_URL,
      MYINVOIS_GT_CLIENT_ID,
      MYINVOIS_GT_CLIENT_SECRET,
    })
  );

  // Jellypolly routes
  app.use(
    "/jellypolly/api/invoices",
    jellypollyInvoiceRouter(pool, myInvoisConfig)
  );

  // Catalogue - Main routes
  app.use("/api/staffs", staffRouter(pool));
  app.use(
    "/api/customer-validation",
    customerValidationRouter(pool, myInvoisConfig)
  );
  app.use("/api/customers", customerRouter(pool));
  app.use("/api/customer-products", customerProductsRouter(pool));
  app.use("/api/products", productRouter(pool));
  app.use("/api/taxes", taxRouter(pool));
  app.use("/api/jobs", jobRouter(pool));
  app.use("/api/job-details", jobDetailsRouter(pool));
  app.use("/api/job-categories", jobCategoriesRouter(pool));

  // Catalogue - Entity routes
  app.use("/api/sections", sectionsRouter(pool));
  app.use("/api/locations", locationsRouter(pool));
  app.use("/api/banks", banksRouter(pool));
  app.use("/api/nationalities", nationalitiesRouter(pool));
  app.use("/api/races", racesRouter(pool));
  app.use("/api/agama", agamaRouter(pool));
}
