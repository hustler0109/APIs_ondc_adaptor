import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { bppOrders } from './confirm_service.js';
import { OrderStatus } from '../constants.js';

async function sendOnStatus(bapUri, onStatusPayload, retries = 3, initialDelay = 1000) {
    const targetUrl = `${bapUri}/on_status`;
    let attempt = 0;
    const orderId = onStatusPayload?.message?.order?.id || onStatusPayload?.context?.transaction_id;

    while (attempt < retries) {
        attempt++;
        console.log(`[BPP][${orderId}] Attempt ${attempt}/${retries} sending /on_status to ${targetUrl}`);
        try {
            const response = await axios.post(targetUrl, onStatusPayload, {
                headers: { "Content-Type": "application/json" },
                timeout: 8000
            });

            if (response.status === 200 && response.data?.message?.ack?.status === "ACK") {
                console.log(`[BPP][${orderId}] /on_status sent successfully and ACK received from BAP.`);
                return true;
            } else if (response.status === 200 && response.data?.message?.ack?.status === "NACK") {
                 console.error(`[BPP][${orderId}] NACK received from BAP for /on_status. Stopping retries. Reason:`, response.data.error || "No error details provided");
                 return false;
            } else {
                 console.warn(`[BPP][${orderId}] Unexpected response for /on_status from BAP (Status: ${response.status}). Body:`, response.data);
            }
        } catch (error) {
            const errorDetails = error.response ? `Status: ${error.response.status}, Body: ${JSON.stringify(error.response.data)}` : error.message;
            console.error(`[BPP][${orderId}] Error sending /on_status (Attempt ${attempt}/${retries}): ${errorDetails}`);
             if (error.code === 'ECONNABORTED') {
                 console.error(`[BPP][${orderId}] Request timed out.`);
             }
        }
        if (attempt < retries) {
            const delay = initialDelay * Math.pow(2, attempt - 1);
            console.log(`[BPP][${orderId}] Retrying /on_status in ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    console.error(`[BPP][${orderId}] /on_status failed to send or get ACK after ${retries} attempts.`);
    return false;
}

function generateONDCContext(originalContext, action = "on_status") {
   if (!originalContext) {
    console.error("[Context Generation Error] Original context is missing.");
    return {
      domain: process.env.DOMAIN || "retail:1.1.0",
      country: process.env.COUNTRY_CODE || "IND",
      city: process.env.CITY_CODE || "std:033",
      core_version: process.env.CORE_VERSION || "1.2.0",
      action,
      bpp_id: process.env.BPP_ID,
      bpp_uri: process.env.BPP_URI,
      transaction_id: "unknown-txn-" + uuidv4(),
      message_id: uuidv4(),
      timestamp: new Date().toISOString(),
    };
  }
  return {
    ...originalContext,
    action,
    message_id: uuidv4(),
    timestamp: new Date().toISOString(),
    bpp_id: process.env.BPP_ID,
    bpp_uri: process.env.BPP_URI,
  };
}

async function handleStatusRequest(requestBody) {
  const { context, message } = requestBody;
  const orderId = message?.order_id;
  const bapUri = context?.bap_uri;
  const transactionId = context?.transaction_id;

  if (!context || !bapUri || !message || !orderId || !transactionId) {
    console.error("[BPP] Invalid /status payload: missing essential fields.", { context, orderId, bapUri });
    const error = new Error("Invalid request payload: missing context, message, order_id, BAP URI, or transaction ID");
    error.statusCode = 400; error.errorCode = "30001"; error.errorType = "CONTEXT-ERROR"; throw error;
  }

  console.log(`[BPP][${orderId}] Status request received. Triggering async response.`);

  setImmediate(async () => {
    let onStatusPayload;
    try {
        console.log(`[BPP][${orderId}] Starting async status processing.`);
        const orderRecord = bppOrders[orderId];

        const onStatusContext = generateONDCContext(context, "on_status");

        if (!orderRecord || !orderRecord.originalRequest?.message?.order) {
             console.error(`[BPP][${orderId}] Cannot process status request: Order details not found.`);
             onStatusPayload = {
                 context: onStatusContext,
                 error: {
                     type: "DOMAIN-ERROR",
                     code: "31002",
                     message: `Order with ID ${orderId} not found.`
                 }
             };
        } else {
             console.log(`[BPP][${orderId}] Order found. Generating success /on_status.`);
             const currentOrderData = {
                 ...orderRecord.originalRequest.message.order,
                 state: orderRecord.status,
                 updated_at: orderRecord.lastUpdatedAt ? new Date(orderRecord.lastUpdatedAt).toISOString() : new Date().toISOString(),
             };

             onStatusPayload = {
                 context: onStatusContext,
                 message: { order: currentOrderData }
             };
        }

        console.log(`[BPP][${orderId}] Attempting to send /on_status to ${bapUri}`);
        const sentOk = await sendOnStatus(bapUri, onStatusPayload);
        if(orderRecord) orderRecord.status = sentOk ? OrderStatus.ON_STATUS_SENT : OrderStatus.ON_STATUS_FAILED;

    } catch (error) {
        console.error(`[BPP][${orderId}] Error during async status processing:`, error);
        const orderRecord = bppOrders[orderId];
        if(orderRecord) orderRecord.status = OrderStatus.STATUS_ERROR;
        const errorContext = generateONDCContext(context || orderRecord?.originalRequest?.context, "on_status");
        const errorPayload = {
             context: errorContext,
             error: {
                 type: "CORE-ERROR",
                 code: "50001",
                 message: `Internal BPP error processing status request: ${error.message}`
             }
        };
        console.error(`[BPP][${orderId}] Attempting to send error /on_status to ${bapUri}`);
        sendOnStatus(bapUri || orderRecord?.originalRequest?.context?.bap_uri, errorPayload).catch(sendErr => {
            console.error(`[BPP][${orderId}] Failed even to send the status error /on_status notification.`, sendErr);
        });
    }
  });

  console.log(`[BPP][${orderId}] Initial validation passed for /status. Async processing triggered. Signaling ACK.`);
  return { needsAck: true };

}

export { handleStatusRequest };