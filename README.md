# E-Commerce MarketPlace

A full-stack marketplace platform where sellers can list products and buyers can purchase from multiple vendors in a single checkout. Built as a portfolio project with production-level architecture.

## What it does

Sellers register, complete KYC verification through Stripe Connect, and start listing products. Buyers can browse the catalog, add items from different sellers to a single cart, and pay once - the platform automatically splits the payment and transfers each seller their earnings minus the platform commission.

Beyond the core shopping flow, the platform includes a live chat system between buyers and sellers, an AI-powered support chatbot, a collaborative recommendation engine, and full inventory tracking with movement history.

## Tech stack

**Backend**
- Node.js + Express
- MongoDB + Mongoose
- Redis (sessions, idempotency, rate limiting)
- Socket.io (live chat and real-time notifications)

**Frontend** *(in progress)*
- React 18 + Vite
- Redux Toolkit + RTK Query
- TailwindCSS + shadcn/ui

**Services**
- Stripe + Stripe Connect (payments and seller payouts)
- Cloudinary (image storage and CDN)
- Anthropic Claude API (support chatbot)
- Resend (transactional emails)

## Features

- JWT authentication with refresh token rotation
- Three roles: customer, seller and admin
- Product catalog with simple and variant products (size, color, storage, etc.)
- Image upload pipeline: Multer → Sharp → Cloudinary
- Marketplace order splitting - one checkout, multiple sellers
- Payment idempotency covering double clicks, duplicate webhooks and client retries
- Inventory control with full movement history and low stock alerts
- Seller onboarding with Stripe Connect KYC
- Admin moderation flow for products and sellers
- Live chat with Socket.io and bot-to-human escalation
- Collaborative filtering recommendations based on purchase history
- Analytics dashboard for both admins and sellers