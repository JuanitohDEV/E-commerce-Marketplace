const Order = require('../models/Order');
const SubOrder = require('../models/SubOrder');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const SellerProfile = require('../models/SellerProfile');
const Coupon = require('../models/Coupon');
const AppError = require('../utils/AppError');
const { sendSuccess, sendPaginated} = require('../utils/apiResponse');
const paginate = require('../utils/paginate');
const stripe = require('../config/stripe');
const { v4: uuidv4 } = require('uuid');

// POST /api/orders/checkout

// Create the order and a stripe payment intent

const checkout = async (req, res, next) => {
        try{

            const { shippingAddress, couponCode } = req.body;

            if(!shippingAddress) {
                return next(new AppError('Shipping address is required', 400));
            }

            // Load cart with product data

            const cart = await Cart.findOne({ user: req.user._id})
            .populate('items.product', 'name price stock hasVariants variants isActive approvalStatus seller');

            if(!cart || cart.items.length === 0) {
                return next(new AppError('Cart is empty', 400));
            }

            // Validation items

            for (const item of cart.items) {
                const p = item.product;

                if(!p || !p.isActive || p.approvalStatus !== 'approved') {
                    return next(new AppError(`Product ${item.name} is not available`, 400));
                }

                const stock = item.sku
                    ? p.variants.find((v) => v.sku === item.sku)?.stock ?? 0
                    : p.stock;

                if (stock < item.quantity) {
                    return next(new AppError(`Not enough stock for ${item.name}. Available: ${stock}`, 400));
                }
            }

            // Calculate subtotal

            let subtotal = cart.subtotal;
            let discount = 0;
            let couponDoc = null;

            // Validate and apply coupon 

            if(couponCode) {
                couponDoc = await Coupon.findOne({ code: couponCode.toUpperCase() });

                if(!couponDoc) {
                    return next(new AppError('Coupon not found', 400));
                }

                const validation = couponDoc.isValid(req.user._id, subtotal);
                if(!validation.valid) {
                    return next(new AppError(validation.reason, 400));
                }

                discount = couponDoc.calculateDiscount(subtotal);
        }

        const total = Math.max(subtotal - discount, 0);

        // Idempotency Key

        const idempotencyKey = uuidv4();

        // Create Stripe Payment Intent

        const paymentIntent = await stripe.paymentIntents.create(
            {
                amount: Math.round(total * 100),
                currency: 'cop', // Colombian peso
                metadata: {
                    userId: req.user._id.toString(),
                    idempotencyKey,
                },
            },
            { idempotencyKey } // Stripe level idempotency
        );

        // Create Order in DB with status 'pending'

        const order = await Order.create({

            user: req.user._id,
            items: cart.items,
            subtotal,
            discount,
            total,
            coupon: couponDoc?._id,
            couponCode: couponDoc?.code,
            shippingAddress,
            paymentIntentId: paymentIntent.id,
            idempotencyKey,
            statusHistory: [{ status: 'pending', note: 'Order created'}],

        });

        sendSuccess(res, {
            orderId: order._id,
            orderNumber: order.orderNumber,
            clientSecret: paymentIntent.client_secret,
            total,
        }, 'Order created. Complete payment to confirm', 201);

} catch (error) {
    next(error);
    }
};

// GET /api/orders/my-orders
// Customer order history

const getMyOrders = async (req, res, next) => {
    try{

        const result = await paginate(Order, { user: req.user._id}, {
            page: req.query.page,
            limit: req.query.limit,
            sort: { createdAt: -1 },
        });

        sendPaginated(res, result.data, result.pagination, 'Orders retrieved');
    }
    catch (error) {
        next(error);
    }
};

// GET /api/order/:id
// Order detail

const getOrder = async (req, res, next) => {

    try{

        const order = await Order.findById(req.params.id)
        .populate('coupon', 'code type discountValue');

        if(!order) return next(new AppError('Order not found', 404));

        if(!req.user.isAdmin && order.user.toString() !== req.user._id.toString()) {
            return next(new AppError('You can only view your own orders', 403));
        }

        const subOrders = await SubOrder.find({ order: order._id })
        .populate('seller', 'name')
        .populate('items.product','name images');

        sendSuccess(res, { order, subOrders }, 'Order retrieved');
    } catch (error) {       
        next(error);
    }
};

// PATCH /api/order/:id/cancel

const cancelOrder = async (req, res, next) => {
    try{

        const order = await Order.findById(req.params.id);
        if(!order) return next(new AppError('Order not found', 404));

        if(order.user.toString() !== req.user._id.toString()) {
            return next(new AppError('You can only cancel your own orders', 403));
        }

        // Only pending orders can be cancelled
        if(order.status !== 'pending') {
            return next(new AppError('Only pending orders can be cancelled', 400));
        }

        // cancel payment intent in stripe
        if(order.paymentIntentId) {
            await stripe.paymentIntents.cancel(order.paymentIntentId);
        }

        order.status = 'cancelled';
        order.cancelledAt = new Date();
        order.statusHistory.push({ status: 'cancelled', note: 'Cancelled by customer'});
        await order.save();

        sendSuccess(res, { order }, ' Order cancelled');
    } catch (error) {
        next(error);
    }
};


// ---- Seller suborder controllers ----

// GET /api/orders/seller/suborders

const getMySubOrders = async (req, res, next) => {
    try{
        const { status } = req.query;
        const filter = { seller: req.user._id };
        if(status) filter.status = status;

        const result = await paginate(SubOrder, filter, {
            page: req.query.page,
            limit: req.query.limit,
            sort: { createdAt: -1 },
            populate: { path: 'order', select: 'orderNumber total shippingAddress' },
        });

        sendPaginated(res, result.data, result.pagination, 'SubOrders retrieved');
    } catch (error) {
        next(error);
    }
};


// PATCH /api/orders/suborders/:id/ship

const shipSubOrder = async (req, res, next) => {
    try{

        const { trackingNumber} = req.body;

        if(!trackingNumber) {
            return next(new AppError('Tracking number is required', 400));
        }

        const subOrder = await SubOrder.findById(req.params.id);
        if(!subOrder) return next(new AppError('SubOrder not found', 404));

        if(subOrder.seller.toString() !== req.user._id.toString()) {
            return next(new AppError('You can only manage your own suborders', 403));
        }

        if(subOrder.status !== 'processing') {
            return next(new AppError('Only processing suborders can be marked as shipped', 400));
        }

        subOrder.status = 'shipped';
        subOrder.trackingNumber = trackingNumber;
        subOrder.shippedAt = new Date();
        subOrder.statusHistory.push({ status: 'shipped', note: `Tracking: ${trackingNumber}`});
        await subOrder.save();

        //Notify customer via Socke.io
        const io = req.app.get('io');
        const order = await Order.findById(subOrder.order).select('user');
        io.to(order.user.toString()).emit('order:shipped', {
            subOrderId: subOrder._id,
            trackingNumber ,
        });

        sendSuccess(res, { subOrder }, 'SubOrder marked as shipped');
    } catch (error) {
        next(error);
    }
};

// PATCH /api/orders/suborders/:id/deliver

const deliverSubOrder = async (req, res, next) => {
    try{

        const subOrder = await SubOrder.findById(req.params.id);
        if(!subOrder) return next(new AppError('SubOrder not found', 404));

        const order = await Order.findById(subOrder.order).select('user chargeId');
        if(!order || order.user.toString() !== req.user._id.toString()) {
            return next(new AppError('You can only confirm delivery for your own orders', 403));
        }

        if(subOrder.status !== 'shipped') {
            return next(new AppError('Only shipped suborders can be marked as delivered', 400));
        }

        subOrder.status = 'delivered';
        subOrder.deliveredAt = new Date();
        subOrder.statusHistory.push({ status: 'delivered', note: 'Delivered to customer'});
        await subOrder.save();

        const sellerProfile = await SellerProfile.findOne({ user: subOrder.seller})
            .select('+stripeAccountId stripeOnboardingComplete');

        if (!sellerProfile || !sellerProfile.stripeOnboardingComplete || !sellerProfile.stripeAccountId) {
            console.error(`Cannot transfer to seller ${subOrder.seller}: onboarding incomplete (subOrder ${subOrder._id})`);
        } else if(!subOrder.stripeTransferId) {
            const transfer = await stripe.transfers.create(
                {
                    amount: Math.round(subOrder.sellerEarnings * 100),
                    currency: 'cop',
                    destination: sellerProfile.stripeAccountId,
                    source_transaction: order.chargeId,
                },
                { idempotencyKey: `transfer_${subOrder._id}` }
            );

            subOrder.stripeTransferId = transfer.id;
            await subOrder.save();
        }

        const allSubOrders = await SubOrder.find({ order: subOrder.order });
        const allDelivered = allSubOrders.every((s) => s.status === 'delivered');

        if(allDelivered) {
            await Order.findByIdAndUpdate(subOrder.order, {
                status: 'delivered',
                deliveredAt: new Date(),
                $push: { statusHistory: { status: 'delivered', note: 'All suborders delivered'}},
            });
        }

        sendSuccess(res, { subOrder }, 'SubOrder marked as delivered');
    } catch (error) {
        next(error);
    }
};


// ---- Admin controllers ----

// GET /api.orders - admin sees all orders

const getAllOrders = async (req, res, next) => {
    try{

        const { status } = req.query;
        const filter = {};
        if(status) filter.status = status;

        const result = await paginate(Order, filter, {
            page: req.query.page,
            limit: req.query.limit,
            sort: { createdAt: -1 },
            populate: { path: 'user', select: 'name email' },
        });

        sendPaginated(res, result.data, result.pagination, 'Orders retrieved');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    checkout,
    getMyOrders,
    getOrder,
    cancelOrder,
    getMySubOrders,
    shipSubOrder,
    deliverSubOrder,
    getAllOrders,
};