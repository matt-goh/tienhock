// src/routes/sales/invoices/invoices.js
import { Router } from "express";
import { submitInvoicesToMyInvois } from "../../../utils/invoice/einvoice/serverSubmissionUtil.js";
import EInvoiceApiClientFactory from "../../../utils/invoice/einvoice/EInvoiceApiClientFactory.js";

const fetchCustomerData = async (pool, customerId) => {
  try {
    const query = `
      SELECT 
        city,
        state,
        address,
        name,
        tin_number,
        id_number,
        id_type,
        phone_number,
        email
      FROM customers 
      WHERE id = $1
    `;
    const result = await pool.query(query, [customerId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error fetching customer data:", error);
    throw error;
  }
};

// Helper function to update customer credit
const updateCustomerCredit = async (client, customerId, amount) => {
  try {
    // Update the customer's credit_used by adding the specified amount (can be negative for reductions)
    const updateQuery = `
      UPDATE customers 
      SET credit_used = GREATEST(0, COALESCE(credit_used, 0) + $1)
      WHERE id = $2
      RETURNING credit_used, credit_limit
    `;
    const result = await client.query(updateQuery, [amount, customerId]);

    if (result.rows.length === 0) {
      console.warn(`Customer ${customerId} not found when updating credit`);
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error(`Error updating credit for customer ${customerId}:`, error);
    throw error;
  }
};

export default function (pool, config) {
  const router = Router();

  const apiClient = EInvoiceApiClientFactory.getInstance(config);

  // Customer data cache
  const customerCache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Enhanced customer data function with caching
  const fetchCustomerDataWithCache = async (customerId) => {
    // Check cache first
    const cacheKey = `customer_${customerId}`;
    const cachedData = customerCache.get(cacheKey);

    if (cachedData && cachedData.timestamp > Date.now() - CACHE_TTL) {
      return cachedData.data;
    }

    // Not in cache or expired, fetch from database
    try {
      // Use pool directly here
      const data = await fetchCustomerData(pool, customerId);

      // Store in cache if found
      if (data) {
        customerCache.set(cacheKey, {
          data,
          timestamp: Date.now(),
        });
      }

      return data;
    } catch (error) {
      console.error("Error fetching customer data:", error);
      throw error;
    }
  };

  // GET /api/invoices - List Invoices
  router.get("/", async (req, res) => {
    try {
      const {
        page = 1,
        limit = 15, // Use consistent limit (e.g., 15 to match FE)
        startDate,
        endDate,
        salesman,
        customerId,
        paymentType,
        invoiceStatus,
        eInvoiceStatus,
        search,
      } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Base queries
      let selectClause = `
        SELECT
          i.id, i.salespersonid, i.customerid, i.createddate, i.paymenttype,
          i.total_excluding_tax, i.tax_amount, i.rounding, i.totalamountpayable,
          i.invoice_status, i.einvoice_status, i.balance_due,
          i.uuid, i.submission_uid, i.long_id, i.datetime_validated,
          i.is_consolidated, i.consolidated_invoices,
          c.name as customerName, c.tin_number as customerTin, c.id_number as customerIdNumber, c.phone_number, c.id_type as customerIdType,
          (
            SELECT jsonb_build_object(
              'id', con.id,
              'uuid', con.uuid,
              'long_id', con.long_id,
              'einvoice_status', con.einvoice_status
            )
            FROM invoices con
            WHERE con.is_consolidated = true
              AND con.consolidated_invoices::jsonb ? CAST(i.id AS TEXT)
              AND con.invoice_status != 'cancelled'
            LIMIT 1
          ) as consolidated_part_of
      `;
      let fromClause = `
        FROM invoices i
        LEFT JOIN customers c ON i.customerid = c.id
      `;
      let whereClause = ` WHERE 1=1 `; // Start with basic condition
      let groupByClause = `GROUP BY 
      i.id, i.salespersonid, i.customerid, i.createddate, i.paymenttype,
      i.total_excluding_tax, i.tax_amount, i.rounding, i.totalamountpayable,
      i.invoice_status, i.einvoice_status, i.balance_due,
      i.uuid, i.submission_uid, i.long_id, i.datetime_validated,
      i.is_consolidated, i.consolidated_invoices,
      c.name, c.tin_number, c.id_number, c.phone_number, c.id_type`;

      const filterParams = []; // Parameters ONLY for filtering (WHERE clause)
      let filterParamCounter = 1;

      // Apply Filters and build WHERE clause + filterParams
      if (startDate && endDate) {
        const start = `$${filterParamCounter++}`;
        const end = `$${filterParamCounter++}`;
        filterParams.push(startDate, endDate);
        whereClause += ` AND CAST(i.createddate AS bigint) BETWEEN ${start} AND ${end}`;
      }
      if (salesman) {
        const salesmanParam = `$${filterParamCounter++}`;
        filterParams.push(salesman.split(","));
        whereClause += ` AND i.salespersonid = ANY(${salesmanParam})`;
      }
      if (customerId) {
        const customerParam = `$${filterParamCounter++}`;
        filterParams.push(customerId);
        whereClause += ` AND i.customerid = ${customerParam}`;
      }
      if (paymentType) {
        const paymentTypeParam = `$${filterParamCounter++}`;
        // Convert to uppercase to match database values (CASH, INVOICE)
        filterParams.push(paymentType.toUpperCase());
        whereClause += ` AND i.paymenttype = ${paymentTypeParam}`;
      }
      if (invoiceStatus) {
        const statusParam = `$${filterParamCounter++}`;
        filterParams.push(invoiceStatus.split(","));
        whereClause += ` AND i.invoice_status = ANY(${statusParam})`;
      } else {
        // Default filter to exclude cancelled invoices
        whereClause += ` AND i.invoice_status != 'cancelled'`;
      }
      if (eInvoiceStatus) {
        const eStatusParam = `$${filterParamCounter++}`;
        const statuses = eInvoiceStatus.split(",");
        if (statuses.includes("null")) {
          // Handle 'null' specifically if needed, ensure parameter matches
          filterParams.push(statuses.filter((s) => s !== "null"));
          whereClause += ` AND (i.einvoice_status = ANY(${eStatusParam}) OR i.einvoice_status IS NULL)`;
        } else {
          filterParams.push(statuses);
          whereClause += ` AND i.einvoice_status = ANY(${eStatusParam})`;
        }
      }
      if (search) {
        const searchParam = `$${filterParamCounter++}`;
        filterParams.push(`%${search}%`);
        whereClause += ` AND (
          i.id ILIKE ${searchParam} OR
          c.name ILIKE ${searchParam} OR
          CAST(i.customerid AS TEXT) ILIKE ${searchParam} OR
          CAST(i.salespersonid AS TEXT) ILIKE ${searchParam} OR
          i.paymenttype ILIKE ${searchParam} OR
          i.invoice_status ILIKE ${searchParam} OR
          COALESCE(i.einvoice_status, '') ILIKE ${searchParam} OR
          CAST(i.totalamountpayable AS TEXT) ILIKE ${searchParam} OR
          EXISTS (
        SELECT 1 FROM order_details od
        WHERE od.invoiceid = i.id AND (
          od.code ILIKE ${searchParam} OR
          od.description ILIKE ${searchParam}
        )
          )
        )`;
      }
      const consolidatedOnly = req.query.consolidated_only === "true";
      const excludeConsolidated = req.query.exclude_consolidated === "true";

      // Fix the consolidated invoices logic:
      if (consolidatedOnly) {
        // Show ONLY invoices that are part of any consolidated invoice
        whereClause += ` AND EXISTS (
          SELECT 1 FROM invoices con 
          WHERE con.is_consolidated = true 
          AND con.consolidated_invoices::jsonb ? CAST(i.id AS TEXT)
          AND con.invoice_status != 'cancelled'
        )`;
      } else if (excludeConsolidated) {
        // Exclude invoices that are part of any consolidated invoice
        whereClause += ` AND NOT EXISTS (
          SELECT 1 FROM invoices con 
          WHERE con.is_consolidated = true 
          AND con.consolidated_invoices::jsonb ? CAST(i.id AS TEXT)
          AND con.invoice_status != 'cancelled'
        )`;
      }

      // Always exclude the consolidated invoices themselves from this listing
      whereClause += ` AND (i.is_consolidated = false OR i.is_consolidated IS NULL)`;
      // Construct Count Query
      const countQuery = `SELECT COUNT(DISTINCT i.id) ${fromClause} ${whereClause}`;

      // Construct Data Query
      let dataQuery = `${selectClause} ${fromClause} ${whereClause} ${groupByClause}`;
      dataQuery += ` ORDER BY CAST(i.createddate AS bigint) DESC`;

      // Add Pagination to Data Query parameters
      const paginationParams = [];
      paginationParams.push(parseInt(limit));
      paginationParams.push(offset);
      dataQuery += ` LIMIT $${filterParamCounter++} OFFSET $${filterParamCounter++}`;

      // Combine filter and pagination params for the main data query
      const dataQueryParams = [...filterParams, ...paginationParams];

      // --- Execute Queries ---
      // Execute count query with ONLY filter parameters
      // Execute data query with filter AND pagination parameters
      const [countResult, dataResult] = await Promise.all([
        pool.query(countQuery, filterParams), // Use filterParams for count
        pool.query(dataQuery, dataQueryParams), // Use combined params for data
      ]);
      // --- End Execute Queries ---

      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / parseInt(limit));

      // Format results (Match ExtendedInvoiceData)
      const invoices = dataResult.rows.map((row) => ({
        id: row.id,
        salespersonid: row.salespersonid,
        customerid: row.customerid,
        createddate: row.createddate,
        paymenttype: row.paymenttype,
        total_excluding_tax: parseFloat(row.total_excluding_tax || 0),
        tax_amount: parseFloat(row.tax_amount || 0),
        rounding: parseFloat(row.rounding || 0),
        totalamountpayable: parseFloat(row.totalamountpayable || 0),
        balance_due: parseFloat(row.balance_due || 0),
        invoice_status: row.invoice_status,
        einvoice_status: row.einvoice_status,
        uuid: row.uuid,
        submission_uid: row.submission_uid,
        long_id: row.long_id,
        datetime_validated: row.datetime_validated,
        is_consolidated: row.is_consolidated || false,
        consolidated_invoices: row.consolidated_invoices,
        consolidated_part_of: row.consolidated_part_of,
        customerName: row.customername || row.customerid,
        customerTin: row.customertin,
        customerIdNumber: row.customeridnumber,
        customerPhone: row.phone_number,
        customerIdType: row.customeridtype,
      }));

      res.json({
        data: invoices,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
        },
      });
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res
        .status(500)
        .json({ message: "Error fetching invoices", error: error.message });
    }
  });

  // Get all invoice IDs from the last year
  router.get("/ids", async (req, res) => {
    try {
      const currentDate = Date.now();
      const oneYearAgo = currentDate - 365 * 24 * 60 * 60 * 1000;
      const query = `
       SELECT id FROM invoices
       WHERE CAST(createddate AS bigint) BETWEEN $1 AND $2
       ORDER BY CAST(createddate AS bigint) DESC`;
      const result = await pool.query(query, [
        oneYearAgo.toString(),
        currentDate.toString(),
      ]);
      res.json(result.rows.map((row) => row.id));
    } catch (error) {
      console.error("Error fetching invoice IDs:", error);
      res
        .status(500)
        .json({ message: "Error fetching invoice IDs", error: error.message });
    }
  });

  // Get all invoice IDs and summary matching current filters
  router.get("/selection/ids", async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        salesman,
        customerId,
        paymentType,
        invoiceStatus,
        eInvoiceStatus,
        search,
        consolidated_only,
        exclude_consolidated,
      } = req.query;

      // Start building query
      let whereClause = " WHERE 1=1 "; // Start with basic condition
      const filterParams = []; // Parameters for filtering
      let filterParamCounter = 1;

      // Apply date filters
      if (startDate && endDate) {
        whereClause += ` AND CAST(createddate AS bigint) BETWEEN $${filterParamCounter++} AND $${filterParamCounter++}`;
        filterParams.push(startDate, endDate);
      } else {
        // Default to last year if no date range specified
        const currentDate = Date.now();
        const oneYearAgo = currentDate - 365 * 24 * 60 * 60 * 1000;
        whereClause += ` AND CAST(createddate AS bigint) BETWEEN $${filterParamCounter++} AND $${filterParamCounter++}`;
        filterParams.push(oneYearAgo.toString(), currentDate.toString());
      }

      // Apply salesman filter
      if (salesman) {
        whereClause += ` AND salespersonid = ANY($${filterParamCounter++})`;
        filterParams.push(salesman.split(","));
      }

      // Apply customer ID filter
      if (customerId) {
        whereClause += ` AND customerid = $${filterParamCounter++}`;
        filterParams.push(customerId);
      }

      // Apply payment type filter
      if (paymentType) {
        whereClause += ` AND paymenttype = $${filterParamCounter++}`;
        filterParams.push(paymentType.toUpperCase());
      }

      // Apply invoice status filter
      if (invoiceStatus) {
        whereClause += ` AND invoice_status = ANY($${filterParamCounter++})`;
        filterParams.push(invoiceStatus.split(","));
      } else {
        // Default filter to exclude cancelled invoices
        whereClause += ` AND invoice_status != 'cancelled'`;
      }

      // Apply e-invoice status filter
      if (eInvoiceStatus) {
        const statuses = eInvoiceStatus.split(",");
        if (statuses.includes("null")) {
          // Handle 'null' specifically
          filterParams.push(statuses.filter((s) => s !== "null"));
          whereClause += ` AND (einvoice_status = ANY($${filterParamCounter++}) OR einvoice_status IS NULL)`;
        } else {
          filterParams.push(statuses);
          whereClause += ` AND einvoice_status = ANY($${filterParamCounter++})`;
        }
      }

      // Apply search filter
      if (search) {
        whereClause += ` AND (
        id ILIKE $${filterParamCounter++} OR
        EXISTS (
          SELECT 1 FROM customers c 
          WHERE c.id = customerid AND c.name ILIKE $${filterParamCounter++}
        ) OR
        CAST(customerid AS TEXT) ILIKE $${filterParamCounter++} OR
        CAST(salespersonid AS TEXT) ILIKE $${filterParamCounter++} OR
        paymenttype ILIKE $${filterParamCounter++} OR
        invoice_status ILIKE $${filterParamCounter++} OR
        COALESCE(einvoice_status, '') ILIKE $${filterParamCounter++} OR
        CAST(totalamountpayable AS TEXT) ILIKE $${filterParamCounter++}
      )`;

        const searchPattern = `%${search}%`;
        // Add search param 8 times for each ILIKE condition
        for (let i = 0; i < 8; i++) {
          filterParams.push(searchPattern);
        }
      }

      // Apply consolidation filters
      if (consolidated_only === "true") {
        // Show ONLY invoices that are part of any consolidated invoice
        whereClause += ` AND EXISTS (
        SELECT 1 FROM invoices con 
        WHERE con.is_consolidated = true 
        AND con.consolidated_invoices::jsonb ? CAST(invoices.id AS TEXT)
        AND con.invoice_status != 'cancelled'
      )`;
      } else if (exclude_consolidated === "true") {
        // Exclude invoices that are part of any consolidated invoice
        whereClause += ` AND NOT EXISTS (
        SELECT 1 FROM invoices con 
        WHERE con.is_consolidated = true 
        AND con.consolidated_invoices::jsonb ? CAST(invoices.id AS TEXT)
        AND con.invoice_status != 'cancelled'
      )`;
      }

      // Always exclude the consolidated invoices themselves
      whereClause += ` AND (is_consolidated = false OR is_consolidated IS NULL)`;

      // Modified query to get both IDs and total amount
      const query = `
      SELECT 
        id,
        totalamountpayable
      FROM invoices 
      ${whereClause} 
      ORDER BY CAST(createddate AS bigint) DESC
    `;

      const result = await pool.query(query, filterParams);

      // Calculate total amount
      const totalAmount = result.rows.reduce(
        (sum, row) => sum + parseFloat(row.totalamountpayable || 0),
        0
      );

      // Extract just the IDs for the response
      const invoiceIds = result.rows.map((row) => row.id);

      // Return both IDs and total
      res.json({
        ids: invoiceIds,
        total: totalAmount,
        count: invoiceIds.length,
      });
    } catch (error) {
      console.error("Error fetching invoice IDs and summary:", error);
      res.status(500).json({
        message: "Error fetching invoice data",
        error: error.message,
      });
    }
  });

  // GET /api/invoices/batch - Get Multiple Invoices By IDs
  router.get("/batch", async (req, res) => {
    const { ids } = req.query;

    if (!ids) {
      return res
        .status(400)
        .json({ message: "Missing required ids parameter" });
    }

    try {
      // Split comma-separated string into array
      const invoiceIds = ids.split(",");

      // Limit batch size for performance
      if (invoiceIds.length > 100) {
        return res.status(400).json({
          message: "Too many invoices requested. Maximum batch size is 100.",
        });
      }

      // Generate a query to fetch multiple invoices at once
      const placeholders = invoiceIds.map((_, i) => `$${i + 1}`).join(",");

      const query = `
      SELECT
        i.id, i.salespersonid, i.customerid, i.createddate, i.paymenttype,
        i.total_excluding_tax, i.tax_amount, i.rounding, i.totalamountpayable,
        i.invoice_status, i.einvoice_status, i.balance_due,
        i.uuid, i.submission_uid, i.long_id, i.datetime_validated,
        i.is_consolidated, i.consolidated_invoices,
        c.name as customerName, c.tin_number, c.id_number, c.phone_number,
        COALESCE(
          json_agg(
            json_build_object(
              'id', od.id,
              'code', od.code,
              'quantity', od.quantity,
              'price', od.price,
              'freeProduct', od.freeproduct,
              'returnProduct', od.returnproduct,
              'description', od.description,
              'tax', od.tax,
              'total', od.total,
              'issubtotal', od.issubtotal
            )
            ORDER BY od.id
          ) FILTER (WHERE od.id IS NOT NULL),
          '[]'::json
        ) as products
      FROM invoices i
      LEFT JOIN customers c ON i.customerid = c.id
      LEFT JOIN order_details od ON i.id = od.invoiceid
      WHERE i.id IN (${placeholders})
      GROUP BY i.id, c.name, c.tin_number, c.id_number, c.phone_number
    `;

      const result = await pool.query(query, invoiceIds);

      // Format each invoice the same way as the single invoice endpoint
      const formattedInvoices = result.rows.map((invoice) => ({
        id: invoice.id,
        salespersonid: invoice.salespersonid,
        customerid: invoice.customerid,
        createddate: invoice.createddate,
        paymenttype: invoice.paymenttype,
        total_excluding_tax: parseFloat(invoice.total_excluding_tax || 0),
        tax_amount: parseFloat(invoice.tax_amount || 0),
        rounding: parseFloat(invoice.rounding || 0),
        totalamountpayable: parseFloat(invoice.totalamountpayable || 0),
        balance_due: parseFloat(invoice.balance_due || 0),
        invoice_status: invoice.invoice_status,
        einvoice_status: invoice.einvoice_status,
        uuid: invoice.uuid,
        submission_uid: invoice.submission_uid,
        long_id: invoice.long_id,
        datetime_validated: invoice.datetime_validated,
        is_consolidated: invoice.is_consolidated || false,
        consolidated_invoices: invoice.consolidated_invoices,
        customerName: invoice.customername || invoice.customerid,
        customerTin: invoice.tin_number,
        customerIdNumber: invoice.id_number,
        customerPhone: invoice.phone_number,
        products: (invoice.products || []).map((product) => ({
          id: product.id,
          code: product.code,
          price: parseFloat(product.price || 0),
          quantity: parseInt(product.quantity || 0),
          freeProduct: parseInt(product.freeProduct || 0),
          returnProduct: parseInt(product.returnProduct || 0),
          tax: parseFloat(product.tax || 0),
          description: product.description,
          total: String(product.total || "0.00"),
          issubtotal: product.issubtotal || false,
        })),
      }));

      res.json(formattedInvoices);
    } catch (error) {
      console.error("Error fetching batch invoices:", error);
      res.status(500).json({
        message: "Error fetching invoices",
        error: error.message,
      });
    }
  });

  // POST /api/invoices/sales/summary - Get comprehensive sales summary data
  router.post("/sales/summary", async (req, res) => {
    const { startDate, endDate, summaries } = req.body;

    if (!startDate || !endDate || !summaries || !Array.isArray(summaries)) {
      return res.status(400).json({
        message: "Missing required parameters: startDate, endDate, summaries",
      });
    }

    try {
      // Query to get all invoices with products in the date range from main schema
      const mainQuery = `
      SELECT 
        i.id,
        i.salespersonid,
        i.paymenttype,
        i.tax_amount,
        i.rounding,
        i.totalamountpayable,
        i.invoice_status,
        json_agg(
          json_build_object(
            'code', od.code,
            'description', od.description,
            'quantity', od.quantity,
            'price', od.price,
            'freeproduct', od.freeproduct,
            'returnproduct', od.returnproduct,
            'total', od.total,
            'type', p.type
          ) ORDER BY od.id
        ) FILTER (WHERE od.id IS NOT NULL) as products
      FROM invoices i
      LEFT JOIN order_details od ON i.id = od.invoiceid
      LEFT JOIN products p ON od.code = p.id
      WHERE 
        CAST(i.createddate AS bigint) BETWEEN $1 AND $2
        AND i.invoice_status != 'cancelled'
        AND od.issubtotal IS NOT TRUE
        AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
      GROUP BY i.id
    `;

      // Query to get all invoices with products in the date range from jellypolly schema
      const jellypollyQuery = `
      SELECT 
        i.id,
        i.salespersonid,
        i.paymenttype,
        i.tax_amount,
        i.rounding,
        i.totalamountpayable,
        i.invoice_status,
        json_agg(
          json_build_object(
            'code', od.code,
            'description', od.description,
            'quantity', od.quantity,
            'price', od.price,
            'freeproduct', od.freeproduct,
            'returnproduct', od.returnproduct,
            'total', od.total,
            'type', p.type
          ) ORDER BY od.id
        ) FILTER (WHERE od.id IS NOT NULL) as products
      FROM jellypolly.invoices i
      LEFT JOIN jellypolly.order_details od ON i.id = od.invoiceid
      LEFT JOIN products p ON od.code = p.id
      WHERE 
        CAST(i.createddate AS bigint) BETWEEN $1 AND $2
        AND i.invoice_status != 'cancelled'
        AND od.issubtotal IS NOT TRUE
        AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
      GROUP BY i.id
    `;

      // Execute both queries in parallel
      const [mainResult, jellypollyResult] = await Promise.all([
        pool.query(mainQuery, [startDate, endDate]),
        pool.query(jellypollyQuery, [startDate, endDate]),
      ]);

      // Combine results from both schemas
      const allInvoices = [...mainResult.rows, ...jellypollyResult.rows];

      // Process the data for different summary types
      const summaryData = {};

      // Initialize data structures for each summary type
      if (summaries.includes("all_sales")) {
        summaryData.all_sales = processAllSales(allInvoices);
      }
      if (summaries.includes("all_salesmen")) {
        summaryData.all_salesmen = processSalesmenSummary(allInvoices, null);
      }
      if (summaries.includes("mee_salesmen")) {
        summaryData.mee_salesmen = processSalesmenSummary(allInvoices, "MEE");
      }
      if (summaries.includes("bihun_salesmen")) {
        summaryData.bihun_salesmen = processSalesmenSummary(allInvoices, "BH");
      }
      if (summaries.includes("jp_salesmen")) {
        summaryData.jp_salesmen = processSalesmenSummary(allInvoices, "JP");
      }
      if (summaries.includes("sisa_sales")) {
        summaryData.sisa_sales = processSisaSales(allInvoices);
      }

      res.json(summaryData);
    } catch (error) {
      console.error("Error fetching sales summary:", error);
      res.status(500).json({
        message: "Error fetching sales summary",
        error: error.message,
      });
    }
  });

  // Helper functions for processing summary data
  function processAllSales(invoices) {
    const categories = {
      category_1: { quantity: 0, amount: 0, products: [] }, // ID starts with "1-"
      category_2: { quantity: 0, amount: 0, products: [] }, // ID starts with "2-"
      category_meq: { quantity: 0, amount: 0, products: [] }, // ID starts with "MEQ-"
      category_s: { quantity: 0, amount: 0, products: [] }, // ID starts with "S-"
      category_oth: { quantity: 0, amount: 0, products: [] }, // ID "OTH"
      category_we_mnl: { quantity: 0, amount: 0, products: [] }, // ID "WE-MNL"
      category_we_2udg: { quantity: 0, amount: 0, products: [] }, // ID "WE-2UDG"
      category_we_300g: { quantity: 0, amount: 0, products: [] }, // ID "WE-300G"
      category_we_600g: { quantity: 0, amount: 0, products: [] }, // ID "WE-600G"
      category_we_others: { quantity: 0, amount: 0, products: [] }, // WE-360(5PK), WE-360, WE-3UDG, WE-420
      category_empty_bag: { quantity: 0, amount: 0, products: [] }, // ID starts with "EMPTY_BAG"
      category_sbh: { quantity: 0, amount: 0, products: [] }, // ID "SBH"
      category_smee: { quantity: 0, amount: 0, products: [] }, // ID "SMEE"
      category_less: { quantity: 0, amount: 0, products: [] }, // ID "LESS"
      category_tax_rounding: { quantity: 0, amount: 0, products: [] },
      category_returns: { quantity: 0, amount: 0, products: [] }, // Products with returnproduct > 0
      total_rounding: 0,
      total_tax: 0,
    };

    // Use Map to track products by category (fix the key issue)
    const productsByCategory = {
      category_1: new Map(),
      category_2: new Map(),
      category_meq: new Map(),
      category_s: new Map(),
      category_oth: new Map(),
      category_we_mnl: new Map(),
      category_we_2udg: new Map(),
      category_we_300g: new Map(),
      category_we_600g: new Map(),
      category_we_others: new Map(),
      category_empty_bag: new Map(),
      category_sbh: new Map(),
      category_smee: new Map(),
      category_less: new Map(),
      category_tax_rounding: new Map(),
      category_returns: new Map(),
    };

    let cashTotal = 0;
    let invoiceTotal = 0;
    let cashCount = 0;
    let invoiceCount = 0;

    invoices.forEach((invoice) => {
      // Track payment types
      if (invoice.paymenttype === "CASH") {
        cashTotal += parseFloat(invoice.totalamountpayable || 0);
        cashCount++;
      } else {
        invoiceTotal += parseFloat(invoice.totalamountpayable || 0);
        invoiceCount++;
      }

      // Add rounding
      const roundingAmount = parseFloat(invoice.rounding || 0);
      categories.total_rounding += roundingAmount;

      // Add tax from invoice level
      const taxAmount = parseFloat(invoice.tax_amount || 0);
      categories.total_tax += taxAmount;

      // Add tax and rounding to the new category if they exist
      if (roundingAmount !== 0) {
        categories.category_tax_rounding.quantity += 1;
        categories.category_tax_rounding.amount += roundingAmount;

        if (!productsByCategory.category_tax_rounding.has("ROUNDING")) {
          productsByCategory.category_tax_rounding.set("ROUNDING", {
            code: "ROUNDING",
            description: "Rounding Adjustment",
            quantity: 0,
            amount: 0,
            descriptions: new Set(["Rounding Adjustment"]),
          });
        }
        const roundingProd =
          productsByCategory.category_tax_rounding.get("ROUNDING");
        roundingProd.quantity += 1;
        roundingProd.amount += roundingAmount;
      }

      if (taxAmount !== 0) {
        categories.category_tax_rounding.quantity += 1;
        categories.category_tax_rounding.amount += taxAmount;

        if (!productsByCategory.category_tax_rounding.has("TAX")) {
          productsByCategory.category_tax_rounding.set("TAX", {
            code: "TAX",
            description: "Tax Amount",
            quantity: 0,
            amount: 0,
            descriptions: new Set(["Tax Amount"]),
          });
        }
        const taxProd = productsByCategory.category_tax_rounding.get("TAX");
        taxProd.quantity += 1;
        taxProd.amount += taxAmount;
      }

      // Process products
      if (!invoice.products) return;

      invoice.products.forEach((product) => {
        const code = product.code;
        const quantity = parseInt(product.quantity || 0);
        const price = parseFloat(product.price || 0);
        const total = quantity * price;
        const returnQty = parseInt(product.returnproduct || 0);

        // Group products by category
        let category = null;
        if (code.startsWith("1-")) category = "category_1";
        else if (code.startsWith("2-")) category = "category_2";
        else if (code.startsWith("MEQ-")) category = "category_meq";
        else if (code.startsWith("S-")) category = "category_s";
        else if (code === "OTH") category = "category_oth";
        else if (code === "WE-MNL") category = "category_we_mnl";
        else if (code === "WE-2UDG") category = "category_we_2udg";
        else if (code === "WE-300G") category = "category_we_300g";
        else if (code === "WE-600G") category = "category_we_600g";
        else if (["WE-360(5PK)", "WE-360", "WE-3UDG", "WE-420"].includes(code))
          category = "category_we_others";
        else if (code.startsWith("EMPTY_BAG")) category = "category_empty_bag";
        else if (code === "SBH") category = "category_sbh";
        else if (code === "SMEE") category = "category_smee";
        else if (code === "LESS") category = "category_less";

        if (category) {
          categories[category].quantity += quantity;
          categories[category].amount += total;

          // Track individual products using the category-specific Map
          if (!productsByCategory[category].has(code)) {
            productsByCategory[category].set(code, {
              code,
              description: product.description || code,
              quantity: 0,
              amount: 0,
              descriptions: new Set([product.description || code]), // Track unique descriptions
            });
          }
          const prod = productsByCategory[category].get(code);
          prod.quantity += quantity;
          prod.amount += total;

          // Add description to the set if it's different
          if (product.description && product.description.trim()) {
            prod.descriptions.add(product.description.trim());
          }
        }

        // Handle returns separately
        if (returnQty > 0) {
          categories.category_returns.quantity += returnQty;
          categories.category_returns.amount += returnQty * price;

          // Track return products
          if (!productsByCategory.category_returns.has(code)) {
            productsByCategory.category_returns.set(code, {
              code,
              description: product.description || code,
              quantity: 0,
              amount: 0,
            });
          }
          const returnProd = productsByCategory.category_returns.get(code);
          returnProd.quantity += returnQty;
          returnProd.amount += returnQty * price;
        }

        // Track type statistics (need to fetch product type from cache)
        // This will be done in the frontend since we have the product cache there
      });
    });

    // Convert Maps to arrays and assign to categories
    Object.keys(productsByCategory).forEach((categoryKey) => {
      if (categories[categoryKey]) {
        categories[categoryKey].products = Array.from(
          productsByCategory[categoryKey].values()
        ).map((product) => ({
          ...product,
          // Convert descriptions Set to comma-separated string
          description:
            product.descriptions && product.descriptions.size > 0
              ? Array.from(product.descriptions).join(", ")
              : product.description,
          descriptions: undefined, // Remove the Set from final output
        }));
      }
    });

    return {
      categories,
      totals: {
        cashSales: { count: cashCount, amount: cashTotal },
        creditSales: { count: invoiceCount, amount: invoiceTotal },
        grandTotal: cashTotal + invoiceTotal,
      },
    };
  }

  function processSalesmenSummary(invoices, productType) {
    const salesmenData = {};
    const focProducts = new Map();
    const returnProducts = new Map();

    invoices.forEach((invoice) => {
      const salesmanId = invoice.salespersonid;

      if (!salesmenData[salesmanId]) {
        salesmenData[salesmanId] = {
          products: new Map(),
          total: { quantity: 0, amount: 0 },
        };
      }

      if (!invoice.products) return;

      invoice.products.forEach((product) => {
        // Filter by product type if specified
        if (productType) {
          // Map product types to filter criteria
          const productTypeMap = {
            MEE: ["MEE"],
            BH: ["BH"],
            JP: ["JP"],
          };

          const allowedTypes = productTypeMap[productType];
          if (!allowedTypes || !allowedTypes.includes(product.type)) {
            return; // Skip this product if it doesn't match the filter
          }
        }

        const code = product.code;
        const quantity = parseInt(product.quantity || 0);
        const price = parseFloat(product.price || 0);
        const total = quantity * price;
        const foc = parseInt(product.freeproduct || 0);
        const returns = parseInt(product.returnproduct || 0);

        // Add to salesman's products
        if (!salesmenData[salesmanId].products.has(code)) {
          salesmenData[salesmanId].products.set(code, {
            code,
            description: product.description || code,
            quantity: 0,
            amount: 0,
            descriptions: new Set([product.description || code]), // Track unique descriptions
          });
        }

        const prod = salesmenData[salesmanId].products.get(code);
        prod.quantity += quantity;
        prod.amount += total;

        // Add description to the set if it's different
        if (product.description && product.description.trim()) {
          prod.descriptions.add(product.description.trim());
        }

        if (code !== "LESS") {
          salesmenData[salesmanId].total.quantity += quantity;
        }
        salesmenData[salesmanId].total.amount += total;

        // Track FOC and returns (also apply the same filtering)
        if (foc > 0) {
          if (!focProducts.has(code)) {
            focProducts.set(code, {
              code,
              description: product.description || code,
              price: price,
              quantity: 0,
            });
          }
          focProducts.get(code).quantity += foc;
        }

        if (returns > 0) {
          if (!returnProducts.has(code)) {
            returnProducts.set(code, {
              code,
              description: product.description || code,
              price: price,
              quantity: 0,
            });
          }
          returnProducts.get(code).quantity += returns;
        }
      });
    });

    // Convert maps to arrays
    const result = {
      salesmen: {},
      foc: {
        products: Array.from(focProducts.values()),
        total: {
          quantity: Array.from(focProducts.values()).reduce(
            (sum, p) => sum + p.quantity,
            0
          ),
        },
      },
      returns: {
        products: Array.from(returnProducts.values()),
        total: {
          quantity: Array.from(returnProducts.values()).reduce(
            (sum, p) => sum + p.quantity,
            0
          ),
          amount: Array.from(returnProducts.values()).reduce(
            (sum, p) => sum + p.quantity * p.price,
            0
          ),
        },
      },
    };

    for (const [salesmanId, data] of Object.entries(salesmenData)) {
      result.salesmen[salesmanId] = {
        products: Array.from(data.products.values()).map((product) => ({
          ...product,
          // Convert descriptions Set to comma-separated string
          description: product.descriptions
            ? Array.from(product.descriptions).join(", ")
            : product.description || product.code,
          descriptions: undefined, // Remove the Set from final output
        })),
        total: data.total,
      };
    }

    return result;
  }

  function processSisaSales(invoices) {
    const categories = {
      empty_bag: { quantity: 0, amount: 0, products: [] },
      sbh: { quantity: 0, amount: 0, products: [] },
      smee: { quantity: 0, amount: 0, products: [] },
    };

    const productMap = new Map();

    invoices.forEach((invoice) => {
      if (!invoice.products) return;

      invoice.products.forEach((product) => {
        const code = product.code;
        const quantity = parseInt(product.quantity || 0);
        const price = parseFloat(product.price || 0);
        const total = quantity * price;

        let category = null;
        if (code.startsWith("EMPTY_BAG")) category = "empty_bag";
        else if (code === "SBH") category = "sbh";
        else if (code === "SMEE") category = "smee";

        if (category) {
          categories[category].quantity += quantity;
          categories[category].amount += total;

          // Track individual products
          const key = `${category}_${code}`;
          if (!productMap.has(key)) {
            productMap.set(key, {
              code,
              description: product.description || code,
              quantity: 0,
              amount: 0,
            });
          }
          const prod = productMap.get(key);
          prod.quantity += quantity;
          prod.amount += total;
        }
      });
    });

    // Convert product map to arrays
    for (const [key, product] of productMap) {
      const category =
        key.split("_")[0] + (key.split("_")[1] ? "_" + key.split("_")[1] : "");
      if (categories[category]) {
        categories[category].products.push(product);
      }
    }

    return categories;
  }

  // GET /api/invoices/salesman-products - Get products sold by multiple salesmen on a specific date
  router.get("/salesman-products", async (req, res) => {
    const { salesmanIds, date } = req.query;

    if (!salesmanIds || !date) {
      return res
        .status(400)
        .json({ message: "Missing required parameters: salesmanIds and date" });
    }

    try {
      // Parse comma-separated salesmanIds
      const salesmanIdArray = salesmanIds.split(",");

      // Convert date to timestamp range (start of day to end of day)
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      const startTimestamp = startDate.getTime().toString();
      const endTimestamp = endDate.getTime().toString();

      // Query for main invoices products - now includes salespersonid in results and uses ANY for multiple salesmen
      const mainInvoicesQuery = `
      SELECT 
        i.salespersonid,
        od.code as product_id,
        p.description as product_name,
        SUM(od.quantity) as quantity
      FROM invoices i
      JOIN order_details od ON i.id = od.invoiceid
      LEFT JOIN products p ON od.code = p.id
      WHERE i.salespersonid = ANY($1)
        AND CAST(i.createddate AS bigint) BETWEEN $2 AND $3
        AND i.invoice_status != 'cancelled'
        AND od.issubtotal IS NOT TRUE
      GROUP BY i.salespersonid, od.code, p.description
    `;

      // Query for jellypolly invoices products
      const jellypollyInvoicesQuery = `
      SELECT 
        i.salespersonid,
        od.code as product_id,
        p.description as product_name,
        SUM(od.quantity) as quantity
      FROM jellypolly.invoices i
      JOIN jellypolly.order_details od ON i.id = od.invoiceid
      LEFT JOIN products p ON od.code = p.id
      WHERE i.salespersonid = ANY($1)
        AND CAST(i.createddate AS bigint) BETWEEN $2 AND $3
        AND i.invoice_status != 'cancelled'
        AND od.issubtotal IS NOT TRUE
      GROUP BY i.salespersonid, od.code, p.description
    `;

      // Execute both queries
      const [mainResult, jellypollyResult] = await Promise.all([
        pool.query(mainInvoicesQuery, [
          salesmanIdArray,
          startTimestamp,
          endTimestamp,
        ]),
        pool.query(jellypollyInvoicesQuery, [
          salesmanIdArray,
          startTimestamp,
          endTimestamp,
        ]),
      ]);

      // Create a nested map structure: salesmanId -> productId -> product data
      const productsBySalesman = {};

      // Initialize salesmanIds in the map
      salesmanIdArray.forEach((id) => {
        productsBySalesman[id] = {};
      });

      // Process main invoices
      mainResult.rows.forEach((row) => {
        const { salespersonid, product_id, product_name, quantity } = row;

        if (!productsBySalesman[salespersonid]) {
          productsBySalesman[salespersonid] = {};
        }

        productsBySalesman[salespersonid][product_id] = {
          product_id,
          product_name: product_name || product_id,
          quantity: parseInt(quantity) || 0,
        };
      });

      // Process jellypolly invoices
      jellypollyResult.rows.forEach((row) => {
        const { salespersonid, product_id, product_name, quantity } = row;
        const parsedQuantity = parseInt(quantity) || 0;

        if (!productsBySalesman[salespersonid]) {
          productsBySalesman[salespersonid] = {};
        }

        if (productsBySalesman[salespersonid][product_id]) {
          // Add to existing product quantity
          productsBySalesman[salespersonid][product_id].quantity +=
            parsedQuantity;
        } else {
          // Create new product entry
          productsBySalesman[salespersonid][product_id] = {
            product_id,
            product_name: product_name || product_id,
            quantity: parsedQuantity,
          };
        }
      });

      // Convert inner maps to arrays and sort by quantity
      const result = {};
      Object.keys(productsBySalesman).forEach((salesmanId) => {
        const productsMap = productsBySalesman[salesmanId];
        result[salesmanId] = Object.values(productsMap).sort(
          (a, b) => b.quantity - a.quantity
        );
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching salesman products:", error);
      res.status(500).json({
        message: "Error fetching salesman products",
        error: error.message,
      });
    }
  });

  // Get order details for a specific invoice
  router.get("/details/:id/items", async (req, res) => {
    const { id } = req.params;

    try {
      const orderDetailsQuery = `
      SELECT 
        description,
        quantity as qty,
        price,
        total,
        tax
      FROM 
        order_details
      WHERE 
        invoiceid = $1
      ORDER BY 
        id
    `;

      const result = await pool.query(orderDetailsQuery, [id]);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching order details:", error);
      res.status(500).json({
        message: "Error fetching order details",
        error: error.message,
      });
    }
  });

  // GET /api/invoices/sales/products - Get product sales data
  router.get("/sales/products", async (req, res) => {
    try {
      const { startDate, endDate, salesman } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Date range is required" });
      }

      // Base query to get invoices and their products within date range
      let query = `
      SELECT 
        i.id, i.salespersonid, i.invoice_status, i.paymenttype,
        od.code, od.description, od.quantity, od.price, od.freeproduct, od.returnproduct, 
        p.type
      FROM invoices i
      JOIN order_details od ON i.id = od.invoiceid
      LEFT JOIN products p ON od.code = p.id
      WHERE 
        CAST(i.createddate AS bigint) BETWEEN $1 AND $2
        AND i.invoice_status != 'cancelled'
        AND od.issubtotal IS NOT TRUE
    `;

      const queryParams = [startDate, endDate];
      let paramCount = 3;

      // Add optional salesman filter
      if (salesman && salesman !== "All Salesmen") {
        query += ` AND i.salespersonid = $${paramCount++}`;
        queryParams.push(salesman);
      }

      const result = await pool.query(query, queryParams);

      // Process data - group by product
      const productMap = new Map();

      result.rows.forEach((product) => {
        const productId = product.code;
        if (!productId) return;

        // Parse values from string to number
        const quantity = parseInt(product.quantity) || 0;
        const price = parseFloat(product.price) || 0;
        const total = quantity * price;
        const foc = parseInt(product.freeproduct) || 0;
        const returns = parseInt(product.returnproduct) || 0;

        if (productMap.has(productId)) {
          const existingProduct = productMap.get(productId);
          existingProduct.quantity += quantity;
          existingProduct.totalSales += total;
          existingProduct.foc += foc;
          existingProduct.returns += returns;

          // Add description to the set if it's different
          if (product.description && product.description.trim()) {
            existingProduct.descriptions.add(product.description.trim());
          }
        } else {
          productMap.set(productId, {
            id: productId,
            description: product.description || productId,
            type: product.type || "OTHER",
            quantity,
            totalSales: total,
            foc,
            returns,
            descriptions: new Set([product.description || productId]), // Track unique descriptions
          });
        }
      });

      // Convert Map to Array for response
      const productData = Array.from(productMap.values()).map((product) => ({
        ...product,
        // Convert descriptions Set to comma-separated string
        description: Array.from(product.descriptions).join(", "),
        descriptions: undefined, // Remove the Set from final output
      }));

      res.json(productData);
    } catch (error) {
      console.error("Error fetching product sales data:", error);
      res.status(500).json({
        message: "Error fetching product sales data",
        error: error.message,
      });
    }
  });

  // GET /api/invoices/sales/salesmen - Get salesmen sales data
  router.get("/sales/salesmen", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Date range is required" });
      }

      // Query to get sales statistics grouped by salesperson
      const query = `
      WITH invoice_totals AS (
        SELECT 
          i.id, i.salespersonid, i.paymenttype,
          SUM(od.quantity * od.price) as total_amount,
          SUM(od.quantity) as total_quantity
        FROM invoices i
        JOIN order_details od ON i.id = od.invoiceid
        WHERE 
          CAST(i.createddate AS bigint) BETWEEN $1 AND $2
          AND i.invoice_status != 'cancelled'
          AND od.issubtotal IS NOT TRUE
        GROUP BY i.id, i.salespersonid, i.paymenttype
      )
      SELECT 
        it.salespersonid as id,
        SUM(it.total_amount) as total_sales,
        SUM(it.total_quantity) as total_quantity,
        COUNT(it.id) as sales_count,
        COUNT(CASE WHEN it.paymenttype = 'INVOICE' THEN 1 END) as invoice_count,
        COUNT(CASE WHEN it.paymenttype = 'CASH' THEN 1 END) as cash_count
      FROM invoice_totals it
      GROUP BY it.salespersonid
      ORDER BY total_sales DESC
    `;

      const result = await pool.query(query, [startDate, endDate]);

      res.json(
        result.rows.map((row) => ({
          id: row.id,
          totalSales: parseFloat(row.total_sales) || 0,
          totalQuantity: parseInt(row.total_quantity) || 0,
          salesCount: parseInt(row.sales_count) || 0,
          invoiceCount: parseInt(row.invoice_count) || 0,
          cashCount: parseInt(row.cash_count) || 0,
        }))
      );
    } catch (error) {
      console.error("Error fetching salesman sales data:", error);
      res.status(500).json({
        message: "Error fetching salesman sales data",
        error: error.message,
      });
    }
  });

  // GET /api/invoices/sales/trends - Get monthly sales trends for products or salesmen
  router.get("/sales/trends", async (req, res) => {
    try {
      const { startDate, endDate, type, ids } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Date range is required" });
      }

      if (!type || (type !== "products" && type !== "salesmen")) {
        return res.status(400).json({
          message: "Valid type parameter (products or salesmen) is required",
        });
      }

      // Parse IDs from comma-separated string if provided
      const idArray = ids ? ids.split(",") : [];

      // Different SQL logic based on type
      let query;
      const queryParams = [startDate, endDate];

      if (type === "products") {
        // Product trends - include category level (BH, MEE) and individual products
        query = `
        WITH monthly_data AS (
          SELECT 
            DATE_TRUNC('month', TO_TIMESTAMP(CAST(i.createddate AS bigint) / 1000)) as month,
            od.code as product_id,
            p.type as product_type,
            SUM(od.quantity * od.price) as total_sales
          FROM invoices i
          JOIN order_details od ON i.id = od.invoiceid
          LEFT JOIN products p ON od.code = p.id
          WHERE 
            CAST(i.createddate AS bigint) BETWEEN $1 AND $2
            AND i.invoice_status != 'cancelled'
            AND od.issubtotal IS NOT TRUE
          GROUP BY month, product_id, product_type
        )
        SELECT 
          TO_CHAR(month, 'YYYY-MM') as month_year,
          product_id,
          product_type,
          total_sales
        FROM monthly_data
        ORDER BY month, product_id
      `;
      } else {
        // Salesman trends
        query = `
        WITH monthly_data AS (
          SELECT 
            DATE_TRUNC('month', TO_TIMESTAMP(CAST(i.createddate AS bigint) / 1000)) as month,
            i.salespersonid,
            SUM(od.quantity * od.price) as total_sales
          FROM invoices i
          JOIN order_details od ON i.id = od.invoiceid
          WHERE 
            CAST(i.createddate AS bigint) BETWEEN $1 AND $2
            AND i.invoice_status != 'cancelled'
            AND od.issubtotal IS NOT TRUE
            ${idArray.length > 0 ? "AND i.salespersonid = ANY($3)" : ""}
          GROUP BY month, i.salespersonid
        )
        SELECT 
          TO_CHAR(month, 'YYYY-MM') as month_year,
          salespersonid,
          total_sales
        FROM monthly_data
        ORDER BY month, salespersonid
      `;

        if (idArray.length > 0) {
          queryParams.push(idArray);
        }
      }

      const result = await pool.query(query, queryParams);

      // Transform data for frontend consumption
      const monthlyData = new Map();

      // For products, we also track by product type (BH, MEE)
      const trackedItems = new Set();
      if (type === "products" && idArray.length > 0) {
        idArray.forEach((id) => trackedItems.add(id));
      }

      result.rows.forEach((row) => {
        const monthYear = row.month_year;

        if (!monthlyData.has(monthYear)) {
          monthlyData.set(monthYear, {
            month: monthYear,
          });
        }

        const monthData = monthlyData.get(monthYear);

        if (type === "products") {
          const productId = row.product_id;
          const productType = row.product_type;
          const sales = parseFloat(row.total_sales) || 0;

          // Track product ID and product type both when needed
          if (trackedItems.has(productId)) {
            monthData[productId] = sales;
          }

          if (trackedItems.has(productType)) {
            // Aggregate sales for product type
            monthData[productType] = (monthData[productType] || 0) + sales;
          }
        } else {
          // Salesman data - more straightforward
          const salesmanId = row.salespersonid;
          monthData[salesmanId] = parseFloat(row.total_sales) || 0;
        }
      });

      // Return as array
      const chartData = Array.from(monthlyData.values());

      // Add nice month names for display
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      chartData.forEach((dataPoint) => {
        const [year, month] = dataPoint.month.split("-");
        dataPoint.month = `${monthNames[parseInt(month) - 1]} ${year}`;
      });

      res.json(chartData);
    } catch (error) {
      console.error(`Error fetching sales trends:`, error);
      res.status(500).json({
        message: "Error fetching sales trend data",
        error: error.message,
      });
    }
  });

  // GET /api/invoices/:id - Get Single Invoice (Updated Schema)
  router.get("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const query = `
        SELECT
          i.id, i.salespersonid, i.customerid, i.createddate, i.paymenttype,
          i.total_excluding_tax, i.tax_amount, i.rounding, i.totalamountpayable,
          i.invoice_status, i.einvoice_status, i.balance_due,
          i.uuid, i.submission_uid, i.long_id, i.datetime_validated,
          i.is_consolidated, i.consolidated_invoices,
          c.name as customerName, c.tin_number, c.id_number, c.phone_number,
          (
            SELECT jsonb_build_object(
              'id', con.id,
              'uuid', con.uuid,
              'long_id', con.long_id,
              'einvoice_status', con.einvoice_status
            )
            FROM invoices con
            WHERE con.is_consolidated = true
              AND con.consolidated_invoices::jsonb ? CAST(i.id AS TEXT)
              AND con.invoice_status != 'cancelled'
            LIMIT 1
          ) as consolidated_part_of,
          COALESCE(
            json_agg(
              json_build_object(
                'id', od.id,
                'code', od.code,
                'quantity', od.quantity,
                'price', od.price,
                'freeProduct', od.freeproduct,
                'returnProduct', od.returnproduct,
                'description', od.description,
                'tax', od.tax,
                'total', od.total,
                'issubtotal', od.issubtotal
              )
              ORDER BY od.id
            ) FILTER (WHERE od.id IS NOT NULL),
            '[]'::json
          ) as products
        FROM invoices i
        LEFT JOIN customers c ON i.customerid = c.id
        LEFT JOIN order_details od ON i.id = od.invoiceid
        WHERE i.id = $1
        GROUP BY i.id, c.name, c.tin_number, c.id_number, c.phone_number
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(204).json({ message: "Invoice not found" }); // No content - neutral status code
      }

      const invoice = result.rows[0];

      // Format response (Match ExtendedInvoiceData)
      res.json({
        id: invoice.id,
        salespersonid: invoice.salespersonid,
        customerid: invoice.customerid,
        createddate: invoice.createddate,
        paymenttype: invoice.paymenttype,
        total_excluding_tax: parseFloat(invoice.total_excluding_tax || 0),
        tax_amount: parseFloat(invoice.tax_amount || 0),
        rounding: parseFloat(invoice.rounding || 0),
        totalamountpayable: parseFloat(invoice.totalamountpayable || 0),
        balance_due: parseFloat(invoice.balance_due || 0),
        invoice_status: invoice.invoice_status,
        einvoice_status: invoice.einvoice_status,
        uuid: invoice.uuid,
        submission_uid: invoice.submission_uid,
        long_id: invoice.long_id,
        datetime_validated: invoice.datetime_validated,
        is_consolidated: invoice.is_consolidated || false,
        consolidated_invoices: invoice.consolidated_invoices,
        consolidated_part_of: invoice.consolidated_part_of,
        customerName: invoice.customername || invoice.customerid,
        customerTin: invoice.tin_number,
        customerIdNumber: invoice.id_number,
        customerPhone: invoice.phone_number,
        products: (invoice.products || []).map((product) => ({
          id: product.id,
          code: product.code,
          price: parseFloat(product.price || 0),
          quantity: parseInt(product.quantity || 0),
          freeProduct: parseInt(product.freeProduct || 0),
          returnProduct: parseInt(product.returnProduct || 0),
          tax: parseFloat(product.tax || 0),
          description: product.description,
          total: String(product.total || "0.00"),
          issubtotal: product.issubtotal || false,
        })),
      });
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res
        .status(500)
        .json({ message: "Error fetching invoice", error: error.message });
    }
  });

  // POST /api/invoices/submit - Create Invoice
  router.post("/submit", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const invoice = req.body; // Frontend sends data matching ExtendedInvoiceData

      // Validation
      if (
        !invoice.id ||
        !invoice.salespersonid ||
        !invoice.customerid ||
        !invoice.createddate
      ) {
        throw new Error(
          "Missing required fields: id, salespersonid, customerid, createddate"
        );
      }

      const checkQuery = "SELECT id FROM invoices WHERE id = $1";
      const checkResult = await client.query(checkQuery, [invoice.id]);
      if (checkResult.rows.length > 0) {
        return res
          .status(409) // Conflict
          .json({ message: `Invoice with ID ${invoice.id} already exists` });
      }

      // Initial balance and status - Check for CASH type
      const totalPayable = parseFloat(invoice.totalamountpayable || 0);
      const isCash = invoice.paymenttype === "CASH";
      const balance_due = isCash ? 0 : totalPayable; // Zero balance for CASH
      const invoice_status = isCash ? "paid" : "Unpaid"; // "paid" for CASH, "Unpaid" for others

      // Insert invoice
      const insertInvoiceQuery = `
        INSERT INTO invoices (
          id, salespersonid, customerid, createddate, paymenttype,
          total_excluding_tax, tax_amount, rounding, totalamountpayable,
          invoice_status, einvoice_status, balance_due
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;
      const values = [
        invoice.id,
        invoice.salespersonid,
        invoice.customerid,
        invoice.createddate,
        invoice.paymenttype || "INVOICE",
        parseFloat(invoice.total_excluding_tax || 0),
        parseFloat(invoice.tax_amount || 0),
        parseFloat(invoice.rounding || 0),
        totalPayable,
        invoice_status, // Use 'Unpaid'
        null, // einvoice_status starts as null
        balance_due, // balance_due equals total payable initially
      ];

      const invoiceResult = await client.query(insertInvoiceQuery, values);
      const createdInvoice = invoiceResult.rows[0];

      // Insert products (order_details) - NO CHANGE HERE
      if (invoice.products && invoice.products.length > 0) {
        const productQuery = `
          INSERT INTO order_details (
            invoiceid, code, price, quantity, freeproduct,
            returnproduct, description, tax, total, issubtotal
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;
        for (const product of invoice.products) {
          if (product.istotal) continue;
          await client.query(productQuery, [
            createdInvoice.id,
            product.code || (product.issubtotal ? "SUBTOTAL" : ""),
            parseFloat(product.price || 0),
            parseInt(product.quantity || 0),
            parseInt(product.freeProduct || 0),
            parseInt(product.returnProduct || 0),
            product.description || (product.issubtotal ? "Subtotal" : ""),
            parseFloat(product.tax || 0),
            String(product.total || "0.00"),
            product.issubtotal || false,
          ]);
        }
      }

      // If it's a CASH invoice, create automatic payment record
      if (isCash && totalPayable > 0) {
        // Check if payment details were provided in the request
        const paymentMethod = invoice.payment_method || "cash";
        const paymentReference = invoice.payment_reference || null;
        const paymentNotes =
          invoice.payment_notes || "Automatic payment for CASH invoice";

        const paymentQuery = `
          INSERT INTO payments (
            invoice_id, payment_date, amount_paid, payment_method,
            payment_reference, notes
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await client.query(paymentQuery, [
          createdInvoice.id,
          new Date().toISOString(),
          totalPayable,
          paymentMethod, // Use provided payment method
          paymentReference, // Use provided reference
          paymentNotes, // Use provided notes or default
        ]);
      }

      // Update customer credit if INVOICE type - NO CHANGE HERE
      if (createdInvoice.paymenttype === "INVOICE") {
        await updateCustomerCredit(
          client,
          createdInvoice.customerid,
          createdInvoice.totalamountpayable // Add full amount to credit used
        );
      }

      await client.query("COMMIT");

      // Format response (Match ExtendedInvoiceData, include balance_due)
      res.status(201).json({
        message: "Invoice created successfully",
        invoice: {
          ...createdInvoice,
          total_excluding_tax: parseFloat(
            createdInvoice.total_excluding_tax || 0
          ),
          tax_amount: parseFloat(createdInvoice.tax_amount || 0),
          rounding: parseFloat(createdInvoice.rounding || 0),
          totalamountpayable: parseFloat(
            createdInvoice.totalamountpayable || 0
          ),
          balance_due: parseFloat(createdInvoice.balance_due || 0), // Include parsed balance
          products: invoice.products || [],
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error submitting invoice:", error);
      // Send specific duplicate error if applicable
      if (error.message && error.message.includes("already exists")) {
        res.status(409).json({ message: error.message });
      } else {
        res
          .status(500)
          .json({ message: "Error submitting invoice", error: error.message });
      }
    } finally {
      client.release();
    }
  });

  // POST /api/invoices/submit-invoices - Batch Submission (Revised for Response Consistency)
  router.post("/submit-invoices", async (req, res) => {
    const fieldsParam = req.query.fields;
    const isMinimal = fieldsParam === "minimal";
    const client = await pool.connect(); // DB client for initial inserts

    // Arrays to track outcomes
    const dbResults = { success: [], errors: [], duplicates: [] };
    const savedInvoiceDataForEInvoice = []; // Data for MyInvois API call
    const invoicePayloads = Array.isArray(req.body) ? req.body : [req.body]; // Original payloads

    try {
      // --- Step 1: Process and Save Invoices to Database ---
      await client.query("BEGIN");

      for (const invoice of invoicePayloads) {
        // Transform input (Map mobile fields to NEW schema fields)

        // Check if the invoice is CASH type
        const isCash = (invoice.paymentType || "INVOICE") === "CASH";
        const totalPayable = Number(invoice.totalAmountPayable || 0);

        const transformedInvoice = {
          id: String(invoice.billNumber),
          salespersonid: invoice.salespersonId,
          customerid: invoice.customerId,
          createddate: invoice.createdDate || Date.now().toString(),
          paymenttype: invoice.paymentType || "INVOICE",
          total_excluding_tax: Number(invoice.amount || 0), // Use 'amount' from mobile
          tax_amount: 0, // <<< Hardcoded to 0 as per requirement
          rounding: Number(invoice.rounding || 0),
          totalamountpayable: Number(invoice.totalAmountPayable || 0),
          invoice_status: isCash ? "paid" : "Unpaid", // Mark CASH as paid immediately
          balance_due: isCash ? 0 : totalPayable, // Zero balance for CASH
          // Initialize e-invoice fields as null
          uuid: null,
          submission_uid: null,
          long_id: null,
          datetime_validated: null,
          is_consolidated: false,
          consolidated_invoices: null,
          einvoice_status: null,
        };

        try {
          const checkQuery = "SELECT id FROM invoices WHERE id = $1";
          const checkResult = await client.query(checkQuery, [
            transformedInvoice.id,
          ]);
          if (checkResult.rows.length > 0) {
            throw {
              code: "DUPLICATE_DB",
              message: `Invoice ${transformedInvoice.id} already exists in database`,
            };
          }

          // --- Fetch Product Descriptions ---
          let productDescriptions = {};
          if (invoice.products && invoice.products.length > 0) {
            const productCodes = invoice.products
              .filter((p) => !p.description && p.code)
              .map((p) => p.code);
            if (productCodes.length > 0) {
              const descQuery =
                "SELECT id, description FROM products WHERE id = ANY($1)";
              const descResult = await client.query(descQuery, [productCodes]);
              productDescriptions = descResult.rows.reduce((map, row) => {
                map[row.id] = row.description;
                return map;
              }, {});
            }
          }
          // --- End Fetch Product Descriptions ---

          // Insert Invoice Record
          const insertInvoiceQuery = `
            INSERT INTO invoices (
              id, salespersonid, customerid, createddate, paymenttype,
              total_excluding_tax, tax_amount, rounding, totalamountpayable, invoice_status,
              uuid, submission_uid, long_id, datetime_validated, is_consolidated,
              consolidated_invoices, einvoice_status, balance_due
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *`;
          const invoiceResult = await client.query(insertInvoiceQuery, [
            transformedInvoice.id,
            transformedInvoice.salespersonid,
            transformedInvoice.customerid,
            transformedInvoice.createddate,
            transformedInvoice.paymenttype,
            transformedInvoice.total_excluding_tax,
            transformedInvoice.tax_amount, // tax_amount is 0
            transformedInvoice.rounding,
            transformedInvoice.totalamountpayable,
            transformedInvoice.invoice_status,
            transformedInvoice.uuid,
            transformedInvoice.submission_uid,
            transformedInvoice.long_id,
            transformedInvoice.datetime_validated,
            transformedInvoice.is_consolidated,
            transformedInvoice.consolidated_invoices,
            transformedInvoice.einvoice_status,
            transformedInvoice.balance_due,
          ]);
          const savedInvoice = invoiceResult.rows[0];

          // Prepare and Insert Products (Order Details)
          const orderDetailsForEInvoice = [];
          if (invoice.products && invoice.products.length > 0) {
            const productQuery = `
              INSERT INTO order_details (invoiceid, code, price, quantity, freeproduct, returnproduct, description, tax, total, issubtotal)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

            for (const product of invoice.products) {
              const quantity = Number(product.quantity) || 0;
              const price = Number(product.price) || 0;
              const tax = 0; // <<< Hardcoded to 0
              const freeProduct = Number(product.freeProduct || 0);
              const returnProduct = Number(product.returnProduct || 0);
              const total = (quantity * price).toFixed(2); // Calculate total without tax
              const description =
                product.description || productDescriptions[product.code] || "";

              await client.query(productQuery, [
                savedInvoice.id,
                product.code,
                price,
                quantity,
                freeProduct,
                returnProduct,
                description,
                tax,
                total,
                false, // Assume mobile doesn't send subtotals
              ]);

              orderDetailsForEInvoice.push({
                code: product.code,
                price,
                quantity,
                tax,
                total,
                description,
                freeProduct,
                returnProduct,
              });
            }
          }

          // If it's a CASH invoice, create automatic payment record
          if (isCash && totalPayable > 0) {
            try {
              const paymentQuery = `
                INSERT INTO payments (
                  invoice_id, payment_date, amount_paid, payment_method,
                  payment_reference, notes
                ) VALUES ($1, $2, $3, $4, $5, $6)
              `;
              await client.query(paymentQuery, [
                savedInvoice.id,
                new Date().toISOString(),
                totalPayable,
                "cash", // Default payment method for CASH invoices
                null,
                "Automatic payment for CASH invoice",
              ]);
            } catch (paymentError) {
              console.error(
                `Failed to create automatic payment for CASH invoice ${savedInvoice.id}:`,
                paymentError
              );
              // Continue processing - the invoice is still marked as paid even if payment record fails
            }
          }

          // Update customer credit if INVOICE type - NO CHANGE HERE
          if (savedInvoice.paymenttype === "INVOICE") {
            await updateCustomerCredit(
              client,
              savedInvoice.customerid,
              savedInvoice.totalamountpayable // Add full amount to credit used
            );
          }

          // Prepare data for the subsequent e-invoice step
          savedInvoiceDataForEInvoice.push({
            ...savedInvoice, // Use the actual data saved to DB
            orderDetails: orderDetailsForEInvoice,
            // Add derived fields if needed by EInvoiceTemplate
            date: new Date(Number(savedInvoice.createddate)),
            time: new Date(Number(savedInvoice.createddate))
              .toTimeString()
              .substring(0, 5),
            type: savedInvoice.paymenttype,
          });
          dbResults.success.push({ billNumber: savedInvoice.id }); // Minimal success info for DB step
        } catch (error) {
          if (error.code === "DUPLICATE_DB") {
            dbResults.duplicates.push({
              billNumber: invoice.billNumber,
              message: error.message,
            });
          } else {
            console.error(
              `Error processing invoice ${invoice.billNumber} for DB save:`,
              error
            );
            dbResults.errors.push({
              billNumber: invoice.billNumber,
              message: error.message || "Unknown DB error",
            });
          }
        }
      } // End loop through incoming invoices

      // --- Handle DB Save Outcomes ---
      // (Same logic as before to check if all failed, rollback if needed)
      if (dbResults.success.length === 0) {
        await client.query("ROLLBACK");
        const statusCode = dbResults.errors.length > 0 ? 400 : 409;
        const message =
          dbResults.errors.length > 0
            ? "All invoices failed database processing."
            : "All invoices already exist in the database.";
        // *** RESPONSE CONSISTENCY: Mimic old error format if possible ***
        if (isMinimal) {
          // Try to match the old minimal failure response
          const minimalErrors = [
            ...dbResults.errors,
            ...dbResults.duplicates,
          ].map((err) => ({
            id: err.billNumber,
            systemStatus: 100, // Error
            einvoiceStatus: 20, // Not Processed
            error: { code: err.code || "DB_ERROR", message: err.message },
          }));
          return res.status(statusCode).json({
            message: message,
            invoices: minimalErrors,
            overallStatus: "Invalid",
          });
        } else {
          // Try to match the old standard failure response
          return res.status(statusCode).json({
            message: message,
            errors: [...dbResults.errors, ...dbResults.duplicates],
            overallStatus: "Invalid",
          });
        }
      }

      // Commit successful DB inserts/updates
      await client.query("COMMIT");
    } catch (dbError) {
      await client.query("ROLLBACK");
      console.error("Critical error during database processing:", dbError);
      // *** RESPONSE CONSISTENCY: Mimic old error format ***
      if (isMinimal) {
        return res.status(500).json({
          message: "Database transaction failed",
          invoices: [],
          overallStatus: "SystemError",
        });
      } else {
        return res.status(500).json({
          message: "Database transaction failed",
          error: dbError.message,
          overallStatus: "SystemError",
        });
      }
    } finally {
      client.release();
    }

    // --- Step 2: Submit Successfully Saved Invoices to MyInvois ---
    let einvoiceResults = null; // Raw result from the utility
    let einvoiceUpdateErrors = []; // DB update errors for e-invoice status

    if (savedInvoiceDataForEInvoice.length > 0) {
      try {
        einvoiceResults = await submitInvoicesToMyInvois(
          config, // Pass the main config object
          savedInvoiceDataForEInvoice,
          fetchCustomerDataWithCache
        );

        // --- Step 3: Update Database with E-Invoice Results ---
        if (
          einvoiceResults &&
          (einvoiceResults.acceptedDocuments?.length > 0 ||
            einvoiceResults.rejectedDocuments?.length > 0)
        ) {
          const updateClient = await pool.connect();
          try {
            await updateClient.query("BEGIN");

            // Update Accepted
            if (einvoiceResults.acceptedDocuments?.length > 0) {
              const updateAcceptedQuery = `
    UPDATE invoices SET uuid = $1, submission_uid = $2, long_id = $3,
           datetime_validated = $4, einvoice_status = $5
    WHERE id = $6`;
              for (const doc of einvoiceResults.acceptedDocuments) {
                // Ensure proper status determination: valid if has longId, pending if has UUID but no longId
                const status = doc.longId
                  ? "valid"
                  : doc.uuid
                  ? "pending"
                  : null;
                const validatedTime = doc.dateTimeValidated
                  ? new Date(doc.dateTimeValidated)
                  : null;
                try {
                  await updateClient.query(updateAcceptedQuery, [
                    doc.uuid,
                    doc.submissionUid,
                    doc.longId || null,
                    validatedTime,
                    status,
                    doc.internalId,
                  ]);
                } catch (updateError) {
                  einvoiceUpdateErrors.push({
                    invoiceId: doc.internalId,
                    type: "accepted",
                    error: updateError.message,
                  });
                }
              }
            }
            // Update Rejected
            if (einvoiceResults.rejectedDocuments?.length > 0) {
              const updateRejectedQuery = `UPDATE invoices SET einvoice_status = 'invalid' WHERE id = $1`;
              for (const doc of einvoiceResults.rejectedDocuments) {
                const invoiceId = doc.internalId || doc.invoiceCodeNumber;
                if (!invoiceId) continue;

                // Skip updating status for validation errors (especially missing TIN/ID)
                const isValidationError =
                  doc.error?.code === "MISSING_REQUIRED_ID" ||
                  doc.error?.code === "MISSING_TIN" ||
                  doc.error?.code === "CF001" ||
                  doc.error?.message?.toLowerCase().includes("tin") ||
                  doc.error?.message?.toLowerCase().includes("id number") ||
                  doc.error?.message
                    ?.toLowerCase()
                    .includes("missing tin number or id number");

                if (isValidationError) {
                  console.log(
                    `Skipping einvoice_status update for validation error on invoice ${invoiceId}: ${doc.error?.message}`
                  );
                  continue;
                }

                try {
                  await updateClient.query(updateRejectedQuery, [invoiceId]);
                } catch (updateError) {
                  einvoiceUpdateErrors.push({
                    invoiceId: invoiceId,
                    type: "rejected",
                    error: updateError.message,
                  });
                }
              }
            }
            await updateClient.query("COMMIT");
          } catch (error) {
            await updateClient.query("ROLLBACK");
            einvoiceUpdateErrors.push({
              invoiceId: " general",
              type: "transaction",
              error: error.message,
            });
          } finally {
            updateClient.release();
          }
        }
      } catch (einvoiceError) {
        console.error(
          "Error submitting to or processing response from MyInvois:",
          einvoiceError
        );
        if (!einvoiceResults)
          einvoiceResults = {
            success: false,
            message: "MyInvois submission failed",
            error: einvoiceError.message || "Unknown API error",
            acceptedDocuments: [],
            rejectedDocuments: [],
          };
        else {
          einvoiceResults.success = false;
          einvoiceResults.message =
            einvoiceResults.message || "MyInvois processing failed";
          einvoiceResults.error = einvoiceError.message || "Unknown API error";
        }
      }
    }

    // --- Step 4: Construct Final Response (Prioritizing Consistency) ---

    let statusCode = 200; // Default OK
    let overallStatus = "Success"; // Assume success unless proven otherwise
    let responseMessage = "Invoice processing completed.";

    // Determine final status based on DB and E-invoice outcomes
    const dbFailedCount = dbResults.errors.length + dbResults.duplicates.length;
    const einvoiceRejectedCount =
      einvoiceResults?.rejectedDocuments?.length || 0;
    const einvoiceAcceptedCount =
      einvoiceResults?.acceptedDocuments?.length || 0;
    const einvoiceAttemptedCount = savedInvoiceDataForEInvoice.length;
    const didEInvoiceFailCompletely =
      einvoiceResults &&
      !einvoiceResults.success &&
      einvoiceAcceptedCount === 0 &&
      einvoiceRejectedCount === 0;

    if (dbFailedCount === invoicePayloads.length) {
      // All failed DB
      statusCode = dbResults.errors.length > 0 ? 400 : 409;
      overallStatus = "Invalid";
      responseMessage =
        dbResults.errors.length > 0
          ? "All invoices failed database processing."
          : "All invoices already exist in the database.";
    } else if (
      dbFailedCount > 0 ||
      einvoiceRejectedCount > 0 ||
      didEInvoiceFailCompletely ||
      einvoiceUpdateErrors.length > 0
    ) {
      statusCode = 207; // Multi-status for partial success/failures
      overallStatus = "Partial";
      if (
        einvoiceRejectedCount === einvoiceAttemptedCount &&
        einvoiceAttemptedCount > 0
      ) {
        statusCode = 422; // All e-invoices rejected
        overallStatus = "EInvoiceInvalid";
        responseMessage =
          "Invoices saved to DB, but all failed e-invoice submission.";
      } else if (didEInvoiceFailCompletely) {
        overallStatus = "EInvoiceSystemError";
        responseMessage = "Invoices saved to DB, but e-invoice system failed.";
      } else {
        responseMessage = "Invoice processing completed with some issues.";
      }
    } else if (
      dbResults.success.length === invoicePayloads.length &&
      einvoiceAcceptedCount === einvoiceAttemptedCount
    ) {
      statusCode = 201; // All created successfully
      overallStatus = "Success";
    }

    // *** RESPONSE CONSISTENCY LOGIC ***
    if (isMinimal) {
      // Construct the minimal response, aiming for the old format
      const minimalInvoices = invoicePayloads.map((inv) => {
        const billNo = String(inv.billNumber); // Original ID from payload
        let systemStatus = 100; // Default error
        let einvoiceStatus = 20; // Default Not Processed
        let error = null;

        const dbSuccess = dbResults.success.find(
          (r) => r.billNumber === billNo
        );
        const dbError = dbResults.errors.find((r) => r.billNumber === billNo);
        const dbDuplicate = dbResults.duplicates.find(
          (r) => r.billNumber === billNo
        );
        const einvAccepted = einvoiceResults?.acceptedDocuments?.find(
          (d) => d.internalId === billNo
        );
        const einvRejected = einvoiceResults?.rejectedDocuments?.find(
          (d) => d.internalId === billNo || d.invoiceCodeNumber === billNo
        );

        if (dbSuccess) systemStatus = 0; // DB Success
        if (dbError) error = { code: "DB_ERROR", message: dbError.message };
        if (dbDuplicate)
          error = { code: "DUPLICATE_DB", message: dbDuplicate.message };

        // E-invoice status overrides (only if DB save was successful)
        if (systemStatus === 0) {
          if (einvAccepted) {
            einvoiceStatus = einvAccepted.longId ? 0 : 10; // 0=Valid, 10=Pending
          } else if (einvRejected) {
            // Determine the appropriate error code based on the error details
            const errorCode = einvRejected.error?.code || "";
            const errorMessage = einvRejected.error?.message || "";

            if (
              errorMessage.toLowerCase().includes("tin") ||
              errorCode.toLowerCase().includes("tin") ||
              errorMessage.toLowerCase().includes("id number")
            ) {
              einvoiceStatus = 101; // Missing TIN/ID
            } else if (
              errorMessage.toLowerCase().includes("duplicate") ||
              errorCode.toLowerCase().includes("duplicate")
            ) {
              einvoiceStatus = 102; // Duplicate e-invoice
            } else {
              einvoiceStatus = 100; // Default e-invoice error
            }

            error = {
              code: errorCode || "EINVOICE_REJECTED",
              message: errorMessage || "E-invoice rejected",
            };
          } else if (didEInvoiceFailCompletely) {
            einvoiceStatus = 103; // Other error (system error)
            error = {
              code: "EINVOICE_API_ERROR",
              message: einvoiceResults?.error || "E-invoice submission failed",
            };
          }
        }

        return {
          id: billNo,
          systemStatus,
          einvoiceStatus,
          error: error || undefined, // Omit if no error
          // Include UUID/LongID ONLY if accepted (status 0 or 10)
          uuid:
            einvoiceStatus === 0 || einvoiceStatus === 10
              ? einvAccepted?.uuid
              : undefined,
          longId: einvoiceStatus === 0 ? einvAccepted?.longId : undefined, // Only if 'valid' (status 0)
        };
      });

      return res.status(statusCode).json({
        message: responseMessage,
        invoices: minimalInvoices,
        overallStatus: overallStatus, // Provide overall summary
      });
    } else {
      // Construct the STANDARD response, aiming for the old format
      // OLD Standard format expected: { message, results[], errors[]?, einvoice? }

      // 'results' array should only contain successfully saved DB invoices
      const standardResults = dbResults.success.map((s) => ({
        billNumber: s.billNumber,
        status: "success", // Old format might just have this simple status
        message: "Invoice created successfully", // Old generic message
        // Don't include detailed e-invoice status here directly, put in separate 'einvoice' key
      }));

      // 'errors' array contains DB duplicates and other DB errors
      const standardErrors = [...dbResults.duplicates, ...dbResults.errors].map(
        (e) => ({
          billNumber: e.billNumber,
          status: "error",
          message: e.message,
        })
      );

      // 'einvoice' object contains the results of the e-invoice attempt
      // Mimic the structure the old frontend might expect from the e-invoice utility
      const standardEInvoice = einvoiceResults
        ? {
            success: einvoiceResults.success,
            message: einvoiceResults.message,
            error: einvoiceResults.error, // Raw error message if API failed
            acceptedDocuments: einvoiceResults.acceptedDocuments?.map(
              (doc) => ({
                // Map to fields the old frontend might have used
                internalId: doc.internalId,
                uuid: doc.uuid,
                longId: doc.longId,
                status: doc.longId ? "Valid" : "Pending", // Translate status
                // ... other relevant fields like dateTimeValidated?
              })
            ),
            rejectedDocuments: einvoiceResults.rejectedDocuments?.map(
              (doc) => ({
                internalId: doc.internalId || doc.invoiceCodeNumber,
                status: "Rejected",
                error: {
                  // Try to match old error structure
                  code: doc.error?.code || "REJECTED",
                  message:
                    doc.error?.message || "E-invoice submission rejected",
                  // maybe details: doc.error?.details
                },
              })
            ),
            // Add overall status if the old frontend used it
            overallStatus: einvoiceResults.overallStatus,
          }
        : null; // Set to null if e-invoice wasn't attempted

      // Add DB update errors to the main error list? Or separate key?
      // For consistency with older format, maybe just log them server-side
      if (einvoiceUpdateErrors.length > 0) {
        console.error(
          "E-invoice DB update errors occurred:",
          einvoiceUpdateErrors
        );
        // Optionally add a generic note to the main message if consistency allows
        // responseMessage += " Note: Some local e-invoice status updates failed.";
      }

      return res.status(statusCode).json({
        message: responseMessage,
        results: standardResults.length > 0 ? standardResults : undefined, // Omit if empty
        errors: standardErrors.length > 0 ? standardErrors : undefined, // Omit if empty
        einvoice: standardEInvoice, // Include e-invoice results separately
      });
    }
  }); // End POST /submit-invoices

  // DELETE /api/invoices/:id - Cancel Invoice (Update Status and Cancel Payments)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Get Invoice details for credit adjustment and e-invoice check
      const invoiceQuery = `
        SELECT id, customerid, paymenttype, totalamountpayable, balance_due, uuid, einvoice_status, invoice_status
        FROM invoices
        WHERE id = $1 FOR UPDATE`; // Lock row
      const invoiceResult = await client.query(invoiceQuery, [id]);

      if (invoiceResult.rows.length === 0) {
        await client.query("ROLLBACK"); // Release lock early
        return res.status(404).json({ message: "Invoice not found" });
      }
      const invoice = invoiceResult.rows[0];
      const invoiceTotal = parseFloat(invoice.totalamountpayable || 0);

      // If already cancelled, do nothing
      if (invoice.invoice_status === "cancelled") {
        await client.query("ROLLBACK"); // Release lock
        return res
          .status(400)
          .json({ message: "Invoice is already cancelled" });
      }

      // 2. Find and cancel ACTIVE payments associated with this invoice
      const activePaymentsQuery = `
        SELECT payment_id, amount_paid
        FROM payments 
        WHERE invoice_id = $1 AND (status IS NULL OR status = 'active')
        FOR UPDATE -- Lock payment rows as well
      `;
      const activePaymentsResult = await client.query(activePaymentsQuery, [
        id,
      ]);
      const activePayments = activePaymentsResult.rows;

      if (activePayments.length > 0) {
        const cancelPaymentQuery = `
          UPDATE payments 
          SET status = 'cancelled', 
              cancellation_date = NOW(),
              cancellation_reason = $1 
          WHERE payment_id = $2
        `;
        const cancellationReason = `Invoice ${id} cancelled`;

        for (const payment of activePayments) {
          const paidAmount = parseFloat(payment.amount_paid || 0);

          // Cancel the payment record
          await client.query(cancelPaymentQuery, [
            cancellationReason,
            payment.payment_id,
          ]);

          // Reverse customer credit adjustment ONLY if the original invoice was an INVOICE type
          if (invoice.paymenttype === "INVOICE" && paidAmount !== 0) {
            // Add the paid amount BACK to credit_used (reversing the payment's effect)
            await updateCustomerCredit(
              client,
              invoice.customerid,
              paidAmount // Positive amount increases credit_used
            );
          }
        }
      }

      // --- END: Added Logic for Cancelling Payments ---

      // 3. Adjust Customer Credit for the INVOICE TOTAL (This reverses the initial credit impact of creating the invoice)
      // This logic remains the same as before.
      if (invoice.paymenttype === "INVOICE" && invoiceTotal !== 0) {
        await updateCustomerCredit(
          client,
          invoice.customerid,
          -invoiceTotal // Negative amount decreases credit_used
        );
      }

      // 4. Attempt to Cancel E-Invoice via API (Existing logic)
      let einvoiceCancelledApi = false;
      if (invoice.uuid && invoice.einvoice_status !== "cancelled") {
        try {
          await apiClient.makeApiCall(
            "PUT",
            `/api/v1.0/documents/state/${invoice.uuid}/state`,
            { status: "cancelled", reason: "Invoice cancelled" }
          );
          einvoiceCancelledApi = true;
        } catch (cancelError) {
          console.error(
            `Error cancelling e-invoice ${invoice.uuid} via API:`,
            cancelError
          );
          // Log error but continue - local status should still be updated
          if (cancelError.status === 400) {
            console.warn(
              `E-invoice ${invoice.uuid} might already be cancelled or in a non-cancellable state.`
            );
            einvoiceCancelledApi = true; // Assume cancelled if API fails in a way suggesting it's done
          }
        }
      }

      // 5. Update Invoice Status in DB
      const newEInvoiceStatus = einvoiceCancelledApi
        ? "cancelled"
        : invoice.einvoice_status;
      const updateInvoiceQuery = `
        UPDATE invoices 
        SET invoice_status = 'cancelled', 
            einvoice_status = $1,
            balance_due = 0 -- Set balance to 0 when cancelling
            -- Optionally add a cancellation_timestamp column
        WHERE id = $2
        RETURNING *`; // Fetch the updated row

      const updateResult = await client.query(updateInvoiceQuery, [
        newEInvoiceStatus,
        id,
      ]);

      await client.query("COMMIT");

      // Format and return the final cancelled invoice data
      const finalCancelledInvoice = updateResult.rows[0];
      res.status(200).json({
        message:
          "Invoice and associated active payments cancelled successfully",
        deletedInvoice: {
          // using deletedInvoice to match the old format for mobile app to work
          ...finalCancelledInvoice,
          total_excluding_tax: parseFloat(
            finalCancelledInvoice.total_excluding_tax || 0
          ),
          tax_amount: parseFloat(finalCancelledInvoice.tax_amount || 0),
          rounding: parseFloat(finalCancelledInvoice.rounding || 0),
          totalamountpayable: parseFloat(
            finalCancelledInvoice.totalamountpayable || 0
          ),
          balance_due: parseFloat(finalCancelledInvoice.balance_due || 0), // Should be 0 now
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling invoice and payments:", error); // Updated log message
      res.status(500).json({
        message: "Error cancelling invoice and payments",
        error: error.message,
      }); // Updated error message
    } finally {
      client.release();
    }
  });

  // PUT /api/invoices/:id/uuid - Update invoice UUID manually
  router.put("/:id/uuid", async (req, res) => {
    const { id } = req.params;
    const { uuid } = req.body;

    if (!uuid || !uuid.trim()) {
      return res.status(400).json({ message: "UUID is required" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if invoice exists and get current status
      const invoiceCheck = await client.query(
        "SELECT invoice_status, einvoice_status FROM invoices WHERE id = $1",
        [id]
      );

      if (invoiceCheck.rows.length === 0) {
        throw new Error("Invoice not found");
      }

      const currentInvoice = invoiceCheck.rows[0];

      // Only allow UUID setting for invoices with null einvoice_status
      if (currentInvoice.einvoice_status !== null) {
        throw new Error(
          "Can only set UUID for invoices with null e-invoice status"
        );
      }

      // Prevent changes for cancelled invoices
      if (currentInvoice.invoice_status === "cancelled") {
        throw new Error("Cannot set UUID for cancelled invoices");
      }

      // Check if UUID already exists in system
      const uuidCheck = await client.query(
        "SELECT id FROM invoices WHERE uuid = $1 AND id != $2",
        [uuid.trim(), id]
      );

      if (uuidCheck.rows.length > 0) {
        throw new Error("This UUID is already assigned to another invoice");
      }

      // Update the invoice
      const updateQuery = `
      UPDATE invoices 
      SET uuid = $1
      WHERE id = $2
      RETURNING id
    `;

      const result = await client.query(updateQuery, [uuid.trim(), id]);

      if (result.rows.length === 0) {
        throw new Error("Failed to update invoice");
      }

      await client.query("COMMIT");

      res.json({
        message: "UUID updated successfully",
        invoiceId: id,
        uuid: uuid.trim(),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating UUID:", error);
      res
        .status(error.message === "Invoice not found" ? 404 : 400)
        .json({ message: error.message || "Error updating UUID" });
    } finally {
      client.release();
    }
  });

  // PUT /api/invoices/:id/customer - Update customer for invoice
  router.put("/:id/customer", async (req, res) => {
    const { id } = req.params;
    const { customerid, confirmEInvoiceCancellation } = req.body;

    // Validation
    if (!customerid) {
      return res.status(400).json({
        message: "Customer ID is required",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. First, get the current invoice to check status
      const invoiceCheckQuery = `
      SELECT id, customerid, einvoice_status, invoice_status, uuid, submission_uid, datetime_validated
      FROM invoices 
      WHERE id = $1
    `;
      const invoiceResult = await client.query(invoiceCheckQuery, [id]);

      if (invoiceResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Invoice not found",
        });
      }

      const invoice = invoiceResult.rows[0];

      // 2. Validate that the invoice is not cancelled
      if (invoice.invoice_status === "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot change customer for cancelled invoices",
        });
      }

      // 3. Check if this is critical e-Invoice data change
      const requiresConfirmation =
        invoice.einvoice_status !== null &&
        invoice.einvoice_status !== "cancelled";

      if (requiresConfirmation && !confirmEInvoiceCancellation) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Customer change requires e-Invoice cancellation confirmation",
          requiresConfirmation: true,
          currentEInvoiceStatus: invoice.einvoice_status,
        });
      }

      // 4. If confirmation provided, attempt to cancel e-invoice via API and clear fields
      if (requiresConfirmation && confirmEInvoiceCancellation) {
        let apiCancellationSuccess = false;

        // Try to cancel via MyInvois API if UUID exists
        if (invoice.uuid && invoice.einvoice_status !== "cancelled") {
          try {
            // Using the API client logic you provided
            await apiClient.makeApiCall(
              "PUT",
              `/api/v1.0/documents/state/${invoice.uuid}/state`,
              { status: "cancelled", reason: "Customer information updated" }
            );
            apiCancellationSuccess = true;
          } catch (cancelError) {
            console.error(
              `Error cancelling e-invoice ${invoice.uuid} via API:`,
              cancelError
            );
            if (cancelError.status === 400) {
              console.warn(
                `E-invoice ${invoice.uuid} might already be cancelled or in a non-cancellable state.`
              );
              apiCancellationSuccess = true;
            }
          }
        }

        // Clear e-invoice fields regardless of API result
        const clearEInvoiceQuery = `
        UPDATE invoices 
        SET uuid = NULL, 
            submission_uid = NULL, 
            long_id = NULL,
            datetime_validated = NULL, 
            einvoice_status = NULL
        WHERE id = $1
      `;
        await client.query(clearEInvoiceQuery, [id]);
      }

      // 5. Check if the new customer exists
      const customerCheckQuery = `
      SELECT id, name FROM customers WHERE id = $1
    `;
      const customerResult = await client.query(customerCheckQuery, [
        customerid,
      ]);

      if (customerResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Customer with ID '${customerid}' not found`,
        });
      }

      // 6. Update the invoice with the new customer
      const updateQuery = `
      UPDATE invoices 
      SET customerid = $1
      WHERE id = $2
      RETURNING *
    `;
      const updateResult = await client.query(updateQuery, [customerid, id]);

      await client.query("COMMIT");

      // 7. Return success response
      res.json({
        message: "Customer updated successfully",
        invoice: {
          id: updateResult.rows[0].id,
          customerid: updateResult.rows[0].customerid,
          customerName: customerResult.rows[0].name,
          oldCustomerId: invoice.customerid,
        },
        einvoiceCleared: requiresConfirmation && confirmEInvoiceCancellation,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating invoice customer:", error);
      res.status(500).json({
        message: "Error updating invoice customer",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // PUT /api/invoices/:id/salesman - Update invoice salesman
  router.put("/:id/salesman", async (req, res) => {
    const { id } = req.params;
    const { salespersonid } = req.body;

    if (!salespersonid) {
      return res.status(400).json({ message: "Salesperson ID is required" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if invoice exists and get current status
      const invoiceCheck = await client.query(
        "SELECT invoice_status FROM invoices WHERE id = $1",
        [id]
      );

      if (invoiceCheck.rows.length === 0) {
        throw new Error("Invoice not found");
      }

      // Only prevent changes for cancelled invoices
      if (invoiceCheck.rows[0].invoice_status === "cancelled") {
        throw new Error("Cannot change salesman for cancelled invoices");
      }

      // Verify salesperson exists
      const staffCheck = await client.query(
        "SELECT id FROM staffs WHERE id = $1",
        [salespersonid]
      );

      if (staffCheck.rows.length === 0) {
        throw new Error("Salesperson not found");
      }

      // Update the invoice
      const updateQuery = `
      UPDATE invoices 
      SET salespersonid = $1
      WHERE id = $2
      RETURNING id
    `;

      const result = await client.query(updateQuery, [salespersonid, id]);

      if (result.rows.length === 0) {
        throw new Error("Failed to update invoice");
      }

      await client.query("COMMIT");

      res.json({
        message: "Salesman updated successfully",
        invoiceId: id,
        salespersonid: salespersonid,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating salesman:", error);
      res
        .status(error.message === "Invoice not found" ? 404 : 400)
        .json({ message: error.message || "Error updating salesman" });
    } finally {
      client.release();
    }
  });

  // PUT /api/invoices/:id/paymenttype - Update invoice payment type
  router.put("/:id/paymenttype", async (req, res) => {
    const { id } = req.params;
    const { paymenttype } = req.body;

    if (!paymenttype || !["CASH", "INVOICE"].includes(paymenttype)) {
      return res
        .status(400)
        .json({ message: "Valid payment type (CASH or INVOICE) is required" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if invoice exists and get current status
      const invoiceCheck = await client.query(
        "SELECT invoice_status, paymenttype, balance_due, totalamountpayable FROM invoices WHERE id = $1",
        [id]
      );

      if (invoiceCheck.rows.length === 0) {
        throw new Error("Invoice not found");
      }

      const currentInvoice = invoiceCheck.rows[0];

      // Only prevent changes for cancelled invoices
      if (currentInvoice.invoice_status === "cancelled") {
        throw new Error("Cannot change payment type for cancelled invoices");
      }

      const currentPaymentType = currentInvoice.paymenttype;

      // If no change in payment type, return early
      if (currentPaymentType === paymenttype) {
        await client.query("COMMIT");
        return res.json({
          message: "Payment type unchanged",
          invoiceId: id,
          paymenttype: paymenttype,
        });
      }

      // Handle INVOICE to CASH conversion
      if (currentPaymentType === "INVOICE" && paymenttype === "CASH") {
        // Create automatic payment for the full amount
        const paymentAmount = currentInvoice.totalamountpayable;
        const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

        const insertPaymentQuery = `
        INSERT INTO payments (invoice_id, payment_date, payment_method, amount_paid, notes, status)
        VALUES ($1, $2, 'cash', $3, 'Automatic payment - converted from INVOICE to CASH', 'active')
        RETURNING payment_id
      `;

        await client.query(insertPaymentQuery, [id, today, paymentAmount]);

        // Update invoice to CASH type with zero balance and paid status
        const updateInvoiceQuery = `
        UPDATE invoices 
        SET paymenttype = $1, balance_due = 0, invoice_status = $2
        WHERE id = $3
        RETURNING id
      `;

        await client.query(updateInvoiceQuery, ["CASH", "Paid", id]);
      }
      // Handle CASH to INVOICE conversion
      else if (currentPaymentType === "CASH" && paymenttype === "INVOICE") {
        // Find and cancel the automatic payment if it exists
        const findPaymentQuery = `
        SELECT payment_id FROM payments 
        WHERE invoice_id = $1 AND payment_method = 'cash' 
        AND notes LIKE '%Automatic payment%' 
        AND (status IS NULL OR status = 'active')
        ORDER BY payment_date DESC 
        LIMIT 1
      `;

        const paymentResult = await client.query(findPaymentQuery, [id]);

        if (paymentResult.rows.length > 0) {
          const payment = paymentResult.rows[0];

          // Cancel the automatic payment
          const cancelPaymentQuery = `
          UPDATE payments 
          SET status = 'cancelled', notes = CONCAT(notes, ' - Cancelled due to payment type change')
          WHERE payment_id = $1
        `;

          await client.query(cancelPaymentQuery, [payment.payment_id]);
        }

        // Update invoice to INVOICE type with full balance and unpaid status
        const updateInvoiceQuery = `
        UPDATE invoices 
        SET paymenttype = $1, balance_due = $2, invoice_status = $3
        WHERE id = $4
        RETURNING id
      `;

        await client.query(updateInvoiceQuery, [
          "INVOICE",
          currentInvoice.totalamountpayable,
          "Unpaid",
          id,
        ]);
      }

      await client.query("COMMIT");

      // Get updated invoice data for response
      const updatedInvoiceQuery = `
      SELECT paymenttype, balance_due, invoice_status FROM invoices WHERE id = $1
    `;
      const updatedResult = await client.query(updatedInvoiceQuery, [id]);
      const updatedInvoice = updatedResult.rows[0];

      res.json({
        message: "Payment type updated successfully",
        invoiceId: id,
        paymenttype: updatedInvoice.paymenttype,
        balance_due: parseFloat(updatedInvoice.balance_due),
        invoice_status: updatedInvoice.invoice_status,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating payment type:", error);
      res
        .status(error.message === "Invoice not found" ? 404 : 400)
        .json({ message: error.message || "Error updating payment type" });
    } finally {
      client.release();
    }
  });

  // PUT /api/invoices/:id/datetime - Update invoice date/time
  router.put("/:id/datetime", async (req, res) => {
    const { id } = req.params;
    const { createddate, confirmEInvoiceCancellation } = req.body;

    if (!createddate) {
      return res.status(400).json({ message: "Created date is required" });
    }

    // Validate that createddate is a valid epoch timestamp
    const timestamp = parseInt(createddate);
    if (isNaN(timestamp) || timestamp <= 0) {
      return res.status(400).json({ message: "Invalid timestamp format" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if invoice exists and get current status
      const invoiceCheck = await client.query(
        "SELECT id, einvoice_status, invoice_status, uuid, submission_uid, datetime_validated FROM invoices WHERE id = $1",
        [id]
      );

      if (invoiceCheck.rows.length === 0) {
        throw new Error("Invoice not found");
      }

      const invoice = invoiceCheck.rows[0];

      // Validate that the invoice is not cancelled
      if (invoice.invoice_status === "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot change date/time for cancelled invoices",
        });
      }

      // Check if this requires e-Invoice cancellation confirmation
      const requiresConfirmation =
        invoice.einvoice_status !== null &&
        invoice.einvoice_status !== "cancelled";

      if (requiresConfirmation && !confirmEInvoiceCancellation) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Date/time change requires e-Invoice cancellation confirmation",
          requiresConfirmation: true,
          currentEInvoiceStatus: invoice.einvoice_status,
        });
      }

      // If confirmation provided, attempt to cancel e-invoice and clear fields
      if (requiresConfirmation && confirmEInvoiceCancellation) {
        let apiCancellationSuccess = false;

        // Try to cancel via MyInvois API if UUID exists
        if (invoice.uuid && invoice.einvoice_status !== "cancelled") {
          try {
            await apiClient.makeApiCall(
              "PUT",
              `/api/v1.0/documents/state/${invoice.uuid}/state`,
              { status: "cancelled", reason: "Invoice date/time updated" }
            );
            apiCancellationSuccess = true;
          } catch (cancelError) {
            console.error(
              `Error cancelling e-invoice ${invoice.uuid} via API:`,
              cancelError
            );
            if (cancelError.status === 400) {
              console.warn(
                `E-invoice ${invoice.uuid} might already be cancelled or in a non-cancellable state.`
              );
              apiCancellationSuccess = true;
            }
          }
        }

        // Clear e-invoice fields regardless of API result
        const clearEInvoiceQuery = `
        UPDATE invoices 
        SET uuid = NULL, 
            submission_uid = NULL, 
            long_id = NULL,
            datetime_validated = NULL, 
            einvoice_status = NULL
        WHERE id = $1
      `;
        await client.query(clearEInvoiceQuery, [id]);
      }

      // Update the invoice
      const updateQuery = `
      UPDATE invoices 
      SET createddate = $1
      WHERE id = $2
      RETURNING id
    `;

      const result = await client.query(updateQuery, [createddate, id]);

      if (result.rows.length === 0) {
        throw new Error("Failed to update invoice");
      }

      await client.query("COMMIT");

      res.json({
        message: "Date/time updated successfully",
        invoiceId: id,
        createddate: createddate,
        einvoiceCleared: requiresConfirmation && confirmEInvoiceCancellation,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating date/time:", error);
      res
        .status(error.message === "Invoice not found" ? 404 : 400)
        .json({ message: error.message || "Error updating date/time" });
    } finally {
      client.release();
    }
  });

  return router;
}
