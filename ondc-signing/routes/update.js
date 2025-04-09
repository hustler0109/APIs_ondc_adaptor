import express from 'express';
const updateRouter = express.Router();

const orders = {}; // Assuming orders is stored in-memory, update as needed

// Handle /ondc/update request
updateRouter.post("/update", async (req, res) => {
    try {
        const updateRequest = req.body;
        console.log("Received /ondc/update request:", updateRequest);

        if (!isValidUpdateRequest(updateRequest)) {
            return res.status(400).json({ error: "Invalid /ondc/update request" });
        }

        const { context, message } = updateRequest;
        const { order } = message;
        const { update_target, update_action } = order;

        const existingOrder = orders[order.id];
        if (!existingOrder) {
            return res.status(404).json({ error: "Order not found" });
        }

        const updateHandlers = {
            "item": handleItemUpdate,
            "fulfillment": handleFulfillmentUpdate,
            "payment": handlePaymentUpdate,
        };

        if (updateHandlers[update_target]) {
            updateHandlers[update_target](existingOrder, order, update_action);
        } else {
            return res.status(400).json({ error: "Invalid update target" });
        }

        orders[order.id] = existingOrder;

        res.json({
            context,
            message: { ack: { status: "ACK" } },
        });

    } catch (error) {
        console.error("Error in /ondc/update:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Validate update request
function isValidUpdateRequest(request) {
    if (!request || !request.context || !request.message || !request.message.order) {
        return false;
    }
    const { order } = request.message;
    return order.id && order.update_target && order.update_action;
}

// Handle item updates
function handleItemUpdate(existingOrder, order, update_action) {
    if (!order.items || order.items.length === 0) return;

    const itemId = order.items[0].id;

    switch (update_action) {
        case "cancel":
            existingOrder.items = existingOrder.items.filter(item => item.id !== itemId);
            break;
        case "return":
            const item = existingOrder.items.find(item => item.id === itemId);
            if (item) item.status = "returned";
            break;
        default:
            console.error("Invalid item update action:", update_action);
    }
}

// Handle fulfillment updates
function handleFulfillmentUpdate(existingOrder, order, update_action) {
    if (!order.fulfillments || order.fulfillments.length === 0) return;

    const fulfillmentId = order.fulfillments[0].id;

    switch (update_action) {
        case "update_status":
            const fulfillment = existingOrder.fulfillments.find(f => f.id === fulfillmentId);
            if (fulfillment) fulfillment.state.descriptor.code = order.fulfillments[0].state.descriptor.code;
            break;
        case "cancel":
            existingOrder.fulfillments = existingOrder.fulfillments.filter(f => f.id !== fulfillmentId);
            break;
        default:
            console.error("Invalid fulfillment update action:", update_action);
    }
}

// Handle payment updates
function handlePaymentUpdate(existingOrder, order, update_action) {
    if (!existingOrder.payment) return;

    switch (update_action) {
        case "refund":
            existingOrder.payment.status = "refunded";
            break;
        default:
            console.error("Invalid payment update action:", update_action);
    }
}
export { updateRouter };
