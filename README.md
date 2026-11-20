# ERA Marketplace Learning App

A small marketplace sandbox for learning how buyer, seller, and admin workflows fit together. The app uses a React client and an Express API backed by MongoDB.

## Run locally

1. Install Node.js 20.19+ and Docker.
2. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`.
3. From the repository root, run `npm install`, `npm --prefix backend install`, and `npm --prefix frontend install`.
4. Start MongoDB with `docker compose up -d mongo`.
5. In one terminal run `npm --prefix backend run seed`.
6. In separate terminals run `npm --prefix backend run dev` and `npm --prefix frontend run dev`.
7. Open the Vite URL (normally `http://localhost:5173`).

Alternatively, after installing the root package, `npm run dev` starts both API and client processes. The API still needs a running MongoDB.

The backend API is at `http://localhost:4000/api`; `GET /api/health` reports whether MongoDB is connected.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Buyer | `buyer@example.com` | `Demo123!` |
| Seller (approved) | `seller@example.com` | `Demo123!` |
| Admin | `admin@example.com` | `Demo123!` |

These are local seeded credentials only. Change them before exposing a deployment.

## Learning path

- Sign in as a seller and inspect/create products and stock.
- Sign in as a buyer, browse and search, add items, apply the `LEARN10` coupon, and place an order.
- Complete payment with the explicit demo simulator or with Razorpay test keys configured on the server.
- Inspect order status changes and dashboard counts as a seller or admin. Register another account to try seller approval.
- Each demo checkout is limited to products from one seller; use separate checkouts for different sellers.

The checkout API uses guarded atomic stock decrements and compensating stock restoration on a later failure. This illustrates one concurrency concern, but it is not a substitute for a transaction-based inventory design in a production deployment.

## Optional integrations

- **Razorpay:** set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `backend/.env` to enable test checkout. Keep Razorpay dashboard in Test Mode. The app verifies the checkout signature server-side. Without both values, the local simulator is available. Never enter real card details into this learning app.
- **Cloudinary:** optional image upload requires `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. Without them, use a remote sample image URL.
- **Email:** optional SMTP via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`. If unset, password-reset messages are recorded in the development server log and the API returns a development-only reset link.
- **Socket.IO:** order status events update connected clients in real time; polling/refresh remains available if sockets are disconnected.

## Tests and deployment

Run all tests with `npm test`, or run API tests with `npm --prefix backend test` and client tests with `npm --prefix frontend test`. The first API test run downloads a local MongoDB binary for its isolated integration database. Root `docker-compose.yml` includes MongoDB, API, and client services for a containerized demo. GitHub Actions runs the test suites. AWS hosting is intentionally not provisioned automatically; add deployment credentials and production hardening separately.

This project is an educational example, not a production marketplace. Demo credentials, simplified recovery and seller onboarding, simulated refunds, optional integrations, local payment simulation, and the lack of production observability, compliance, and deployment controls are deliberate limitations. Test-mode Razorpay is not real payment processing.
