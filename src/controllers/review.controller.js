const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const SubOrder = require('../models/SubOrder');
const AppError = require('../utils/AppError');
const { sendSuccess, sendPaginated } = require('../utils/apiResponse');
const { processMultiple, deleteImage } = require('../services/image.service');
const paginate = require('../utils/paginate');

// Recalculates Product avgRating / numReviews

const recalculateProductRating = async (productId) => {

    const stats = await Review.aggregate([
        { $match: { product: productId } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, numReviews: { $sum: 1 } } },
    ]);

    const avgRating = stats[0]?.avgRating || 0 ;
    const numReviews = stats[0]?.numReviews || 0;

    await Product.findByIdAndUpdate(productId, {
        avgRating: Math.round(avgRating * 10) / 10, // one decimal place
        numReviews,
    });
};


// POST /api/reviews ----- authenticated customers only

const createReview = async (req, res, next) => {
    try{

        const { product, order: orderId, rating, comment} = req.body;

        if(!product || !rating || !comment) {
            return next(new AppError('Product, rating and comment are required', 400));
        }

        if (rating < 1 || rating > 5) {
            return next(new AppError('Rating must be between 1 and 5', 400));
        }

        // Verified purchase: the product must appear in a DELIVERED suborder

        const userbOrderIds = await Order.find({ user: req.user._id}).distinct('_id');

        const verifiedSubOrder = await SubOrder.findOne({
            order: { $in: userbOrderIds },
            status: 'delivered',
            'items.product': product,
        });

        if (!verifiedSubOrder) {
            return next(new AppError('You can only review products you have purchased and received', 403));
        }

        const alreadyReviewed = await Review.findOne({ user: req.user._id, product });

        if (alreadyReviewed) {
            return next(new AppError('You have already reviewed this product', 400));
        }

        const reviewData = {
            user: req.user._id,
            product,
            order: verifiedSubOrder.order,
            rating,
            comment,
        };

        if (req.files && req.files.length > 0) {
            reviewData.images = await processMultiple(
                req.files.map((f) => f.buffer),
                'reviews'
            );
        }

        const review = await Review.create(reviewData);
        await recalculateProductRating(product);

        sendSuccess(res, { review}, 'Review created', 201);

    } catch (error) {
        next(error);
    }
};

// GET /api/reviews/product/productId ----- public

const getProductReviews = async (req, res, next) => {
    try{

        const result = await paginate(Review, { product: req.params.productId }, {
            page: req.query.page,
            limit: req.query.limit,
            sort: { createdAt: -1 },
            populate: { path: 'user', select: 'name'},
        });

        sendPaginated(res, result.data, result.pagination, 'Reviews retrieved');

    } catch (error) {
        next(error);
    }
};


// PATCH /api/reviews/:id ----- owner only

const updateReview = async (req, res, next) => {
    try{
        const review = await Review.findById(req.params.id);
        if(!review) return next(new AppError('Review not found', 404));

        if(review.user.toString() !== req.user._id.toString()) {
            return next (new AppError('You can only edit your own reviews', 403));
        }

        const { rating, comment } = req.body;

        if (rating !== undefined) {
            if(rating < 1 || rating > 5) {
                return next(new AppError('Rating must be between 1 and 5', 400));
            }
            review.rating = rating;
        }

        if (comment !== undefined) review.comment = comment;

        if (req.files && req.files.length > 0) {
            const newImages = await processMultiple(
                req.files.map((f) => f.buffer),
                'reviews'
            );
            review.images.push(...newImages);
        }

        await review.save();
        await recalculateProductRating(review.product);

        sendSuccess(res, { review }, 'Review updated');

    } catch (error) {
        next(error);
    }
};


// DELETE /api/reviews.:id ----- owner or admin

const deleteReview = async (req, res, next) => {
    try{

        const review = await Review.findById(req.params.id);
        if(!review) return next(new AppError('Review not found', 404));

        if (!req.user.isAdmin && review.user.toString() !== req.user._id.toString()) {
            return next (new AppError('You can only delete your own reviews', 403));
        }

        await Promise.all(review.images.map((img) => deleteImage(img.publicId)));

        const productId = review.product;
        await review.deleteOne();
        await recalculateProductRating(productId);

        sendSuccess(res, null, 'Review deleted');

    } catch (error) {
        next(error);
    }
};


// POST /api/reviews/:id/response ----- product's seller only

const respondToReview = async (req, res, next) => {
    try{
        const { text } = req.body;
        if(!text) return next(new AppError('Response text is required', 400));

        const review = await Review.findById(req.params.id).populate('product', 'seller');
        if(!review) return next(new AppError('Review not found', 404));

        if(review.product.seller.toString() !== req.user._id.toString()) {
            return next(new AppError('You can only respond to reviews of your own products', 403));
        }

        review.sellerResponse = { text, respondedAt: new Date() };
        await review.save();

        sendSuccess(res, { review }, 'Response added');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createReview,
    getProductReviews,
    updateReview,
    deleteReview,
    respondToReview,
};

