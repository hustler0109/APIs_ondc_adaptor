// const express = require("express");
// const dotenv = require("dotenv");
// import {
//   createKeyPair,
//   createAuthorizationHeader,
//   verifyMessage,
// } from "./utils/cryptoUtils.js";

// dotenv.config();

// const app = express();
// app.use(express.json());

// app.get("/", (req, res) => {
//   res.send("ONDC Signing Server is running!");
// });

// // Endpoint to generate keys
// app.get("/generate-keys", async (req, res) => {
//   const keys = await createKeyPair();
//   res.json(keys);
// });

// // Endpoint to sign a request
// app.post("/sign", async (req, res) => {
//   const { message } = req.body;
//   if (!message) return res.status(400).json({ error: "Message is required" });

//   const privateKey = process.env.PRIVATE_KEY; // Load private key from environment
//   if (!privateKey)
//     return res.status(500).json({ error: "Private key not configured" });

//   const header = await createAuthorizationHeader(message, privateKey);
//   res.json({ authorization: header });
// });

// app.post("/verify", async (req, res) => {
//     const { signedString, message } = req.body;
//     const publicKey = process.env.PUBLIC_KEY;
  
//     if (!signedString || !message || !publicKey)
//       return res.status(400).json({ error: "Invalid request" });
  
//     const { signingString } = await createSigningString(message);
//     const isValid = await verifyMessage(signedString, signingString, publicKey);
  
//     res.json({ valid: isValid });
//   });

  
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
