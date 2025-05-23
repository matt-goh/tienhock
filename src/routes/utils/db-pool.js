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
      // Add SSL configuration for AWS RDS
      ssl:
        process.env.NODE_ENV === "production"
          ? {
              rejectUnauthorized: false, // For AWS RDS
            }
          : false,
    });

    // Error handling on the pool level
    this.pool.on("error", (err, client) => {
      console.error("Unexpected error on idle client", err);
    });
  }

  async query(...args) {
    return this.pool.query(...args);
  }

  connect() {
    return this.pool.connect();
  }

  async end() {
    await this.pool.end();
  }
}

export const createDatabasePool = (config) => new DatabasePool(config);
