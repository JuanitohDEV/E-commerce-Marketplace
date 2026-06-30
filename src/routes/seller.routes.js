const express = require ('express');
const { authenticate , authorize} = require ('../middleware/authenticate');
const { uploadSingle } = require ('../middleware/upload');
const { 
    applyAsSeller,
    getMyProfile,
    updateMyProfile,
    startOnboarding,
    getStore,
    getMyAnalytics,
    getSellers,
    approveSeller,
    rejectSeller,
    suspendSeller,
} = require('../controllers/seller.controller');

const router = express.Router();

// ------------------------------ Seller Routes ----------------------------------

// POST /api/sellers/apply 
router.post('/apply', authenticate, uploadSingle, applyAsSeller);

// GET /api/sellers/me
router.get('/me', authenticate, authorize('seller'), getMyProfile);

// PATCH /api/sellers/me
router.patch('/me', authenticate, authorize('seller'), uploadSingle, updateMyProfile);

// GET /api/sellers/me/analytics
router.get('/me/analytics', authenticate, authorize('seller'), getMyAnalytics);

// POST /api/sellers/onboarding — start Stripe Connect KYC
router.post('/onboarding', authenticate, authorize('seller'), startOnboarding);

// ------------------------------ Admin Routes -----------------------------------

// GET /api/sellers — list all sellers with filters
router.get('/', authenticate, authorize('admin'), getSellers);

// PATCH /api/sellers/:id/approve
router.patch('/:id/approve', authenticate, authorize('admin'), approveSeller);

// PATCH /api/sellers/:id/reject
router.patch('/:id/reject', authenticate, authorize('admin'), rejectSeller);

// PATCH /api/sellers/:id/suspend
router.patch('/:id/suspend', authenticate, authorize('admin'), suspendSeller);

// ------------------------------- Public Routes --------------------------------

// GET /api/sellers/:storeSlug - public store page
router.get('/:storeSlug', getStore);


module.exports = router;
