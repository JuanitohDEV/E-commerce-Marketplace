const express = require('express');
const { authenticate, authorize } = require('../middleware/authenticate');
const { uploadSingle } = require('../middleware/upload');
const {
    getCategories,
    getCategory,
    createCategory,
    updateCategory,
    deleteCategory,
} = require('../controllers/category.controller');

const router = express.Router();

// GET /api/categories --- public
router.get('/', getCategories);

// GET /api/categories/:slug --- public
router.get('/:slug', getCategory);

// POST /api/categories --- admin only
router.post(
    '/',
    authenticate,
    authorize('admin'),
    uploadSingle,
    createCategory
);

// PATCH /api/categories/:id --- admin only
router.patch(
    '/:id',
    authenticate,
    authorize('admin'),
    uploadSingle,
    updateCategory
);

/// DELETE /api/categories/:id --- admin only
router.delete(
    '/:id',
    authenticate,
    authorize('admin'),
    deleteCategory
);

module.exports = router;