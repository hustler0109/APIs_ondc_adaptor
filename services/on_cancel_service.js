import { OrderStatus } from '../constants.js';
import { getBapOrder, updateBapOrder, processCancelledOrder } from './on_confirm_service.js'; // Corrected import

async function handleOnCancelRequest(requestBody) {
    const onCancelResponse = requestBody;
    const context = onCancelResponse?.context;
    const message = onCancelResponse?.message;
    const errorPayload = onCancelResponse?.error;
    const orderId = message?.order?.id;
    const orderState = message?.order?.state;
    const transactionId = context?.transaction_id;

    console.log(`[BAP Service][${transactionId}] Processing /on_cancel request. OrderID: ${orderId}, State: ${orderState}`);

    if (!context || !transactionId) {
         console.error("[BAP Service] Invalid /on_cancel: Missing or invalid context/transaction_id.");
         return { sendAck: false, error: { type: "CONTEXT-ERROR", code:"30001", message: "Missing context or transaction_id" }};
    }
    if (!message && !errorPayload) {
        console.error(`[BAP Service][${transactionId}] Invalid /on_cancel: Missing message and error object.`);
        return { sendAck: false, error: { type: "JSON-SCHEMA-ERROR", code: "30001", message: "Request must have either a message or an error object" }};
    }
     if (message && !orderId) {
        console.error(`[BAP Service][${transactionId}] Invalid /on_cancel message: Missing order.id`);
        return { sendAck: false, error: { type: "DOMAIN-ERROR", code: "30004", message: "Missing order.id in message" }};
     }

     const effectiveOrderId = orderId || context.message_id;

     if (message && !orderState && !errorPayload) {
        console.error(`[BAP Service][${effectiveOrderId}] Invalid /on_cancel: Missing order.state in message.order`);
        const order = getBapOrder(effectiveOrderId);
        if (order) updateBapOrder(effectiveOrderId, OrderStatus.FAILED, onCancelResponse, 'NACK', { type: "DOMAIN-ERROR", code: "30005", message: "Missing order.state" });
        return { sendAck: false, error: { type: "DOMAIN-ERROR", code: "30005", message: "Missing order.state in message.order" }};
     }

    const originalBapOrderData = getBapOrder(effectiveOrderId);

    if (!originalBapOrderData) {
        console.error(`[BAP Service][${effectiveOrderId}] Received /on_cancel for unknown/mismatched OrderID.`);
        return { sendAck: false, error: { type: "DOMAIN-ERROR", code: "31002", message: `Order ID ${effectiveOrderId} not found or doesn't match original request` }};
    }

    const terminalStates = [OrderStatus.CANCELLED, OrderStatus.CANCELLED_BY_SELLER, OrderStatus.CANCEL_ERROR, OrderStatus.FAILED];
    if (terminalStates.includes(originalBapOrderData.status)) {
         console.log(`[BAP Service][${effectiveOrderId}] Idempotency: /on_cancel received for order already in terminal state: ${originalBapOrderData.status}. Sending previous ACK/NACK.`);
         if (originalBapOrderData.ackNackSent === 'ACK') {
             return { sendAck: true };
         } else {
             return { sendAck: false, error: originalBapOrderData.nackReason || { type: "DOMAIN-ERROR", code: "GENERIC-NACK", message: `Duplicate /on_cancel or terminal state, previously NACKed or failed` }};
         }
    }

    if (errorPayload) {
        console.warn(`[BAP Service][${effectiveOrderId}] /on_cancel received with explicit error from BPP:`, errorPayload);
        updateBapOrder(effectiveOrderId, OrderStatus.CANCEL_ERROR, onCancelResponse, 'ACK');
        processCancelledOrder(effectiveOrderId, `Cancellation failed by Seller: ${errorPayload.message || errorPayload.code}`);
        return { sendAck: true };
    }

    if (message) {
        if (orderState === OrderStatus.CANCELLED) {
            console.log(`[BAP Service][${effectiveOrderId}] Order cancellation confirmed by BPP.`);
            updateBapOrder(effectiveOrderId, OrderStatus.CANCELLED, onCancelResponse, 'ACK');
            processCancelledOrder(effectiveOrderId, "Cancelled successfully by Seller");
            return { sendAck: true };
        } else {
             console.error(`[BAP Service][${effectiveOrderId}] Received /on_cancel with unexpected order state: ${orderState}. Expecting '${OrderStatus.CANCELLED}'.`);
             const nackError = { type: "DOMAIN-ERROR", code: "30008", message: `Received /on_cancel with unexpected order state: ${orderState}` };
             updateBapOrder(effectiveOrderId, OrderStatus.FAILED, onCancelResponse, 'NACK', nackError);
             return { sendAck: false, error: nackError };
        }
    }

    console.error(`[BAP Service][${effectiveOrderId}] Reached unexpected state in /on_cancel handler.`);
    const fallbackError = { type: "CORE-ERROR", code: "50000", message: "Unexpected processing state in /on_cancel" };
    updateBapOrder(effectiveOrderId, OrderStatus.FAILED, onCancelResponse, 'NACK', fallbackError);
    return { sendAck: false, error: fallbackError };
}

export { handleOnCancelRequest };