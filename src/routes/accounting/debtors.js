// src/routes/accounting/debtors.js
import { Router } from "express";

export default function (pool, config) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const query = `
      WITH unpaid_invoices AS (
        SELECT 
          i.invoice_id,
          i.invoice_number,
          i.customer_id,
          i.staff_id,
          i.invoice_date,
          i.total_amount,
          COALESCE(SUM(p.amount), 0) as paid_amount,
          i.total_amount - COALESCE(SUM(p.amount), 0) as balance
        FROM invoices i
        LEFT JOIN payments p ON i.invoice_id = p.invoice_id
        WHERE i.status = 'active'
        GROUP BY i.invoice_id
        HAVING i.total_amount - COALESCE(SUM(p.amount), 0) > 0.01
      ),
      payment_details AS (
        SELECT 
          p.invoice_id,
          p.payment_id,
          p.bank,
          p.cheque_number,
          p.payment_date,
          p.amount
        FROM payments p
        WHERE p.invoice_id IN (SELECT invoice_id FROM unpaid_invoices)
      )
      SELECT 
        s.staff_id as salesman_id,
        s.name as salesman_name,
        c.customer_id,
        c.name as customer_name,
        c.credit_limit,
        c.credit_limit - COALESCE(SUM(ui.balance), 0) as credit_balance,
        ui.invoice_id,
        ui.invoice_number,
        ui.invoice_date,
        ui.total_amount,
        ui.balance,
        pd.payment_id,
        pd.bank,
        pd.cheque_number,
        pd.payment_date,
        pd.amount as payment_amount
      FROM unpaid_invoices ui
      JOIN customers c ON ui.customer_id = c.customer_id
      JOIN staff s ON ui.staff_id = s.staff_id
      LEFT JOIN payment_details pd ON ui.invoice_id = pd.invoice_id
      ORDER BY s.name, c.name, ui.invoice_date, ui.invoice_id, pd.payment_date
    `;

      const result = await pool.query(query);

      // Transform the flat data into the nested structure
      const salesmenMap = new Map();

      result.rows.forEach((row) => {
        // Get or create salesman
        if (!salesmenMap.has(row.salesman_id)) {
          salesmenMap.set(row.salesman_id, {
            salesman_id: row.salesman_id,
            salesman_name: row.salesman_name,
            customers: new Map(),
            total_balance: 0,
          });
        }
        const salesman = salesmenMap.get(row.salesman_id);

        // Get or create customer
        if (!salesman.customers.has(row.customer_id)) {
          salesman.customers.set(row.customer_id, {
            customer_id: row.customer_id,
            customer_name: row.customer_name,
            credit_limit: parseFloat(row.credit_limit || 0),
            credit_balance: parseFloat(row.credit_balance || 0),
            invoices: new Map(),
            total_amount: 0,
            total_paid: 0,
            total_balance: 0,
          });
        }
        const customer = salesman.customers.get(row.customer_id);

        // Get or create invoice
        if (!customer.invoices.has(row.invoice_id)) {
          customer.invoices.set(row.invoice_id, {
            invoice_id: row.invoice_id,
            invoice_number: row.invoice_number,
            date: row.invoice_date,
            amount: parseFloat(row.total_amount),
            balance: parseFloat(row.balance),
            payments: [],
          });
          customer.total_amount += parseFloat(row.total_amount);
          customer.total_balance += parseFloat(row.balance);
        }
        const invoice = customer.invoices.get(row.invoice_id);

        // Add payment if exists
        if (row.payment_id) {
          invoice.payments.push({
            payment_id: row.payment_id,
            bank: row.bank,
            cheque_number: row.cheque_number,
            date: row.payment_date,
            amount: parseFloat(row.payment_amount),
          });
          customer.total_paid += parseFloat(row.payment_amount);
        }
      });

      // Convert Maps to Arrays and calculate totals
      const salesmen = [];
      let grand_total_amount = 0;
      let grand_total_paid = 0;
      let grand_total_balance = 0;

      salesmenMap.forEach((salesman) => {
        const customers = Array.from(salesman.customers.values()).map(
          (customer) => ({
            ...customer,
            invoices: Array.from(customer.invoices.values()),
          })
        );

        salesman.total_balance = customers.reduce(
          (sum, c) => sum + c.total_balance,
          0
        );
        grand_total_amount += customers.reduce(
          (sum, c) => sum + c.total_amount,
          0
        );
        grand_total_paid += customers.reduce((sum, c) => sum + c.total_paid, 0);
        grand_total_balance += salesman.total_balance;

        salesmen.push({
          ...salesman,
          customers,
        });
      });

      res.json({
        salesmen,
        grand_total_amount,
        grand_total_paid,
        grand_total_balance,
        report_date: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching debtors report:", error);
      res.status(500).json({
        message: "Error fetching debtors report",
        error: error.message,
      });
    }
  });

  return router;
}
