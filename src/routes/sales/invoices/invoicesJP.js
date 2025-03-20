// src/routes/sales/invoices/invoicesJP.js
import { Router } from "express";

export default function (pool, config) {
  const router = Router();

  // Customer data cache
  const customerCache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Helper function to update customer credit
  const updateCustomerCredit = async (client, customerId, amount) => {
    try {
      // Update the customer's credit_used by adding the specified amount
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
        FROM jellypolly.invoices i
        LEFT JOIN jellypolly.order_details od ON i.id = od.invoiceid
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
          SELECT 1 FROM jellypolly.order_details od
          LEFT JOIN jellypolly.products p ON od.code = p.id
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
      console.error("Error fetching Jellypolly invoices:", error);
      res.status(500).json({
        message: "Error fetching Jellypolly invoices",
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
      const checkQuery = "SELECT id FROM jellypolly.invoices WHERE id = $1";
      const checkResult = await client.query(checkQuery, [invoice.id]);

      if (checkResult.rows.length > 0) {
        throw new Error(`Invoice with ID ${invoice.id} already exists`);
      }

      // Insert invoice with new fields
      const insertInvoiceQuery = `
        INSERT INTO jellypolly.invoices (
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
          INSERT INTO jellypolly.order_details (
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
        message: "Jellypolly invoice created successfully",
        invoice: completeInvoice,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error submitting Jellypolly invoice:", error);
      res.status(500).json({
        message: "Error submitting Jellypolly invoice",
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
      const checkQuery = "SELECT id FROM jellypolly.invoices WHERE id = $1";
      const checkResult = await client.query(checkQuery, [lookupId]);

      if (checkResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${lookupId} not found`);
      }

      // First, get the original invoice to check payment type, customer and amount
      const originalInvoiceQuery =
        "SELECT customerid, paymenttype, totalamountpayable FROM jellypolly.invoices WHERE id = $1";
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

      // First, delete existing products
      await client.query(
        "DELETE FROM jellypolly.order_details WHERE invoiceid = $1",
        [lookupId]
      );

      // Now update the invoice
      const updateInvoiceQuery = `
        UPDATE jellypolly.invoices SET
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
          INSERT INTO jellypolly.order_details (
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
        message: "Jellypolly invoice updated successfully",
        invoice: invoiceResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating Jellypolly invoice:", error);
      res.status(500).json({
        message: "Error updating Jellypolly invoice",
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
      const query = "SELECT COUNT(*) FROM jellypolly.invoices WHERE id = $1";
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

  // Delete invoice from database
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if invoice exists
      const checkQuery = "SELECT id FROM jellypolly.invoices WHERE id = $1";
      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // First check if the invoice is of type INVOICE
      const invoiceTypeQuery =
        "SELECT customerid, paymenttype, totalamountpayable FROM jellypolly.invoices WHERE id = $1";
      const invoiceTypeResult = await client.query(invoiceTypeQuery, [id]);

      if (invoiceTypeResult.rows.length > 0) {
        const invoiceDetails = invoiceTypeResult.rows[0];

        // If it's an INVOICE type, reduce the customer's credit used
        if (invoiceDetails.paymenttype === "INVOICE") {
          await updateCustomerCredit(
            client,
            invoiceDetails.customerid,
            -parseFloat(invoiceDetails.totalamountpayable || 0)
          );
        }
      }

      // Delete order details first
      await client.query(
        "DELETE FROM jellypolly.order_details WHERE invoiceid = $1",
        [id]
      );

      // Then delete the invoice
      const result = await client.query(
        "DELETE FROM jellypolly.invoices WHERE id = $1 RETURNING *",
        [id]
      );

      await client.query("COMMIT");
      res.status(200).json({
        message: "Jellypolly invoice deleted successfully",
        deletedInvoice: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting Jellypolly invoice:", error);
      res.status(500).json({
        message: "Error deleting Jellypolly invoice",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
