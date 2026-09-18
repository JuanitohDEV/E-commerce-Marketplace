const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, default: null },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true},
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
    status: { type: String, required: true },
    note: { type: String },
    date: { type: Date, default: Date.now },
}, { _id: false });

const returnSchema = new mongoose.Schema({
    subOrder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubOrder',
        required: true,
    },

    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
    },

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    items: {
        type: [returnItemSchema],
        required: true,
        validate: [(arr) => arr.length > 0, 'At least one item is required'],
    },

    reason: {
        type: String,
        enum: ['defective', 'wrong_item', 'not_as_described', 'no_longer_needed', 'other'],
        required: true,
    },

    note: {
        type: String,
        trim: true,
        maxlength: 1000,
    },

    status: {
        type: String,
        enum: ['requested', 'approved', 'rejected', 'refunded'],
        default: 'requested',
    },

    statusHistory: [statusHistorySchema],
    
    refundAmount: { type: Number },

    stripeRefundId: { type: String },

    stripeTransferReversalId: { type: String },

    rejectionReason: { type: String },

    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    
    reviewedAt: { type: Date },
});

returnSchema.index({ subOrder: 1 });
returnSchema.index({ user: 1, createdAt: -1 });
returnSchema.index({ status: 1 });

const Return = mongoose.model('Return', returnSchema);

module.exports = Return;