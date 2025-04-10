import { v4 as uuidv4 } from "uuid"; // Use import
import axios from "axios";          // Use import

let bppOrders = {};

function generateONDCContext(originalContext, action = "on_confirm") {
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

function createFulfillments(order) {
  const fulfillmentFromOrder = order?.fulfillments?.[0];
  const endLocation = fulfillmentFromOrder?.end?.location;
  const billingInfo = order?.billing;

  if (!fulfillmentFromOrder || !endLocation || !endLocation.address || !endLocation.gps || !billingInfo?.phone) {
      console.error("[Create Fulfillment Error] Missing mandatory fulfillment/end location/billing contact details in order:", { fulfillmentFromOrder, endLocation, billingInfo });
      throw new Error("Missing or incomplete mandatory fulfillment end location or billing contact details in order");
  }

  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + (parseInt(process.env.DEFAULT_DELIVERY_MINUTES || '60') * 60000));

  return [
    {
      id: fulfillmentFromOrder.id || "FULFILLMENT-1",
      type: fulfillmentFromOrder.type || "Delivery",
      tracking: process.env.ENABLE_TRACKING === 'true' || false,
      state: {
        descriptor: {
          code: "Pending",
          name: "Order Accepted"
        }
      },
      start: {
        location: {
          gps: process.env.STORE_GPS,
          address: {
            locality: process.env.STORE_LOCALITY, city: process.env.CITY_NAME, state: process.env.STATE_NAME, country: process.env.COUNTRY_CODE, area_code: process.env.STORE_PINCODE
          }
        },
        time: {
           range: { start: startTime.toISOString(), end: new Date(startTime.getTime() + (parseInt(process.env.PREPARATION_MINUTES || '15') * 60000)).toISOString() }
        },
        contact: { phone: process.env.STORE_PHONE, email: process.env.STORE_EMAIL }
      },
      end: {
        location: endLocation,
        time: {
           range: { start: new Date(startTime.getTime() + (parseInt(process.env.PREPARATION_MINUTES || '15') * 60000)).toISOString(), end: endTime.toISOString() }
        },
        contact: { phone: billingInfo.phone, email: billingInfo.email }
      }
    }
  ];
}

function generateOrderResponse(originalOrder, acceptanceStatus = "Accepted") {
   if (!originalOrder?.items || !originalOrder.billing || !originalOrder.quote || !originalOrder.payment) {
        console.error("[Generate Order Response Error] Missing essential fields in originalOrder:", { items: !!originalOrder.items, billing: !!originalOrder.billing, quote: !!originalOrder.quote, payment: !!originalOrder.payment });
        throw new Error("Cannot generate confirmation, essential order details (items, billing, quote, payment) are missing from the original request.");
   }

  const confirmedFulfillments = createFulfillments(originalOrder);

  return {
    id: originalOrder.id,
    state: acceptanceStatus,
    provider: originalOrder.provider,
    items: originalOrder.items,
    billing: originalOrder.billing,
    fulfillments: confirmedFulfillments,
    quote: originalOrder.quote,
    payment: {
        ...originalOrder.payment,
        status: "PAID",
        params: {
            ...originalOrder.payment?.params,
            amount: originalOrder.quote.price.value,
            transaction_status: "Captured"
        }
    },
    created_at: originalOrder.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

async function decideOrderAcceptance(orderId, orderDetails) {
    console.log(`[BPP][${orderId}] Simulating acceptance check...`);
    await new Promise(resolve => setTimeout(resolve, 50));
    if (orderDetails?.items?.some(item => item.id === "REJECT_ME")) {
        console.log(`[BPP][${orderId}] Mock rejection.`);
        return { accepted: false, reasonCode: "003", reasonMessage: "Item not available" };
    }
    const isServiceable = process.env.SERVICEABLE_PINCODES?.split(',').includes(orderDetails?.fulfillments?.[0]?.end?.location?.address?.area_code);
    if (!isServiceable) {
        console.log(`[BPP][${orderId}] Rejection: Pincode ${orderDetails?.fulfillments?.[0]?.end?.location?.address?.area_code} not serviceable.`);
        return { accepted: false, reasonCode: "001", reasonMessage: "Delivery location not serviceable" };
    }

    console.log(`[BPP][${orderId}] Mock acceptance.`);
    return { accepted: true };
}

async function sendOnConfirm(bapUri, onConfirmPayload, retries = 3, initialDelay = 1000) {
    const targetUrl = `${bapUri}/on_confirm`;
    let attempt = 0;
    const orderId = onConfirmPayload?.context?.transaction_id;

    while (attempt < retries) {
        attempt++;
        console.log(`[BPP][${orderId}] Attempt ${attempt}/${retries} sending /on_confirm to ${targetUrl}`);
        try {
            const response = await axios.post(targetUrl, onConfirmPayload, {
                headers: { "Content-Type": "application/json" },
                timeout: 8000
            });

            if (response.status === 200 && response.data?.message?.ack?.status === "ACK") {
                console.log(`[BPP][${orderId}] /on_confirm sent successfully and ACK received from BAP.`);
                return true;
            } else if (response.status === 200 && response.data?.message?.ack?.status === "NACK") {
                 console.error(`[BPP][${orderId}] NACK received from BAP for /on_confirm. Stopping retries. Reason:`, response.data.error || "No error details provided");
                 return false;
            } else {
                 console.warn(`[BPP][${orderId}] Unexpected response for /on_confirm from BAP (Status: ${response.status}). Body:`, response.data);
            }
        } catch (error) {
            const errorDetails = error.response ? `Status: ${error.response.status}, Body: ${JSON.stringify(error.response.data)}` : error.message;
            console.error(`[BPP][${orderId}] Error sending /on_confirm (Attempt ${attempt}/${retries}): ${errorDetails}`);
             if (error.code === 'ECONNABORTED') {
                 console.error(`[BPP][${orderId}] Request timed out.`);
             }
        }
        if (attempt < retries) {
            const delay = initialDelay * Math.pow(2, attempt - 1);
            console.log(`[BPP][${orderId}] Retrying /on_confirm in ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    console.error(`[BPP][${orderId}] /on_confirm failed to send or get ACK after ${retries} attempts.`);
    return false;
}

async function handleConfirmRequest(requestBody) {
  const { context, message } = requestBody;
  const incomingOrder = message?.order;
  const orderId = incomingOrder?.id;
  const bapUri = context?.bap_uri;
  const transactionId = context?.transaction_id;

  if (!context || !bapUri || !message || !incomingOrder || !orderId || !transactionId) {
    console.error("[BPP] Invalid /confirm payload: missing essential fields.", { context, orderId, bapUri });
    const error = new Error("Invalid request payload: missing context, message, order, order ID, BAP URI, or transaction ID");
    error.statusCode = 400;
    error.errorCode = "30001";
    error.errorType = "CONTEXT-ERROR";
    throw error;
  }

   if (bppOrders[orderId]) {
     console.log(`[BPP][${orderId}] Idempotency: /confirm request already received.`);
     if (bppOrders[orderId].status === 'ON_CONFIRM_SENT' && bppOrders[orderId].onConfirmResponsePayload) {
         console.log(`[BPP][${orderId}] Idempotency: Resending previous /on_confirm.`);
         sendOnConfirm(bapUri, bppOrders[orderId].onConfirmResponsePayload).catch(err => console.error(`[BPP][${orderId}] Idempotency: Error resending /on_confirm`, err));
     }
     return { needsAck: true, processed: true };
   }

  console.log(`[BPP][${orderId}] Storing initial confirm request.`);
  bppOrders[orderId] = {
    originalRequest: JSON.parse(JSON.stringify(requestBody)),
    status: 'RECEIVED',
    onConfirmResponsePayload: null,
    lastUpdatedAt: Date.now(),
    catalogSnapshot: {}
  };
  
  for (const item of incomingOrder?.items || []) {
    bppOrders[orderId].catalogSnapshot[item.id] = {
      "@ondc/org/cancellable": item["@ondc/org/cancellable"] ?? true
    };
  }
  


  setImmediate(async () => {
    let onConfirmPayload;
    try {
        console.log(`[BPP][${orderId}] Starting async processing.`);
        bppOrders[orderId].status = 'PROCESSING';
        bppOrders[orderId].lastUpdatedAt = Date.now();

        const { accepted, reasonCode, reasonMessage } = await decideOrderAcceptance(orderId, incomingOrder);

        const onConfirmContext = generateONDCContext(context, "on_confirm");

        if (accepted) {
            console.log(`[BPP][${orderId}] Order Accepted. Generating success /on_confirm.`);
            const confirmedOrder = generateOrderResponse(incomingOrder, "Accepted");
            onConfirmPayload = {
                context: onConfirmContext,
                message: { order: confirmedOrder }
            };
            bppOrders[orderId].status = 'ACCEPTED';
        } else {
            console.log(`[BPP][${orderId}] Order Rejected. Generating rejection /on_confirm.`);
             const cancelledOrder = {
                 id: orderId,
                 state: "Cancelled",
                 provider: incomingOrder.provider ? { id: incomingOrder.provider.id, locations: incomingOrder.provider.locations ? [{ id: incomingOrder.provider.locations[0]?.id }] : [] } : {},
                 items: incomingOrder.items?.map(i => ({ id: i.id, quantity: i.quantity })),
                 cancellation: {
                     cancelled_by: context.bpp_id,
                     reason: { code: reasonCode || "003" }
                 },
                 updated_at: new Date().toISOString()
            };
            onConfirmPayload = {
                context: onConfirmContext,
                message: { order: cancelledOrder }
            };
             bppOrders[orderId].status = 'REJECTED';
        }

        bppOrders[orderId].onConfirmResponsePayload = onConfirmPayload;
        bppOrders[orderId].lastUpdatedAt = Date.now();

        console.log(`[BPP][${orderId}] Attempting to send /on_confirm to ${bapUri}`);
        const sentOk = await sendOnConfirm(bapUri, onConfirmPayload);

        bppOrders[orderId].status = sentOk ? 'ON_CONFIRM_SENT' : 'ON_CONFIRM_FAILED';
        bppOrders[orderId].lastUpdatedAt = Date.now();

    } catch (error) {
        console.error(`[BPP][${orderId}] Error during async confirm processing:`, error);
        bppOrders[orderId].status = 'ERROR';
        bppOrders[orderId].lastUpdatedAt = Date.now();

        const errorContext = generateONDCContext(context || bppOrders[orderId]?.originalRequest?.context, "on_confirm");
        const errorPayload = {
             context: errorContext,
             error: {
                 type: error.isDomainError ? "DOMAIN-ERROR" : "CORE-ERROR",
                 code: error.errorCode || "50001",
                 message: `BPP error processing order: ${error.message}`
             }
        };
        bppOrders[orderId].onConfirmResponsePayload = errorPayload;
        console.error(`[BPP][${orderId}] Attempting to send error /on_confirm to ${bapUri}`);
        sendOnConfirm(bapUri || bppOrders[orderId]?.originalRequest?.context?.bap_uri, errorPayload).catch(sendErr => {
            console.error(`[BPP][${orderId}] Failed even to send the error /on_confirm notification.`, sendErr);
        });
    }
  });

  console.log(`[BPP][${orderId}] Initial validation passed. Async processing triggered. Signaling ACK.`);
  return { needsAck: true, processed: false };

}

// Use named export for ESM
export { handleConfirmRequest, bppOrders }; // Add bppOrders to the export list