const mongoose = require('mongoose');

// CartItem subdocument - Snapshot of product
// Price is locked here to prevent price changes

const CartItemSchema = new mongoose.Schema(
    {
        product:{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },

        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        //null if product is simple
        sku: {
            type: String,
            default: null,
        },

        // Snapshot: {color: 'Blue', size: 'M'}
        attributes: {
            type: Map,
            of: String,
        },

        quantity: {
            type: Number,
            required: true,
            min: [1, 'Quantity must be at least 1'],
        },

        //locked at the moment of adding
        price: {
            type: Number,
            required: true,
        },

        name: {
            type: String,
            required: true,
        },

        image: {
            type: String,
        },
    },
    { _id: true}
);

const cartSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true // one cart per user
        },

        items: [CartItemSchema],

        couponCode: {
            type: String,
            default: null,
        },
    },

    {
        timestamps: true,
        toJSON: { virtuals: true }, 
        toObject: { virtuals: true },
    }
);

// Virtual: total price of all items

cartSchema.virtual('subtotal').get(function () {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
});

// Virtual: total number of items

cartSchema.virtual('totalItems').get(function () {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

cartSchema.index({ user: 1 });

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;