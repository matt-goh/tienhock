import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

const mobileApiKey = "existing-mobile-key";
process.env.NODE_ENV = "test";
process.env.MOBILE_API_KEY_SHA256 = createHash("sha256")
  .update(mobileApiKey, "utf8")
  .digest("hex");

const { authMiddleware } = await import("./auth.js?auth-middleware-test");

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
    ...overrides,
    headers,
    rawHeaders,
  };
}

/**
 * @returns {{
 *   statusCode: number,
 *   body: unknown,
 *   status: (statusCode: number) => any,
 *   json: (body: unknown) => any
 * }}
 */
function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
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

test("session initialization requires authentication and cannot switch identity", async () => {
  const sessionId = "sess_1700000000000_abcdefg";
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
      headers: { "x-session-id": sessionId },
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
      headers: { "x-session-id": sessionId },
      body: { sessionId, staffId: "OTHER_STAFF" },
    }),
    authenticatedPool
  );
  assert.equal(impersonation.res.statusCode, 403);
  assert.equal(impersonation.nextCalls, 0);

  const matchingIdentity = await runMiddleware(
    createRequest({
      method: "POST",
      originalUrl: "/api/sessions/initialize",
      path: "/sessions/initialize",
      headers: { "x-session-id": sessionId },
      body: { sessionId, staffId: "OFFICE_1" },
    }),
    authenticatedPool
  );
  assert.equal(matchingIdentity.nextCalls, 1);
});

test("session authentication requires an active office staff record", async () => {
  const queries = [];
  const sessionId = "sess_1700000000000_abcdefg";
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
      headers: { "x-session-id": sessionId },
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
});

test("session state requests do not bypass active-office validation", async () => {
  const queries = [];
  const sessionId = "sess_1700000000000_abcdefg";
  const result = await runMiddleware(
    createRequest({
      originalUrl: `/api/sessions/state/${sessionId}`,
      path: `/sessions/state/${sessionId}`,
      headers: { "x-session-id": sessionId },
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
