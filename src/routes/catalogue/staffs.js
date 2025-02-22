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

  // Get all staff members
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
             s.job,
             s.location,
             s.date_resigned as "dateResigned"`;

      let query = `
        SELECT ${columns}
        FROM staffs s
        WHERE (s.date_resigned IS NULL OR s.date_resigned > CURRENT_DATE)
      `;

      if (salesmenOnly === "true") {
        query += ` AND s.job::jsonb ? 'SALESMAN'`;
      }

      const result = await pool.query(query);

      // Process results based on query type
      const staffs =
        salesmenOnly === "true"
          ? result.rows
          : result.rows.map((staff) => ({
              ...staff,
              job: Array.isArray(staff.job) ? staff.job : [],
              location: Array.isArray(staff.location) ? staff.location : [],
              dateResigned: staff.dateResigned
                ? staff.dateResigned.toISOString().split("T")[0]
                : null,
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
    } = req.body;

    try {
      // Check for duplicate ID
      const isDuplicateId = await checkDuplicateStaffId(id);
      if (isDuplicateId) {
        return res
          .status(400)
          .json({ message: "A staff member with this ID already exists" });
      }

      const query = `
        INSERT INTO staffs (
          id, name, telephone_no, email, gender, nationality, birthdate, address,
          job, location, date_joined, ic_no, bank_account_number, epf_no,
          income_tax_no, socso_no, document, payment_type, payment_preference,
          race, agama, date_resigned
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
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
          s.location
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

        const query = `
          UPDATE staffs
          SET id = $1, name = $2, telephone_no = $3, email = $4, gender = $5, nationality = $6, 
              birthdate = $7, address = $8, job = $9, location = $10, date_joined = $11, 
              ic_no = $12, bank_account_number = $13, epf_no = $14, income_tax_no = $15, 
              socso_no = $16, document = $17, payment_type = $18, payment_preference = $19, 
              race = $20, agama = $21, date_resigned = $22
          WHERE id = $23
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
      const query = "DELETE FROM staffs WHERE id = $1 RETURNING *";
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Staff member not found" });
      }

      res.json({
        message: "Staff member deleted successfully",
        staff: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting staff member:", error);
      res
        .status(500)
        .json({ message: "Error deleting staff member", error: error.message });
    }
  });

  return router;
}
