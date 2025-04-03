// src/routes/sales/invoices/invoices.js
import { Router } from "express";
import { submitInvoicesToMyInvois } from "../../../utils/invoice/einvoice/serverSubmissionUtil.js";
import {
  MYINVOIS_API_BASE_URL,
  MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET,
} from "../../../configs/config.js";
import EInvoiceApiClientFactory from "../../../utils/invoice/einvoice/EInvoiceApiClientFactory.js";

// Define the MyInvois configuration object
const myInvoisConfig = {
  MYINVOIS_API_BASE_URL,
  MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET,
};

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

  const apiClient = EInvoiceApiClientFactory.getInstance(myInvoisConfig);

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

  // GET /api/invoices - List Invoices (Updated Schema)
  router.get("/", async (req, res) => {
    try {
      const {
        page = 1,
        limit = 15, // Use consistent limit (e.g., 15 to match FE)
        startDate,
        endDate,
        salesman,
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
          c.name as customerName, c.tin_number as customerTin, c.id_number as customerIdNumber, c.id_type as customerIdType
      `;
      let fromClause = `
        FROM invoices i
        LEFT JOIN customers c ON i.customerid = c.id
      `;
      let whereClause = ` WHERE 1=1 `;
      let groupByClause = `GROUP BY i.id, c.name, c.tin_number, c.id_number, c.id_type`; // Grouping by primary key is sufficient if using aggregates or joins correctly

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
        customerName: row.customername || row.customerid,
        customerTin: row.customertin,
        customerIdNumber: row.customeridnumber,
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
          c.name as customerName,
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
        GROUP BY i.id, c.name
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Invoice not found" });
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
        customerName: invoice.customername || invoice.customerid,
        products: (invoice.products || []).map((product) => ({
          id: product.id, // order_details.id
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

  // POST /api/invoices/submit - Create Invoice (Updated Schema, ID immutable after this)
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
          "cash", // Default payment method for CASH invoices
          null,
          "Automatic payment for CASH invoice",
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
          invoice_status: isCash ? "paid" : "active", // Mark CASH as paid immediately
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

          // --- Fetch Product Descriptions (Keep if needed) ---
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

          // Insert Invoice Record (using NEW schema columns)
          const insertInvoiceQuery = `
            INSERT INTO invoices (
              id, salespersonid, customerid, createddate, paymenttype,
              total_excluding_tax, tax_amount, rounding, totalamountpayable, invoice_status,
              uuid, submission_uid, long_id, datetime_validated, is_consolidated,
              consolidated_invoices, einvoice_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
        console.log(
          `Attempting to submit ${savedInvoiceDataForEInvoice.length} invoices to MyInvois...`
        );
        einvoiceResults = await submitInvoicesToMyInvois(
          config, // Pass the main config object
          savedInvoiceDataForEInvoice,
          (customerId) =>
            fetchCustomerDataWithCache(pool, customerId, customerCache) // Pass bound cache helper
        );
        console.log("MyInvois submission response received.");

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
                const status = doc.longId ? "valid" : "pending";
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
    } else {
      console.log(
        "No invoices were successfully saved to DB, skipping MyInvois submission."
      );
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
        const updateError = einvoiceUpdateErrors.find(
          (e) => e.invoiceId === billNo
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
            einvoiceStatus = 100; // 100=Invalid
            error = {
              code: einvRejected.error?.code || "EINVOICE_REJECTED",
              message: einvRejected.error?.message || "E-invoice rejected",
            };
          } else if (didEInvoiceFailCompletely) {
            einvoiceStatus = 110; // Indicate system error for e-invoice
            error = {
              code: "EINVOICE_API_ERROR",
              message: einvoiceResults?.error || "E-invoice submission failed",
            };
          } else if (updateError) {
            // If DB update failed after API call, keep status as attempted but maybe flag error?
            einvoiceStatus = 20; // Keep as Not Processed if DB update failed? Or maybe Pending (10)? Needs decision.
            error = {
              code: "DB_UPDATE_ERROR",
              message: `Failed to update local e-invoice status: ${updateError.error}`,
            };
          } else if (einvoiceResults) {
            // E-invoice was attempted but this specific one wasn't accepted/rejected (shouldn't happen ideally)
            einvoiceStatus = 20; // Stay as Not Processed
          }
          // If einvoiceResults is null (meaning submission wasn't attempted for this batch), status remains 20.
        } else {
          // If DB failed, e-invoice status is irrelevant/Not Processed
          einvoiceStatus = 20;
        }

        // OLD Minimal format expected: { id, systemStatus, einvoiceStatus, error?, uuid?, longId? }
        return {
          id: billNo,
          systemStatus, // 0 or 100
          einvoiceStatus, // 0, 10, 20, 100, 110
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

  // DELETE /api/invoices/:id - Cancel Invoice (Update Status)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Get Invoice details for credit adjustment and e-invoice check
      const invoiceQuery = `
        SELECT id, customerid, paymenttype, totalamountpayable, uuid, einvoice_status
        FROM invoices
        WHERE id = $1 FOR UPDATE`; // Lock row
      const invoiceResult = await client.query(invoiceQuery, [id]);

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      const invoice = invoiceResult.rows[0];

      // If already cancelled, do nothing
      if (invoice.invoice_status === "cancelled") {
        await client.query("ROLLBACK"); // Release lock
        return res
          .status(400)
          .json({ message: "Invoice is already cancelled" });
      }

      // 2. Adjust Customer Credit if it was an INVOICE
      if (
        invoice.paymenttype === "INVOICE" &&
        parseFloat(invoice.totalamountpayable || 0) !== 0
      ) {
        await updateCustomerCredit(
          client,
          invoice.customerid,
          -parseFloat(invoice.totalamountpayable || 0)
        );
      }

      // 3. Attempt to Cancel E-Invoice via API if it exists and isn't already cancelled
      let einvoiceCancelledApi = false;
      if (invoice.uuid && invoice.einvoice_status !== "cancelled") {
        try {
          await apiClient.makeApiCall(
            "PUT",
            `/api/v1.0/documents/state/${invoice.uuid}/state`,
            { status: "cancelled", reason: "Invoice cancelled" }
          );
          einvoiceCancelledApi = true;
          console.log(
            `Successfully cancelled e-invoice ${invoice.uuid} via API.`
          );
        } catch (cancelError) {
          console.error(
            `Error cancelling e-invoice ${invoice.uuid} via API:`,
            cancelError
          );
          // Log error but continue - local status should still be updated
          // Potentially check error code (e.g., if already cancelled or time limit expired)
          if (cancelError.status === 400) {
            // Example: Bad request might mean it's already cancelled or invalid state
            console.warn(
              `E-invoice ${invoice.uuid} might already be cancelled or in a non-cancellable state.`
            );
            // Optionally force local status update if API confirms cancellation happened previously
            einvoiceCancelledApi = true; // Assume cancelled if API fails in a way suggesting it's done
          }
        }
      }

      // 4. Update Invoice Status in DB
      const newEInvoiceStatus = einvoiceCancelledApi
        ? "cancelled"
        : invoice.einvoice_status; // Update if API call succeeded or implied success
      const updateQuery = `
        UPDATE invoices
        SET invoice_status = 'cancelled',
            einvoice_status = $1
            -- Optionally add a cancellation_timestamp column
        WHERE id = $2
        RETURNING *`;

      const updateResult = await client.query(updateQuery, [
        newEInvoiceStatus,
        id,
      ]);

      await client.query("COMMIT");

      res.status(200).json({
        message: "Invoice cancelled successfully",
        invoice: {
          // Return the updated invoice record
          ...updateResult.rows[0],
          total_excluding_tax: parseFloat(
            updateResult.rows[0].total_excluding_tax || 0
          ),
          tax_amount: parseFloat(updateResult.rows[0].tax_amount || 0),
          rounding: parseFloat(updateResult.rows[0].rounding || 0),
          totalamountpayable: parseFloat(
            updateResult.rows[0].totalamountpayable || 0
          ),
          balance_due: parseFloat(updateResult.rows[0].balance_due || 0),
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling invoice:", error);
      res
        .status(500)
        .json({ message: "Error cancelling invoice", error: error.message });
    } finally {
      client.release();
    }
  });

  return router;
}
