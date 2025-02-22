// src/routes/sales/invoices/invoices.js
import { Router } from "express";

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
          i.totalmee,
          i.totalbihun,
          i.totalnontaxable,
          i.totaltaxable,
          i.totaladjustment,
          COALESCE(
            json_agg(
              CASE WHEN od.id IS NOT NULL THEN 
                json_build_object(
                  'code', od.code,
                  'quantity', od.quantity,
                  'price', od.price,
                  'freeProduct', od.freeproduct,
                  'returnProduct', od.returnproduct
                )
              ELSE NULL END
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
        // Ensure we're comparing bigint timestamps
        queryParams.push(startDate, endDate);
        query += ` AND CAST(i.createddate AS bigint) BETWEEN CAST($${paramCounter} AS bigint) AND CAST($${
          paramCounter + 1
        } AS bigint)`;
        paramCounter += 2;
      }

      query += ` GROUP BY i.id ORDER BY i.createddate DESC`;

      const result = await pool.query(query, queryParams);

      const transformedResults = result.rows.map((row) => ({
        ...row,
        products: row.products || [],
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

      // Insert invoice
      const insertInvoiceQuery = `
        INSERT INTO invoices (
          id,
          salespersonid,
          customerid,
          createddate,
          paymenttype,
          totalmee,
          totalbihun,
          totalnontaxable,
          totaltaxable,
          totaladjustment
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const invoiceResult = await client.query(insertInvoiceQuery, [
        invoice.id,
        invoice.salespersonid,
        invoice.customerid,
        invoice.createddate,
        invoice.paymenttype || "INVOICE",
        invoice.totalmee || 0,
        invoice.totalbihun || 0,
        invoice.totalnontaxable || 0,
        invoice.totaltaxable || 0,
        invoice.totaladjustment || 0,
      ]);

      // Insert products
      if (invoice.products && invoice.products.length > 0) {
        const productQuery = `
          INSERT INTO order_details (
            invoiceid,
            code,
            price,
            quantity,
            freeproduct,
            returnproduct
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `;

        for (const product of invoice.products) {
          if (!product.istotal && !product.issubtotal) {
            // Skip total and subtotal rows
            await client.query(productQuery, [
              invoice.id,
              product.code,
              product.price || 0,
              product.quantity || 0,
              product.freeProduct || 0,
              product.returnProduct || 0,
            ]);
          }
        }
      }

      await client.query("COMMIT");
      res.status(201).json({
        message: "Invoice created successfully",
        invoice: invoiceResult.rows[0],
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

  // Update existing invoice
  router.post("/update", async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const invoice = req.body;
      const originalId = req.body.originalId;

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

      // If invoice number is changing, check for duplicates
      if (originalId && originalId !== invoice.id) {
        const checkDuplicateQuery = "SELECT id FROM invoices WHERE id = $1";
        const duplicateCheck = await client.query(checkDuplicateQuery, [
          invoice.id,
        ]);

        if (duplicateCheck.rows.length > 0) {
          throw new Error(`Invoice number ${invoice.id} already exists`);
        }

        // Update the invoice ID first
        const updateIdQuery = `
        UPDATE invoices 
        SET id = $1
        WHERE id = $2
        RETURNING *
      `;
        await client.query(updateIdQuery, [invoice.id, originalId]);
      }

      // Update invoice using the appropriate ID
      const updateInvoiceQuery = `
      UPDATE invoices SET
        salespersonid = $1,
        customerid = $2,
        createddate = $3,
        paymenttype = $4,
        totalmee = $5,
        totalbihun = $6,
        totalnontaxable = $7,
        totaltaxable = $8,
        totaladjustment = $9
      WHERE id = $10
      RETURNING *
    `;

      const invoiceResult = await client.query(updateInvoiceQuery, [
        invoice.salespersonid,
        invoice.customerid,
        invoice.createddate,
        invoice.paymenttype || "INVOICE",
        invoice.totalmee || 0,
        invoice.totalbihun || 0,
        invoice.totalnontaxable || 0,
        invoice.totaltaxable || 0,
        invoice.totaladjustment || 0,
        invoice.id,
      ]);

      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice with ID ${invoice.id} not found`);
      }

      // Update related order_details with new invoice ID if necessary
      if (originalId && originalId !== invoice.id) {
        await client.query(
          "UPDATE order_details SET invoiceid = $1 WHERE invoiceid = $2",
          [invoice.id, originalId]
        );
      }

      // Delete existing products
      await client.query("DELETE FROM order_details WHERE invoiceid = $1", [
        invoice.id,
      ]);

      // Insert updated products
      if (invoice.products && invoice.products.length > 0) {
        const productQuery = `
        INSERT INTO order_details (
          invoiceid,
          code,
          price,
          quantity,
          freeproduct,
          returnproduct
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `;

        for (const product of invoice.products) {
          if (!product.istotal && !product.issubtotal) {
            await client.query(productQuery, [
              invoice.id,
              product.code,
              product.price || 0,
              product.quantity || 0,
              product.freeProduct || 0,
              product.returnProduct || 0,
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
        productname,
        qty,
        price,
        total,
        istax
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
  router.delete("/db/:id", async (req, res) => {
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
