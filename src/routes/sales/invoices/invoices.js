// src/routes/sales/invoices/invoices.js
import { Router } from "express";
import { submitInvoicesToMyInvois } from "../../../utils/invoice/einvoice/serverSubmissionUtil.js";
import {
  MYINVOIS_API_BASE_URL,
  MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET,
} from "../../../configs/config.js";

// Define the MyInvois configuration object
const myInvoisConfig = {
  MYINVOIS_API_BASE_URL,
  MYINVOIS_CLIENT_ID,
  MYINVOIS_CLIENT_SECRET,
};

const insertAcceptedDocuments = async (pool, documents) => {
  const query = `
    INSERT INTO einvoices (
      uuid, submission_uid, long_id, internal_id, type_name, 
      receiver_id, receiver_name, datetime_validated,
      total_payable_amount, total_excluding_tax, total_net_amount
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const doc of documents) {
      await client.query(query, [
        doc.uuid,
        doc.submissionUid,
        doc.longId,
        doc.internalId,
        doc.typeName,
        doc.receiverId,
        doc.receiverName,
        doc.dateTimeValidated,
        doc.totalPayableAmount,
        doc.totalExcludingTax,
        doc.totalNetAmount,
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

const formatDate = (date) => {
  if (date instanceof Date) {
    return `${date.getDate().toString().padStart(2, "0")}/${(
      date.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}/${date.getFullYear()}`;
  }
  if (typeof date === "string") {
    const [year, month, day] = date.split("T")[0].split("-");
    return `${day}/${month}/${year}`;
  }
  return "Invalid Date";
};

const formatTime = (time) => {
  if (typeof time === "string") {
    let [hours, minutes] = time.split(":");
    hours = parseInt(hours);
    const period = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${period}`;
  }
  return "Invalid Time";
};

export default function (pool) {
  const router = Router();

  // Get invoices with filters
  router.get("/", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

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
                  'issubtotal', od.issubtotal,
                  'istotal', false
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

      if (startDate && endDate) {
        queryParams.push(startDate, endDate);
        query += ` AND CAST(i.createddate AS bigint) BETWEEN CAST($${paramCounter} AS bigint) AND CAST($${
          paramCounter + 1
        } AS bigint)`;
        paramCounter += 2;
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
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Convert input to array if single invoice
      const invoices = Array.isArray(req.body) ? req.body : [req.body];

      const results = [];
      const errors = [];
      const savedInvoiceData = [];

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
            throw new Error(`Invoice ${transformedInvoice.id} already exists`);
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
              const description = product.description || "";

              // Calculate total
              const total = ((quantity - returnProduct) * price + tax).toFixed(
                2
              );

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
          errors.push({
            billNumber: invoice.billNumber,
            status: "error",
            message: error.message,
          });
        }
      }

      // If all invoices failed, rollback and return error
      if (errors.length === invoices.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "All invoices failed to process",
          errors,
        });
      }

      // Otherwise commit successful transactions
      await client.query("COMMIT");

      // Process any invoice data that might be missing product descriptions
      for (const invoice of savedInvoiceData) {
        const productCodesWithoutDescription = invoice.orderDetails
          .filter((product) => !product.description)
          .map((product) => product.code);

        if (productCodesWithoutDescription.length > 0) {
          try {
            // Fetch only the missing product descriptions
            const descriptionQuery = `
            SELECT id, description 
            FROM products 
            WHERE id = ANY($1)
          `;
            const descriptionResult = await client.query(descriptionQuery, [
              productCodesWithoutDescription,
            ]);

            // Create a lookup map of product code to description
            const descriptionMap = {};
            descriptionResult.rows.forEach((row) => {
              descriptionMap[row.id] = row.description;
            });

            // Update the product descriptions in our data
            invoice.orderDetails = invoice.orderDetails.map((product) => {
              if (!product.description && descriptionMap[product.code]) {
                return {
                  ...product,
                  description: descriptionMap[product.code],
                };
              }
              return product;
            });
          } catch (err) {
            console.error(
              `Error fetching product descriptions for invoice ${invoice.id}:`,
              err
            );
            // Continue with whatever descriptions we have
          }
        }
      }

      // After successful database save, attempt MyInvois submission
      let einvoiceResults = null;
      if (savedInvoiceData.length > 0) {
        try {
          einvoiceResults = await submitInvoicesToMyInvois(
            myInvoisConfig,
            savedInvoiceData,
            (customerId) => fetchCustomerData(pool, customerId)
          );

          // Add this block to store accepted documents in the einvoices table
          if (
            einvoiceResults.success &&
            einvoiceResults.acceptedDocuments?.length > 0
          ) {
            try {
              await insertAcceptedDocuments(
                pool,
                einvoiceResults.acceptedDocuments
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

      // Return response with results and any errors
      res.status(207).json({
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

  // Get single invoice by ID
  router.get("/details/:id/basic", async (req, res) => {
    const { id } = req.params;

    try {
      const invoiceQuery = `
      SELECT 
        date,
        time
      FROM 
        invoices
      WHERE 
        id = $1
    `;

      const result = await pool.query(invoiceQuery, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const invoice = result.rows[0];
      const formattedInvoice = {
        date: formatDate(invoice.date),
        time: formatTime(invoice.time),
      };

      res.json(formattedInvoice);
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({
        message: "Error fetching invoice",
        error: error.message,
      });
    }
  });

  // Delete invoice from database
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

      // Delete order details first
      await client.query("DELETE FROM order_details WHERE invoiceid = $1", [
        id,
      ]);

      // Then delete the invoice
      const result = await client.query(
        "DELETE FROM invoices WHERE id = $1 RETURNING *",
        [id]
      );

      await client.query("COMMIT");
      res.status(200).json({
        message: "Invoice deleted successfully",
        deletedInvoice: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting invoice:", error);
      res.status(500).json({
        message: "Error deleting invoice",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
