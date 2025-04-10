import express from 'express';
import axios from "axios";
import { body, validationResult } from 'express-validator';

const selectRouter = express.Router();

// In-memory storage for demonstration purposes
const selectedOrders = {};

selectRouter.post('/select', 
  body('context').exists(),
  body('message.order.items').isArray().notEmpty(),
  body('message.order.items.*.id').exists().withMessage("Each item must have an ID"),
  body('message.order.items.*.quantity.count').isInt({ min: 1 }).withMessage("Each item must have a valid quantity"),
  body('message.order.provider.id').exists().withMessage("Provider ID is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const payload = req.body;
      const { items, provider } = payload.message.order;

      const providerId = provider.id;
      if (!provider || !provider.id) {
        return res.status(400).json({ error: "Provider ID is missing" });
      }
      
      // const fulfillmentId = `fulfillment-${providerId}-${Date.now()}`;
      const fulfillmentId = `fulfillment-${providerId}`;

      let productDetails = [];

      for (const item of items) {
        const productId = item.id;
        const opencartApiUrl = `http://localhost/opencart-3/index.php?route=api/allproducts/productInfo&json&product_id=${productId}`;

        try {
          const response = await axios.get(opencartApiUrl);
          if (!response.data || !response.data.product_id) {
            throw new Error(`Product not found: ${productId}`);
          }
          const productData = response.data;

          if (!productData || !productData.product_id) {
            // return res.status(404).json({ 
            //   error: {
            //     code: 'PRODUCT_NOT_FOUND',
            //     message: `Product not found for ID: ${productId}`
            //   } 
            // });
            productDetails.push({ error: `Product not found for ID: ${productId}` });
            continue;
          }

          productDetails.push({
            fulfillment_id: fulfillmentId,
            id: productId,
            title: productData.name,
            price: {
              currency: 'INR',
              value: productData.special || productData.price,
            },
            '@ondc/org/item_quantity': {
              count: item.quantity.count,
            },
          });
        } catch (error) {
          console.error(`Error fetching product data for ID: ${productId}`, error.message);
          return res.status(500).json({ error: `Error fetching product data for ID: ${productId}` });
        }
      }

      const totalValue = productDetails.reduce((total, item) => {
        // return total + parseFloat(item.price.value) * item['@ondc/org/item_quantity'].count;
        const itemPrice = parseFloat(item.price?.value || 0);
        const itemCount = item["@ondc/org/item_quantity"]?.count || 0;
        return total + itemPrice * itemCount;
      }, 0).toFixed(2);

      const ondcResponse = {
        context: {
          domain: payload.context.domain,
          action: 'on_select',
          core_version: payload.context.core_version,
          bap_id: payload.context.bap_id,
          bap_uri: payload.context.bap_uri,
          bpp_id: payload.context.bpp_id,
          bpp_uri: payload.context.bpp_uri,
          transaction_id: payload.context.transaction_id,
          message_id: payload.context.message_id,
          city: payload.context.city,
          country: payload.context.country,
          // timestamp: new Date().toISOString(),
          timestamp: new Date().toISOString().replace('Z', '+00:00')

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
                type: 'Delivery',
                '@ondc/org/provider_name': 'OpenCart Store',
                tracking: false,
                '@ondc/org/category': 'Standard Delivery',
                '@ondc/org/TAT': 'PT6H',
                state: {
                  descriptor: {
                    code: 'Serviceable',
                  },
                },
              },
            ],
            quote: {
              price: {
                currency: 'INR',
                value: totalValue,
              },
              breakup: productDetails.map((item) => ({
                '@ondc/org/item_id': item.id,
                '@ondc/org/item_quantity': item['@ondc/org/item_quantity'],
                title: item.title,
                '@ondc/org/title_type': 'item',
                price: item.price,
              })),
            },
          },
        },
      };

      // Store the selected order details in the in-memory storage
      selectedOrders[ondcResponse.context.transaction_id] = ondcResponse.message.order;

      res.json(ondcResponse);
    } catch (error) {
      console.error('An error occurred while processing the select request', error.message);
      res.status(500).json({ error: 'An error occurred while processing the request' });
    }
});

export { selectRouter };
