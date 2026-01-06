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
      // Expense types
      "salary", "overtime", "bonus", "commission", "commission_mee", "commission_bh", "cuti_tahunan", "special_ot",
      // Contribution types
      "epf_employer", "socso_employer", "sip_employer",
      // Accrual types
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
            ep.id as employee_payroll_id,
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
        -- Directors data (for JVDR) - separate from staff
        director_data AS (
          SELECT
            ed.*
          FROM employee_data ed
          WHERE ed.employee_id IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
        ),
        -- Staff data (for JVSL) - excludes directors
        staff_data AS (
          SELECT
            ed.*
          FROM employee_data ed
          WHERE ed.employee_id NOT IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
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
        -- Commission MEE/BH split for locations 03 and 04
        commission_split AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(CASE WHEN p.type = 'MEE' THEN pi.amount ELSE 0 END), 0) as commission_mee,
            COALESCE(SUM(CASE WHEN p.type = 'BH' THEN pi.amount ELSE 0 END), 0) as commission_bh
          FROM staff_data sd
          JOIN payroll_items pi ON sd.employee_payroll_id = pi.employee_payroll_id
          LEFT JOIN product_pay_codes ppc ON pi.pay_code_id = ppc.pay_code_id
          LEFT JOIN products p ON ppc.product_id = p.id
          WHERE sd.location_id IN ('03', '04')
            AND p.type IN ('MEE', 'BH')
          GROUP BY sd.location_id
        ),
        -- Cuti Tahunan by location
        cuti_tahunan_data AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(lr.amount_paid), 0) as cuti_tahunan_amount
          FROM staff_data sd
          JOIN leave_records lr ON sd.employee_id = lr.employee_id
          WHERE lr.leave_type = 'cuti_tahunan'
            AND lr.status = 'approved'
            AND lr.amount_paid > 0
            AND EXTRACT(YEAR FROM lr.leave_date) = $1
            AND EXTRACT(MONTH FROM lr.leave_date) = $2
          GROUP BY sd.location_id
        ),
        -- Salary amounts by location (excluding overtime)
        salary_by_location AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(pi.amount), 0) as salary_amount
          FROM staff_data sd
          JOIN payroll_items pi ON sd.employee_payroll_id = pi.employee_payroll_id
          JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE pc.pay_type IN ('Base', 'Tambahan')
          GROUP BY sd.location_id
        ),
        -- Overtime amounts by location
        overtime_by_location AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(pi.amount), 0) as overtime_amount
          FROM staff_data sd
          JOIN payroll_items pi ON sd.employee_payroll_id = pi.employee_payroll_id
          JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE pc.pay_type = 'Overtime'
          GROUP BY sd.location_id
        ),
        employee_summary AS (
          SELECT
            sd.employee_id,
            sd.location_id,
            sd.gross_pay,
            sd.net_pay,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employer,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employer,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'income_tax'), 0) as pcb
          FROM staff_data sd
        ),
        -- Director summary for JVDR
        director_summary AS (
          SELECT
            dd.employee_id,
            dd.location_id,
            dd.gross_pay,
            dd.net_pay,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data ded WHERE ded.employee_id = dd.employee_id AND ded.deduction_type = 'epf'), 0) as epf_employer,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data ded WHERE ded.employee_id = dd.employee_id AND ded.deduction_type = 'socso'), 0) as socso_employer,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data ded WHERE ded.employee_id = dd.employee_id AND ded.deduction_type = 'sip'), 0) as sip_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data ded WHERE ded.employee_id = dd.employee_id AND ded.deduction_type = 'income_tax'), 0) as pcb
          FROM director_data dd
        )
        SELECT
          es.location_id,
          SUM(es.gross_pay) as total_gaji_kasar,
          SUM(es.epf_employer) as total_epf_majikan,
          SUM(es.socso_employer) as total_socso_majikan,
          SUM(es.sip_employer) as total_sip_majikan,
          SUM(es.pcb) as total_pcb,
          SUM(es.net_pay) as total_gaji_bersih,
          COALESCE((SELECT cs.commission_mee FROM commission_split cs WHERE cs.location_id = es.location_id), 0) as commission_mee,
          COALESCE((SELECT cs.commission_bh FROM commission_split cs WHERE cs.location_id = es.location_id), 0) as commission_bh,
          COALESCE((SELECT ct.cuti_tahunan_amount FROM cuti_tahunan_data ct WHERE ct.location_id = es.location_id), 0) as cuti_tahunan,
          COALESCE((SELECT sl.salary_amount FROM salary_by_location sl WHERE sl.location_id = es.location_id), 0) as salary_amount,
          COALESCE((SELECT ol.overtime_amount FROM overtime_by_location ol WHERE ol.location_id = es.location_id), 0) as overtime_amount
        FROM employee_summary es
        GROUP BY es.location_id
        ORDER BY es.location_id
      `;

      const salaryResult = await pool.query(salaryQuery, [yearInt, monthInt]);

      // Get individual director data for JVDR
      const directorQuery = `
        WITH job_location_map AS (
          SELECT job_id, location_code
          FROM job_location_mappings
          WHERE is_active = true
        ),
        director_payroll AS (
          SELECT
            s.id as employee_id,
            s.name as employee_name,
            ep.gross_pay,
            ep.net_pay,
            CASE
              WHEN s.id = 'GOH' THEN 'GTH'
              WHEN s.id = 'WONG' THEN 'WSF'
              WHEN s.id IN ('WINNIE', 'WINNIE.G') THEN 'WG'
            END as director_code,
            CASE
              WHEN s.id = 'GOH' THEN 'Salary Director - GOH'
              WHEN s.id = 'WONG' THEN 'Salary Director - WONG'
              WHEN s.id IN ('WINNIE', 'WINNIE.G') THEN 'Salary Ex.Director - WINNIE.G'
            END as particulars
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN staffs s ON ep.employee_id = s.id
          WHERE mp.year = $1 AND mp.month = $2
            AND s.id IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
        ),
        director_deductions AS (
          SELECT
            ep.employee_id,
            pd.deduction_type,
            pd.employee_amount,
            pd.employer_amount
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN payroll_deductions pd ON ep.id = pd.employee_payroll_id
          WHERE mp.year = $1 AND mp.month = $2
            AND ep.employee_id IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
        )
        SELECT
          dp.employee_id,
          dp.employee_name,
          dp.director_code,
          dp.particulars,
          dp.gross_pay,
          dp.net_pay,
          COALESCE((SELECT SUM(employer_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employer,
          COALESCE((SELECT SUM(employer_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employer,
          COALESCE((SELECT SUM(employer_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employer,
          COALESCE((SELECT SUM(employee_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'income_tax'), 0) as pcb
        FROM director_payroll dp
        ORDER BY dp.director_code
      `;

      const directorResult = await pool.query(directorQuery, [yearInt, monthInt]);

      // Get location-account mappings
      const mappingsQuery = `
        SELECT * FROM location_account_mappings
        WHERE is_active = true
        ORDER BY voucher_type, location_id, mapping_type
      `;
      const mappingsResult = await pool.query(mappingsQuery);

      // Get all locations for name lookup
      const locationsQuery = `SELECT id, name FROM locations ORDER BY id`;
      const locationsResult = await pool.query(locationsQuery);
      const locationNames = {};
      locationsResult.rows.forEach(l => {
        locationNames[l.id] = l.name;
      });

      // Build voucher preview
      const jvdrData = [];
      const jvslData = [];

      // Group mappings by location and voucher type
      const mappingsByLocation = {};
      const locationNamesByMapping = {};
      mappingsResult.rows.forEach(m => {
        const key = `${m.voucher_type}_${m.location_id}`;
        if (!mappingsByLocation[key]) {
          mappingsByLocation[key] = {};
          locationNamesByMapping[key] = m.location_name;
        }
        mappingsByLocation[key][m.mapping_type] = m.account_code;
      });

      // Get accrual accounts for staff (location 00)
      const staffAccruals = mappingsByLocation["JVSL_00"] || {};

      // Process salary data for each location (JVSL - staff only, directors excluded)
      salaryResult.rows.forEach(location => {
        const locationId = location.location_id;
        // Skip location 01 (directors are handled separately)
        if (locationId === "01") return;

        const mappingKey = `JVSL_${locationId}`;
        const locationMappings = mappingsByLocation[mappingKey] || {};

        const grossPay = parseFloat(location.total_gaji_kasar) || 0;
        const salaryAmount = parseFloat(location.salary_amount) || 0;
        const overtimeAmount = parseFloat(location.overtime_amount) || 0;
        const epfAmount = parseFloat(location.total_epf_majikan) || 0;
        const socsoAmount = parseFloat(location.total_socso_majikan) || 0;
        const sipAmount = parseFloat(location.total_sip_majikan) || 0;
        const pcbAmount = parseFloat(location.total_pcb) || 0;
        const netSalary = parseFloat(location.total_gaji_bersih) || 0;
        const commissionMee = parseFloat(location.commission_mee) || 0;
        const commissionBh = parseFloat(location.commission_bh) || 0;
        const cutiTahunan = parseFloat(location.cuti_tahunan) || 0;

        const entry = {
          location_id: locationId,
          location_name: locationNamesByMapping[mappingKey] || locationNames[locationId] || locationId,
          gross_pay: grossPay,
          salary: salaryAmount,
          overtime: overtimeAmount,
          epf_employer: epfAmount,
          socso_employer: socsoAmount,
          sip_employer: sipAmount,
          pcb: pcbAmount,
          net_salary: netSalary,
          commission_mee: commissionMee,
          commission_bh: commissionBh,
          cuti_tahunan: cutiTahunan,
          accounts: {
            salary: locationMappings.salary || null,
            overtime: locationMappings.overtime || null,
            epf_employer: locationMappings.epf_employer || null,
            socso_employer: locationMappings.socso_employer || null,
            sip_employer: locationMappings.sip_employer || null,
            commission_mee: locationMappings.commission_mee || null,
            commission_bh: locationMappings.commission_bh || null,
            cuti_tahunan: locationMappings.cuti_tahunan || null,
          },
        };

        jvslData.push(entry);
      });

      // Process individual director data for JVDR
      const directorMappings = mappingsByLocation["JVDR_01"] || {};
      if (directorResult.rows.length > 0) {
        // Calculate totals for JVDR debit lines
        const directorTotals = {
          gross_pay: 0,
          net_pay: 0,
          epf_employer: 0,
          socso_employer: 0,
          sip_employer: 0,
          pcb: 0,
        };

        directorResult.rows.forEach(director => {
          directorTotals.gross_pay += parseFloat(director.gross_pay) || 0;
          directorTotals.net_pay += parseFloat(director.net_pay) || 0;
          directorTotals.epf_employer += parseFloat(director.epf_employer) || 0;
          directorTotals.socso_employer += parseFloat(director.socso_employer) || 0;
          directorTotals.sip_employer += parseFloat(director.sip_employer) || 0;
          directorTotals.pcb += parseFloat(director.pcb) || 0;
        });

        const jvdrEntry = {
          location_id: "01",
          location_name: locationNamesByMapping["JVDR_01"] || "DIRECTOR'S REMUNERATION",
          salary: directorTotals.gross_pay,
          epf_employer: directorTotals.epf_employer,
          socso_employer: directorTotals.socso_employer,
          sip_employer: directorTotals.sip_employer,
          pcb: directorTotals.pcb,
          net_salary: directorTotals.net_pay,
          directors: directorResult.rows.map(d => ({
            employee_id: d.employee_id,
            employee_name: d.employee_name,
            director_code: d.director_code,
            particulars: d.particulars,
            net_pay: parseFloat(d.net_pay) || 0,
          })),
          accounts: {
            salary: directorMappings.salary || null,
            epf_employer: directorMappings.epf_employer || null,
            socso_employer: directorMappings.socso_employer || null,
            sip_employer: directorMappings.sip_employer || null,
            accrual_salary: directorMappings.accrual_salary || null,
            accrual_epf: directorMappings.accrual_epf || null,
            accrual_socso: directorMappings.accrual_socso || null,
            accrual_sip: directorMappings.accrual_sip || null,
            accrual_pcb: directorMappings.accrual_pcb || null,
          },
        };
        jvdrData.push(jvdrEntry);
      }

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
      // Directors are excluded from JVSL (they go to JVDR with individual breakdown)
      const salaryQuery = `
        WITH job_location_map AS (
          SELECT job_id, location_code
          FROM job_location_mappings
          WHERE is_active = true
        ),
        employee_data AS (
          SELECT
            ep.id as employee_payroll_id,
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
        -- Staff data (for JVSL) - excludes directors
        staff_data AS (
          SELECT
            ed.*
          FROM employee_data ed
          WHERE ed.employee_id NOT IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
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
        -- Commission MEE/BH split for locations 03 and 04
        commission_split AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(CASE WHEN p.type = 'MEE' THEN pi.amount ELSE 0 END), 0) as commission_mee,
            COALESCE(SUM(CASE WHEN p.type = 'BH' THEN pi.amount ELSE 0 END), 0) as commission_bh
          FROM staff_data sd
          JOIN payroll_items pi ON sd.employee_payroll_id = pi.employee_payroll_id
          LEFT JOIN product_pay_codes ppc ON pi.pay_code_id = ppc.pay_code_id
          LEFT JOIN products p ON ppc.product_id = p.id
          WHERE sd.location_id IN ('03', '04')
            AND p.type IN ('MEE', 'BH')
          GROUP BY sd.location_id
        ),
        -- Cuti Tahunan by location
        cuti_tahunan_data AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(lr.amount_paid), 0) as cuti_tahunan_amount
          FROM staff_data sd
          JOIN leave_records lr ON sd.employee_id = lr.employee_id
          WHERE lr.leave_type = 'cuti_tahunan'
            AND lr.status = 'approved'
            AND lr.amount_paid > 0
            AND EXTRACT(YEAR FROM lr.leave_date) = $1
            AND EXTRACT(MONTH FROM lr.leave_date) = $2
          GROUP BY sd.location_id
        ),
        -- Salary amounts by location (excluding overtime)
        salary_by_location AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(pi.amount), 0) as salary_amount
          FROM staff_data sd
          JOIN payroll_items pi ON sd.employee_payroll_id = pi.employee_payroll_id
          JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE pc.pay_type IN ('Base', 'Tambahan')
          GROUP BY sd.location_id
        ),
        -- Overtime amounts by location
        overtime_by_location AS (
          SELECT
            sd.location_id,
            COALESCE(SUM(pi.amount), 0) as overtime_amount
          FROM staff_data sd
          JOIN payroll_items pi ON sd.employee_payroll_id = pi.employee_payroll_id
          JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE pc.pay_type = 'Overtime'
          GROUP BY sd.location_id
        ),
        employee_summary AS (
          SELECT
            sd.employee_id,
            sd.location_id,
            sd.gross_pay,
            sd.net_pay,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employer,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employer,
            COALESCE((SELECT SUM(employer_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employer,
            COALESCE((SELECT SUM(employee_amount) FROM deductions_data dd WHERE dd.employee_id = sd.employee_id AND dd.deduction_type = 'income_tax'), 0) as pcb
          FROM staff_data sd
        )
        SELECT
          es.location_id,
          SUM(es.gross_pay) as total_gaji_kasar,
          SUM(es.epf_employer) as total_epf_majikan,
          SUM(es.socso_employer) as total_socso_majikan,
          SUM(es.sip_employer) as total_sip_majikan,
          SUM(es.pcb) as total_pcb,
          SUM(es.net_pay) as total_gaji_bersih,
          COALESCE((SELECT cs.commission_mee FROM commission_split cs WHERE cs.location_id = es.location_id), 0) as commission_mee,
          COALESCE((SELECT cs.commission_bh FROM commission_split cs WHERE cs.location_id = es.location_id), 0) as commission_bh,
          COALESCE((SELECT ct.cuti_tahunan_amount FROM cuti_tahunan_data ct WHERE ct.location_id = es.location_id), 0) as cuti_tahunan,
          COALESCE((SELECT sl.salary_amount FROM salary_by_location sl WHERE sl.location_id = es.location_id), 0) as salary_amount,
          COALESCE((SELECT ol.overtime_amount FROM overtime_by_location ol WHERE ol.location_id = es.location_id), 0) as overtime_amount
        FROM employee_summary es
        GROUP BY es.location_id
        ORDER BY es.location_id
      `;
      const salaryResult = await client.query(salaryQuery, [yearInt, monthInt]);

      // Get individual director data for JVDR
      const directorQuery = `
        WITH director_payroll AS (
          SELECT
            s.id as employee_id,
            s.name as employee_name,
            ep.gross_pay,
            ep.net_pay,
            CASE
              WHEN s.id = 'GOH' THEN 'GTH'
              WHEN s.id = 'WONG' THEN 'WSF'
              WHEN s.id IN ('WINNIE', 'WINNIE.G') THEN 'WG'
            END as director_code,
            CASE
              WHEN s.id = 'GOH' THEN 'Salary Director - GOH'
              WHEN s.id = 'WONG' THEN 'Salary Director - WONG'
              WHEN s.id IN ('WINNIE', 'WINNIE.G') THEN 'Salary Ex.Director - WINNIE.G'
            END as particulars
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN staffs s ON ep.employee_id = s.id
          WHERE mp.year = $1 AND mp.month = $2
            AND s.id IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
        ),
        director_deductions AS (
          SELECT
            ep.employee_id,
            pd.deduction_type,
            pd.employee_amount,
            pd.employer_amount
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN payroll_deductions pd ON ep.id = pd.employee_payroll_id
          WHERE mp.year = $1 AND mp.month = $2
            AND ep.employee_id IN ('GOH', 'WONG', 'WINNIE', 'WINNIE.G')
        )
        SELECT
          dp.employee_id,
          dp.employee_name,
          dp.director_code,
          dp.particulars,
          dp.gross_pay,
          dp.net_pay,
          COALESCE((SELECT SUM(employer_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'epf'), 0) as epf_employer,
          COALESCE((SELECT SUM(employer_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'socso'), 0) as socso_employer,
          COALESCE((SELECT SUM(employer_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'sip'), 0) as sip_employer,
          COALESCE((SELECT SUM(employee_amount) FROM director_deductions dd WHERE dd.employee_id = dp.employee_id AND dd.deduction_type = 'income_tax'), 0) as pcb
        FROM director_payroll dp
        ORDER BY dp.director_code
      `;
      const directorResult = await client.query(directorQuery, [yearInt, monthInt]);

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
          // Create JVDR entry using individual director data
          if (directorResult.rows.length > 0) {
            const directorMappings = mappingsByLocation["JVDR_01"] || {};

            // Calculate totals from individual directors
            const directorTotals = {
              gross_pay: 0,
              net_pay: 0,
              epf_employer: 0,
              socso_employer: 0,
              sip_employer: 0,
              pcb: 0,
            };
            directorResult.rows.forEach(d => {
              directorTotals.gross_pay += parseFloat(d.gross_pay) || 0;
              directorTotals.net_pay += parseFloat(d.net_pay) || 0;
              directorTotals.epf_employer += parseFloat(d.epf_employer) || 0;
              directorTotals.socso_employer += parseFloat(d.socso_employer) || 0;
              directorTotals.sip_employer += parseFloat(d.sip_employer) || 0;
              directorTotals.pcb += parseFloat(d.pcb) || 0;
            });

            // Insert journal entry
            const entryResult = await client.query(
              `INSERT INTO journal_entries (reference_no, entry_date, entry_type, description, status, created_by)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
              [jvdrRef, entryDate, "JVDR", `Director's Remuneration - ${monthStr}/${yearInt}`, "active", req.staffId || null]
            );
            const entryId = entryResult.rows[0].id;

            // Insert debit lines (using totals)
            const debitLines = [
              { account: directorMappings.salary, amount: directorTotals.gross_pay, desc: "Salary" },
              { account: directorMappings.epf_employer, amount: directorTotals.epf_employer, desc: "EPF Employer" },
              { account: directorMappings.socso_employer, amount: directorTotals.socso_employer, desc: "SOCSO Employer" },
              { account: directorMappings.sip_employer, amount: directorTotals.sip_employer, desc: "SIP Employer" },
            ].filter(l => l.account && l.amount > 0);

            let lineNumber = 1;
            for (const line of debitLines) {
              await client.query(
                `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, particulars)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [entryId, lineNumber++, line.account, line.amount, 0, line.desc]
              );
            }

            // Insert individual director salary credit lines (ACD_SAL for each director)
            for (const director of directorResult.rows) {
              const netPay = parseFloat(director.net_pay) || 0;
              if (directorMappings.accrual_salary && netPay > 0) {
                await client.query(
                  `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_code, debit_amount, credit_amount, particulars)
                   VALUES ($1, $2, $3, $4, $5, $6)`,
                  [entryId, lineNumber++, directorMappings.accrual_salary, 0, netPay, director.particulars]
                );
              }
            }

            // Insert other accrual credit lines (EPF, SOCSO, SIP, PCB)
            const otherCreditLines = [
              { account: directorMappings.accrual_epf, amount: directorTotals.epf_employer, desc: "EPF Payable" },
              { account: directorMappings.accrual_socso, amount: directorTotals.socso_employer, desc: "SOCSO Payable" },
              { account: directorMappings.accrual_sip, amount: directorTotals.sip_employer, desc: "SIP Payable" },
              { account: directorMappings.accrual_pcb, amount: directorTotals.pcb, desc: "PCB Payable" },
            ].filter(l => l.account && l.amount > 0);

            for (const line of otherCreditLines) {
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
            let totalCommissionMee = 0, totalCommissionBh = 0, totalCutiTahunan = 0;

            // Insert debit lines for each location
            for (const location of staffData) {
              const locationMappings = mappingsByLocation[`JVSL_${location.location_id}`] || {};

              const salaryAmount = parseFloat(location.salary_amount) || 0;
              const overtimeAmount = parseFloat(location.overtime_amount) || 0;
              const grossPay = parseFloat(location.total_gaji_kasar) || 0;
              const epf = parseFloat(location.total_epf_majikan) || 0;
              const socso = parseFloat(location.total_socso_majikan) || 0;
              const sip = parseFloat(location.total_sip_majikan) || 0;
              const pcb = parseFloat(location.total_pcb) || 0;
              const net = parseFloat(location.total_gaji_bersih) || 0;
              const commissionMee = parseFloat(location.commission_mee) || 0;
              const commissionBh = parseFloat(location.commission_bh) || 0;
              const cutiTahunan = parseFloat(location.cuti_tahunan) || 0;

              totalSalary += grossPay;
              totalEpf += epf;
              totalSocso += socso;
              totalSip += sip;
              totalPcb += pcb;
              totalNet += net;
              totalCommissionMee += commissionMee;
              totalCommissionBh += commissionBh;
              totalCutiTahunan += cutiTahunan;

              const debitLines = [
                // Salary (Base + Tambahan, excluding OT)
                { account: locationMappings.salary, amount: salaryAmount, desc: `Salary - Location ${location.location_id}` },
                // Overtime (separate line item)
                { account: locationMappings.overtime, amount: overtimeAmount, desc: `Overtime - Location ${location.location_id}` },
                { account: locationMappings.epf_employer, amount: epf, desc: `EPF - Location ${location.location_id}` },
                { account: locationMappings.socso_employer, amount: socso, desc: `SOCSO - Location ${location.location_id}` },
                { account: locationMappings.sip_employer, amount: sip, desc: `SIP - Location ${location.location_id}` },
                // Commission MEE/BH for locations 03 and 04
                { account: locationMappings.commission_mee, amount: commissionMee, desc: `Commission MEE - Location ${location.location_id}` },
                { account: locationMappings.commission_bh, amount: commissionBh, desc: `Commission BH - Location ${location.location_id}` },
                // Cuti Tahunan
                { account: locationMappings.cuti_tahunan, amount: cutiTahunan, desc: `Cuti Tahunan - Location ${location.location_id}` },
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
