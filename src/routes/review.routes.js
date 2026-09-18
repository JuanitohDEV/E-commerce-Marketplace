const express = require('express');
const { authenticate, authorize } = require('../middleware/authenticate');
const { uploadProduct } = require('../middleware/upload');
const {
    createReview,
    getProductReviews,
    updateReview,
    deleteReview,
    respondToReview,
} = require('../controllers/review.controller');

const router = express.Router();

// ---------------------- Public Routes ----------------------

// GET /api/revies/product/:productId
router.get('/product/:productId', getProductReviews);

// ---------------------- Customer Routes ----------------------

// POST /api/reviews
router.post('/', authenticate, uploadProduct, createReview);

// PATCH /api/reviews/:id
router.patch('/:id', authenticate, uploadProduct, updateReview);

// DELETE /api/reviews/:id
router.delete('/:id', authenticate, deleteReview);

// ---------------------- Seller Routes ----------------------

// POST /api/reviews/:id/response
router.post('/:id/response', authenticate, authorize('seller'), respondToReview);

module.exports = router;