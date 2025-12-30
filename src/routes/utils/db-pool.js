// src/routes/utils/db-pool.js
import pkgPg from "pg";
const { Pool, types } = pkgPg;

// Fix timezone handling: interpret all timestamps as UTC
// This prevents issues with Docker container clock being out of sync
// Type OID 1114 = TIMESTAMP WITHOUT TIME ZONE
// Type OID 1184 = TIMESTAMP WITH TIME ZONE
types.setTypeParser(1114, (str) => str ? new Date(str + 'Z') : null);
types.setTypeParser(1184, (str) => str ? new Date(str) : null);

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

    // Set timezone to UTC for all connections to avoid Docker container clock sync issues
    this.pool.on("connect", (client) => {
      client.query("SET timezone = 'UTC'");
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
