# ONDC-Adaptor
ONDC and OpenCart Adaptor

```bash
# INSTALLATION COMMANDS USED INITIALLY
npm init -y
npm install express axios body-parser dotenv

# to simply run it in local 
cd client
npm i
npm run dev

#to start express server 
cd server
npm i
npm start
```

```bash
# .env variables 
OPENCART_API= 
OPENCART_KEY= 
ONDC_BASE_URL= 

```


 I made following APIs and its path (see Postman apps):

ALL Products : http://examples.com/index.php?route=api/allproducts&json

Product By ID : http://examples.com/index.php?route=api/allproducts/productInfo&json&product_id=30

ALL Categories : http://examples.com/index.php?route=api/allproducts/categories&json

Category Wise Product : http://examples.com/index.php?route=api/allproducts/categoryList&json&path=25_28

ALL Manufacturers : http://examples.com/index.php?route=api/allproducts/manufactureList&json

Manufactur By ID : http://examples.com/index.php?route=api/allproducts/manufactureInfo&manufacturer_id=11

Special Products : http://examples.com/index.php?route=api/allproducts/specialProduct&json

Store info: http://localhost/opencart-3/index.php?route=api/allproducts/contact

Products by keyword: http://localhost/opencart-3/index.php?route=api/allproducts/search 
body:- {
  "search": "cinema"
}

---

# ONDC-Compliant Adaptor for OpenCart  

## Ticket Contents  

Development of a platform-specific ONDC-compliant adaptor for OpenCart. This adaptor will enable seamless integration of the seller platform with the ONDC network, incorporating features like catalog synchronization, order management, and post-order fulfillment.  

### Purpose  

Sellers using OpenCart require an efficient solution to join the ONDC network, leveraging its decentralized and interoperable model. This adaptor eliminates the need for manual integration, streamlines business operations, and enhances efficiency. An optional admin interface may also be developed for real-time updates, complaint management, and API monitoring to improve seller engagement within the ONDC network.  

### Bounty Amount  

**INR 50,000**  

Apply through the following Google Form as part of the C4GT Community Campaign.  

---

## Goals  

### Goals & Milestones  

1. **Create an ONDC Retail protocol-compliant seller adaptor**:  
   - Ensure compliance with Retail API contract v1.2 and v1.2.5.  
   - Support lifecycle processes like discovery, order management, fulfillment, and post-fulfillment.  

2. **Provide a user-friendly admin interface**:  
   - Enable catalog synchronization, order tracking, and ONDC workflow management.  

#### Mid-point Milestones  

- Finalize the technical architecture.  
- Implement basic API translation between ONDC and OpenCart APIs (e.g., product search, catalog sharing).  
- Prototype an admin interface with functional catalog management.  

---

## Expected Outcome  

1. **Seamless Communication**:  
   - Ensure smooth interaction between the ONDC network and OpenCart via the adaptor.  
   - Process orders flagged with ONDC identifiers without disruption.  

2. **ONDC API Translation**:  
   - Convert ONDC API requests into OpenCart-compatible formats and vice versa (e.g., order management, catalog updates).  

3. **Admin Interface**:  
   - Enable sellers to track orders, sync catalogs, manage complaints, and monitor API calls in real time.  

4. **Open-Source Release**:  
   - Share the solution publicly for collaborative improvement and scalability.  

---

## Acceptance Criteria  

- Fully enable an OpenCart seller to integrate with ONDC and process standard ONDC API calls (discovery, order management, fulfillment, post-fulfillment).  
- Ensure compliance with ONDC’s technical requirements for network participants (NPs):  
  - **Log Verification**: Provide logs for defined flows and scenarios as per ONDC’s log submission guidelines.  
  - **Working Instance Walkthrough**: Demonstrate catalog synchronization, order processing, and post-fulfillment request handling.  
- The solution must accommodate **scalability**, **security**, and **performance** to handle adoption by large brands.  

---

## Implementation Details  

- **Platform Integration**:  
  Use OpenCart-specific APIs to manage integration and ensure compatibility with ONDC protocols.  

- **Adaptor Development**:  
  - Translate ONDC API requests to OpenCart APIs and vice versa.  
  - Ensure the system complies with ONDC specifications and provides accurate responses.  

- **Technology Stack**:  
  - **Frontend**: React.js or Angular.  
  - **Backend**: Node.js or Django.  
  - **Compliance & Security**: Follow ONDC data protocols and best practices for data security.  

---

## Product Name  

**ONDC Compliant Adaptor for OpenCart Ecommerce Platform**  

---

## Organisation Details  

- **Organisation Name**: ONDC  
- **Domain**: Retail Ecommerce  
- **Mentors**:  
  - @92shreyansh  
  - @sandeepshahi  
  - @Rishabh-ondc  
  - @ravibhansali10  

---

## Tech Skills Needed  

- Angular, React  
- Node.js, Django  
- RESTful APIs, GraphQL  
- Docker, CI/CD, DevOps  
- SQL, OAuth, JWT  
- UI/UX Design, Testing Library  

---

## Complexity  

**High**  

---

## Category  

**API, Backend, Research**  

---  