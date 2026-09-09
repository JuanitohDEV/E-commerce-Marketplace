const mongoose = require('mongoose');

const subOrderItemSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
        },

        name: { type: String, required: true }, //snaptshot
        image: { type: String }, //snapshot
        price: { type: Number, required: true }, //snapshot
        quantity: { type: Number, required: true }, 
        sku: { type: String, default: null },
        
        attributes: {
            type: Map,
            of: String,
        },
    },

    { _id: false }
);

// Track every status change

const statusHistorySchema = new mongoose.Schema(
    {
        status: { type: String, required: true },
        note: { type: String },
        date: { type: Date, default: Date.now },
    },
    { _id: false }
);

const subOrderSchema = new mongoose.Schema(
    {
        order:{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
        },

        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        items: [subOrderItemSchema],

        // financial breakdown per seller
        subtotal: {
            type: Number,
            required: true,
        },

        // Platform commission
        commission: {
            type: Number,
            required: true,
        },

        // What the seller recieves
        sellerEarnings:{
            type: Number,
            required: true,
        },

        commissionRate: {
            type: Number,
            required: true,
        },

        // Independent status per seller

        status:{
            type: String,
            enum: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'return_requested','cancelled', 'returned'],
            default: 'pending',
        },

        statusHistory: [statusHistorySchema],

        // Seller adds this when marked as shipped
        trackingNumber: {
            type: String,
        },

        shippedAt: {
            type: Date,
        },

        deliveredAt: {
            type: Date,
        },

        // Stripe Transfer ID - saved when seller recieves their payout
        stripeTransferId: {
            type: String,
        },

        paidOutAt: {
            type: Date,
        },

    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Indexes

subOrderSchema.index({ order: 1});
subOrderSchema.index({ seller: 1, createdAt: -1 });
subOrderSchema.index({ status: 1});

const SubOrder = mongoose.model('SubOrder', subOrderSchema);

module.exports = SubOrder;

