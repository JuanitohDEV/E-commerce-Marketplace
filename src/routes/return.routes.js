const express = require('express');
const { authenticate, authorize } = require('../middleware/authenticate');
const {
    requestReturn,
    getMyReturns,
    getReturn,
    getAllReturns,
    approveReturn,
    rejectReturn
} = require('../controllers/return.controller');

const router = express.Router();

// ------------------ Customer Routes ------------------

// POST /api/returns
router.post('/', authenticate, requestReturn);

// GET /api/returns/my-returns
router.get('/my-returns', authenticate, getMyReturns);

// ------------------- Admin Routes ------------------

// GET /api/returns
router.get('/', authenticate, authorize('admin'), getAllReturns);

// PATCH /api/returns/:id/approve
router.patch('/:id/approve', authenticate, authorize('admin'), approveReturn);

// PATCH /api/returns/:id/reject
router.patch('/:id/reject', authenticate, authorize('admin'), rejectReturn);

// -------------------- Shared (owner / admin) Routes --------------------

// GET /api/returns/:id
router.get('/:id', authenticate, getReturn);

module.exports = router;
