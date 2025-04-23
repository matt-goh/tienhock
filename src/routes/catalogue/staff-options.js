// src/routes/catalogue/staff-options.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Get all form options in a single call
  router.get("/", async (req, res) => {
    try {
      // Create a client once for all queries
      const client = await pool.connect();

      try {
        // Run queries in parallel for efficiency
        const [
          nationalitiesResult,
          racesResult,
          agamaResult,
          locationsResult,
          banksResult,
          sectionsResult,
        ] = await Promise.all([
          client.query("SELECT * FROM nationalities ORDER BY name"),
          client.query("SELECT * FROM races ORDER BY name"),
          client.query("SELECT * FROM agama ORDER BY name"),
          client.query("SELECT * FROM locations ORDER BY name"),
          client.query("SELECT * FROM banks ORDER BY name"),
          client.query("SELECT * FROM sections ORDER BY name"),
        ]);

        // Combine results into a single response object
        const response = {
          nationalities: nationalitiesResult.rows,
          races: racesResult.rows,
          agama: agamaResult.rows,
          locations: locationsResult.rows,
          banks: banksResult.rows,
          sections: sectionsResult.rows,
        };

        res.json(response);
      } finally {
        // Always release the client
        client.release();
      }
    } catch (error) {
      console.error("Error fetching staff form options:", error);
      res.status(500).json({
        message: "Error fetching staff form options",
        error: error.message,
      });
    }
  });

  return router;
}
