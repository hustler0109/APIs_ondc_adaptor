import { OrderStatus } from '../constants.js';
import { getBapOrder, updateBapOrder } from './on_confirm_service.js';

function processStatusUpdate(updatedOrderDetails) {
    console.log(`[BAP Action] Processing status update for order: ${updatedOrderDetails.id}. New State: ${updatedOrderDetails.state}`);
    console.log(`[BAP Action] Notifying buyer about status update for Order ID: ${updatedOrderDetails.id}`);
}

async function handleOnStatusRequest(requestBody) {
    const onStatusResponse = requestBody;
    const context = onStatusResponse?.context;
    const message = onStatusResponse?.message;
    const errorPayload = onStatusResponse?.error;
    const orderId = message?.order?.id;
    const orderState = message?.order?.state;
    const transactionId = context?.transaction_id;

    console.log(`[BAP Service][${transactionId}] Processing /on_status request. OrderID: ${orderId}, State: ${orderState}`);

    if (!context || !transactionId) {
         console.error("[BAP Service] Invalid /on_status: Missing or invalid context/transaction_id.");
         return { sendAck: false, error: { type: "CONTEXT-ERROR", code:"30001", message: "Missing context or transaction_id" }};
    }
    if (!message && !errorPayload) {
        console.error(`[BAP Service][${transactionId}] Invalid /on_status: Missing message and error object.`);
        return { sendAck: false, error: { type: "JSON-SCHEMA-ERROR", code: "30001", message: "Request must have either a message or an error object" }};
    }
     if (message && !orderId) {
        console.error(`[BAP Service][${transactionId}] Invalid /on_status message: Missing order.id`);
        return { sendAck: false, error: { type: "DOMAIN-ERROR", code: "30004", message: "Missing order.id in message" }};
     }

     const effectiveOrderId = orderId || context.message_id;

     if (message && !orderState && !errorPayload) {
        console.warn(`[BAP Service][${effectiveOrderId}] Received /on_status without order.state in message. Processing other updates.`);
     }

    const originalBapOrderData = getBapOrder(effectiveOrderId);

    if (!originalBapOrderData) {
        console.error(`[BAP Service][${effectiveOrderId}] Received /on_status for unknown/mismatched OrderID.`);
        return { sendAck: false, error: { type: "DOMAIN-ERROR", code: "31002", message: `Order ID ${effectiveOrderId} not found` }};
    }

    const terminalStates = [OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED];
    if (terminalStates.includes(originalBapOrderData.status)) {
         console.log(`[BAP Service][${effectiveOrderId}] Idempotency: /on_status received for order already in terminal state: ${originalBapOrderData.status}. Sending ACK but not processing further.`);
         return { sendAck: true };
    }

    if (errorPayload) {
        console.warn(`[BAP Service][${effectiveOrderId}] /on_status received with explicit error from BPP:`, errorPayload);
        updateBapOrder(effectiveOrderId, OrderStatus.FAILED, onStatusResponse, 'ACK');
        return { sendAck: true };
    }

    if (message && message.order) {
        console.log(`[BAP Service][${effectiveOrderId}] Status update received. New State: ${orderState}.`);
        const currentBapStatus = originalBapOrderData.status;
        updateBapOrder(
            effectiveOrderId,
            orderState || currentBapStatus,
            message.order,
            'ACK'
        );
        processStatusUpdate(message.order);
        return { sendAck: true };
    }

    console.error(`[BAP Service][${effectiveOrderId}] Reached unexpected state in /on_status handler.`);
    const fallbackError = { type: "CORE-ERROR", code: "50000", message: "Unexpected processing state in /on_status" };
    updateBapOrder(effectiveOrderId, OrderStatus.FAILED, onStatusResponse, 'NACK', fallbackError);
    return { sendAck: false, error: fallbackError };
}

export { handleOnStatusRequest };