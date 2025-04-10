// export const authenticateToken = (req, res, next) => {
//   console.log("Data Received : ");

//   const authCookie = req.cookies.api_token;
//     console.log("first cookies", authCookie);

//   try {
//     if (!authCookie) {
//       return res.status(403).json({ error: "API token is required" });
//     }

//     // if (token !== authCookie) {
//     //   return res.status(401).json({ error: "Invalid API token" });
//     // } 
//     // else {
//     //     return res.status(200).json({ error: "API token is present" });
//     // }
//     return next(); 

//   } catch (error) {
//     next(error); // Pass the error to the next middleware if any
//   }
// };

export const authenticateToken = (req, res, next) => {
    console.log("Authenticate Token middleware reached");
    const authCookie = req.cookies.api_token;
    console.log("Cookie:", authCookie);
  
    if (!authCookie) {
      return res.status(403).json({ error: "API token is required" });
    }
    console.log("API token is present, passing to next handler...");
    return next(); // Proceed to the next middleware or route handler
  };
  