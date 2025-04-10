import express from "express";
import axios from 'axios';

const initRouter = express.Router();

initRouter.post('/init', async (req, res) => {
    try {
        const payload = req.body;
        const { items, provider, fulfillments } = payload.message.order;
    
        const providerId = provider.id;
        const fulfillmentId = `fulfillment-${providerId}`;
    
        let productDetails = [];
        let productDetailsInQuote = [];
        let unavailableItems = [];
        let totalValue = 0;
    
        for (const item of items) {
          const productId = item.id;
          const opencartApiUrl = `http://localhost/opencart-3/index.php?route=api/allproducts/productInfo&json&product_id=${productId}`;
    
          const response = await axios.get(opencartApiUrl);
          const productData = response.data;
    
          if (!productData || !productData.product_id) {
            return res.status(404).json({ error: `Product not found for ID: ${productId}` });
          }
    
          if (parseInt(productData.quantity) === 0) {
            unavailableItems.push({
              item_id: productId,
              error: "40002",
            });
          } else {
            const itemPrice = parseFloat(productData.special || productData.price);
            const itemTotalPrice = itemPrice * item.quantity.count;
            totalValue += itemTotalPrice;
    
            productDetails.push({
              fulfillment_id: fulfillmentId,
              id: productId,
              quantity: {
                count: item.quantity.count,
              },
            });
    
            productDetailsInQuote.push({
              "@ondc/org/item_id": productId,
              "@ondc/org/item_quantity": {
                count: item.quantity.count,
              },
              title: productData.name,
              "@ondc/org/title_type": "item",
              price: {
                currency: "INR",
                value: (item.quantity.count * itemPrice).toFixed(2),
              },
              item: {
                price: {
                  currency: "INR",
                  value: itemPrice.toFixed(2),
                },
              },
            });
          }
        }
    
        const ondcResponse = {
          context: {
            ...payload.context,
            action: "on_init",
            timestamp: new Date().toISOString(),
          },
          message: {
            order: {
              provider: {
                id: providerId,
                locations: provider.locations,
              },
              items: productDetails,
              billing: payload.message.order.billing,
              fulfillments: fulfillments.map((f) => ({
                id: f.id,
                type: f.type,
                "@ondc/org/provider_name": "OpenCart Store",
                tracking: false,
                "@ondc/org/category": "Standard Delivery",
                "@ondc/org/TAT": "PT6H",
                state: {
                  descriptor: {
                    code: "Serviceable",
                  },
                },
              })),
              quote: {
                price: {
                  currency: "INR",
                  value: totalValue.toFixed(2),
                },
                breakup: productDetailsInQuote,
              },
              payment: {
                uri: "https://ondc-payment-gateway.com/pay",
                tl_method: "http/get",
                collected_by: "BPP",
                params: {
                  amount: totalValue.toFixed(2),
                  currency: "INR",
                },
                type: "ON-ORDER",
                status: "NOT-PAID",
              },
              cancellation_terms: [
                {
                  fulfillment_state: "Pending",
                  cancellable: true,
                  returnable: false,
                },
              ],
              tags: [
                {
                  code: "bpp_terms",
                  list: [
                    {
                      code: "max_liability",
                      value: "2",
                    },
                    {
                      code: "max_liability_cap",
                      value: "10000.00",
                    },
                    {
                      code: "mandatory_arbitration",
                      value: "false",
                    },
                    {
                      code: "court_jurisdiction",
                      value: "Bengaluru",
                    },
                    {
                      code: "delay_interest",
                      value: "7.50",
                    },
                    {
                      code: "tax_number",
                      value: "gst_number_of_sellerNP",
                    },
                    {
                      code: "provider_tax_number",
                      value: "PAN_number_of_provider",
                    },
                  ],
                },
              ],
            },
          },
        };
    
        if (unavailableItems.length > 0) {
          ondcResponse.error = {
            type: "DOMAIN-ERROR",
            code: "40002",
            message: JSON.stringify(unavailableItems),
          };
        }
    
        res.json(ondcResponse);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "An error occurred while processing the request" });
      }
    });
    

export { initRouter };
