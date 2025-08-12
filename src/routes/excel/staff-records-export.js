// src/routes/excel/staff-records-export.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get staff records export data for Excel Power Query
  router.get("/", async (req, res) => {
    const { api_key } = req.query;

    // Check API key authentication (bypasses middleware)
    if (api_key !== "foodmaker") {
      return res.status(401).json({
        message: "Unauthorized: Invalid or missing API key",
      });
    }

    try {
      // Query to get all active staff records
      const query = `
        SELECT 
          s.id,
          s.name,
          s.gender,
          s.birthdate,
          s.marital_status,
          s.telephone_no,
          s.date_joined,
          s.department,
          s.ic_no,
          s.kwsp_number,
          s.income_tax_no,
          s.bank_account_number,
          s.agama,
          s.race,
          s.nationality
        FROM staffs s
        WHERE s.date_resigned IS NULL
        ORDER BY s.name ASC
      `;

      const result = await pool.query(query);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "No active staff records found",
        });
      }

      // Helper functions
      const calculateAge = (birthdate) => {
        if (!birthdate) return 0;
        const today = new Date();
        const birth = new Date(birthdate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();

        if (
          monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < birth.getDate())
        ) {
          age--;
        }

        return age;
      };

      const formatMaritalStatus = (status) => {
        if (status === "Married") return "BERKAHWIN";
        if (status === "Single") return "BUJANG";
        return status || "-";
      };

      const formatGender = (gender) => {
        if (gender === "Male") return "M";
        if (gender === "Female") return "F";
        return gender || "-";
      };

      const formatDateJoined = (dateString) => {
        if (!dateString) return "-";
        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const year = date.getFullYear().toString();
        return `${day}.${month}.${year}`;
      };

      const formatDate = (dateString) => {
        if (!dateString) return { day: "-", month: "-", year: "-" };

        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const year = date.getFullYear().toString();

        return { day, month, year };
      };

      const formatPhoneNumber = (phoneNumber) => {
        if (!phoneNumber) return "-";
        
        // Remove all non-digit characters
        const digits = phoneNumber.replace(/\D/g, "");
        
        if (digits.length === 10) {
          // Format as XXX-XXX-XXXX
          return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
        } else if (digits.length === 11) {
          // Format as XXX-XXXX-XXXX
          return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
        } else {
          // Return original if not 10 or 11 digits
          return phoneNumber;
        }
      };

      const formatRace = (race) => {
        if (!race) return "-";
        const upperRace = race.toUpperCase();
        if (upperRace === "CINA") return "CHINESE";
        return upperRace;
      };

      // Define column headers
      const headers = [
        "Employee Name",
        "M/F",
        "Age",
        "Married",
        "Tel No.",
        "Date Join",
        "Department",
        "No IC / Passport",
        "KWSP No",
        "Income Tax No",
        "Bank Acc. No",
        "Date/Birth (DD.MM)",
        "Date/Birth (YYYY)",
        "Religion",
        "Race",
        "Citizenship"
      ];

      // Helper function to escape CSV values
      const escapeCsvValue = (value) => {
        if (value === null || value === undefined) return "";
        const stringValue = value.toString();
        // If the value contains comma, quote, or newline, wrap in quotes and escape quotes
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      };

      // Transform data into CSV format optimized for Power Query
      const csvRows = result.rows.map((employee) => {
        const birthDateParts = formatDate(employee.birthdate);
        const dayMonth = `${birthDateParts.day}.${birthDateParts.month}`;
        const year = birthDateParts.year;
        
        const columns = [
          employee.name || "",
          formatGender(employee.gender),
          calculateAge(employee.birthdate).toString(),
          formatMaritalStatus(employee.marital_status),
          formatPhoneNumber(employee.telephone_no || ""),
          formatDateJoined(employee.date_joined),
          employee.department || "",
          employee.ic_no || "",
          employee.kwsp_number || "",
          employee.income_tax_no || "",
          employee.bank_account_number || "",
          dayMonth,
          year,
          (employee.agama || "").toUpperCase(),
          formatRace(employee.race || ""),
          (employee.nationality || "").toUpperCase()
        ];
        
        return columns.map(escapeCsvValue).join(',');
      });

      // Combine headers and data
      const allRows = [
        headers.map(escapeCsvValue).join(','),
        ...csvRows
      ];
      const csvOutput = allRows.join('\r\n');
      
      // Set content type to CSV for proper Power Query recognition
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="staff-records-export.csv"');
      res.send(csvOutput);
    } catch (error) {
      console.error("Error fetching staff records export data:", error);
      res.status(500).json({
        message: "Error fetching staff records export data",
        error: error.message,
      });
    }
  });

  return router;
}