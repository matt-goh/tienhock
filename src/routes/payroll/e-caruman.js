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

  // Generate CSV content from rows (for EPF)
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

  // Remove dashes from IC number (for SOCSO format)
  const stripIC = (ic) => {
    if (!ic) return "";
    return ic.replace(/\D/g, "");
  };

  // Pad string left (for text fields)
  const padLeft = (str, length) => {
    const s = String(str || "");
    return s.substring(0, length).padEnd(length, " ");
  };

  // Pad string right (for numeric fields)
  const padRight = (str, length) => {
    const s = String(str || "");
    return s.substring(0, length).padStart(length, "0");
  };

  // Convert amount to cents (integer, no decimals)
  const toCents = (amount) => {
    return Math.round(parseFloat(amount || 0) * 100);
  };

  /**
   * Generate SOCSO fixed-width text file content
   * Format: 223 characters per line
   * Fields:
   * 1. Employer Code (12) pos 1-12
   * 2. MyCoID/SSM Number (20) pos 13-32
   * 3. IC Number (12) pos 33-44 - uses SOCSO number for foreign workers
   * 4. Employee Name (150) pos 45-194
   * 5. Month Contribution MMYYYY (6) pos 195-200
   * 6. Employee Salary in cents (14) pos 201-214
   * 7. Filler (9 blank spaces) pos 215-223
   */
  const generateSOCSOContent = (rows, employerCode, month, year) => {
    const lines = [];
    const monthContribution = String(month).padStart(2, "0") + String(year);

    rows.forEach((row) => {
      // Field 1: Employer Code (12 chars, left justified)
      const field1 = padLeft(employerCode, 12);
      // Field 2: MyCoID/SSM Number (20 chars, left justified) - optional, leave blank
      const field2 = padLeft("", 20);
      // Field 3: IC Number (12 chars, alphanumeric)
      // For foreign workers, use SOCSO number instead of IC number
      const isForeign = (row.nationality || "").toLowerCase() !== "malaysian";
      const idNumber = isForeign ? (row.socso_no || row.ic_no) : row.ic_no;
      const field3 = padLeft(stripIC(idNumber), 12);
      // Field 4: Employee Name (150 chars, left justified)
      const field4 = padLeft(row.name, 150);
      // Field 5: Month Contribution MMYYYY (6 chars)
      const field5 = monthContribution;
      // Field 6: Employee Salary in cents (14 chars, right justified)
      const field6 = padRight(toCents(row.salary), 14);
      // Field 7: 9 blank spaces (pos 215-223)
      const field7 = padLeft("", 9);

      lines.push(
        field1 +
        field2 +
        field3 +
        field4 +
        field5 +
        field6 +
        field7
      );
    });

    return lines.join("\n");
  };

  /**
   * Combined preview endpoint - returns EPF and SOCSO/EIS data in one response
   * @query month - Month (1-12)
   * @query year - Year
   */
  router.get("/preview", async (req, res) => {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    try {
      // EPF Query
      const epfQuery = `
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

      // SOCSO+EIS Query
      const socsoQuery = `
        SELECT
          s.id as employee_id,
          s.ic_no,
          s.socso_no,
          s.nationality,
          s.name,
          COALESCE(socso.wage_amount, eis.wage_amount, 0) as salary,
          COALESCE(socso.employer_amount, 0) as socso_employer,
          COALESCE(socso.employee_amount, 0) as socso_employee,
          COALESCE(eis.employer_amount, 0) as eis_employer,
          COALESCE(eis.employee_amount, 0) as eis_employee
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        LEFT JOIN payroll_deductions socso ON socso.employee_payroll_id = ep.id AND socso.deduction_type = 'socso'
        LEFT JOIN payroll_deductions eis ON eis.employee_payroll_id = ep.id AND eis.deduction_type = 'eis'
        WHERE mp.month = $1
          AND mp.year = $2
          AND (
            (s.ic_no IS NOT NULL AND s.ic_no != '')
            OR (s.socso_no IS NOT NULL AND s.socso_no != '')
          )
          AND (
            (socso.employer_amount IS NOT NULL AND socso.employer_amount > 0)
            OR (socso.employee_amount IS NOT NULL AND socso.employee_amount > 0)
          )
        ORDER BY s.name
      `;

      // Execute both queries in parallel
      const [epfResult, socsoResult] = await Promise.all([
        pool.query(epfQuery, [month, year]),
        pool.query(socsoQuery, [month, year]),
      ]);

      // Calculate EPF totals
      const epfTotals = epfResult.rows.reduce(
        (acc, row) => {
          acc.salary += parseFloat(row.salary || 0);
          acc.em_share += parseFloat(row.em_share || 0);
          acc.emp_share += parseFloat(row.emp_share || 0);
          return acc;
        },
        { salary: 0, em_share: 0, emp_share: 0 }
      );

      // Calculate SOCSO+EIS totals
      const socsoTotals = socsoResult.rows.reduce(
        (acc, row) => {
          acc.salary += parseFloat(row.salary || 0);
          acc.socso_employer += parseFloat(row.socso_employer || 0);
          acc.socso_employee += parseFloat(row.socso_employee || 0);
          acc.eis_employer += parseFloat(row.eis_employer || 0);
          acc.eis_employee += parseFloat(row.eis_employee || 0);
          return acc;
        },
        { salary: 0, socso_employer: 0, socso_employee: 0, eis_employer: 0, eis_employee: 0 }
      );

      res.json({
        epf: epfResult.rows.length > 0 ? {
          count: epfResult.rows.length,
          data: epfResult.rows.map((row) => ({
            ...row,
            salary: parseFloat(row.salary || 0),
            em_share: parseFloat(row.em_share || 0),
            emp_share: parseFloat(row.emp_share || 0),
          })),
          totals: {
            salary: epfTotals.salary,
            em_share: Math.round(epfTotals.em_share),
            emp_share: Math.round(epfTotals.emp_share),
            total_contribution: Math.round(epfTotals.em_share + epfTotals.emp_share),
          },
        } : null,
        socso: socsoResult.rows.length > 0 ? {
          count: socsoResult.rows.length,
          data: socsoResult.rows.map((row) => ({
            ...row,
            salary: parseFloat(row.salary || 0),
            socso_employer: parseFloat(row.socso_employer || 0),
            socso_employee: parseFloat(row.socso_employee || 0),
            eis_employer: parseFloat(row.eis_employer || 0),
            eis_employee: parseFloat(row.eis_employee || 0),
          })),
          totals: {
            salary: socsoTotals.salary,
            socso_employer: Math.round(socsoTotals.socso_employer * 100) / 100,
            socso_employee: Math.round(socsoTotals.socso_employee * 100) / 100,
            socso_total: Math.round((socsoTotals.socso_employer + socsoTotals.socso_employee) * 100) / 100,
            eis_employer: Math.round(socsoTotals.eis_employer * 100) / 100,
            eis_employee: Math.round(socsoTotals.eis_employee * 100) / 100,
            eis_total: Math.round((socsoTotals.eis_employer + socsoTotals.eis_employee) * 100) / 100,
            total_contribution: Math.round(
              (socsoTotals.socso_employer + socsoTotals.socso_employee + socsoTotals.eis_employer + socsoTotals.eis_employee) * 100
            ) / 100,
          },
        } : null,
        income_tax: null, // Placeholder for future implementation
      });
    } catch (error) {
      console.error("Error fetching preview data:", error);
      res.status(500).json({
        message: "Error fetching preview data",
        error: error.message,
      });
    }
  });

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

  // ============================================
  // SOCSO + EIS ROUTES
  // ============================================

  /**
   * Preview SOCSO+EIS data without downloading
   * Returns combined SOCSO and EIS contribution data
   */
  router.get("/socso/preview", async (req, res) => {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    try {
      // Query to get SOCSO and EIS contribution data
      // Join payroll_deductions for both socso and eis types
      // Use wage_amount from socso or eis deduction record for salary
      const query = `
        SELECT
          s.id as employee_id,
          s.ic_no,
          s.socso_no,
          s.nationality,
          s.name,
          COALESCE(socso.wage_amount, eis.wage_amount, 0) as salary,
          COALESCE(socso.employer_amount, 0) as socso_employer,
          COALESCE(socso.employee_amount, 0) as socso_employee,
          COALESCE(eis.employer_amount, 0) as eis_employer,
          COALESCE(eis.employee_amount, 0) as eis_employee
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        LEFT JOIN payroll_deductions socso ON socso.employee_payroll_id = ep.id AND socso.deduction_type = 'socso'
        LEFT JOIN payroll_deductions eis ON eis.employee_payroll_id = ep.id AND eis.deduction_type = 'eis'
        WHERE mp.month = $1
          AND mp.year = $2
          AND (
            (s.ic_no IS NOT NULL AND s.ic_no != '')
            OR (s.socso_no IS NOT NULL AND s.socso_no != '')
          )
          AND (
            (socso.employer_amount IS NOT NULL AND socso.employer_amount > 0)
            OR (socso.employee_amount IS NOT NULL AND socso.employee_amount > 0)
          )
        ORDER BY s.name
      `;

      const result = await pool.query(query, [month, year]);

      // Calculate totals
      const totals = result.rows.reduce(
        (acc, row) => {
          acc.salary += parseFloat(row.salary || 0);
          acc.socso_employer += parseFloat(row.socso_employer || 0);
          acc.socso_employee += parseFloat(row.socso_employee || 0);
          acc.eis_employer += parseFloat(row.eis_employer || 0);
          acc.eis_employee += parseFloat(row.eis_employee || 0);
          return acc;
        },
        { salary: 0, socso_employer: 0, socso_employee: 0, eis_employer: 0, eis_employee: 0 }
      );

      res.json({
        count: result.rows.length,
        data: result.rows.map((row) => ({
          ...row,
          salary: parseFloat(row.salary || 0),
          socso_employer: parseFloat(row.socso_employer || 0),
          socso_employee: parseFloat(row.socso_employee || 0),
          eis_employer: parseFloat(row.eis_employer || 0),
          eis_employee: parseFloat(row.eis_employee || 0),
        })),
        totals: {
          salary: totals.salary,
          socso_employer: Math.round(totals.socso_employer * 100) / 100,
          socso_employee: Math.round(totals.socso_employee * 100) / 100,
          socso_total: Math.round((totals.socso_employer + totals.socso_employee) * 100) / 100,
          eis_employer: Math.round(totals.eis_employer * 100) / 100,
          eis_employee: Math.round(totals.eis_employee * 100) / 100,
          eis_total: Math.round((totals.eis_employer + totals.eis_employee) * 100) / 100,
          total_contribution: Math.round(
            (totals.socso_employer + totals.socso_employee + totals.eis_employer + totals.eis_employee) * 100
          ) / 100,
        },
      });
    } catch (error) {
      console.error("Error previewing SOCSO data:", error);
      res.status(500).json({
        message: "Error previewing SOCSO data",
        error: error.message,
      });
    }
  });

  /**
   * Get SOCSO+EIS data for folder-based export (returns JSON with file content)
   * @query month - Month (1-12)
   * @query year - Year
   * @query company - Company code (default: TH)
   * @query employerCode - SOCSO employer code (required)
   */
  router.get("/socso/export", async (req, res) => {
    const { month, year, company = "TH", employerCode } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    if (!employerCode) {
      return res.status(400).json({
        message: "Employer code is required for SOCSO export",
      });
    }

    try {
      const query = `
        SELECT
          s.id as employee_id,
          s.ic_no,
          s.socso_no,
          s.nationality,
          s.name,
          COALESCE(socso.wage_amount, eis.wage_amount, 0) as salary,
          COALESCE(socso.employer_amount, 0) as socso_employer,
          COALESCE(socso.employee_amount, 0) as socso_employee,
          COALESCE(eis.employer_amount, 0) as eis_employer,
          COALESCE(eis.employee_amount, 0) as eis_employee
        FROM employee_payrolls ep
        JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
        JOIN staffs s ON ep.employee_id = s.id
        LEFT JOIN payroll_deductions socso ON socso.employee_payroll_id = ep.id AND socso.deduction_type = 'socso'
        LEFT JOIN payroll_deductions eis ON eis.employee_payroll_id = ep.id AND eis.deduction_type = 'eis'
        WHERE mp.month = $1
          AND mp.year = $2
          AND (
            (s.ic_no IS NOT NULL AND s.ic_no != '')
            OR (s.socso_no IS NOT NULL AND s.socso_no != '')
          )
          AND (
            (socso.employer_amount IS NOT NULL AND socso.employer_amount > 0)
            OR (socso.employee_amount IS NOT NULL AND socso.employee_amount > 0)
          )
        ORDER BY s.name
      `;

      const result = await pool.query(query, [month, year]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "No SOCSO contribution data found for the specified period",
        });
      }

      // Format month as 2 digits (01-12)
      const monthStr = String(month).padStart(2, "0");

      // Generate the fixed-width text file content
      const content = generateSOCSOContent(result.rows, employerCode, month, year);

      // Build response with folder structure info
      const files = [
        {
          path: `SOCSO/${year}/${company}/${monthStr}`,
          filename: "BRG8A.TXT",
          content: content,
          count: result.rows.length,
        },
      ];

      // Calculate totals for response
      const totals = result.rows.reduce(
        (acc, row) => {
          acc.socso_employer += parseFloat(row.socso_employer || 0);
          acc.socso_employee += parseFloat(row.socso_employee || 0);
          acc.eis_employer += parseFloat(row.eis_employer || 0);
          acc.eis_employee += parseFloat(row.eis_employee || 0);
          return acc;
        },
        { socso_employer: 0, socso_employee: 0, eis_employer: 0, eis_employee: 0 }
      );

      res.json({
        success: true,
        year,
        month: monthStr,
        company,
        employerCode,
        files,
        totalEmployees: result.rows.length,
        totals: {
          socso: Math.round((totals.socso_employer + totals.socso_employee) * 100) / 100,
          eis: Math.round((totals.eis_employer + totals.eis_employee) * 100) / 100,
        },
      });
    } catch (error) {
      console.error("Error generating SOCSO export data:", error);
      res.status(500).json({
        message: "Error generating SOCSO export data",
        error: error.message,
      });
    }
  });

  return router;
}
