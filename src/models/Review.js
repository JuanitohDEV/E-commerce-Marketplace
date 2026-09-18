const mongoose = require('mongoose');

const reviewImageSchema = new mongoose.Schema({
    url: { type: String, required: true },
    publicId: { type: String, required: true },
}, { _id: false });

const sellerResponseSchema = new mongoose.Schema({
    text: {type: String, required: true, trim: true, maxlength: 1000 },
    respondedAt: { type: Date, default: Date.now },
}, { _id: false });

const reviewSchema = new mongoose.Schema({
    user:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    product:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },

    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
    },

    rating:{
        type: Number,
        required: true,
        min: 1,
        max: 5,
    },

    comment:{
        type: String,
        required: true,
        trim: true,
        maxlength: 2000,
    },

    images:{
        type: [reviewImageSchema],
        default: [],
    },

    sellerResponse: sellerResponseSchema,
}, { timestamps: true });

// One review per user per product
reviewSchema.index({ user: 1, product: 1 }, { unique: true });
reviewSchema.index({ product: 1, createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;