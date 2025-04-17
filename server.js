// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import multer from "multer";
import FormData from "form-data";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import {
  createKeyPair,
  createAuthorizationHeader,
  verifyMessage,
  createSigningString,
} from "./utils/cryptoUtils.js";
import routes from "./routes/index.js"; // Importing routes
import { authenticateToken } from "./src/api/controller.js"; // Middleware for API token
import { v4 as uuidv4 } from "uuid";
import { selectRouter } from './routes/select.js';
import { onSelectRouter } from './routes/on_select.js';
import { confirmRouter } from './routes/confirm.js';
import { onConfirmRouter } from './routes/on_confirm.js';
import  {updateRouter} from "./routes/update.js";
import  {onUpdateRouter} from "./routes/on_update.js";
import { initRouter } from "./routes/init.js";
import { cancelRouter } from './routes/cancel.js';
import { onCancelRouter } from './routes/on_cancel.js';
import { OrderStatus } from './constants.js'; // Import constants if needed elsewhere
import { statusRouter } from './routes/status.js';
import { onStatusRouter } from './routes/on_status.js';


// import { generateAuthHeader } from "./auth/auth";
dotenv.config();

const stagingDetails = {
  subscriber_id: "opencart-test-adaptor.ondc.org",
  ukId: "1bad2579-d2c1-4169-8580-6ce7b3c96732",
  signing_public_key: "cxEdUA4sM4rJWdzc0YKV/H7dscVvj/47aX6kajOEf20=",
  encr_public_key:
    "MCowBQYDK2VuAyEAjwQ/anmu2DPEff2H5v5BBMOorOngTLLAj2jU9SnHFxU=",
};

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

const upload = multer();
app.use(upload.any());


app.use('/ondc', selectRouter);
app.use('/ondc', onSelectRouter);
app.use('/ondc', confirmRouter);
app.use('/ondc', onConfirmRouter);
app.use("/ondc", updateRouter);
app.use("/ondc", onUpdateRouter);
app.use('/ondc', initRouter);

const privateKey = process.env.PRIVATE_KEY;
const publicKey = stagingDetails.signing_public_key;

app.get("/", (req, res) => {
  res.send("ONDC Signing Server is running!");
});

//OPENCART LOGIN
app.post("/login", async (req, res) => {
  try {
    const { username = "Default", key } = req.body;

    if (!key) {
      return res.status(400).json({ error: "API key is required" });
    }

    const formData = new FormData();
    formData.append("username", username);
    formData.append("key", key);
    console.log("form-data", formData)

    const response = await axios.post(
      `${process.env.OPENCART_SITE}/index.php?route=api/login`,
      formData
    );

    const success = response.data.success;
    const apiToken = response.data.api_token;
    console.log("first response data", response.data);
    
    if (!apiToken) {
      return res.status(401).json({ error: "Invalid credentials or API key" });
    }

    res.cookie("api_token", apiToken, { httpOnly: true, maxAge: 3600000 });
    const authCookie = req.cookies;
    console.log("first cookies", authCookie);

    // Respond with the api_token
    return res.json({ message: success, api_token: apiToken });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "An error occurred while processing the login" });
  }
});

app.post("/cookie", async (req, res) => {
  try {
    const authCookie = req.cookies;
    console.log("first cookies", authCookie);

    // Respond with the api_token
    return res.json({ message: "success", api_token: authCookie });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching the cookiess" });
  }
});

app.get("/getCategoryWiseProducts", async (req, res) => {
  try {
    const api_token = req.cookies.api_token;
    console.log("first cookies", api_token);

    if (!api_token) {
      return res.status(400).json({ error: "API token is required" });
    }
    const { categoryName } = req.body;

    const formData = new FormData();
    formData.append("category", categoryName);

    const response = await axios.get(
      `${process.env.OPENCART_SITE}/index.php?route=api/allproducts/categories&json`,
      formData
    );

    console.log("first category name", categoryName);
    const categories = response.data;
    // console.log('response.data');
    // console.log(categories);
    console.log("dtype:", typeof categories);
    console.log("\n\n\n");

    if (!Array.isArray(categories)) {
      return res
        .status(500)
        .json({ error: "Invalid response format from API" });
    }

    // Find the category by name
    const foundCategory = categories.find(
      (cat) => cat.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (!foundCategory) {
      return res
        .status(404)
        .json({ error: `Category "${categoryName}" not found` });
    }

    const categoryId = foundCategory.category_id;
    console.log(`Category ID for "${categoryName}" is:`, categoryId);

    const products = await axios.get(
      `${process.env.OPENCART_SITE}/index.php?route=api/allproducts/categoryList&json&path=${categoryId}`
    );

    console.log("products: \n ", products.data);

    // res.json({ category_id: categoryId, message: "Category ID found" });
    res.json({ products: products, message: "Category ID found" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching products" });
  }
});

app.post("/ondc/search", async (req, res) => {
  try {
    const ondcRequest = req.body;
    // const categoryId = categoryMapping[ondcRequest.message.intent.category.id];
    const categoryId = 18;

    if (!categoryId) {
      return res
        .status(400)
        .json({ error: "Invalid or unsupported category ID" });
    }

    const opencartResponse = await axios.get(
      `${process.env.OPENCART_SITE}/index.php?route=api/allproducts/categoryList&json&path=${categoryId}`
    );

    const products = opencartResponse.data;

    const ondcResponse = {
      context: {
        ...ondcRequest.context,
        action: "on_search",
        timestamp: new Date().toISOString(),
      },
      message: {
        catalog: {
          "bpp/descriptor": {
            name: "Your Store Name",
            long_desc: "Description of your store",
            images: ["URL to your store image"],
          },
          "bpp/providers": [
            {
              id: "provider-id",
              descriptor: {
                name: "Provider Name",
                long_desc: "Provider Description",
                images: ["URL to provider image"],
              },
              locations: [
                {
                  id: "location-id",
                  gps: "latitude,longitude",
                  address: {
                    door: "Door Number",
                    name: "Building Name",
                    street: "Street Name",
                    locality: "Locality",
                    ward: "Ward",
                    city: "City",
                    state: "State",
                    country: "Country",
                    area_code: "Area Code",
                  },
                },
              ],
              items: Object.values(products).map((product) => ({
                id: product.product_id,
                descriptor: {
                  name: product.name,
                  long_desc: product.description,
                  images: [
                    `${process.env.OPENCART_SITE}/image/${product.image}`,
                  ],
                },
                price: {
                  currency: "INR",
                  value: product.price,
                },
                category_id: categoryId,
                fulfillment_id: "Fulfillment ID",
                location_id: "Location ID",
                available_quantity: product.quantity,
                sku: product.sku,
              })),
            },
          ],
        },
      },
    };

    res.json(ondcResponse);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while processing the request" });
  }
});


app.post("/incremental-catalog-refresh", async (req, res) => {
  try {
    const { context, message } = req.body;
    // console.log('Received Payload:', message.intent.tags);

    if (!message || !message.intent || !Array.isArray(message.intent.tags)) {
      return res
        .status(400)
        .json({ error: "Invalid payload structure: 'tags' array missing" });
    }

    const catalogIncTag = message.intent.tags.find(
      (tag) => tag.code === "catalog_inc"
    );

    if (!catalogIncTag || !Array.isArray(catalogIncTag.list)) {
      return res.status(400).json({
        error: "'catalog_inc' tag is missing or incorrectly formatted",
      });
    }

    const startTimeTag = catalogIncTag.list.find(
      (item) => item.code === "start_time"
    );
    const endTimeTag = catalogIncTag.list.find(
      (item) => item.code === "end_time"
    );

    const startTime = startTimeTag ? startTimeTag.value : null;
    // console.log('start time', startTime)
    const endTime = endTimeTag ? endTimeTag.value : null;
    // console.log('endTime time', endTime)

    if (!startTime || !endTime) {
      return res.status(400).json({
        error: "'start_time' and 'end_time' are required and must be valid",
      });
    }

    const opencartResponse = await axios.get(
      // `${process.env.OPENCART_SITE}/index.php?route=api/allproducts/modified&start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}`
      `${process.env.OPENCART_SITE}/index.php?route=api/allproducts/modified&start_time=${startTime}&end_time=${endTime}&json`
    );
    // console.log('opencartResponse.data',opencartResponse.data)

    if (!Array.isArray(opencartResponse.data.shop_products)) {
      return res
        .status(500)
        .json({ error: "Invalid response from OpenCart API" });
    }

    const products = opencartResponse.data.shop_products;

    const ondcItems = products.map((product) => ({
      id: product.product_id,
      descriptor: {
        name: product.name,
        long_desc: product.description || "",
        images: product.image
          ? [{ url: `${process.env.OPENCART_SITE}/image/${product.image}` }]
          : [],
      },
      price: {
        currency: "INR",
        value: product.price.toString(),
      },
    }));

    const ondcResponse = {
      context: {
        ...context,
        action: "on_search",
        timestamp: new Date().toISOString(),
        message_id: crypto.randomUUID(),
      },
      message: {
        catalog: {
          items: ondcItems,
        },
      },
    };

    res.json(ondcResponse);
  } catch (error) {
    console.error(
      "Error processing incremental catalog refresh:",
      error.message
    );
    res
      .status(500)
      .json({ error: "An error occurred while processing the request" });
  }
});

app.post("/ondc/on_search", async (req, res) => {
  try {
    const payload = req.body;

    const opencartApiUrl =
      "http://localhost/opencart-3/index.php?route=api/allproducts&json";
    const response = await axios.get(opencartApiUrl);
    const opencartProducts = response.data.shop_products;

    const opencartApiStoreInfo =
      "http://localhost/opencart-3/index.php?route=api/allproducts/contact";
    const store = await axios.get(opencartApiStoreInfo);
    const storeInfo = store.data;

    const opencartApiCategories =
      "http://localhost/opencart-3/index.php?route=api/allproducts/categories&json";
    const categories = await axios.get(opencartApiCategories);
    const categoriesInfo = categories.data;

    if (!opencartProducts || opencartProducts.length === 0) {
      return res.status(404).json({ error: "No products found" });
    }
    if (!categoriesInfo || categoriesInfo.length === 0) {
      return res.status(404).json({ error: "No categories found" });
    }
    if (!storeInfo || storeInfo.length === 0) {
      return res.status(404).json({ error: "No store info found" });
    }

    const ondcCatalog = {
      context: {
        domain: payload.context.domain,
        country: payload.context.country,
        city: payload.context.city,
        action: payload.context.action,
        core_version: payload.context.core_version,
        bap_id: payload.context.bap_id,
        bap_uri: payload.context.bap_uri,
        bpp_id: payload.context.bpp_id,
        bpp_uri: payload.context.bpp_uri,
        transaction_id: payload.context.transaction_id,
        message_id: payload.context.message_id,
        timestamp: payload.context.timestamp,
        ttl: payload.context.ttl,
      },
      message: {
        "bpp/fulfillments": [
          {
            id: "F1",
            type: "Delivery",
          },
        ],
        "bpp/descriptor": {
          name: "Opencart Store",
          symbol: storeInfo.image,
          short_desc: "Online eCommerce Store",
          long_desc: "Online eCommerce Store",
          images: [
            "https://img.crofarm.com/images/product-feed-banners/f6f5e323302a.png",
          ],
          tags: [
            {
              code: "bpp_terms",
              list: [
                {
                  code: "np_type",
                  value: "ISN",
                },
              ],
            },
          ],
        },
        "bpp/providers": [
          {
            id: "4410",
            time: {
              label: "enable",
              timestamp: new Date().toISOString(),
            },
            fulfillments: [
              {
                id: "F1",
                type: "Delivery",
                contact: {
                  phone: storeInfo.telephone,
                  email: "abc@xyz.com",
                },
              },
            ],
            descriptor: {
              name: storeInfo.store,
              symbol: storeInfo.image,
              short_desc: storeInfo.comment || "Opencart store",
              long_desc: "Opencart store_",
              images: [
                "https://img.crofarm.com/images/product-feed-banners/f6f5e323302a.png",
              ],
            },
            ttl: "PT24H",
            locations: [
              {
                id: "L1",
                gps: "28.5500962,77.2443268",
                address: {
                  locality: storeInfo.address,
                  street: storeInfo.address,
                  city: "Delhi",
                  area_code: storeInfo.geocode,
                  state: "DL",
                },
                circle: {
                  gps: "28.5500962,77.2443268",
                  radius: {
                    unit: "km",
                    value: "3",
                  },
                },
                time: {
                  label: "enable",
                  timestamp: new Date().toISOString(),
                  days: "1,2,3,4,5,6,7",
                  schedule: {
                    holidays: [],
                  },
                  range: {
                    start: "0000",
                    end: "2359",
                  },
                },
              },
            ],
            categories: [], // Initialize categories array here
            items: [], // Initialize items array here
          },
        ],
      },
    };

    // Map opencart categories and items *directly* into the provider

    categoriesInfo.forEach((category) => {
      ondcCatalog.message["bpp/providers"][0].categories.push({
        id: category.category_id,
        descriptor: {
          name: category.name,
        },
        tags: [
          {
            code: "type",
            list: [
              {
                code: "type",
                value: "variant_group",
              },
            ],
          },
          {
            code: "attr",
            list: [
              {
                code: "name",
                value: "item.quantity.unitized.measure",
              },
              {
                code: "seq",
                value: "1",
              },
            ],
          },
        ],
      });
    });

    opencartProducts.forEach((product) => {
      const item = {
        id: product.product_id,
        time: {
          label: "enable",
          timestamp: "2024-01-12T11:41:25.969Z",
        },
        descriptor: {
          name: product.name,
          code: `5:${product.product_id}`,
          symbol: product.image,
          short_desc: product.name,
          long_desc: product.name,
          images: [product.image],
        },
        quantity: {
          unitized: {
            measure: {
              unit: "unit",
              value: "1",
            },
          },
          available: {
            count: product.quantity,
          },
          maximum: {
            count: "5",
          },
        },
        price: {
          currency: "INR",
          value: product.price,
          maximum_value: product.price,
        },
        category_id: "dummy_category", // You might want to map the actual category ID
        fulfillment_id: "F1",
        location_id: "L1",
        "@ondc/org/returnable": false,
        "@ondc/org/cancellable": true,
        "@ondc/org/seller_pickup_return": false,
        "@ondc/org/time_to_ship": "PT12H",
        "@ondc/org/available_on_cod": false,
        "@ondc/org/return_window": "P0D",
        "@ondc/org/contact_details_consumer_care":
          "Otipy, help@crofarm.com,18004254444",
        tags: [
          {
            code: "origin",
            list: [
              {
                code: "country",
                value: "IND",
              },
            ],
          },
          {
            code: "veg_nonveg",
            list: [
              {
                code: "veg",
                value: "yes",
              },
            ],
          },
        ],
      };
      ondcCatalog.message["bpp/providers"][0].items.push(item);
    });

    res.json(ondcCatalog);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "An error occurred" });
  }
});
/*
//confirm starts here

app.use(express.json());

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[HTTP] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}, Duration: ${duration}ms`);
    });
    next();
});


app.use("/", confirmRouter);

app.get("/health", (req, res) => {
   res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    console.error("[Unhandled Error]", err);
    res.status(err.status || 500).json({
        message: { ack: { status: "NACK" } },
        error: {
            type: "CORE-ERROR",
            code: "50000",
            message: err.message || "An unexpected internal server error occurred."
        }
    });
});

const PORT = process.env.PORT || 5003;
app.listen(PORT, () => {
  console.log(`BPP Seller server listening on port ${PORT}`);
  console.log(`BPP_ID: ${process.env.BPP_ID}`);
  console.log(`BPP_URI: ${process.env.BPP_URI}`);
   if (!process.env.BPP_ID || !process.env.BPP_URI || !process.env.STORE_GPS || !process.env.STORE_PINCODE || !process.env.STORE_PHONE) {
       console.warn("Warning: One or more critical environment variables (BPP_ID, BPP_URI, STORE_GPS, STORE_PINCODE, STORE_PHONE, etc.) are not set!");
   }
});
//on_confirm starts here 


app.use(express.json()); 

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[BAP HTTP] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}, Duration: ${duration}ms`);
    });
    next();
});


app.use("/", onConfirmRouter);

app.get("/bap/health", (req, res) => {
   res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    console.error("[BAP Unhandled Error]", err);
    res.status(err.status || 500).json({
        message: { ack: { status: "NACK" } },
        error: {
            type: "CORE-ERROR",
            code: "50000",
            message: err.message || "An unexpected internal BAP server error occurred."
        }
    });
});

app.listen(PORT, () => {
  console.log(`BAP Buyer server listening on port ${PORT}`);
  console.log(`BAP_ID: ${process.env.BAP_ID}`);
  console.log(`BAP_URI: ${process.env.BAP_URI}`);
   if (!process.env.BAP_ID || !process.env.BAP_URI) {
       console.warn("Warning: BAP_ID or BAP_URI environment variables are not set!");
   }
});

//on_confirm ends here 
app.post("/ondc/cart", async (req, res) => {
  try {
    const { context, message } = req.body;
    const selectedItems = message.order.items;

    if (!selectedItems || selectedItems.length === 0) {
      return res.status(400).json({ error: "No items selected" });
    }

    const opencartCartAddPromises = selectedItems.map(async (item) => {
      const opencartProductId = item.id; 
      const quantity = item.quantity.count;

      if (!opencartProductId || !quantity || quantity <= 0) {
        return { error: `Invalid product or quantity for item: ${item.id}` }; // Return error for individual item
      }

      try {
        const opencartResponse = await axios.post(
          `${process.env.OPENCART_SITE}/index.php?route=api/cart/add&api_id=0002a312d4f4776b937c8652db`, // Use session for api_id
          new URLSearchParams({
            product_id: opencartProductId,
            quantity: quantity,
          }),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );

        if (opencartResponse.data.error) {
          return { error: opencartResponse.data.error }; 
        }

        return opencartResponse.data; 
      } catch (error) {
        console.error("Error adding to cart:", error);
        return { error: "Error adding to cart" }; 
      }
    });

    const opencartCartAddResults = await Promise.all(opencartCartAddPromises);

    // Check for any errors during cart add operations
    const cartAddErrors = opencartCartAddResults.filter(
      (result) => result.error
    );

    if (cartAddErrors.length > 0) {
      return res.status(500).json({
        error: "Some items could not be added to the cart",
        details: cartAddErrors, // Include details of the errors
      });
    }

    const ondcResponse = {
      context: {
        ...context,
        action: "on_select",
        timestamp: new Date().toISOString(),
        message_id: "unique-message-id", // Generate a unique message ID
      },
      message: {
        order: {
          items: selectedItems.map((item) => ({
            ...item, // Include the original item data
            fulfillment_id: "F1", // Example fulfillment ID
          })),
        },
      },
    };

    res.json(ondcResponse);
  } catch (error) {
    console.error("Error in /ondc/on_select:", error);
    res.status(500).json({ error: "An error occurred" });
  }
});
app.post("/ondc/on_init", async (req, res) => {
  try {
    const payload = req.body;
    const { items, provider, fulfillments, quote } = payload.message.order;

    const providerId = provider.id;
    const fulfillmentId = `fulfillment-${providerId}`;

    let productDetails = [];
    let productDetailsInQuote = [];
    let unavailableItems = [];
    let totalValue = 0;

    for (const item of items) {
      console.log('first', item);
      const productId = item.id;
      const opencartApiUrl = `http://localhost/opencart-3/index.php?route=api/allproducts/productInfo&json&product_id=${productId}`;

      const response = await axios.get(opencartApiUrl);
      const productData = response.data;

      if (!productData || !productData.product_id) {
        return res
          .status(404)
          .json({ error: `Product not found for ID: ${productId}` });
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
            value: item.quantity.count * itemPrice.toFixed(2),
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
    res
      .status(500)
      .json({ error: "An error occurred while processing the request" });
  }
});


//cancel starts here

app.use(express.json());

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[HTTP] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}, Duration: ${duration}ms`);
    });
    next();
});

app.use("/", confirmRouter);
app.use("/", cancelRouter);

app.get("/health", (req, res) => {
   res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    console.error("[Unhandled Error]", err);
    res.status(err.status || 500).json({
        message: { ack: { status: "NACK" } },
        error: {
            type: "CORE-ERROR",
            code: "50000",
            message: err.message || "An unexpected internal server error occurred."
        }
    });
});

//const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`BPP Seller server listening on port ${PORT}`);
  console.log(`BPP_ID: ${process.env.BPP_ID}`);
  console.log(`BPP_URI: ${process.env.BPP_URI}`);
   if (!process.env.BPP_ID || !process.env.BPP_URI || !process.env.STORE_GPS || !process.env.STORE_PINCODE || !process.env.STORE_PHONE) {
       console.warn("Warning: One or more critical environment variables (BPP_ID, BPP_URI, STORE_GPS, STORE_PINCODE, STORE_PHONE, etc.) are not set!");
   }
});

//on_cancel starts here

app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[BAP HTTP] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}, Duration: ${duration}ms`);
  });
  next();
});

app.use("/", onConfirmRouter);
app.use("/", onCancelRouter);

app.get("/bap/health", (req, res) => {
 res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error("[BAP Unhandled Error]", err);
  res.status(err.status || 500).json({
      message: { ack: { status: "NACK" } },
      error: {
          type: "CORE-ERROR",
          code: "50000",
          message: err.message || "An unexpected internal BAP server error occurred."
      }
  });
});

//const PORT = process.env.BAP_PORT || 5001;
app.listen(PORT, () => {
console.log(`BAP Buyer server listening on port ${PORT}`);
console.log(`BAP_ID: ${process.env.BAP_ID}`);
console.log(`BAP_URI: ${process.env.BAP_URI}`);
 if (!process.env.BAP_ID || !process.env.BAP_URI) {
     console.warn("Warning: BAP_ID or BAP_URI environment variables are not set!");
 }
});
//on_cancel ends here
*/

//status starts here
app.use(express.json());

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[HTTP] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}, Duration: ${duration}ms`);
    });
    next();
});

app.use("/", statusRouter);

app.get("/health", (req, res) => {
   res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    console.error("[Unhandled Error]", err);
    res.status(err.status || 500).json({
        message: { ack: { status: "NACK" } },
        error: {
            type: "CORE-ERROR",
            code: "50000",
            message: err.message || "An unexpected internal server error occurred."
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BPP Seller server listening on port ${PORT}`);
  console.log(`BPP_ID: ${process.env.BPP_ID}`);
  console.log(`BPP_URI: ${process.env.BPP_URI}`);
   if (!process.env.BPP_ID || !process.env.BPP_URI || !process.env.STORE_GPS || !process.env.STORE_PINCODE || !process.env.STORE_PHONE) {
       console.warn("Warning: One or more critical environment variables (BPP_ID, BPP_URI, STORE_GPS, STORE_PINCODE, STORE_PHONE, etc.) are not set!");
   }
});
//status ends here

//on_status starts here

app.use(express.json());

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[BAP HTTP] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}, Duration: ${duration}ms`);
    });
    next();
});
app.use("/", onStatusRouter);

app.get("/bap/health", (req, res) => {
   res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    console.error("[BAP Unhandled Error]", err);
    res.status(err.status || 500).json({
        message: { ack: { status: "NACK" } },
        error: {
            type: "CORE-ERROR",
            code: "50000",
            message: err.message || "An unexpected internal BAP server error occurred."
        }
    });
});

app.listen(PORT, () => {
  console.log(`BAP Buyer server listening on port ${PORT}`);
  console.log(`BAP_ID: ${process.env.BAP_ID}`);
  console.log(`BAP_URI: ${process.env.BAP_URI}`);
   if (!process.env.BAP_ID || !process.env.BAP_URI) {
       console.warn("Warning: BAP_ID or BAP_URI environment variables are not set!");
   }
});
//on_status ends here

//ONDC ENDPOINTS
//const PORT = 3000;

app.get("/generate-keys", async (req, res) => {
  const keys = await createKeyPair();
  res.json(keys);
});

app.post("/sign", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  if (!privateKey)
    return res.status(500).json({ error: "Private key not configured" });

  console.log("Message to be Signed:", message);
  const header = await createAuthorizationHeader(message, privateKey);
  res.json({ authorization: header });
});

app.post("/verify", async (req, res) => {
  const { signedString, message } = req.body;
  if (!signedString || !message)
    return res.status(400).json({ error: "Invalid request" });

  console.log("Signed String for Verification:", signedString);
  console.log("Message for Verification:", message);

  const { signingString } = await createSigningString(message);
  const isValid = await verifyMessage(signedString, signingString, publicKey);

  res.json({ valid: isValid });
});

//The /lookup endpoint to call the ONDC registry
app.post("/lookup", async (req, res) => {
  const { subscriber_id, domain, ukId, country, city, type } = req.body;

  console.log("first");
  console.log("subscriber_id", subscriber_id);
  console.log("domain", domain);
  console.log("ukId", ukId);
  console.log("country", country);
  console.log("city", city);
  console.log("type", type);

  // Ensuring all required fields are provided
  if (!subscriber_id || !domain || !ukId || !country || !city || !type) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // Calling ONDC registry using Axios
    const response = await axios.post(
      "https://staging.registry.ondc.org/lookup",
      {
        subscriber_id,
        domain,
        ukId,
        country,
        city,
        type,
      }
    );

    // Forwarding the response from the ONDC registry to the client
    res.json(response.data);
  } catch (error) {
    console.error("Error calling ONDC registry:", error.message);
    res.status(500).json({ error: "Error calling ONDC registry" });
  }
});

// The /vlookup endpoint to call the ONDC registry
app.post("/vlookup", async (req, res) => {
  const {
    sender_subscriber_id,
    request_id,
    timestamp,
    signature,
    search_parameters,
    country,
    domain,
  } = req.body;

  // Validate required fields
  if (
    !sender_subscriber_id ||
    !request_id ||
    !timestamp ||
    !signature ||
    !search_parameters ||
    !country ||
    !domain
  ) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // Prepare data for the ONDC registry lookup request
    const payload = {
      sender_subscriber_id,
      request_id,
      timestamp,
      signature,
      search_parameters,
      country,
      domain,
    };

    // Call the ONDC registry vlookup endpoint using Axios
    const response = await axios.post(
      "https://staging.registry.ondc.org/vlookup",
      payload
    );

    // Forward the response from the ONDC registry to the client
    res.json(response.data);
  } catch (error) {
    console.error("Error calling ONDC registry:", error.message);
    res.status(500).json({ error: "Error calling ONDC registry" });
  }
});

//const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
