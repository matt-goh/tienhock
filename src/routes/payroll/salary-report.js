// src/routes/payroll/salary-report.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get salary report data for a specific month
  router.get("/", async (req, res) => {
    const { year, month } = req.query;

    // Validate required parameters
    if (!year || !month) {
      return res.status(400).json({
        message: "Year and month parameters are required",
      });
    }

    const yearInt = parseInt(year);
    const monthInt = parseInt(month);

    try {
      // Single comprehensive query to get all salary report data
      const query = `
        WITH employee_payroll_data AS (
          SELECT 
            ep.employee_id,
            s.id as staff_id,
            s.name as staff_name,
            s.payment_preference,
            COALESCE(ep.net_pay, 0) as net_pay
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN staffs s ON ep.employee_id = s.id
          WHERE mp.year = $1 AND mp.month = $2
          AND (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)
        ),
        mid_month_data AS (
          SELECT 
            mmp.employee_id,
            COALESCE(mmp.amount, 0) as mid_month_amount
          FROM mid_month_payrolls mmp
          WHERE mmp.year = $1 AND mmp.month = $2
        ),
        pinjam_monthly_data AS (
          SELECT 
            pr.employee_id,
            COALESCE(SUM(pr.amount), 0) as total_pinjam
          FROM pinjam_records pr
          WHERE pr.year = $1 AND pr.month = $2
          AND pr.pinjam_type = 'monthly'
          GROUP BY pr.employee_id
        )
        SELECT 
          epd.staff_id,
          epd.staff_name,
          epd.payment_preference,
          epd.net_pay,
          COALESCE(mmd.mid_month_amount, 0) as mid_month_amount,
          COALESCE(pmd.total_pinjam, 0) as total_pinjam,
          (epd.net_pay - COALESCE(mmd.mid_month_amount, 0)) as gaji_genap,
          (epd.net_pay - COALESCE(mmd.mid_month_amount, 0) - COALESCE(pmd.total_pinjam, 0)) as final_total
        FROM employee_payroll_data epd
        LEFT JOIN mid_month_data mmd ON epd.employee_id = mmd.employee_id
        LEFT JOIN pinjam_monthly_data pmd ON epd.employee_id = pmd.employee_id
        WHERE epd.net_pay > 0 OR COALESCE(mmd.mid_month_amount, 0) > 0
        ORDER BY epd.staff_name
      `;

      const result = await pool.query(query, [yearInt, monthInt]);

      // Format the response data
      const salaryData = result.rows.map((row, index) => ({
        no: index + 1,
        staff_id: row.staff_id,
        staff_name: row.staff_name,
        payment_preference: row.payment_preference,
        gaji_genap: parseFloat(row.gaji_genap || 0),
        total_pinjam: parseFloat(row.total_pinjam || 0),
        final_total: parseFloat(row.final_total || 0),
        net_pay: parseFloat(row.net_pay || 0),
        mid_month_amount: parseFloat(row.mid_month_amount || 0),
      }));

      res.json({
        year: yearInt,
        month: monthInt,
        data: salaryData,
        total_records: salaryData.length,
        summary: {
          total_gaji_genap: salaryData.reduce(
            (sum, item) => sum + item.gaji_genap,
            0
          ),
          total_pinjam: salaryData.reduce(
            (sum, item) => sum + item.total_pinjam,
            0
          ),
          total_final: salaryData.reduce(
            (sum, item) => sum + item.final_total,
            0
          ),
        },
      });
    } catch (error) {
      console.error("Error fetching salary report:", error);
      res.status(500).json({
        message: "Error fetching salary report",
        error: error.message,
      });
    }
  });

  return router;
}
