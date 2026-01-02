// src/routes/accounting/journal-vouchers.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // ==================== LOCATION ACCOUNT MAPPINGS CRUD ====================

  // GET /mappings - Get all location-account mappings
  router.get("/mappings", async (req, res) => {
    try {
      const { voucher_type, location_id, is_active } = req.query;

      let query = `
        SELECT
          lam.id,
          lam.location_id,
          lam.location_name,
          lam.mapping_type,
          lam.account_code,
          ac.description as account_description,
          lam.voucher_type,
          lam.is_active,
          lam.created_at,
          lam.updated_at
        FROM location_account_mappings lam
        LEFT JOIN account_codes ac ON lam.account_code = ac.code
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (voucher_type) {
        query += ` AND lam.voucher_type = $${paramIndex}`;
        params.push(voucher_type);
        paramIndex++;
      }

      if (location_id) {
        query += ` AND lam.location_id = $${paramIndex}`;
        params.push(location_id);
        paramIndex++;
      }

      if (is_active !== undefined && is_active !== "") {
        query += ` AND lam.is_active = $${paramIndex}`;
        params.push(is_active === "true" || is_active === true);
        paramIndex++;
      }

      query += ` ORDER BY lam.voucher_type, lam.location_id, lam.mapping_type`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching location account mappings:", error);
      res.status(500).json({
        message: "Error fetching location account mappings",
        error: error.message,
      });
    }
  });

  // GET /mappings/:id - Get single mapping by ID
  router.get("/mappings/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const query = `
        SELECT
          lam.*,
          ac.description as account_description
        FROM location_account_mappings lam
        LEFT JOIN account_codes ac ON lam.account_code = ac.code
        WHERE lam.id = $1
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Mapping not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching mapping:", error);
      res.status(500).json({
        message: "Error fetching mapping",
        error: error.message,
      });
    }
  });

  // POST /mappings - Create new mapping
  router.post("/mappings", async (req, res) => {
    const {
      location_id,
      location_name,
      mapping_type,
      account_code,
      voucher_type,
      is_active = true,
    } = req.body;

    // Validation
    if (!location_id || !location_name || !mapping_type || !account_code || !voucher_type) {
      return res.status(400).json({
        message: "location_id, location_name, mapping_type, account_code, and voucher_type are required",
      });
    }

    // Validate mapping_type
    const validMappingTypes = [
      "salary", "epf_employer", "socso_employer", "sip_employer",
      "accrual_salary", "accrual_epf", "accrual_socso", "accrual_sip", "accrual_pcb"
    ];
    if (!validMappingTypes.includes(mapping_type)) {
      return res.status(400).json({
        message: `Invalid mapping_type. Must be one of: ${validMappingTypes.join(", ")}`,
      });
    }

    // Validate voucher_type
    if (!["JVDR", "JVSL"].includes(voucher_type)) {
      return res.status(400).json({
        message: "Invalid voucher_type. Must be 'JVDR' or 'JVSL'",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if account code exists
      const accountCheck = await client.query(
        "SELECT 1 FROM account_codes WHERE code = $1",
        [account_code]
      );
      if (accountCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Account code '${account_code}' does not exist`,
        });
      }

      // Check for duplicate mapping
      const duplicateCheck = await client.query(
        "SELECT 1 FROM location_account_mappings WHERE location_id = $1 AND mapping_type = $2 AND voucher_type = $3",
        [location_id, mapping_type, voucher_type]
      );
      if (duplicateCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Mapping already exists for location ${location_id}, type ${mapping_type}, voucher ${voucher_type}`,
        });
      }

      const insertQuery = `
        INSERT INTO location_account_mappings (
          location_id, location_name, mapping_type, account_code, voucher_type, is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        location_id,
        location_name.toUpperCase().trim(),
        mapping_type,
        account_code.toUpperCase().trim(),
        voucher_type,
        is_active,
        req.staffId || null,
      ]);

      await client.query("COMMIT");

      res.status(201).json({
        message: "Mapping created successfully",
        mapping: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating mapping:", error);
      res.status(500).json({
        message: "Error creating mapping",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // PUT /mappings/:id - Update mapping
  router.put("/mappings/:id", async (req, res) => {
    const { id } = req.params;
    const {
      location_name,
      account_code,
      is_active,
    } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if mapping exists
      const existingCheck = await client.query(
        "SELECT * FROM location_account_mappings WHERE id = $1",
        [id]
      );
      if (existingCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Mapping not found" });
      }

      // If account_code is being updated, verify it exists
      if (account_code) {
        const accountCheck = await client.query(
          "SELECT 1 FROM account_codes WHERE code = $1",
          [account_code]
        );
        if (accountCheck.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Account code '${account_code}' does not exist`,
          });
        }
      }

      const updateQuery = `
        UPDATE location_account_mappings
        SET
          location_name = COALESCE($1, location_name),
          account_code = COALESCE($2, account_code),
          is_active = COALESCE($3, is_active),
          updated_by = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
      `;

      const result = await client.query(updateQuery, [
        location_name ? location_name.toUpperCase().trim() : null,
        account_code ? account_code.toUpperCase().trim() : null,
        is_active,
        req.staffId || null,
        id,
      ]);

      await client.query("COMMIT");

      res.json({
        message: "Mapping updated successfully",
        mapping: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating mapping:", error);
      res.status(500).json({
        message: "Error updating mapping",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // DELETE /mappings/:id - Delete mapping
  router.delete("/mappings/:id", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if mapping exists
      const existingCheck = await client.query(
        "SELECT * FROM location_account_mappings WHERE id = $1",
        [id]
      );
      if (existingCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Mapping not found" });
      }

      await client.query("DELETE FROM location_account_mappings WHERE id = $1", [id]);

      await client.query("COMMIT");

      res.json({
        message: "Mapping deleted successfully",
        id: parseInt(id),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting mapping:", error);
      res.status(500).json({
        message: "Error deleting mapping",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // ==================== VOUCHER PREVIEW & GENERATION ====================

  // GET /preview/:year/:month - Preview voucher data for a month
  router.get("/preview/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;
      const yearInt = parseInt(year);
      const monthInt = parseInt(month);

      if (isNaN(yearInt) || isNaN(monthInt) || monthInt < 1 || monthInt > 12) {
        return res.status(400).json({ message: "Invalid year or month" });
      }

      // Get salary data by location from employee_payrolls using job-based location mapping
      const salaryQuery = `
        WITH job_location_map AS (
          SELECT job_id, location_code
          FROM job_location_mappings
          WHERE is_active = true
        ),
        employee_data AS (
          SELECT
            ep.employee_id,
            ep.job_type,
            COALESCE(jlm.location_code, '02') as location_id,
            ep.gross_pay,
            ep.net_pay
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN staffs s ON ep.employee_id = s.id
          LEFT JOIN job_location_map jlm ON ep.job_type = jlm.job_id
          WHERE mp.year = $1 AND mp.month = $2
        ),
        deductions_data AS (
          SELECT
            ep.employee_id,
            pd.deduction_type,
            pd.employee_amount,
            pd.employer_amount
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN payroll_deductions pd ON ep.id = pd.employee_payroll_id
          WHERE mp.year = $1 AND mp.month = $2
        ),
        employee_summary AS (
          SELECT
            ed.employee_id,
            ed.location_id,
            ed.gross_pay,
            ed.net_pay,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = ed.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employer,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = ed.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employer,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = ed.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data dd WHERE dd.employee_id = ed.employee_id AND dd.deduction_type = 'income_tax'), 0) as pcb
          FROM employee_data ed
        )
        SELECT
          location_id,
          SUM(gross_pay) as total_gaji_kasar,
          SUM(epf_employer) as total_epf_majikan,
          SUM(socso_employer) as total_socso_majikan,
          SUM(sip_employer) as total_sip_majikan,
          SUM(pcb) as total_pcb,
          SUM(net_pay) as total_gaji_bersih
        FROM employee_summary
        GROUP BY location_id
        ORDER BY location_id
      `;

      const salaryResult = await pool.query(salaryQuery, [yearInt, monthInt]);

      // Get location-account mappings
      const mappingsQuery = `
        SELECT * FROM location_account_mappings
        WHERE is_active = true
        ORDER BY voucher_type, location_id, mapping_type
      `;
      const mappingsResult = await pool.query(mappingsQuery);

      // Build voucher preview
      const jvdrData = [];
      const jvslData = [];

      // Group mappings by location and voucher type
      const mappingsByLocation = {};
      mappingsResult.rows.forEach(m => {
        const key = `${m.voucher_type}_${m.location_id}`;
        if (!mappingsByLocation[key]) {
          mappingsByLocation[key] = {};
        }
        mappingsByLocation[key][m.mapping_type] = m.account_code;
      });

      // Get accrual accounts for staff (location 00)
      const staffAccruals = mappingsByLocation["JVSL_00"] || {};

      // Process salary data for each location
      salaryResult.rows.forEach(location => {
        const locationId = location.location_id;
        const isDirector = locationId === "01";
        const voucherType = isDirector ? "JVDR" : "JVSL";
        const mappingKey = `${voucherType}_${locationId}`;
        const locationMappings = mappingsByLocation[mappingKey] || {};

        const salaryAmount = parseFloat(location.total_gaji_kasar) || 0;
        const epfAmount = parseFloat(location.total_epf_majikan) || 0;
        const socsoAmount = parseFloat(location.total_socso_majikan) || 0;
        const sipAmount = parseFloat(location.total_sip_majikan) || 0;
        const pcbAmount = parseFloat(location.total_pcb) || 0;
        const netSalary = parseFloat(location.total_gaji_bersih) || 0;

        const entry = {
          location_id: locationId,
          salary: salaryAmount,
          epf_employer: epfAmount,
          socso_employer: socsoAmount,
          sip_employer: sipAmount,
          pcb: pcbAmount,
          net_salary: netSalary,
          accounts: {
            salary: locationMappings.salary || null,
            epf_employer: locationMappings.epf_employer || null,
            socso_employer: locationMappings.socso_employer || null,
            sip_employer: locationMappings.sip_employer || null,
          },
        };

        if (isDirector) {
          entry.accounts.accrual_salary = locationMappings.accrual_salary || null;
          entry.accounts.accrual_epf = locationMappings.accrual_epf || null;
          entry.accounts.accrual_socso = locationMappings.accrual_socso || null;
          entry.accounts.accrual_sip = locationMappings.accrual_sip || null;
          entry.accounts.accrual_pcb = locationMappings.accrual_pcb || null;
          jvdrData.push(entry);
        } else {
          jvslData.push(entry);
        }
      });

      // Calculate JVSL totals
      const jvslTotals = {
        salary: jvslData.reduce((sum, e) => sum + e.salary, 0),
        epf_employer: jvslData.reduce((sum, e) => sum + e.epf_employer, 0),
        socso_employer: jvslData.reduce((sum, e) => sum + e.socso_employer, 0),
        sip_employer: jvslData.reduce((sum, e) => sum + e.sip_employer, 0),
        pcb: jvslData.reduce((sum, e) => sum + e.pcb, 0),
        accrual_accounts: staffAccruals,
      };

      // Check if vouchers already exist for this month
      const existingVouchersQuery = `
        SELECT reference_no FROM journal_entries
        WHERE reference_no LIKE $1 OR reference_no LIKE $2
      `;
      const monthStr = monthInt.toString().padStart(2, "0");
      const yearStr = yearInt.toString().slice(-2);
      const existingResult = await pool.query(existingVouchersQuery, [
        `JVDR/${monthStr}/${yearStr}`,
        `JVSL/${monthStr}/${yearStr}`,
      ]);

      const existingVouchers = existingResult.rows.map(r => r.reference_no);

      res.json({
        year: yearInt,
        month: monthInt,
        jvdr: {
          reference: `JVDR/${monthStr}/${yearStr}`,
          exists: existingVouchers.includes(`JVDR/${monthStr}/${yearStr}`),
          locations: jvdrData,
        },
        jvsl: {
          reference: `JVSL/${monthStr}/${yearStr}`,
          exists: existingVouchers.includes(`JVSL/${monthStr}/${yearStr}`),
          locations: jvslData,
          totals: jvslTotals,
        },
      });
    } catch (error) {
      console.error("Error fetching voucher preview:", error);
      res.status(500).json({
        message: "Error fetching voucher preview",
        error: error.message,
      });
    }
  });

  // POST /generate - Generate journal vouchers for a month
  router.post("/generate", async (req, res) => {
    const { year, month, voucher_types = ["JVDR", "JVSL"] } = req.body;

    if (!year || !month) {
      return res.status(400).json({ message: "year and month are required" });
    }

    const yearInt = parseInt(year);
    const monthInt = parseInt(month);
    const monthStr = monthInt.toString().padStart(2, "0");
    const yearStr = yearInt.toString().slice(-2);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const results = {
        jvdr: null,
        jvsl: null,
      };

      // Get salary data by location from employee_payrolls using job-based location mapping
      const salaryQuery = `
        WITH job_location_map AS (
          SELECT job_id, location_code
          FROM job_location_mappings
          WHERE is_active = true
        ),
        employee_data AS (
          SELECT
            ep.employee_id,
            ep.job_type,
            COALESCE(jlm.location_code, '02') as location_id,
            ep.gross_pay,
            ep.net_pay
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN staffs s ON ep.employee_id = s.id
          LEFT JOIN job_location_map jlm ON ep.job_type = jlm.job_id
          WHERE mp.year = $1 AND mp.month = $2
        ),
        deductions_data AS (
          SELECT
            ep.employee_id,
            pd.deduction_type,
            pd.employee_amount,
            pd.employer_amount
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN payroll_deductions pd ON ep.id = pd.employee_payroll_id
          WHERE mp.year = $1 AND mp.month = $2
        ),
        employee_summary AS (
          SELECT
            ed.employee_id,
            ed.location_id,
            ed.gross_pay,
            ed.net_pay,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = ed.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employer,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = ed.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employer,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = ed.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data dd WHERE dd.employee_id = ed.employee_id AND dd.deduction_type = 'income_tax'), 0) as pcb
          FROM employee_data ed
        )
        SELECT
          location_id,
          SUM(gross_pay) as total_gaji_kasar,
          SUM(epf_employer) as total_epf_majikan,
          SUM(socso_employer) as total_socso_majikan,
          SUM(sip_employer) as total_sip_majikan,
          SUM(pcb) as total_pcb,
          SUM(net_pay) as total_gaji_bersih
        FROM employee_summary
        GROUP BY location_id
        ORDER BY location_id
      `;
      const salaryResult = await client.query(salaryQuery, [yearInt, monthInt]);

      // Get mappings
      const mappingsResult = await client.query(
        "SELECT * FROM location_account_mappings WHERE is_active = true"
      );
      const mappingsByLocation = {};
      mappingsResult.rows.forEach(m => {
        const key = `${m.voucher_type}_${m.location_id}`;
        if (!mappingsByLocation[key]) {
          mappingsByLocation[key] = {};
        }
        mappingsByLocation[key][m.mapping_type] = m.account_code;
      });

      const staffAccruals = mappingsByLocation["JVSL_00"] || {};
      const entryDate = new Date(yearInt, monthInt - 1, 1).toISOString().split("T")[0];

      // Generate JVDR if requested
      if (voucher_types.includes("JVDR")) {
        const jvdrRef = `JVDR/${monthStr}/${yearStr}`;

        // Check if exists
        const existingJvdr = await client.query(
          "SELECT id FROM journal_entries WHERE reference_no = $1",
          [jvdrRef]
        );

        if (existingJvdr.rows.length > 0) {
          results.jvdr = { skipped: true, message: "JVDR already exists for this month" };
        } else {
          // Create JVDR entry
          const directorData = salaryResult.rows.find(r => r.location_id === "01");
          if (directorData) {
            const directorMappings = mappingsByLocation["JVDR_01"] || {};

            // Insert journal entry
            const entryResult = await client.query(
              `INSERT INTO journal_entries (reference_no, entry_date, entry_type, description, status, created_by)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
              [jvdrRef, entryDate, "JVDR", `Director's Remuneration - ${monthStr}/${yearInt}`, "active", req.staffId || null]
            );
            const entryId = entryResult.rows[0].id;

            // Insert debit lines
            const debitLines = [
              { account: directorMappings.salary, amount: parseFloat(directorData.total_gaji_kasar), desc: "Salary" },
              { account: directorMappings.epf_employer, amount: parseFloat(directorData.total_epf_majikan), desc: "EPF Employer" },
              { account: directorMappings.socso_employer, amount: parseFloat(directorData.total_socso_majikan), desc: "SOCSO Employer" },
              { account: directorMappings.sip_employer, amount: parseFloat(directorData.total_sip_majikan), desc: "SIP Employer" },
            ].filter(l => l.account && l.amount > 0);

            let lineNumber = 1;
            for (const line of debitLines) {
              await client.query(
                `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, particulars)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [entryId, lineNumber++, line.account, line.amount, 0, line.desc]
              );
            }

            // Insert credit lines (accruals)
            const creditLines = [
              { account: directorMappings.accrual_salary, amount: parseFloat(directorData.total_gaji_bersih), desc: "Salary Payable" },
              { account: directorMappings.accrual_epf, amount: parseFloat(directorData.total_epf_majikan), desc: "EPF Payable" },
              { account: directorMappings.accrual_socso, amount: parseFloat(directorData.total_socso_majikan), desc: "SOCSO Payable" },
              { account: directorMappings.accrual_sip, amount: parseFloat(directorData.total_sip_majikan), desc: "SIP Payable" },
              { account: directorMappings.accrual_pcb, amount: parseFloat(directorData.total_pcb), desc: "PCB Payable" },
            ].filter(l => l.account && l.amount > 0);

            for (const line of creditLines) {
              await client.query(
                `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, particulars)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [entryId, lineNumber++, line.account, 0, line.amount, line.desc]
              );
            }

            results.jvdr = { created: true, id: entryId, reference: jvdrRef };
          } else {
            results.jvdr = { skipped: true, message: "No director salary data for this month" };
          }
        }
      }

      // Generate JVSL if requested
      if (voucher_types.includes("JVSL")) {
        const jvslRef = `JVSL/${monthStr}/${yearStr}`;

        const existingJvsl = await client.query(
          "SELECT id FROM journal_entries WHERE reference_no = $1",
          [jvslRef]
        );

        if (existingJvsl.rows.length > 0) {
          results.jvsl = { skipped: true, message: "JVSL already exists for this month" };
        } else {
          const staffData = salaryResult.rows.filter(r => r.location_id !== "01" && r.location_id !== "00");

          if (staffData.length > 0) {
            // Insert journal entry
            const entryResult = await client.query(
              `INSERT INTO journal_entries (reference_no, entry_date, entry_type, description, status, created_by)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
              [jvslRef, entryDate, "JVSL", `Staff Salary Wages - ${monthStr}/${yearInt}`, "active", req.staffId || null]
            );
            const entryId = entryResult.rows[0].id;

            let lineNumber = 1;
            let totalSalary = 0, totalEpf = 0, totalSocso = 0, totalSip = 0, totalPcb = 0, totalNet = 0;

            // Insert debit lines for each location
            for (const location of staffData) {
              const locationMappings = mappingsByLocation[`JVSL_${location.location_id}`] || {};

              const salary = parseFloat(location.total_gaji_kasar) || 0;
              const epf = parseFloat(location.total_epf_majikan) || 0;
              const socso = parseFloat(location.total_socso_majikan) || 0;
              const sip = parseFloat(location.total_sip_majikan) || 0;
              const pcb = parseFloat(location.total_pcb) || 0;
              const net = parseFloat(location.total_gaji_bersih) || 0;

              totalSalary += salary;
              totalEpf += epf;
              totalSocso += socso;
              totalSip += sip;
              totalPcb += pcb;
              totalNet += net;

              const debitLines = [
                { account: locationMappings.salary, amount: salary, desc: `Salary - Loc ${location.location_id}` },
                { account: locationMappings.epf_employer, amount: epf, desc: `EPF - Loc ${location.location_id}` },
                { account: locationMappings.socso_employer, amount: socso, desc: `SOCSO - Loc ${location.location_id}` },
                { account: locationMappings.sip_employer, amount: sip, desc: `SIP - Loc ${location.location_id}` },
              ].filter(l => l.account && l.amount > 0);

              for (const line of debitLines) {
                await client.query(
                  `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, particulars)
                   VALUES ($1, $2, $3, $4, $5, $6)`,
                  [entryId, lineNumber++, line.account, line.amount, 0, line.desc]
                );
              }
            }

            // Insert credit lines (totals to accrual accounts)
            const creditLines = [
              { account: staffAccruals.accrual_salary, amount: totalNet, desc: "Total Salary Payable" },
              { account: staffAccruals.accrual_epf, amount: totalEpf, desc: "Total EPF Payable" },
              { account: staffAccruals.accrual_socso, amount: totalSocso, desc: "Total SOCSO Payable" },
              { account: staffAccruals.accrual_sip, amount: totalSip, desc: "Total SIP Payable" },
              { account: staffAccruals.accrual_pcb, amount: totalPcb, desc: "Total PCB Payable" },
            ].filter(l => l.account && l.amount > 0);

            for (const line of creditLines) {
              await client.query(
                `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, particulars)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [entryId, lineNumber++, line.account, 0, line.amount, line.desc]
              );
            }

            results.jvsl = { created: true, id: entryId, reference: jvslRef };
          } else {
            results.jvsl = { skipped: true, message: "No staff salary data for this month" };
          }
        }
      }

      await client.query("COMMIT");

      res.json({
        message: "Voucher generation completed",
        results,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error generating vouchers:", error);
      res.status(500).json({
        message: "Error generating vouchers",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // GET /check/:year/:month - Check if vouchers exist for a month
  router.get("/check/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;
      const yearInt = parseInt(year);
      const monthInt = parseInt(month);
      const monthStr = monthInt.toString().padStart(2, "0");
      const yearStr = yearInt.toString().slice(-2);

      const query = `
        SELECT reference_no, id, entry_date, status
        FROM journal_entries
        WHERE reference_no IN ($1, $2)
      `;

      const result = await pool.query(query, [
        `JVDR/${monthStr}/${yearStr}`,
        `JVSL/${monthStr}/${yearStr}`,
      ]);

      const vouchers = {};
      result.rows.forEach(row => {
        if (row.reference_no.startsWith("JVDR")) {
          vouchers.jvdr = row;
        } else if (row.reference_no.startsWith("JVSL")) {
          vouchers.jvsl = row;
        }
      });

      res.json(vouchers);
    } catch (error) {
      console.error("Error checking vouchers:", error);
      res.status(500).json({
        message: "Error checking vouchers",
        error: error.message,
      });
    }
  });

  return router;
}
