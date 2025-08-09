// src/routes/excel/payment-export.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get payment export data for Excel Power Query (21 columns)
  router.get("/", async (req, res) => {
    const { year, month, api_key } = req.query;

    // Check API key authentication (bypasses middleware)
    if (api_key !== "foodmaker") {
      return res.status(401).json({
        message: "Unauthorized: Invalid or missing API key",
      });
    }

    // Use current year/month if no parameters provided
    const currentDate = new Date();
    const yearInt = year ? parseInt(year) : currentDate.getFullYear();
    const monthInt = month ? parseInt(month) : currentDate.getMonth() + 1;

    try {
      // Combined query to get salary report data with staff information
      const query = `
        WITH employee_payroll_data AS (
          SELECT 
            ep.employee_id,
            s.id as staff_id,
            s.name as staff_name,
            s.bank_account_number,
            s.document,
            s.ic_no,
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
          epd.bank_account_number,
          epd.document,
          epd.ic_no,
          epd.net_pay,
          COALESCE(mmd.mid_month_amount, 0) as mid_month_amount,
          COALESCE(pmd.total_pinjam, 0) as total_pinjam,
          (epd.net_pay - COALESCE(mmd.mid_month_amount, 0) - COALESCE(pmd.total_pinjam, 0)) as final_total
        FROM employee_payroll_data epd
        LEFT JOIN mid_month_data mmd ON epd.employee_id = mmd.employee_id
        LEFT JOIN pinjam_monthly_data pmd ON epd.employee_id = pmd.employee_id
        WHERE epd.net_pay > 0 OR COALESCE(mmd.mid_month_amount, 0) > 0
        ORDER BY epd.staff_name
      `;

      const result = await pool.query(query, [yearInt, monthInt]);

      // Generate payment date (last day of the month)
      const lastDayOfMonth = new Date(yearInt, monthInt, 0).getDate();
      const paymentDate = `${lastDayOfMonth.toString().padStart(2, '0')}/${monthInt.toString().padStart(2, '0')}/${yearInt}`;

      // Define payment date row
      const paymentDateRow = [
        "PAYMENT DATE : (DD/MM/YYYY)",
        paymentDate,
        "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
      ];

      // Define column headers with 2-row format
      const headerRow1 = [
        "Payment Type/ Mode : PBB/IBG/REN",
        "Bene Account No.",
        "BIC",
        "Bene Full Name",
        "ID Type: For Intrabank & IBG NI, OI, BR, PL, ML, PP For Rentas NI, OI, BR, OT",
        "Bene Identification No / Passport",
        "Payment Amount (with 2 decimal points)",
        "Recipient Reference (shown in sender and bene statement)",
        "Other Payment Details (shown in sender and bene statement)",
        "Bene Email 1",
        "Bene Email 2",
        "Bene Mobile No. 1 (charge RM0.20 per number)",
        "Bene Mobile No. 2 (charge RM0.20 per number)",
        "Joint Bene Name",
        "Joint Bene Identification No.",
        "Joint ID Type: For Intrabank & IBG NI, OI, BR, PL, ML, PP For Rentas NI, OI, BR, OT",
        "E-mail Content Line 1 (will be shown in bene email)",
        "E-mail Content Line 2 (will be shown in bene email)",
        "E-mail Content Line 3 (will be shown in bene email)",
        "E-mail Content Line 4 (will be shown in bene email)",
        "E-mail Content Line 5 (will be shown in bene email)"
      ];

      const headerRow2 = [
        "(M) - Char: 3 - A",
        "(M) - Char: 20 - N",
        "(M) - Char: 11 - A",
        "(M) - Char: 120 - A",
        "(O) - Char: 2 - A",
        "(O) - Char: 29 - AN",
        "(M) - Char: 18 - N",
        "(M) - Char: 20 - AN",
        "(O) - Char: 20 - AN",
        "(O) - Char: 70 - AN",
        "(O) - Char: 70 - AN",
        "(O) - Char: 15 - N",
        "(O) - Char: 15 - N",
        "(O) - Char: 120 - A",
        "(O) - Char: 29 - AN",
        "(O) - Char: 2 - A",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN"
      ];

      // Transform data into CSV format optimized for Power Query with QuoteStyle.None
      const textRows = result.rows
        .filter((row) => parseFloat(row.final_total || 0) > 0)
        .map((row) => {
          // Format payment amount without quotes or commas to avoid CSV parsing issues
          const paymentAmount = parseFloat(row.final_total || 0).toFixed(2);
          
          // Create 21 columns - ensure no values contain commas to work with QuoteStyle.None
          const columns = [
            "PBB", // Column 1
            (row.bank_account_number || "").replace(/-/g, ""), // Column 2 - remove hyphens
            "PBBEMYKL", // Column 3
            (row.staff_name || "").replace(/,/g, " "), // Column 4 - remove commas
            row.document || "", // Column 5
            (row.ic_no || "").replace(/-/g, ""), // Column 6 - remove hyphens
            paymentAmount, // Column 7 - plain number format
            "Salary", // Column 8
            "", // Column 9
            "", // Column 10
            "", // Column 11
            "", // Column 12
            "", // Column 13
            "", // Column 14
            "", // Column 15
            "", // Column 16
            "Content Line 1", // Column 17
            "Content Line 2", // Column 18
            "Content Line 3", // Column 19
            "Content Line 4", // Column 20
            "Content Line 5" // Column 21
          ];
          
          return columns.join(';');
        });

      // Calculate total payment amount
      const totalAmount = result.rows
        .filter((row) => parseFloat(row.final_total || 0) > 0)
        .reduce((sum, row) => sum + parseFloat(row.final_total || 0), 0);

      // Create total row
      const totalRow = [
        "TOTAL:",
        "", "", "", "", "",
        totalAmount.toFixed(2),
        "", "", "", "", "", "", "", "", "", "", "", "", "", ""
      ];

      // Combine all rows
      const allRows = [
        paymentDateRow.join(';'),
        headerRow1.join(';'),
        headerRow2.join(';'),
        ...textRows,
        totalRow.join(';')
      ];
      const textOutput = allRows.join('\r\n');
      
      // Set content type to plain text to force Power Query to treat as text
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(textOutput);
    } catch (error) {
      console.error("Error fetching payment export data:", error);
      res.status(500).json({
        message: "Error fetching payment export data",
        error: error.message,
      });
    }
  });

  return router;
}
