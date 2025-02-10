// src/routes/sales/invoices/invoices.js
import { Router } from "express";
import {
  sanitizeOrderDetail,
  sanitizeNumeric,
  shouldRemoveRow,
  cleanupOrphanedTotalRows,
} from "./helpers.js";

// In-memory storage for uploaded invoices
let uploadedInvoices = [];

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

  // Get invoices from memory storage
  router.get("/", async (req, res) => {
    try {
      const customerQuery = "SELECT id, name FROM customers";
      const customerResult = await pool.query(customerQuery);
      const customerMap = new Map(
        customerResult.rows.map((row) => [row.id, row.name])
      );

      const productQuery = "SELECT id, description FROM products";
      const productResult = await pool.query(productQuery);
      const productMap = new Map(
        productResult.rows.map((row) => [row.id, row.description])
      );

      const invoicesWithDetails = uploadedInvoices.map((invoice) => ({
        ...invoice,
        customername: customerMap.get(invoice.customer) || invoice.customer,
        orderDetails: invoice.orderDetails
          .map((detail) => ({
            ...sanitizeOrderDetail(detail),
            productname: productMap.get(detail.code) || detail.code,
          }))
          .filter((detail) => !shouldRemoveRow(detail)),
      }));

      res.json(invoicesWithDetails);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res
        .status(500)
        .json({ message: "Error fetching invoices", error: error.message });
    }
  });

  // Get invoices from database with filters
  router.get("/db", async (req, res) => {
    try {
      const { salesmen, customers, startDate, endDate, invoiceType } =
        req.query;

      let invoiceQuery = `
        SELECT 
          i.id, i.invoiceno, i.date, i.type, 
          i.customer, c.name as customername, 
          i.salesman, i.totalamount, i.time
        FROM 
          invoices i
        LEFT JOIN 
          customers c ON i.customer = c.id
        WHERE 1=1
      `;

      const queryParams = [];
      let paramCounter = 1;

      if (salesmen) {
        const salesmenArray = salesmen.split(",");
        invoiceQuery += ` AND i.salesman = ANY($${paramCounter})`;
        queryParams.push(salesmenArray);
        paramCounter++;
      }

      if (customers) {
        const customersArray = customers.split(",");
        invoiceQuery += ` AND i.customer = ANY($${paramCounter})`;
        queryParams.push(customersArray);
        paramCounter++;
      }

      if (startDate && endDate) {
        invoiceQuery += ` AND i.date BETWEEN $${paramCounter} AND $${
          paramCounter + 1
        }`;
        queryParams.push(startDate, endDate);
        paramCounter += 2;
      }

      if (invoiceType) {
        invoiceQuery += ` AND i.type = $${paramCounter}`;
        queryParams.push(invoiceType);
        paramCounter++;
      }

      const invoiceResult = await pool.query(invoiceQuery, queryParams);

      if (invoiceResult.rows.length === 0) {
        return res.json([]);
      }

      const orderDetailsQuery = `
        SELECT 
          od.id,
          od.invoiceid, 
          od.code,
          CASE 
            WHEN od.isless OR od.istax THEN od.productname
            ELSE p.description
          END as productname,
          od.qty, 
          od.price, 
          od.total, 
          od.isfoc, 
          od.isreturned,
          od.istotal, 
          od.issubtotal, 
          od.isless, 
          od.istax
        FROM 
          order_details od
        LEFT JOIN 
          products p ON od.code = p.id
        WHERE
          od.invoiceid = ANY($1)
      `;

      const orderDetailsResult = await pool.query(orderDetailsQuery, [
        invoiceResult.rows.map((inv) => inv.id),
      ]);

      const invoicesWithDetails = invoiceResult.rows.map((invoice) => ({
        ...invoice,
        date: formatDate(invoice.date),
        time: formatTime(invoice.time),
        totalAmount: invoice.totalamount,
        orderDetails: orderDetailsResult.rows
          .filter((detail) => detail.invoiceid === invoice.id)
          .map((detail) => ({
            id: detail.id,
            code: detail.code,
            productname: detail.productname,
            qty: detail.qty,
            price: detail.price,
            total: detail.total,
            isfoc: detail.isfoc,
            isreturned: detail.isreturned,
            istotal: detail.istotal,
            issubtotal: detail.issubtotal,
            isless: detail.isless,
            istax: detail.istax,
          })),
      }));

      res.json(invoicesWithDetails);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res
        .status(500)
        .json({ message: "Error fetching invoices", error: error.message });
    }
  });

  // Upload invoices to memory
  router.post("/upload", (req, res) => {
    const newInvoices = req.body.map((invoice) => ({
      ...invoice,
      orderDetails: invoice.orderDetails
        .map(sanitizeOrderDetail)
        .filter((detail) => !shouldRemoveRow(detail)),
    }));

    if (Array.isArray(newInvoices)) {
      uploadedInvoices = [...uploadedInvoices, ...newInvoices];
      res.json({
        message: `${newInvoices.length} invoices uploaded successfully`,
      });
    } else {
      res.status(400).json({
        message: "Invalid data format. Expected an array of invoices.",
      });
    }
  });

  // Submit invoice (single)
  router.post("/submit", async (req, res) => {
    const { saveToDb } = req.query;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const invoice = req.body;
      const processedInvoice = {
        ...invoice,
        orderDetails: invoice.orderDetails.map(sanitizeOrderDetail),
      };

      const originalId = processedInvoice.id;
      processedInvoice.id = processedInvoice.invoiceno;

      // Format date and time
      const [day, month, year] = processedInvoice.date.split("/");
      const formattedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(
        2,
        "0"
      )}`;

      const [time, period] = processedInvoice.time.split(" ");
      let [hours, minutes] = time.split(":");
      hours = parseInt(hours);
      if (period.toLowerCase() === "pm" && hours !== 12) hours += 12;
      else if (period.toLowerCase() === "am" && hours === 12) hours = 0;
      const formattedTime = `${hours
        .toString()
        .padStart(2, "0")}:${minutes}:00`;

      const sanitizedTotalAmount = sanitizeNumeric(
        processedInvoice.totalAmount
      );

      let savedInvoice;

      if (saveToDb === "true") {
        // Check if the invoice with the original id exists
        const checkOriginalInvoiceQuery =
          "SELECT id FROM Invoices WHERE id = $1";
        const checkOriginalInvoiceResult = await client.query(
          checkOriginalInvoiceQuery,
          [originalId]
        );

        if (
          checkOriginalInvoiceResult.rows.length > 0 &&
          originalId !== processedInvoice.id
        ) {
          // The invoice exists and the invoice number has changed
          // Delete the old invoice and its details
          await client.query("DELETE FROM order_details WHERE invoiceId = $1", [
            originalId,
          ]);
          await client.query("DELETE FROM Invoices WHERE id = $1", [
            originalId,
          ]);
        }

        // Now, either insert a new invoice or update the existing one
        const upsertInvoiceQuery = `
          INSERT INTO Invoices (id, invoiceno, date, time, type, customer, customername, salesman, totalAmount)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE
          SET invoiceno = EXCLUDED.invoiceno,
              date = EXCLUDED.date,
              time = EXCLUDED.time,
              type = EXCLUDED.type,
              customer = EXCLUDED.customer,
              customername = EXCLUDED.customername,
              salesman = EXCLUDED.salesman,
              totalAmount = EXCLUDED.totalAmount
          RETURNING *
        `;
        const upsertResult = await client.query(upsertInvoiceQuery, [
          processedInvoice.id,
          processedInvoice.invoiceno,
          formattedDate,
          formattedTime,
          processedInvoice.type,
          processedInvoice.customer,
          processedInvoice.customername,
          processedInvoice.salesman,
          sanitizedTotalAmount,
        ]);
        savedInvoice = upsertResult.rows[0];

        // Delete existing order details and total rows for the new/updated invoice
        await client.query("DELETE FROM order_details WHERE invoiceId = $1", [
          savedInvoice.id,
        ]);

        // Insert new order details
        for (const detail of processedInvoice.orderDetails) {
          const detailQuery = `
            INSERT INTO order_details (invoiceId, code, productname, qty, price, total, isfoc, isreturned, istotal, issubtotal, isless, istax)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `;
          await client.query(detailQuery, [
            savedInvoice.id,
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

        // Fetch order details for the saved invoice
        const orderDetailsQuery = `
          SELECT * FROM order_details WHERE invoiceId = $1
          ORDER BY 
            CASE 
              WHEN istotal = true THEN 1
              WHEN issubtotal = true THEN 2
              WHEN isless = true THEN 3
              WHEN istax = true THEN 4
              WHEN isfoc = true THEN 5
              WHEN isreturned = true THEN 6
              ELSE 0
            END,
            id
        `;
        const orderDetailsResult = await client.query(orderDetailsQuery, [
          savedInvoice.id,
        ]);

        // Cleanup any orphaned total rows
        await cleanupOrphanedTotalRows(client);

        savedInvoice.orderDetails = orderDetailsResult.rows;
      } else {
        // Memory storage operations
        if (originalId !== processedInvoice.id) {
          uploadedInvoices = uploadedInvoices.filter(
            (inv) => inv.id !== originalId
          );
        }
        const existingIndex = uploadedInvoices.findIndex(
          (inv) => inv.id === processedInvoice.id
        );
        if (existingIndex !== -1) {
          uploadedInvoices[existingIndex] = processedInvoice;
        } else {
          uploadedInvoices.push(processedInvoice);
        }
        savedInvoice = processedInvoice;
      }

      await client.query("COMMIT");
      res.status(201).json(savedInvoice);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error submitting invoice:", error);
      res
        .status(500)
        .json({ message: "Error submitting invoice", error: error.message });
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
      uploadedInvoices = []; // Clear memory storage

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

  router.put("/:id", (req, res) => {
    const { id } = req.params;
    const updatedInvoice = req.body;

    const index = uploadedInvoices.findIndex((invoice) => invoice.id === id);

    if (index !== -1) {
      updatedInvoice.orderDetails = updatedInvoice.orderDetails
        .map(sanitizeOrderDetail)
        .filter((detail) => !shouldRemoveRow(detail));
      uploadedInvoices[index] = updatedInvoice;
      res.status(200).json(updatedInvoice);
    } else {
      res.status(404).json({ message: "Invoice not found" });
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

  // Clear uploaded invoices from memory
  router.post("/clear", (_req, res) => {
    uploadedInvoices = [];
    res.status(200).json({ message: "All invoices cleared successfully" });
  });

  // Delete invoice from database
  router.delete("/db/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Delete order details first
        await client.query("DELETE FROM order_details WHERE invoiceId = $1", [
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
      res
        .status(500)
        .json({ message: "Error deleting invoice", error: error.message });
    }
  });

  // Delete invoice from memory
  router.delete("/:id", (req, res) => {
    const { id } = req.params;
    const index = uploadedInvoices.findIndex((invoice) => invoice.id === id);

    if (index !== -1) {
      const deletedInvoice = uploadedInvoices.splice(index, 1)[0];
      res.status(200).json({
        message: "Invoice deleted successfully",
        deletedInvoice,
      });
    } else {
      res.status(404).json({ message: "Invoice not found" });
    }
  });

  return router;
}
