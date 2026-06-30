const express = require ('express');
const { authenticate, authorize } = require ('../middleware/authenticate');
const {
    getInventory, getInventorySummary, getMovements,
    getProductMovements, restockProduct, adjustStock,
    exportMovements,
} = require ('../controllers/inventory.controller');

const router = express.Router();

// Admin and seller --- each sees their own scope (filtered in controller)
router.get('/',        authenticate, authorize('admin', 'seller'), getInventory);
router.get('/summary', authenticate, authorize('admin', 'seller'), getInventorySummary);
router.get('/movements', authenticate, authorize('admin', 'seller'), getMovements);

// Admin only --- global export and manual adjustments
router.get('/export',  authenticate, authorize('admin'), exportMovements);
router.patch('/:productId/adjust', authenticate, authorize('admin'), adjustStock);

// Admin and seller --- seller ownership validated in controller
router.get('/:productId/movements',  authenticate, authorize('admin', 'seller'), getProductMovements);
router.patch('/:productId/restock',  authenticate, authorize('admin', 'seller'), restockProduct);

module.exports = router;