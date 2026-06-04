const mongoose = require('mongoose');
const slugify  = require('slugify');

// ── Variant subdocument ───────────────────────────────────────────────────────
// Only used when product.hasVariants = true
// Each variant has its own SKU, price and stock
const variantSchema = new mongoose.Schema(
  {
    // Unique code: "SHIRT-001-BLUE-M"
    sku: {
      type:     String,
      required: [true, 'SKU is required'],
      trim:     true,
    },

    // Flexible map — supports any attribute combination
    // { color: 'Blue', size: 'M' } or { storage: '256GB', color: 'Black' }
    attributes: {
      type: Map,
      of:   String,
    },

    price: {
      type:     Number,
      required: [true, 'Variant price is required'],
      min:      [0, 'Price cannot be negative'],
    },

    // Crossed-out price to show discount
    compareAtPrice: {
      type: Number,
      min:  [0, 'Compare price cannot be negative'],
    },

    stock: {
      type:    Number,
      default: 0,
      min:     [0, 'Stock cannot be negative'],
    },

    // Variant-specific images — falls back to product images if empty
    images: [{ type: String }],

    isActive: {
      type:    Boolean,
      default: true,
    },
  },
  { _id: true } // each variant has its own _id
);

// ── Image subdocument ─────────────────────────────────────────────────────────
const imageSchema = new mongoose.Schema(
  {
    url:       { type: String, required: true },
    publicId:  { type: String, required: true }, // Cloudinary ID
    alt:       { type: String, default: '' },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

// ── Product Schema ────────────────────────────────────────────────────────────
const productSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Product name is required'],
      trim:      true,
      maxlength: [120, 'Product name cannot exceed 120 characters'],
    },

    // Auto-generated from name — used in URLs: /products/blue-shirt
    slug: {
      type:   String,
      unique: true,
    },

    description: {
      type:      String,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },

    // Short text for product cards in the catalog
    shortDescription: {
      type:      String,
      maxlength: [160, 'Short description cannot exceed 160 characters'],
    },

    // ── Seller ────────────────────────────────────────────────────────────────
    // Every product belongs to a seller — key field for the marketplace
    seller: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'Seller is required'],
    },

    sellerProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'SellerProfile', // populated to show store name and logo in catalog
    },

    category: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Category',
      required: [true, 'Category is required'],
    },

    tags: [{ type: String, trim: true }],

    images: {
      type:     [imageSchema],
      validate: {
        validator: (v) => v.length <= 8,
        message:   'A product cannot have more than 8 images',
      },
    },

    // ── Simple vs Variant products ────────────────────────────────────────────
    // false → price and stock are at the root level
    // true  → price and stock are inside each variant
    hasVariants: {
      type:    Boolean,
      default: false,
    },

    // Only used when hasVariants = false
    price: {
      type: Number,
      min:  [0, 'Price cannot be negative'],
    },

    compareAtPrice: {
      type: Number,
      min:  [0, 'Compare price cannot be negative'],
    },

    stock: {
      type:    Number,
      default: 0,
      min:     [0, 'Stock cannot be negative'],
    },

    // Only used when hasVariants = true
    variants: [variantSchema],

    // ── Ratings ───────────────────────────────────────────────────────────────
    // Recalculated automatically after each review
    avgRating: {
      type:    Number,
      default: 0,
      min:     0,
      max:     5,
    },

    numReviews: {
      type:    Number,
      default: 0,
    },

    // ── Status ────────────────────────────────────────────────────────────────
    // Appears in the featured section on the home page
    isFeatured: {
      type:    Boolean,
      default: false,
    },

    // false = hidden from catalog
    // Set to false automatically when stock reaches 0
    isActive: {
      type:    Boolean,
      default: true,
    },

    // Admin approval flow for marketplace
    // Only 'approved' products appear in the public catalog
    approvalStatus: {
      type:    String,
      enum:    ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    approvalNote: {
      type: String, // Admin's reason if rejected
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
    },

    reviewedAt: {
      type: Date,
    },

    // Alert when stock <= this value
    lowStockThreshold: {
      type:    Number,
      default: 5,
    },

    // For shipping calculation
    weight: { type: Number }, // in grams

    dimensions: {
      length: { type: Number }, // in cm
      width:  { type: Number },
      height: { type: Number },
    },

    // SEO overrides — falls back to name and shortDescription if empty
    meta: {
      title:       { type: String },
      description: { type: String },
    },

    // Analytics — incremented on each product page visit
    views: {
      type:    Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Text index for full-text search — weights prioritize name over description
productSchema.index(
  { name: 'text', description: 'text', tags: 'text' },
  { weights: { name: 10, tags: 5, description: 1 } }
);

productSchema.index({ slug: 1 });
productSchema.index({ seller: 1, isActive: 1 });
productSchema.index({ category: 1, isActive: 1, price: 1 });
productSchema.index({ avgRating: -1, isActive: 1 });
productSchema.index({ approvalStatus: 1, isActive: 1 });

// ── Virtual: totalStock ───────────────────────────────────────────────────────
// Calculates total stock on the fly — not stored in DB
// Simple product → root stock
// Product with variants → sum of all active variant stocks
productSchema.virtual('totalStock').get(function () {
  if (!this.hasVariants) return this.stock;
  return this.variants
    .filter((v) => v.isActive)
    .reduce((sum, v) => sum + v.stock, 0);
});

// ── Virtual: isLowStock ───────────────────────────────────────────────────────
productSchema.virtual('isLowStock').get(function () {
  return this.totalStock <= this.lowStockThreshold && this.totalStock > 0;
});

// ── Virtual: isOutOfStock ─────────────────────────────────────────────────────
productSchema.virtual('isOutOfStock').get(function () {
  return this.totalStock === 0;
});

// ── Pre-save hook: auto-generate slug ────────────────────────────────────────
productSchema.pre('save', async function (next) {
  if (!this.isModified('name')) return next();

  let slug = slugify(this.name, { lower: true, strict: true });

  // If slug already exists add a numeric suffix — "blue-shirt-2"
  const existing = await mongoose.model('Product').findOne({
    slug,
    _id: { $ne: this._id }, // exclude current document
  });

  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  this.slug = slug;
  next();
});

// ── Pre-save hook: auto deactivate when out of stock ─────────────────────────
productSchema.pre('save', function (next) {
  if (this.isModified('stock') || this.isModified('variants')) {
    if (this.totalStock === 0) this.isActive = false;
    if (this.totalStock > 0 && !this.isActive) this.isActive = true;
  }
  next();
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;