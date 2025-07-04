// src/routes/accounting/debtors.js
import { Router } from "express";

export default function (pool, config) {
  const router = Router();

  // GET /api/tienhock/accounting/debtors - Get debtors report grouped by salesman
  router.get("/", async (req, res) => {
    try {
      const query = `
      WITH invoice_payments AS (
        -- Calculate total payments per invoice
        SELECT 
          p.invoice_id,
          SUM(p.amount_paid) as total_paid,
          json_agg(
        json_build_object(
          'payment_id', p.payment_id,
          'payment_method', p.payment_method,
          'payment_reference', p.payment_reference,
          'date', p.payment_date,
          'amount', p.amount_paid,
          'status', p.status
        ) ORDER BY p.payment_date
          ) as payments
        FROM payments p
        WHERE p.status NOT IN ('cancelled', 'pending')
        GROUP BY p.invoice_id
      ),
      unpaid_invoices AS (
        -- Get all unpaid/partially paid invoices
        SELECT 
          i.id as invoice_id,
          i.salespersonid,
          i.customerid,
          i.createddate,
          i.totalamountpayable,
          i.balance_due,
          COALESCE(ip.total_paid, 0) as total_paid,
          COALESCE(ip.payments, '[]'::json) as payments
        FROM invoices i
        LEFT JOIN invoice_payments ip ON i.id = ip.invoice_id
        WHERE i.invoice_status IN ('Unpaid', 'overdue')
          AND i.balance_due > 0.01
      ),
      customer_aggregates AS (
        -- Aggregate by customer
        SELECT 
          ui.salespersonid,
          ui.customerid,
          c.name as customer_name,
          c.phone_number,
          c.credit_limit,
          MAX(ui.createddate) as latest_invoice_date, -- For ordering customers
          json_agg(
        json_build_object(
          'invoice_id', ui.invoice_id,
          'invoice_number', ui.invoice_id,
          'date', ui.createddate,
          'amount', ui.totalamountpayable,
          'payments', ui.payments,
          'balance', ui.balance_due
        ) ORDER BY ui.createddate
          ) as invoices,
          SUM(ui.totalamountpayable) as total_amount,
          SUM(ui.total_paid) as total_paid,
          SUM(ui.balance_due) as total_balance
        FROM unpaid_invoices ui
        JOIN customers c ON ui.customerid = c.id
        GROUP BY ui.salespersonid, ui.customerid, c.name, c.phone_number, c.credit_limit
      )
      -- Final aggregation by salesman
      SELECT 
        s.id as salesman_id,
        s.name as salesman_name,
        json_agg(
          json_build_object(
        'customer_id', ca.customerid,
        'customer_name', ca.customer_name,
        'phone_number', ca.phone_number,
        'invoices', ca.invoices,
        'total_amount', ca.total_amount,
        'total_paid', ca.total_paid,
        'total_balance', ca.total_amount - ca.total_paid,
        'credit_limit', ca.credit_limit,
        'credit_balance', ca.credit_limit - ca.total_balance
          ) ORDER BY ca.latest_invoice_date DESC
        ) as customers,
        SUM(ca.total_balance) as total_balance
      FROM customer_aggregates ca
      JOIN staffs s ON ca.salespersonid = s.id
      GROUP BY s.id, s.name
      ORDER BY SUM(ca.total_balance) DESC
        `;

      const result = await pool.query(query);

      // Calculate grand totals
      let grand_total_amount = 0;
      let grand_total_paid = 0;
      let grand_total_balance = 0;

      const salesmen = result.rows.map((row) => {
        const customers = row.customers || [];
        customers.forEach((customer) => {
          grand_total_amount += parseFloat(customer.total_amount || 0);
          grand_total_paid += parseFloat(customer.total_paid || 0);
          grand_total_balance += parseFloat(customer.total_balance || 0);
        });

        return {
          salesman_id: row.salesman_id,
          salesman_name: row.salesman_name,
          customers: customers,
          total_balance: parseFloat(row.total_balance || 0),
        };
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
