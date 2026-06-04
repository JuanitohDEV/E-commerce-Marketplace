const express = require ('express');
const { authenticate, authorize, optionalAuth} = require('../middleware/authenticate');
const { uploadProduct } = require('../middleware/upload');
const {
  getProducts, getFeaturedProducts, getProduct,
  createProduct, updateProduct, deleteProduct,
  addProductImages, deleteProductImage,
  getPendingProducts, approveProduct, rejectProduct,
} = require('../controllers/product.controller');
    
const router = express.Router();

// ------------------------------- Public Router  -----------------------------------------------

// GET /api/products
router.get('/', optionalAuth, getProducts);
router.get('/featured', getFeaturedProducts);

router.get('/pending', authenticate, authorize('admin'), getPendingProducts);
router.get('/:slug', optionalAuth, getProduct);

// -------------------------------- Seller Routes ---------------------------------------------

// POST /api/products

router.post(
    '/',
    authenticate,
    authorize('seller','admin'),
    uploadProduct,
    createProduct
);

// PATCH /api/products/:id

router.patch(
    '/:id',
    authenticate,
    authorize('seller', 'admin'),
    updateProduct
);

// DELETE /api/products/:id

router.delete(
    '/:id',
    authenticate,
    authorize('seller', 'admin'),
    deleteProduct
);

// POST /api/products/:id/images

router.post(
    '/:id/images',
    authenticate,
    authorize('seller','admin'),
    uploadProduct,
    addProductImages
);

// DELETE /api/products/:id/images/:publicId

router.delete(
    '/:id/images/:publicId',
    authenticate,
    authorize('seller', 'admin'),
    deleteProductImage
);


// ------------------------------ Amin moderation routes ---------------------------------

// PATCH /api/products/:id/approve

router.patch(
    '/:id/approve', 
    authenticate, 
    authorize('admin'),
    approveProduct
);

// PATCH /api/products/:id/reject

router.patch(
    '/:id/reject',
    authenticate,
    authorize('admin'),
    rejectProduct
);

module.exports = router;