import express from 'express';
import axios from 'axios';

const onSelectRouter = express.Router();

onSelectRouter.post('/on_select', async (req, res) => {
  try {
    const payload = req.body;
    const { items, provider } = payload.message.order;

    const providerId = provider.id;
    const fulfillmentId = `fulfillment-${providerId}`;

    let productDetails = [];

    // Fetch product details from OpenCart for each item
    for (const item of items) {
      const productId = item.id;
      const opencartApiUrl = `http://localhost/opencart-3/index.php?route=api/allproducts/productInfo&json&product_id=${productId}`;

      const response = await axios.get(opencartApiUrl);
      const productData = response.data;

      if (!productData || !productData.product_id) {
        return res.status(404).json({ error: `Product not found for ID: ${productId}` });
      }

      // Mapping OpenCart product data to ONDC format
      productDetails.push({
        fulfillment_id: fulfillmentId,
        id: productId,
        title: productData.name,
        price: {
          currency: "INR",
          value: productData.special || productData.price,
        },
        "@ondc/org/item_quantity": {
          count: item.quantity.count,
        },
      });
    }

    // Calculate total price
    const totalValue = productDetails.reduce((total, item) => 
      total + parseFloat(item.price.value) * item["@ondc/org/item_quantity"].count, 
    0).toFixed(2);

    // Construct ONDC response
    const ondcResponse = {
      context: {
        domain: payload.context.domain,
        action: "on_select",
        core_version: payload.context.core_version,
        bap_id: payload.context.bap_id,
        bap_uri: payload.context.bap_uri,
        bpp_id: payload.context.bpp_id,
        bpp_uri: payload.context.bpp_uri,
        transaction_id: payload.context.transaction_id,
        message_id: payload.context.message_id,
        city: payload.context.city,
        country: payload.context.country,
        timestamp: new Date().toISOString(),
      },
      message: {
        order: {
          provider: {
            id: providerId,
            locations: provider.locations,
          },
          items: productDetails,
          fulfillments: [
            {
              id: fulfillmentId,
              type: "Delivery",
              "@ondc/org/provider_name": "OpenCart Store",
              tracking: false,
              "@ondc/org/category": "Standard Delivery",
              "@ondc/org/TAT": "PT6H",
              state: {
                descriptor: {
                  code: "Serviceable",
                },
              },
            },
          ],
          quote: {
            price: {
              currency: "INR",
              value: totalValue,
            },
            breakup: productDetails.map((item) => ({
              "@ondc/org/item_id": item.id,
              "@ondc/org/item_quantity": item["@ondc/org/item_quantity"],
              title: item.title,
              "@ondc/org/title_type": "item",
              price: item.price,
            })),
          },
        },
      },
    };

    res.json(ondcResponse);
  } catch (error) {
    console.error('Error in on_select:', error.message);
    res.status(500).json({ error: "An error occurred while processing the request" });
  }
});

export { onSelectRouter };
