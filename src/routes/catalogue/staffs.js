// src/routes/staff.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Helper functions
  async function checkDuplicateStaffId(id) {
    const query = "SELECT * FROM staffs WHERE id = $1";
    const result = await pool.query(query, [id]);
    return result.rows.length > 0;
  }

  // Helper function to check if staff has OFFICE job and set password
  function shouldSetPassword(job) {
    if (!job) return false;
    const jobArray = Array.isArray(job) ? job : JSON.parse(job);
    return jobArray.includes("OFFICE");
  }

  // Default password hash for OFFICE staff
  const DEFAULT_PASSWORD_HASH = "$2a$10$LCpAl1V5h9xwjFrRtlIiD.jg.ZgCba4n7tUHFFxqNZTHjXh.9IQYy";

  // Get staff members
  router.get("/", async (req, res) => {
    try {
      const { salesmenOnly } = req.query;

      // Dynamically build column selection based on salesmenOnly parameter
      const columns =
        salesmenOnly === "true"
          ? "s.id" // Only select ID for salesmen
          : `s.id, 
           s.name, 
           s.ic_no as "icNo", 
           s.telephone_no as "telephoneNo",
           s.email,
           s.gender,
           s.nationality,
           s.birthdate,
           s.address,
           s.date_joined as "dateJoined",
           s.bank_account_number as "bankAccountNumber",
           s.epf_no as "epfNo",
           s.income_tax_no as "incomeTaxNo",
           s.socso_no as "socsoNo",
           s.document,
           s.payment_type as "paymentType",
           s.payment_preference as "paymentPreference",
           s.race,
           s.agama,
           s.date_resigned as "dateResigned",
           s.job,
           s.location,
           s.updated_at as "updatedAt",
           s.marital_status as "maritalStatus",
           s.spouse_employment_status as "spouseEmploymentStatus",
           s.number_of_children as "numberOfChildren",
           s.department,
           s.kwsp_number as "kwspNumber"`;

      let query = `
      SELECT ${columns}
      FROM staffs s
    `;

      // Only filter by active status for salesmenOnly query
      if (salesmenOnly === "true") {
        query += ` WHERE (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)`;
        query += ` AND s.job::jsonb ? 'SALESMAN'`;
      }

      query += ` ORDER BY s.updated_at DESC NULLS LAST`;

      const result = await pool.query(query);

      // Process results based on query type
      const staffs =
        salesmenOnly === "true"
          ? result.rows
          : result.rows.map((staff) => ({
              ...staff,
              job: Array.isArray(staff.job) ? staff.job : [],
              location: Array.isArray(staff.location) ? staff.location : [],
              // Format dates
              birthdate: staff.birthdate
                ? staff.birthdate.toISOString().split("T")[0]
                : "",
              dateJoined: staff.dateJoined
                ? staff.dateJoined.toISOString().split("T")[0]
                : "",
              dateResigned: staff.dateResigned
                ? staff.dateResigned.toISOString().split("T")[0]
                : "",
            }));

      res.json(staffs);
    } catch (error) {
      console.error("Error fetching staffs:", error);
      res.status(500).json({
        message: "Error fetching staffs",
        error: error.message,
      });
    }
  });

  // Create new staff member
  router.post("/", async (req, res) => {
    const {
      id,
      name,
      telephoneNo,
      email,
      gender,
      nationality,
      birthdate,
      address,
      job,
      location,
      dateJoined,
      icNo,
      bankAccountNumber,
      epfNo,
      incomeTaxNo,
      socsoNo,
      document,
      paymentType,
      paymentPreference,
      race,
      agama,
      dateResigned,
      maritalStatus,
      spouseEmploymentStatus,
      numberOfChildren,
      department,
      kwspNumber,
    } = req.body;

    try {
      // Check for duplicate ID
      const isDuplicateId = await checkDuplicateStaffId(id);
      if (isDuplicateId) {
        return res
          .status(400)
          .json({ message: "A staff member with this ID already exists" });
      }

      // Check if staff has OFFICE job and set password accordingly
      const hasOfficeJob = shouldSetPassword(job);
      const password = hasOfficeJob ? DEFAULT_PASSWORD_HASH : null;

      const query = `
        INSERT INTO staffs (
          id, name, telephone_no, email, gender, nationality, birthdate, address,
          job, location, date_joined, ic_no, bank_account_number, epf_no,
          income_tax_no, socso_no, document, payment_type, payment_preference,
          race, agama, date_resigned, marital_status, spouse_employment_status, number_of_children, department, kwsp_number, password
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
        RETURNING *
      `;

      const values = [
        id,
        name,
        telephoneNo,
        email || null,
        gender,
        nationality,
        birthdate ? new Date(birthdate) : null,
        address,
        JSON.stringify(job),
        JSON.stringify(location),
        dateJoined ? new Date(dateJoined) : null,
        icNo,
        bankAccountNumber,
        epfNo,
        incomeTaxNo,
        socsoNo,
        document,
        paymentType,
        paymentPreference,
        race,
        agama,
        dateResigned ? new Date(dateResigned) : null,
        maritalStatus || "Single",
        spouseEmploymentStatus || null,
        numberOfChildren || 0,
        department || null,
        kwspNumber || null,
        password,
      ];

      const result = await pool.query(query, values);
      res.status(201).json({
        message: "Staff member created successfully",
        staff: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating staff member:", error);
      res
        .status(500)
        .json({ message: "Error creating staff member", error: error.message });
    }
  });

  router.get("/get-salesmen", async (req, res) => {
    try {
      const query = `
        SELECT
          id, name, email
        FROM staffs
        WHERE (date_resigned IS NULL OR date_resigned > CURRENT_DATE)
        AND job::jsonb ? 'SALESMAN'
      `;

      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching salesmen:", error);
      res.status(500).json({ error: "Failed to fetch salesmen" });
    }
  });

  router.get("/get-drivers", async (req, res) => {
    try {
      const query = `
        SELECT
          id, name
        FROM staffs
        WHERE (date_resigned IS NULL OR date_resigned > CURRENT_DATE)
        AND job::jsonb ? 'DRIVER'
      `;

      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      res.status(500).json({ error: "Failed to fetch drivers" });
    }
  });

  // Get single staff member
  router.get("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const query = `
        SELECT 
          s.id, 
          s.name, 
          s.ic_no as "icNo", 
          s.telephone_no as "telephoneNo",
          s.email,
          s.gender,
          s.nationality,
          s.birthdate,
          s.address,
          s.date_joined as "dateJoined",
          s.bank_account_number as "bankAccountNumber",
          s.epf_no as "epfNo",
          s.income_tax_no as "incomeTaxNo",
          s.socso_no as "socsoNo",
          s.document,
          s.payment_type as "paymentType",
          s.payment_preference as "paymentPreference",
          s.race,
          s.agama,
          s.date_resigned as "dateResigned",
          s.job,
          s.location,
          s.marital_status as "maritalStatus",
          s.spouse_employment_status as "spouseEmploymentStatus",
          s.number_of_children as "numberOfChildren",
          s.department,
          s.kwsp_number as "kwspNumber"
        FROM 
          staffs s
        WHERE
          s.id = $1
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Staff member not found" });
      }

      const staff = result.rows[0];

      // Format dates
      const formatDate = (date) =>
        date ? new Date(date).toISOString().split("T")[0] : "";

      // Convert null values to empty strings and format dates
      const formattedStaff = Object.entries(staff).reduce(
        (acc, [key, value]) => {
          if (
            key === "birthdate" ||
            key === "dateJoined" ||
            key === "dateResigned"
          ) {
            acc[key] = formatDate(value);
          } else if (key === "job" || key === "location") {
            acc[key] = Array.isArray(value) ? value : [];
          } else {
            acc[key] = value === null ? "" : value;
          }
          return acc;
        },
        {}
      );

      res.json(formattedStaff);
    } catch (error) {
      console.error("Error fetching staff member:", error);
      res
        .status(500)
        .json({ message: "Error fetching staff member", error: error.message });
    }
  });

  // Batch update staff jobs (MUST be before /:id route)
  router.put("/batch-job-update", async (req, res) => {
    const { jobId, addEmployees, removeEmployees } = req.body;

    if (!jobId) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        let addedCount = 0;
        let removedCount = 0;

        // Add job to employees
        if (addEmployees && addEmployees.length > 0) {
          // For each employee, add the job to their job array if not already present
          for (const employeeId of addEmployees) {
            const result = await client.query(
              `UPDATE staffs
               SET job = COALESCE(job, '[]'::jsonb) || $1::jsonb
               WHERE id = $2
                 AND NOT (COALESCE(job, '[]'::jsonb) ? $3)
               RETURNING id`,
              [JSON.stringify([jobId]), employeeId, jobId]
            );
            if (result.rows.length > 0) addedCount++;
          }
        }

        // Remove job from employees
        if (removeEmployees && removeEmployees.length > 0) {
          for (const employeeId of removeEmployees) {
            const result = await client.query(
              `UPDATE staffs
               SET job = (
                 SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                 FROM jsonb_array_elements_text(COALESCE(job, '[]'::jsonb)) AS elem
                 WHERE elem != $1
               )
               WHERE id = $2
               RETURNING id`,
              [jobId, employeeId]
            );
            if (result.rows.length > 0) removedCount++;
          }
        }

        await client.query("COMMIT");
        res.json({
          message: "Staff jobs updated successfully",
          addedCount,
          removedCount,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error updating staff jobs:", error);
      res
        .status(500)
        .json({ message: "Error updating staff jobs", error: error.message });
    }
  });

  // Batch update staff locations (MUST be before /:id route)
  router.put("/batch-location-update", async (req, res) => {
    const { locationCode, addEmployees, removeEmployees } = req.body;

    if (!locationCode) {
      return res.status(400).json({ message: "Location code is required" });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        let addedCount = 0;
        let removedCount = 0;

        // Add location to employees
        if (addEmployees && addEmployees.length > 0) {
          // For each employee, add the location to their location array if not already present
          for (const employeeId of addEmployees) {
            const result = await client.query(
              `UPDATE staffs
               SET location = COALESCE(location, '[]'::jsonb) || $1::jsonb
               WHERE id = $2
                 AND NOT (COALESCE(location, '[]'::jsonb) ? $3)
               RETURNING id`,
              [JSON.stringify([locationCode]), employeeId, locationCode]
            );
            if (result.rows.length > 0) addedCount++;
          }
        }

        // Remove location from employees
        if (removeEmployees && removeEmployees.length > 0) {
          for (const employeeId of removeEmployees) {
            const result = await client.query(
              `UPDATE staffs
               SET location = (
                 SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                 FROM jsonb_array_elements_text(COALESCE(location, '[]'::jsonb)) AS elem
                 WHERE elem != $1
               )
               WHERE id = $2
               RETURNING id`,
              [locationCode, employeeId]
            );
            if (result.rows.length > 0) removedCount++;
          }
        }

        await client.query("COMMIT");
        res.json({
          message: "Staff locations updated successfully",
          addedCount,
          removedCount,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error updating staff locations:", error);
      res
        .status(500)
        .json({ message: "Error updating staff locations", error: error.message });
    }
  });

  // Update staff member
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
      name,
      telephoneNo,
      email,
      gender,
      nationality,
      birthdate,
      address,
      job,
      location,
      dateJoined,
      icNo,
      bankAccountNumber,
      epfNo,
      incomeTaxNo,
      socsoNo,
      document,
      paymentType,
      paymentPreference,
      race,
      agama,
      dateResigned,
      newId,
      maritalStatus,
      spouseEmploymentStatus,
      numberOfChildren,
      department,
      kwspNumber,
    } = req.body;

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        let updateId = id;
        if (newId && newId !== id) {
          // Check if the new ID already exists
          const checkIdQuery = "SELECT id FROM staffs WHERE id = $1";
          const checkIdResult = await client.query(checkIdQuery, [newId]);
          if (checkIdResult.rows.length > 0) {
            throw new Error("A staff member with the new ID already exists");
          }
          updateId = newId;
        }

        // Check if staff has OFFICE job and set password accordingly
        const hasOfficeJob = shouldSetPassword(job);
        const password = hasOfficeJob ? DEFAULT_PASSWORD_HASH : null;

        const query = `
          UPDATE staffs
          SET id = $1, name = $2, telephone_no = $3, email = $4, gender = $5, nationality = $6, 
              birthdate = $7, address = $8, job = $9, location = $10, date_joined = $11, 
              ic_no = $12, bank_account_number = $13, epf_no = $14, income_tax_no = $15, 
              socso_no = $16, document = $17, payment_type = $18, payment_preference = $19, 
              race = $20, agama = $21, date_resigned = $22, marital_status = $23, 
              spouse_employment_status = $24, number_of_children = $25, department = $26, kwsp_number = $27, password = $28
          WHERE id = $29
          RETURNING *
        `;

        const values = [
          updateId,
          name,
          telephoneNo,
          email || null,
          gender,
          nationality,
          birthdate ? new Date(birthdate) : null,
          address,
          JSON.stringify(job),
          JSON.stringify(location),
          dateJoined ? new Date(dateJoined) : null,
          icNo,
          bankAccountNumber,
          epfNo,
          incomeTaxNo,
          socsoNo,
          document,
          paymentType,
          paymentPreference,
          race,
          agama,
          dateResigned ? new Date(dateResigned) : null,
          maritalStatus || "Single",
          spouseEmploymentStatus || null,
          numberOfChildren || 0,
          department || null,
          kwspNumber || null,
          password,
          id,
        ];

        const result = await client.query(query, values);

        if (result.rows.length === 0) {
          throw new Error("Staff member not found");
        }

        await client.query("COMMIT");
        res.json({
          message: "Staff member updated successfully",
          staff: result.rows[0],
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error updating staff member:", error);
      res
        .status(500)
        .json({ message: "Error updating staff member", error: error.message });
    }
  });

  // Delete staff member
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Delete related records from dependent tables first
        await client.query(
          "DELETE FROM employee_leave_balances WHERE employee_id = $1",
          [id]
        );
        await client.query(
          "DELETE FROM employee_pay_codes WHERE employee_id = $1",
          [id]
        );

        // Now delete the staff member
        const query = "DELETE FROM staffs WHERE id = $1 RETURNING *";
        const result = await client.query(query, [id]);

        if (result.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Staff member not found" });
        }

        await client.query("COMMIT");
        res.json({
          message: "Staff member deleted successfully",
          staff: result.rows[0],
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error deleting staff member:", error);
      res
        .status(500)
        .json({ message: "Error deleting staff member", error: error.message });
    }
  });

  return router;
}
