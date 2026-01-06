// src/routes/payroll/salary-report.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get comprehensive salary report data for all tabs
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
      // Main comprehensive query to get all employee data with payroll details
      // Dual-location logic: employee appears in BOTH job-based AND direct-mapped locations
      const comprehensiveQuery = `
        WITH job_location_map AS (
          SELECT job_id, location_code
          FROM job_location_mappings
          WHERE is_active = true
        ),
        -- Employee's direct locations from staffs.location JSONB array
        employee_direct_locations AS (
          SELECT s.id as employee_id, loc.value as location_code
          FROM staffs s,
            LATERAL jsonb_array_elements_text(COALESCE(s.location, '[]'::jsonb)) AS loc(value)
          WHERE s.location IS NOT NULL
            AND jsonb_array_length(s.location) > 0
        ),
        -- Exclusions: employee-job-location combinations to filter out
        employee_exclusions AS (
          SELECT employee_id, job_id, location_code
          FROM employee_job_location_exclusions
        ),
        -- Base payroll data without location (we'll join locations later)
        -- For combined payrolls (same-name staff), use Head's job for location
        employee_payroll_base AS (
          SELECT
            ep.id as employee_payroll_id,
            ep.employee_id,
            s.id as staff_id,
            s.name as staff_name,
            s.ic_no,
            s.bank_account_number,
            s.payment_preference,
            ep.gross_pay,
            ep.net_pay,
            ep.job_type,
            ep.section,
            -- Use Head's job location if head_staff_id is set, otherwise use direct job location
            COALESCE(
              head_jlm.location_code,  -- HEAD's job location (when head_staff_id is set)
              jlm.location_code        -- Fallback to direct job location
            ) as job_location_code
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN staffs s ON ep.employee_id = s.id
          -- Get HEAD staff info (if head_staff_id is set)
          LEFT JOIN staffs head_s ON head_s.id = s.head_staff_id
          -- Get HEAD's first job location
          LEFT JOIN LATERAL (
            SELECT jlm_inner.location_code
            FROM jsonb_array_elements_text(COALESCE(head_s.job, '[]'::jsonb)) AS job_elem(job_id)
            JOIN job_location_mappings jlm_inner ON job_elem.job_id = jlm_inner.job_id
              AND jlm_inner.is_active = true
            LIMIT 1
          ) head_jlm ON head_s.id IS NOT NULL
          -- Direct job location mapping (fallback)
          LEFT JOIN job_location_map jlm ON ep.job_type = jlm.job_id
          WHERE mp.year = $1 AND mp.month = $2
          AND (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)
        ),
        -- UNION all location sources (employee appears in all applicable locations)
        employee_all_locations AS (
          -- Direct employee mapping (from staffs.location)
          SELECT epb.*, edl.location_code, 'direct' as location_source
          FROM employee_payroll_base epb
          JOIN employee_direct_locations edl ON epb.employee_id = edl.employee_id

          UNION ALL

          -- Job-based mapping (filtered by exclusions)
          SELECT epb.*, epb.job_location_code as location_code, 'job' as location_source
          FROM employee_payroll_base epb
          WHERE epb.job_location_code IS NOT NULL
            -- Filter out excluded employee-job-location combinations
            AND NOT EXISTS (
              SELECT 1 FROM employee_exclusions ex
              WHERE ex.employee_id = epb.employee_id
                AND ex.job_id = epb.job_type
                AND ex.location_code = epb.job_location_code
            )

          UNION ALL

          -- Default fallback (only if NO locations from either source)
          SELECT epb.*, '02' as location_code, 'default' as location_source
          FROM employee_payroll_base epb
          WHERE epb.job_location_code IS NULL
            AND NOT EXISTS (SELECT 1 FROM employee_direct_locations edl WHERE edl.employee_id = epb.employee_id)
        ),
        -- Deduplicate same employee in same location (keep first occurrence)
        employee_base_data AS (
          SELECT DISTINCT ON (employee_id, location_code)
            employee_payroll_id,
            employee_id,
            staff_id,
            staff_name,
            ic_no,
            bank_account_number,
            payment_preference,
            location_code,
            gross_pay,
            net_pay,
            job_type,
            section,
            location_source
          FROM employee_all_locations
          ORDER BY employee_id, location_code, location_source
        ),
        payroll_items_data AS (
          SELECT 
            ep.employee_id,
            pi.pay_code_id,
            pi.description,
            pi.amount,
            pc.pay_type
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN payroll_items pi ON ep.id = pi.employee_payroll_id
          LEFT JOIN pay_codes pc ON pi.pay_code_id = pc.id
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
        mid_month_data AS (
          SELECT 
            mmp.employee_id,
            COALESCE(mmp.amount, 0) as mid_month_amount
          FROM mid_month_payrolls mmp
          WHERE mmp.year = $1 AND mmp.month = $2
        ),
        commission_data AS (
          SELECT
            cr.employee_id,
            cr.description,
            cr.location_code,
            COALESCE(SUM(cr.amount), 0) as commission_amount
          FROM commission_records cr
          WHERE EXTRACT(YEAR FROM cr.commission_date) = $1
            AND EXTRACT(MONTH FROM cr.commission_date) = $2
          GROUP BY cr.employee_id, cr.description, cr.location_code
        ),
        leave_data AS (
          SELECT 
            lr.employee_id,
            lr.leave_type,
            COALESCE(SUM(lr.amount_paid), 0) as leave_amount
          FROM leave_records lr
          WHERE EXTRACT(YEAR FROM lr.leave_date) = $1 
            AND EXTRACT(MONTH FROM lr.leave_date) = $2
            AND lr.status = 'approved'
          GROUP BY lr.employee_id, lr.leave_type
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
          ebd.*,
          COALESCE(mmd.mid_month_amount, 0) as mid_month_amount,
          COALESCE(pmd.total_pinjam, 0) as total_pinjam,
          -- Aggregate payroll items by type
          COALESCE(
            (SELECT SUM(amount) FROM payroll_items_data pid 
             WHERE pid.employee_id = ebd.employee_id AND COALESCE(pid.pay_type, 'Tambahan') = 'Base'), 0
          ) as base_pay,
          COALESCE(
            (SELECT SUM(amount) FROM payroll_items_data pid 
             WHERE pid.employee_id = ebd.employee_id AND COALESCE(pid.pay_type, 'Tambahan') = 'Tambahan'), 0
          ) as tambahan_pay,
          COALESCE(
            (SELECT SUM(amount) FROM payroll_items_data pid 
             WHERE pid.employee_id = ebd.employee_id AND COALESCE(pid.pay_type, 'Tambahan') = 'Overtime'), 0
          ) as overtime_pay,
          -- Aggregate deductions
          COALESCE(
            (SELECT SUM(employee_amount) FROM deductions_data dd 
             WHERE dd.employee_id = ebd.employee_id AND dd.deduction_type = 'epf'), 0
          ) as epf_employee,
          COALESCE(
            (SELECT SUM(employer_amount) FROM deductions_data dd 
             WHERE dd.employee_id = ebd.employee_id AND dd.deduction_type = 'epf'), 0
          ) as epf_employer,
          COALESCE(
            (SELECT SUM(employee_amount) FROM deductions_data dd 
             WHERE dd.employee_id = ebd.employee_id AND dd.deduction_type = 'socso'), 0
          ) as socso_employee,
          COALESCE(
            (SELECT SUM(employer_amount) FROM deductions_data dd 
             WHERE dd.employee_id = ebd.employee_id AND dd.deduction_type = 'socso'), 0
          ) as socso_employer,
          COALESCE(
            (SELECT SUM(employee_amount) FROM deductions_data dd 
             WHERE dd.employee_id = ebd.employee_id AND dd.deduction_type = 'sip'), 0
          ) as sip_employee,
          COALESCE(
            (SELECT SUM(employer_amount) FROM deductions_data dd 
             WHERE dd.employee_id = ebd.employee_id AND dd.deduction_type = 'sip'), 0
          ) as sip_employer,
          COALESCE(
            (SELECT SUM(employee_amount) FROM deductions_data dd 
             WHERE dd.employee_id = ebd.employee_id AND dd.deduction_type = 'income_tax'), 0
          ) as income_tax,
          -- Commission and bonus data
          COALESCE(
            (SELECT SUM(commission_amount) FROM commission_data cd 
             WHERE cd.employee_id = ebd.employee_id AND UPPER(cd.description) LIKE '%COMMISSION%'), 0
          ) as commission_total,
          COALESCE(
            (SELECT SUM(commission_amount) FROM commission_data cd 
             WHERE cd.employee_id = ebd.employee_id AND UPPER(cd.description) LIKE '%BONUS%'), 0
          ) as bonus_total,
          -- Leave data
          COALESCE(
            (SELECT SUM(leave_amount) FROM leave_data ld 
             WHERE ld.employee_id = ebd.employee_id AND ld.leave_type = 'cuti_tahunan'), 0
          ) as cuti_tahunan_amount
        FROM employee_base_data ebd
        LEFT JOIN mid_month_data mmd ON ebd.employee_id = mmd.employee_id
        LEFT JOIN pinjam_monthly_data pmd ON ebd.employee_id = pmd.employee_id
        ORDER BY ebd.staff_name
      `;

      const result = await pool.query(comprehensiveQuery, [yearInt, monthInt]);

      // Process the data for different views
      const processedData = result.rows.map((row, index) => {
        const gaji = parseFloat(row.base_pay || 0) + parseFloat(row.tambahan_pay || 0);
        const gajiKasar = parseFloat(row.gross_pay || 0);
        // Commission and bonus from commission_records are advances already deducted from net_pay in DB
        const commissionAdvance = parseFloat(row.commission_total || 0) + parseFloat(row.bonus_total || 0);
        // GAJI BERSIH = net_pay + commission (add back to show true net before advances)
        const gajiBersih = parseFloat(row.net_pay || 0) + commissionAdvance;
        // JUMLAH = net_pay - mid_month (commission already deducted from net_pay)
        const jumlah = parseFloat(row.net_pay || 0) - parseFloat(row.mid_month_amount || 0);
        // Rounding: DIGENAPKAN rounds up to nearest whole ringgit
        const setelah_digenapkan = Math.ceil(jumlah);
        const digenapkan = setelah_digenapkan - jumlah;

        return {
          no: index + 1,
          employee_payroll_id: row.employee_payroll_id,
          staff_id: row.staff_id,
          staff_name: row.staff_name,
          ic_no: row.ic_no,
          bank_account_number: row.bank_account_number,
          payment_preference: row.payment_preference,
          location_code: row.location_code,
          location_source: row.location_source, // 'job', 'direct', or 'default'
          job_type: row.job_type,
          section: row.section,
          // Salary tab data
          gaji: gaji,
          ot: parseFloat(row.overtime_pay || 0),
          bonus: parseFloat(row.bonus_total || 0),
          comm: parseFloat(row.commission_total || 0),
          gaji_kasar: gajiKasar,
          epf_majikan: parseFloat(row.epf_employer || 0),
          epf_pekerja: parseFloat(row.epf_employee || 0),
          socso_majikan: parseFloat(row.socso_employer || 0),
          socso_pekerja: parseFloat(row.socso_employee || 0),
          sip_majikan: parseFloat(row.sip_employer || 0),
          sip_pekerja: parseFloat(row.sip_employee || 0),
          pcb: parseFloat(row.income_tax || 0),
          gaji_bersih: gajiBersih,
          setengah_bulan: parseFloat(row.mid_month_amount || 0),
          jumlah: jumlah,
          digenapkan: digenapkan,
          setelah_digenapkan: setelah_digenapkan,
          cuti_tahunan_amount: parseFloat(row.cuti_tahunan_amount || 0),
          // Bank/Pinjam tab data
          gaji_genap: parseFloat(row.net_pay || 0) - parseFloat(row.mid_month_amount || 0),
          total_pinjam: parseFloat(row.total_pinjam || 0),
          final_total: parseFloat(row.net_pay || 0) - parseFloat(row.mid_month_amount || 0) - parseFloat(row.total_pinjam || 0),
          net_pay: parseFloat(row.net_pay || 0),
          mid_month_amount: parseFloat(row.mid_month_amount || 0),
        };
      });

      // Group data by location for comprehensive salary view
      // With dual-location logic, employees can appear in multiple locations
      // Track unique employees for grand totals to avoid double-counting
      const locationData = {};
      const grandTotals = {
        gaji: 0, ot: 0, bonus: 0, comm: 0, gaji_kasar: 0,
        epf_majikan: 0, epf_pekerja: 0, socso_majikan: 0, socso_pekerja: 0,
        sip_majikan: 0, sip_pekerja: 0, pcb: 0, gaji_bersih: 0,
        setengah_bulan: 0, jumlah: 0, digenapkan: 0, setelah_digenapkan: 0
      };
      const processedUniqueEmployees = new Set(); // Track unique employees for grand totals

      // Fetch all locations from database
      const locationsResult = await pool.query("SELECT id FROM locations ORDER BY id");
      const allLocations = locationsResult.rows.map(r => r.id);
      allLocations.forEach(loc => {
        locationData[loc] = {
          location: loc,
          employees: [],
          totals: {
            gaji: 0, ot: 0, bonus: 0, comm: 0, gaji_kasar: 0,
            epf_majikan: 0, epf_pekerja: 0, socso_majikan: 0, socso_pekerja: 0,
            sip_majikan: 0, sip_pekerja: 0, pcb: 0, gaji_bersih: 0,
            setengah_bulan: 0, jumlah: 0, digenapkan: 0, setelah_digenapkan: 0
          }
        };
      });

      // Process each employee and group by location
      // With dual-location, an employee may appear in multiple locations
      processedData.forEach(employee => {
        const loc = employee.location_code || "02";

        if (locationData[loc]) {
          // Add employee data to location
          locationData[loc].employees.push(employee);

          // Add to location totals (each location gets the full amount)
          Object.keys(locationData[loc].totals).forEach(key => {
            locationData[loc].totals[key] += employee[key] || 0;
          });
        }

        // Add to grand totals ONLY ONCE per unique employee (avoid double-counting)
        if (!processedUniqueEmployees.has(employee.staff_id)) {
          processedUniqueEmployees.add(employee.staff_id);
          Object.keys(grandTotals).forEach(key => {
            grandTotals[key] += employee[key] || 0;
          });
        }
      });

      // Handle special location data (Commissions by location_code, CUTI TAHUNAN, etc.)
      // Fetch commission records with their location_code for proper grouping
      const commissionQuery = `
        SELECT
          cr.employee_id,
          cr.location_code,
          s.name as staff_name,
          s.ic_no,
          s.bank_account_number,
          s.payment_preference,
          COALESCE(SUM(cr.amount), 0) as commission_amount
        FROM commission_records cr
        JOIN staffs s ON cr.employee_id = s.id
        WHERE EXTRACT(YEAR FROM cr.commission_date) = $1
          AND EXTRACT(MONTH FROM cr.commission_date) = $2
          AND UPPER(cr.description) LIKE '%COMMISSION%'
        GROUP BY cr.employee_id, cr.location_code, s.name, s.ic_no, s.bank_account_number, s.payment_preference
      `;
      const commissionResult = await pool.query(commissionQuery, [yearInt, monthInt]);

      // Get mid-month data for commission location employees
      const midMonthQuery = `
        SELECT employee_id, COALESCE(amount, 0) as mid_month_amount
        FROM mid_month_payrolls
        WHERE year = $1 AND month = $2
      `;
      const midMonthResult = await pool.query(midMonthQuery, [yearInt, monthInt]);
      const midMonthMap = new Map();
      midMonthResult.rows.forEach(row => {
        midMonthMap.set(row.employee_id, parseFloat(row.mid_month_amount || 0));
      });

      // Track commission-only employees (those not in regular payroll)
      const commissionOnlyEmployees = [];

      // Group commissions by location (16-24), defaulting to "18" if no location_code
      commissionResult.rows.forEach(row => {
        const locCode = row.location_code || "18"; // Default to COMM-KILANG if no location
        const commAmount = parseFloat(row.commission_amount || 0);
        const midMonthAmount = midMonthMap.get(row.employee_id) || 0;

        // Check if this employee exists in processedData (has regular payroll)
        const hasRegularPayroll = processedData.some(e => e.staff_id === row.employee_id);

        // Only process for commission locations (16-24)
        if (locationData[locCode]) {
          // Find if employee already exists in this location
          const existingEmployee = locationData[locCode].employees.find(
            e => e.staff_id === row.employee_id
          );

          if (!existingEmployee) {
            // Find employee base data from processed data
            const baseEmp = processedData.find(e => e.staff_id === row.employee_id);

            const jumlah = commAmount - midMonthAmount;

            const commissionEmployeeData = {
              employee_payroll_id: baseEmp?.employee_payroll_id || null,
              staff_id: row.employee_id,
              staff_name: row.staff_name,
              ic_no: row.ic_no,
              bank_account_number: row.bank_account_number,
              payment_preference: row.payment_preference,
              location_code: locCode,
              gaji: 0, ot: 0, bonus: 0, comm: commAmount,
              gaji_kasar: commAmount,
              epf_majikan: 0, epf_pekerja: 0, socso_majikan: 0, socso_pekerja: 0,
              sip_majikan: 0, sip_pekerja: 0, pcb: 0,
              gaji_bersih: commAmount,
              setengah_bulan: midMonthAmount,
              jumlah: jumlah,
              // For Bank/Pinjam tabs
              gaji_genap: commAmount - midMonthAmount,
              total_pinjam: 0,
              final_total: commAmount - midMonthAmount,
              net_pay: commAmount,
              mid_month_amount: midMonthAmount,
            };

            locationData[locCode].employees.push(commissionEmployeeData);
            locationData[locCode].totals.comm += commAmount;
            locationData[locCode].totals.gaji_kasar += commAmount;
            locationData[locCode].totals.gaji_bersih += commAmount;
            locationData[locCode].totals.setengah_bulan += midMonthAmount;
            locationData[locCode].totals.jumlah += jumlah;

            // Track commission-only employees for main data response
            if (!hasRegularPayroll) {
              // Check if already tracked (multiple commission entries for same employee)
              const existingCommOnly = commissionOnlyEmployees.find(e => e.staff_id === row.employee_id);
              if (!existingCommOnly) {
                commissionOnlyEmployees.push(commissionEmployeeData);
                // Add to grand totals for commission-only employees
                grandTotals.comm += commAmount;
                grandTotals.gaji_kasar += commAmount;
                grandTotals.gaji_bersih += commAmount;
                grandTotals.setengah_bulan += midMonthAmount;
                grandTotals.jumlah += jumlah;
              } else {
                // Update existing commission-only employee
                existingCommOnly.comm += commAmount;
                existingCommOnly.gaji_kasar += commAmount;
                existingCommOnly.gaji_bersih += commAmount;
                existingCommOnly.jumlah = existingCommOnly.gaji_bersih - existingCommOnly.setengah_bulan;
                existingCommOnly.gaji_genap = existingCommOnly.gaji_bersih - existingCommOnly.mid_month_amount;
                existingCommOnly.final_total = existingCommOnly.gaji_genap;
                existingCommOnly.net_pay = existingCommOnly.gaji_bersih;
                // Update grand totals
                grandTotals.comm += commAmount;
                grandTotals.gaji_kasar += commAmount;
                grandTotals.gaji_bersih += commAmount;
                grandTotals.jumlah += commAmount;
              }
            }
          } else {
            // Add to existing employee's commission
            existingEmployee.comm += commAmount;
            existingEmployee.gaji_kasar += commAmount;
            existingEmployee.gaji_bersih += commAmount;
            existingEmployee.jumlah = existingEmployee.gaji_bersih - existingEmployee.setengah_bulan;

            locationData[locCode].totals.comm += commAmount;
            locationData[locCode].totals.gaji_kasar += commAmount;
            locationData[locCode].totals.gaji_bersih += commAmount;
            locationData[locCode].totals.jumlah += commAmount;
          }
        }
      });

      // CUTI TAHUNAN (23) - Leave records
      const cutiTahunanEmployees = processedData.filter(emp => emp.cuti_tahunan_amount > 0);
      cutiTahunanEmployees.forEach(emp => {
        if (!locationData["23"].employees.find(e => e.staff_id === emp.staff_id)) {
          locationData["23"].employees.push({
            ...emp,
            gaji: 0, ot: 0, bonus: 0, comm: emp.cuti_tahunan_amount,
            epf_majikan: 0, epf_pekerja: 0, socso_majikan: 0, socso_pekerja: 0,
            sip_majikan: 0, sip_pekerja: 0, pcb: 0,
            gaji_kasar: emp.cuti_tahunan_amount,
            gaji_bersih: emp.cuti_tahunan_amount,
            jumlah: emp.cuti_tahunan_amount
          });
          locationData["23"].totals.comm += emp.cuti_tahunan_amount;
          locationData["23"].totals.gaji_kasar += emp.cuti_tahunan_amount;
          locationData["23"].totals.gaji_bersih += emp.cuti_tahunan_amount;
          locationData["23"].totals.jumlah += emp.cuti_tahunan_amount;
        }
      });

      // Convert locationData object to array for response
      const locationsArray = allLocations.map(loc => locationData[loc]);

      // Get unique employees for Bank/Pinjam tabs (avoid duplicates from dual-location)
      // Include both regular payroll employees and commission-only employees
      const uniqueEmployeesForBankPinjam = (() => {
        const seen = new Set();
        const result = [];

        // First add regular payroll employees
        processedData.forEach(emp => {
          if (!seen.has(emp.staff_id)) {
            seen.add(emp.staff_id);
            result.push(emp);
          }
        });

        // Then add commission-only employees
        commissionOnlyEmployees.forEach(emp => {
          if (!seen.has(emp.staff_id)) {
            seen.add(emp.staff_id);
            result.push(emp);
          }
        });

        return result;
      })();

      // Response with all data for all tabs
      res.json({
        year: yearInt,
        month: monthInt,
        // Original format for Bank/Pinjam tabs (unique employees only)
        data: uniqueEmployeesForBankPinjam.map((emp, index) => ({
          no: index + 1,
          staff_id: emp.staff_id,
          staff_name: emp.staff_name,
          payment_preference: emp.payment_preference,
          gaji_genap: emp.gaji_genap,
          total_pinjam: emp.total_pinjam,
          final_total: emp.final_total,
          net_pay: emp.net_pay,
          mid_month_amount: emp.mid_month_amount,
        })),
        total_records: uniqueEmployeesForBankPinjam.length,
        summary: {
          total_gaji_genap: uniqueEmployeesForBankPinjam.reduce((sum, item) => sum + item.gaji_genap, 0),
          total_pinjam: uniqueEmployeesForBankPinjam.reduce((sum, item) => sum + item.total_pinjam, 0),
          total_final: uniqueEmployeesForBankPinjam.reduce((sum, item) => sum + item.final_total, 0),
        },
        // Comprehensive salary data for the new Salary tab
        comprehensive: {
          year: yearInt,
          month: monthInt,
          locations: locationsArray,
          grand_totals: grandTotals
        },
        // Individual employees data for Employee tab (deduplicated, sorted by name)
        employees: (() => {
          const seenEmployees = new Set();
          const result = [];

          // Add regular payroll employees
          processedData.forEach(emp => {
            if (!seenEmployees.has(emp.staff_id)) {
              seenEmployees.add(emp.staff_id);
              result.push(emp);
            }
          });

          // Add commission-only employees
          commissionOnlyEmployees.forEach(emp => {
            if (!seenEmployees.has(emp.staff_id)) {
              seenEmployees.add(emp.staff_id);
              result.push(emp);
            }
          });

          // Sort by staff_name alphabetically
          result.sort((a, b) => (a.staff_name || '').localeCompare(b.staff_name || ''));

          // Return with row numbers
          return result.map((emp, index) => ({
            no: index + 1,
            employee_payroll_id: emp.employee_payroll_id,
            staff_id: emp.staff_id,
            staff_name: emp.staff_name,
            gaji: emp.gaji,
            ot: emp.ot,
            bonus: emp.bonus,
            comm: emp.comm,
            gaji_kasar: emp.gaji_kasar,
            epf_majikan: emp.epf_majikan,
            epf_pekerja: emp.epf_pekerja,
            socso_majikan: emp.socso_majikan,
            socso_pekerja: emp.socso_pekerja,
            sip_majikan: emp.sip_majikan,
            sip_pekerja: emp.sip_pekerja,
            pcb: emp.pcb,
            gaji_bersih: emp.gaji_bersih,
            setengah_bulan: emp.setengah_bulan,
            jumlah: emp.jumlah,
            digenapkan: emp.digenapkan,
            setelah_digenapkan: emp.setelah_digenapkan,
          }));
        })(),
        // Grand totals for the Employee tab
        employees_grand_totals: grandTotals,
        // Bank table data (unique employees only - avoid duplicates from dual-location)
        // Include both regular payroll and commission-only employees
        bank_data: (() => {
          const seenEmployees = new Set();
          const result = [];

          // First add regular payroll employees
          processedData.forEach(emp => {
            if (!seenEmployees.has(emp.staff_id) && emp.final_total > 0) {
              seenEmployees.add(emp.staff_id);
              result.push({
                staff_id: emp.staff_id,
                staff_name: emp.staff_name,
                ic_no: emp.ic_no,
                bank_account_number: emp.bank_account_number,
                total: emp.final_total,
                payment_preference: emp.payment_preference,
              });
            }
          });

          // Then add commission-only employees
          commissionOnlyEmployees.forEach(emp => {
            if (!seenEmployees.has(emp.staff_id) && emp.final_total > 0) {
              seenEmployees.add(emp.staff_id);
              result.push({
                staff_id: emp.staff_id,
                staff_name: emp.staff_name,
                ic_no: emp.ic_no,
                bank_account_number: emp.bank_account_number,
                total: emp.final_total,
                payment_preference: emp.payment_preference,
              });
            }
          });

          return result.map((emp, index) => ({
            no: index + 1,
            staff_name: emp.staff_name,
            icNo: emp.ic_no || "N/A",
            bankAccountNumber: emp.bank_account_number || "N/A",
            total: emp.total,
            payment_preference: emp.payment_preference,
          }));
        })()
      });
    } catch (error) {
      console.error("Error fetching comprehensive salary report:", error);
      res.status(500).json({
        message: "Error fetching salary report",
        error: error.message,
      });
    }
  });

  return router;
}
