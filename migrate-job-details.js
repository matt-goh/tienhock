// migrate-job-details.js
import { createDatabasePool } from "./src/routes/utils/db-pool.js";
import {
  DB_USER,
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_PORT,
} from "./src/configs/config.js";

// Create database connection pool
const pool = createDatabasePool({
  user: DB_USER,
  host: DB_HOST,
  database: DB_NAME,
  password: DB_PASSWORD || "foodmaker", // Use environment variable or hardcoded value
  port: DB_PORT,
});

// Helper functions
function determinePayType(type) {
  if (!type) return "Base";

  switch (type?.toLowerCase()) {
    case "gaji":
      return "Base";
    case "overtime":
      return "Overtime";
    case "tambahan":
      return "Tambahan";
    case "allowance":
      return "Tambahan"; // Map Allowance to Tambahan
    default:
      return "Base";
  }
}

function determineRateUnit(remark) {
  if (!remark) return "Hour";

  const remarkLower = remark.toLowerCase();
  if (remarkLower.includes("bag")) return "Bag";
  if (remarkLower.includes("day")) return "Day";
  if (remarkLower.includes("percent") || remarkLower.includes("%"))
    return "Percent";
  if (remarkLower.includes("fixed")) return "Fixed";

  return "Hour";
}

// Migration function
const migrateJobDetails = async () => {
  try {
    console.log("Starting migration from job_details to pay_codes...");
    console.log("Database connection parameters:");
    console.log(`User: ${DB_USER}`);
    console.log(`Host: ${DB_HOST}`);
    console.log(`Database: ${DB_NAME}`);
    console.log(`Port: ${DB_PORT}`);

    // First verify the database connection
    try {
      const testConnection = await pool.query(
        "SELECT current_database() as db_name"
      );
      console.log(
        "Database connection successful! Connected to:",
        testConnection.rows[0].db_name
      );
    } catch (connError) {
      console.error("Database connection test failed:", connError);
      throw new Error(`Database connection failed: ${connError.message}`);
    }

    // First get all jobs and their sections
    const jobsQuery = "SELECT id, name, section FROM jobs";
    const jobsResult = await pool.query(jobsQuery);
    const jobs = jobsResult.rows;

    console.log(`Found ${jobs.length} jobs to process`);

    // Create a map of job ID to section
    const jobToSectionMap = new Map();
    jobs.forEach((job) => {
      // Handle section as either array or comma-separated string
      const sections = Array.isArray(job.section)
        ? job.section
        : job.section?.split(",").map((s) => s.trim()) || [];

      jobToSectionMap.set(job.id, {
        name: job.name,
        sections: sections,
      });
    });

    // Get all job_details
    const jobDetailsQuery = `
      SELECT id, description, amount, remark, type 
      FROM job_details
    `;
    const jobDetailsResult = await pool.query(jobDetailsQuery);
    const jobDetails = jobDetailsResult.rows;

    console.log(`Found ${jobDetails.length} job_details to process`);

    // Group job_details by base code
    const baseCodeMap = new Map();

    for (const detail of jobDetails) {
      // Determine base code by removing day type suffix AND potential section suffixes
      let baseCode = detail.id;
      let dayType = "Biasa"; // Default
      let sectionCode = ""; // Will extract potential section code

      // Extract day type - check both formats
      if (baseCode.includes("_AHAD") || baseCode.includes("/A")) {
        baseCode = baseCode.replace("_AHAD", "").replace("/A", "");
        dayType = "Ahad";
      } else if (baseCode.includes("_UMUM") || baseCode.includes("/U")) {
        baseCode = baseCode.replace("_UMUM", "").replace("/U", "");
        dayType = "Umum";
      }

      // Now try to extract section suffix (often after last underscore)
      const parts = baseCode.split("_");
      if (parts.length > 1) {
        // The last part might be a section code (e.g., MT in MEE_BIASA_MT)
        const possibleSectionCode = parts[parts.length - 1];
        // Check if this is a known section code from our jobs data
        let isSectionCode = false;

        // Check if any job's section includes this code
        for (const job of jobToSectionMap.values()) {
          if (
            job.sections.some(
              (section) =>
                section.includes(possibleSectionCode) ||
                possibleSectionCode.includes(section)
            )
          ) {
            isSectionCode = true;
            break;
          }
        }

        if (isSectionCode) {
          sectionCode = possibleSectionCode;
          // Remove section suffix from base code
          baseCode = parts.slice(0, -1).join("_");
        }
      }

      // Initialize base code group if not exists
      if (!baseCodeMap.has(baseCode)) {
        baseCodeMap.set(baseCode, {
          code: baseCode,
          description: detail.description,
          pay_type: determinePayType(detail.type),
          rate_unit: determineRateUnit(detail.remark),
          rate_biasa: 0,
          rate_ahad: 0,
          rate_umum: 0,
          is_active: true,
          requires_units_input:
            detail.remark?.toLowerCase().includes("bag") || false,
          sectionRates: new Map(), // Track section-specific rates
        });
      }

      const payCode = baseCodeMap.get(baseCode);

      // If this is a section-specific rate, store it separately
      if (sectionCode) {
        if (!payCode.sectionRates.has(sectionCode)) {
          payCode.sectionRates.set(sectionCode, {
            rate_biasa: 0,
            rate_ahad: 0,
            rate_umum: 0,
          });
        }

        // Update section-specific rate
        const sectionRates = payCode.sectionRates.get(sectionCode);
        switch (dayType) {
          case "Ahad":
            sectionRates.rate_ahad = detail.amount;
            break;
          case "Umum":
            sectionRates.rate_umum = detail.amount;
            break;
          default:
            sectionRates.rate_biasa = detail.amount;
        }
      } else {
        // Set the base rate
        switch (dayType) {
          case "Ahad":
            payCode.rate_ahad = detail.amount;
            break;
          case "Umum":
            payCode.rate_umum = detail.amount;
            break;
          default:
            payCode.rate_biasa = detail.amount;
        }
      }
    }

    console.log(`Identified ${baseCodeMap.size} unique pay codes`);

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Insert pay codes
      for (const payCode of baseCodeMap.values()) {
        const insertQuery = `
          INSERT INTO pay_codes (
            id, code, description, pay_type, rate_unit, 
            rate_biasa, rate_ahad, rate_umum, 
            is_active, requires_units_input
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE
          SET description = EXCLUDED.description,
              pay_type = EXCLUDED.pay_type,
              rate_unit = EXCLUDED.rate_unit,
              rate_biasa = EXCLUDED.rate_biasa,
              rate_ahad = EXCLUDED.rate_ahad,
              rate_umum = EXCLUDED.rate_umum,
              is_active = EXCLUDED.is_active,
              requires_units_input = EXCLUDED.requires_units_input
          RETURNING id
        `;

        const values = [
          payCode.code,
          payCode.code,
          payCode.description,
          payCode.pay_type,
          payCode.rate_unit,
          payCode.rate_biasa,
          payCode.rate_ahad,
          payCode.rate_umum,
          payCode.is_active,
          payCode.requires_units_input,
        ];

        await client.query(insertQuery, values);
      }

      // Now get all jobs_job_details relationships
      const jobsJobDetailsQuery = `
        SELECT jjd.job_id, jd.id as job_detail_id
        FROM jobs_job_details jjd
        JOIN job_details jd ON jjd.job_detail_id = jd.id
      `;

      const jobsJobDetailsResult = await client.query(jobsJobDetailsQuery);
      const jobsJobDetails = jobsJobDetailsResult.rows;

      console.log(
        `Found ${jobsJobDetails.length} jobs_job_details relationships to process`
      );

      // For each relationship
      for (const relation of jobsJobDetails) {
        // Extract original detail ID
        const originalDetailId = relation.job_detail_id;
        const jobId = relation.job_id;

        // Extract job information
        const jobInfo = jobToSectionMap.get(jobId);

        if (!jobInfo) {
          console.warn(`Job ${jobId} not found in jobs table`);
          continue;
        }

        // Extract base code and section from detail ID
        let baseCode = originalDetailId;
        let sectionCode = "";

        // Remove day type suffix
        if (baseCode.includes("_AHAD") || baseCode.includes("/A")) {
          baseCode = baseCode.replace("_AHAD", "").replace("/A", "");
        } else if (baseCode.includes("_UMUM") || baseCode.includes("/U")) {
          baseCode = baseCode.replace("_UMUM", "").replace("/U", "");
        }

        // Try to extract section suffix
        const parts = baseCode.split("_");
        if (parts.length > 1) {
          const possibleSectionCode = parts[parts.length - 1];
          // Check if this matches a section
          if (
            jobInfo.sections.some(
              (section) =>
                section.includes(possibleSectionCode) ||
                possibleSectionCode.includes(section)
            )
          ) {
            sectionCode = possibleSectionCode;
            baseCode = parts.slice(0, -1).join("_");
          }
        }

        // Get the pay code
        const payCode = baseCodeMap.get(baseCode);

        if (!payCode) {
          console.warn(
            `Base code ${baseCode} not found for job detail ${originalDetailId}`
          );
          continue;
        }

        // Check if we have section-specific rates
        let overrideRateBiasa = null;
        let overrideRateAhad = null;
        let overrideRateUmum = null;

        if (sectionCode && payCode.sectionRates.has(sectionCode)) {
          const sectionRates = payCode.sectionRates.get(sectionCode);

          // Only set overrides if different from base rates
          if (
            sectionRates.rate_biasa !== payCode.rate_biasa &&
            sectionRates.rate_biasa !== 0
          ) {
            overrideRateBiasa = sectionRates.rate_biasa;
          }
          if (
            sectionRates.rate_ahad !== payCode.rate_ahad &&
            sectionRates.rate_ahad !== 0
          ) {
            overrideRateAhad = sectionRates.rate_ahad;
          }
          if (
            sectionRates.rate_umum !== payCode.rate_umum &&
            sectionRates.rate_umum !== 0
          ) {
            overrideRateUmum = sectionRates.rate_umum;
          }
        }

        // Create job_pay_codes entry
        const insertRelationQuery = `
          INSERT INTO job_pay_codes (
            job_id, pay_code_id, is_default,
            override_rate_biasa, override_rate_ahad, override_rate_umum
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (job_id, pay_code_id) DO UPDATE
          SET is_default = EXCLUDED.is_default,
              override_rate_biasa = EXCLUDED.override_rate_biasa,
              override_rate_ahad = EXCLUDED.override_rate_ahad,
              override_rate_umum = EXCLUDED.override_rate_umum
        `;

        await client.query(insertRelationQuery, [
          jobId,
          baseCode,
          true, // set as default
          overrideRateBiasa,
          overrideRateAhad,
          overrideRateUmum,
        ]);
      }

      await client.query("COMMIT");
      console.log("Migration completed successfully!");

      // Display summary
      console.log("\nMigration Summary:");
      console.log(`- Total pay codes created: ${baseCodeMap.size}`);
      console.log(
        `- Total job_pay_codes relationships created: ${jobsJobDetails.length}`
      );

      // Query to show the results
      const summaryQuery = `
        SELECT j.name as job_name, pc.code, pc.description,
               pc.rate_biasa, jpc.override_rate_biasa,
               pc.rate_ahad, jpc.override_rate_ahad,
               pc.rate_umum, jpc.override_rate_umum
        FROM job_pay_codes jpc
        JOIN jobs j ON jpc.job_id = j.id
        JOIN pay_codes pc ON jpc.pay_code_id = pc.id
        ORDER BY j.name, pc.code
        LIMIT 10
      `;

      const summaryResult = await client.query(summaryQuery);
      console.log("\nSample migrated data (first 10 records):");
      console.table(summaryResult.rows);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Migration failed:", error);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  }
};

// Run the migration
(async () => {
  try {
    await migrateJobDetails();
    console.log("\nMigration process completed successfully!");
  } catch (error) {
    console.error("\nMigration process failed:", error);
  } finally {
    if (pool) {
      await pool.end();
      console.log("\nDatabase pool closed.");
    }
  }
})();
