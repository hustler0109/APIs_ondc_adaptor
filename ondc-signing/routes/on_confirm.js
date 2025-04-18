import express from "express";                                     // Use import
import { handleOnConfirmRequest } from "../services/on_confirm_service.js"; // Use import with .js extension

const router = express.Router();

function createAckResponse(context) {
    return {
        message: { ack: { status: "ACK" } }
    };
}

function createNackResponse(context, errorDetails) {
    console.warn(`[BAP Route] Sending NACK: Type=${errorDetails?.type}, Code=${errorDetails?.code}, Msg=${errorDetails?.message}`);
    return {
        message: { ack: { status: "NACK" } },
        error: {
            type: errorDetails?.type || "CORE-ERROR",
            code: errorDetails?.code || "50000",
            message: errorDetails?.message || "BAP failed to process the request"
        }
    };
}

router.post("/on_confirm", async (req, res) => {
  const requestBody = req.body;
  const context = requestBody?.context;
  const transactionId = context?.transaction_id;

  console.log(`[BAP Route][${transactionId}] Received POST /on_confirm request.`);

  try {
    const result = await handleOnConfirmRequest(requestBody);

    if (result?.sendAck) {
      res.status(200).json(createAckResponse(context));
    } else {
      res.status(400).json(createNackResponse(context, result?.error));
    }

  } catch (error) {
    console.error(`[BAP Route][${transactionId || 'Unknown'}] Unexpected error processing /on_confirm: ${error.message}`, error.stack);
    res.status(500).json(createNackResponse(context, { type: "CORE-ERROR", code: "50000", message: `Internal BAP error: ${error.message}`}));
  }
});

export { router as onConfirmRouter };