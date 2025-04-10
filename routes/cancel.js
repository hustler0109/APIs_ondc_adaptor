import express from "express";
import { handleCancelRequest } from "../services/cancel_service.js";

const router = express.Router();

router.post("/cancel", async (req, res) => {
  const requestBody = req.body;
  const context = requestBody?.context;
  const orderId = requestBody?.message?.order_id;
  const transactionId = context?.transaction_id;

  console.log(`[BPP Route][${orderId || transactionId}] Received POST /cancel request.`);

  try {
    const result = await handleCancelRequest(requestBody);

    if (result?.needsAck) {
      console.log(`[BPP Route][${orderId || transactionId}] Sending ACK response for /cancel.`);
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
       console.error(`[BPP Route][${orderId || transactionId}] Service did not signal ACK for /cancel, but no error thrown?`);
       res.status(500).json({ message: { ack: { status: "NACK" } }, error: { code: "500", message: "Internal Server Error" } });
    }

  } catch (error) {
    console.error(`[BPP Route][${orderId || transactionId || 'Unknown'}] Error processing /cancel: ${error.message}`);
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

export { router as cancelRouter };