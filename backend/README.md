# ERA Marketplace API

Express and MongoDB API for the ERA marketplace learning app.

## Run locally

1. Install Node.js 20.19+ and MongoDB, then start MongoDB on `127.0.0.1:27017`.
2. Copy `.env.example` to `.env` and set a private `JWT_SECRET`.
3. Run `npm install`, `npm run seed`, and `npm run dev`.
4. Check `GET http://localhost:4000/api/health`.

The seed command creates `buyer@example.com`, `seller@example.com`, and `admin@example.com`, all with password `Demo123!`. Use these for local learning only.

## API and integrations

Routes cover authentication/profile recovery, product and stock management, checkout/orders, seller approvals, dashboards, and payment callbacks. Checkout trusts current server prices and uses guarded atomic stock updates. Each checkout supports one seller.

Razorpay test checkout is enabled only with `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`; webhook verification also requires `RAZORPAY_WEBHOOK_SECRET`. Without test keys, the client can use the local payment simulator. Demo refunds never call Razorpay or return funds. Cloudinary image storage and SMTP reset emails are optional.

Run API integration tests with `npm test`. Tests use an isolated in-memory MongoDB instance; its binary is downloaded on first use. Never use seeded credentials, demo secrets, or test payment keys in production.
