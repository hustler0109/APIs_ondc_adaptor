// export const searchHandler = (req, res) => {
//     console.log("Data search : ");
  
//     try {
//             res.json({ message: "Search API working!" });
            
  
//     } catch (error) {
//       console.log(error);
//     }
//   };
  
export const searchHandler = (req, res) => {
    console.log("Search Handler triggered");
    res.json({ message: "Search API working!" });
  };

  import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import multer from "multer";
import FormData from "form-data";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.use(cookieParser());

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
  
      console.log('products: \n ', products.data);
  
      // res.json({ category_id: categoryId, message: "Category ID found" });
      res.json({ products: products, message: "Category ID found" });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ error: "An error occurred while fetching products" });
    }
  });
  


  //search by item 
  app.post('/ondc/search', async (req, res) => {
    try {
      const ondcRequest = req.body;
      const itemName = ondcRequest.message.intent.item.descriptor.name;
  
      if (!itemName) {
        return res.status(400).json({ error: 'Item name is required in the search intent' });
      }
  
      // Fetch products from OpenCart matching the item name
      const opencartResponse = await axios.get(
        `${process.env.OPENCART_SITE}/index.php?route=api/allproducts/search&json&name=${encodeURIComponent(itemName)}`
      );
  
      const products = opencartResponse.data;
  
      // Transform OpenCart product data to ONDC response format
      const ondcResponse = {
        context: {
          ...ondcRequest.context,
          action: 'on_search',
          timestamp: new Date().toISOString(),
        },
        message: {
          catalog: {
            'bpp/descriptor': {
              name: 'Your Store Name',
              long_desc: 'Description of your store',
              images: ['URL to your store image'],
            },
            'bpp/providers': [
              {
                id: 'provider-id',
                descriptor: {
                  name: 'Provider Name',
                  long_desc: 'Provider Description',
                  images: ['URL to provider image'],
                },
                locations: [
                  {
                    id: 'location-id',
                    gps: 'latitude,longitude',
                    address: {
                      door: 'Door Number',
                      name: 'Building Name',
                      street: 'Street Name',
                      locality: 'Locality',
                      ward: 'Ward',
                      city: 'City',
                      state: 'State',
                      country: 'Country',
                      area_code: 'Area Code',
                    },
                  },
                ],
                items: Object.values(products).map((product) => ({
                  id: product.product_id,
                  descriptor: {
                    name: product.name,
                    long_desc: product.description,
                    images: [`${process.env.OPENCART_SITE}/image/${product.image}`],
                  },
                  price: {
                    currency: 'INR',
                    value: product.price,
                  },
                  category_id: 'Category ID',
                  fulfillment_id: 'Fulfillment ID',
                  location_id: 'Location ID',
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
      res.status(500).json({ error: 'An error occurred while processing the request' });
    }
  });


  