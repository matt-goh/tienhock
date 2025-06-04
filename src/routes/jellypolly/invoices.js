// src/routes/jellypolly/invoices.js
import { Router } from "express";
import JPEInvoiceApiClientFactory from "../../utils/JellyPolly/einvoice/JPEInvoiceApiClientFactory.js";

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

  const apiClient = JPEInvoiceApiClientFactory.getInstance(config);

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
          c.name as customerName, c.tin_number as customerTin, c.id_number as customerIdNumber, c.id_type as customerIdType,
          (
            SELECT jsonb_build_object(
              'id', con.id,
              'uuid', con.uuid,
              'long_id', con.long_id,
              'einvoice_status', con.einvoice_status
            )
            FROM jellypolly.invoices con
            WHERE con.is_consolidated = true
              AND con.consolidated_invoices::jsonb ? CAST(i.id AS TEXT)
              AND con.invoice_status != 'cancelled'
            LIMIT 1
          ) as consolidated_part_of
      `;
      let fromClause = `
        FROM jellypolly.invoices i
        LEFT JOIN customers c ON i.customerid = c.id
      `;
      let whereClause = ` WHERE 1=1 `; // Start with basic condition
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
        SELECT 1 FROM jellypolly.order_details od
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
          SELECT 1 FROM jellypolly.invoices con 
          WHERE con.is_consolidated = true 
          AND con.consolidated_invoices::jsonb ? CAST(i.id AS TEXT)
          AND con.invoice_status != 'cancelled'
        )`;
      } else if (excludeConsolidated) {
        // Exclude invoices that are part of any consolidated invoice
        whereClause += ` AND NOT EXISTS (
          SELECT 1 FROM jellypolly.invoices con 
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

  // Get all invoice IDs and summary matching current filters
  router.get("/selection/ids", async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        salesman,
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
        SELECT 1 FROM jellypolly.invoices con 
        WHERE con.is_consolidated = true 
        AND con.consolidated_invoices::jsonb ? CAST(invoices.id AS TEXT)
        AND con.invoice_status != 'cancelled'
      )`;
      } else if (exclude_consolidated === "true") {
        // Exclude invoices that are part of any consolidated invoice
        whereClause += ` AND NOT EXISTS (
        SELECT 1 FROM jellypolly.invoices con 
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
      FROM jellypolly.invoices 
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
        c.name as customerName, c.tin_number, c.id_number,
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
      FROM jellypolly.invoices i
      LEFT JOIN customers c ON i.customerid = c.id
      LEFT JOIN jellypolly.order_details od ON i.id = od.invoiceid
      WHERE i.id IN (${placeholders})
      GROUP BY i.id, c.name, c.tin_number, c.id_number
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
        jellypolly.order_details
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
          c.name as customerName, c.tin_number, c.id_number,
          (
            SELECT jsonb_build_object(
              'id', con.id,
              'uuid', con.uuid,
              'long_id', con.long_id,
              'einvoice_status', con.einvoice_status
            )
            FROM jellypolly.invoices con
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
        FROM jellypolly.invoices i
        LEFT JOIN customers c ON i.customerid = c.id
        LEFT JOIN jellypolly.order_details od ON i.id = od.invoiceid
        WHERE i.id = $1
        GROUP BY 
        i.id, i.salespersonid, i.customerid, i.createddate, i.paymenttype,
        i.total_excluding_tax, i.tax_amount, i.rounding, i.totalamountpayable,
        i.invoice_status, i.einvoice_status, i.balance_due,
        i.uuid, i.submission_uid, i.long_id, i.datetime_validated,
        i.is_consolidated, i.consolidated_invoices,
        c.name, c.tin_number, c.id_number, c.id_type
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

      const checkQuery = "SELECT id FROM jellypolly.invoices WHERE id = $1";
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
        INSERT INTO jellypolly.invoices (
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
          INSERT INTO jellypolly.order_details (
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
          INSERT INTO jellypolly.payments (
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

  // DELETE /api/invoices/:id - Cancel Invoice (Update Status and Cancel Payments)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Get Invoice details for credit adjustment and e-invoice check
      const invoiceQuery = `
        SELECT id, customerid, paymenttype, totalamountpayable, balance_due, uuid, einvoice_status, invoice_status
        FROM jellypolly.invoices
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
        FROM jellypolly.payments 
        WHERE invoice_id = $1 AND (status IS NULL OR status = 'active')
        FOR UPDATE -- Lock payment rows as well
      `;
      const activePaymentsResult = await client.query(activePaymentsQuery, [
        id,
      ]);
      const activePayments = activePaymentsResult.rows;

      if (activePayments.length > 0) {
        const cancelPaymentQuery = `
          UPDATE jellypolly.payments 
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
        UPDATE jellypolly.invoices 
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

  return router;
}
