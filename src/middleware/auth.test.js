import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";

const mobileApiKey = "existing-mobile-key";
process.env.NODE_ENV = process.env.AUTH_TEST_ENV === "production" ? "production" : "test";
process.env.MOBILE_API_KEY_SHA256 = createHash("sha256")
  .update(mobileApiKey, "utf8")
  .digest("hex");

const { authMiddleware } = await import("./auth.js?auth-middleware-test");
const { SESSION_COOKIE } = await import("./security.js");
const { default: sessionsRouter } = await import("../routes/auth/sessions.js");
const { default: staffRouter } = await import("../routes/catalogue/staffs.js");
const { default: authRouter } = await import("../routes/auth/auth.js");
const { default: bcrypt } = await import("bcryptjs");
/** @type {string} */
const browserOrigin = process.env.NODE_ENV === "production"
  ? "https://tienhock.com"
  : "http://localhost:3000";
/** @type {string} */
const browserSessionId = "s".repeat(43);
/** @type {Record<string, string>} */
const browserHeaders = { origin: browserOrigin, cookie: `${SESSION_COOKIE}=${browserSessionId}` };

/**
 * @param {{
 *   method?: string,
 *   originalUrl?: string,
 *   path?: string,
 *   headers?: Record<string, string | string[]>,
 *   rawHeaders?: string[],
 *   query?: Record<string, unknown>,
 *   body?: Record<string, unknown>
 * }} [overrides]
 * @returns {Record<string, any>}
 */
function createRequest(overrides = {}) {
  const headers = overrides.headers || {};
  const rawHeaders =
    overrides.rawHeaders ||
    Object.entries(headers).flatMap(([name, value]) => [
      name,
      Array.isArray(value) ? value.join(", ") : value,
    ]);

  return {
    method: "GET",
    originalUrl: "/api/invoices/ids",
    path: "/invoices/ids",
    headers,
    rawHeaders,
    query: {},
    body: {},
    socket: { remoteAddress: "203.0.113.10" },
    /** @param {string} name @returns {string | string[] | undefined} */
    get(name) { return headers[name.toLowerCase()]; },
    ...overrides,
    headers,
    rawHeaders,
  };
}

/**
 * @returns {{
 *   statusCode: number,
 *   body: unknown,
 *   headersSent: boolean,
 *   status: (statusCode: number) => any,
 *   json: (body: unknown) => any
 * }}
 */
function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
}

/**
 * @param {(queryText: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }>} [query]
 * @returns {{
 *   pool: { maintenanceMode: boolean },
 *   query: (queryText: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }>
 * }}
 */
function createPool(query = async () => ({ rows: [] })) {
  return {
    pool: { maintenanceMode: false },
    query,
  };
}

/**
 * @param {Record<string, any>} req
 * @param {ReturnType<typeof createPool>} [pool]
 */
async function runMiddleware(req, pool = createPool()) {
  const res = createResponse();
  let nextCalls = 0;

  await authMiddleware(pool)(req, res, () => {
    nextCalls += 1;
  });

  return { req, res, nextCalls };
}

test("accepts the configured legacy-format key only on an allowlisted mobile route", async () => {
  const req = createRequest({
    headers: { "api-key": mobileApiKey },
  });

  const result = await runMiddleware(req);

  assert.equal(result.nextCalls, 1);
  assert.equal(result.req.apiKey, true);
  assert.notEqual(result.req.apiKey, mobileApiKey);
});

test("accepts one Express-equivalent trailing slash on mobile routes", async () => {
  const result = await runMiddleware(
    createRequest({
      originalUrl: "/api/invoices/ids/",
      path: "/invoices/ids/",
      headers: { "api-key": mobileApiKey },
    })
  );

  assert.equal(result.nextCalls, 1);
});

test("rejects a valid mobile key on non-mobile and unsafe-query routes", async () => {
  const nonMobile = await runMiddleware(
    createRequest({
      originalUrl: "/api/backup/create",
      path: "/backup/create",
      headers: { "api-key": mobileApiKey },
    })
  );
  assert.equal(nonMobile.res.statusCode, 403);
  assert.equal(nonMobile.nextCalls, 0);

  const productQuery = await runMiddleware(
    createRequest({
      originalUrl: "/api/products?type=MEE",
      path: "/products",
      headers: { "api-key": mobileApiKey },
      query: { type: "MEE" },
    })
  );
  assert.equal(productQuery.res.statusCode, 403);
  assert.equal(productQuery.nextCalls, 0);

  const nestedInvoiceRoute = await runMiddleware(
    createRequest({
      method: "DELETE",
      originalUrl: "/api/invoices/F-123/restore",
      path: "/invoices/F-123/restore",
      headers: { "api-key": mobileApiKey },
    })
  );
  assert.equal(nestedInvoiceRoute.res.statusCode, 403);
  assert.equal(nestedInvoiceRoute.nextCalls, 0);
});

test("allows the safe read-only product flags but not the type filter", async () => {
  const allProducts = await runMiddleware(
    createRequest({
      originalUrl: "/api/products?all=true",
      path: "/products",
      headers: { "api-key": mobileApiKey },
      query: { all: "true" },
    })
  );
  assert.equal(allProducts.nextCalls, 1);

  const bareAll = await runMiddleware(
    createRequest({
      originalUrl: "/api/products?all",
      path: "/products",
      headers: { "api-key": mobileApiKey },
      query: { all: "" },
    })
  );
  assert.equal(bareAll.nextCalls, 1);

  const withInactive = await runMiddleware(
    createRequest({
      originalUrl: "/api/products?all&includeInactive=true",
      path: "/products",
      headers: { "api-key": mobileApiKey },
      query: { all: "", includeInactive: "true" },
    })
  );
  assert.equal(withInactive.nextCalls, 1);

  const unsafeType = await runMiddleware(
    createRequest({
      originalUrl: "/api/products?type=MEE",
      path: "/products",
      headers: { "api-key": mobileApiKey },
      query: { type: "MEE" },
    })
  );
  assert.equal(unsafeType.res.statusCode, 403);
  assert.equal(unsafeType.nextCalls, 0);

  const unknownParam = await runMiddleware(
    createRequest({
      originalUrl: "/api/products?foo=bar",
      path: "/products",
      headers: { "api-key": mobileApiKey },
      query: { foo: "bar" },
    })
  );
  assert.equal(unknownParam.res.statusCode, 403);
  assert.equal(unknownParam.nextCalls, 0);
});

test("accepts the logged salesman sync query and rejects unsupported variants", async () => {
  const allowed = await runMiddleware(
    createRequest({
      originalUrl: "/api/staffs/get-salesmen?fields=minimal",
      path: "/staffs/get-salesmen",
      headers: { "api-key": mobileApiKey },
      query: { fields: "minimal" },
    })
  );
  assert.equal(allowed.nextCalls, 1);
  assert.equal(allowed.req.apiKey, true);

  /** @type {Record<string, unknown>[]} */
  const rejectedQueries = [
    { fields: "full" },
    { fields: "" },
    { fields: ["minimal", "minimal"] },
    { fields: { value: "minimal" } },
    { fields: "minimal", extra: "true" },
  ];
  for (const query of rejectedQueries) {
    const rejected = await runMiddleware(
      createRequest({
        originalUrl: "/api/staffs/get-salesmen",
        path: "/staffs/get-salesmen",
        headers: { "api-key": mobileApiKey },
        query,
      })
    );
    assert.equal(rejected.res.statusCode, 403);
    assert.equal(rejected.nextCalls, 0);
  }

  const otherEndpoint = await runMiddleware(
    createRequest({
      originalUrl: "/api/customers/get-customers?fields=minimal",
      path: "/customers/get-customers",
      headers: { "api-key": mobileApiKey },
      query: { fields: "minimal" },
    })
  );
  assert.equal(otherEndpoint.res.statusCode, 403);
  assert.equal(otherEndpoint.nextCalls, 0);
});

test("allows only the supported minimal-response query on mobile submissions", async () => {
  const minimal = await runMiddleware(
    createRequest({
      method: "POST",
      originalUrl: "/api/invoices/submit-invoices?fields=minimal",
      path: "/invoices/submit-invoices",
      headers: { "api-key": mobileApiKey },
      query: { fields: "minimal" },
    })
  );
  assert.equal(minimal.nextCalls, 1);

  const unexpected = await runMiddleware(
    createRequest({
      method: "POST",
      originalUrl: "/api/einvoice/submit?fields=full",
      path: "/einvoice/submit",
      headers: { "api-key": mobileApiKey },
      query: { fields: "full" },
    })
  );
  assert.equal(unexpected.res.statusCode, 403);
  assert.equal(unexpected.nextCalls, 0);
});

test("allows only a scalar customerId filter on mobile customer-product lookup", async () => {
  const filtered = await runMiddleware(
    createRequest({
      originalUrl: "/api/customer-products/all?customerId=NEW%20FRESHMART",
      path: "/customer-products/all",
      headers: { "api-key": mobileApiKey },
      query: { customerId: "NEW FRESHMART" },
    })
  );
  assert.equal(filtered.nextCalls, 1);

  const duplicate = await runMiddleware(
    createRequest({
      originalUrl:
        "/api/customer-products/all?customerId=ONE&customerId=ANOTHER",
      path: "/customer-products/all",
      headers: { "api-key": mobileApiKey },
      query: { customerId: ["ONE", "ANOTHER"] },
    })
  );
  assert.equal(duplicate.res.statusCode, 403);
  assert.equal(duplicate.nextCalls, 0);
});

test("rejects invalid, duplicate, and ambiguous authentication headers", async () => {
  const invalid = await runMiddleware(
    createRequest({ headers: { "api-key": "b2".repeat(32) } })
  );
  assert.equal(invalid.res.statusCode, 401);

  const duplicate = await runMiddleware(
    createRequest({
      headers: { "api-key": mobileApiKey },
      rawHeaders: ["api-key", mobileApiKey, "Api-Key", mobileApiKey],
    })
  );
  assert.equal(duplicate.res.statusCode, 401);

  const ambiguous = await runMiddleware(
    createRequest({
      headers: {
        "api-key": mobileApiKey,
        "x-session-id": "sess_1700000000000_abcdefg",
      },
    })
  );
  assert.equal(ambiguous.res.statusCode, 400);
});

test("session initialization requires a cookie and binds identity to its session", async () => {
  const sessionId = browserSessionId;
  const authenticatedPool = createPool(async (queryText) => {
    if (queryText === "SELECT 1") {
      return { rows: [{}] };
    }
    return {
      rows: [
        {
          session_id: sessionId,
          staff_id: "OFFICE_1",
          staff_name: "Office User",
          staff_job: ["OFFICE"],
          last_active: new Date(),
        },
      ],
    };
  });
  const anonymous = await runMiddleware(
    createRequest({
      method: "POST",
      originalUrl: "/api/sessions/initialize",
      path: "/sessions/initialize",
      headers: { origin: browserOrigin, "x-session-id": sessionId },
      body: { sessionId, staffId: null },
    })
  );
  assert.equal(anonymous.res.statusCode, 401);
  assert.equal(anonymous.nextCalls, 0);

  const impersonation = await runMiddleware(
    createRequest({
      method: "POST",
      originalUrl: "/api/sessions/initialize",
      path: "/sessions/initialize",
      headers: browserHeaders,
      body: { sessionId, staffId: "OTHER_STAFF" },
    }),
    authenticatedPool
  );
  assert.equal(impersonation.nextCalls, 1);
  assert.equal(impersonation.req.staffId, "OFFICE_1");
  assert.equal(impersonation.req.session.session_id, sessionId);

  const matchingIdentity = await runMiddleware(
    createRequest({
      method: "POST",
      originalUrl: "/api/sessions/initialize",
      path: "/sessions/initialize",
      headers: browserHeaders,
      body: { sessionId, staffId: "OFFICE_1" },
    }),
    authenticatedPool
  );
  assert.equal(matchingIdentity.nextCalls, 1);
});

test("session authentication requires an active office staff record", async () => {
  /** @type {{ queryText: string, values?: unknown[] }[]} */
  const queries = [];
  const sessionId = browserSessionId;
  const pool = createPool(async (queryText, values) => {
    queries.push({ queryText, values });
    if (queryText === "SELECT 1") {
      return { rows: [{}] };
    }
    return {
      rows: [
        {
          session_id: sessionId,
          staff_id: "OFFICE_1",
          staff_name: "Office User",
          staff_job: JSON.stringify(["OFFICE"]),
          last_active: new Date(),
        },
      ],
    };
  });

  const result = await runMiddleware(
    createRequest({
      originalUrl: "/api/dashboard",
      path: "/dashboard",
      headers: browserHeaders,
    }),
    pool
  );

  assert.equal(result.nextCalls, 1);
  assert.deepEqual(result.req.user, { id: "OFFICE_1" });
  assert.deepEqual(result.req.session.staff.job, ["OFFICE"]);

  const sessionQuery = queries.find(({ queryText }) =>
    queryText.includes("FROM active_sessions")
  )?.queryText;
  assert.match(sessionQuery, /JOIN staffs/);
  assert.match(sessionQuery, /s\.staff_id IS NOT NULL/);
  assert.match(sessionQuery, /st\.job \? 'OFFICE'/);
  assert.match(sessionQuery, /st\.date_resigned/);
  assert.match(sessionQuery, /s\.last_active > NOW\(\) - INTERVAL '8 hours'/);
  assert.match(sessionQuery, /s\.created_at > NOW\(\) - INTERVAL '12 hours'/);
  assert.deepEqual(queries.find(({ queryText }) => queryText.includes("FROM active_sessions"))?.values, [sessionId]);
});

test("session state requests do not bypass active-office validation", async () => {
  /** @type {string[]} */
  const queries = [];
  const result = await runMiddleware(
    createRequest({
      originalUrl: "/api/sessions/state",
      path: "/sessions/state",
      headers: browserHeaders,
    }),
    createPool(async (queryText) => {
      queries.push(queryText);
      return { rows: [] };
    })
  );

  assert.equal(result.res.statusCode, 401);
  assert.equal(result.nextCalls, 0);
  assert.equal(
    queries.some((queryText) => queryText.includes("FROM active_sessions")),
    true
  );
});

/** Run requests against an ephemeral loopback server, never the real ERP.
 * @param {import('express').Express} app
 * @param {(baseUrl: string) => Promise<void>} run
 * @returns {Promise<void>}
 */
async function withHttpApp(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = /** @type {import('node:net').AddressInfo} */ (server.address());
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
  }
}

test("mobile HTTP routes work without office cookies or a browser origin", async () => {
  const app = express();
  const authenticate = authMiddleware(createPool(async () => {
    throw new Error("Mobile authentication must not query office accounts or sessions");
  }));
  for (const prefix of ["/api", "/greentarget/api", "/jellypolly/api"]) app.use(prefix, authenticate);
  app.use((req, res) => res.json({ mobile: req.apiKey === true }));
  /** @type {[string, string][]} */
  const routes = [
    ["GET", "/api/staffs/get-salesmen"],
    ["GET", "/api/staffs/get-salesmen?fields=minimal"],
    ["GET", "/api/staffs/get-salesmen/?fields=minimal"],
    ["GET", "/api/invoices/ids"],
    ["GET", "/api/customers/get-customers"],
    ["GET", "/api/products"],
    ["GET", "/api/products?all"],
    ["GET", "/api/products?all=true&includeInactive=true"],
    ["GET", "/api/customer-products/all"],
    ["GET", "/api/customer-products/all?customerId=NEW%20FRESHMART"],
    ["POST", "/api/invoices/submit-invoices"],
    ["POST", "/api/invoices/submit-invoices?fields=minimal"],
    ["POST", "/api/einvoice/submit"],
    ["POST", "/api/einvoice/submit?fields=minimal"],
    ["DELETE", "/api/invoices/MOBILE-TEST_123"],
  ];
  await withHttpApp(app, async (baseUrl) => {
    for (const [method, path] of routes) {
      const response = await fetch(`${baseUrl}${path}`, { method, headers: { "api-key": mobileApiKey } });
      assert.equal(response.status, 200, `${method} ${path}`);
      assert.deepEqual(await response.json(), { mobile: true });
      assert.equal(response.headers.get("set-cookie"), null);
    }
    const withOrigin = await fetch(`${baseUrl}/api/staffs/get-salesmen?fields=minimal`, {
      headers: { "api-key": mobileApiKey, origin: "capacitor://localhost", cookie: "erp_session=stale" },
    });
    assert.equal(withOrigin.status, 200);
    assert.deepEqual(await withOrigin.json(), { mobile: true });

    for (const path of [
      "/api/staffs/get-salesmen?fields=minimal&fields=minimal",
      "/api/staffs/get-salesmen?fields[value]=minimal",
      "/api/products?type=MEE",
      "/api/backup/list",
      "/greentarget/api/customers",
      "/jellypolly/api/invoices",
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { headers: { "api-key": mobileApiKey } });
      assert.equal(response.status, 403, path);
      await response.json();
    }
  });
});

test("salesman sync reaches the actual staff route and retains its response shape", async () => {
  /** @type {{ id: string, name: string, email: string }[]} */
  const salesmen = [{ id: "SALESMAN_FIXTURE", name: "Test Salesman", email: "salesman@example.invalid" }];
  /** @type {string[]} */
  const queries = [];
  const pool = createPool(async (queryText) => {
    queries.push(queryText);
    assert.match(queryText, /job::jsonb \? 'SALESMAN'/);
    return { rows: salesmen };
  });
  const app = express();
  app.use("/api", authMiddleware(pool));
  app.use("/api/staffs", staffRouter(pool));
  await withHttpApp(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/staffs/get-salesmen?fields=minimal`, {
      headers: { "api-key": mobileApiKey },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), salesmen);
  });
  assert.equal(queries.length, 1);
});

test("office cookies require an approved origin and old bearer headers cannot log in", async () => {
  for (const origin of [undefined, "https://untrusted.example"]) {
    const result = await runMiddleware(createRequest({
      headers: { cookie: browserHeaders.cookie, ...(origin ? { origin } : {}) },
    }));
    assert.equal(result.res.statusCode, 403);
    assert.equal(result.nextCalls, 0);
  }
  for (const headers of [
    { origin: browserOrigin, "x-session-id": browserSessionId },
    { origin: browserOrigin, cookie: `${SESSION_COOKIE}=short` },
    { origin: browserOrigin, cookie: `${browserHeaders.cookie}; ${browserHeaders.cookie}` },
  ]) {
    const result = await runMiddleware(createRequest({ headers }));
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.nextCalls, 0);
  }
});

test("session initialization HTTP response ignores a client-selected staff ID and token", async () => {
  const pool = createPool(async (queryText) => {
    if (queryText === "SELECT 1") return { rows: [{}] };
    assert.match(queryText, /FROM active_sessions/);
    return { rows: [{ session_id: browserSessionId, staff_id: "OFFICE_1", staff_name: "Office User",
      staff_job: ["OFFICE"], last_active: new Date(), status: "active" }] };
  });
  const app = express();
  app.use(express.json());
  app.use("/api", authMiddleware(pool));
  app.use("/api/sessions", sessionsRouter(pool));
  await withHttpApp(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/sessions/initialize`, {
      method: "POST", headers: { ...browserHeaders, "content-type": "application/json" },
      body: JSON.stringify({ staffId: "MATTHEW", sessionId: "attacker-selected-token" }),
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.staff.id, "OFFICE_1");
    assert.equal(data.staff.isSecurityAdmin, false);
    assert.equal(data.sessionId, undefined);
  });
});

test("existing shared-password login issues a secure session without a password migration", async () => {
  const password = "test-only-shared-office-password";
  const hash = await bcrypt.hash(password, 4);
  /** @type {string[]} */
  const queries = [];
  /** @type {unknown} */
  let issuedSession;
  /** @type {boolean} */
  let released = false;
  const query = async (/** @type {string} */ queryText, /** @type {unknown[]} */ values = []) => {
    queries.push(queryText);
    assert.doesNotMatch(queryText, /password_reset_required|UPDATE staffs/);
    if (queryText.includes("SELECT id, name")) return { rows: [{ id: "MATTHEW", name: "Admin Fixture", password: hash, ic_no: "test-office-ic", job: ["OFFICE"] }] };
    if (queryText.includes("SELECT password")) return { rows: [{ password: hash }] };
    if (queryText.includes("INSERT INTO active_sessions")) issuedSession = values[0];
    return { rows: [] };
  };
  const pool = { ...createPool(query), connect: async () => ({ query, release: () => { released = true; } }) };
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter(pool));
  await withHttpApp(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: { origin: browserOrigin, "content-type": "application/json" },
      body: JSON.stringify({ ic_no: "test-office-ic", password, sessionId: "attacker-selected-token", new_password: "ignored-old-form-field" }),
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.user.id, "MATTHEW");
    assert.equal(data.user.isSecurityAdmin, true);
    assert.equal(data.user.password, undefined);
    assert.equal(data.sessionId, "cookie-session");
    assert.match(/** @type {string} */ (issuedSession), /^[A-Za-z0-9_-]{43}$/);
    const cookie = response.headers.get("set-cookie") || "";
    assert.ok(cookie.startsWith(`${SESSION_COOKIE}=${issuedSession};`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.doesNotMatch(cookie, /Domain=/);
    if (process.env.NODE_ENV === "production") assert.match(cookie, /Secure/);
  });
  assert.equal(released, true);
  assert.ok(queries.includes("BEGIN") && queries.includes("COMMIT"));
});

test("only an administrator can provision an OFFICE account with the existing shared credential", async () => {
  /** @type {string} */
  const sharedHash = await bcrypt.hash("test-only-shared-office-password", 4);
  /** @type {unknown} */
  let provisionedPassword;
  /** @type {number} */
  let inserts = 0;
  const pool = createPool(async (queryText, values = []) => {
    if (queryText === "SELECT 1") return { rows: [{}] };
    if (queryText.includes("FROM active_sessions")) return { rows: [{
      session_id: values[0], staff_id: values[0] === browserSessionId ? "MATTHEW" : "OFFICE_1",
      staff_name: "Office Fixture", staff_job: ["OFFICE"], last_active: new Date(), status: "active",
    }] };
    if (queryText.includes("SELECT password")) {
      assert.deepEqual(values, ["MATTHEW"]);
      return { rows: [{ password: sharedHash }] };
    }
    if (queryText.includes("INSERT INTO staffs")) {
      provisionedPassword = values[27];
      inserts += 1;
      return { rows: [{ id: values[0], password: provisionedPassword }] };
    }
    return { rows: [] };
  });
  const app = express();
  app.use(express.json());
  app.use("/api", authMiddleware(pool));
  app.use("/api/staffs", staffRouter(pool));
  await withHttpApp(app, async (baseUrl) => {
    const body = JSON.stringify({ id: "NEW_OFFICE_FIXTURE", name: "New Office", job: ["OFFICE"], location: [] });
    const allowed = await fetch(`${baseUrl}/api/staffs`, {
      method: "POST", headers: { ...browserHeaders, "content-type": "application/json" }, body,
    });
    assert.equal(allowed.status, 201);
    assert.equal((await allowed.json()).staff.password, undefined);
    assert.equal(provisionedPassword, sharedHash);
    const forbidden = await fetch(`${baseUrl}/api/staffs`, {
      method: "POST", headers: { origin: browserOrigin, cookie: `${SESSION_COOKIE}=${"o".repeat(43)}`, "content-type": "application/json" }, body,
    });
    assert.equal(forbidden.status, 403);
    await forbidden.json();
  });
  assert.equal(inserts, 1);
});
