// src/routes/payroll/e-caruman.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Format IC number as ######-##-#### (remove existing dashes first, then format)
  const formatIC = (ic) => {
    if (!ic) return "";
    // Remove all non-digits
    const digits = ic.replace(/\D/g, "");
    if (digits.length !== 12) return ic; // Return as-is if not 12 digits
    return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 12)}`;
  };

  // Generate CSV content from rows
  const generateCSVContent = (rows) => {
    let csvContent = "Member No,IC No,Name,Salary,EM Share,EMP Share\n";

    rows.forEach((row) => {
      const memberNo = row.member_no || "";
      const icNo = formatIC(row.ic_no);
      const name = (row.name || "").replace(/,/g, " "); // Replace commas in name
      const salary = parseFloat(row.salary || 0).toFixed(2);
      const emShare = Math.round(parseFloat(row.em_share || 0)); // Integer, no decimals
      const empShare = Math.round(parseFloat(row.emp_share || 0)); // Integer, no decimals

      csvContent += `${memberNo},${icNo},${name},${salary},${emShare},${empShare}\n`;
    });

    return csvContent;
  };

  /**
   * Generate EPF CSV file for e-Caruman
   * @query month - Month (1-12)
   * @query year - Year
   * @query type - "local" for WARGANEGARA (Malaysian), "foreign" for WARGA ASING
   * Format: Member No, IC No, Name, Salary, EM Share, EMP Share
   */
  router.get("/epf", async (req, res) => {
    const { month, year, type } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    if (!type || !["local", "foreign"].includes(type)) {
      return res.status(400).json({
        message: "Type must be 'local' or 'foreign'",
      });
    }

    try {
      // Query to get EPF contribution data for the specified month/year
      // Include nationality to filter local or foreign workers
      const query = `
        SELECT DISTINCT ON (s.id)
          s.epf_no as member_no,
          s.ic_no,
          s.name,
          s.nationality,
          pd.wage_amount as salary,
          pd.employer_amount as em_share,
          pd.employee_amount as emp_share
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        JOIN payroll_deductions pd ON pd.employee_payroll_id = ep.id AND pd.deduction_type = 'epf'
        WHERE mp.month = $1
          AND mp.year = $2
          AND s.epf_no IS NOT NULL
          AND s.epf_no != ''
          AND pd.employee_amount > 0
        ORDER BY s.id, ep.id DESC
      `;

      const result = await pool.query(query, [month, year]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "No EPF contribution data found for the specified period",
        });
      }

      // Filter based on type
      let filteredRows;
      let filename;

      if (type === "local") {
        filteredRows = result.rows.filter(
          (row) => (row.nationality || "").toLowerCase() === "malaysian"
        );
        filename = "EPFORMA2.csv"; // For WARGANEGARA
      } else {
        filteredRows = result.rows.filter(
          (row) => (row.nationality || "").toLowerCase() !== "malaysian"
        );
        filename = "EPFORMA2.csv"; // For WARGA ASING
      }

      if (filteredRows.length === 0) {
        return res.status(404).json({
          message: `No ${type === "local" ? "local (Malaysian)" : "foreign"} workers found for the specified period`,
        });
      }

      // Generate CSV content
      const csvContent = generateCSVContent(filteredRows);

      // Set response headers for CSV download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.send(csvContent);
    } catch (error) {
      console.error("Error generating EPF CSV:", error);
      res.status(500).json({
        message: "Error generating EPF CSV",
        error: error.message,
      });
    }
  });

  /**
   * Get EPF data for folder-based export (returns JSON with file content)
   * @query month - Month (1-12)
   * @query year - Year
   * @query company - Company code (default: TH)
   */
  router.get("/epf/export", async (req, res) => {
    const { month, year, company = "TH" } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    try {
      const query = `
        SELECT DISTINCT ON (s.id)
          s.epf_no as member_no,
          s.ic_no,
          s.name,
          s.nationality,
          pd.wage_amount as salary,
          pd.employer_amount as em_share,
          pd.employee_amount as emp_share
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        JOIN payroll_deductions pd ON pd.employee_payroll_id = ep.id AND pd.deduction_type = 'epf'
        WHERE mp.month = $1
          AND mp.year = $2
          AND s.epf_no IS NOT NULL
          AND s.epf_no != ''
          AND pd.employee_amount > 0
        ORDER BY s.id, ep.id DESC
      `;

      const result = await pool.query(query, [month, year]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "No EPF contribution data found for the specified period",
        });
      }

      // Separate local and foreign workers
      const localRows = result.rows.filter(
        (row) => (row.nationality || "").toLowerCase() === "malaysian"
      );
      const foreignRows = result.rows.filter(
        (row) => (row.nationality || "").toLowerCase() !== "malaysian"
      );

      // Format month as 2 digits (01-12)
      const monthStr = String(month).padStart(2, "0");

      // Build response with folder structure info
      const files = [];

      if (localRows.length > 0) {
        files.push({
          path: `EPF/${year}/${company}/${monthStr}/WARGANEGARA`,
          filename: "EPFORMA2.csv",
          content: generateCSVContent(localRows),
          count: localRows.length,
        });
      }

      if (foreignRows.length > 0) {
        files.push({
          path: `EPF/${year}/${company}/${monthStr}/WARGA ASING`,
          filename: "EPFORMA2.csv",
          content: generateCSVContent(foreignRows),
          count: foreignRows.length,
        });
      }

      res.json({
        success: true,
        year,
        month: monthStr,
        company,
        files,
        totalLocal: localRows.length,
        totalForeign: foreignRows.length,
      });
    } catch (error) {
      console.error("Error generating EPF export data:", error);
      res.status(500).json({
        message: "Error generating EPF export data",
        error: error.message,
      });
    }
  });

  /**
   * Preview EPF data without downloading
   */
  router.get("/epf/preview", async (req, res) => {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    try {
      const query = `
        SELECT DISTINCT ON (s.id)
          s.id as employee_id,
          s.epf_no as member_no,
          s.ic_no,
          s.name,
          pd.wage_amount as salary,
          pd.employer_amount as em_share,
          pd.employee_amount as emp_share
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        JOIN payroll_deductions pd ON pd.employee_payroll_id = ep.id AND pd.deduction_type = 'epf'
        WHERE mp.month = $1
          AND mp.year = $2
          AND s.epf_no IS NOT NULL
          AND s.epf_no != ''
          AND pd.employee_amount > 0
        ORDER BY s.id, ep.id DESC
      `;

      const result = await pool.query(query, [month, year]);

      // Calculate totals
      const totals = result.rows.reduce(
        (acc, row) => {
          acc.salary += parseFloat(row.salary || 0);
          acc.em_share += parseFloat(row.em_share || 0);
          acc.emp_share += parseFloat(row.emp_share || 0);
          return acc;
        },
        { salary: 0, em_share: 0, emp_share: 0 }
      );

      res.json({
        count: result.rows.length,
        data: result.rows.map((row) => ({
          ...row,
          salary: parseFloat(row.salary || 0),
          em_share: parseFloat(row.em_share || 0),
          emp_share: parseFloat(row.emp_share || 0),
        })),
        totals: {
          salary: totals.salary,
          em_share: Math.round(totals.em_share),
          emp_share: Math.round(totals.emp_share),
          total_contribution: Math.round(totals.em_share + totals.emp_share),
        },
      });
    } catch (error) {
      console.error("Error previewing EPF data:", error);
      res.status(500).json({
        message: "Error previewing EPF data",
        error: error.message,
      });
    }
  });

  return router;
}
