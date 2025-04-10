import express from "express";
import { searchHandler } from "../src/search/controller.js";

const router = express.Router();

// Search API route
router.get("/", searchHandler);

export default router; 