import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { bppOrders } from './confirm_service.js';
import { OrderStatus, AllowedCancelationReasons, NonCancellableStates } from '../constants.js';

async function checkAllItemsCancellable(orderItems, catalogSnapshot) {
    if (!orderItems || orderItems.length === 0) return true;
    if (!catalogSnapshot || Object.keys(catalogSnapshot).length === 0) return true;

    for (const item of orderItems) {
        const isCancellable = catalogSnapshot[item.id]?.["@ondc/org/cancellable"];
        if (isCancellable === false) {
            console.warn(`[BPP] Item ${item.id} is marked non-cancellable.`);
            return false;
        }
    }
    return true;
}

async function initiateRefundIfNeeded(confirmedOrder) {
    const paymentStatus = confirmedOrder?.payment?.status;
    const paymentType = confirmedOrder?.payment?.type;
    const collectedBy = confirmedOrder?.payment?.collected_by;

    if (paymentType === 'ON-ORDER' && collectedBy === 'BPP' && ['PAID', 'Captured'].includes(paymentStatus)) {
        console.log(`[BPP][${confirmedOrder.id}] Placeholder: Initiating refund process for prepaid order.`);
    } else {
        console.log(`[BPP][${confirmedOrder.id}] No BPP refund initiation needed (Payment: ${paymentType}/${collectedBy}/${paymentStatus}).`);
    }
}

async function sendOnCancel(bapUri, onCancelPayload, retries = 3, initialDelay = 1000) {
    const targetUrl = `${bapUri}/on_cancel`;
    let attempt = 0;
    const orderId = onCancelPayload?.message?.order?.id || onCancelPayload?.context?.transaction_id;

    while (attempt < retries) {
        attempt++;
        console.log(`[BPP][${orderId}] Attempt ${attempt}/${retries} sending /on_cancel to ${targetUrl}`);
        try {
            const response = await axios.post(targetUrl, onCancelPayload, {
                headers: { "Content-Type": "application/json" },
                timeout: 8000
            });

            if (response.status === 200 && response.data?.message?.ack?.status === "ACK") {
                console.log(`[BPP][${orderId}] /on_cancel sent successfully and ACK received from BAP.`);
                return true;
            } else if (response.status === 200 && response.data?.message?.ack?.status === "NACK") {
                console.error(`[BPP][${orderId}] NACK received from BAP for /on_cancel. Stopping retries. Reason:`, response.data.error || "No error details provided");
                return false;
            } else {
                console.warn(`[BPP][${orderId}] Unexpected response for /on_cancel from BAP (Status: ${response.status}). Body:`, response.data);
            }
        } catch (error) {
            const errorDetails = error.response ? `Status: ${error.response.status}, Body: ${JSON.stringify(error.response.data)}` : error.message;
            console.error(`[BPP][${orderId}] Error sending /on_cancel (Attempt ${attempt}/${retries}): ${errorDetails}`);
            if (error.code === 'ECONNABORTED') {
                console.error(`[BPP][${orderId}] Request timed out.`);
            }
        }
        if (attempt < retries) {
            const delay = initialDelay * Math.pow(2, attempt - 1);
            console.log(`[BPP][${orderId}] Retrying /on_cancel in ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    console.error(`[BPP][${orderId}] /on_cancel failed to send or get ACK after ${retries} attempts.`);
    return false;
}

function generateONDCContext(originalContext, action = "on_cancel") {
    if (!originalContext) {
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

async function handleCancelRequest(requestBody) {
    const { context, message } = requestBody;
    const orderId = message?.order_id;
    const cancellationReasonId = message?.cancellation_reason_id;
    const bapUri = context?.bap_uri;
    const transactionId = context?.transaction_id;
    const requestTimestamp = context?.timestamp;
    const ttl = context?.ttl;

    if (!context || !bapUri || !message || !orderId || !cancellationReasonId || !transactionId || !requestTimestamp) {
        const error = new Error("Invalid request payload: missing context, message, order_id, cancellation_reason_id, BAP URI, transaction ID or timestamp");
        error.statusCode = 400;
        error.errorCode = "30001";
        error.errorType = "CONTEXT-ERROR";
        throw error;
    }

    if (ttl) {
        const requestTime = Date.parse(requestTimestamp);
        if (isNaN(requestTime) || (Date.now() - requestTime > 120000)) {
            const error = new Error("Request timestamp is too old or invalid.");
            error.statusCode = 400;
            error.errorCode = "30011";
            error.errorType = "CONTEXT-ERROR";
            throw error;
        }
    }

    if (!AllowedCancelationReasons.has(cancellationReasonId)) {
        const error = new Error(`Invalid cancellation_reason_id: ${cancellationReasonId}`);
        error.statusCode = 400;
        error.errorCode = "40005";
        error.errorType = "DOMAIN-ERROR";
        throw error;
    }

    const existingOrder = bppOrders[orderId];
    if (existingOrder?.status === OrderStatus.CANCELLED || existingOrder?.status === OrderStatus.ON_CANCEL_SENT) {
        if (existingOrder.status === OrderStatus.ON_CANCEL_SENT && existingOrder.onCancelResponsePayload) {
            sendOnCancel(bapUri, existingOrder.onCancelResponsePayload).catch(err => console.error(`[BPP][${orderId}] Error resending /on_cancel`, err));
        }
        return { needsAck: true, processed: true };
    }

    if (existingOrder) {
        existingOrder.status = OrderStatus.CANCEL_REQUESTED;
        existingOrder.lastUpdatedAt = Date.now();
        existingOrder.cancelRequest = JSON.parse(JSON.stringify(requestBody));
    } else {
        bppOrders[orderId] = {
            originalRequest: null,
            status: OrderStatus.CANCEL_REQUESTED,
            cancelRequest: JSON.parse(JSON.stringify(requestBody)),
            onCancelResponsePayload: null,
            lastUpdatedAt: Date.now()
        };
    }

    setImmediate(async () => {
        let onCancelPayload;
        try {
            const orderToCancel = bppOrders[orderId];
            if (!orderToCancel || !orderToCancel.originalRequest?.message?.order) {
                throw new Error("Order details not found for cancellation processing.");
            }

            const order = orderToCancel.originalRequest.message.order;
            const currentOrderState = order.state;
            const isCancellableState = !NonCancellableStates.includes(currentOrderState);
            const allItemsMarkedCancellable = await checkAllItemsCancellable(order.items, orderToCancel.catalogSnapshot);

            if (isCancellableState && allItemsMarkedCancellable) {
                const onCancelContext = generateONDCContext(context, "on_cancel");
                const cancelledOrderObject = {
                    ...order,
                    id: orderId,
                    state: OrderStatus.CANCELLED,
                    cancellation: {
                        cancelled_by: context.bap_id,
                        reason: { id: cancellationReasonId }
                    },
                    updated_at: new Date().toISOString()
                };

                onCancelPayload = { context: onCancelContext, message: { order: cancelledOrderObject } };
                orderToCancel.status = OrderStatus.CANCELLED;

                if (currentOrderState === OrderStatus.SHIPPED) {
                    console.log(`[BPP][${orderId}] Triggering logistics cancellation call.`);
                }

                await initiateRefundIfNeeded(order);
            } else {
                const onCancelContext = generateONDCContext(context, "on_cancel");
                let rejectionMessage = `Order cannot be cancelled in current state (${currentOrderState}).`;
                if (!allItemsMarkedCancellable) {
                    rejectionMessage = "Order cannot be cancelled as one or more items are non-cancellable.";
                }
                onCancelPayload = {
                    context: onCancelContext,
                    error: {
                        type: "DOMAIN-ERROR",
                        code: "50001",
                        message: rejectionMessage
                    }
                };
                orderToCancel.status = OrderStatus.CANCEL_REJECTED;
            }

            orderToCancel.onCancelResponsePayload = onCancelPayload;
            orderToCancel.lastUpdatedAt = Date.now();
            const sentOk = await sendOnCancel(bapUri, onCancelPayload);
            orderToCancel.status = sentOk
                ? OrderStatus.ON_CANCEL_SENT
                : (orderToCancel.status === OrderStatus.CANCELLED
                    ? OrderStatus.CANCELLED_SEND_FAILED
                    : OrderStatus.CANCEL_REJECTED_SEND_FAILED);
        } catch (error) {
            const orderRecord = bppOrders[orderId];
            if (orderRecord) {
                orderRecord.status = OrderStatus.CANCEL_ERROR;
                orderRecord.lastUpdatedAt = Date.now();
            }

            const errorContext = generateONDCContext(context || orderRecord?.cancelRequest?.context, "on_cancel");
            const errorPayload = {
                context: errorContext,
                error: {
                    type: error.isDomainError ? "DOMAIN-ERROR" : "CORE-ERROR",
                    code: error.errorCode || "50001",
                    message: `BPP error processing cancellation: ${error.message}`
                }
            };

            if (orderRecord) orderRecord.onCancelResponsePayload = errorPayload;
            sendOnCancel(bapUri || orderRecord?.cancelRequest?.context?.bap_uri, errorPayload).catch(sendErr => {
                console.error(`[BPP][${orderId}] Failed to send cancellation error /on_cancel`, sendErr);
            });
        }
    });

    return { needsAck: true, processed: false };
}

export { handleCancelRequest };
