// // import sodium, { base64_variants } from "libsodium-wrappers";
// // const config = require("./config.js");
// import config from "../config.js";
// import pkg from 'libsodium-wrappers';
// const { base64_variants, sodium } = pkg;

// export const createKeyPair = async () => {
//   await sodium.ready;
//   const { publicKey, privateKey } = sodium.crypto_sign_keypair();
//   return {
//     publicKey: sodium.to_base64(publicKey, base64_variants.ORIGINAL),
//     privateKey: sodium.to_base64(privateKey, base64_variants.ORIGINAL),
//   };
// };

// export const createSigningString = async (message, created, expires) => {
//     await sodium.ready;
//     const sodiumInstance = sodium;
  
//     if (!created) created = Math.floor(Date.now() / 1000).toString();
//     if (!expires) expires = (parseInt(created) + 3600).toString();
  
//     const digest = sodiumInstance.crypto_generichash(
//       64,
//       sodiumInstance.from_string(message)
//     );
//     const digestBase64 = sodiumInstance.to_base64(digest, base64_variants.ORIGINAL);
  
//     const signingString = `(created): ${created}
//   (expires): ${expires}
//   digest: BLAKE-512=${digestBase64}`;
    
//     return { signingString, created, expires };
//   };
  
//   export const signMessage = async (signingString, privateKey) => {
//     await sodium.ready;
//     const sodiumInstance = sodium;
  
//     const signedMessage = sodiumInstance.crypto_sign_detached(
//       signingString,
//       sodiumInstance.from_base64(privateKey, base64_variants.ORIGINAL)
//     );
  
//     return sodiumInstance.to_base64(signedMessage, base64_variants.ORIGINAL);
//   };
  

//   export const createAuthorizationHeader = async (message, privateKey) => {
//     const { signingString, created, expires } = await createSigningString(
//       JSON.stringify(message)
//     );
  
//     const signature = await signMessage(signingString, privateKey);
  
//     const header = `Signature keyId="${config.subscriber_id}|${config.unique_key_id}|ed25519",algorithm="ed25519",created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signature}"`;
    
//     return header;
//   };
  

//   export const verifyMessage = async (signedString, signingString, publicKey) => {
//     try {
//       await sodium.ready;
//       return sodium.crypto_sign_verify_detached(
//         sodium.from_base64(signedString, base64_variants.ORIGINAL),
//         signingString,
//         sodium.from_base64(publicKey, base64_variants.ORIGINAL)
//       );
//     } catch (error) {
//       return false;
//     }
//   };
  

// utils/cryptoUtils.js
import pkg from "libsodium-wrappers";
const { base64_variants } = pkg;
import _sodium from 'libsodium-wrappers';

// Staging entry details
const stagingDetails = {
  subscriber_id: "opencart-test-adaptor.ondc.org",
  ukId: "1bad2579-d2c1-4169-8580-6ce7b3c96732",
  signing_public_key: "cxEdUA4sM4rJWdzc0YKV/H7dscVvj/47aX6kajOEf20=",
  encr_public_key: "MCowBQYDK2VuAyEAjwQ/anmu2DPEff2H5v5BBMOorOngTLLAj2jU9SnHFxU=",
};

export const createKeyPair = async () => {
  // await sodium.ready; // Ensure sodium is initialized before using it
  await _sodium.ready;
  const sodium = _sodium;
  const { publicKey, privateKey } = sodium.crypto_sign_keypair();
  console.log("Generated Key Pair:", {
    publicKey: sodium.to_base64(publicKey, base64_variants.ORIGINAL),
    privateKey: sodium.to_base64(privateKey, base64_variants.ORIGINAL),
  });
  return {
    publicKey: sodium.to_base64(publicKey, base64_variants.ORIGINAL),
    privateKey: sodium.to_base64(privateKey, base64_variants.ORIGINAL),
  };
};

export const createSigningString = async (message, created, expires) => {
  await _sodium.ready;
  const sodium = _sodium;
  if (!created) created = Math.floor(Date.now() / 1000).toString();
  if (!expires) expires = (parseInt(created) + 3600).toString();

  console.log("Message for Signing String:", message);
  const digest = sodium.crypto_generichash(
    64,
    sodium.from_string(message)
  );
  const digestBase64 = sodium.to_base64(digest, base64_variants.ORIGINAL);

  const signingString = `(created): ${created}\n(expires): ${expires}\ndigest: BLAKE-512=${digestBase64}`;
  console.log("Generated Signing String:", signingString);

  return { signingString, created, expires };
};

export const signMessage = async (signingString, privateKey) => {
  await _sodium.ready;
  const sodium = _sodium;
  console.log("Signing String to be Signed:", signingString);

  const signedMessage = sodium.crypto_sign_detached(
    signingString,
    sodium.from_base64(privateKey, base64_variants.ORIGINAL)
  );

  const signature = sodium.to_base64(signedMessage, base64_variants.ORIGINAL);
  console.log("Generated Signature:", signature);
  return signature;
};

export const createAuthorizationHeader = async (message, privateKey) => {
  const { signingString, created, expires } = await createSigningString(
    JSON.stringify(message)
  );

  const signature = await signMessage(signingString, privateKey);

  const header = `Signature keyId="${stagingDetails.subscriber_id}|${stagingDetails.ukId}|ed25519",algorithm="ed25519",created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signature}"`;

  console.log("Authorization Header:", header);
  return header;
};

export const verifyMessage = async (signedString, signingString, publicKey) => {
  try {
    await _sodium.ready;
    const sodium = _sodium;
    console.log("Verifying Signature:", signedString);
    const isValid = sodium.crypto_sign_verify_detached(
      sodium.from_base64(signedString, base64_variants.ORIGINAL),
      signingString,
      sodium.from_base64(publicKey, base64_variants.ORIGINAL)
    );
    console.log("Signature Validity:", isValid);
    return isValid;
  } catch (error) {
    console.error("Error Verifying Message:", error);
    return false;
  }
};
