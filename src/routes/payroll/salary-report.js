// src/routes/payroll/salary-report.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Compute the full monthly salary report (all tabs) for the given year/month.
  // Returns the exact object shape the "/" route responds with. Reused by the
  // "/yearly" and "/annual" routes so they build on the verified monthly logic.
  async function computeMonthlySalaryReport(pool, yearInt, monthInt) {
      // Main comprehensive query to get all employee data with payroll details
      // Dual-location logic: employee appears in BOTH job-based AND direct-mapped locations
      const comprehensiveQuery = `
        WITH job_location_map AS (
          SELECT job_id, location_code
          FROM job_location_mappings
          WHERE is_active = true
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
            ep.digenapkan,
            ep.setelah_digenapkan,
            ep.job_type,
            ep.section,
            -- Use Head's job location if head_staff_id is set, otherwise use direct job location
            COALESCE(
              head_jlm.location_code,  -- HEAD's job location (when head_staff_id is set)
              jlm.location_code        -- Fallback to direct job location
            ) as job_location_code,
            -- Reporting-location source: the HEAD's first direct staffs.location entry
            -- (amounts follow the HEAD), falling back to the employee's own first direct
            -- location. job_location_mappings is an incentive bucket (mostly '18'), so it
            -- is only a last resort in employee_all_locations below.
            COALESCE(
              NULLIF(head_s.location->>0, ''),
              NULLIF(s.location->>0, '')
            ) as head_direct_location
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
        -- Each employee reports under exactly ONE location so location subtotals
        -- reconcile to the (employee-deduped) grand total. Per the confirmed business
        -- rule "amounts follow the HEAD's location", the priority is:
        --   1) the HEAD's first direct staffs.location (head_direct_location already
        --      falls back to the employee's own first direct location);
        --   2) the job location (mostly the '18' incentive bucket) when no direct
        --      location exists, unless that combo is explicitly excluded;
        --   3) the '02' fallback.
        employee_all_locations AS (
          SELECT
            epb.*,
            COALESCE(
              epb.head_direct_location,
              CASE
                WHEN epb.job_location_code IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM employee_exclusions ex
                    WHERE ex.employee_id = epb.employee_id
                      AND ex.job_id = epb.job_type
                      AND ex.location_code = epb.job_location_code
                  )
                THEN epb.job_location_code
                ELSE NULL
              END,
              '02'
            ) as location_code,
            'reporting' as location_source
          FROM employee_payroll_base epb
        ),
        -- Exactly one row per employee (the single reporting location above).
        employee_base_data AS (
          SELECT DISTINCT ON (employee_id)
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
            digenapkan,
            setelah_digenapkan,
            job_type,
            section,
            location_source
          FROM employee_all_locations
          ORDER BY employee_id, location_code
        ),
        payroll_items_data AS (
          SELECT
            ep.employee_id,
            pi.pay_code_id,
            CASE
              WHEN lower(btrim(coalesce(pi.description, ''))) = 'cuti tahunan' THEN 'cuti tahunan'
              ELSE NULL
            END as description,
            -- Match Payroll Details: calculate each pay code/rate/unit from its
            -- total units, rather than adding individually rounded daily amounts.
            CASE
              WHEN COALESCE(pi.rate_unit, pc.rate_unit) IN ('Percent', 'Fixed')
                THEN ROUND(SUM(pi.amount), 2)
              ELSE ROUND(
                ROUND(COALESCE(pi.rate, 0), 2) *
                SUM(COALESCE(pi.quantity, 0) + COALESCE(pi.foc_units, 0)),
                2
              )
            END as amount,
            pc.pay_type,
            pc.report_column,
            COALESCE(pi.rate_unit, pc.rate_unit) as rate_unit
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN payroll_items pi ON ep.id = pi.employee_payroll_id
          LEFT JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE mp.year = $1 AND mp.month = $2
            -- Exclude daily work items dated on a leave day: they pay nothing as
            -- work (the day is paid via leave) and are excluded from gross_pay, so
            -- the base/tambahan/overtime breakdown must drop them too. Matches by
            -- staff name (siblings share leave) like the payslip filter.
            AND NOT (
              pi.work_log_type = 'daily'
              AND pi.source_date IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM leave_records lr2
                JOIN staffs s2 ON lr2.employee_id = s2.id
                WHERE s2.name = (SELECT name FROM staffs WHERE id = ep.employee_id)
                  AND lr2.status = 'approved'
                  AND lr2.leave_date = pi.source_date
              )
            )
          GROUP BY
            ep.employee_id,
            pi.pay_code_id,
            pi.rate,
            pc.pay_type,
            pc.report_column,
            COALESCE(pi.rate_unit, pc.rate_unit),
            CASE
              WHEN lower(btrim(coalesce(pi.description, ''))) = 'cuti tahunan' THEN 'cuti tahunan'
              ELSE NULL
            END
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
        -- Mid-month aggregated by NAME so advances recorded under any sibling ID
        -- (multi-ID staff) roll up to the person, mirroring pinjam and the combined payroll.
        mid_month_by_name AS (
          SELECT s.name AS staff_name, COALESCE(SUM(mmp.amount), 0) as mid_month_amount
          FROM mid_month_payrolls mmp
          JOIN staffs s ON mmp.employee_id = s.id
          WHERE mmp.year = $1 AND mmp.month = $2
          GROUP BY s.name
        ),
        mid_month_rep AS (
          SELECT staff_name, MIN(employee_id) AS employee_id
          FROM (SELECT DISTINCT employee_id, staff_name FROM employee_base_data) d
          GROUP BY staff_name
        ),
        mid_month_data AS (
          SELECT mmr.employee_id, mmbn.mid_month_amount
          FROM mid_month_rep mmr
          JOIN mid_month_by_name mmbn ON mmbn.staff_name = mmr.staff_name
        ),
        commission_data AS (
          SELECT
            cr.employee_id,
            cr.location_code,
            lower(btrim(coalesce(cr.description, ''))) as desc_key,
            COALESCE(SUM(cr.amount), 0) as commission_amount,
            COALESCE(SUM(CASE WHEN COALESCE(cr.is_advance, true) THEN cr.amount ELSE 0 END), 0) as advance_amount
          FROM commission_records cr
          WHERE EXTRACT(YEAR FROM cr.commission_date) = $1
            AND EXTRACT(MONTH FROM cr.commission_date) = $2
          GROUP BY cr.employee_id, cr.location_code, lower(btrim(coalesce(cr.description, '')))
        ),
        others_data AS (
          -- Kerja Luar (others) earnings carry pay_code/description/pay_type/rate_unit so they
          -- can be bucketed into GAJI / BONUS / C-I-O / CUTI like regular payroll items.
          SELECT
            orec.employee_id,
            orec.pay_code_id,
            -- Per-entry override (orec) wins over the pay-code-level override (pc),
            -- which in turn wins over the automatic bucketing rule below.
            COALESCE(orec.report_column, pc.report_column) as report_column,
            lower(btrim(coalesce(orec.description, ''))) as desc_key,
            COALESCE(pc.pay_type, 'Tambahan') as pay_type,
            COALESCE(orec.rate_unit, pc.rate_unit) as rate_unit,
            COALESCE(SUM(orec.amount), 0) as others_amount
          FROM others_records orec
          LEFT JOIN pay_codes pc ON orec.pay_code_id = pc.id
          WHERE EXTRACT(YEAR FROM orec.record_date) = $1
            AND EXTRACT(MONTH FROM orec.record_date) = $2
          GROUP BY orec.employee_id, orec.pay_code_id, orec.report_column, pc.report_column, lower(btrim(coalesce(orec.description, ''))), pc.pay_type, COALESCE(orec.rate_unit, pc.rate_unit)
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
        pinjam_by_name AS (
          -- Aggregate pinjam by employee NAME so amounts recorded under any
          -- sibling ID (multi-ID staff) roll up to the person, mirroring how
          -- the combined payroll is keyed.
          SELECT s.name AS staff_name, COALESCE(SUM(pr.amount), 0) as total_pinjam,
                 json_agg(json_build_object(
                   'description', COALESCE(NULLIF(btrim(pr.description), ''), 'Pinjam'),
                   'amount', pr.amount
                 ) ORDER BY pr.amount DESC) AS pinjam_details
          FROM pinjam_records pr
          JOIN staffs s ON pr.employee_id = s.id
          WHERE pr.year = $1 AND pr.month = $2
          AND pr.pinjam_type = 'monthly'
          GROUP BY s.name
        ),
        -- Pick one representative payroll ID per name (one that actually has a
        -- report row) so the name-aggregated pinjam is attributed exactly once.
        pinjam_rep AS (
          SELECT staff_name, MIN(employee_id) AS employee_id
          FROM (SELECT DISTINCT employee_id, staff_name FROM employee_base_data) d
          GROUP BY staff_name
        ),
        pinjam_monthly_data AS (
          SELECT pr.employee_id, pbn.total_pinjam, pbn.pinjam_details
          FROM pinjam_rep pr
          JOIN pinjam_by_name pbn ON pbn.staff_name = pr.staff_name
        )
        SELECT
          ebd.*,
          COALESCE(mmd.mid_month_amount, 0) as mid_month_amount,
          COALESCE(pmd.total_pinjam, 0) as total_pinjam,
          COALESCE(pmd.pinjam_details, '[]'::json) as pinjam_details,
          -- GAJI = regular wage. Worker WITH an Hour/Day base: all non-piece work (base + hourly
          -- maintenance/Sunday). Worker with NO hourly base (pure piece / office salary): Base +
          -- production F/HARIAN codes (FULL_*). FULL and HADIR_MEETING always count as GAJI for
          -- all workers; other allowances/incentives remain C/I/O. Kerja-Luar matched by name.
          COALESCE(
            (SELECT SUM(amount) FROM payroll_items_data pid
             WHERE pid.employee_id = ebd.employee_id
               AND (pid.report_column = 'GAJI' OR (pid.report_column IS NULL
               AND COALESCE(pid.pay_type, 'Tambahan') <> 'Overtime'
               AND (pid.pay_code_id IS NULL OR pid.pay_code_id NOT IN ('BONUS', 'IXT', 'ADD_COMM', 'T-SALESMAN', 'IKUT_BX', 'JAGA_GATE', 'BH_JG_FORKLIFT', 'BH_SUSUN', 'T_KERJA'))
               AND lower(btrim(coalesce(pid.description, ''))) <> 'cuti tahunan'
               AND (
                 pid.pay_code_id IN ('FULL', 'HADIR_MEETING')
                 OR (EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND COALESCE(pid.rate_unit, 'Hour') IN ('Hour', 'Day', 'Fixed'))
                 OR (NOT EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND COALESCE(pid.pay_type, 'Tambahan') = 'Base')
                 OR (NOT EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND pid.pay_code_id LIKE 'FULL!_%' ESCAPE '!')
               )))), 0
          ) + COALESCE(
            (SELECT SUM(others_amount) FROM others_data od
             WHERE od.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND (od.report_column = 'GAJI' OR (od.report_column IS NULL
               AND od.pay_type <> 'Overtime'
               AND (od.pay_code_id IS NULL OR od.pay_code_id NOT IN ('BONUS', 'IXT', 'ADD_COMM', 'T-SALESMAN', 'IKUT_BX', 'JAGA_GATE', 'BH_JG_FORKLIFT', 'BH_SUSUN', 'T_KERJA'))
               AND od.desc_key <> 'cuti tahunan'
               AND (
                 od.pay_code_id IN ('FULL', 'HADIR_MEETING')
                 OR (EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND COALESCE(od.rate_unit, 'Hour') IN ('Hour', 'Day', 'Fixed'))
                 OR (NOT EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND od.pay_type = 'Base')
               )))), 0
          ) as gaji_pay,
          -- OT column = overtime from payroll items only (excl. Cuti-Tahunan)
          COALESCE(
            (SELECT SUM(amount) FROM payroll_items_data pid
             WHERE pid.employee_id = ebd.employee_id
               AND (pid.report_column = 'OT' OR (pid.report_column IS NULL
               AND COALESCE(pid.pay_type, 'Tambahan') = 'Overtime'
               AND lower(btrim(coalesce(pid.description, ''))) <> 'cuti tahunan'))), 0
          ) as overtime_pay,
          -- Overtime recorded as Kerja Luar (others), by name - folded into BONUS with payroll OT
          COALESCE(
            (SELECT SUM(others_amount) FROM others_data od
             WHERE od.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND (od.report_column = 'OT' OR (od.report_column IS NULL
               AND od.pay_type = 'Overtime'
               AND od.desc_key <> 'cuti tahunan'))), 0
          ) as others_overtime,
          -- C/I/O = incentive/allowance codes (IXT/ADD_COMM/T-SALESMAN/IKUT_BX/...) +
          -- everything that is NOT the worker's GAJI: piece-rate for an hourly worker, or any
          -- non-Base extra for a pure-piece worker. Excl. Overtime, BONUS code, Cuti-Tahunan,
          -- and FULL/HADIR_MEETING (always GAJI).
          COALESCE(
            (SELECT SUM(amount) FROM payroll_items_data pid
             WHERE pid.employee_id = ebd.employee_id
               AND (pid.report_column = 'CIO' OR (pid.report_column IS NULL
               AND COALESCE(pid.pay_type, 'Tambahan') <> 'Overtime'
               AND (pid.pay_code_id IS NULL OR pid.pay_code_id NOT IN ('BONUS', 'FULL', 'HADIR_MEETING'))
               AND lower(btrim(coalesce(pid.description, ''))) <> 'cuti tahunan'
               AND (
                 pid.pay_code_id IN ('IXT', 'ADD_COMM', 'T-SALESMAN', 'IKUT_BX', 'JAGA_GATE', 'BH_JG_FORKLIFT', 'BH_SUSUN', 'T_KERJA')
                 OR (EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND COALESCE(pid.rate_unit, 'Hour') NOT IN ('Hour', 'Day', 'Fixed'))
                 OR (NOT EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND COALESCE(pid.pay_type, 'Tambahan') <> 'Base'
                   AND (pid.pay_code_id IS NULL OR pid.pay_code_id NOT LIKE 'FULL!_%' ESCAPE '!'))
               )))), 0
          ) + COALESCE(
            (SELECT SUM(others_amount) FROM others_data od
             WHERE od.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND (od.report_column = 'CIO' OR (od.report_column IS NULL
               AND od.pay_type <> 'Overtime'
               AND (od.pay_code_id IS NULL OR od.pay_code_id NOT IN ('BONUS', 'FULL', 'HADIR_MEETING'))
               AND od.desc_key <> 'cuti tahunan'
               AND (
                 od.pay_code_id IN ('IXT', 'ADD_COMM', 'T-SALESMAN', 'IKUT_BX', 'JAGA_GATE', 'BH_JG_FORKLIFT', 'BH_SUSUN', 'T_KERJA')
                 OR (EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND COALESCE(od.rate_unit, 'Hour') NOT IN ('Hour', 'Day', 'Fixed'))
                 OR (NOT EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND od.pay_type <> 'Base')
               )))), 0
          ) as piece_insentif_pay,
          -- Cuti Tahunan recorded via payroll items / Kerja-Luar (by name) -> shown under CUTI
          COALESCE(
            (SELECT SUM(amount) FROM payroll_items_data pid
             WHERE pid.employee_id = ebd.employee_id
               AND (pid.report_column = 'CUTI' OR (pid.report_column IS NULL
               AND lower(btrim(coalesce(pid.description, ''))) = 'cuti tahunan'))), 0
          ) + COALESCE(
            (SELECT SUM(others_amount) FROM others_data od
             WHERE od.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND (od.report_column = 'CUTI' OR (od.report_column IS NULL
               AND od.desc_key = 'cuti tahunan'))), 0
          ) as cuti_tahunan_other_total,
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
          -- Commission/incentive at a location (C/I/O), excl. Cuti-Tahunan (loc 23 or desc); by name across siblings
          COALESCE(
            (SELECT SUM(commission_amount) FROM commission_data cd
             WHERE cd.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND cd.location_code IS NOT NULL
               AND NOT (cd.location_code = '23' OR cd.desc_key = 'cuti tahunan')), 0
          ) as commission_total,
          COALESCE(
            (SELECT SUM(advance_amount) FROM commission_data cd
             WHERE cd.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND cd.location_code IS NOT NULL), 0
          ) as commission_advance_total,
          -- Cuti Tahunan recorded as commission/advance (loc 23 or desc 'cuti tahunan') - shown under Cuti
          COALESCE(
            (SELECT SUM(commission_amount) FROM commission_data cd
             WHERE cd.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND (cd.location_code = '23' OR cd.desc_key = 'cuti tahunan')), 0
          ) as cuti_tahunan_commission_total,
          (
            COALESCE(
              (SELECT SUM(commission_amount) FROM commission_data cd
               WHERE cd.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name) AND cd.location_code IS NULL), 0
            ) +
            COALESCE(
              (SELECT SUM(amount) FROM payroll_items_data pid
               WHERE pid.employee_id = ebd.employee_id
                 AND (pid.report_column = 'BONUS' OR (pid.report_column IS NULL
                 AND pid.pay_code_id = 'BONUS'))), 0
            ) +
            COALESCE(
              (SELECT SUM(others_amount) FROM others_data od
               WHERE od.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
                 AND (od.report_column = 'BONUS' OR (od.report_column IS NULL AND od.pay_code_id = 'BONUS'))), 0
            )
          ) as bonus_total,
          COALESCE(
            (SELECT SUM(advance_amount) FROM commission_data cd
             WHERE cd.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name) AND cd.location_code IS NULL), 0
          ) as bonus_advance_total,
          -- Leave data (by name across siblings): combine all cuti types into a single Cuti figure
          COALESCE(
            (SELECT SUM(leave_amount) FROM leave_data ld
             WHERE ld.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)), 0
          ) as leave_total
        FROM employee_base_data ebd
        LEFT JOIN mid_month_data mmd ON ebd.employee_id = mmd.employee_id
        LEFT JOIN pinjam_monthly_data pmd ON ebd.employee_id = pmd.employee_id
        ORDER BY ebd.staff_name
      `;

      const result = await pool.query(comprehensiveQuery, [yearInt, monthInt]);

      // Process the data for different views
      const processedData = result.rows.map((row, index) => {
        // GAJI = regular wage (non-OT Hour/Day work from payroll + Kerja Luar).
        const gaji = parseFloat(row.gaji_pay || 0);
        const gajiKasar = parseFloat(row.gross_pay || 0);
        // Only advance commission/bonus records are already deducted from net_pay in DB.
        // Others (Kerja Luar OT) is a regular earning, NOT an advance, so it is NOT added back here.
        const commissionAdvance =
          parseFloat(row.commission_advance_total || 0) +
          parseFloat(row.bonus_advance_total || 0);
        // GAJI BERSIH = net_pay + commission (add back to show true net before advances)
        const gajiBersih = parseFloat(row.net_pay || 0) + commissionAdvance;
        // SALARY REPORT JUMLAH / S.DIGENAP show the TOTAL earned salary, INCLUDING amounts
        // already paid in advance (commission/bonus advances). They are derived from
        // gaji_bersih (advance added back), so the report reflects full salary - not
        // cash-in-hand. The Bank/Pinjam tabs below use the actual take-home instead.
        const jumlah =
          gajiBersih - parseFloat(row.mid_month_amount || 0);
        const setelah_digenapkan = Math.ceil(jumlah);
        const digenapkan = setelah_digenapkan - jumlah;
        // Actual take-home (advance already deducted) for the Bank/Pinjam tabs - prefer the
        // stored payroll rounding so they match the Payroll Details page and payslip.
        const takeHomeJumlah =
          parseFloat(row.net_pay || 0) - parseFloat(row.mid_month_amount || 0);
        const takeHomeSetelah =
          row.setelah_digenapkan == null
            ? Math.ceil(takeHomeJumlah)
            : parseFloat(row.setelah_digenapkan);
        const totalPinjam = parseFloat(row.total_pinjam || 0);

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
          // OT = all overtime (payroll + Kerja Luar). It is shown only here.
          ot:
            parseFloat(row.overtime_pay || 0) +
            parseFloat(row.others_overtime || 0),
          // BONUS = real bonuses only (BONUS paycode + loc-null commission). OT is NOT folded in.
          bonus: parseFloat(row.bonus_total || 0),
          // COMM/INS/LAIN = location commission (excl. Cuti Tahunan loc 23)
          // + piece-rate work (Bag/Bundle/Kg/Trip/Bill/Percent) + Fixed insentif (IXT), from payroll + Kerja Luar
          comm:
            parseFloat(row.commission_total || 0) +
            parseFloat(row.piece_insentif_pay || 0),
          // CUTI = all 4 leave types + Cuti Tahunan recorded as commission (loc 23).
          // Display-only: does not feed gaji_bersih/jumlah (same as comm).
          cuti:
            parseFloat(row.leave_total || 0) +
            parseFloat(row.cuti_tahunan_commission_total || 0) +
            parseFloat(row.cuti_tahunan_other_total || 0),
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
          // Bank/Pinjam tab data (actual take-home: advance already deducted)
          gaji_genap: takeHomeSetelah,
          total_pinjam: totalPinjam,
          pinjam_details: row.pinjam_details || [],
          final_total: takeHomeSetelah - totalPinjam,
          net_pay: parseFloat(row.net_pay || 0),
          mid_month_amount: parseFloat(row.mid_month_amount || 0),
        };
      });

      // Group data by location for comprehensive salary view
      // With dual-location logic, employees can appear in multiple locations
      // Track unique employees for grand totals to avoid double-counting
      const locationData = {};
      const grandTotals = {
        gaji: 0,
        ot: 0,
        bonus: 0,
        comm: 0,
        cuti: 0,
        gaji_kasar: 0,
        epf_majikan: 0,
        epf_pekerja: 0,
        socso_majikan: 0,
        socso_pekerja: 0,
        sip_majikan: 0,
        sip_pekerja: 0,
        pcb: 0,
        gaji_bersih: 0,
        setengah_bulan: 0,
        jumlah: 0,
        digenapkan: 0,
        setelah_digenapkan: 0,
      };
      const processedUniqueEmployees = new Set(); // Track unique employees for grand totals

      // Fetch all locations from database
      const locationsResult = await pool.query(
        "SELECT id FROM locations ORDER BY id",
      );
      const allLocations = locationsResult.rows.map((r) => r.id);
      allLocations.forEach((loc) => {
        locationData[loc] = {
          location: loc,
          employees: [],
          totals: {
            gaji: 0,
            ot: 0,
            bonus: 0,
            comm: 0,
            cuti: 0,
            gaji_kasar: 0,
            epf_majikan: 0,
            epf_pekerja: 0,
            socso_majikan: 0,
            socso_pekerja: 0,
            sip_majikan: 0,
            sip_pekerja: 0,
            pcb: 0,
            gaji_bersih: 0,
            setengah_bulan: 0,
            jumlah: 0,
            digenapkan: 0,
            setelah_digenapkan: 0,
          },
        };
      });

      // Process each employee and group by location
      // With dual-location, an employee may appear in multiple locations
      processedData.forEach((employee) => {
        const loc = employee.location_code || "02";

        if (locationData[loc]) {
          // Add employee data to location
          locationData[loc].employees.push(employee);

          // Add to location totals (each location gets the full amount)
          Object.keys(locationData[loc].totals).forEach((key) => {
            locationData[loc].totals[key] += employee[key] || 0;
          });
        }

        // Add to grand totals ONLY ONCE per unique employee (avoid double-counting)
        if (!processedUniqueEmployees.has(employee.staff_id)) {
          processedUniqueEmployees.add(employee.staff_id);
          Object.keys(grandTotals).forEach((key) => {
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
          AND cr.location_code IS NOT NULL
        GROUP BY cr.employee_id, cr.location_code, s.name, s.ic_no, s.bank_account_number, s.payment_preference
      `;
      const commissionResult = await pool.query(commissionQuery, [
        yearInt,
        monthInt,
      ]);

      // Get mid-month data for commission location employees
      const midMonthQuery = `
        SELECT employee_id, COALESCE(amount, 0) as mid_month_amount
        FROM mid_month_payrolls
        WHERE year = $1 AND month = $2
      `;
      const midMonthResult = await pool.query(midMonthQuery, [
        yearInt,
        monthInt,
      ]);
      const midMonthMap = new Map();
      midMonthResult.rows.forEach((row) => {
        midMonthMap.set(row.employee_id, parseFloat(row.mid_month_amount || 0));
      });

      // Track commission-only employees (those not in regular payroll)
      const commissionOnlyEmployees = [];
      // Bank payment for commission-only employees excludes Location 23 (Cuti Tahunan).
      // Keep that subtotal separately because one employee can have both Location 23
      // and a normal commission location in the same month.
      const commissionOnlyBankIncome = new Map();

      // Group commissions by location (16-24), defaulting to "18" if no location_code
      // Process normal commission before Location 23 so mixed employees retain the
      // mid-month deduction in their combined employee total.
      const sortedCommissionRows = commissionResult.rows
        .slice()
        .sort(
          (a, b) =>
            Number(a.location_code === "23") - Number(b.location_code === "23"),
        );
      sortedCommissionRows.forEach((row) => {
        const locCode = row.location_code || "18"; // Default to COMM-KILANG if no location
        const commAmount = parseFloat(row.commission_amount || 0);
        // Cuti Tahunan (loc 23) is report-only for commission-only employees: it was
        // paid already, so it does not offset the mid-month advance or go to the bank.
        const midMonthAmount =
          locCode === "23" ? 0 : midMonthMap.get(row.employee_id) || 0;
        // Location 23 = Cuti Tahunan: route the amount to the Cuti column, not COMM.
        const commField = locCode === "23" ? "cuti" : "comm";

        // Check if this employee exists in processedData (has regular payroll)
        // Match by NAME: commission recorded under any sibling id belongs to a worker who
        // may already have a (combined) payroll row under a different sibling id.
        const hasRegularPayroll = processedData.some(
          (e) => e.staff_name === row.staff_name,
        );
        // Commission for a worker WITH a payroll is already folded into that payroll row's
        // C/I/O (and Cuti for loc 23) by the main query's by-name aggregation. Skip it here
        // so we don't create a duplicate commission-only row or double-count totals.
        if (hasRegularPayroll) return;

        // Only process for commission locations (16-24)
        if (locationData[locCode]) {
          // Find if employee already exists in this location
          const existingEmployee = locationData[locCode].employees.find(
            (e) => e.staff_id === row.employee_id,
          );

          if (!existingEmployee) {
            // Find employee base data from processed data
            const baseEmp = processedData.find(
              (e) => e.staff_id === row.employee_id,
            );

            const jumlah = commAmount - midMonthAmount;
            const setelahDigenapkan = Math.ceil(jumlah);
            const digenapkan = setelahDigenapkan - jumlah;
            const bankIncome = locCode === "23" ? 0 : commAmount;
            const bankMidMonthAmount =
              bankIncome > 0 ? midMonthMap.get(row.employee_id) || 0 : 0;
            const bankSetelahDigenapkan =
              bankIncome > 0
                ? Math.ceil(bankIncome - bankMidMonthAmount)
                : 0;

            const commissionEmployeeData = {
              employee_payroll_id: baseEmp?.employee_payroll_id || null,
              staff_id: row.employee_id,
              staff_name: row.staff_name,
              ic_no: row.ic_no,
              bank_account_number: row.bank_account_number,
              payment_preference: row.payment_preference,
              location_code: locCode,
              gaji: 0,
              ot: 0,
              bonus: 0,
              comm: commField === "comm" ? commAmount : 0,
              cuti: commField === "cuti" ? commAmount : 0,
              gaji_kasar: commAmount,
              epf_majikan: 0,
              epf_pekerja: 0,
              socso_majikan: 0,
              socso_pekerja: 0,
              sip_majikan: 0,
              sip_pekerja: 0,
              pcb: 0,
              gaji_bersih: commAmount,
              setengah_bulan: midMonthAmount,
              jumlah: jumlah,
              digenapkan: digenapkan,
              setelah_digenapkan: setelahDigenapkan,
              // For Bank/Pinjam tabs
              gaji_genap: bankSetelahDigenapkan,
              total_pinjam: 0,
              pinjam_details: [],
              final_total: bankSetelahDigenapkan,
              net_pay: commAmount,
              mid_month_amount: midMonthAmount,
            };

            locationData[locCode].employees.push(commissionEmployeeData);
            locationData[locCode].totals[commField] += commAmount;
            locationData[locCode].totals.gaji_kasar += commAmount;
            locationData[locCode].totals.gaji_bersih += commAmount;
            locationData[locCode].totals.setengah_bulan += midMonthAmount;
            locationData[locCode].totals.jumlah += jumlah;
            locationData[locCode].totals.digenapkan += digenapkan;
            locationData[locCode].totals.setelah_digenapkan +=
              setelahDigenapkan;

            // Track commission-only employees for main data response
            if (!hasRegularPayroll) {
              // Check if already tracked (multiple commission entries for same employee)
              const existingCommOnly = commissionOnlyEmployees.find(
                (e) => e.staff_id === row.employee_id,
              );
              if (!existingCommOnly) {
                commissionOnlyEmployees.push(commissionEmployeeData);
                commissionOnlyBankIncome.set(row.employee_id, bankIncome);
                // Add to grand totals for commission-only employees
                grandTotals[commField] += commAmount;
                grandTotals.gaji_kasar += commAmount;
                grandTotals.gaji_bersih += commAmount;
                grandTotals.setengah_bulan += midMonthAmount;
                grandTotals.jumlah += jumlah;
                grandTotals.digenapkan += digenapkan;
                grandTotals.setelah_digenapkan += setelahDigenapkan;
              } else {
                // Update existing commission-only employee
                const previousDigenapkan = existingCommOnly.digenapkan || 0;
                const previousSetelahDigenapkan =
                  existingCommOnly.setelah_digenapkan || 0;
                existingCommOnly[commField] += commAmount;
                existingCommOnly.gaji_kasar += commAmount;
                existingCommOnly.gaji_bersih += commAmount;
                existingCommOnly.jumlah =
                  existingCommOnly.gaji_bersih -
                  existingCommOnly.setengah_bulan;
                existingCommOnly.setelah_digenapkan = Math.ceil(
                  existingCommOnly.jumlah,
                );
                existingCommOnly.digenapkan =
                  existingCommOnly.setelah_digenapkan -
                  existingCommOnly.jumlah;
                const bankIncome =
                  (commissionOnlyBankIncome.get(row.employee_id) || 0) +
                  (locCode === "23" ? 0 : commAmount);
                const bankMidMonthAmount =
                  bankIncome > 0 ? midMonthMap.get(row.employee_id) || 0 : 0;
                commissionOnlyBankIncome.set(row.employee_id, bankIncome);
                existingCommOnly.gaji_genap =
                  bankIncome > 0
                    ? Math.ceil(bankIncome - bankMidMonthAmount)
                    : 0;
                existingCommOnly.final_total = existingCommOnly.gaji_genap;
                existingCommOnly.mid_month_amount = bankMidMonthAmount;
                existingCommOnly.net_pay = existingCommOnly.gaji_bersih;
                // Update grand totals
                grandTotals[commField] += commAmount;
                grandTotals.gaji_kasar += commAmount;
                grandTotals.gaji_bersih += commAmount;
                grandTotals.jumlah += commAmount;
                grandTotals.digenapkan +=
                  existingCommOnly.digenapkan - previousDigenapkan;
                grandTotals.setelah_digenapkan +=
                  existingCommOnly.setelah_digenapkan -
                  previousSetelahDigenapkan;
              }
            }
          } else {
            // Add to existing employee's commission (or Cuti for location 23)
            existingEmployee[commField] += commAmount;
            existingEmployee.gaji_kasar += commAmount;
            existingEmployee.gaji_bersih += commAmount;
            existingEmployee.jumlah =
              existingEmployee.gaji_bersih - existingEmployee.setengah_bulan;

            locationData[locCode].totals[commField] += commAmount;
            locationData[locCode].totals.gaji_kasar += commAmount;
            locationData[locCode].totals.gaji_bersih += commAmount;
            locationData[locCode].totals.jumlah += commAmount;
          }
        }
      });

      // Convert locationData object to array for response
      const locationsArray = allLocations.map((loc) => locationData[loc]);

      // Get unique employees for Bank/Pinjam tabs (avoid duplicates from dual-location)
      // Include both regular payroll employees and commission-only employees
      const uniqueEmployeesForBankPinjam = (() => {
        const seen = new Set();
        const result = [];

        // First add regular payroll employees
        processedData.forEach((emp) => {
          if (!seen.has(emp.staff_id)) {
            seen.add(emp.staff_id);
            result.push(emp);
          }
        });

        // Then add commission-only employees
        commissionOnlyEmployees.forEach((emp) => {
          if (!seen.has(emp.staff_id)) {
            seen.add(emp.staff_id);
            result.push(emp);
          }
        });

        return result;
      })();

      // Response with all data for all tabs
      return {
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
          pinjam_details: emp.pinjam_details || [],
          final_total: emp.final_total,
          net_pay: emp.net_pay,
          mid_month_amount: emp.mid_month_amount,
        })),
        total_records: uniqueEmployeesForBankPinjam.length,
        summary: {
          total_gaji_genap: uniqueEmployeesForBankPinjam.reduce(
            (sum, item) => sum + item.gaji_genap,
            0,
          ),
          total_pinjam: uniqueEmployeesForBankPinjam.reduce(
            (sum, item) => sum + item.total_pinjam,
            0,
          ),
          total_final: uniqueEmployeesForBankPinjam.reduce(
            (sum, item) => sum + item.final_total,
            0,
          ),
        },
        // Comprehensive salary data for the new Salary tab
        comprehensive: {
          year: yearInt,
          month: monthInt,
          locations: locationsArray,
          grand_totals: grandTotals,
        },
        // Individual employees data for Employee tab (deduplicated, sorted by name)
        employees: (() => {
          const seenEmployees = new Set();
          const result = [];

          // Add regular payroll employees
          processedData.forEach((emp) => {
            if (!seenEmployees.has(emp.staff_id)) {
              seenEmployees.add(emp.staff_id);
              result.push(emp);
            }
          });

          // Add commission-only employees
          commissionOnlyEmployees.forEach((emp) => {
            if (!seenEmployees.has(emp.staff_id)) {
              seenEmployees.add(emp.staff_id);
              result.push(emp);
            }
          });

          // Sort by staff_name alphabetically
          result.sort((a, b) =>
            (a.staff_name || "").localeCompare(b.staff_name || ""),
          );

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
            cuti: emp.cuti,
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
          processedData.forEach((emp) => {
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
          commissionOnlyEmployees.forEach((emp) => {
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
        })(),
      };
  }

  // Get comprehensive salary report data for all tabs (monthly)
  router.get("/", async (req, res) => {
    const { year, month } = req.query;

    // Validate required parameters
    if (!year || !month) {
      return res.status(400).json({
        message: "Year and month parameters are required",
      });
    }

    try {
      const result = await computeMonthlySalaryReport(
        pool,
        parseInt(year),
        parseInt(month),
      );
      res.json(result);
    } catch (error) {
      console.error("Error fetching comprehensive salary report:", error);
      res.status(500).json({
        message: "Error fetching salary report",
        error: error.message,
      });
    }
  });

  // Short-lived per-year cache of the 12 monthly reports. Computing them is the heavy
  // part (~2s), shared by "/yearly", "/annual", and the paginated "/annual-breakdown",
  // so caching makes page navigation feel instant. The TTL bounds staleness, and any
  // request with ?refresh=true rebuilds it (the UI's Refresh button uses that), so the
  // user can always force fresh numbers after reprocessing payroll.
  const YEARLY_REPORTS_TTL_MS = 2 * 60 * 1000; // 2 minutes
  const yearlyReportsCache = new Map(); // yearInt -> { data, expires }

  // Run computeMonthlySalaryReport for all 12 months of a year (in parallel), cached.
  // Shared by "/yearly" (for per-month rounding) and "/annual" (full summary).
  async function computeYearlyMonthlyReports(pool, yearInt, forceRefresh = false) {
    const cached = yearlyReportsCache.get(yearInt);
    if (!forceRefresh && cached && cached.expires > Date.now()) {
      return cached.data;
    }
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const data = await Promise.all(
      months.map((m) => computeMonthlySalaryReport(pool, yearInt, m)),
    );
    yearlyReportsCache.set(yearInt, {
      data,
      expires: Date.now() + YEARLY_REPORTS_TTL_MS,
    });
    return data;
  }

  // Get comprehensive salary report data for full year (aggregated across all months)
  router.get("/yearly", async (req, res) => {
    const { year } = req.query;

    // Validate required parameters
    if (!year) {
      return res.status(400).json({
        message: "Year parameter is required",
      });
    }

    const yearInt = parseInt(year);

    try {
      // Main comprehensive query to get all employee data with payroll details aggregated by year
      // Similar to monthly but groups across all months in the year
      const comprehensiveQuery = `
        WITH job_location_map AS (
          SELECT job_id, location_code
          FROM job_location_mappings
          WHERE is_active = true
        ),
        -- Exclusions: employee-job-location combinations to filter out
        employee_exclusions AS (
          SELECT employee_id, job_id, location_code
          FROM employee_job_location_exclusions
        ),
        -- Use stored monthly payroll rounding when available so yearly totals match monthly payrolls exactly.
        employee_monthly_rounded AS (
          SELECT
            ep.employee_id,
            ep.net_pay,
            COALESCE(mmp.amount, 0) as mid_month_amount,
            COALESCE(
              ep.setelah_digenapkan,
              CEIL(ep.net_pay - COALESCE(mmp.amount, 0))
            ) as setelah_digenapkan,
            COALESCE(
              ep.digenapkan,
              COALESCE(
                ep.setelah_digenapkan,
                CEIL(ep.net_pay - COALESCE(mmp.amount, 0))
              ) - (ep.net_pay - COALESCE(mmp.amount, 0))
            ) as digenapkan
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          LEFT JOIN mid_month_payrolls mmp ON mmp.employee_id = ep.employee_id
            AND mmp.year = mp.year AND mmp.month = mp.month
          WHERE mp.year = $1
        ),
        -- Aggregate the per-month calculated values by employee
        employee_yearly_rounded AS (
          SELECT
            employee_id,
            SUM(setelah_digenapkan) as total_setelah_digenapkan,
            SUM(digenapkan) as total_digenapkan
          FROM employee_monthly_rounded
          GROUP BY employee_id
        ),
        -- Base payroll data aggregated by employee for the year
        employee_payroll_base AS (
          SELECT
            ep.employee_id,
            s.id as staff_id,
            s.name as staff_name,
            s.ic_no,
            s.bank_account_number,
            s.payment_preference,
            SUM(ep.gross_pay) as gross_pay,
            SUM(ep.net_pay) as net_pay,
            -- Use per-month digenapkan values (ensures yearly = sum of monthly totals)
            COALESCE(eyr.total_digenapkan, 0) as total_digenapkan,
            COALESCE(eyr.total_setelah_digenapkan, 0) as total_setelah_digenapkan,
            -- Use the most recent job_type for location mapping
            (ARRAY_AGG(ep.job_type ORDER BY mp.month DESC))[1] as job_type,
            (ARRAY_AGG(ep.section ORDER BY mp.month DESC))[1] as section,
            -- Use Head's job location if head_staff_id is set, otherwise use direct job location
            COALESCE(
              (ARRAY_AGG(head_jlm.location_code ORDER BY mp.month DESC))[1],
              (ARRAY_AGG(jlm.location_code ORDER BY mp.month DESC))[1]
            ) as job_location_code,
            -- Reporting-location source: the HEAD's first direct staffs.location entry
            -- (amounts follow the HEAD), falling back to the employee's own first direct
            -- location. job_location_mappings is an incentive bucket (mostly '18'), so it
            -- is only a last resort in employee_all_locations below.
            (ARRAY_AGG(COALESCE(NULLIF(head_s.location->>0, ''), NULLIF(s.location->>0, '')) ORDER BY mp.month DESC))[1] as head_direct_location
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
          -- Join with pre-calculated yearly rounded values
          LEFT JOIN employee_yearly_rounded eyr ON eyr.employee_id = ep.employee_id
          WHERE mp.year = $1
          AND (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)
          GROUP BY ep.employee_id, s.id, s.name, s.ic_no, s.bank_account_number, s.payment_preference,
                   eyr.total_digenapkan, eyr.total_setelah_digenapkan
        ),
        -- Each employee reports under exactly ONE location so location subtotals
        -- reconcile to the (employee-deduped) grand total. Per the confirmed business
        -- rule "amounts follow the HEAD's location", the priority is:
        --   1) the HEAD's first direct staffs.location (head_direct_location already
        --      falls back to the employee's own first direct location);
        --   2) the job location (mostly the '18' incentive bucket) when no direct
        --      location exists, unless that combo is explicitly excluded;
        --   3) the '02' fallback.
        employee_all_locations AS (
          SELECT
            epb.*,
            COALESCE(
              epb.head_direct_location,
              CASE
                WHEN epb.job_location_code IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM employee_exclusions ex
                    WHERE ex.employee_id = epb.employee_id
                      AND ex.job_id = epb.job_type
                      AND ex.location_code = epb.job_location_code
                  )
                THEN epb.job_location_code
                ELSE NULL
              END,
              '02'
            ) as location_code,
            'reporting' as location_source
          FROM employee_payroll_base epb
        ),
        -- Exactly one row per employee (the single reporting location above).
        employee_base_data AS (
          SELECT DISTINCT ON (employee_id)
            employee_id,
            staff_id,
            staff_name,
            ic_no,
            bank_account_number,
            payment_preference,
            location_code,
            gross_pay,
            net_pay,
            total_digenapkan,
            total_setelah_digenapkan,
            job_type,
            section,
            location_source
          FROM employee_all_locations
          ORDER BY employee_id, location_code
        ),
        payroll_items_data AS (
          SELECT
            ep.employee_id,
            pi.pay_code_id,
            CASE
              WHEN lower(btrim(coalesce(pi.description, ''))) = 'cuti tahunan' THEN 'cuti tahunan'
              ELSE NULL
            END as description,
            -- Keep the yearly report as the sum of the monthly consolidated
            -- amounts, including when a pay rate changes between months.
            CASE
              WHEN COALESCE(pi.rate_unit, pc.rate_unit) IN ('Percent', 'Fixed')
                THEN ROUND(SUM(pi.amount), 2)
              ELSE ROUND(
                ROUND(COALESCE(pi.rate, 0), 2) *
                SUM(COALESCE(pi.quantity, 0) + COALESCE(pi.foc_units, 0)),
                2
              )
            END as amount,
            pc.pay_type,
            pc.report_column,
            COALESCE(pi.rate_unit, pc.rate_unit) as rate_unit
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN payroll_items pi ON ep.id = pi.employee_payroll_id
          LEFT JOIN pay_codes pc ON pi.pay_code_id = pc.id
          WHERE mp.year = $1
            -- Exclude leave-day daily work items (see comment in the monthly
            -- payroll_items_data CTE) so the breakdown matches gross_pay.
            AND NOT (
              pi.work_log_type = 'daily'
              AND pi.source_date IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM leave_records lr2
                JOIN staffs s2 ON lr2.employee_id = s2.id
                WHERE s2.name = (SELECT name FROM staffs WHERE id = ep.employee_id)
                  AND lr2.status = 'approved'
                  AND lr2.leave_date = pi.source_date
              )
            )
          GROUP BY
            ep.employee_id,
            mp.month,
            pi.pay_code_id,
            pi.rate,
            pc.pay_type,
            pc.report_column,
            COALESCE(pi.rate_unit, pc.rate_unit),
            CASE
              WHEN lower(btrim(coalesce(pi.description, ''))) = 'cuti tahunan' THEN 'cuti tahunan'
              ELSE NULL
            END
        ),
        deductions_data AS (
          SELECT
            ep.employee_id,
            pd.deduction_type,
            SUM(pd.employee_amount) as employee_amount,
            SUM(pd.employer_amount) as employer_amount
          FROM employee_payrolls ep
          JOIN monthly_payrolls mp ON ep.monthly_payroll_id = mp.id
          JOIN payroll_deductions pd ON ep.id = pd.employee_payroll_id
          WHERE mp.year = $1
          GROUP BY ep.employee_id, pd.deduction_type
        ),
        -- Mid-month aggregated by NAME so advances recorded under any sibling ID
        -- (multi-ID staff) roll up to the person, mirroring pinjam and the combined payroll.
        mid_month_by_name AS (
          SELECT s.name AS staff_name, COALESCE(SUM(mmp.amount), 0) as mid_month_amount
          FROM mid_month_payrolls mmp
          JOIN staffs s ON mmp.employee_id = s.id
          WHERE mmp.year = $1
          GROUP BY s.name
        ),
        mid_month_rep AS (
          SELECT staff_name, MIN(employee_id) AS employee_id
          FROM (SELECT DISTINCT employee_id, staff_name FROM employee_base_data) d
          GROUP BY staff_name
        ),
        mid_month_data AS (
          SELECT mmr.employee_id, mmbn.mid_month_amount
          FROM mid_month_rep mmr
          JOIN mid_month_by_name mmbn ON mmbn.staff_name = mmr.staff_name
        ),
        commission_data AS (
          SELECT
            cr.employee_id,
            cr.location_code,
            lower(btrim(coalesce(cr.description, ''))) as desc_key,
            COALESCE(SUM(cr.amount), 0) as commission_amount,
            COALESCE(SUM(CASE WHEN COALESCE(cr.is_advance, true) THEN cr.amount ELSE 0 END), 0) as advance_amount
          FROM commission_records cr
          WHERE EXTRACT(YEAR FROM cr.commission_date) = $1
          GROUP BY cr.employee_id, cr.location_code, lower(btrim(coalesce(cr.description, '')))
        ),
        others_data AS (
          -- Kerja Luar (others) earnings carry pay_code/description/pay_type/rate_unit so they
          -- can be bucketed into GAJI / BONUS / C-I-O / CUTI like regular payroll items.
          SELECT
            orec.employee_id,
            orec.pay_code_id,
            -- Per-entry override (orec) wins over the pay-code-level override (pc),
            -- which in turn wins over the automatic bucketing rule below.
            COALESCE(orec.report_column, pc.report_column) as report_column,
            lower(btrim(coalesce(orec.description, ''))) as desc_key,
            COALESCE(pc.pay_type, 'Tambahan') as pay_type,
            COALESCE(orec.rate_unit, pc.rate_unit) as rate_unit,
            COALESCE(SUM(orec.amount), 0) as others_amount
          FROM others_records orec
          LEFT JOIN pay_codes pc ON orec.pay_code_id = pc.id
          WHERE EXTRACT(YEAR FROM orec.record_date) = $1
          GROUP BY orec.employee_id, orec.pay_code_id, orec.report_column, pc.report_column, lower(btrim(coalesce(orec.description, ''))), pc.pay_type, COALESCE(orec.rate_unit, pc.rate_unit)
        ),
        leave_data AS (
          SELECT
            lr.employee_id,
            lr.leave_type,
            COALESCE(SUM(lr.amount_paid), 0) as leave_amount
          FROM leave_records lr
          WHERE EXTRACT(YEAR FROM lr.leave_date) = $1
            AND lr.status = 'approved'
          GROUP BY lr.employee_id, lr.leave_type
        ),
        pinjam_by_name AS (
          -- Aggregate pinjam by employee NAME so amounts recorded under any
          -- sibling ID (multi-ID staff) roll up to the person, mirroring how
          -- the combined payroll is keyed.
          SELECT s.name AS staff_name, COALESCE(SUM(pr.amount), 0) as total_pinjam,
                 json_agg(json_build_object(
                   'description', COALESCE(NULLIF(btrim(pr.description), ''), 'Pinjam'),
                   'amount', pr.amount
                 ) ORDER BY pr.amount DESC) AS pinjam_details
          FROM pinjam_records pr
          JOIN staffs s ON pr.employee_id = s.id
          WHERE pr.year = $1
          AND pr.pinjam_type = 'monthly'
          GROUP BY s.name
        ),
        -- Pick one representative payroll ID per name (one that actually has a
        -- report row) so the name-aggregated pinjam is attributed exactly once
        -- across the year's sibling-ID rows (avoids double counting).
        pinjam_rep AS (
          SELECT staff_name, MIN(employee_id) AS employee_id
          FROM (SELECT DISTINCT employee_id, staff_name FROM employee_base_data) d
          GROUP BY staff_name
        ),
        pinjam_yearly_data AS (
          SELECT pr.employee_id, pbn.total_pinjam, pbn.pinjam_details
          FROM pinjam_rep pr
          JOIN pinjam_by_name pbn ON pbn.staff_name = pr.staff_name
        )
        SELECT
          ebd.*,
          COALESCE(mmd.mid_month_amount, 0) as mid_month_amount,
          COALESCE(pmd.total_pinjam, 0) as total_pinjam,
          COALESCE(pmd.pinjam_details, '[]'::json) as pinjam_details,
          -- GAJI = regular wage. Worker WITH an Hour/Day base: all non-piece work (base + hourly
          -- maintenance/Sunday). Worker with NO hourly base (pure piece / office salary): Base +
          -- production F/HARIAN codes (FULL_*). FULL and HADIR_MEETING always count as GAJI for
          -- all workers; other allowances/incentives remain C/I/O. Kerja-Luar matched by name.
          COALESCE(
            (SELECT SUM(amount) FROM payroll_items_data pid
             WHERE pid.employee_id = ebd.employee_id
               AND (pid.report_column = 'GAJI' OR (pid.report_column IS NULL
               AND COALESCE(pid.pay_type, 'Tambahan') <> 'Overtime'
               AND (pid.pay_code_id IS NULL OR pid.pay_code_id NOT IN ('BONUS', 'IXT', 'ADD_COMM', 'T-SALESMAN', 'IKUT_BX', 'JAGA_GATE', 'BH_JG_FORKLIFT', 'BH_SUSUN', 'T_KERJA'))
               AND lower(btrim(coalesce(pid.description, ''))) <> 'cuti tahunan'
               AND (
                 pid.pay_code_id IN ('FULL', 'HADIR_MEETING')
                 OR (EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND COALESCE(pid.rate_unit, 'Hour') IN ('Hour', 'Day', 'Fixed'))
                 OR (NOT EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND COALESCE(pid.pay_type, 'Tambahan') = 'Base')
                 OR (NOT EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND pid.pay_code_id LIKE 'FULL!_%' ESCAPE '!')
               )))), 0
          ) + COALESCE(
            (SELECT SUM(others_amount) FROM others_data od
             WHERE od.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND (od.report_column = 'GAJI' OR (od.report_column IS NULL
               AND od.pay_type <> 'Overtime'
               AND (od.pay_code_id IS NULL OR od.pay_code_id NOT IN ('BONUS', 'IXT', 'ADD_COMM', 'T-SALESMAN', 'IKUT_BX', 'JAGA_GATE', 'BH_JG_FORKLIFT', 'BH_SUSUN', 'T_KERJA'))
               AND od.desc_key <> 'cuti tahunan'
               AND (
                 od.pay_code_id IN ('FULL', 'HADIR_MEETING')
                 OR (EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND COALESCE(od.rate_unit, 'Hour') IN ('Hour', 'Day', 'Fixed'))
                 OR (NOT EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND od.pay_type = 'Base')
               )))), 0
          ) as gaji_pay,
          -- OT column = overtime from payroll items only (excl. Cuti-Tahunan)
          COALESCE(
            (SELECT SUM(amount) FROM payroll_items_data pid
             WHERE pid.employee_id = ebd.employee_id
               AND (pid.report_column = 'OT' OR (pid.report_column IS NULL
               AND COALESCE(pid.pay_type, 'Tambahan') = 'Overtime'
               AND lower(btrim(coalesce(pid.description, ''))) <> 'cuti tahunan'))), 0
          ) as overtime_pay,
          -- Overtime recorded as Kerja Luar (others), by name - folded into BONUS with payroll OT
          COALESCE(
            (SELECT SUM(others_amount) FROM others_data od
             WHERE od.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND (od.report_column = 'OT' OR (od.report_column IS NULL
               AND od.pay_type = 'Overtime'
               AND od.desc_key <> 'cuti tahunan'))), 0
          ) as others_overtime,
          -- C/I/O = incentive/allowance codes (IXT/ADD_COMM/T-SALESMAN/IKUT_BX/...) +
          -- everything that is NOT the worker's GAJI: piece-rate for an hourly worker, or any
          -- non-Base extra for a pure-piece worker. Excl. Overtime, BONUS code, Cuti-Tahunan,
          -- and FULL/HADIR_MEETING (always GAJI).
          COALESCE(
            (SELECT SUM(amount) FROM payroll_items_data pid
             WHERE pid.employee_id = ebd.employee_id
               AND (pid.report_column = 'CIO' OR (pid.report_column IS NULL
               AND COALESCE(pid.pay_type, 'Tambahan') <> 'Overtime'
               AND (pid.pay_code_id IS NULL OR pid.pay_code_id NOT IN ('BONUS', 'FULL', 'HADIR_MEETING'))
               AND lower(btrim(coalesce(pid.description, ''))) <> 'cuti tahunan'
               AND (
                 pid.pay_code_id IN ('IXT', 'ADD_COMM', 'T-SALESMAN', 'IKUT_BX', 'JAGA_GATE', 'BH_JG_FORKLIFT', 'BH_SUSUN', 'T_KERJA')
                 OR (EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND COALESCE(pid.rate_unit, 'Hour') NOT IN ('Hour', 'Day', 'Fixed'))
                 OR (NOT EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND COALESCE(pid.pay_type, 'Tambahan') <> 'Base'
                   AND (pid.pay_code_id IS NULL OR pid.pay_code_id NOT LIKE 'FULL!_%' ESCAPE '!'))
               )))), 0
          ) + COALESCE(
            (SELECT SUM(others_amount) FROM others_data od
             WHERE od.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND (od.report_column = 'CIO' OR (od.report_column IS NULL
               AND od.pay_type <> 'Overtime'
               AND (od.pay_code_id IS NULL OR od.pay_code_id NOT IN ('BONUS', 'FULL', 'HADIR_MEETING'))
               AND od.desc_key <> 'cuti tahunan'
               AND (
                 od.pay_code_id IN ('IXT', 'ADD_COMM', 'T-SALESMAN', 'IKUT_BX', 'JAGA_GATE', 'BH_JG_FORKLIFT', 'BH_SUSUN', 'T_KERJA')
                 OR (EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND COALESCE(od.rate_unit, 'Hour') NOT IN ('Hour', 'Day', 'Fixed'))
                 OR (NOT EXISTS (SELECT 1 FROM payroll_items_data pidh WHERE pidh.employee_id = ebd.employee_id AND COALESCE(pidh.pay_type, 'Tambahan') = 'Base' AND COALESCE(pidh.rate_unit, 'Hour') IN ('Hour', 'Day'))
                   AND od.pay_type <> 'Base')
               )))), 0
          ) as piece_insentif_pay,
          -- Cuti Tahunan recorded via payroll items / Kerja-Luar (by name) -> shown under CUTI
          COALESCE(
            (SELECT SUM(amount) FROM payroll_items_data pid
             WHERE pid.employee_id = ebd.employee_id
               AND (pid.report_column = 'CUTI' OR (pid.report_column IS NULL
               AND lower(btrim(coalesce(pid.description, ''))) = 'cuti tahunan'))), 0
          ) + COALESCE(
            (SELECT SUM(others_amount) FROM others_data od
             WHERE od.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND (od.report_column = 'CUTI' OR (od.report_column IS NULL
               AND od.desc_key = 'cuti tahunan'))), 0
          ) as cuti_tahunan_other_total,
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
          -- Commission/incentive at a location (C/I/O), excl. Cuti-Tahunan (loc 23 or desc); by name across siblings
          COALESCE(
            (SELECT SUM(commission_amount) FROM commission_data cd
             WHERE cd.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND cd.location_code IS NOT NULL
               AND NOT (cd.location_code = '23' OR cd.desc_key = 'cuti tahunan')), 0
          ) as commission_total,
          COALESCE(
            (SELECT SUM(advance_amount) FROM commission_data cd
             WHERE cd.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND cd.location_code IS NOT NULL), 0
          ) as commission_advance_total,
          -- Cuti Tahunan recorded as commission/advance (loc 23 or desc 'cuti tahunan') - shown under Cuti
          COALESCE(
            (SELECT SUM(commission_amount) FROM commission_data cd
             WHERE cd.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
               AND (cd.location_code = '23' OR cd.desc_key = 'cuti tahunan')), 0
          ) as cuti_tahunan_commission_total,
          (
            COALESCE(
              (SELECT SUM(commission_amount) FROM commission_data cd
               WHERE cd.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name) AND cd.location_code IS NULL), 0
            ) +
            COALESCE(
              (SELECT SUM(amount) FROM payroll_items_data pid
               WHERE pid.employee_id = ebd.employee_id
                 AND (pid.report_column = 'BONUS' OR (pid.report_column IS NULL
                 AND pid.pay_code_id = 'BONUS'))), 0
            ) +
            COALESCE(
              (SELECT SUM(others_amount) FROM others_data od
               WHERE od.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)
                 AND (od.report_column = 'BONUS' OR (od.report_column IS NULL AND od.pay_code_id = 'BONUS'))), 0
            )
          ) as bonus_total,
          COALESCE(
            (SELECT SUM(advance_amount) FROM commission_data cd
             WHERE cd.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name) AND cd.location_code IS NULL), 0
          ) as bonus_advance_total,
          -- Leave data (by name across siblings): combine all cuti types into a single Cuti figure
          COALESCE(
            (SELECT SUM(leave_amount) FROM leave_data ld
             WHERE ld.employee_id IN (SELECT id FROM staffs WHERE name = ebd.staff_name)), 0
          ) as leave_total
        FROM employee_base_data ebd
        LEFT JOIN mid_month_data mmd ON ebd.employee_id = mmd.employee_id
        LEFT JOIN pinjam_yearly_data pmd ON ebd.employee_id = pmd.employee_id
        ORDER BY ebd.staff_name
      `;

      const result = await pool.query(comprehensiveQuery, [yearInt]);

      // 12 monthly reports — used below to replace the annual-rounded
      // DIGENAPKAN / SETELAH DIGENAPKAN with the sum of each month's rounded
      // figure, so yearly numbers match the monthly view and the legacy report.
      const monthlyReports = await computeYearlyMonthlyReports(
        pool,
        yearInt,
        req.query.refresh === "true",
      );

      // Process the data for different views
      const processedData = result.rows.map((row, index) => {
        // GAJI = regular wage (non-OT Hour/Day work from payroll + Kerja Luar).
        const gaji = parseFloat(row.gaji_pay || 0);
        const gajiKasar = parseFloat(row.gross_pay || 0);
        // Only advance commission/bonus records are already deducted from net_pay in DB.
        // Others (Kerja Luar OT) is a regular earning, NOT an advance, so it is NOT added back here.
        const commissionAdvance =
          parseFloat(row.commission_advance_total || 0) +
          parseFloat(row.bonus_advance_total || 0);
        // GAJI BERSIH = net_pay + commission (add back to show true net before advances)
        const gajiBersih = parseFloat(row.net_pay || 0) + commissionAdvance;
        // SALARY REPORT JUMLAH / S.DIGENAP show the TOTAL earned salary, INCLUDING amounts
        // already paid in advance (commission/bonus advances) - derived from gaji_bersih.
        // NOTE: this rounds the annual figure, so it can differ by a few ringgit from the
        // sum of the 12 monthly S.DIGENAP values. The Bank/Pinjam tabs below keep the
        // summed stored take-home (advance already deducted) to match Payroll Details.
        const jumlah =
          gajiBersih - parseFloat(row.mid_month_amount || 0);
        const setelah_digenapkan = Math.ceil(jumlah);
        const digenapkan = setelah_digenapkan - jumlah;
        // Actual take-home (advance already deducted), summed from stored monthly rounding.
        const takeHomeSetelah = parseFloat(row.total_setelah_digenapkan || 0);
        const totalPinjam = parseFloat(row.total_pinjam || 0);

        return {
          no: index + 1,
          employee_payroll_id: null, // Not applicable for yearly aggregation
          staff_id: row.staff_id,
          staff_name: row.staff_name,
          ic_no: row.ic_no,
          bank_account_number: row.bank_account_number,
          payment_preference: row.payment_preference,
          location_code: row.location_code,
          location_source: row.location_source,
          job_type: row.job_type,
          section: row.section,
          // Salary tab data
          gaji: gaji,
          // OT = all overtime (payroll + Kerja Luar). It is shown only here.
          ot:
            parseFloat(row.overtime_pay || 0) +
            parseFloat(row.others_overtime || 0),
          // BONUS = real bonuses only (BONUS paycode + loc-null commission). OT is NOT folded in.
          bonus: parseFloat(row.bonus_total || 0),
          // COMM/INS/LAIN = location commission (excl. Cuti Tahunan loc 23)
          // + piece-rate work (Bag/Bundle/Kg/Trip/Bill/Percent) + Fixed insentif (IXT), from payroll + Kerja Luar
          comm:
            parseFloat(row.commission_total || 0) +
            parseFloat(row.piece_insentif_pay || 0),
          // CUTI = all 4 leave types + Cuti Tahunan recorded as commission (loc 23).
          // Display-only: does not feed gaji_bersih/jumlah (same as comm).
          cuti:
            parseFloat(row.leave_total || 0) +
            parseFloat(row.cuti_tahunan_commission_total || 0) +
            parseFloat(row.cuti_tahunan_other_total || 0),
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
          // Bank/Pinjam tab data (actual take-home: advance already deducted)
          gaji_genap: takeHomeSetelah,
          total_pinjam: totalPinjam,
          pinjam_details: row.pinjam_details || [],
          final_total: takeHomeSetelah - totalPinjam,
          net_pay: parseFloat(row.net_pay || 0),
          mid_month_amount: parseFloat(row.mid_month_amount || 0),
        };
      });

      // Group data by location for comprehensive salary view
      const locationData = {};
      const grandTotals = {
        gaji: 0,
        ot: 0,
        bonus: 0,
        comm: 0,
        cuti: 0,
        gaji_kasar: 0,
        epf_majikan: 0,
        epf_pekerja: 0,
        socso_majikan: 0,
        socso_pekerja: 0,
        sip_majikan: 0,
        sip_pekerja: 0,
        pcb: 0,
        gaji_bersih: 0,
        setengah_bulan: 0,
        jumlah: 0,
        digenapkan: 0,
        setelah_digenapkan: 0,
      };
      const processedUniqueEmployees = new Set();

      // Fetch all locations from database
      const locationsResult = await pool.query(
        "SELECT id FROM locations ORDER BY id",
      );
      const allLocations = locationsResult.rows.map((r) => r.id);
      allLocations.forEach((loc) => {
        locationData[loc] = {
          location: loc,
          employees: [],
          totals: {
            gaji: 0,
            ot: 0,
            bonus: 0,
            comm: 0,
            cuti: 0,
            gaji_kasar: 0,
            epf_majikan: 0,
            epf_pekerja: 0,
            socso_majikan: 0,
            socso_pekerja: 0,
            sip_majikan: 0,
            sip_pekerja: 0,
            pcb: 0,
            gaji_bersih: 0,
            setengah_bulan: 0,
            jumlah: 0,
            digenapkan: 0,
            setelah_digenapkan: 0,
          },
        };
      });

      // Process each employee and group by location
      processedData.forEach((employee) => {
        const loc = employee.location_code || "02";

        if (locationData[loc]) {
          locationData[loc].employees.push(employee);
          Object.keys(locationData[loc].totals).forEach((key) => {
            locationData[loc].totals[key] += employee[key] || 0;
          });
        }

        // Add to grand totals ONLY ONCE per unique employee
        if (!processedUniqueEmployees.has(employee.staff_id)) {
          processedUniqueEmployees.add(employee.staff_id);
          Object.keys(grandTotals).forEach((key) => {
            grandTotals[key] += employee[key] || 0;
          });
        }
      });

      // Handle special location data (Commissions by location_code)
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
          AND cr.location_code IS NOT NULL
        GROUP BY cr.employee_id, cr.location_code, s.name, s.ic_no, s.bank_account_number, s.payment_preference
      `;
      const commissionResult = await pool.query(commissionQuery, [yearInt]);

      // Get mid-month data for commission location employees
      const midMonthQuery = `
        SELECT employee_id, COALESCE(SUM(amount), 0) as mid_month_amount
        FROM mid_month_payrolls
        WHERE year = $1
        GROUP BY employee_id
      `;
      const midMonthResult = await pool.query(midMonthQuery, [yearInt]);
      const midMonthMap = new Map();
      midMonthResult.rows.forEach((row) => {
        midMonthMap.set(row.employee_id, parseFloat(row.mid_month_amount || 0));
      });

      // Track commission-only employees
      const commissionOnlyEmployees = [];
      const commissionOnlyBankIncome = new Map();

      // Group commissions by location (16-24)
      // Process normal commission before Location 23 so mixed employees retain the
      // mid-month deduction in their combined employee total.
      const sortedCommissionRows = commissionResult.rows
        .slice()
        .sort(
          (a, b) =>
            Number(a.location_code === "23") - Number(b.location_code === "23"),
        );
      sortedCommissionRows.forEach((row) => {
        const locCode = row.location_code || "18";
        const commAmount = parseFloat(row.commission_amount || 0);
        // Cuti Tahunan (loc 23) is report-only for commission-only employees: it was
        // paid already, so it does not offset the mid-month advance or go to the bank.
        const midMonthAmount =
          locCode === "23" ? 0 : midMonthMap.get(row.employee_id) || 0;
        // Location 23 = Cuti Tahunan: route the amount to the Cuti column, not COMM.
        const commField = locCode === "23" ? "cuti" : "comm";

        // Match by NAME: commission recorded under any sibling id belongs to a worker who
        // may already have a (combined) payroll row under a different sibling id.
        const hasRegularPayroll = processedData.some(
          (e) => e.staff_name === row.staff_name,
        );
        // Commission for a worker WITH a payroll is already folded into that payroll row's
        // C/I/O (and Cuti for loc 23) by the main query's by-name aggregation. Skip it here
        // so we don't create a duplicate commission-only row or double-count totals.
        if (hasRegularPayroll) return;

        if (locationData[locCode]) {
          const existingEmployee = locationData[locCode].employees.find(
            (e) => e.staff_id === row.employee_id,
          );

          if (!existingEmployee) {
            const jumlah = commAmount - midMonthAmount;
            const setelahDigenapkan = Math.ceil(jumlah);
            const digenapkan = setelahDigenapkan - jumlah;
            const bankIncome = locCode === "23" ? 0 : commAmount;
            const bankMidMonthAmount =
              bankIncome > 0 ? midMonthMap.get(row.employee_id) || 0 : 0;
            const bankSetelahDigenapkan =
              bankIncome > 0
                ? Math.ceil(bankIncome - bankMidMonthAmount)
                : 0;

            const commissionEmployeeData = {
              employee_payroll_id: null,
              staff_id: row.employee_id,
              staff_name: row.staff_name,
              ic_no: row.ic_no,
              bank_account_number: row.bank_account_number,
              payment_preference: row.payment_preference,
              location_code: locCode,
              gaji: 0,
              ot: 0,
              bonus: 0,
              comm: commField === "comm" ? commAmount : 0,
              cuti: commField === "cuti" ? commAmount : 0,
              gaji_kasar: commAmount,
              epf_majikan: 0,
              epf_pekerja: 0,
              socso_majikan: 0,
              socso_pekerja: 0,
              sip_majikan: 0,
              sip_pekerja: 0,
              pcb: 0,
              gaji_bersih: commAmount,
              setengah_bulan: midMonthAmount,
              jumlah: jumlah,
              digenapkan: digenapkan,
              setelah_digenapkan: setelahDigenapkan,
              gaji_genap: bankSetelahDigenapkan,
              total_pinjam: 0,
              pinjam_details: [],
              final_total: bankSetelahDigenapkan,
              net_pay: commAmount,
              mid_month_amount: midMonthAmount,
            };

            locationData[locCode].employees.push(commissionEmployeeData);
            locationData[locCode].totals[commField] += commAmount;
            locationData[locCode].totals.gaji_kasar += commAmount;
            locationData[locCode].totals.gaji_bersih += commAmount;
            locationData[locCode].totals.setengah_bulan += midMonthAmount;
            locationData[locCode].totals.jumlah += jumlah;
            locationData[locCode].totals.digenapkan += digenapkan;
            locationData[locCode].totals.setelah_digenapkan +=
              setelahDigenapkan;

            if (!hasRegularPayroll) {
              const existingCommOnly = commissionOnlyEmployees.find(
                (e) => e.staff_id === row.employee_id,
              );
              if (!existingCommOnly) {
                commissionOnlyEmployees.push(commissionEmployeeData);
                commissionOnlyBankIncome.set(row.employee_id, bankIncome);
                grandTotals[commField] += commAmount;
                grandTotals.gaji_kasar += commAmount;
                grandTotals.gaji_bersih += commAmount;
                grandTotals.setengah_bulan += midMonthAmount;
                grandTotals.jumlah += jumlah;
                grandTotals.digenapkan += digenapkan;
                grandTotals.setelah_digenapkan += setelahDigenapkan;
              } else {
                const previousDigenapkan = existingCommOnly.digenapkan || 0;
                const previousSetelahDigenapkan =
                  existingCommOnly.setelah_digenapkan || 0;
                existingCommOnly[commField] += commAmount;
                existingCommOnly.gaji_kasar += commAmount;
                existingCommOnly.gaji_bersih += commAmount;
                existingCommOnly.jumlah =
                  existingCommOnly.gaji_bersih -
                  existingCommOnly.setengah_bulan;
                existingCommOnly.setelah_digenapkan = Math.ceil(
                  existingCommOnly.jumlah,
                );
                existingCommOnly.digenapkan =
                  existingCommOnly.setelah_digenapkan -
                  existingCommOnly.jumlah;
                const bankIncome =
                  (commissionOnlyBankIncome.get(row.employee_id) || 0) +
                  (locCode === "23" ? 0 : commAmount);
                const bankMidMonthAmount =
                  bankIncome > 0 ? midMonthMap.get(row.employee_id) || 0 : 0;
                commissionOnlyBankIncome.set(row.employee_id, bankIncome);
                existingCommOnly.gaji_genap =
                  bankIncome > 0
                    ? Math.ceil(bankIncome - bankMidMonthAmount)
                    : 0;
                existingCommOnly.final_total = existingCommOnly.gaji_genap;
                existingCommOnly.mid_month_amount = bankMidMonthAmount;
                existingCommOnly.net_pay = existingCommOnly.gaji_bersih;
                grandTotals[commField] += commAmount;
                grandTotals.gaji_kasar += commAmount;
                grandTotals.gaji_bersih += commAmount;
                grandTotals.jumlah += commAmount;
                grandTotals.digenapkan +=
                  existingCommOnly.digenapkan - previousDigenapkan;
                grandTotals.setelah_digenapkan +=
                  existingCommOnly.setelah_digenapkan -
                  previousSetelahDigenapkan;
              }
            }
          } else {
            existingEmployee[commField] += commAmount;
            existingEmployee.gaji_kasar += commAmount;
            existingEmployee.gaji_bersih += commAmount;
            existingEmployee.jumlah =
              existingEmployee.gaji_bersih - existingEmployee.setengah_bulan;

            locationData[locCode].totals[commField] += commAmount;
            locationData[locCode].totals.gaji_kasar += commAmount;
            locationData[locCode].totals.gaji_bersih += commAmount;
            locationData[locCode].totals.jumlah += commAmount;
          }
        }
      });

      // "Fix everywhere": replace the annual-rounded DIGENAPKAN / SETELAH
      // DIGENAPKAN with the SUM of each month's rounded figure, so yearly
      // figures match the monthly view and the legacy paper report. All other
      // columns are already correct annual sums and are left untouched.
      //
      // Per-employee rounding (Employee tab rows): sum each month's per-employee
      // SETELAH DIGENAPKAN, then re-derive DIGENAPKAN against the annual jumlah.
      const monthlyRoundingByStaff = new Map();
      for (const rep of monthlyReports) {
        for (const e of rep.employees) {
          monthlyRoundingByStaff.set(
            e.staff_id,
            (monthlyRoundingByStaff.get(e.staff_id) || 0) +
              (e.setelah_digenapkan || 0),
          );
        }
      }
      const applyMonthlyRounding = (emp) => {
        const summed = monthlyRoundingByStaff.get(emp.staff_id);
        if (summed == null) return; // keep annual-ceil fallback if no monthly rows
        emp.setelah_digenapkan = summed;
        emp.digenapkan = summed - emp.jumlah;
      };
      processedData.forEach(applyMonthlyRounding);
      commissionOnlyEmployees.forEach(applyMonthlyRounding);

      // Per-location rounding (Location tab totals): sum each month's per-location
      // rounded figures. Correct even for employees split across multiple
      // locations, and identical to the "/annual" summary.
      const monthlyRoundingByLocation = new Map();
      for (const rep of monthlyReports) {
        for (const loc of rep.comprehensive.locations) {
          const cur = monthlyRoundingByLocation.get(loc.location) || {
            digenapkan: 0,
            setelah_digenapkan: 0,
          };
          cur.digenapkan += loc.totals.digenapkan || 0;
          cur.setelah_digenapkan += loc.totals.setelah_digenapkan || 0;
          monthlyRoundingByLocation.set(loc.location, cur);
        }
      }
      allLocations.forEach((loc) => {
        const summed = monthlyRoundingByLocation.get(loc) || {
          digenapkan: 0,
          setelah_digenapkan: 0,
        };
        locationData[loc].totals.digenapkan = summed.digenapkan;
        locationData[loc].totals.setelah_digenapkan = summed.setelah_digenapkan;
      });

      // Grand-total rounding: sum each month's employee-deduped grand totals.
      grandTotals.digenapkan = 0;
      grandTotals.setelah_digenapkan = 0;
      for (const rep of monthlyReports) {
        grandTotals.digenapkan += rep.comprehensive.grand_totals.digenapkan || 0;
        grandTotals.setelah_digenapkan +=
          rep.comprehensive.grand_totals.setelah_digenapkan || 0;
      }

      // Convert locationData object to array for response
      const locationsArray = allLocations.map((loc) => locationData[loc]);

      // Get unique employees for Bank/Pinjam tabs
      const uniqueEmployeesForBankPinjam = (() => {
        const seen = new Set();
        const result = [];

        processedData.forEach((emp) => {
          if (!seen.has(emp.staff_id)) {
            seen.add(emp.staff_id);
            result.push(emp);
          }
        });

        commissionOnlyEmployees.forEach((emp) => {
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
        month: null, // Indicates yearly aggregation
        // Original format for Bank/Pinjam tabs (unique employees only)
        data: uniqueEmployeesForBankPinjam.map((emp, index) => ({
          no: index + 1,
          staff_id: emp.staff_id,
          staff_name: emp.staff_name,
          payment_preference: emp.payment_preference,
          gaji_genap: emp.gaji_genap,
          total_pinjam: emp.total_pinjam,
          pinjam_details: emp.pinjam_details || [],
          final_total: emp.final_total,
          net_pay: emp.net_pay,
          mid_month_amount: emp.mid_month_amount,
        })),
        total_records: uniqueEmployeesForBankPinjam.length,
        summary: {
          total_gaji_genap: uniqueEmployeesForBankPinjam.reduce(
            (sum, item) => sum + item.gaji_genap,
            0,
          ),
          total_pinjam: uniqueEmployeesForBankPinjam.reduce(
            (sum, item) => sum + item.total_pinjam,
            0,
          ),
          total_final: uniqueEmployeesForBankPinjam.reduce(
            (sum, item) => sum + item.final_total,
            0,
          ),
        },
        // Comprehensive salary data for the new Salary tab
        comprehensive: {
          year: yearInt,
          month: null,
          locations: locationsArray,
          grand_totals: grandTotals,
        },
        // Individual employees data for Employee tab (deduplicated, sorted by name)
        employees: (() => {
          const seenEmployees = new Set();
          const result = [];

          processedData.forEach((emp) => {
            if (!seenEmployees.has(emp.staff_id)) {
              seenEmployees.add(emp.staff_id);
              result.push(emp);
            }
          });

          commissionOnlyEmployees.forEach((emp) => {
            if (!seenEmployees.has(emp.staff_id)) {
              seenEmployees.add(emp.staff_id);
              result.push(emp);
            }
          });

          result.sort((a, b) =>
            (a.staff_name || "").localeCompare(b.staff_name || ""),
          );

          return result.map((emp, index) => ({
            no: index + 1,
            employee_payroll_id: emp.employee_payroll_id,
            staff_id: emp.staff_id,
            staff_name: emp.staff_name,
            gaji: emp.gaji,
            ot: emp.ot,
            bonus: emp.bonus,
            comm: emp.comm,
            cuti: emp.cuti,
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
        // Bank table data (unique employees only)
        bank_data: (() => {
          const seenEmployees = new Set();
          const result = [];

          processedData.forEach((emp) => {
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

          commissionOnlyEmployees.forEach((emp) => {
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
        })(),
      });
    } catch (error) {
      console.error("Error fetching yearly salary report:", error);
      res.status(500).json({
        message: "Error fetching yearly salary report",
        error: error.message,
      });
    }
  });

  // Annual summary: a by-month table (rows = Jan..Dec) and a by-location table,
  // both sharing the same columns and reconciling to the same grand total.
  // Built by summing the 12 verified monthly reports, so DIGENAPKAN /
  // SETELAH DIGENAPKAN use per-month rounding (matches the legacy paper report).
  router.get("/annual", async (req, res) => {
    const { year } = req.query;

    if (!year) {
      return res.status(400).json({ message: "Year parameter is required" });
    }

    try {
      const yearInt = parseInt(year);
      const monthlyReports = await computeYearlyMonthlyReports(
        pool,
        yearInt,
        req.query.refresh === "true",
      );

      const TOTAL_KEYS = [
        "gaji",
        "ot",
        "bonus",
        "comm",
        "cuti",
        "gaji_kasar",
        "epf_majikan",
        "epf_pekerja",
        "socso_majikan",
        "socso_pekerja",
        "sip_majikan",
        "sip_pekerja",
        "pcb",
        "gaji_bersih",
        "setengah_bulan",
        "jumlah",
        "digenapkan",
        "setelah_digenapkan",
      ];
      const emptyTotals = () =>
        TOTAL_KEYS.reduce((acc, k) => ((acc[k] = 0), acc), {});
      const addInto = (target, src) => {
        TOTAL_KEYS.forEach((k) => {
          target[k] += parseFloat(src?.[k] || 0);
        });
      };

      // By-month rows: each month's employee-deduped grand totals.
      const monthly = monthlyReports.map((rep, i) => {
        const totals = emptyTotals();
        addInto(totals, rep.comprehensive?.grand_totals);
        return { month: i + 1, totals };
      });

      // By-location rows: sum each location's totals across the 12 months.
      const locationTotalsMap = new Map();
      const locationOrder = [];
      monthlyReports.forEach((rep) => {
        (rep.comprehensive?.locations || []).forEach((loc) => {
          if (!locationTotalsMap.has(loc.location)) {
            locationTotalsMap.set(loc.location, emptyTotals());
            locationOrder.push(loc.location);
          }
          addInto(locationTotalsMap.get(loc.location), loc.totals);
        });
      });
      const locations = locationOrder.map((loc) => ({
        location: loc,
        totals: locationTotalsMap.get(loc),
      }));

      // Grand totals = sum of the 12 monthly grand totals (both tables tie out).
      const grand_totals = emptyTotals();
      monthly.forEach((m) => addInto(grand_totals, m.totals));

      res.json({ year: yearInt, monthly, locations, grand_totals });
    } catch (error) {
      console.error("Error fetching annual salary report:", error);
      res.status(500).json({
        message: "Error fetching annual salary report",
        error: error.message,
      });
    }
  });

  // Annual breakdown (paginated): per location, each employee expanded into one row per
  // month (Jan..Dec) + a per-employee total, ending in a location grand total. Built from
  // the same 12 monthly reports as "/annual", so the per-location and grand totals
  // reconcile exactly with the Annual Summary (summed-monthly rounding).
  //
  // Locations are auto-grouped into PAGES capped at ANNUAL_BREAKDOWN_BATCH_STAFF staff
  // (locations kept whole). Only the requested page's heavy per-employee detail is built
  // and returned; every response also carries a lightweight `pages` index (per page:
  // staff count + location codes) so the client can render the pager and batch-print list
  // without holding the whole year in memory.
  const ANNUAL_BREAKDOWN_BATCH_STAFF = 30;
  router.get("/annual-breakdown", async (req, res) => {
    const { year, page } = req.query;

    if (!year) {
      return res.status(400).json({ message: "Year parameter is required" });
    }

    try {
      const yearInt = parseInt(year);
      const monthlyReports = await computeYearlyMonthlyReports(
        pool,
        yearInt,
        req.query.refresh === "true",
      );

      const TOTAL_KEYS = [
        "gaji",
        "ot",
        "bonus",
        "comm",
        "cuti",
        "gaji_kasar",
        "epf_majikan",
        "epf_pekerja",
        "socso_majikan",
        "socso_pekerja",
        "sip_majikan",
        "sip_pekerja",
        "pcb",
        "gaji_bersih",
        "setengah_bulan",
        "jumlah",
        "digenapkan",
        "setelah_digenapkan",
      ];
      const emptyTotals = () =>
        TOTAL_KEYS.reduce((acc, k) => ((acc[k] = 0), acc), {});
      const addInto = (target, src) => {
        TOTAL_KEYS.forEach((k) => {
          target[k] += parseFloat(src?.[k] || 0);
        });
      };

      // Pass 1 (cheap): staff per location + display order, to determine page boundaries.
      const staffByLocation = new Map();
      const locationOrder = [];
      monthlyReports.forEach((rep) => {
        (rep.comprehensive?.locations || []).forEach((loc) => {
          if (!staffByLocation.has(loc.location)) {
            staffByLocation.set(loc.location, new Set());
            locationOrder.push(loc.location);
          }
          const set = staffByLocation.get(loc.location);
          (loc.employees || []).forEach((emp) => set.add(emp.staff_id));
        });
      });
      const orderedLocs = locationOrder.filter(
        (loc) => staffByLocation.get(loc).size > 0,
      );

      // Greedy batching by staff cap (locations kept whole).
      const batches = [];
      let current = { locations: [], staff: 0 };
      orderedLocs.forEach((loc) => {
        const locStaff = staffByLocation.get(loc).size;
        if (
          current.locations.length > 0 &&
          current.staff + locStaff > ANNUAL_BREAKDOWN_BATCH_STAFF
        ) {
          batches.push(current);
          current = { locations: [], staff: 0 };
        }
        current.locations.push(loc);
        current.staff += locStaff;
      });
      if (current.locations.length > 0) batches.push(current);

      const totalPages = batches.length;
      let pageInt = parseInt(page) || 1;
      if (pageInt < 1) pageInt = 1;
      if (pageInt > totalPages) pageInt = totalPages || 1;

      const pagesMeta = batches.map((b) => ({
        staff: b.staff,
        locations: b.locations,
      }));

      // Grand totals = sum of the 12 employee-deduped monthly grand totals.
      const grand_totals = emptyTotals();
      monthlyReports.forEach((rep) =>
        addInto(grand_totals, rep.comprehensive?.grand_totals),
      );

      // Pass 2 (heavy, current page only): build per-employee monthly detail for the
      // locations on the requested page.
      const pageLocCodes = batches[pageInt - 1]
        ? batches[pageInt - 1].locations
        : [];
      const pageLocSet = new Set(pageLocCodes);
      const detailMap = new Map();
      monthlyReports.forEach((rep, i) => {
        const month = i + 1;
        (rep.comprehensive?.locations || []).forEach((loc) => {
          if (!pageLocSet.has(loc.location)) return;
          if (!detailMap.has(loc.location)) {
            detailMap.set(loc.location, {
              employees: new Map(),
              totals: emptyTotals(),
            });
          }
          const bucket = detailMap.get(loc.location);
          addInto(bucket.totals, loc.totals);
          (loc.employees || []).forEach((emp) => {
            if (!bucket.employees.has(emp.staff_id)) {
              bucket.employees.set(emp.staff_id, {
                staff_id: emp.staff_id,
                staff_name: emp.staff_name,
                monthsMap: new Map(),
                total: emptyTotals(),
              });
            }
            const e = bucket.employees.get(emp.staff_id);
            const monthTotals = emptyTotals();
            addInto(monthTotals, emp);
            e.monthsMap.set(month, monthTotals);
            addInto(e.total, emp);
          });
        });
      });

      const locations = pageLocCodes.map((loc) => {
        const bucket = detailMap.get(loc);
        const employees = Array.from(bucket.employees.values())
          .map((e) => ({
            staff_id: e.staff_id,
            staff_name: e.staff_name,
            // Always emit all 12 months (zeros where the employee had no data in
            // this location that month) so every employee shows a full Jan–Dec block.
            months: Array.from({ length: 12 }, (_, i) => i + 1).map((month) => ({
              month,
              ...(e.monthsMap.get(month) || emptyTotals()),
            })),
            total: e.total,
          }))
          .sort((a, b) =>
            (a.staff_name || "").localeCompare(b.staff_name || ""),
          );
        return { location: loc, employees, totals: bucket.totals };
      });

      res.json({
        year: yearInt,
        page: pageInt,
        total_pages: totalPages,
        pages: pagesMeta,
        locations,
        grand_totals,
      });
    } catch (error) {
      console.error("Error fetching annual breakdown salary report:", error);
      res.status(500).json({
        message: "Error fetching annual breakdown salary report",
        error: error.message,
      });
    }
  });

  return router;
}
