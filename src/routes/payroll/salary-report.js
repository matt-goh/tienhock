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
        -- Base payroll data without location (we'll join locations later)
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
            jlm.location_code as job_location_code
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN staffs s ON ep.employee_id = s.id
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

          -- Job-based mapping
          SELECT epb.*, epb.job_location_code as location_code, 'job' as location_source
          FROM employee_payroll_base epb
          WHERE epb.job_location_code IS NOT NULL

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
            COALESCE(SUM(cr.amount), 0) as commission_amount
          FROM commission_records cr
          WHERE EXTRACT(YEAR FROM cr.commission_date) = $1 
            AND EXTRACT(MONTH FROM cr.commission_date) = $2
          GROUP BY cr.employee_id, cr.description
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
        const gajiBersih = parseFloat(row.net_pay || 0) + parseFloat(row.commission_total || 0);
        const jumlah = gajiBersih - parseFloat(row.mid_month_amount || 0);

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
          jumlah_digenapkan: 0, // Empty in new system
          setelah_digenapkan: jumlah, // Same as jumlah
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
        setengah_bulan: 0, jumlah: 0, jumlah_digenapkan: 0, setelah_digenapkan: 0
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
            setengah_bulan: 0, jumlah: 0, jumlah_digenapkan: 0, setelah_digenapkan: 0
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

      // Handle special location data (COMM-KILANG, CUTI TAHUNAN, etc.)
      // COMM-KILANG (18) - Commission records
      const commissionEmployees = processedData.filter(emp => emp.comm > 0);
      commissionEmployees.forEach(emp => {
        if (!locationData["18"].employees.find(e => e.staff_id === emp.staff_id)) {
          locationData["18"].employees.push({
            ...emp,
            gaji: 0, ot: 0, bonus: 0, // Only show commission data
            epf_majikan: 0, epf_pekerja: 0, socso_majikan: 0, socso_pekerja: 0,
            sip_majikan: 0, sip_pekerja: 0, pcb: 0
          });
          locationData["18"].totals.comm += emp.comm;
          locationData["18"].totals.gaji_kasar += emp.comm;
          locationData["18"].totals.gaji_bersih += emp.comm;
          locationData["18"].totals.jumlah += emp.comm;
          locationData["18"].totals.setelah_digenapkan += emp.comm;
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
            jumlah: emp.cuti_tahunan_amount,
            setelah_digenapkan: emp.cuti_tahunan_amount
          });
          locationData["23"].totals.comm += emp.cuti_tahunan_amount;
          locationData["23"].totals.gaji_kasar += emp.cuti_tahunan_amount;
          locationData["23"].totals.gaji_bersih += emp.cuti_tahunan_amount;
          locationData["23"].totals.jumlah += emp.cuti_tahunan_amount;
          locationData["23"].totals.setelah_digenapkan += emp.cuti_tahunan_amount;
        }
      });

      // Convert locationData object to array for response
      const locationsArray = allLocations.map(loc => locationData[loc]);

      // Get unique employees for Bank/Pinjam tabs (avoid duplicates from dual-location)
      const uniqueEmployeesForBankPinjam = (() => {
        const seen = new Set();
        return processedData.filter(emp => {
          if (seen.has(emp.staff_id)) return false;
          seen.add(emp.staff_id);
          return true;
        });
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
        // Bank table data (unique employees only - avoid duplicates from dual-location)
        bank_data: (() => {
          const seenEmployees = new Set();
          return processedData
            .filter(emp => {
              if (seenEmployees.has(emp.staff_id) || emp.final_total <= 0) return false;
              seenEmployees.add(emp.staff_id);
              return true;
            })
            .map((emp, index) => ({
              no: index + 1,
              staff_name: emp.staff_name,
              icNo: emp.ic_no || "N/A",
              bankAccountNumber: emp.bank_account_number || "N/A",
              total: emp.final_total,
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
