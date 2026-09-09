const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const {
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
} = require('../controllers/cart.controller');

const router = express.Router();

// All cart routes require authentication

// GET /api/cart
router.get('/', authenticate, getCart);

// POST /api/cart/add
router.post('/add', authenticate, addToCart);

// PATCH /api/cart/update
router.patch('/update', authenticate, updateCartItem);

// DELETE /api/cart/remove/:itemId
router.delete('/remove/:itemId', authenticate, removeFromCart);

// DELETE /api/cart/clear
router.delete('/clear', authenticate, clearCart);

module.exports = router;