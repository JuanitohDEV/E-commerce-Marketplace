const express = require('express');
const {authenticate, authorize} = require('../middleware/authenticate');
const {
    createCoupon,
    getCoupons,
    getCoupon,
    updateCoupon,
    deactivateCoupon,
    validateCoupon,    
} = require('../controllers/coupon.controller');

const router = express.Router();

// ------------------ Customer Routes ------------------

// GET /api/coupons/validate/:code
router.get('/validate/:code', authenticate, validateCoupon);

// ------------------ Admin Routes ------------------

// POST /api/coupons
router.post('/', authenticate, authorize('admin'), createCoupon);

// GET /api/coupons
router.get('/', authenticate, authorize('admin'), getCoupons);

// GET /api/coupons/:id
router.get('/:id', authenticate, authorize('admin'), getCoupon);

// PATCH /api/coupons/:id
router.patch('/:id', authenticate, authorize('admin'), updateCoupon);

// PATCH /api/coupons/:id/deactivate
router.patch('/:id/deactivate', authenticate, authorize('admin'), deactivateCoupon);

module.exports = router;
