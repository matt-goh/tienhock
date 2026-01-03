// src/routes/greentarget/monthly-payrolls.js
import { Router } from "express";

// Helper function to format date to YYYY-MM-DD string
const formatDateToYMD = (date) => {
  if (!date) return null;
  if (typeof date === "string") {
    return date.split("T")[0].split(" ")[0];
  }
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return null;
};

export default function (pool) {
  const router = Router();

  // Get all monthly payrolls
  router.get("/", async (req, res) => {
    const { year, month, include_employee_payrolls } = req.query;
    try {
      let query = `SELECT * FROM greentarget.monthly_payrolls`;
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
              FROM greentarget.employee_payrolls ep
              LEFT JOIN public.staffs s ON ep.employee_id = s.id
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
      console.error("Error fetching GT monthly payrolls:", error);
      res.status(500).json({
        message: "Error fetching GT monthly payrolls",
        error: error.message,
      });
    }
  });

  // Get eligible employees for a payroll (based on work logs and driver trips)
  router.get("/:id/eligible-employees", async (req, res) => {
    const { id } = req.params;

    try {
      // Get payroll details
      const payrollResult = await pool.query(
        "SELECT year, month FROM greentarget.monthly_payrolls WHERE id = $1",
        [id]
      );

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      const { year, month } = payrollResult.rows[0];

      // Get GT payroll employees
      const gtEmployeesQuery = `
        SELECT pe.employee_id, pe.job_type
        FROM greentarget.payroll_employees pe
        WHERE pe.is_active = true
      `;
      const gtEmployeesResult = await pool.query(gtEmployeesQuery);

      // Group by job type
      const jobEmployeeMap = {};
      gtEmployeesResult.rows.forEach((row) => {
        if (!jobEmployeeMap[row.job_type]) {
          jobEmployeeMap[row.job_type] = [];
        }
        jobEmployeeMap[row.job_type].push(row.employee_id);
      });

      res.json({
        month,
        year,
        eligibleJobs: Object.keys(jobEmployeeMap),
        jobEmployeeMap,
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
      const payrollQuery = `
        SELECT * FROM greentarget.monthly_payrolls WHERE id = $1
      `;
      const payrollResult = await pool.query(payrollQuery, [id]);

      if (payrollResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      // Get employee payrolls
      const employeePayrollsQuery = `
        SELECT ep.*, s.name as employee_name
        FROM greentarget.employee_payrolls ep
        LEFT JOIN public.staffs s ON ep.employee_id = s.id
        WHERE ep.monthly_payroll_id = $1
      `;
      const employeePayrollsResult = await pool.query(employeePayrollsQuery, [id]);

      res.json({
        ...payrollResult.rows[0],
        employeePayrolls: employeePayrollsResult.rows,
      });
    } catch (error) {
      console.error("Error fetching GT monthly payroll details:", error);
      res.status(500).json({
        message: "Error fetching GT monthly payroll details",
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
      // Check if already exists
      const existingCheck = await pool.query(
        "SELECT id FROM greentarget.monthly_payrolls WHERE year = $1 AND month = $2",
        [year, month]
      );

      if (existingCheck.rows.length > 0) {
        return res.status(400).json({
          message: "Payroll for this month already exists",
          payroll: existingCheck.rows[0],
        });
      }

      const insertQuery = `
        INSERT INTO greentarget.monthly_payrolls (year, month, status, created_by)
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
      console.error("Error creating GT monthly payroll:", error);
      res.status(500).json({
        message: "Error creating GT monthly payroll",
        error: error.message,
      });
    }
  });

  // Process all selected employees
  router.post("/:id/process-all", async (req, res) => {
    const { id } = req.params;
    const { selected_employees = [] } = req.body;

    if (!selected_employees.length) {
      return res.status(400).json({ message: "No employees selected for processing" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. Get payroll details
      const payrollResult = await client.query(
        "SELECT year, month FROM greentarget.monthly_payrolls WHERE id = $1",
        [id]
      );
      if (payrollResult.rows.length === 0) {
        throw new Error("Monthly payroll not found");
      }
      const { year, month } = payrollResult.rows[0];

      // 2. Fetch all required data in parallel
      const [
        monthlyLogsResult,
        driverTripsResult,
        staffsResult,
        jobPayCodesResult,
        epfRatesResult,
        socsoRatesResult,
        sipRatesResult,
        incomeTaxRatesResult,
      ] = await Promise.all([
        // Monthly work logs for OFFICE workers (from GT schema)
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
          FROM greentarget.monthly_work_logs mwl
          JOIN greentarget.monthly_work_log_entries mwle ON mwl.id = mwle.monthly_log_id
          LEFT JOIN greentarget.monthly_work_log_activities mwla ON mwla.monthly_entry_id = mwle.id
          LEFT JOIN public.pay_codes pc ON mwla.pay_code_id = pc.id
          WHERE mwl.log_month = $1 AND mwl.log_year = $2 AND mwl.status = 'Submitted'
          GROUP BY mwl.id, mwl.log_month, mwl.log_year, mwle.employee_id, mwle.job_id,
            mwle.total_hours, mwle.overtime_hours
        `, [month, year]),

        // Driver trips
        client.query(`
          SELECT driver_id, year, month, trip_count
          FROM greentarget.driver_trips
          WHERE year = $1 AND month = $2
        `, [year, month]),

        // Staff data
        client.query(`
          SELECT id, name, birthdate, nationality, marital_status,
            spouse_employment_status, number_of_children
          FROM public.staffs
        `),

        // Job pay codes for OFFICE and DRIVER
        client.query(`
          SELECT jpc.job_id, jpc.pay_code_id, jpc.is_default,
            jpc.override_rate_biasa, jpc.override_rate_ahad, jpc.override_rate_umum,
            pc.description, pc.pay_type, pc.rate_unit,
            CAST(pc.rate_biasa AS NUMERIC(10,2)) as rate_biasa,
            CAST(pc.rate_ahad AS NUMERIC(10,2)) as rate_ahad,
            CAST(pc.rate_umum AS NUMERIC(10,2)) as rate_umum
          FROM public.job_pay_codes jpc
          JOIN public.pay_codes pc ON jpc.pay_code_id = pc.id
          WHERE jpc.job_id IN ('OFFICE', 'DRIVER') AND pc.is_active = true
        `),

        // Contribution rates
        client.query("SELECT * FROM public.epf_rates WHERE is_active = true"),
        client.query("SELECT * FROM public.socso_rates WHERE is_active = true ORDER BY wage_from"),
        client.query("SELECT * FROM public.sip_rates WHERE is_active = true ORDER BY wage_from"),
        client.query("SELECT * FROM public.income_tax_rates WHERE is_active = true ORDER BY wage_from"),
      ]);

      // Build lookup maps
      const staffsMap = new Map(staffsResult.rows.map((s) => [s.id, s]));
      const epfRates = epfRatesResult.rows;
      const socsoRates = socsoRatesResult.rows;
      const sipRates = sipRatesResult.rows;
      const incomeTaxRates = incomeTaxRatesResult.rows;

      // Build job pay codes map
      const jobPayCodesMap = {};
      jobPayCodesResult.rows.forEach((row) => {
        if (!jobPayCodesMap[row.job_id]) {
          jobPayCodesMap[row.job_id] = [];
        }
        jobPayCodesMap[row.job_id].push(row);
      });

      // Build driver trips map
      const driverTripsMap = new Map(
        driverTripsResult.rows.map((t) => [t.driver_id, t.trip_count])
      );

      // Process work logs into items per employee
      const workLogsByEmployee = {};
      monthlyLogsResult.rows.forEach((log) => {
        const key = log.employee_id;
        if (!workLogsByEmployee[key]) {
          workLogsByEmployee[key] = { items: [] };
        }
        (log.activities || []).filter((a) => a.pay_code_id).forEach((activity) => {
          const qty =
            activity.rate_unit === "Hour"
              ? parseFloat(activity.hours_applied) || 0
              : 1;
          workLogsByEmployee[key].items.push({
            pay_code_id: activity.pay_code_id,
            description: activity.description || "",
            pay_type: activity.pay_type || "Tambahan",
            rate: parseFloat(activity.rate_used) || 0,
            rate_unit: activity.rate_unit || "Fixed",
            quantity: qty,
            amount: parseFloat(activity.calculated_amount) || 0,
            work_log_id: log.id,
            work_log_type: "monthly",
          });
        });
      });

      // Helper functions
      const getEmployeeType = (nationality, age) => {
        const isLocal = (nationality || "").toLowerCase() === "malaysian";
        if (isLocal && age < 60) return "local_under_60";
        if (isLocal && age >= 60) return "local_over_60";
        if (!isLocal && age < 60) return "foreign_under_60";
        return "foreign_over_60";
      };

      const findEPFRate = (rates, type, wage) => {
        const applicable = rates.filter((r) => r.employee_type === type);
        if (!applicable.length) return null;
        if (type.startsWith("local_")) {
          const over = applicable.find((r) => r.wage_threshold === null);
          const under = applicable.find((r) => r.wage_threshold !== null);
          return under && wage <= parseFloat(under.wage_threshold) ? under : over || null;
        }
        return applicable[0];
      };

      const findRateByWage = (rates, wage) =>
        rates.find(
          (r) => wage >= parseFloat(r.wage_from) && wage <= parseFloat(r.wage_to)
        ) || null;

      const getEPFWageCeiling = (wageAmount) => {
        if (wageAmount <= 10) return 0;
        if (wageAmount <= 20) return 20;
        if (wageAmount <= 5000) return Math.ceil(wageAmount / 20) * 20;
        return 5000 + Math.ceil((wageAmount - 5000) / 100) * 100;
      };

      // 3. Process each selected employee
      const processedPayrolls = [];
      const errors = [];

      for (const { employeeId, jobType } of selected_employees) {
        try {
          const staff = staffsMap.get(employeeId);
          if (!staff) {
            errors.push({ employeeId, error: "Staff not found" });
            continue;
          }

          const combinedItems = [];

          if (jobType === "OFFICE") {
            // Get work log items for OFFICE workers
            const workData = workLogsByEmployee[employeeId];
            if (workData && workData.items) {
              workData.items.forEach((item) => {
                combinedItems.push({
                  ...item,
                  job_type: "OFFICE",
                  source_employee_id: employeeId,
                  is_manual: false,
                  amount: Math.round(item.amount * 100) / 100,
                });
              });
            }
          } else if (jobType === "DRIVER") {
            // Get trip count for DRIVER workers
            const tripCount = driverTripsMap.get(employeeId) || 0;

            // Find the driver trip pay code
            const driverPayCodes = jobPayCodesMap["DRIVER"] || [];
            const tripPayCode = driverPayCodes.find(
              (pc) => pc.rate_unit === "Trip" || pc.pay_code_id.includes("TRIP")
            );

            if (tripPayCode && tripCount > 0) {
              const rate = tripPayCode.override_rate_biasa || tripPayCode.rate_biasa || 0;
              combinedItems.push({
                pay_code_id: tripPayCode.pay_code_id,
                description: tripPayCode.description,
                pay_type: tripPayCode.pay_type || "Base",
                rate: rate,
                rate_unit: "Trip",
                quantity: tripCount,
                amount: Math.round(tripCount * rate * 100) / 100,
                job_type: "DRIVER",
                source_employee_id: employeeId,
                is_manual: false,
              });
            }

            // Also check for base salary pay code for drivers
            const baseSalaryCode = driverPayCodes.find(
              (pc) => pc.pay_type === "Base" && pc.rate_unit === "Month"
            );
            if (baseSalaryCode) {
              const rate = baseSalaryCode.override_rate_biasa || baseSalaryCode.rate_biasa || 0;
              if (rate > 0) {
                combinedItems.push({
                  pay_code_id: baseSalaryCode.pay_code_id,
                  description: baseSalaryCode.description,
                  pay_type: "Base",
                  rate: rate,
                  rate_unit: "Month",
                  quantity: 1,
                  amount: rate,
                  job_type: "DRIVER",
                  source_employee_id: employeeId,
                  is_manual: false,
                });
              }
            }
          }

          // Calculate gross pay
          const grossPay = combinedItems.reduce((sum, item) => sum + item.amount, 0);

          // Calculate contributions
          const age = Math.floor(
            (Date.now() - new Date(staff.birthdate).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000)
          );
          const employeeType = getEmployeeType(staff.nationality, age);
          const isMalaysian = (staff.nationality || "").toLowerCase() === "malaysian";

          // Group items by pay type for EPF calculation
          const groupedItems = { Base: [], Tambahan: [], Overtime: [] };
          combinedItems.forEach((item) => {
            const type = item.pay_type || "Tambahan";
            if (!groupedItems[type]) groupedItems[type] = [];
            groupedItems[type].push(item);
          });

          const epfGrossPay =
            groupedItems.Base.reduce((s, i) => s + i.amount, 0) +
            groupedItems.Tambahan.reduce((s, i) => s + i.amount, 0);

          const deductions = [];

          // EPF
          const epfRate = findEPFRate(epfRates, employeeType, epfGrossPay);
          if (epfRate) {
            const wageCeiling = getEPFWageCeiling(epfGrossPay);
            if (wageCeiling > 0) {
              const employeeContribution = Math.ceil(
                (wageCeiling * parseFloat(epfRate.employee_rate_percentage)) / 100
              );
              const employerContribution =
                epfRate.employer_rate_percentage !== null
                  ? Math.ceil(
                      (wageCeiling * parseFloat(epfRate.employer_rate_percentage)) / 100
                    )
                  : parseFloat(epfRate.employer_fixed_amount);
              deductions.push({
                deduction_type: "epf",
                employee_amount: employeeContribution || 0,
                employer_amount: employerContribution || 0,
                wage_amount: epfGrossPay,
                rate_info: {
                  rate_id: epfRate.id,
                  employee_rate: `${epfRate.employee_rate_percentage}%`,
                  employer_rate: epfRate.employer_rate_percentage
                    ? `${epfRate.employer_rate_percentage}%`
                    : `RM${epfRate.employer_fixed_amount}`,
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
              employer_amount: isOver60
                ? parseFloat(socsoRate.employer_rate_over_60) || 0
                : parseFloat(socsoRate.employer_rate) || 0,
              wage_amount: grossPay,
              rate_info: {
                rate_id: socsoRate.id,
                employee_rate: isOver60 ? "RM0.00" : `RM${socsoRate.employee_rate}`,
                employer_rate: isOver60
                  ? `RM${socsoRate.employer_rate_over_60}`
                  : `RM${socsoRate.employer_rate}`,
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
                applicableRate =
                  parseFloat(incomeTaxRate[`unemployed_spouse_k${childrenKey}`]) ||
                  applicableRate;
              } else if (spouseEmploymentStatus === "Employed") {
                applicableRate =
                  parseFloat(incomeTaxRate[`employed_spouse_k${childrenKey}`]) ||
                  applicableRate;
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
          const totalEmployeeDeductions = deductions.reduce(
            (sum, d) => sum + d.employee_amount,
            0
          );
          const netPay = grossPay - totalEmployeeDeductions;

          // 4. Save to database
          const existingPayroll = await client.query(
            `SELECT id FROM greentarget.employee_payrolls
             WHERE monthly_payroll_id = $1 AND employee_id = $2`,
            [id, employeeId]
          );

          let employeePayrollId;

          if (existingPayroll.rows.length > 0) {
            employeePayrollId = existingPayroll.rows[0].id;
            // Update existing
            await client.query(
              `UPDATE greentarget.employee_payrolls
               SET gross_pay = $1, net_pay = $2, job_type = $3, section = $4
               WHERE id = $5`,
              [grossPay.toFixed(2), netPay.toFixed(2), jobType, jobType, employeePayrollId]
            );
            // Delete existing items and deductions
            await client.query(
              "DELETE FROM greentarget.payroll_items WHERE employee_payroll_id = $1 AND is_manual = false",
              [employeePayrollId]
            );
            await client.query(
              "DELETE FROM greentarget.payroll_deductions WHERE employee_payroll_id = $1",
              [employeePayrollId]
            );
          } else {
            // Create new
            const insertResult = await client.query(
              `INSERT INTO greentarget.employee_payrolls
               (monthly_payroll_id, employee_id, job_type, section, gross_pay, net_pay)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
              [id, employeeId, jobType, jobType, grossPay.toFixed(2), netPay.toFixed(2)]
            );
            employeePayrollId = insertResult.rows[0].id;
          }

          // Insert payroll items
          const nonManualItems = combinedItems.filter((item) => !item.is_manual);
          if (nonManualItems.length > 0) {
            const itemValues = nonManualItems
              .map(
                (item) =>
                  `(${employeePayrollId}, '${item.pay_code_id}', '${(item.description || "").replace(/'/g, "''")}',
                    ${item.rate}, '${item.rate_unit}', ${item.quantity}, ${item.amount}, false,
                    ${item.job_type ? `'${item.job_type}'` : "NULL"},
                    ${item.source_employee_id ? `'${item.source_employee_id}'` : "NULL"},
                    ${item.work_log_id || "NULL"},
                    ${item.work_log_type ? `'${item.work_log_type}'` : "NULL"})`
              )
              .join(", ");
            await client.query(`
              INSERT INTO greentarget.payroll_items
              (employee_payroll_id, pay_code_id, description, rate, rate_unit, quantity, amount, is_manual, job_type, source_employee_id, work_log_id, work_log_type)
              VALUES ${itemValues}
            `);
          }

          // Insert deductions
          for (const deduction of deductions) {
            await client.query(
              `INSERT INTO greentarget.payroll_deductions
               (employee_payroll_id, deduction_type, employee_amount, employer_amount, wage_amount, rate_info)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                employeePayrollId,
                deduction.deduction_type,
                deduction.employee_amount,
                deduction.employer_amount,
                deduction.wage_amount,
                JSON.stringify(deduction.rate_info),
              ]
            );
          }

          processedPayrolls.push({
            employeeId,
            employeeName: staff.name,
            grossPay: Math.round(grossPay * 100) / 100,
            netPay: Math.round(netPay * 100) / 100,
          });
        } catch (error) {
          console.error("Error processing employee:", employeeId, error);
          errors.push({ employeeId, error: error.message });
          if (error.code) {
            throw error;
          }
        }
      }

      // Update timestamp
      const serverTimestamp = new Date().toISOString();
      await client.query(
        "UPDATE greentarget.monthly_payrolls SET updated_at = $1 WHERE id = $2",
        [serverTimestamp, id]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        processed_count: processedPayrolls.length,
        errors,
        updated_at: serverTimestamp,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error in GT payroll processing:", error);
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
      const serverTimestamp = new Date().toISOString();
      const query = `
        UPDATE greentarget.monthly_payrolls
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
      console.error("Error updating GT payroll status:", error);
      res.status(500).json({
        message: "Error updating payroll status",
        error: error.message,
      });
    }
  });

  // Delete monthly payroll
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      // Check if finalized
      const checkResult = await pool.query(
        "SELECT status FROM greentarget.monthly_payrolls WHERE id = $1",
        [id]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: "Monthly payroll not found" });
      }

      if (checkResult.rows[0].status === "Finalized") {
        return res.status(400).json({
          message: "Cannot delete finalized payroll",
        });
      }

      // Delete (cascade will handle child records)
      const result = await pool.query(
        "DELETE FROM greentarget.monthly_payrolls WHERE id = $1 RETURNING *",
        [id]
      );

      res.json({
        message: "Monthly payroll deleted successfully",
        payroll: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting GT monthly payroll:", error);
      res.status(500).json({
        message: "Error deleting monthly payroll",
        error: error.message,
      });
    }
  });

  return router;
}
