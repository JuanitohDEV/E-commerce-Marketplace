const Coupon = require('../models/Coupon');
const Cart = require('../models/Cart');
const AppError = require('../utils/AppError');
const { sendSuccess, sendPaginated } = require('../utils/apiResponse');
const paginate = require('../utils/paginate');


// ------------------ Admin Controller ------------------

// POST /api/coupons ---- ONLY ADMIN

const createCoupon = async (req, res, next) => {
    try{

        const {
            code, description, type, discountValue, maxDiscount,
            minOrderTotal, maxUses, maxUsesPerUser, startsAt, expiresAt,
        } = req.body;

        if (!code || !type || discountValue === undefined) {
            return next(new AppError('code, type and discountValue are required', 400));
        }
        
        const coupon = await Coupon.create({
            code, description, type, discountValue, maxDiscount,
            minOrderTotal, maxUses, maxUsesPerUser, startsAt, expiresAt,
            createdBy: req.user._id,
        });

        sendSuccess(res, { coupon }, 'Coupon created', 201);

    } catch (error) {
        next(error);
    }
};

// GET /api/coupons ---- ONLY ADMIN

const getCoupons = async (req, res, next) => {
    
    try{
        const { isActive } = req.query;
        const filter = {};
        if (isActive !== undefined) filter.isActive = isActive === 'true';

        const result = await paginate(Coupon, filter, {
            page: req.query.page,
            limit: req.query.limit,
            sort: { createdAt: -1 },
        });

        sendPaginated(res, result.data, result.pagination, 'Coupons retrieved');

    } catch (error) {
        next(error);
    }
};

// GET /api/coupons/:id ---- ONLY ADMIN

const getCoupon = async (req, res, next) => {

    try{

        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) return next(new AppError('Coupon not found', 404));

        sendSuccess(res, { coupon }, 'Coupon retrieved');
    } catch (error) {
        next(error);
    }
};

// PATCH /api/coupons/:id ---- ONLY ADMIN

const updateCoupon = async (req, res, next) => {

    try{

        const {
            description, discountValue, maxDiscount, minOrderTotal,
            maxUses, maxUsesPerUser, startsAt, expiresAt, isActive,
        } = req.body;

        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) return next(new AppError('Coupon not found', 404));

        if (description !== undefined) coupon.description = description;
        if (discountValue !== undefined) coupon.discountValue = discountValue;
        if (maxDiscount !== undefined) coupon.maxDiscount = maxDiscount;
        if (minOrderTotal !== undefined) coupon.minOrderTotal = minOrderTotal;
        if (maxUses !== undefined) coupon.maxUses = maxUses;
        if (maxUsesPerUser !== undefined) coupon.maxUsesPerUser = maxUsesPerUser;
        if (startsAt !== undefined) coupon.startsAt = startsAt;
        if (expiresAt !== undefined) coupon.expiresAt = expiresAt;
        if (isActive !== undefined) coupon.isActive = isActive;

        await coupon.save();

        sendSuccess(res, { coupon }, 'Coupon updated');

    } catch (error) {
        next(error);
    }
};

// PATCH /api/coupons/:id/deactivate ---- ONLY ADMIN

const deactivateCoupon = async (req, res, next) => {

    try{

        const coupon = await Coupon.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!coupon) return next(new AppError('Coupon not found', 404));

        sendSuccess(res, { coupon }, 'Coupon deactivated');

    } catch (error) {
        next(error);
    }
};

// ------------------ Customer Controller ------------------

// GET /api/coupons/validate/:code
const validateCoupon = async (req, res, next) => {

    try{

        const coupon = await Coupon.findOne({ code: req.params.code.toUpperCase() });
        if (!coupon) return next(new AppError('Coupon not found', 404));

        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart || cart.items.length === 0) {
            return next(new AppError('Cart is empty', 400));
        }

        const subtotal = cart.subtotal;
        const validation = coupon.isValid(req.user._id, subtotal);

        if(!validation.valid){
            return next(new AppError(validation.reason, 400));
        }
        
        const discount = coupon.calculateDiscount(subtotal);

        sendSuccess(res, {
            subtotal,
            discount,
            total: subtotal - discount,
        }, 'Coupon is valid');

    } catch (error) {
    next(error);
    }
};

module.exports = {
    createCoupon,
    getCoupons,
    getCoupon,
    updateCoupon,
    deactivateCoupon,
    validateCoupon,
};
