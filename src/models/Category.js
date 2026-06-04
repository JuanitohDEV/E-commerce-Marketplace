const mongoose = require('mongoose');
const slugify = require('slugify');

const categorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Category name is required'],
            trim: true,
            unique: true,
            maxlength: [50, 'Category name cannot exceed 50 characters'],
        },

        // Auto-generated from name - used in URLs: /category/elextronics

        slug: {
            type: String,
            unique: true,
        },

        description: {
            type: String,
            maxlength: [200, 'Description cannot exceed 200 characters'],
        },

        image: {
            url: {type:String},
            publicId: {type:String}, // Cloudinary ID to delete the image
        },

        parent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            default: null,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        sortOrder: {
            type: Number,
            default: 0
        },
    },
    {
        timestamps: true,
        toJSON: {virtuals: true},
        toObject: {virtuals: true},
    }
);

// ----- Index -------------
categorySchema.index({ slug: 1 });
categorySchema.index({ parent: 1, isActive: 1});

// --------- Virtual: Subcategories ---------
// Populated on demand — not stored in DB

categorySchema.virtual('subcategories', {
    ref: 'Category',
    localField: '_id',
    foreignField: 'parent',
});

// --------- Pre-save hook -> auto-generate slug--------------

categorySchema.pre('save', function (next) {
    if (this.isModified('name')) {
        this.slug = slugify(this.name, {
            lower: true, // lowercase
            strict: true, // remove special characters
        });
    }
    next();
});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;