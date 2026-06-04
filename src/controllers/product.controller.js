const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const { sendSuccess, sendPaginated } = require('../utils/apiResponse');
const { processMultiple, deleteImage } = require('../services/image.service');
const paginate = require('../utils/paginate');

// GET /api/products
// Public - search, filter and paginate 
const getProducts = async (req, res, next) => {
    try{
        const{
            page = 1,
            limit = 20,
            search,
            category,
            minPrice,
            maxPrice,
            minRating,
            inStock,
            isFeatured,
            seller,
            sortBy = 'newest'
        } = req.query;

        const filter = { isActive: true, approvalStatus: 'approved' };

        // Full-text search
        if(search) filter.$text = { $search: search };
        if(category) filter.category = category;
        if(seller) filter.seller = seller;
        if(isFeatured === 'true') filter.isFeatured = true;
        if(inStock === 'true') filter.stock = { $gt: 0 };

        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = Number(minPrice);
            if (maxPrice) filter.price.$lte = Number(maxPrice);
        }

        if (minRating) filter.avgRating = { $gte: Number(minRating) };

        // Sort options
        const sortOptions = {
            newest: { createdAt: -1 },
            oldest: { createdAt: 1 },
            price_asc: { price: 1 },
            price_desc: { price: -1 },
            rating: { avgRating: -1 },
            popular: { views: -1 },
            ...(search && { score: { $meta: 'textScore' } }),
        };

        const sort = sortOptions[sortBy] || sortOptions.newest;

        const result = await paginate(Product, filter, {
            page,
            limit,
            sort,
            populate: [
                {path: 'category', select: 'name slug'},
                {path: 'sellerProfile', select: 'storeName slug'},
            ],
            select: 'name slug images price compareAtPrice stock hasVariants avgRating numReviews isFeatured',
        });

        sendPaginated(res, result.data, result.pagination, 'Products retrieved');
    } catch (error) {
        next(error);
    }
};

// GET /api/products/featured
// Home page featured products
const getFeaturedProducts = async (req, res, next) => {
    try{
        const products = await Product.find({
            isActive: true,
            approvalStatus: 'approved',
            isFeatured: true,
        })
        .sort({ avgRating: -1 })
        .limit(8)
        .select('name slug images price compareAtPrice avgRating numReviews')
        .populate('sellerProfile','storeName');

        sendSuccess(res, { products }, 'Featured products retrieved');
    } catch (error) {
        next(error);
    }
};

// GET /api/products/:slug
// Public - single product detail page
const getProduct = async (req, res, next) => {
    try{
        const product = await Product.findOne({
            slug: req.params.slug,
            isActive: true,
            approvalStatus: 'approved',
        })
        .populate('category', 'name slug')
        .populate('sellerProfile', 'storeName logo avgRating totalSales');
        
        if(!product) {
            return next(new AppError('Product not found', 404));
        }

        // Increment views count
        Product.findByIdAndUpdate(product._id, { $inc: { views: 1 } }).exec();

        sendSuccess(res, { product }, 'Product retrieved');
    } catch (error) {
        next(error);
    }
};

// POST /api/products --- ONLY SELLER
const createProduct = async (req, res, next) => {
    try {
        const{
            name,
            description,
            shortDescription,
            category,
            tags,
            hasVariants,
            price,
            compareAtPrice,
            stock,
            variants,
            lowStockThreshold,
            weight,
            dimensions,
            meta,
        } = req.body;

        // Validate: simple product needs price
        if(!hasVariants && !price) {
            return next(new AppError('Price is required for simple products', 400));
        }

        // Validate: product with vairiants needs at leaast one variant
        if(hasVariants && (!variants || variants.length === 0)) {
            return next(new AppError('At least one variant is required', 400));
        }

        const productData = {
            name,
            description,
            shortDescription,
            category,
            tags,
            hasVariants,
            price,
            compareAtPrice,
            stock,
            variants: hasVariants ? variants: [],
            lowStockThreshold,
            weight,
            dimensions,
            meta,
            seller: req.user._id,
            approvalStatus: 'pending', // New products need admin approval
        };

        // Process images if uploaded
        if(req.files && req.files.length > 0) {
            const uploadedImages = await processMultiple(
                req.files.map((f) => f.buffer),
                'products'
            );

            // Mark first image as primary
            productData.images = uploadedImages.map((img, index) => ({
                ...img,
                isPrimary: index === 0,
            }));
        }

        const product = await Product.create(productData);

        sendSuccess(res, { product }, 'Product created. Pending admin approval.', 201);
    } catch (error) {
        next(error);
    }
};

// PATCH /api/products/:id --- SELLER OWNER ONLY
const updateProduct = async (req, res, next) => {
    try{
        const product = await Product.findById(req.params.id);

        if(!product) {
            return next(new AppError('Product not found', 404));
        }

        // Verify the sellr owns this product
        if(product.seller.toString() !== req.user._id.toString()) {
            return next(new AppError('You can only edit your own products', 403));
        }

        const allowedFields = [
            'name',
            'description',
            'shortDescription',
            'category',
            'tags',
            'price',
            'compareAtPrice',
            'stock',
            'variants',
            'lowStockThreshold',
            'weight',
            'dimensions',
            'meta',
            'isFeatured',
        ];

        allowedFields.forEach((field) => {
            if(req.body[field] !== undefined) {
                product[field] = req.body[field];
            }
        });

        product.approvalStatus = 'pending'; // Updated products need re-approval

        await product.save();

        sendSuccess(res, { product }, 'Product updated. Pending admin re-approval.');
    } catch (error) {
        next (error);
    }
};

// DELETE /api/products/:id - SELLER OWNER OR ADMIN
const deleteProduct = async (req, res, next) => {
    try{
        const product = await Product.findById(req.params.id);

        if(!product) {
            return next(new AppError('Product not found', 404));
        }

        // Admin can delete any product - Seller can only delete their own
        const isAdmin = req.user.isAdmin;
        const isOwner = product.seller.toString() === req.user._id.toString();

        if (!isAdmin && !isOwner) {
            return next (new AppError('You can only delete your own products', 403));
        }

        // Delete all images from Cloudinary
        await Promise.all(
            product.images.map((img) => deleteImage(img.publicId))
        );

        // Soft delete - hide from catalog but keep in DB for order history
        product.isActive = false;
        await product.save();

        sendSuccess(res, null, 'Product deleted');
    } catch (error) {
        next(error);
    }
};


// POST /api/products/:id/images - seller owner only
const addProductImages = async (req, res, next) => {
    try{
        const product = await Product.findById(req.params.id);

        if(!product) {
            return next(new AppError('Product not found', 404));
        }

        if (product.seller.toString() !== req.user._id.toString()) {
            return next(new AppError('You can only edit your own products', 403))
        }

        if (!req.files || req.files.length === 0) {
            return next(new AppError('No images provided', 400))
        }

        // Check total image limit
        if(product.images.length + req.files.length > 8) {
            return next(
                new AppError(
                `Cannot add ${req.files.length} images. Product already has ${product.images.length} (max 8)`,400
                )
            );
        }

        const newImages = await processMultiple(
            req.files.map((f) => f.buffer),
            'products'
        );

        // Map to imageSchema format
        const formattedImages = newImages.map((img) => ({
            ...img,
            isPrimary:false,
        }));

        product.images.push(...formattedImages);
        await product.save();

        sendSuccess(res, { images: product.images }, 'Images uploaded');
    } catch (error){
        next(error);
    }
};

// DELETE /api/products/:id/images/:publicId - SELLER OWNER ONLY

const deleteProductImage = async (req, res, next) => {
    try{
        const product = await Product.findById(req.params.id);

        if(!product){
            return next(new AppError('Product not found', 404));
        }

        if (product.seller.toString() !== req.user._id.toString()) {
            return next(new AppError('You can only edit your own products', 403));
        }

        const imageIndex = product.images.findIndex(
            (img) => img.publicId === req.params.publicId
        );

        if( imageIndex === -1){
            return next(new AppError('Image not found', 404));
        }

        // Delete from Cloudinary
        await deleteImage(req.params.publicId);

        // Remove from product
        product.images.splice(imageIndex, 1);

        // If delete image was primary, make the first remaining image primary
        if(product.images.length > 0 && !product.images.some((img) => img.isPrimary)) {
            product.images[0].isPrimary = true;
        }

        await product.save()
        
        sendSuccess(res, { images: product.images}, 'Image deleted');
    } catch (error){
        next(error);
    }
};


// ------------------------------------------- ADMIN MODERATIONS ------------------------------------------------------------------------------------

// GET /api/products/pending 

const getPendingProducts = async (req, res, next) => {
    try{
        const result = await paginate(Product, { approvalStatus: 'pending'}, {
            page: req.query.page,
            limit: req.query.limit,
            populate: { path: 'seller', select: 'name email'},
            select: 'name createdAt seller approvalStatus',
        });

        sendPaginated(res, result.data, result.pagination, 'Pending products retrivered');
    } catch (error) {
        next(error);
    }
};

// PATCH api/products/:id/approve

const approveProduct = async (req, res, next) => {
    try{
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            {
                approvalStatus: 'approved',
                reviewedBy: req.user._id,
                reviewedAt: new Date(),
                isActive: true,
            },
            { new: true}
        );

        if (!product) return next(new AppError('Product not found', 404));

        sendSuccess(res, { product }, 'Product approved');
    } catch (error) {
        next(error);
    }
};


// PATCH api/products/:id/reject

const rejectProduct = async (req, res, next) => {
    try{
        const { reason } = req.body;

        if(!reason) {
            return next(new AppError('Rejection reason is required', 400));
        }

        const product = await Product.findByIdAndUpdate(
            req.params.id,
            {
                approvalStatus: 'rejected',
                approvalNote: reason,
                reviewedBy: req.user._id,
                reviewedAt: new Date(),
                isActive: false,
            },
            { new: true }
        );

        if (!product) return next(new AppError('Product not found', 404));

        sendSuccess(res, { product }, 'Product rejected');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getProducts, 
    getFeaturedProducts, 
    getProduct, 
    createProduct, 
    updateProduct, 
    deleteProduct,
    addProductImages,
    deleteProductImage, 
    getPendingProducts,
    approveProduct, 
    rejectProduct,
}