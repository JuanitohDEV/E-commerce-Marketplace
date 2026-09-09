const express = require('express');
const { authenticate, authorize } = require('../middleware/authenticate');
const idempotency = require('../middleware/idempotency');
const {
    checkout,
    getMyOrders,
    getOrder,
    cancelOrder,
    getMySubOrders,
    shipSubOrder,
    deliverSubOrder,
    getAllOrders,
} = require ('../controllers/order.controller');



const router = express.Router();

// ------------- Customer Routes -------------

// POST /api/orders/checkout
router.post('/checkout', authenticate, idempotency, checkout);

// GET /api/orders/my-orders
router.get('/my-orders', authenticate, getMyOrders);


// ---------------- Seller Routes ----------------

// GET /api/orders/seller/sub-orders
router.get('/seller/suborders', authenticate, authorize('seller'), getMySubOrders);

// PATCH /api/orders/suborders/:id/ship
router.patch('/suborders/:id/ship', authenticate, authorize('seller'), shipSubOrder);

// PATCH /api/orders/suborders/:id/deliver - customer confirms receipt
router.patch('/suborders/:id/deliver', authenticate, deliverSubOrder);


// ---------------- Admin Routes ----------------

// GET /api/orders - admin sees all orders
router.get('/', authenticate, authorize('admin'), getAllOrders);

// ----------------- Shared (order owner / admin) Routes -----------------

// GET /api/orders/:id 
router.get('/:id', authenticate, getOrder);

// PATCH /api/orders/:id/cancel
router.patch('/:id/cancel', authenticate, cancelOrder);

module.exports = router;
