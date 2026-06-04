const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); //encrypt passwords

// -------- Address subdocument --------------------------
// An address always belongs to a user

const addressSchema = new mongoose.Schema({

    street:  { type: String },
    city:    { type: String },
    state:   { type: String },
    zip:     { type: String },
    country: { type: String, default: 'Colombia' },
}, { _id: false});

// ------------ User Schema ------------------------------

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            minlength: [2, 'Name must be at least 2 character'],
            maxLength: [60, 'Name cannot exceed 60 characters'],
        },

        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true, // Unique index un MongoDB
            lowercase: true, // Save everything in lowercase
            trim: true, // Remove the spacing
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'], //Email validation
        },

        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false,
        },

        // Role Array: a user can be both a customer and a seller at the same time 
        role: {
            type: [String],
            enum: {
                values: ['customer', 'seller'],
                message: 'Invalid role. Allowed roles: customer, seller'
            },
            default: ['customer'],
        },

        isAdmin: {
            type: Boolean,
            default: false,
            select: false,
        },

        // Is never save as plain text
        refreshToken: {
            type: String,
            select: false,
        },

        // Token for reset password
        passwordResetToken: {
            type: String,
            select: false,
        },

        passwordResetExpires: {
            type: Date,
            select: false,
        },

        avatar: {
            url: {type:String},
            publicId: {type:String}, //Id cloudinary to delete the image
        },

        address: addressSchema,

        // Wishlist - Product reference array

        wishlist: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
            },
        ],

        // Id customer for Stripe -> Is created at the first checkout

        stripeCustomerId: {
            type: String,
            select: false,
        },

        isVerified: {
            type: Boolean,
            default: false,
        },

        // Soft delete

        isActive: {
            type: Boolean,
            default: true,
            select: false,
        },
    },

    {
        // createdAt , updateAt 

        timestamps: true,

        //Virtuals when the document is JSON
        
        toJSON: { virtuals: true},
        toObject: { virtuals: true},
    }
);

// ------------ INDEX ----------------------------

userSchema.index({ isActive: 1, createdAt: -1});

// --- Virtual -> isSeller ----------------------

userSchema.virtual('isSeller').get(function() {
    return this.role.includes('seller');
});

// ---- Pre-save hook: hash Password -------------

// Runs before every .save(), Only if the password was changed
// Encrypt password

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    this.password = await bcrypt.hash(this.password, 12);
    next();
});


// --------- Instance method: comparePassword ------------

userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};


const User = mongoose.model('User', userSchema);

module.exports = User;