import express from "express";
import { authenticateToken } from "../src/api/controller.js";
import { searchHandler } from "../src/search/controller.js";

const router = express.Router();
const app = express();

// Middleware to parse form-data
app.use(express.urlencoded({ extended: true })); 
// API Key Verification Route
// router.post("/apiverify", authenticateToken);

// routes/api.js
router.post("/apiverify", authenticateToken);


export default router;  // Use export default for ES Modules
