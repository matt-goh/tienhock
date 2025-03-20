// src/routes/utils/db-pool.js
import pkgPg from "pg";
const { Pool } = pkgPg;

class DatabasePool {
  constructor(config) {
    this.pool = new Pool({
      ...config,
      application_name: "main_application_pool",
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Error handling on the pool level
    this.pool.on("error", (err, client) => {
      console.error("Unexpected error on idle client", err);
    });
  }

  async query(text, params, options = {}) {
    const client = await this.pool.connect();
    try {
      // If a company schema is specified, set the search path to include both schemas
      if (options.companySchema) {
        await client.query(
          `SET search_path TO ${options.companySchema}, public`
        );
      }

      // Execute the query
      const result = await client.query(text, params);

      // Reset search path if needed
      if (options.companySchema) {
        await client.query("SET search_path TO public");
      }

      return result;
    } finally {
      client.release();
    }
  }

  async connect() {
    return this.pool.connect();
  }

  async end() {
    await this.pool.end();
  }
}

export const createDatabasePool = (config) => new DatabasePool(config);
