// src/routes/greentarget/dashboard.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // GET /greentarget/api/dashboard - Get all dashboard metrics
  router.get("/", async (req, res) => {
    try {
      const metricsQuery = `
        WITH revenue_data AS (
          SELECT
            COALESCE(SUM(CASE WHEN status = 'active' THEN amount_paid ELSE 0 END), 0) as total_revenue,
            COALESCE(SUM(CASE
              WHEN status = 'active'
              AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)
              AND EXTRACT(MONTH FROM payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
              THEN amount_paid ELSE 0 END), 0) as revenue_this_month,
            COALESCE(SUM(CASE
              WHEN status = 'active'
              AND payment_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
              AND payment_date < date_trunc('month', CURRENT_DATE)
              THEN amount_paid ELSE 0 END), 0) as revenue_last_month
          FROM greentarget.payments
        ),
        rental_data AS (
          SELECT
            COUNT(*) FILTER (WHERE date_picked IS NULL) as active_rentals,
            COUNT(*) as total_rentals
          FROM greentarget.rentals
        ),
        invoice_data AS (
          SELECT
            COUNT(*) FILTER (WHERE status IN ('active', 'overdue') AND balance_due > 0) as outstanding_invoices,
            COUNT(*) FILTER (WHERE status != 'cancelled') as total_invoices
          FROM greentarget.invoices
        ),
        dumpster_data AS (
          SELECT
            COUNT(*) FILTER (WHERE status = 'Available') as available_dumpsters,
            COUNT(*) as total_dumpsters
          FROM greentarget.dumpsters
        ),
        customer_data AS (
          SELECT COUNT(*) as total_customers
          FROM greentarget.customers
        )
        SELECT
          rd.total_revenue,
          rd.revenue_this_month,
          rd.revenue_last_month,
          CASE
            WHEN rd.revenue_last_month > 0
            THEN ROUND(((rd.revenue_this_month - rd.revenue_last_month) / rd.revenue_last_month * 100)::numeric, 2)
            ELSE 0
          END as percentage_change,
          rent.active_rentals,
          rent.total_rentals,
          inv.outstanding_invoices,
          inv.total_invoices,
          dump.available_dumpsters,
          dump.total_dumpsters,
          cust.total_customers
        FROM revenue_data rd
        CROSS JOIN rental_data rent
        CROSS JOIN invoice_data inv
        CROSS JOIN dumpster_data dump
        CROSS JOIN customer_data cust
      `;

      const result = await pool.query(metricsQuery);
      const metrics = result.rows[0];

      res.json({
        totalRevenue: parseFloat(metrics.total_revenue),
        revenueThisMonth: parseFloat(metrics.revenue_this_month),
        revenueLastMonth: parseFloat(metrics.revenue_last_month),
        percentageChange: parseFloat(metrics.percentage_change),
        activeRentals: parseInt(metrics.active_rentals),
        totalRentals: parseInt(metrics.total_rentals),
        outstandingInvoices: parseInt(metrics.outstanding_invoices),
        totalInvoices: parseInt(metrics.total_invoices),
        availableDumpsters: parseInt(metrics.available_dumpsters),
        totalDumpsters: parseInt(metrics.total_dumpsters),
        totalCustomers: parseInt(metrics.total_customers),
      });
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      res.status(500).json({
        message: "Error fetching dashboard metrics",
        error: error.message,
      });
    }
  });

  // GET /greentarget/api/dashboard/activities - Get recent activities
  router.get("/activities", async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;

    try {
      const activitiesQuery = `
        WITH combined_activities AS (
          (
            SELECT
              r.rental_id as id,
              'rental' as type,
              CASE
                WHEN r.date_picked IS NOT NULL THEN 'Dumpster ' || r.tong_no || ' picked up from ' || c.name
                ELSE 'New dumpster rental for ' || c.name || ' (Tong ' || r.tong_no || ')'
              END as description,
              COALESCE(r.date_picked, r.date_placed)::timestamp as activity_date,
              NULL::numeric as amount,
              CASE
                WHEN r.date_picked IS NOT NULL THEN 'completed'
                ELSE 'active'
              END as status
            FROM greentarget.rentals r
            JOIN greentarget.customers c ON r.customer_id = c.customer_id
            ORDER BY COALESCE(r.date_picked, r.date_placed) DESC
            LIMIT $1
          )
          UNION ALL
          (
            SELECT
              i.invoice_id as id,
              'invoice' as type,
              'Invoice ' || i.invoice_number || ' created for ' || c.name as description,
              i.date_issued::timestamp as activity_date,
              i.total_amount as amount,
              i.status
            FROM greentarget.invoices i
            JOIN greentarget.customers c ON i.customer_id = c.customer_id
            WHERE i.status != 'cancelled'
            ORDER BY i.date_issued DESC
            LIMIT $1
          )
          UNION ALL
          (
            SELECT
              p.payment_id as id,
              'payment' as type,
              'Payment received for Invoice ' || i.invoice_number as description,
              p.payment_date::timestamp as activity_date,
              p.amount_paid as amount,
              p.status
            FROM greentarget.payments p
            JOIN greentarget.invoices i ON p.invoice_id = i.invoice_id
            WHERE p.status = 'active'
            ORDER BY p.payment_date DESC
            LIMIT $1
          )
        )
        SELECT * FROM combined_activities
        ORDER BY activity_date DESC
        LIMIT $1
      `;

      const result = await pool.query(activitiesQuery, [limit]);

      const activities = result.rows.map((row) => ({
        id: row.id,
        type: row.type,
        description: row.description,
        date: row.activity_date,
        amount: row.amount ? parseFloat(row.amount) : undefined,
        status: row.status,
      }));

      res.json(activities);
    } catch (error) {
      console.error("Error fetching dashboard activities:", error);
      res.status(500).json({
        message: "Error fetching dashboard activities",
        error: error.message,
      });
    }
  });

  return router;
}
