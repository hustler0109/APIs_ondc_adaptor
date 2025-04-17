import express from "express";
import { handleOnStatusRequest } from "../services/on_status_service.js";

const onStatusRouter = express.Router();

function createAckResponse(context) {
    return {
        message: { ack: { status: "ACK" } }
    };
}

function createNackResponse(context, errorDetails) {
    console.warn(`[BAP Route] Sending NACK for /on_status: Type=${errorDetails?.type}, Code=${errorDetails?.code}, Msg=${errorDetails?.message}`);
    return {
        message: { ack: { status: "NACK" } },
        error: {
            type: errorDetails?.type || "CORE-ERROR",
            code: errorDetails?.code || "50000",
            message: errorDetails?.message || "BAP failed to process the on_status request"
        }
    };
}

onStatusRouter.post("/on_status", async (req, res) => {
  const requestBody = req.body;
  const context = requestBody?.context;
  const transactionId = context?.transaction_id;

  console.log(`[BAP Route][${transactionId}] Received POST /on_status request.`);

  try {
    const result = await handleOnStatusRequest(requestBody);

    if (result?.sendAck) {
      res.status(200).json(createAckResponse(context));
    } else {
      res.status(400).json(createNackResponse(context, result?.error));
    }

  } catch (error) {
    console.error(`[BAP Route][${transactionId || 'Unknown'}] Unexpected error processing /on_status: ${error.message}`, error.stack);
    res.status(500).json(createNackResponse(context, { type: "CORE-ERROR", code: "50000", message: `Internal BAP error: ${error.message}`}));
  }
});

export { onStatusRouter };
