import express from "express";
import cookieParser from "cookie-parser";
import apiRoutes from "./api.js";
import searchRoutes from "./search.js";

const router = express.Router();
const app = express();
app.use(cookieParser());

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
  });
  

// Route mapping
router.use("/api", apiRoutes);  // /api/apiverify
router.use("/api/search", searchRoutes); // /api/search

export default router;  // Exporting router as default

