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
                  'freeProduct', od.freeProduct,
                  'returnProduct', od.returnProduct,
                  'description', od.description,
                  'tax', od.tax,
                  'discount', od.discount,
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
          discount: parseFloat(product.discount) || 0,
          total: parseFloat(product.total) || 0,
          issubtotal: Boolean(product.issubtotal),
        })),
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

      // Insert all products including subtotal rows
      if (invoice.products && invoice.products.length > 0) {
        const productQuery = `
          INSERT INTO order_details (
            invoiceid,
            code,
            price,
            quantity,
            freeProduct,
            returnProduct,
            description,
            tax,
            discount,
            total,
            issubtotal
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
              0,
              product.total || "0",
              true,
            ]);
          } else {
            // For regular products, calculate total
            const quantity = product.quantity || 0;
            const price = product.price || 0;
            const freeProduct = product.freeProduct || 0;
            const returnProduct = product.returnProduct || 0;
            const tax = product.tax || 0;
            const discount = product.discount || 0;

            const regularTotal = quantity * price;
            const afterDiscount = regularTotal - discount;
            const total = afterDiscount + tax;

            await client.query(productQuery, [
              invoice.id,
              product.code,
              price,
              quantity,
              freeProduct,
              returnProduct,
              product.description || "",
              tax,
              discount,
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

      // Process each invoice
      for (const invoice of invoices) {
        try {
          // Transform data to match database columns
          const transformedInvoice = {
            id: invoice.billNumber.toString(),
            salespersonid: invoice.salespersonId,
            customerid: invoice.customerId,
            createddate: invoice.createdDate,
            paymenttype: invoice.paymentType,
            totalmee: invoice.totalMee || 0,
            totalbihun: invoice.totalBihun || 0,
            totalnontaxable: invoice.totalNonTaxable || 0,
            totaltaxable: invoice.totalTaxable || 0,
            totaladjustment: invoice.totalAdjustment || 0,
          };

          // Validate required fields
          if (
            !transformedInvoice.id ||
            !transformedInvoice.customerid ||
            !transformedInvoice.createddate
          ) {
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

          // Insert products
          if (invoice.products && invoice.products.length > 0) {
            const productQuery = `
            INSERT INTO order_details (
              invoiceid,
              code,
              price,
              quantity,
              freeProduct,
              returnProduct,
              tax,
              discount,
              total
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `;

            for (const product of invoice.products) {
              // Skip products with zero quantity and price
              if (product.quantity === 0 && product.price === 0) continue;

              const quantity = product.quantity || 0;
              const price = product.price || 0;
              const freeProduct = product.freeProduct || 0;
              const returnProduct = product.returnProduct || 0;
              const tax = product.tax || 0;
              const discount = product.discount || 0;

              // Calculate total
              const regularTotal = quantity * price;
              const afterDiscount = regularTotal - discount;
              const total = afterDiscount + tax;

              await client.query(productQuery, [
                transformedInvoice.id,
                product.code,
                price,
                quantity,
                freeProduct,
                returnProduct,
                tax,
                discount,
                total,
              ]);
            }
          }

          results.push({
            billNumber: transformedInvoice.id,
            status: "success",
            message: "Invoice created successfully",
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

      // Return response with results and any errors
      res.status(207).json({
        message: "Invoice processing completed",
        results,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error processing invoices:", error);
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

      // Update invoice
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

      // Delete existing products
      await client.query("DELETE FROM order_details WHERE invoiceid = $1", [
        invoice.id,
      ]);

      // Insert updated products including subtotals
      if (invoice.products && invoice.products.length > 0) {
        const productQuery = `
        INSERT INTO order_details (
          invoiceid,
          code,
          price,
          quantity,
          freeProduct,
          returnProduct,
          description,
          tax,
          discount,
          total,
          issubtotal
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;

        for (const product of invoice.products) {
          if (product.issubtotal) {
            // Insert subtotal row
            await client.query(productQuery, [
              invoice.id,
              product.code || "SUBTOTAL",
              0, // price
              0, // quantity
              0, // freeProduct
              0, // returnProduct
              product.description || "Subtotal",
              0, // tax
              0, // discount
              product.total || "0",
              true, // issubtotal
            ]);
          } else if (!product.istotal) {
            // Insert regular product
            const quantity = product.quantity || 0;
            const price = product.price || 0;
            const freeProduct = product.freeProduct || 0;
            const returnProduct = product.returnProduct || 0;
            const tax = product.tax || 0;
            const discount = product.discount || 0;

            const regularTotal = quantity * price;
            const afterDiscount = regularTotal - discount;
            const total = afterDiscount + tax;

            await client.query(productQuery, [
              invoice.id,
              product.code,
              price,
              quantity,
              freeProduct,
              returnProduct,
              product.description || "",
              tax,
              discount,
              total,
              false, // issubtotal
            ]);
          }
          // Total rows are not inserted as they are calculated
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
