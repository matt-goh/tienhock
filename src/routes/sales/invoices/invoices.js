// src/routes/sales/invoices/invoices.js
import { Router } from "express";
import { sanitizeNumeric } from "./helpers.js";

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
      const { startDate, endDate, salesman, customer } = req.query;

      let query = `
      SELECT 
        i.id,
        i.salespersonid,
        i.customerid,
        i.createddate,  -- Keep as bigint
        i.paymenttype,
        i.totalmee,
        i.totalbihun,
        i.totalnontaxable,
        i.totaltaxable,
        i.totaladjustment,
        json_agg(
          json_build_object(
            'code', od.code,
            'price', od.price,
            'quantity', od.quantity,
            'freeproduct', od.freeproduct,
            'returnproduct', od.returnproduct,
            'invoiceid', od.invoiceid
          )
        ) as products
      FROM invoices i
      LEFT JOIN order_details od ON i.id = od.invoiceid
      WHERE 1=1
    `;

      const queryParams = [];
      let paramCounter = 1;

      if (startDate && endDate) {
        // Convert input dates to Unix timestamps (milliseconds)
        const startTimestamp = Math.floor(new Date(startDate).getTime());
        const endTimestamp = Math.floor(new Date(endDate).getTime());

        query += ` AND i.createddate BETWEEN $${paramCounter} AND $${
          paramCounter + 1
        }`;
        queryParams.push(startTimestamp, endTimestamp);
        paramCounter += 2;
      }

      if (salesman) {
        query += ` AND i.salespersonid = $${paramCounter}`;
        queryParams.push(salesman);
        paramCounter++;
      }

      if (customer) {
        query += ` AND i.customerid = $${paramCounter}`;
        queryParams.push(customer);
        paramCounter++;
      }

      query += ` GROUP BY i.id`;

      console.log("Executing query:", query);
      console.log("With parameters:", queryParams);

      const result = await pool.query(query, queryParams);

      // Transform the results
      const transformedResults = result.rows.map((row) => ({
        ...row,
        products: row.products[0] === null ? [] : row.products,
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
        new Date(invoice.createddate),
        invoice.paymenttype,
        invoice.totalmee,
        invoice.totalbihun,
        invoice.totalnontaxable,
        invoice.totaltaxable,
        invoice.totaladjustment,
      ]);

      // Insert products
      for (const product of invoice.products) {
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

        await client.query(productQuery, [
          invoice.id,
          product.code,
          product.price,
          product.quantity,
          product.freeproduct,
          product.returnproduct,
        ]);
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

  // Check for duplicate invoice numbers
  router.get("/check-duplicate", async (req, res) => {
    const { invoiceNo } = req.query;

    if (!invoiceNo) {
      return res.status(400).json({ message: "Invoice number is required" });
    }

    try {
      const query = "SELECT COUNT(*) FROM invoices WHERE invoiceno = $1";
      const result = await pool.query(query, [invoiceNo]);
      const count = parseInt(result.rows[0].count);

      res.json({ isDuplicate: count > 0 });
    } catch (error) {
      console.error("Error checking for duplicate invoice number:", error);
      // Continuing from the check-duplicate endpoint...
      res.status(500).json({
        message: "Error checking for duplicate invoice number",
        error: error.message,
      });
    }
  });

  // Check for bulk duplicates
  router.post("/check-bulk-duplicates", async (req, res) => {
    const { invoiceNumbers } = req.body;

    if (!Array.isArray(invoiceNumbers) || invoiceNumbers.length === 0) {
      return res
        .status(400)
        .json({ message: "Invalid invoice numbers provided" });
    }

    try {
      // Check for duplicates in the database
      const dbQuery =
        "SELECT invoiceno FROM invoices WHERE invoiceno = ANY($1)";
      const dbResult = await pool.query(dbQuery, [invoiceNumbers]);

      // Check for duplicates in the provided list itself
      const duplicatesInList = invoiceNumbers.filter(
        (item, index) => invoiceNumbers.indexOf(item) !== index
      );

      // Combine duplicates from database and list
      const allDuplicates = [
        ...new Set([
          ...dbResult.rows.map((row) => row.invoiceno),
          ...duplicatesInList,
        ]),
      ];

      res.json({ duplicates: allDuplicates });
    } catch (error) {
      console.error("Error checking for duplicate invoice numbers:", error);
      res.status(500).json({
        message: "Error checking for duplicate invoice numbers",
        error: error.message,
      });
    }
  });

  // Bulk submit invoices to database
  router.post("/bulk-submit", async (req, res) => {
    const invoices = req.body;

    if (!Array.isArray(invoices) || invoices.length === 0) {
      return res
        .status(400)
        .json({ message: "Invalid invoices data provided" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const insertedInvoices = [];

      for (const invoice of invoices) {
        // Format date and time
        const [day, month, year] = invoice.date.split("/");
        const formattedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(
          2,
          "0"
        )}`;

        const [time, period] = invoice.time.split(" ");
        let [hours, minutes] = time.split(":");
        hours = parseInt(hours);
        if (period.toLowerCase() === "pm" && hours !== 12) hours += 12;
        else if (period.toLowerCase() === "am" && hours === 12) hours = 0;
        const formattedTime = `${hours
          .toString()
          .padStart(2, "0")}:${minutes}:00`;

        // Insert invoice
        const insertInvoiceQuery = `
          INSERT INTO Invoices (
            id, invoiceno, date, time, type, 
            customer, customername, salesman, totalAmount
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `;

        const invoiceResult = await client.query(insertInvoiceQuery, [
          invoice.invoiceno,
          invoice.invoiceno,
          formattedDate,
          formattedTime,
          invoice.type,
          invoice.customer,
          invoice.customername,
          invoice.salesman,
          sanitizeNumeric(invoice.totalAmount),
        ]);

        const insertedInvoice = invoiceResult.rows[0];

        // Insert order details
        for (const detail of invoice.orderDetails) {
          const detailQuery = `
            INSERT INTO order_details (
              invoiceId, code, productname, qty, price, total,
              isfoc, isreturned, istotal, issubtotal, isless, istax
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `;
          await client.query(detailQuery, [
            insertedInvoice.id,
            detail.code,
            detail.productname,
            detail.qty,
            detail.price,
            detail.total,
            detail.isfoc || false,
            detail.isreturned || false,
            detail.istotal || false,
            detail.issubtotal || false,
            detail.isless || false,
            detail.istax || false,
          ]);
        }

        insertedInvoices.push(insertedInvoice);
      }

      await client.query("COMMIT");

      res.json({
        message: `Successfully submitted ${insertedInvoices.length} invoices to the database.`,
        invoices: insertedInvoices,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error submitting invoices:", error);
      res
        .status(500)
        .json({ message: "Error submitting invoices", error: error.message });
    } finally {
      client.release();
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

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

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

        if (result.rows.length === 0) {
          res.status(404).json({ message: "Invoice not found" });
        } else {
          res.status(200).json({
            message: "Invoice deleted successfully",
            deletedInvoice: result.rows[0],
          });
        }
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error deleting invoice from database:", error);
      res.status(500).json({
        message: "Error deleting invoice",
        error: error.message,
      });
    }
  });

  return router;
}
