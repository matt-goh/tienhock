// src/middleware/schema-middleware.js
export const schemaMiddleware = (pool) => async (req, res, next) => {
  try {
    // Get path from URL
    const path = req.originalUrl;

    // Default is to use only public schema
    let companySchema = null;

    // Determine schema based on path prefix
    if (path.includes("/greentarget/")) {
      companySchema = "greentarget";
    } else if (path.includes("/jellypolly/")) {
      companySchema = "jellypolly";
    }

    // Store schema info in request for later use
    req.companySchema = companySchema;

    next();
  } catch (error) {
    console.error("Schema middleware error:", error);
    next(error);
  }
};
