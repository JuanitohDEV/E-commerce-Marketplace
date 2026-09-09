const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: [true, 'Coupon code is required'],
            unique: true,
            uppercase: true,
            trim: true,
        },

        description: {
            type: String,
        },

        type: {
            type: String,
            enum: ['percentage', 'fixed'],
            required: [true, 'Coupon type is required'],
        },

        discountValue: {
            type: Number,
            required: [true, 'Discount value is required'],
            min: [0, 'Discount value cannot be negative'],
        },

        // Max discount for percentage
        // prevents 50% off on a $1.000.000 order
        maxDiscount: {
            type: Number,
        },

        // Minimum order total required to use this coupon
        minOrderTotal: {
            type: Number,
            default: 0,
        },

        // null = unlimted uses
        maxUses: {
            type: Number,
            default: null,
        },

        currentUses: {
            type: Number,
            default: 0,
        },

        // How many times one user can use this coupon
        maxUsesPerUser: {
            type: Number,
            default: 1,
        },  

        startsAt: {
            type: Date,
            default: Date.now,
        },

        expiresAt: {
            type: Date,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        // Tracks which users have used this coupon and how many times
        usedBy:[
            {
                user: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
                count: {type: Number, default: 1},
            },
        ],

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true,
    }
);


// ---------------------------- Indexes ----------------------------
couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1, expiresAt: 1 });

// Instance method: isValid

// Validates coupon for a specific user and order total

couponSchema.methods.isValid = function (userId, orderTotal) {
    const now = new Date();

    if(!this.isActive) {
        return { valid: false, reason: 'Coupon is not active' };
    }

    if(this.startsAt > now) {
        return { valid: false, reason: 'Coupon is not yet valid' };
    }

    if(this.expiresAt && this.expiresAt < now) {
        return { valid: false, reason: 'Coupon has expired' };
    }

    if(this.maxUses && this.currentUses >= this.maxUses) {
        return { valid: false, reason: 'Coupon has reached its maximum uses' };
    }

    if(orderTotal < this.minOrderTotal) {
        return {
            valid: false,
            reason: `Minimum order total of $${this.minOrderTotal} required`,
        };
    }

    // Check how many times this user has used the coupon
    const userUsage = this.usedBy.find(
        (u) => u.user.toString() === userId.toString()
    );

    if(userUsage && userUsage.count >= this.maxUsesPerUser) {
        return { valid: false, reason: 'You have already used this coupon' };
    }

    return { valid: true };
};


// instance method: calculateDiscount

// Returns the discount amount for a given order total

couponSchema.methods.calculateDiscount = function (orderTotal) {
    if(this.type === 'fixed') {
        // Fixed discount cannot exceed the order total
        return Math.min(this.discountValue, orderTotal);
    }

    // Percentage discount
    const discount = (orderTotal * this.discountValue) / 100;

    // Apply maxDiscount cap if set
    return this.maxDiscount ? Math.min(discount, this.maxDiscount) : discount;
};

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;