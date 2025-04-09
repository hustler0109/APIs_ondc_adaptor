import _ from 'lodash';        // Use import
import crypto from 'crypto';   // Use import

let bapOrders = {};

const addBapOrder = (orderId, context, orderDetails) => {
    if (bapOrders[orderId]) {
        console.warn(`[BAP Store] Attempted to add duplicate OrderID: ${orderId}`);
        return;
    }
    console.log(`[BAP Store] Storing initiated order: ${orderId}`);
    bapOrders[orderId] = {
        originalOrderDetails: JSON.parse(JSON.stringify(orderDetails)),
        originalContext: JSON.parse(JSON.stringify(context)),
        status: 'CONFIRM_SENT',
        onConfirmReceivedPayload: null,
        ackNackSent: null,
        nackReason: null,
        lastUpdatedAt: Date.now()
    };
};

const getBapOrder = (orderId) => {
    return bapOrders[orderId];
};

const updateBapOrder = (orderId, status, onConfirmPayload = null, ackNack = null, nackReason = null) => {
     const order = bapOrders[orderId];
    if (order) {
        order.status = status;
        if (onConfirmPayload) order.onConfirmReceivedPayload = JSON.parse(JSON.stringify(onConfirmPayload));
        if (ackNack) order.ackNackSent = ackNack;
        if (nackReason) order.nackReason = nackReason;
        else if (ackNack === 'ACK') order.nackReason = null;

        order.lastUpdatedAt = Date.now();
        console.log(`[BAP Store] Updated OrderID ${orderId}: Status=${status}, AckNackSent=${order.ackNackSent}`);
    } else {
        console.error(`[BAP Store] Cannot update status for non-existent OrderID: ${orderId}`);
    }
};

function compareOrderObjects(original, received) {
    if (!original || !received) return false;

    const itemsMatch = _.isEqual(
        original.items?.map(item => ({ id: item.id, quantity: item.quantity })),
        received.items?.map(item => ({ id: item.id, quantity: item.quantity }))
    );

    const quoteValueMatch = original.quote?.price?.value === received.quote?.price?.value;

    const fulfillmentMatch = original.fulfillments?.[0]?.type === received.fulfillments?.[0]?.type &&
                             original.fulfillments?.[0]?.end?.location?.address?.area_code === received.fulfillments?.[0]?.end?.location?.address?.area_code;

    if (!itemsMatch) console.warn("[BAP Compare] Order items mismatch.");
    if (!quoteValueMatch) console.warn("[BAP Compare] Order quote value mismatch.");
    if (!fulfillmentMatch) console.warn("[BAP Compare] Order fulfillment details mismatch.");

    return itemsMatch && quoteValueMatch && fulfillmentMatch;
}

function processConfirmedOrder(confirmedOrderDetails) {
    console.log(`[BAP Action] Processing confirmed order: ${confirmedOrderDetails.id}. Final State: ${confirmedOrderDetails.state}`);
    console.log(`[BAP Action] Notifying buyer about confirmation for Order ID: ${confirmedOrderDetails.id}`);
}

function processCancelledOrder(orderId, reason) {
     console.log(`[BAP Action] Processing cancelled order: ${orderId}. Reason: ${reason}`);
     console.log(`[BAP Action] Notifying buyer about cancellation for Order ID: ${orderId}. Reason: ${reason}`);
}

async function handleOnConfirmRequest(requestBody) {
    const onConfirmResponse = requestBody;
    const context = onConfirmResponse?.context;
    const message = onConfirmResponse?.message;
    const errorPayload = onConfirmResponse?.error;
    const orderId = message?.order?.id;
    const orderState = message?.order?.state;
    const transactionId = context?.transaction_id;

    console.log(`[BAP Service][${transactionId}] Processing /on_confirm request. OrderID: ${orderId}, State: ${orderState}`);

    if (!context || !transactionId) {
         console.error("[BAP Service] Invalid /on_confirm: Missing or invalid context/transaction_id.");
         return { sendAck: false, error: { type: "CONTEXT-ERROR", code:"30001", message: "Missing context or transaction_id" }};
    }
    if (!message && !errorPayload) {
        console.error(`[BAP Service][${transactionId}] Invalid /on_confirm: Missing message and error object.`);
        return { sendAck: false, error: { type: "JSON-SCHEMA-ERROR", code: "30001", message: "Request must have either a message or an error object" }};
    }
     if (message && !orderId) {
        console.error(`[BAP Service][${transactionId}] Invalid /on_confirm message: Missing order.id`);
        return { sendAck: false, error: { type: "DOMAIN-ERROR", code: "30004", message: "Missing order.id in message" }};
     }

     const effectiveOrderId = orderId || context.message_id;

     if (message && !orderState && !errorPayload) {
        console.error(`[BAP Service][${effectiveOrderId}] Invalid /on_confirm: Missing order.state in message.order`);
        const order = getBapOrder(effectiveOrderId);
        if (order) updateBapOrder(effectiveOrderId, 'FAILED', onConfirmResponse, 'NACK', { type: "DOMAIN-ERROR", code: "30005", message: "Missing order.state" });
        return { sendAck: false, error: { type: "DOMAIN-ERROR", code: "30005", message: "Missing order.state in message.order" }};
     }

    const originalBapOrderData = getBapOrder(effectiveOrderId);

    if (!originalBapOrderData) {
        console.error(`[BAP Service][${effectiveOrderId}] Received /on_confirm for unknown/mismatched OrderID.`);
        return { sendAck: false, error: { type: "DOMAIN-ERROR", code: "31002", message: `Order ID ${effectiveOrderId} not found or doesn't match original request` }};
    }

    if (originalBapOrderData.ackNackSent) {
         console.log(`[BAP Service][${effectiveOrderId}] Idempotency: /on_confirm already processed. Resending previous ${originalBapOrderData.ackNackSent}.`);
         if (originalBapOrderData.ackNackSent === 'ACK') {
             return { sendAck: true };
         } else {
             return { sendAck: false, error: originalBapOrderData.nackReason || { type: "DOMAIN-ERROR", code: "GENERIC-NACK", message: `Duplicate /on_confirm, previously NACKed` }};
         }
    }

    let validationError = null;

    if (errorPayload) {
        console.warn(`[BAP Service][${effectiveOrderId}] /on_confirm received with explicit error from BPP:`, errorPayload);
        updateBapOrder(effectiveOrderId, 'FAILED', onConfirmResponse, 'ACK');
        processCancelledOrder(effectiveOrderId, `Error from Seller: ${errorPayload.message || errorPayload.code}`);
        return { sendAck: true };
    }

    if (message) {
        if (originalBapOrderData.status === 'CANCELLED_BY_BUYER') {
            console.log(`[BAP Service][${effectiveOrderId}] OrderID was cancelled locally by buyer before /on_confirm received.`);
            validationError = { type: "DOMAIN-ERROR", code: "40001", message: "Order already cancelled by buyer" };
        }
        else if (orderState === "Cancelled") {
            console.log(`[BAP Service][${effectiveOrderId}] OrderID was cancelled by the seller in /on_confirm.`);
            updateBapOrder(effectiveOrderId, 'CANCELLED_BY_SELLER', onConfirmResponse, 'ACK');
            processCancelledOrder(effectiveOrderId, "Cancelled by Seller");
            return { sendAck: true };
        }
        else {
            const originalOrder = originalBapOrderData.originalOrderDetails;
            const receivedOrder = message.order;
            const significantFieldsMatch = compareOrderObjects(originalOrder, receivedOrder);

            if (!significantFieldsMatch) {
                 console.error(`[BAP Service][${effectiveOrderId}] Order object changed significantly.`);
                 validationError = { type: "DOMAIN-ERROR", code: "31003", message: "Order details mismatch (items, fulfillment, or quote differs)" };
            }
        }
    }

    if (validationError) {
        console.error(`[BAP Service][${effectiveOrderId}] Validation failed for /on_confirm: ${validationError.message}`);
        updateBapOrder(effectiveOrderId, 'FAILED', onConfirmResponse, 'NACK', validationError);
        return { sendAck: false, error: validationError };
    } else {
        console.log(`[BAP Service][${effectiveOrderId}] /on_confirm validated successfully. Final State from BPP: ${orderState}`);
        updateBapOrder(effectiveOrderId, 'CONFIRMED', onConfirmResponse, 'ACK');
        processConfirmedOrder(message.order);
        return { sendAck: true };
    }
}

function generateUniqueBapId() {
    return `bap-order-${crypto.randomBytes(12).toString('hex')}`;
}

(() => {
    const newOrderId = generateUniqueBapId();
    const mockContext = {
        domain: process.env.DOMAIN || "retail:1.1.0",
        country: process.env.COUNTRY_CODE || "IND",
        city: process.env.CITY_CODE || "std:033",
        action: 'confirm',
        core_version: process.env.CORE_VERSION || "1.2.0",
        bap_id: process.env.BAP_ID || "buyerapp.com",
        bap_uri: process.env.BAP_URI || "http://localhost:5001",
        bpp_id: "sellerapp.com",
        bpp_uri: "http://localhost:5002",
        transaction_id: `txn-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        message_id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: new Date().toISOString(),
        ttl: 'PT30S'
    };
    const mockOrderDetails = {
        id: newOrderId,
        items: [ { id: "ITEM101", quantity: { count: 2 }, fulfillment_id: "FULFILL_1" }, ],
        quote: { price: { currency: "INR", value: "250.00" }, breakUp: [ ], ttl: 'PT15M' },
        billing: { name: "Test Buyer", address: "1 Some Street, Kolkata, 700020", phone: "9876543210", email: "test@buyer.com" },
        fulfillments: [{ id: "FULFILL_1", type: "Delivery", end: { location: { gps: "22.5300,88.3600", address: { area_code: "700020" } }, contact: { phone: "9876543210" } } }],
        payment: { type: "ON-ORDER", collected_by: "BAP", params: { transaction_id: "dummy-bap-txn-123"}, status: "NOT-PAID" },
    };
    console.log(`\n--- Simulating BAP Storing Order ${newOrderId} Before Sending /confirm ---\n`);
    addBapOrder(newOrderId, mockContext, mockOrderDetails);
})();

// Use named exports for ESM
export {
  handleOnConfirmRequest,
  addBapOrder,
  getBapOrder,
};