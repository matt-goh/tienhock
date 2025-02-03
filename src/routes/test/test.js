// src/routes/test/test.js
import express from "express";

const router = express.Router();

export default function testRouter(pool) {
  router.get("/test", (req, res) => {
    res.json({
      message: "API test successful!",
    });
  });

  return router;
}