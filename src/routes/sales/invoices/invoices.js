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

// Helper function to insert accepted documents
const insertAcceptedDocuments = async (
  pool,
  documents,
  originalInvoices = {}
) => {
  const query = `
    INSERT INTO einvoices (
      uuid, submission_uid, long_id, internal_id, type_name, 
      receiver_id, receiver_name, datetime_validated,
      total_payable_amount, total_excluding_tax, total_net_amount, total_rounding
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const doc of documents) {
      // Convert internalId to string to ensure consistent key lookup
      const internalIdKey = String(doc.internalId);

      // Get rounding - ensure it's a number and try multiple ways to access it
      let rounding = 0;
      if (originalInvoices[internalIdKey] !== undefined) {
        rounding = parseFloat(originalInvoices[internalIdKey]);
      } else if (typeof originalInvoices[internalIdKey] === "object") {
        rounding = parseFloat(originalInvoices[internalIdKey].rounding || 0);
      }

      // Add a default datetime_validated if missing
      const datetime_validated =
        doc.dateTimeValidated || new Date().toISOString();

      await client.query(query, [
        doc.uuid,
        doc.submissionUid,
        doc.longId,
        doc.internalId,
        doc.typeName,
        doc.receiverId,
        doc.receiverName,
        datetime_validated,
        doc.totalPayableAmount,
        doc.totalExcludingTax,
        doc.totalNetAmount,
        rounding, // Explicitly processed rounding value
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

  // Get invoices with filters
  router.get("/", async (req, res) => {
    try {
      const { startDate, endDate, invoiceId, salesman, products } = req.query;

      let query = `
        SELECT 
          i.id,
          i.salespersonid,
          i.customerid,
          i.createddate,
          i.paymenttype,
          i.amount,
          i.rounding,
          i.totalamountpayable,
          COALESCE(
            json_agg(
              CASE WHEN od.id IS NOT NULL THEN 
                json_build_object(
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
              ELSE NULL END
              ORDER BY od.id  -- Maintain order of products and subtotals
            ) FILTER (WHERE od.id IS NOT NULL),
            '[]'::json
          ) as products
        FROM invoices i
        LEFT JOIN order_details od ON i.id = od.invoiceid
        WHERE 1=1
      `;

      const queryParams = [];
      let paramCounter = 1;

      // Filter by invoiceId
      if (invoiceId) {
        queryParams.push(invoiceId);
        query += ` AND i.id = $${paramCounter}`;
        paramCounter++;
      }
      // Filter by date range
      if (startDate && endDate) {
        queryParams.push(startDate, endDate);
        query += ` AND CAST(i.createddate AS bigint) BETWEEN CAST($${paramCounter} AS bigint) AND CAST($${
          paramCounter + 1
        } AS bigint)`;
        paramCounter += 2;
      }
      // Filter by salesman
      if (salesman) {
        const salesmanList = req.query.salesman.split(",");
        queryParams.push(salesmanList);
        query += ` AND i.salespersonid = ANY($${paramCounter})`;
        paramCounter++;
      }
      // Filter by products
      if (products) {
        const productList = req.query.products.split(",");
        queryParams.push(productList);
        query += ` AND EXISTS (
          SELECT 1 FROM order_details od
          LEFT JOIN products p ON od.code = p.id
          WHERE od.invoiceid = i.id 
          AND (od.code = ANY($${paramCounter}) OR p.type = ANY($${paramCounter}))
        )`;
        paramCounter++;
      }

      query += ` GROUP BY i.id ORDER BY i.createddate DESC`;

      const result = await pool.query(query, queryParams);

      // Transform results and ensure numeric values
      const transformedResults = result.rows.map((row) => ({
        ...row,
        products: (row.products || []).map((product) => ({
          ...product,
          uid: crypto.randomUUID(),
          price: parseFloat(product.price) || 0,
          quantity: parseInt(product.quantity) || 0,
          freeProduct: parseInt(product.freeProduct) || 0,
          returnProduct: parseInt(product.returnProduct) || 0,
          tax: parseFloat(product.tax) || 0,
          total: parseFloat(product.total) || 0,
          issubtotal: Boolean(product.issubtotal),
        })),
        // Ensure numeric values for new fields
        amount: parseFloat(row.amount) || 0,
        rounding: parseFloat(row.rounding) || 0,
        totalamountpayable: parseFloat(row.totalamountpayable) || 0,
      }));

      res.json(transformedResults);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({
        message: "Error fetching invoices",
        error: error.message,
      });
    }
  });

  // Submit invoice (single)
  router.post("/submit", async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const invoice = req.body;

      // Validate required fields
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

      // Check for duplicate invoice
      const checkQuery = "SELECT id FROM invoices WHERE id = $1";
      const checkResult = await client.query(checkQuery, [invoice.id]);

      if (checkResult.rows.length > 0) {
        throw new Error(`Invoice with ID ${invoice.id} already exists`);
      }

      // Insert invoice with new fields
      const insertInvoiceQuery = `
        INSERT INTO invoices (
          id,
          salespersonid,
          customerid,
          createddate,
          paymenttype,
          amount,
          rounding,
          totalamountpayable
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const invoiceResult = await client.query(insertInvoiceQuery, [
        invoice.id,
        invoice.salespersonid,
        invoice.customerid,
        invoice.createddate,
        invoice.paymenttype || "INVOICE",
        invoice.amount || 0,
        invoice.rounding || 0,
        invoice.totalamountpayable || 0,
      ]);

      // Insert all products including subtotal rows
      if (invoice.products && invoice.products.length > 0) {
        const productQuery = `
          INSERT INTO order_details (
            invoiceid,
            code,
            price,
            quantity,
            freeproduct,
            returnproduct,
            description,
            tax,
            total,
            issubtotal
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;

        for (const product of invoice.products) {
          if (product.issubtotal) {
            // For subtotal rows, store as is
            await client.query(productQuery, [
              invoice.id,
              product.code || "SUBTOTAL",
              0,
              0,
              0,
              0,
              product.description || "Subtotal",
              0,
              product.total || "0",
              true,
            ]);
          } else {
            // For regular products, calculate total if not provided
            const quantity = product.quantity || 0;
            const price = product.price || 0;
            const freeProduct = product.freeProduct || 0;
            const returnProduct = product.returnProduct || 0;
            const tax = product.tax || 0;

            const regularTotal = quantity * price;
            const total = regularTotal + tax;

            await client.query(productQuery, [
              invoice.id,
              product.code,
              price,
              quantity,
              freeProduct,
              returnProduct,
              product.description || "",
              tax,
              total,
              false,
            ]);
          }
        }
      }

      // Only update credit for INVOICE type
      if (invoice.paymenttype === "INVOICE") {
        await updateCustomerCredit(
          client,
          invoice.customerid,
          invoice.totalamountpayable || 0
        );
      }

      await client.query("COMMIT");

      // Return the complete invoice with all products
      const completeInvoice = {
        ...invoiceResult.rows[0],
        products: invoice.products,
      };

      res.status(201).json({
        message: "Invoice created successfully",
        invoice: completeInvoice,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error submitting invoice:", error);
      res.status(500).json({
        message: "Error submitting invoice",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Submit invoices (single or batch)
  router.post("/submit-invoices", async (req, res) => {
    // Extract fields query parameter to determine response format
    const fieldsParam = req.query.fields;
    const isMinimal = fieldsParam === "minimal";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Convert input to array if single invoice
      const invoices = Array.isArray(req.body) ? req.body : [req.body];

      const results = [];
      const errors = [];
      const savedInvoiceData = [];
      const duplicateErrors = [];

      // Process each invoice for database save
      for (const invoice of invoices) {
        try {
          // Transform data to match database columns
          const transformedInvoice = {
            id: String(invoice.billNumber),
            salespersonid: invoice.salespersonId,
            customerid: invoice.customerId,
            createddate: invoice.createdDate || Date.now().toString(),
            paymenttype: invoice.paymentType,
            amount: Number(invoice.amount) || 0,
            rounding: Number(invoice.rounding) || 0,
            totalamountpayable: Number(invoice.totalAmountPayable) || 0,
          };

          // Validate required fields
          if (!transformedInvoice.id || !transformedInvoice.customerid) {
            throw new Error(
              `Invoice ${transformedInvoice.id}: Missing required fields`
            );
          }

          // Check for duplicate invoice
          const checkQuery = "SELECT id FROM invoices WHERE id = $1";
          const checkResult = await client.query(checkQuery, [
            transformedInvoice.id,
          ]);

          if (checkResult.rows.length > 0) {
            const error = new Error(
              `Invoice ${transformedInvoice.id} already exists`
            );
            error.code = "DUPLICATE";
            throw error;
          }

          // Fetch product descriptions first if needed
          let productDescriptions = {};
          if (invoice.products && invoice.products.length > 0) {
            // Get all product codes that need descriptions
            const productCodes = invoice.products
              .filter((p) => !p.description && p.code)
              .map((p) => p.code);

            if (productCodes.length > 0) {
              // Fetch descriptions for all products at once
              const descQuery =
                "SELECT id, description FROM products WHERE id = ANY($1)";
              const descResult = await client.query(descQuery, [productCodes]);

              // Create a lookup map for product descriptions
              productDescriptions = descResult.rows.reduce((map, row) => {
                map[row.id] = row.description;
                return map;
              }, {});
            }
          }

          // Build insert query
          const columns = Object.keys(transformedInvoice);
          const placeholders = columns
            .map((_, idx) => `$${idx + 1}`)
            .join(", ");
          const values = columns.map((col) => transformedInvoice[col]);

          const insertInvoiceQuery = `
          INSERT INTO invoices (${columns.join(", ")})
          VALUES (${placeholders})
          RETURNING *
        `;

          const invoiceResult = await client.query(insertInvoiceQuery, values);
          const savedInvoice = invoiceResult.rows[0];

          // Prepare order details for both database and MyInvois
          const orderDetails = [];

          // Process products to save in database and track for MyInvois
          if (invoice.products && invoice.products.length > 0) {
            for (const product of invoice.products) {
              // Skip products with zero quantity and price
              if (product.quantity === 0 && product.price === 0) continue;

              const quantity = Number(product.quantity) || 0;
              const price = Number(product.price) || 0;
              const freeProduct = Number(product.freeProduct) || 0;
              const returnProduct = Number(product.returnProduct) || 0;
              const tax = Number(product.tax) || 0;

              // Get description from our lookup map or use provided description or empty string
              const description =
                product.description || productDescriptions[product.code] || "";

              // Calculate total
              const total = (quantity * price + tax).toFixed(2);

              const productData = {
                invoiceid: transformedInvoice.id,
                code: product.code,
                price: price,
                quantity: quantity,
                freeproduct: freeProduct,
                returnproduct: returnProduct,
                description: description,
                tax: tax,
                total: total,
                issubtotal: false,
              };

              // Store product data for MyInvois
              orderDetails.push({
                code: product.code,
                price: price,
                quantity: quantity,
                freeProduct: freeProduct,
                returnProduct: returnProduct,
                tax: tax,
                total: total.toString(),
                description: description, // Capture this for MyInvois
              });

              // Build insert query for product
              const productColumns = Object.keys(productData);
              const productPlaceholders = productColumns
                .map((_, idx) => `$${idx + 1}`)
                .join(", ");
              const productValues = productColumns.map(
                (col) => productData[col]
              );

              const insertProductQuery = `
              INSERT INTO order_details (${productColumns.join(", ")})
              VALUES (${productPlaceholders})
            `;

              await client.query(insertProductQuery, productValues);
            }
          }

          results.push({
            billNumber: transformedInvoice.id,
            status: "success",
            message: "Invoice created successfully",
          });

          // After inserting the invoice and products, update credit used
          if (transformedInvoice.paymenttype === "INVOICE") {
            await updateCustomerCredit(
              client,
              transformedInvoice.customerid,
              transformedInvoice.totalamountpayable || 0
            );
          }

          // Store the data needed for MyInvois submission
          savedInvoiceData.push({
            id: savedInvoice.id,
            salespersonid: savedInvoice.salespersonid,
            customerid: savedInvoice.customerid,
            createddate: savedInvoice.createddate,
            paymenttype: savedInvoice.paymenttype,
            amount: Number(savedInvoice.amount) || 0,
            rounding: Number(savedInvoice.rounding) || 0,
            totalamountpayable: Number(savedInvoice.totalamountpayable) || 0,
            orderDetails: orderDetails,
          });
        } catch (error) {
          // Track duplicate errors separately
          if (error.code === "DUPLICATE") {
            duplicateErrors.push({
              billNumber: invoice.billNumber,
              status: "error",
              message: error.message,
            });
          } else {
            errors.push({
              billNumber: invoice.billNumber,
              status: "error",
              message: error.message,
            });
          }
        }
      }

      // If all invoices failed due to duplicates
      if (duplicateErrors.length === invoices.length) {
        await client.query("ROLLBACK");

        if (isMinimal) {
          const invoicesResponse = duplicateErrors.map((error) => ({
            id: error.billNumber,
            systemStatus: 100,
            einvoiceStatus: 20,
            error: {
              code: "DUPLICATE",
              message: error.message,
            },
          }));

          return res.status(409).json({
            message: "All invoices already exist",
            invoices: invoicesResponse,
            overallStatus: "Invalid",
          });
        } else {
          return res.status(409).json({
            message: "All invoices already exist",
            errors: duplicateErrors,
          });
        }
      }

      // If all invoices failed due to validation errors
      if (errors.length === invoices.length) {
        await client.query("ROLLBACK");

        if (isMinimal) {
          const invoicesResponse = errors.map((error) => ({
            id: error.billNumber,
            systemStatus: 100,
            einvoiceStatus: 20,
            error: {
              message: error.message,
            },
          }));

          return res.status(400).json({
            // Bad Request for validation errors
            message: "All invoices failed to process",
            invoices: invoicesResponse,
            overallStatus: "Invalid",
          });
        } else {
          return res.status(400).json({
            message: "All invoices failed to process",
            errors,
          });
        }
      }

      // Otherwise commit successful transactions
      await client.query("COMMIT");

      // After successful database save, attempt MyInvois submission
      let einvoiceResults = null;
      if (savedInvoiceData.length > 0) {
        try {
          // Create a map of invoice IDs to rounding values
          const invoiceRoundings = {};
          savedInvoiceData.forEach((invoice) => {
            // Ensure ID is a string and rounding is explicitly a number
            const id = String(invoice.id);
            const rounding = parseFloat(invoice.rounding || 0);
            invoiceRoundings[id] = rounding;
          });

          einvoiceResults = await submitInvoicesToMyInvois(
            myInvoisConfig,
            savedInvoiceData,
            fetchCustomerDataWithCache
          );

          // Add this block to store accepted documents in the einvoices table
          if (
            einvoiceResults.success &&
            einvoiceResults.acceptedDocuments?.length > 0
          ) {
            try {
              await insertAcceptedDocuments(
                pool,
                einvoiceResults.acceptedDocuments,
                invoiceRoundings
              );
            } catch (storageError) {
              console.error("Error storing accepted documents:", storageError);
              // Don't fail the whole operation if storing documents fails
            }
          }
        } catch (einvoiceError) {
          console.error("Error during submission to MyInvois:", einvoiceError);
          einvoiceResults = {
            success: false,
            message: "Failed to submit to MyInvois API",
            error: einvoiceError.message || "Unknown error",
          };
        }
      }

      // Determine the appropriate status code based on e-invoice results
      let statusCode = 201; // Default to Created for complete success

      if (einvoiceResults) {
        if (einvoiceResults.overallStatus === "Partial") {
          statusCode = 202; // Accepted for partial success
        } else if (
          einvoiceResults.rejectedDocuments &&
          einvoiceResults.rejectedDocuments.length > 0 &&
          einvoiceResults.acceptedDocuments.length === 0
        ) {
          statusCode = 422; // Unprocessable Entity for e-invoice validation failures
        }
      }

      // Prepare response based on fields parameter
      if (isMinimal) {
        // Create merged invoice results with combined status
        const invoices = [];

        // Create a lookup map for einvoice results
        const acceptedDocMap = {};
        const rejectedDocMap = {};

        if (einvoiceResults) {
          // Map accepted documents by internalId
          if (
            einvoiceResults.acceptedDocuments &&
            einvoiceResults.acceptedDocuments.length > 0
          ) {
            einvoiceResults.acceptedDocuments.forEach((doc) => {
              acceptedDocMap[doc.internalId] = doc;
            });
          }

          // Map rejected documents by internalId
          if (
            einvoiceResults.rejectedDocuments &&
            einvoiceResults.rejectedDocuments.length > 0
          ) {
            einvoiceResults.rejectedDocuments.forEach((doc) => {
              rejectedDocMap[doc.internalId || doc.invoiceCodeNumber] = doc;
            });
          }
        }

        // Process results and merge with einvoice data
        for (const result of results) {
          const invoiceId = result.billNumber;
          const invoiceData = {
            id: invoiceId,
            systemStatus: result.status === "success" ? 0 : 100, // 0=success, 100=error
          };

          // If invoice was accepted in MyInvois
          if (acceptedDocMap[invoiceId]) {
            const doc = acceptedDocMap[invoiceId];

            // If longId is missing, mark status as Pending instead of Valid
            if (!doc.longId) {
              invoiceData.einvoiceStatus = 10; // Pending = 10 (success variant)
            } else {
              invoiceData.einvoiceStatus = 0; // Valid = 0 (complete success)
            }

            invoiceData.uuid = doc.uuid;
            invoiceData.longId = doc.longId || "";
            invoiceData.dateTimeValidated = doc.dateTimeValidated || null;
          }
          // If invoice was rejected in MyInvois
          else if (rejectedDocMap[invoiceId]) {
            const doc = rejectedDocMap[invoiceId];
            invoiceData.einvoiceStatus = 100; // Invalid = 100 (error)
            invoiceData.error = {
              code: doc.error?.code || "ERROR",
              message: doc.error?.message || "Unknown error",
            };
          }
          // If invoice wasn't processed by MyInvois at all
          else if (einvoiceResults) {
            invoiceData.einvoiceStatus = 20; // Not Processed = 20 (partial success)
          }

          invoices.push(invoiceData);
        }

        // Add any errors from system processing
        if (errors && errors.length > 0) {
          for (const error of errors) {
            invoices.push({
              id: error.billNumber,
              systemStatus: 100, // Error = 100
              einvoiceStatus: 20, // Not Processed = 20
              error: {
                message: error.message,
              },
            });
          }
        }

        return res.status(statusCode).json({
          message: "Invoice processing completed",
          invoices: invoices,
          overallStatus: einvoiceResults
            ? einvoiceResults.overallStatus
            : "SystemOnly",
        });
      }

      // Return full response for ERP system (default)
      res.status(statusCode).json({
        message: "Invoice processing completed",
        results,
        errors: errors.length > 0 ? errors : undefined,
        einvoice: einvoiceResults,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      res.status(500).json({
        message: "Error processing invoices",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Update existing invoice
  router.post("/update", async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const invoice = req.body;

      // Check which ID to use for finding the invoice
      const lookupId = invoice.originalId || invoice.id;

      // Validate required fields
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

      // Check if invoice exists before attempting update
      const checkQuery = "SELECT id FROM invoices WHERE id = $1";
      const checkResult = await client.query(checkQuery, [lookupId]);

      if (checkResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${lookupId} not found`);
      }

      // First, get the original invoice to check payment type, customer and amount
      const originalInvoiceQuery =
        "SELECT customerid, paymenttype, totalamountpayable FROM invoices WHERE id = $1";
      const originalInvoiceResult = await client.query(originalInvoiceQuery, [
        lookupId,
      ]);
      const originalInvoice = originalInvoiceResult.rows[0];

      // Normalize payment types to ensure consistent comparison
      const originalType = (originalInvoice.paymenttype || "")
        .trim()
        .toUpperCase();
      const newType = (invoice.paymenttype || "INVOICE").trim().toUpperCase();
      const originalAmount = parseFloat(
        originalInvoice.totalamountpayable || 0
      );
      const newAmount = parseFloat(invoice.totalamountpayable || 0);
      const originalCustomerId = originalInvoice.customerid;
      const newCustomerId = invoice.customerid;

      // Handle credit adjustments based on payment type changes
      if (originalType === "INVOICE") {
        // Original was INVOICE - need to remove original credit
        await updateCustomerCredit(client, originalCustomerId, -originalAmount);
      }

      if (newType === "INVOICE") {
        // New is INVOICE - need to add new credit
        await updateCustomerCredit(client, newCustomerId, newAmount);
      }

      // The update logic specifically handles:
      // - INVOICE → CASH: Original credit removed, no new credit added
      // - CASH → INVOICE: No original credit to remove, new credit added
      // - INVOICE → INVOICE (same customer): Original credit removed, new credit added
      // - INVOICE → INVOICE (different customer): Original credit removed from original customer, new credit added to new customer

      // First, delete existing products
      await client.query("DELETE FROM order_details WHERE invoiceid = $1", [
        lookupId,
      ]);

      // Now update the invoice
      const updateInvoiceQuery = `
        UPDATE invoices SET
          id = $1,
          salespersonid = $2,
          customerid = $3,
          createddate = $4,
          paymenttype = $5,
          amount = $6,
          rounding = $7,
          totalamountpayable = $8
        WHERE id = $9
        RETURNING *
      `;

      const invoiceResult = await client.query(updateInvoiceQuery, [
        invoice.id,
        invoice.salespersonid,
        invoice.customerid,
        invoice.createddate,
        invoice.paymenttype || "INVOICE",
        invoice.amount || 0,
        invoice.rounding || 0,
        invoice.totalamountpayable || 0,
        lookupId,
      ]);

      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${lookupId} not found`);
      }

      // Get the new invoice ID after the update
      const actualInvoiceId = invoiceResult.rows[0].id;

      // Insert updated products using the new invoice ID
      if (invoice.products && invoice.products.length > 0) {
        const productQuery = `
          INSERT INTO order_details (
            invoiceid,
            code,
            price,
            quantity,
            freeproduct,
            returnproduct,
            description,
            tax,
            total,
            issubtotal
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;

        for (const product of invoice.products) {
          if (product.issubtotal) {
            // Insert subtotal row
            await client.query(productQuery, [
              actualInvoiceId,
              product.code || "SUBTOTAL",
              0, // price
              0, // quantity
              0, // freeProduct
              0, // returnProduct
              product.description || "Subtotal",
              0, // tax
              product.total || "0",
              true, // issubtotal
            ]);
          } else {
            // Insert regular product
            const quantity = product.quantity || 0;
            const price = product.price || 0;
            const freeProduct = product.freeProduct || 0;
            const returnProduct = product.returnProduct || 0;
            const tax = product.tax || 0;

            const regularTotal = quantity * price;
            const total = regularTotal + tax;

            await client.query(productQuery, [
              actualInvoiceId,
              product.code,
              price,
              quantity,
              freeProduct,
              returnProduct,
              product.description || "",
              tax,
              total,
              false, // issubtotal
            ]);
          }
        }
      }

      await client.query("COMMIT");
      res.json({
        message: "Invoice updated successfully",
        invoice: invoiceResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating invoice:", error);
      res.status(500).json({
        message: "Error updating invoice",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Get all invoice IDs from the last year
  router.get("/ids", async (req, res) => {
    try {
      // Calculate date range (1 year ago to current date)
      const currentDate = Date.now();
      const oneYearAgo = currentDate - 365 * 24 * 60 * 60 * 1000; // 365 days in milliseconds

      const query = `
      SELECT id 
      FROM invoices 
      WHERE CAST(createddate AS bigint) >= $1 
      AND CAST(createddate AS bigint) <= $2
      ORDER BY CAST(createddate AS bigint) DESC
    `;

      const result = await pool.query(query, [
        oneYearAgo.toString(),
        currentDate.toString(),
      ]);

      // Extract just the IDs into an array
      const invoiceIds = result.rows.map((row) => row.id);

      res.json(invoiceIds);
    } catch (error) {
      console.error("Error fetching invoice IDs:", error);
      res.status(500).json({
        message: "Error fetching invoice IDs",
        error: error.message,
      });
    }
  });

  // Check for duplicate invoice numbers
  router.get("/check-duplicate", async (req, res) => {
    const { invoiceNo } = req.query;

    if (!invoiceNo) {
      return res.status(400).json({ message: "Invoice number is required" });
    }

    try {
      // Query both id and invoiceno columns
      const query = "SELECT COUNT(*) FROM invoices WHERE id = $1";
      const result = await pool.query(query, [invoiceNo]);
      const count = parseInt(result.rows[0].count);

      return res.json({ isDuplicate: count > 0 });
    } catch (error) {
      console.error("Error checking for duplicate invoice number:", error);
      return res.status(500).json({
        message: "Error checking for duplicate invoice number",
        error: error.message,
      });
    }
  });

  // Get cancelled invoices
  router.get("/cancelled", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      let query = `
      SELECT 
        ci.id,
        ci.invoice_id,
        ci.salespersonid,
        ci.customerid,
        ci.createddate,
        ci.paymenttype,
        ci.amount,
        ci.rounding,
        ci.totalamountpayable,
        ci.cancellation_date,
        ci.products
      FROM 
        cancelled_invoices ci
      WHERE 1=1
    `;

      const queryParams = [];
      let paramCounter = 1;

      // Filter by date range
      if (startDate && endDate) {
        queryParams.push(startDate, endDate);
        query += ` AND CAST(ci.createddate AS bigint) BETWEEN CAST($${paramCounter} AS bigint) AND CAST($${
          paramCounter + 1
        } AS bigint)`;
        query += ` ORDER BY ci.cancellation_date DESC`;
      }

      const result = await pool.query(query, queryParams);

      // Transform results
      const transformedResults = result.rows.map((row) => ({
        ...row,
        amount: parseFloat(row.amount) || 0,
        rounding: parseFloat(row.rounding) || 0,
        totalamountpayable: parseFloat(row.totalamountpayable) || 0,
      }));

      res.json(transformedResults);
    } catch (error) {
      console.error("Error fetching cancelled invoices:", error);
      res.status(500).json({
        message: "Error fetching cancelled invoices",
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

  // Delete invoice from database and move to cancelled_invoices, cancel e-invoice if found too
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if invoice exists
      const checkQuery = "SELECT id FROM invoices WHERE id = $1";
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // First, get full invoice information including products
      const invoiceQuery = `
      SELECT 
        i.*,
        COALESCE(
          json_agg(
            CASE WHEN od.id IS NOT NULL THEN 
              json_build_object(
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
            ELSE NULL END
            ORDER BY od.id  -- Maintain order of products and subtotals
          ) FILTER (WHERE od.id IS NOT NULL),
          '[]'::json
        ) as products
      FROM invoices i
      LEFT JOIN order_details od ON i.id = od.invoiceid
      WHERE i.id = $1
      GROUP BY i.id`;

      const invoiceResult = await client.query(invoiceQuery, [id]);

      if (invoiceResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Invoice details not found" });
      }

      const invoice = invoiceResult.rows[0];

      // If it's an INVOICE type, reduce the customer's credit used
      if (invoice.paymenttype === "INVOICE") {
        await updateCustomerCredit(
          client,
          invoice.customerid,
          -parseFloat(invoice.totalamountpayable || 0)
        );
      }

      // Check if there's also an e-invoice for this invoice
      const eInvoiceQuery = "SELECT uuid FROM einvoices WHERE internal_id = $1";
      const eInvoiceResult = await pool.query(eInvoiceQuery, [id]);

      if (eInvoiceResult.rows.length > 0) {
        const einvoice = eInvoiceResult.rows[0];

        // Only try to cancel if not already cancelled
        if (einvoice.status !== "Cancelled") {
          try {
            // Make the API call to cancel the e-invoice in MyInvois
            await apiClient.makeApiCall(
              "PUT",
              `/api/v1.0/documents/state/${einvoice.uuid}/state`,
              {
                status: "cancelled",
                reason: "Invoice cancelled",
              }
            );

            console.log(
              `Successfully cancelled e-invoice with UUID ${einvoice.uuid} in MyInvois`
            );
          } catch (cancelError) {
            console.error(
              "Error cancelling e-invoice in MyInvois:",
              cancelError
            );

            // Check if it's a critical error that should stop the process
            if (
              cancelError.status === 400 &&
              cancelError.response?.error?.code === "OperationPeriodOver"
            ) {
              await client.query("ROLLBACK");
              return res.status(400).json({
                message:
                  "The time limit for cancellation of the e-invoice has expired",
              });
            }

            // For other errors, we'll log but continue the process
            console.warn(
              "Continuing with invoice cancellation despite e-invoice API error"
            );
          }
        }

        // Update local e-invoice record
        const updateQuery =
          "UPDATE einvoices SET status = 'Cancelled', cancellation_date = NOW() WHERE uuid = $1";
        await pool.query(updateQuery, [einvoice.uuid]);
      }

      // Insert into cancelled_invoices
      const insertQuery = `
      INSERT INTO cancelled_invoices (
        invoice_id, 
        salespersonid, 
        customerid, 
        createddate, 
        paymenttype, 
        amount, 
        rounding, 
        totalamountpayable, 
        products,
        cancellation_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *`;

      const insertParams = [
        invoice.id,
        invoice.salespersonid,
        invoice.customerid,
        invoice.createddate,
        invoice.paymenttype,
        invoice.amount,
        invoice.rounding,
        invoice.totalamountpayable,
        JSON.stringify(invoice.products),
      ];

      const insertResult = await client.query(insertQuery, insertParams);

      // Delete order details first
      await client.query("DELETE FROM order_details WHERE invoiceid = $1", [
        id,
      ]);

      // Then delete the invoice
      const deleteResult = await client.query(
        "DELETE FROM invoices WHERE id = $1 RETURNING *",
        [id]
      );

      await client.query("COMMIT");
      res.status(200).json({
        message: "Invoice cancelled successfully",
        cancelledInvoice: insertResult.rows[0],
        deletedInvoice: deleteResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error cancelling invoice:", error);
      res.status(500).json({
        message: "Error cancelling invoice",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
