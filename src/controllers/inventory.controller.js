const Product = require('../models/Product');
const InventoryMovement = require ('../models/InventoryMovement');
const AppError = require ('../utils/AppError');
const { sendSuccess, sendPaginated } = require('../utils/apiResponse');
const paginate = require('../utils/paginate');

// Admin sees all products, sellers sees only their own
const buildOwnerFilter = (user) => {
    return user.isAdmin ? {} : { seller: user._id };
};

// GET /api/inventory
// Admin -> all products
// seller -> only their products

const getInventory = async (req, res, next) => {
    try{
        const { status, category, page = 1, limit = 20} = req.query;

        const filter = { isActive: true, ...buildOwnerFilter(req.user) };
        if(category) filter.category = category;

        if(status === 'out') filter.stock = 0;
        if(status === 'low') filter.$expr = {
            $and: [
                {$lte: ['$stock', '$lowStockThreshold'] },
                {$gt: ['$stock', 0]},
            ],
        };

        if (status === 'normal') filter.$expr = {
            $gt: ['$stock', '$lowStockThreshold'],
        };

        const result = await paginate(Product, filter, {
            page,
            limit,
            sort: { stock: 1},
            populate: { path:'category', select: 'name'},
            select: 'name stock lowStockThreshold hasVariants variants category seller',
        });

        sendPaginated(res, result.data, result.pagination, 'Inventory retrieved');
    } catch (error) {
        next(error);
    }
};

// GET /api/inventory/summary
// Admin -> global summary / seller -> their own summary

const getInventorySummary = async (req, res, next) => {
    try{
        const ownerFilter = buildOwnerFilter(req.user);

        const [total, lowStock, outOfStock, valueResult] = await Promise.all([
            Product.countDocuments({ 
                isActive: true, 
                ...ownerFilter 
            }),

            Product.countDocuments({
                isActive: true,
                ...ownerFilter,
                $expr: {
                    $and: [
                        {$lte: ['$stock', '$lowStockThreshold'] },
                        { $gt: ['$stock', 0] },
                    ],
                },
            }),

            Product.countDocuments({
                isActive: true,
                stock: 0,
                ...ownerFilter
            }),

            Product.aggregate([
                { $match: { isActive: true, hasVariants: false, ...ownerFilter}},
                { $group: {
                    _id: null,
                    total: { $sum: { $multiply: ['$stock', '$price']}},
                }},
            ]),
        ]);

        sendSuccess(res, {
            total,
            lowStock,
            outOfStock,
            inventoryValue: valueResult[0]?.total || 0,
        }, 'Inventory summary retrieved');
    } catch (error){
        next(error);
    }
};

// GET /api/inventory/movements
// Admin -> all movements, Seller -> only movements of their products
const getMovements = async (req, res, next) => {
    try{
        const { productId, type, dateFrom, dateTo, page = 1, limit = 20} = req.query;

        const filter = {};
        if(type) filter.type = type;

        if(dateFrom || dateTo) {
            filter.createdAt = {};
            if(dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if(dateTo) filter.createdAt.$lte = new Date(dateTo);
        }

        if(!req.user.isAdmin){
            const sellerProducts = await Product
            .find({ seller: req.user._id})
            .select('_id');
            filter.product = {$in: sellerProducts.map((p) => p._id) };
        } else if (productId) {
            filter.product = productId;
        }

        const result = await paginate(InventoryMovement, filter, {
            page,
            limit,
            sort: {createdAt:-1},
            populate:[
                {path: 'product', select: 'name'},
                { path: 'createdBy', select: 'name email'},
            ],
        });

        sendPaginated(res, result.data, result.pagination, 'Movements retrieved');
    } catch (error) {
        next(error);
    }
};

//GET /api/inventory/:productId/movements
const getProductMovements = async (req, res, next) => {
    try{
        const product = await Product.findById(req.params.productId).select('name stock seller'); 
        if(!product) return next(new AppError('Product not found', 404));

        //Seller
        if(!req.user.isAdmin && product.seller.toString() !== req.user._id.toString()) {
            return next (new AppError('You can only view movements of your own products', 403))
        }

        const movements = await InventoryMovement.find({ product: req.params.productId})
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('createdBy', 'name email');

        sendSuccess(res, { product, movements}, 'Product movements retrieved');
    } catch (error) {
        next(error);
    }
};

//PATCH /api/inventory/:productId/restock

const restockProduct= async(req, res, next) => {
    try{
        const { quantity, note, sku} = req.body;

        if(!quantity || quantity <= 0) {
            return next (new AppError('Quantity must be a positive number', 400));
        }

        const product = await Product.findById(req.params.productId);
        if(!product) return next(new AppError('Product not found', 404));

        //seller can only restock ther own products
        if(!req.user.isAdmin && product.seller.toString() !== req.user._id.toString()){
            return next (new AppError('You can only restock your own products', 403));
        }

        const stockBefore = sku
        ? product.variants.find((v) => v.sku === sku)?.stock ?? 0
        : product.stock;

        if(sku){
            await Product.findOneAndUpdate(
                { _id: product._id, 'variants.sku': sku },
                { $inc: {'variants.$.stock': quantity } }
            );
        } else {
            await Product.findByIdAndUpdate( product._id, { $inc: { stock: quantity } });
        }

        const stockAfter = stockBefore + quantity;

        await InventoryMovement.create({
            product: product._id,
            sku: sku || null,
            type: 'restock',
            quantity,
            stockBefore,
            stockAfter,
            note,
            createdBy: req.user._id,
        });

        // Reactivate product if it was out of stock
        if (stockBefore === 0 ){
           await Product.findByIdAndUpdate(product._id, { isActive: true });
        }

        sendSuccess(res, { stockBefore, stockAfter, quantity}, 'Stock updated');
    } catch (error) {
        next(error);
    }
};

// PATCH /api/inventory/:productID/adjust

const adjustStock = async (req, res, next) => {
    try{
        const { quantity, note, sku} = req.body;

        if( !note || note.trim().length === 0 ) {
            return next (new AppError('A note is required for manual adjustments', 400));
        }

        if (quantity === undefined) {
            return next (new AppError('Quantity is required', 400));
        }

        const product = await Product.findById(req.params.productId);
        if(!product) return next (new AppError ('Product not found', 404));

        const stockBefore = sku
        ? product.variants.find((v) => v.sku === sku)?.stock ?? 0
        : product.stock;

        const stockAfter = stockBefore + quantity;

        if(stockAfter < 0) {
            return next (new AppError(`Adjustment would result in negative (${stockAfter})`, 400))
        }

        if(sku) {
            await Product.findOneAndUpdate(
                { _id: product._id, 'variants.sku': sku},
                { $inc: {'variants.$.stock': quantity}}
            );
        } else {
            await Product.findByIdAndUpdate(product._id, { $inc: { stock: quantity} });
        }

        await InventoryMovement.create({
            product: product._id,
            sku: sku || null,
            type: 'adjustment',
            quantity,
            stockBefore,
            stockAfter,
            note,
            createdBy: req.user._id
        });


        if(sku) {
            const updateProduct = await Product.findById(product._id).select('variants');
            const totalStock = updateProduct.variants
            .filter((v) => v.isActive)
            .reduce((sum, v) => sum + v.stock, 0);

            if(totalStock === 0) {
                await Product.findByIdAndUpdate(product._id, { isActive: false });
            }
        } else if (stockAfter === 0) {
            await Product.findByIdAndUpdate(product._id, { isActive: false });
        }

        sendSuccess(res, { stockBefore, stockAfter, quantity}, 'Stock adjusted');
    } catch (error) {
        next(error);
    }
};


// GET /api/inventory/export
const exportMovements = async (req, res, next) => {
    try{
        const { dateFrom, dateTo, type} = req.query;

        const filter = {};
        if(type) filter.type = type;
        if(dateFrom || dateTo){
            filter.createdAt = {};
            if(dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if(dateTo) filter.createdAt.$lte = new Date(dateTo);
        }

        const movements = await InventoryMovement.find(filter)
        .populate('product', 'name')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1})
        .limit(500);

        const headers = 'Date,Product,SKU,Type,Quantity,Stock Before,Stock After,Note,Created By';

        const rows = movements.map((m) => [
            new Date(m.createdAt).toISOString(),
            m.product?.name   || '',
            m.sku             || '',
            m.type,
            m.quantity,
            m.stockBefore,
            m.stockAfter,
            `"${(m.note || '').replace(/"/g, '""')}"`,
            m.createdBy?.name || '',
            ].join(','));

        const csv = [headers, ...rows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=inventory-movements.csv');
        res.status(200).send(csv);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getInventory, getInventorySummary, getMovements,
    getProductMovements, restockProduct, adjustStock,
    exportMovements,
};