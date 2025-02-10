// src/routes/test/test.js
import express from "express";

const router = express.Router();

export default function publicRouter() {
  // GET endpoint for basic testing
  router.get("/test", (req, res) => {
    res.json({
      message: "API test successful!",
    });
  });

  // POST endpoint for receiving bill data
  router.post("/bill", (req, res) => {
    try {
      const billData = req.body;
      console.log('Received bill data:', JSON.stringify(billData, null, 2));
      
      res.status(200).json({
        message: 'Bill data received successfully',
        data: billData
      });
    } catch (error) {
      console.error('Error processing bill:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  return router;
}