import express from "express";
import axios from 'axios';


const onUpdateRouter = express.Router();
const orders = {}; // Store orders (ensure this is shared across files if needed)

// Middleware to validate update requests
function isValidUpdateRequest(request) {
  return request && request.context && request.message && request.message.order;
}

function isPartFillAcceptable(order) {
  return true;
}

function isValidReturnReason(reasonCode) {
  return true;
}

onUpdateRouter.post("/on_update", async (req, res) => {
  try {
    const updateRequest = req.body;
    console.log("Received /ondc/on_update request:", updateRequest);

    if (!isValidUpdateRequest(updateRequest)) {
      return res.status(400).json({
        context: updateRequest.context,
        error: { type: "DOMAIN-ERROR", code: "23002", message: "Invalid /ondc/on_update request" },
      });
    }

    const { context, message } = updateRequest;
    const { order } = message;

    const existingOrder = orders[order.id];
    if (!existingOrder) {
      return res.status(404).json({
        context,
        error: { type: "DOMAIN-ERROR", code: "31002", message: "Order not found" },
      });
    }

    // Handle part cancellation
    if (order.fulfillments && order.fulfillments.some(f => f.state.descriptor.code === 'Cancelled' && f.type === 'part_cancellation')) {
      const cancelledFulfillment = order.fulfillments.find(f => f.state.descriptor.code === 'Cancelled' && f.type === 'part_cancellation');
      const cancelledItems = cancelledFulfillment.items;

      existingOrder.quote.price.value -= cancelledItems.reduce((sum, item) => sum + (item.price.value * item.quantity.count), 0);
      existingOrder.quote.breakup = existingOrder.quote.breakup.filter(item => !cancelledItems.some(cancelledItem => cancelledItem.id === item["@ondc/org/item_id"]));

      existingOrder.fulfillments.push(cancelledFulfillment);

      if (!isPartFillAcceptable(existingOrder)) {
        return res.status(400).json({
          context,
          error: { code: "22501", message: "Part fill not acceptable" },
        });
      }

      try {
        const response = await axios.post('http://localhost/opencart-3/index.php?route=api/order/edit', {
          api_token: '905e623744794d600e5d3d0e7e',
          order_id: existingOrder.id,
          order_status_id: '7',
          comment: `Part cancellation via ONDC update. Cancelled items: ${cancelledItems.map(item => item.id).join(', ')}`,
        });

        if (response.status !== 200) {
          console.error("Failed to update order status in OpenCart:", response.data);
          return res.status(500).json({ context, error: { type: "CORE-ERROR", code: "31001", message: "OpenCart update failed" } });
        }
      } catch (error) {
        console.error("Error updating order status in OpenCart:", error);
        return res.status(500).json({ context, error: { type: "CORE-ERROR", code: "31001", message: "OpenCart update error" } });
      }
    }

    // Handle returns
    if (order.returns && order.returns.length > 0) {
      const returnRequest = order.returns[0];

      if (!isValidReturnReason(returnRequest.return_reason.descriptor.code)) {
        return res.status(400).json({ context, error: { code: "30005", message: "Invalid return reason code" } });
      }

      const returnedItem = existingOrder.items.find(item => item.id === returnRequest.item.id);
      if (returnedItem) {
        returnedItem.status = returnRequest.state.descriptor.code;
      }

      try {
        const response = await axios.post('http://localhost/opencart-3/index.php?route=api/order/edit', {
          api_token: '905e623744794d600e5d3d0e7e',
          order_id: existingOrder.id,
          order_status_id: '10',
          comment: `Return request for item ${returnRequest.item.id} ${returnRequest.state.descriptor.code} via ONDC update.`,
        });

        if (response.status !== 200) {
          console.error("Failed to update order status in OpenCart:", response.data);
          return res.status(500).json({ context, error: { type: "CORE-ERROR", code: "31001", message: "OpenCart update failed" } });
        }
      } catch (error) {
        console.error("Error updating order status in OpenCart:", error);
        return res.status(500).json({ context, error: { type: "CORE-ERROR", code: "31001", message: "OpenCart update error" } });
      }
    }

    // Handle fulfillment updates
    if (order.fulfillments && order.fulfillments.some(f => f.type === 'delivery' && f.state.descriptor.code !== 'Cancelled')) {
      const updatedFulfillment = order.fulfillments.find(f => f.type === 'delivery' && f.state.descriptor.code !== 'Cancelled');
      const existingFulfillment = existingOrder.fulfillments.find(f => f.id === updatedFulfillment.id);
      if (existingFulfillment) {
        existingFulfillment.state = updatedFulfillment.state;
        existingFulfillment.updated_at = updatedFulfillment.updated_at;
      }

      try {
        const response = await axios.post('http://localhost/opencart-3/index.php?route=api/order/edit', {
          api_token: '905e623744794d600e5d3d0e7e',
          order_id: existingOrder.id,
          comment: `Fulfillment ${updatedFulfillment.id} updated to ${updatedFulfillment.state.descriptor.code} via ONDC update.`,
        });

        if (response.status !== 200) {
          console.error("Failed to update order status in OpenCart:", response.data);
          return res.status(500).json({ context, error: { type: "CORE-ERROR", code: "31001", message: "OpenCart update failed" } });
        }
      } catch (error) {
        console.error("Error updating order status in OpenCart:", error);
        return res.status(500).json({ context, error: { type: "CORE-ERROR", code: "31001", message: "OpenCart update error" } });
      }
    }

    orders[order.id] = existingOrder;

    res.json({
      context,
      message: { ack: { status: "ACK" } },
    });

  } catch (error) {
    console.error("Error in /ondc/on_update:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { onUpdateRouter };

