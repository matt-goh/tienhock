// src/routes/index.js

// Auth routes
import authRouter from './auth/auth.js';
import sessionsRouter from './auth/sessions.js';
import { authMiddleware } from '../middleware/auth.js';

// User routes
import sidebarRouter from './user/sidebar.js';

// Catalogue routes
import jobCategoriesRouter from './catalogue/job-categories.js';
import jobDetailsRouter from './catalogue/job-details.js';
import customerRouter from './catalogue/customers.js';
import productRouter from './catalogue/products.js';
import staffRouter from './catalogue/staffs.js';
import taxRouter from './catalogue/taxes.js';
import jobRouter from './catalogue/jobs.js';

// Catalogue - Entity routes
import nationalitiesRouter from './catalogue/entities/nationalities.js';
import locationsRouter from './catalogue/entities/locations.js';
import sectionsRouter from './catalogue/entities/sections.js';
import banksRouter from './catalogue/entities/banks.js';
import racesRouter from './catalogue/entities/races.js';
import agamaRouter from './catalogue/entities/agama.js';

// Sales routes
import invoiceRouter from './sales/invoices/invoices.js';
import eInvoiceRouter from './sales/invoices/e-invoices.js';

export default function setupRoutes(app, pool) {
  // MyInvois API Configuration
  const myInvoisConfig = {
    MYINVOIS_API_BASE_URL: 'https://preprod-api.myinvois.hasil.gov.my',
    MYINVOIS_CLIENT_ID: 'b0037953-93e3-4e8d-92b3-99efb15afe33',
    MYINVOIS_CLIENT_SECRET: '1e612d39-da8d-42cc-b949-bcd04d9d3fab'
  };

  // Auth routes
  app.use('/api/auth', authRouter(pool));

  // Add auth middleware to protect other routes
  app.use('/api', authMiddleware(pool));
  app.use('/api/sessions', sessionsRouter(pool));


  // User routes
  app.use('/api/bookmarks', sidebarRouter(pool));

  // Sales routes
  app.use('/api/invoices', invoiceRouter(pool));
  app.use('/api/einvoice', eInvoiceRouter(pool, myInvoisConfig));

  // Catalogue - Main routes
  app.use('/api/staffs', staffRouter(pool));
  app.use('/api/customers', customerRouter(pool));
  app.use('/api/products', productRouter(pool));
  app.use('/api/taxes', taxRouter(pool));
  app.use('/api/jobs', jobRouter(pool));
  app.use('/api/job-details', jobDetailsRouter(pool));
  app.use('/api/job-categories', jobCategoriesRouter(pool));

  // Catalogue - Entity routes
  app.use('/api/sections', sectionsRouter(pool));
  app.use('/api/locations', locationsRouter(pool));
  app.use('/api/banks', banksRouter(pool));
  app.use('/api/nationalities', nationalitiesRouter(pool));
  app.use('/api/races', racesRouter(pool));
  app.use('/api/agama', agamaRouter(pool));
}