const Category = require('../models/Category');
const AppError = require('../utils/AppError');
const { sendSuccess } = require('../utils/apiResponse');
const { processAndUpload, deleteImage} = require('../services/image.service');

// GET /api/categories
// Return all active categories as a tree
const getCategories = async (req, res, next) => {
    try{
        // Get all root categories
        const categories = await Category.find({ isActive: true, parent: null })
        .populate({
            path: 'subcategories',
            match: { isActive: true }, // only active subcategories
            select: 'name slug image sortOrder',
        })
        .sort({ sortOrder: 1, name: 1})
        .select('name slug description image sortOrder');

        sendSuccess(res, { categories }, 'Categories retrieved');
    } catch (error) {
        next(error);
    }
};

// GET /api/categories/:slug
// Single category with its subcategories
const getCategory = async (req, res, next) => {
    try{
        const category = await Category.findOne({
            slug: req.params.slug,
            isActive: true,
        }).populate({
            path: 'subcategories',
            match: { isActive: true },
            select: 'name slug image',
        });

        if(!category) {
            return next(new AppError('Category not found', 404));
        }

        sendSuccess(res, { category }, 'Category retrieved');
    } catch (error) {
        next(error);
    }
};

// POST /api/categories --- ONLY ADMIN

const createCategory = async (req, res, next) => {
    try {
        const { name, description, parent, sortOrder } = req.body;

        // If parent is proved, verify it exists
        if(parent) {
            const parentCategory = await Category.findById(parent);
            if(!parentCategory) {
                return next(new AppError('Parent category not found', 404));
            }
        }

        const categoryData = { name, description, parent, sortOrder };

        // Process image if uploaded
        if (req.file) {
            categoryData.image = await processAndUpload(
                req.file.buffer,
                'categories',
                {width: 600, height: 600, quality: 85}
            );
        }

        const category = await Category.create(categoryData);

        sendSuccess(res, { category }, 'Category created', 201);    
    } catch (error) { 
        next(error);
    }   
};

// PATCH /api/categories/:id --- ONLY ADMIN
const updateCategory = async (req, res, next) => {
    try{
        const { name, description, parent, sortOrder, isActive } = req.body;

        const category = await Category.findById(req.params.id);
        if(!category) {
            return next(new AppError('Category not found', 404));
        }

        // Update fields if provided
        if(name) category.name = name;
        if(description) category.description = description;
        if(sortOrder !== undefined) category.sortOrder = sortOrder;
        if(isActive !== undefined) category.isActive = isActive;
        if(parent !== undefined) category.parent = parent;

        // replace image if a new one was uploaded
        if(req.file) {
            // Delete old image from Cloudinary
            if(category.image?.publicId) {
                await deleteImage(category.image.publicId);
            }
            category.image = await processAndUpload(
                req.file.buffer,
                'categories',
                {width: 600, height: 600, quality: 85}
            );
        }

        // .save() pre-save hook
        await category.save();
        
        sendSuccess(res, { category }, 'Category updated');
    } catch (error) {
        next(error);
    }
};

// DELETE /api/categories/:id --- ONLY ADMIN
// Only delete if no active products are linked to this category
const deleteCategory = async (req, res, next) => {
    try {
        const category = await Category.findById(req.params.id);
        if(!category) {
            return next(new AppError('Category not found', 404));
        }

        // check if any products use this category
        const Product = require('../models/Product');
        const productCount = await Product.countDocuments({
            category: req.params.id,
            isActive: true,
        });

        if(productCount > 0) {
            return next(new AppError(`Cannot delete category with ${productCount} active products. Reassign them first.`, 409));
        }

        // Delete image from Cloudinary
        if (category.image?.publicId) {
            await deleteImage(category.image.publicId);
        }
        await Category.findByIdAndDelete(req.params.id);

        sendSuccess(res, null, 'Category deleted');
    } catch (error) {
        next(error);
    }
};

module.exports = { getCategories, getCategory, createCategory, updateCategory, deleteCategory };
