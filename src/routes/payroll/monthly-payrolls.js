// src/routes/payroll/monthly-payrolls.js
import { Router } from "express";

// Helper function to format date to YYYY-MM-DD string
const formatDateToYMD = (date) => {
  if (!date) return null;
  if (typeof date === 'string') {
    // If already a string, extract just the date part
    return date.split('T')[0].split(' ')[0];
  }
  if (date instanceof Date) {
    // Format as YYYY-MM-DD using local timezone
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return null;
};

export default function (pool) {
  const router = Router();

  // Get all monthly payrolls
  router.get("/", async (req, res) => {
    const { year, month, include_employee_payrolls } = req.query; // Add filters
    try {
      let query = `
        SELECT * FROM monthly_payrolls
      `;
      const values = [];
      const whereClauses = [];
      let paramCount = 1;

      if (year) {
        whereClauses.push(`year = $${paramCount++}`);
        values.push(parseInt(year));
      }
      if (month) {
        whereClauses.push(`month = $${paramCount++}`);
        values.push(parseInt(month));
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(" AND ")}`;
      }

      query += ` ORDER BY year DESC, month DESC`;

      const result = await pool.query(query, values);

      // If including employee payrolls, fetch and attach them
      if (include_employee_payrolls === "true") {
        const payrollsWithEmployees = await Promise.all(
          result.rows.map(async (payroll) => {
            const employeePayrollsQuery = `
              SELECT ep.*, s.name as employee_name
              FROM employee_payrolls ep
              LEFT JOIN staffs s ON ep.employee_id = s.id
              WHERE ep.monthly_payroll_id = $1
            `;
            const employeePayrollsResult = await pool.query(
              employeePayrollsQuery,
              [payroll.id]
            );
            return {
              ...payroll,
              employee_payrolls: employeePayrollsResult.rows,
            };
          })
        );
        return res.json(payrollsWithEmployees);
      }

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching monthly payrolls:", error);
      res.status(500).json({
        message: "Error fetching monthly payrolls",
        error: error.message,
      });
    }
  });

  // Add this new endpoint to monthly-payrolls.js
  router.get("/:id/eligible-employees", async (req, res) => {
    const { id } = req.params;

    try {
      // Get payroll details to verify year and month
      const payrollQuery = `
      SELECT year, month FROM monthly_payrolls
      WHERE id = $1
    `;
      const payrollResult = await pool.query(payrollQuery, [id]);

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      const { year, month } = payrollResult.rows[0];

      // Get all work logs for this month and year
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().split("T")[0]; // Last day of month

      // Query daily work logs and extract unique employee-job combinations
      const dailyEligibleQuery = `
      SELECT DISTINCT dwle.employee_id, dwle.job_id
      FROM daily_work_logs dwl
      JOIN daily_work_log_entries dwle ON dwl.id = dwle.work_log_id
      WHERE dwl.log_date BETWEEN $1 AND $2
      AND dwl.status = 'Submitted'
    `;

      // Query monthly work logs and extract unique employee-job combinations
      const monthlyEligibleQuery = `
      SELECT DISTINCT mwle.employee_id, mwle.job_id
      FROM monthly_work_logs mwl
      JOIN monthly_work_log_entries mwle ON mwl.id = mwle.monthly_log_id
      WHERE mwl.log_month = $1 AND mwl.log_year = $2
      AND mwl.status = 'Submitted'
    `;

      // Query production entries for MEE_PACKING and BH_PACKING workers
      const productionEligibleQuery = `
      SELECT DISTINCT pe.worker_id as employee_id,
        CASE WHEN p.type = 'MEE' THEN 'MEE_PACKING' ELSE 'BH_PACKING' END as job_id
      FROM production_entries pe
      JOIN products p ON pe.product_id = p.id
      WHERE pe.entry_date BETWEEN $1 AND $2
      AND pe.bags_packed > 0
    `;

      const [dailyResult, monthlyResult, productionResult] = await Promise.all([
        pool.query(dailyEligibleQuery, [startDate, endDate]),
        pool.query(monthlyEligibleQuery, [month, year]),
        pool.query(productionEligibleQuery, [startDate, endDate]),
      ]);

      // Group employees by job type (combine daily, monthly, and production results)
      const jobEmployeeMap = {};

      // Add daily log employees
      dailyResult.rows.forEach((row) => {
        if (!jobEmployeeMap[row.job_id]) {
          jobEmployeeMap[row.job_id] = new Set();
        }
        jobEmployeeMap[row.job_id].add(row.employee_id);
      });

      // Add monthly log employees
      monthlyResult.rows.forEach((row) => {
        if (!jobEmployeeMap[row.job_id]) {
          jobEmployeeMap[row.job_id] = new Set();
        }
        jobEmployeeMap[row.job_id].add(row.employee_id);
      });

      // Add production entry workers (MEE_PACKING and BH_PACKING)
      productionResult.rows.forEach((row) => {
        if (!jobEmployeeMap[row.job_id]) {
          jobEmployeeMap[row.job_id] = new Set();
        }
        jobEmployeeMap[row.job_id].add(row.employee_id);
      });

      // Convert Sets to arrays
      const finalJobEmployeeMap = {};
      Object.keys(jobEmployeeMap).forEach((jobId) => {
        finalJobEmployeeMap[jobId] = Array.from(jobEmployeeMap[jobId]);
      });

      res.json({
        month,
        year,
        eligibleJobs: Object.keys(finalJobEmployeeMap),
        jobEmployeeMap: finalJobEmployeeMap,
      });
    } catch (error) {
      console.error("Error fetching eligible employees:", error);
      res.status(500).json({
        message: "Error fetching eligible employees",
        error: error.message,
      });
    }
  });

  // Get specific monthly payroll by ID
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      // Get payroll details
      const payrollQuery = `
        SELECT * FROM monthly_payrolls
        WHERE id = $1
      `;
      const payrollResult = await pool.query(payrollQuery, [id]);

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      // Get employee payrolls for this monthly payroll
      const employeePayrollsQuery = `
        SELECT ep.*, s.name as employee_name
        FROM employee_payrolls ep
        LEFT JOIN staffs s ON ep.employee_id = s.id
        WHERE ep.monthly_payroll_id = $1
      `;
      const employeePayrollsResult = await pool.query(employeePayrollsQuery, [
        id,
      ]);

      res.json({
        ...payrollResult.rows[0],
        employeePayrolls: employeePayrollsResult.rows,
      });
    } catch (error) {
      console.error("Error fetching monthly payroll details:", error);
      res.status(500).json({
        message: "Error fetching monthly payroll details",
        error: error.message,
      });
    }
  });

  // Create a new monthly payroll
  router.post("/", async (req, res) => {
    const { year, month, created_by } = req.body;

    if (!year || !month) {
      return res.status(400).json({ message: "Year and month are required" });
    }

    try {
      // Create new monthly payroll
      const insertQuery = `
        INSERT INTO monthly_payrolls (year, month, status, created_by)
        VALUES ($1, $2, 'Processing', $3)
        RETURNING *
      `;
      const insertResult = await pool.query(insertQuery, [
        year,
        month,
        created_by || null,
      ]);

      res.status(201).json({
        message: "Monthly payroll created successfully",
        payroll: insertResult.rows[0],
      });
    } catch (error) {
      console.error("Error creating monthly payroll:", error);
      res.status(500).json({
        message: "Error creating monthly payroll",
        error: error.message,
      });
    }
  });

  // Process a monthly payroll
  router.post("/:id/process", async (req, res) => {
    const { id } = req.params;

    try {
      // Get payroll details to verify year and month
      const payrollQuery = `
        SELECT year, month FROM monthly_payrolls
        WHERE id = $1
      `;
      const payrollResult = await pool.query(payrollQuery, [id]);

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      const { year, month } = payrollResult.rows[0];

      // Get all work logs for this month and year
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().split("T")[0]; // Last day of month

      // Query daily work logs
      const dailyWorkLogsQuery = `
        SELECT dwl.*, json_agg(
          json_build_object(
            'employee_id', dwle.employee_id,
            'job_id', dwle.job_id,
            'total_hours', dwle.total_hours,
            'activities', (
              SELECT json_agg(
                json_build_object(
                  'pay_code_id', dwla.pay_code_id,
                  'description', pc.description,
                  'pay_type', pc.pay_type,
                  'rate_unit', pc.rate_unit,
                  'rate_used', dwla.rate_used,
                  'hours_applied', dwla.hours_applied,
                  'units_produced', dwla.units_produced,
                  'calculated_amount', dwla.calculated_amount
                )
              )
              FROM daily_work_log_activities dwla
              JOIN pay_codes pc ON dwla.pay_code_id = pc.id
              WHERE dwla.log_entry_id = dwle.id
            )
          )
        ) as employee_entries
        FROM daily_work_logs dwl
        JOIN daily_work_log_entries dwle ON dwl.id = dwle.work_log_id
        WHERE dwl.log_date BETWEEN $1 AND $2
        AND dwl.status = 'Submitted'
        GROUP BY dwl.id
        ORDER BY dwl.log_date
      `;

      // Query monthly work logs (for MAINTENANCE, OFFICE, TUKANG_SAPU jobs)
      const monthlyWorkLogsQuery = `
        SELECT mwl.*, json_agg(
          json_build_object(
            'employee_id', mwle.employee_id,
            'job_id', mwle.job_id,
            'total_hours', mwle.total_hours,
            'overtime_hours', mwle.overtime_hours,
            'activities', (
              SELECT json_agg(
                json_build_object(
                  'pay_code_id', mwla.pay_code_id,
                  'description', pc.description,
                  'pay_type', pc.pay_type,
                  'rate_unit', pc.rate_unit,
                  'rate_used', mwla.rate_used,
                  'hours_applied', mwla.hours_applied,
                  'calculated_amount', mwla.calculated_amount
                )
              )
              FROM monthly_work_log_activities mwla
              JOIN pay_codes pc ON mwla.pay_code_id = pc.id
              WHERE mwla.monthly_entry_id = mwle.id
            )
          )
        ) as employee_entries
        FROM monthly_work_logs mwl
        JOIN monthly_work_log_entries mwle ON mwl.id = mwle.monthly_log_id
        WHERE mwl.log_month = $1 AND mwl.log_year = $2
        AND mwl.status = 'Submitted'
        GROUP BY mwl.id
        ORDER BY mwl.section
      `;

      const [dailyLogsResult, monthlyLogsResult] = await Promise.all([
        pool.query(dailyWorkLogsQuery, [startDate, endDate]),
        pool.query(monthlyWorkLogsQuery, [month, year]),
      ]);

      // Return both daily and monthly work logs
      res.json({
        message: "Processing initiated",
        month,
        year,
        daily_work_logs_count: dailyLogsResult.rows.length,
        monthly_work_logs_count: monthlyLogsResult.rows.length,
        daily_work_logs: dailyLogsResult.rows,
        monthly_work_logs: monthlyLogsResult.rows,
      });
    } catch (error) {
      console.error("Error processing monthly payroll:", error);
      res.status(500).json({
        message: "Error processing monthly payroll",
        error: error.message,
      });
    }
  });

  // ============================================================================
  // UNIFIED PAYROLL PROCESSING ENDPOINT
  // Handles everything in a single API call: fetch data, calculate, save
  // ============================================================================
  router.post("/:id/process-all", async (req, res) => {
    const { id } = req.params;
    const { selected_employees = [] } = req.body; // [{employeeId, jobType}, ...]

    if (!selected_employees.length) {
      return res.status(400).json({ message: "No employees selected for processing" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. Get payroll details
      const payrollResult = await client.query(
        "SELECT year, month FROM monthly_payrolls WHERE id = $1",
        [id]
      );
      if (payrollResult.rows.length === 0) {
        throw new Error("Monthly payroll not found");
      }
      const { year, month } = payrollResult.rows[0];

      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().split("T")[0];

      // 2. Fetch all required data in parallel
      let dailyLogsResult, monthlyLogsResult, manualItemsResult, staffsResult,
          jobsResult, epfRatesResult, socsoRatesResult, sipRatesResult,
          incomeTaxRatesResult, holidaysResult, productionEntriesResult,
          productPayCodeMappingsResult;

      try {
        [
          dailyLogsResult,
          monthlyLogsResult,
          manualItemsResult,
          staffsResult,
          jobsResult,
          epfRatesResult,
          socsoRatesResult,
          sipRatesResult,
          incomeTaxRatesResult,
          holidaysResult,
          productionEntriesResult,
          productPayCodeMappingsResult,
        ] = await Promise.all([
        // Daily work logs with activities
        client.query(`
          SELECT dwl.id, dwl.log_date, dwle.employee_id, dwle.job_id, dwle.total_hours,
            json_agg(json_build_object(
              'pay_code_id', dwla.pay_code_id,
              'description', pc.description,
              'pay_type', pc.pay_type,
              'rate_unit', pc.rate_unit,
              'rate_used', dwla.rate_used,
              'hours_applied', dwla.hours_applied,
              'units_produced', dwla.units_produced,
              'calculated_amount', dwla.calculated_amount
            )) as activities
          FROM daily_work_logs dwl
          JOIN daily_work_log_entries dwle ON dwl.id = dwle.work_log_id
          LEFT JOIN daily_work_log_activities dwla ON dwla.log_entry_id = dwle.id
          LEFT JOIN pay_codes pc ON dwla.pay_code_id = pc.id
          WHERE dwl.log_date BETWEEN $1 AND $2 AND dwl.status = 'Submitted'
          GROUP BY dwl.id, dwl.log_date, dwle.employee_id, dwle.job_id, dwle.total_hours
        `, [startDate, endDate]),

        // Monthly work logs with activities
        client.query(`
          SELECT mwl.id, mwl.log_month, mwl.log_year, mwle.employee_id, mwle.job_id,
            mwle.total_hours, mwle.overtime_hours,
            json_agg(json_build_object(
              'pay_code_id', mwla.pay_code_id,
              'description', pc.description,
              'pay_type', pc.pay_type,
              'rate_unit', pc.rate_unit,
              'rate_used', mwla.rate_used,
              'hours_applied', mwla.hours_applied,
              'calculated_amount', mwla.calculated_amount
            )) as activities
          FROM monthly_work_logs mwl
          JOIN monthly_work_log_entries mwle ON mwl.id = mwle.monthly_log_id
          LEFT JOIN monthly_work_log_activities mwla ON mwla.monthly_entry_id = mwle.id
          LEFT JOIN pay_codes pc ON mwla.pay_code_id = pc.id
          WHERE mwl.log_month = $1 AND mwl.log_year = $2 AND mwl.status = 'Submitted'
          GROUP BY mwl.id, mwl.log_month, mwl.log_year, mwle.employee_id, mwle.job_id,
            mwle.total_hours, mwle.overtime_hours
        `, [month, year]),

        // Existing manual items
        client.query(`
          SELECT ep.employee_id, pi.pay_code_id, pi.description, pi.rate, pi.rate_unit,
            pi.quantity, pi.amount, pc.pay_type
          FROM employee_payrolls ep
          JOIN payroll_items pi ON ep.id = pi.employee_payroll_id
          LEFT JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE ep.monthly_payroll_id = $1 AND pi.is_manual = true
        `, [id]),

        // Staff data
        client.query(`
          SELECT id, name, birthdate, nationality, marital_status,
            spouse_employment_status, number_of_children
          FROM staffs
        `),

        // Jobs data with full section name from sections table (use DISTINCT ON to avoid duplicates)
        client.query(`
          SELECT DISTINCT ON (j.id) j.id, j.section as section_code, COALESCE(s.name, j.section) as section
          FROM jobs j
          LEFT JOIN sections s ON j.section = s.id OR j.section = s.name OR UPPER(j.section) = UPPER(LEFT(s.name, 1))
          ORDER BY j.id, s.name
        `),

        // Contribution rates
        client.query("SELECT * FROM epf_rates WHERE is_active = true"),
        client.query("SELECT * FROM socso_rates WHERE is_active = true ORDER BY wage_from"),
        client.query("SELECT * FROM sip_rates WHERE is_active = true ORDER BY wage_from"),
        client.query("SELECT * FROM income_tax_rates WHERE is_active = true ORDER BY wage_from"),

        // Holidays for the payroll period (for production entry day type calculation)
        client.query(`
          SELECT holiday_date FROM holiday_calendar
          WHERE holiday_date BETWEEN $1 AND $2
        `, [startDate, endDate]),

        // Production entries for MEE_PACKING and BH_PACKING workers
        client.query(`
          SELECT pe.entry_date, pe.product_id, pe.worker_id, pe.bags_packed,
            p.type as product_type, p.description as product_description
          FROM production_entries pe
          JOIN products p ON pe.product_id = p.id
          WHERE pe.entry_date BETWEEN $1 AND $2
            AND pe.bags_packed > 0
          ORDER BY pe.worker_id, pe.entry_date
        `, [startDate, endDate]),

        // Product to pay code mappings
        client.query(`
          SELECT ppc.product_id, ppc.pay_code_id,
            pc.description, pc.pay_type, pc.rate_unit,
            CAST(pc.rate_biasa AS NUMERIC(10,2)) as rate_biasa,
            CAST(pc.rate_ahad AS NUMERIC(10,2)) as rate_ahad,
            CAST(pc.rate_umum AS NUMERIC(10,2)) as rate_umum
          FROM product_pay_codes ppc
          JOIN pay_codes pc ON ppc.pay_code_id = pc.id
          WHERE pc.is_active = true
        `),
        ]);
      } catch (fetchError) {
        console.error("Error fetching payroll data:", fetchError);
        throw fetchError;
      }

      // Build lookup maps
      const staffsMap = new Map(staffsResult.rows.map(s => [s.id, s]));
      const jobsMap = new Map(jobsResult.rows.map(j => [j.id, j]));
      const epfRates = epfRatesResult.rows;
      const socsoRates = socsoRatesResult.rows;
      const sipRates = sipRatesResult.rows;
      const incomeTaxRates = incomeTaxRatesResult.rows;

      // Group manual items by employee
      const manualItemsByEmployee = {};
      manualItemsResult.rows.forEach(item => {
        if (!manualItemsByEmployee[item.employee_id]) {
          manualItemsByEmployee[item.employee_id] = [];
        }
        manualItemsByEmployee[item.employee_id].push({
          ...item,
          amount: parseFloat(item.amount),
          rate: parseFloat(item.rate),
          quantity: parseFloat(item.quantity),
          is_manual: true,
        });
      });

      // 3. Process work logs into payroll items per employee-job (preserving date info for traceability)
      const workLogsByEmployeeJob = {};

      // Process daily logs - preserve individual entries with source date
      dailyLogsResult.rows.forEach(log => {
        const key = `${log.employee_id}-${log.job_id}`;
        if (!workLogsByEmployeeJob[key]) {
          workLogsByEmployeeJob[key] = { employeeId: log.employee_id, jobType: log.job_id, items: [] };
        }
        (log.activities || []).filter(a => a.pay_code_id).forEach(activity => {
          const qty = activity.rate_unit === "Hour"
            ? parseFloat(activity.hours_applied) || 0
            : parseFloat(activity.units_produced) || 1;
          // Each activity becomes a separate item with source tracking
          workLogsByEmployeeJob[key].items.push({
            pay_code_id: activity.pay_code_id,
            description: activity.description || "",
            pay_type: activity.pay_type || "Tambahan",
            rate: parseFloat(activity.rate_used) || 0,
            rate_unit: activity.rate_unit || "Fixed",
            quantity: qty,
            amount: parseFloat(activity.calculated_amount) || 0,
            source_date: formatDateToYMD(log.log_date), // Format as YYYY-MM-DD
            work_log_id: log.id,       // daily_work_logs.id
            work_log_type: 'daily',
          });
        });
      });

      // Process monthly logs - preserve individual entries (no specific date for monthly)
      monthlyLogsResult.rows.forEach(log => {
        const key = `${log.employee_id}-${log.job_id}`;
        if (!workLogsByEmployeeJob[key]) {
          workLogsByEmployeeJob[key] = { employeeId: log.employee_id, jobType: log.job_id, items: [] };
        }
        (log.activities || []).filter(a => a.pay_code_id).forEach(activity => {
          const qty = activity.rate_unit === "Hour"
            ? parseFloat(activity.hours_applied) || 0
            : 1;
          // Each activity becomes a separate item with source tracking
          workLogsByEmployeeJob[key].items.push({
            pay_code_id: activity.pay_code_id,
            description: activity.description || "",
            pay_type: activity.pay_type || "Tambahan",
            rate: parseFloat(activity.rate_used) || 0,
            rate_unit: activity.rate_unit || "Fixed",
            quantity: qty,
            amount: parseFloat(activity.calculated_amount) || 0,
            source_date: null,         // Monthly logs don't have a specific date
            work_log_id: log.id,       // monthly_work_logs.id
            work_log_type: 'monthly',
          });
        });
      });

      // Process production entries for MEE_PACKING and BH_PACKING workers
      // Build product to pay code mappings lookup
      const productPayCodeMap = {};
      productPayCodeMappingsResult.rows.forEach(mapping => {
        if (!productPayCodeMap[mapping.product_id]) {
          productPayCodeMap[mapping.product_id] = [];
        }
        productPayCodeMap[mapping.product_id].push({
          pay_code_id: mapping.pay_code_id,
          description: mapping.description,
          pay_type: mapping.pay_type,
          rate_unit: mapping.rate_unit,
          rate_biasa: parseFloat(mapping.rate_biasa) || 0,
          rate_ahad: parseFloat(mapping.rate_ahad) || 0,
          rate_umum: parseFloat(mapping.rate_umum) || 0,
        });
      });

      // Build holidays lookup set for fast checking
      const holidayDates = new Set(
        holidaysResult.rows.map(h => formatDateToYMD(h.holiday_date))
      );

      // Helper to determine day type (biasa, ahad, umum)
      const getDayType = (dateStr) => {
        const formattedDate = formatDateToYMD(dateStr);

        // Check if it's a public holiday first
        if (holidayDates.has(formattedDate)) return 'umum';

        // Check if it's Sunday
        const date = new Date(dateStr);
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0) return 'ahad';

        return 'biasa';
      };

      // Helper to find the Base production pay code (PBH_*, PM_*, PWE_*, WE_*, WE-* prefixes)
      const findBasePayCode = (payCodesForProduct) => {
        // First, try to find a Base pay code with production prefix
        // Note: WE codes use both underscore (WE_) and dash (WE-)
        const productionPrefixes = ['PBH_', 'PM_', 'PWE_', 'WE_', 'WE-'];
        const baseProductionCode = payCodesForProduct.find(
          pc => pc.pay_type === 'Base' && pc.rate_unit === 'Bag' &&
                productionPrefixes.some(prefix => pc.pay_code_id.startsWith(prefix))
        );
        if (baseProductionCode) return baseProductionCode;

        // Fallback to any Base pay code with Bag rate_unit
        const anyBaseCode = payCodesForProduct.find(
          pc => pc.pay_type === 'Base' && pc.rate_unit === 'Bag'
        );
        if (anyBaseCode) return anyBaseCode;

        // Last resort: any pay code with Bag rate_unit
        return payCodesForProduct.find(pc => pc.rate_unit === 'Bag');
      };

      // Helper to find threshold bonus pay codes
      const findThresholdBonusCodes = (payCodesForProduct, productType) => {
        // For BH products, look for FULL_B* codes (ME-Q specific) or FULL_* codes
        // For MEE products, look for FULL_* codes
        const bonus70Prefixes = productType === 'BH'
          ? ['FULL_B', 'FULL_']
          : ['FULL_'];

        const bonus70Code = payCodesForProduct.find(
          pc => pc.pay_type === 'Tambahan' && pc.rate_unit === 'Bag' &&
                (pc.description.includes('>70') || pc.description.includes('>100')) &&
                !pc.description.includes('>140')
        );

        const bonus140Code = payCodesForProduct.find(
          pc => pc.pay_type === 'Tambahan' && pc.rate_unit === 'Bag' &&
                pc.description.includes('>140')
        );

        return { bonus70Code, bonus140Code };
      };

      // Track daily totals per worker for threshold bonus calculation
      const dailyTotalsPerWorker = {};

      // Process production entries into payroll items
      productionEntriesResult.rows.forEach(entry => {
        const productType = entry.product_type;
        const jobType = productType === 'MEE' ? 'MEE_PACKING' : 'BH_PACKING';
        const key = `${entry.worker_id}-${jobType}`;
        const dateStr = formatDateToYMD(entry.entry_date);

        if (!workLogsByEmployeeJob[key]) {
          workLogsByEmployeeJob[key] = { employeeId: entry.worker_id, jobType: jobType, items: [] };
        }

        // Track daily totals for threshold bonus calculation
        const dailyKey = `${entry.worker_id}-${dateStr}-${productType}`;
        if (!dailyTotalsPerWorker[dailyKey]) {
          dailyTotalsPerWorker[dailyKey] = {
            workerId: entry.worker_id,
            date: dateStr,
            productType: productType,
            jobType: jobType,
            totalBags: 0,
            productIds: new Set(),
          };
        }
        dailyTotalsPerWorker[dailyKey].totalBags += entry.bags_packed;
        dailyTotalsPerWorker[dailyKey].productIds.add(entry.product_id);

        // Get pay codes for this product
        const payCodesForProduct = productPayCodeMap[entry.product_id] || [];

        // Find the Base production pay code
        const basePayCode = findBasePayCode(payCodesForProduct);

        if (basePayCode) {
          const dayType = getDayType(entry.entry_date);
          let rate = dayType === 'ahad' ? basePayCode.rate_ahad :
                     dayType === 'umum' ? basePayCode.rate_umum :
                     basePayCode.rate_biasa;

          // If Base code doesn't have ahad/umum rates, check for special Sunday/Holiday codes
          if ((dayType === 'ahad' || dayType === 'umum') && rate === 0) {
            // Look for a Sunday/Holiday specific Tambahan code
            const holidayCode = payCodesForProduct.find(
              pc => pc.pay_type === 'Tambahan' && pc.rate_unit === 'Bag' &&
                    (pc.description.includes('UMUM') || pc.description.includes('AHAD'))
            );
            if (holidayCode && holidayCode.rate_biasa > 0) {
              rate = holidayCode.rate_biasa;
            } else {
              // Fallback to biasa rate
              rate = basePayCode.rate_biasa;
            }
          }

          // Only add if we have a valid rate
          if (rate > 0) {
            const amount = entry.bags_packed * rate;

            workLogsByEmployeeJob[key].items.push({
              pay_code_id: basePayCode.pay_code_id,
              description: `${basePayCode.description} - ${entry.product_id}`,
              pay_type: basePayCode.pay_type || 'Base',
              rate: rate,
              rate_unit: 'Bag',
              quantity: entry.bags_packed,
              amount: amount,
              source_date: dateStr,
              work_log_id: null,
              work_log_type: 'production',
            });
          }
        }
      });

      // Apply threshold bonuses based on daily totals
      // Threshold for BH: >70 bags/day for first bonus, >140 for second
      // Threshold for MEE: >100 bags/day for first bonus (based on pay code descriptions)
      Object.values(dailyTotalsPerWorker).forEach(dailyData => {
        const { workerId, date, productType, jobType, totalBags, productIds } = dailyData;
        const key = `${workerId}-${jobType}`;

        // Get threshold based on product type
        const threshold1 = productType === 'BH' ? 70 : 100;
        const threshold2 = 140;

        // Only apply bonus if threshold is met
        if (totalBags > threshold1) {
          // Get pay codes from the first product to find bonus codes
          const firstProductId = productIds.values().next().value;
          const payCodesForProduct = productPayCodeMap[firstProductId] || [];
          const { bonus70Code, bonus140Code } = findThresholdBonusCodes(payCodesForProduct, productType);

          // Apply first tier bonus (>70 for BH, >100 for MEE)
          if (bonus70Code && totalBags > threshold1 && totalBags <= threshold2) {
            const bonusRate = bonus70Code.rate_biasa;
            if (bonusRate > 0) {
              const bonusAmount = totalBags * bonusRate;
              workLogsByEmployeeJob[key].items.push({
                pay_code_id: bonus70Code.pay_code_id,
                description: `${bonus70Code.description} (${totalBags} bags)`,
                pay_type: 'Tambahan',
                rate: bonusRate,
                rate_unit: 'Bag',
                quantity: totalBags,
                amount: bonusAmount,
                source_date: date,
                work_log_id: null,
                work_log_type: 'production_bonus',
              });
            }
          }

          // Apply second tier bonus (>140)
          if (bonus140Code && totalBags > threshold2) {
            const bonusRate = bonus140Code.rate_biasa;
            if (bonusRate > 0) {
              const bonusAmount = totalBags * bonusRate;
              workLogsByEmployeeJob[key].items.push({
                pay_code_id: bonus140Code.pay_code_id,
                description: `${bonus140Code.description} (${totalBags} bags)`,
                pay_type: 'Tambahan',
                rate: bonusRate,
                rate_unit: 'Bag',
                quantity: totalBags,
                amount: bonusAmount,
                source_date: date,
                work_log_id: null,
                work_log_type: 'production_bonus',
              });
            }
          }
        }
      });

      // 4. Group selected employees by name (same logic as frontend)
      const employeesByName = new Map();
      selected_employees.forEach(({ employeeId, jobType }) => {
        const staff = staffsMap.get(employeeId);
        const name = staff?.name || employeeId;
        if (!employeesByName.has(name)) {
          employeesByName.set(name, []);
        }
        employeesByName.get(name).push({ employeeId, jobType });
      });

      // Helper functions for calculations
      const getEmployeeType = (nationality, age) => {
        const isLocal = (nationality || "").toLowerCase() === "malaysian";
        if (isLocal && age < 60) return "local_under_60";
        if (isLocal && age >= 60) return "local_over_60";
        if (!isLocal && age < 60) return "foreign_under_60";
        return "foreign_over_60";
      };

      const findEPFRate = (rates, type, wage) => {
        const applicable = rates.filter(r => r.employee_type === type);
        if (!applicable.length) return null;
        if (type.startsWith("local_")) {
          const over = applicable.find(r => r.wage_threshold === null);
          const under = applicable.find(r => r.wage_threshold !== null);
          return under && wage <= parseFloat(under.wage_threshold) ? under : over || null;
        }
        return applicable[0];
      };

      const findRateByWage = (rates, wage) =>
        rates.find(r => wage >= parseFloat(r.wage_from) && wage <= parseFloat(r.wage_to)) || null;

      const getEPFWageCeiling = (wageAmount) => {
        if (wageAmount <= 10) return 0;
        if (wageAmount <= 20) return 20;
        if (wageAmount <= 5000) return Math.ceil(wageAmount / 20) * 20;
        return 5000 + Math.ceil((wageAmount - 5000) / 100) * 100;
      };

      // 5. Process each employee group
      const processedPayrolls = [];
      const missingIncomeTaxEmployees = [];
      const errors = [];
      const INCOME_TAX_THRESHOLD = 3000;

      for (const [employeeName, employeeJobCombos] of employeesByName) {
        try {
          const primaryEmployee = employeeJobCombos[0];
          const staff = staffsMap.get(primaryEmployee.employeeId);
          if (!staff) {
            errors.push({ employeeId: primaryEmployee.employeeId, error: "Staff not found" });
            continue;
          }

          // Combine all payroll items from all jobs (preserving individual items with source tracking)
          const combinedItems = [];

          // Build employee-job mapping for traceability
          const employeeJobMapping = {};

          employeeJobCombos.forEach(({ employeeId, jobType }) => {
            const key = `${employeeId}-${jobType}`;
            const workData = workLogsByEmployeeJob[key];

            // Track which employee worked on which job
            employeeJobMapping[employeeId] = jobType;

            if (workData && workData.items) {
              // Add each item with job_type and source_employee_id for full traceability
              workData.items.forEach(item => {
                combinedItems.push({
                  ...item,
                  job_type: jobType,
                  source_employee_id: employeeId,
                  is_manual: false,
                  amount: Math.round(item.amount * 100) / 100,
                  quantity: Math.round(item.quantity * 100) / 100,
                });
              });
            }
          });

          // Add preserved manual items
          const manualItems = manualItemsByEmployee[primaryEmployee.employeeId] || [];
          manualItems.forEach(item => combinedItems.push(item));

          // Calculate gross pay using CONSOLIDATED approach (matches frontend display)
          // This groups items by pay_code+rate+rate_unit, sums quantities, then calculates once
          // This ensures database gross_pay matches the consolidated view exactly
          const consolidatedGroups = new Map();
          combinedItems.forEach(item => {
            const key = `${item.pay_code_id}_${item.rate}_${item.rate_unit}`;
            if (consolidatedGroups.has(key)) {
              const group = consolidatedGroups.get(key);
              group.totalQuantity += item.quantity;
              group.originalAmountSum += item.amount; // Keep for Percent/Fixed
            } else {
              consolidatedGroups.set(key, {
                rate: item.rate,
                rate_unit: item.rate_unit,
                totalQuantity: item.quantity,
                originalAmountSum: item.amount,
              });
            }
          });

          // Calculate gross pay from consolidated groups
          let workGrossPayCents = 0;
          consolidatedGroups.forEach(group => {
            let amountCents;
            if (group.rate_unit === 'Percent' || group.rate_unit === 'Fixed') {
              // Keep original summed amount for special rate units
              amountCents = Math.round(group.originalAmountSum * 100);
            } else {
              // Calculate from consolidated: roundedRate × totalQuantity
              const roundedRate = Math.round(group.rate * 100) / 100;
              amountCents = Math.round(roundedRate * group.totalQuantity * 100);
            }
            workGrossPayCents += amountCents;
          });
          const workGrossPay = workGrossPayCents / 100;

          // Fetch leave and commission records for this employee
          const [leaveResult, commissionResult] = await Promise.all([
            client.query(`
              SELECT SUM(amount_paid) as total FROM leave_records
              WHERE employee_id = $1 AND EXTRACT(YEAR FROM leave_date) = $2
                AND EXTRACT(MONTH FROM leave_date) = $3 AND status = 'approved'
            `, [primaryEmployee.employeeId, year, month]),
            client.query(`
              SELECT SUM(amount) as total FROM commission_records
              WHERE employee_id = $1 AND DATE(commission_date) >= $2 AND DATE(commission_date) <= $3
            `, [primaryEmployee.employeeId, startDate, endDate]),
          ]);

          const leaveGrossPay = parseFloat(leaveResult.rows[0]?.total) || 0;
          const commissionGrossPay = parseFloat(commissionResult.rows[0]?.total) || 0;
          const grossPay = workGrossPay + leaveGrossPay + commissionGrossPay;

          // Check for missing income tax rates
          if (grossPay > INCOME_TAX_THRESHOLD) {
            const incomeTaxRate = findRateByWage(incomeTaxRates, grossPay);
            if (!incomeTaxRate) {
              missingIncomeTaxEmployees.push({
                employeeId: primaryEmployee.employeeId,
                employeeName: employeeName,
                grossPay: Math.round(grossPay * 100) / 100,
              });
            }
          }

          // Calculate contributions
          const age = Math.floor((Date.now() - new Date(staff.birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          const employeeType = getEmployeeType(staff.nationality, age);
          const isMalaysian = (staff.nationality || "").toLowerCase() === "malaysian";

          // Group items by pay type for EPF calculation
          const groupedItems = { Base: [], Tambahan: [], Overtime: [] };
          combinedItems.forEach(item => {
            const type = item.pay_type || "Tambahan";
            if (!groupedItems[type]) groupedItems[type] = [];
            groupedItems[type].push(item);
          });

          const epfGrossPay =
            groupedItems.Base.reduce((s, i) => s + i.amount, 0) +
            groupedItems.Tambahan.reduce((s, i) => s + i.amount, 0) +
            leaveGrossPay + commissionGrossPay;

          const deductions = [];

          // EPF
          const epfRate = findEPFRate(epfRates, employeeType, epfGrossPay);
          if (epfRate) {
            const wageCeiling = getEPFWageCeiling(epfGrossPay);
            if (wageCeiling > 0) {
              const employeeContribution = Math.ceil((wageCeiling * parseFloat(epfRate.employee_rate_percentage)) / 100);
              const employerContribution = epfRate.employer_rate_percentage !== null
                ? Math.ceil((wageCeiling * parseFloat(epfRate.employer_rate_percentage)) / 100)
                : parseFloat(epfRate.employer_fixed_amount);
              deductions.push({
                deduction_type: "epf",
                employee_amount: employeeContribution || 0,
                employer_amount: employerContribution || 0,
                wage_amount: epfGrossPay,
                rate_info: {
                  rate_id: epfRate.id,
                  employee_rate: `${epfRate.employee_rate_percentage}%`,
                  employer_rate: epfRate.employer_rate_percentage ? `${epfRate.employer_rate_percentage}%` : `RM${epfRate.employer_fixed_amount}`,
                  age_group: employeeType,
                  wage_ceiling_used: wageCeiling,
                },
              });
            }
          }

          // SOCSO
          const socsoRate = findRateByWage(socsoRates, grossPay);
          if (socsoRate) {
            const isOver60 = age >= 60;
            deductions.push({
              deduction_type: "socso",
              employee_amount: isOver60 ? 0 : parseFloat(socsoRate.employee_rate) || 0,
              employer_amount: isOver60 ? parseFloat(socsoRate.employer_rate_over_60) || 0 : parseFloat(socsoRate.employer_rate) || 0,
              wage_amount: grossPay,
              rate_info: {
                rate_id: socsoRate.id,
                employee_rate: isOver60 ? "RM0.00" : `RM${socsoRate.employee_rate}`,
                employer_rate: isOver60 ? `RM${socsoRate.employer_rate_over_60}` : `RM${socsoRate.employer_rate}`,
                age_group: isOver60 ? "60_and_above" : "under_60",
              },
            });
          }

          // SIP (Malaysian only, under 60)
          if (age < 60 && isMalaysian) {
            const sipRate = findRateByWage(sipRates, grossPay);
            if (sipRate) {
              deductions.push({
                deduction_type: "sip",
                employee_amount: parseFloat(sipRate.employee_rate) || 0,
                employer_amount: parseFloat(sipRate.employer_rate) || 0,
                wage_amount: grossPay,
                rate_info: {
                  rate_id: sipRate.id,
                  employee_rate: `RM${sipRate.employee_rate}`,
                  employer_rate: `RM${sipRate.employer_rate}`,
                  age_group: "under_60",
                },
              });
            }
          }

          // Income Tax
          const incomeTaxRate = findRateByWage(incomeTaxRates, grossPay);
          if (incomeTaxRate) {
            const maritalStatus = staff.marital_status || "Single";
            const spouseEmploymentStatus = staff.spouse_employment_status || null;
            const numberOfChildren = staff.number_of_children || 0;
            let applicableRate = parseFloat(incomeTaxRate.base_rate);

            if (maritalStatus === "Married") {
              const childrenKey = Math.min(numberOfChildren, 10);
              if (spouseEmploymentStatus === "Unemployed") {
                applicableRate = parseFloat(incomeTaxRate[`unemployed_spouse_k${childrenKey}`]) || applicableRate;
              } else if (spouseEmploymentStatus === "Employed") {
                applicableRate = parseFloat(incomeTaxRate[`employed_spouse_k${childrenKey}`]) || applicableRate;
              }
            }

            if (applicableRate > 0) {
              let taxCategory = maritalStatus;
              if (maritalStatus === "Married") {
                taxCategory += `-K${Math.min(numberOfChildren, 10)}`;
                if (spouseEmploymentStatus) taxCategory += `-${spouseEmploymentStatus}`;
              }
              deductions.push({
                deduction_type: "income_tax",
                employee_amount: applicableRate,
                employer_amount: 0,
                wage_amount: grossPay,
                rate_info: {
                  rate_id: incomeTaxRate.id,
                  employee_rate: `RM${applicableRate}`,
                  employer_rate: "RM0.00",
                  tax_category: taxCategory,
                },
              });
            }
          }

          // Calculate net pay
          const totalEmployeeDeductions = deductions.reduce((sum, d) => sum + d.employee_amount, 0);
          const netPay = grossPay - totalEmployeeDeductions - commissionGrossPay;

          // Get job section
          const job = jobsMap.get(primaryEmployee.jobType);
          const section = Array.isArray(job?.section) ? job.section[0] : (job?.section || "Unknown");
          // Get unique job types and sort alphabetically to ensure consistent ordering
          const uniqueJobTypes = [...new Set(employeeJobCombos.map(c => c.jobType))].sort();
          const jobTypes = uniqueJobTypes.join(", ");

          // 6. Save to database - Check if payroll exists by employee NAME (not just ID)
          // This ensures employees with same name but different IDs are properly combined
          const existingPayrolls = await client.query(
            `SELECT ep.id FROM employee_payrolls ep
             JOIN staffs s ON ep.employee_id = s.id
             WHERE ep.monthly_payroll_id = $1 AND s.name = $2
             ORDER BY ep.id`,
            [id, employeeName]
          );

          let employeePayrollId;

          if (existingPayrolls.rows.length > 0) {
            // Keep the first one, delete any duplicates
            employeePayrollId = existingPayrolls.rows[0].id;

            // Delete duplicate payrolls (keep only the first one)
            if (existingPayrolls.rows.length > 1) {
              const duplicateIds = existingPayrolls.rows.slice(1).map(r => r.id);
              // Delete items and deductions for duplicates first
              await client.query(
                `DELETE FROM payroll_items WHERE employee_payroll_id = ANY($1)`,
                [duplicateIds]
              );
              await client.query(
                `DELETE FROM payroll_deductions WHERE employee_payroll_id = ANY($1)`,
                [duplicateIds]
              );
              // Then delete the duplicate payroll records
              await client.query(
                `DELETE FROM employee_payrolls WHERE id = ANY($1)`,
                [duplicateIds]
              );
            }

            // Update existing - also update job_type, employee_id, and employee_job_mapping for traceability
            await client.query(
              `UPDATE employee_payrolls SET gross_pay = $1, net_pay = $2, section = $3, job_type = $4, employee_id = $5, employee_job_mapping = $6 WHERE id = $7`,
              [grossPay.toFixed(2), netPay.toFixed(2), section, jobTypes, primaryEmployee.employeeId, JSON.stringify(employeeJobMapping), employeePayrollId]
            );
            // Delete non-manual items
            await client.query(
              "DELETE FROM payroll_items WHERE employee_payroll_id = $1 AND is_manual = false",
              [employeePayrollId]
            );
            // Delete existing deductions
            await client.query(
              "DELETE FROM payroll_deductions WHERE employee_payroll_id = $1",
              [employeePayrollId]
            );
          } else {
            // Create new - include employee_job_mapping for traceability
            const insertResult = await client.query(
              `INSERT INTO employee_payrolls (monthly_payroll_id, employee_id, job_type, section, gross_pay, net_pay, employee_job_mapping)
               VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
              [id, primaryEmployee.employeeId, jobTypes, section, grossPay.toFixed(2), netPay.toFixed(2), JSON.stringify(employeeJobMapping)]
            );
            employeePayrollId = insertResult.rows[0].id;
          }

          // Insert non-manual payroll items (with job_type, source_employee_id and source tracking for traceability)
          const nonManualItems = combinedItems.filter(item => !item.is_manual);
          if (nonManualItems.length > 0) {
            const itemValues = nonManualItems.map(item =>
              `(${employeePayrollId}, '${item.pay_code_id}', '${(item.description || "").replace(/'/g, "''")}',
                ${item.rate}, '${item.rate_unit}', ${item.quantity}, ${item.amount}, false,
                ${item.job_type ? `'${item.job_type}'` : 'NULL'},
                ${item.source_employee_id ? `'${item.source_employee_id}'` : 'NULL'},
                ${item.source_date ? `'${item.source_date}'` : 'NULL'},
                ${item.work_log_id || 'NULL'},
                ${item.work_log_type ? `'${item.work_log_type}'` : 'NULL'})`
            ).join(", ");
            await client.query(`
              INSERT INTO payroll_items (employee_payroll_id, pay_code_id, description, rate, rate_unit, quantity, amount, is_manual, job_type, source_employee_id, source_date, work_log_id, work_log_type)
              VALUES ${itemValues}
            `);
          }

          // Insert deductions
          for (const deduction of deductions) {
            await client.query(`
              INSERT INTO payroll_deductions (employee_payroll_id, deduction_type, employee_amount, employer_amount, wage_amount, rate_info)
              VALUES ($1, $2, $3, $4, $5, $6)
            `, [employeePayrollId, deduction.deduction_type, deduction.employee_amount, deduction.employer_amount, deduction.wage_amount, JSON.stringify(deduction.rate_info)]);
          }

          processedPayrolls.push({
            employeeId: primaryEmployee.employeeId,
            employeeName,
            grossPay: Math.round(grossPay * 100) / 100,
            netPay: Math.round(netPay * 100) / 100,
          });

        } catch (error) {
          console.error("Error processing employee:", employeeJobCombos[0].employeeId, error);
          errors.push({ employeeId: employeeJobCombos[0].employeeId, error: error.message });
          // If this is a SQL error, the transaction is aborted - stop processing
          if (error.code) {
            throw error;
          }
        }
      }

      // Update the monthly payroll's updated_at timestamp using Node.js time
      // (PostgreSQL Docker container time may be out of sync)
      const payrollId = parseInt(id);
      const serverTimestamp = new Date().toISOString();

      await client.query(
        "UPDATE monthly_payrolls SET updated_at = $1 WHERE id = $2",
        [serverTimestamp, payrollId]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        processed_count: processedPayrolls.length,
        missing_income_tax_employees: missingIncomeTaxEmployees,
        errors,
        updated_at: serverTimestamp,
      });

    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error in unified payroll processing:", error);
      res.status(500).json({
        success: false,
        message: "Error processing payroll",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Update payroll status
  router.put("/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !["Processing", "Finalized"].includes(status)) {
      return res.status(400).json({
        message: "Valid status is required (Processing, Finalized)",
      });
    }

    try {
      // Use Node.js server time to avoid Docker container clock sync issues
      const serverTimestamp = new Date().toISOString();
      const query = `
      UPDATE monthly_payrolls
      SET status = $1, updated_at = $2
      WHERE id = $3
      RETURNING *
    `;

      const result = await pool.query(query, [status, serverTimestamp, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      res.json({
        message: "Payroll status updated successfully",
        payroll: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating payroll status:", error);
      res.status(500).json({
        message: "Error updating payroll status",
        error: error.message,
      });
    }
  });

  return router;
}
