const mongoose = require ('mongoose');
const slugify = require('slugify');

const sellerProfileSchema = new mongoose.Schema(
    {
        // One-to-one relationship 
        user:{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },

        storeName:{
            type: String,
            required: [true, 'Store name is required'],
            trim: true,
            unique: true,
            minlength:[3, 'Store name must be at least 3 characters'],
            maxlength:[60, 'Store name cannot exceed 60 characters'],
        },

        storeSlug:{ //Store URLS
            type: String,
            unique: true,
        },

        description: {
            type: String,
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },

        logo: {
            url: { type: String },
            publicId: { type: String},
        },

        banner: {
            url: { type: String },
            publicId: { type: String},
        },

        status: {
            // Pending -> waiting for admin review
            // active -> approved, can sell
            // suspended -> temporarily disabled by admin
            // rejected -> application denied

            type: String,
            enum: ['pending', 'active', 'suspended', 'rejected'],
            default: 'pending',
        },

        stripeAccountId: {
            type: String,
            select: false,
        },

        stripeOnboardingComplete: {
            type: Boolean,
            default: false,
        },

        // Platform commission percentage - default 10%
        // Admin can customize per seller
        commissionRate: {
            type: Number,
            default: 10,
            min: [0, 'Commision rate cannot be negative'],
            max: [100, ' comission rate cannot exceed 100'],
        },

        avgRating:{
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },

        totalSales: {
            type: Number,
            default: 0,
        },

        totalRevenue: {
            type: Number,
            default: 0,
        },

        shippingPolicy:{
            type: String,
            maxlength:[500, 'Shipping policy cannot exceed 500 characters'],
        },

        returnPolicy:{
            type: String,
            maxlength: [500, 'Return policy cannot exceed 500 characters'],
        },
         
        rejectionReason:{ // Admin fills this 
            type: String,
        },

        reviewedBy:{ // Admin who reviewed 
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User', 
        },

        reviewedAt:{
            type: Date,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true},
    }
);

// --------------------------------- Index -------------------------------------
sellerProfileSchema.index({ storeSlug: 1});
sellerProfileSchema.index({ status: 1});
sellerProfileSchema.index({ user: 1});

// ------------------------------- Virtual: isVerified ----------------------------
// a seller is verified when active And Stripe onboarding is complete

sellerProfileSchema.virtual('isVerified').get(function() {
    return this.status === 'active' && this.stripeOnboardingComplete;
});

// --------------------------------- Pre-save Hook ------------------------------------
sellerProfileSchema.pre('save', async function (next) {
    if(!this.isModified('storeName')) return next();

    let slug = slugify(this.storeName, { lower:true, strict: true});


  const existing = await mongoose.model('SellerProfile').findOne({
    storeSlug: slug,
    _id: { $ne: this._id },
  });

  if (existing) slug = `${slug}-${Date.now()}`;

  this.storeSlug = slug;
  next();
});

const SellerProfile = mongoose.model('SellerProfile', sellerProfileSchema);

module.exports = SellerProfile;