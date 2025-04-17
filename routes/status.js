import express from "express";
import { handleStatusRequest } from "../services/status_service.js";

const statusRouter = express.Router();

statusRouter.post("/status", async (req, res) => {
  const requestBody = req.body;
  const context = requestBody?.context;
  const orderId = requestBody?.message?.order_id;
  const transactionId = context?.transaction_id;

  console.log(`[BPP Route][${orderId || transactionId}] Received POST /status request.`);

  try {
    const result = await handleStatusRequest(requestBody);

    if (result?.needsAck) {
      console.log(`[BPP Route][${orderId || transactionId}] Sending ACK response for /status.`);
      res.status(200).json({
        context: {
            transaction_id: transactionId,
            message_id: context?.message_id,
            bpp_id: process.env.BPP_ID,
            bpp_uri: process.env.BPP_URI
        },
        message: { ack: { status: "ACK" } }
      });
    } else {
       console.error(`[BPP Route][${orderId || transactionId}] Service did not signal ACK for /status, but no error thrown?`);
       res.status(500).json({ message: { ack: { status: "NACK" } }, error: { code: "500", message: "Internal Server Error" } });
    }

  } catch (error) {
    console.error(`[BPP Route][${orderId || transactionId || 'Unknown'}] Error processing /status: ${error.message}`);
    res.status(error.statusCode || 400).json({
      context: {
          transaction_id: transactionId || 'N/A',
          message_id: context?.message_id || 'N/A',
          bpp_id: process.env.BPP_ID,
          bpp_uri: process.env.BPP_URI
      },
      message: { ack: { status: "NACK" } },
      error: {
        type: error.errorType || "CORE-ERROR",
        code: error.errorCode || "40000",
        message: error.message
      }
    });
  }
});

export { statusRouter };

