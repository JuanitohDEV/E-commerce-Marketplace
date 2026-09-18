const Return = require('../models/Return');
const SubOrder = require('../models/SubOrder');
const Order = require('../models/Order');
const Product = require('../models/Product');
const InventoryMovement = require('../models/InventoryMovement');
const AppError = require ('../utils/AppError');
const { sendSuccess, sendPaginated } = require('../utils/apiResponse');
const paginate = require('../utils/paginate');
const stripe = require('../config/stripe');

// POST /api/returns --------- customer only

const requestReturn = async (req, res, next) => {
    try{

        const { subOrderId, items, reason, note } = req.body;

        if(!subOrderId || !items || items.length === 0 || !reason){
            return next(new AppError('subOrderId, items and reason are required', 400));
        }

        const subOrder = await SubOrder.findById(subOrderId);
        if(!subOrder) return next(new AppError('SubOrder not found', 404));

        const order = await Order.findById(subOrder.order).select('user');
        if (!order || order.user.toString() !== req.user._id.toString()) {
            return next(new AppError('You can only request returns for your own orders', 403));
        }

        if(subOrder.status !== 'delivered') {
            return next(new AppError('Only delivered suborders can be returned', 400));
        }

        const existingReturn = await Return.findOne({
            subOrder: subOrder._id,
            status: { $in: ['requested', 'approved'] }
        });

        if (existingReturn) {
            return next(new AppError('There is already an active return for this suborder', 400));
        }

        const returnItems = [];
        for (const reqItem of items) {
            const purchasedItem = subOrder.items.find(
                (it) => it.product.toString() === reqItem.product && it.sku === (reqItem.sku || null)
            );

            if(!purchasedItem) {
                return next(new AppError('One of the items was not part of this suborder', 400));
            }

            if(reqItem.quantity > purchasedItem.quantity) {
                return next(new AppError(
                    `Cannot return more than the ${purchasedItem.quantity} purchased for ${purchasedItem.name}`, 400));
            }

            returnItems.push({
                product: purchasedItem.product,
                name: purchasedItem.name,
                sku: purchasedItem.sku,
                quantity: reqItem.quantity,
                price: purchasedItem.price,
            });
        }

        const returnDoc = await Return.create({
            subOrder: subOrder._id,
            order: subOrder.order,
            user: req.user._id,
            items: returnItems,
            reason,
            note,
            statusHistory: [{ status: 'requested', note: 'Return requested by customer' }],
        });

        subOrder.status = 'return_requested';
        subOrder.statusHistory.push({ status: 'return_requested', note: 'Customer requested a return' });
        await subOrder.save();

        sendSuccess(res, { return: returnDoc}, 'Return requested', 201);

    } catch (error) {
        next(error);
    }
};

// GET /api/returns/my-returns --------- customer 

const getMyReturns = async (req, res, next) => {
    try{

        const result = await paginate(Return, { user: req.user._id}, {
            page: req.query.page,
            limit: req.query.limit,
            sort: { createdAt: -1 },
        });

        sendPaginated(res, result.data, result.pagination, 'Returns retrieved');

    } catch (error) {
        next(error);
    }
};

// GET /api/returns/:id --------- owner or admin

const getReturn = async (req, res, next) => {
    try{

        const returnDoc = await Return.findById(req.params.id);
        if(!returnDoc) return next(new AppError('Return not found', 404));

        if(!req.user.isAdmin && returnDoc.user.toString() !== req.user._id.toString()) {
            return next(new AppError('You can only view your own returns', 403));
        }

        sendSuccess(res, { return: returnDoc}, 'Return retrieved');

    } catch (error) {
        next(error);
    }
};

// -------------------- Admin controllers --------------------

// GET /api/returns --------- admin only

const getAllReturns = async (req, res, next) => {
    try{

        const { status } = req.query;
        const filter = {};
        if (status) filter.status = status;

        const result = await paginate(Return, filter, {
            page: req.query.page,
            limit: req.query.limit,
            sort: { createdAt: -1 },
            populate: { path: 'user', select: 'name email' },
        });

        sendPaginated(res, result.data, result.pagination, 'Returns retrieved');

    } catch (error) {
        next(error);
    }
};

// PATCH /api/returns/:id/approve --------- admin only

const approveReturn = async (req, res, next) => {
    try{

        const returnDoc = await Return.findById(req.params.id);
        if(!returnDoc) return next(new AppError('Return not found', 404));

        if(returnDoc.status !== 'requested') {
            return next(new AppError('Only returns in requested status can be approved', 400));
        }

        const subOrder = await SubOrder.findById(returnDoc.subOrder);
        if(!subOrder) return next(new AppError('SubOrder not found', 404));

        const order = await Order.findById(returnDoc.order).select('chargeId');
        if (!order || !order.chargeId) {
            return next(new AppError('Cannot refund: order has no associated charge', 400));
        }

        const refundAmount = returnDoc.items.reduce((sum, it) => sum + it.price * it.quantity, 0);

        // Refund the customer against the original charge
        const refund = await stripe.refunds.create({
            charge: order.chargeId,
            amount: Math.round(refundAmount * 100),
        });

        // If the seller was already paid out for this suborder, claw back
        let reversalId = null;
        if (subOrder.stripeTransferId) {
            const sellerPortion = refundAmount * (1 - subOrder.commissionRate / 100);
            const reversal = await stripe.transfers.createReversal(subOrder.stripeTransferId,{
                amount: Math.round(sellerPortion * 100),
            });
            reversalId = reversal.id;
        }

        // Restock the returned items
        for (const item of returnDoc.items) {
            const filter = item.sku
                ? {_id: item.product, 'variants.sku': item.sku}
                : {_id: item.product};

            const update = item.sku
                ? { $inc: { 'variants.$.stock': item.quantity } }
                : { $inc: { 'stock': item.quantity } };

            const updateProduct = await Product.findOneAndUpdate(filter, update, { new: true });

            if(updateProduct) {
                const stockAfter = item.sku
                    ? updateProduct.variants.find((v) => v.sku === item.sku).stock
                    : updateProduct.stock;
                
                await InventoryMovement.create({
                    product: item.product,
                    sku: item.sku || null,
                    type: 'return',
                    quantity: item.quantity,
                    stockBefore: stockAfter - item.quantity,
                    stockAfter,
                    reference: returnDoc._id,
                    referenceModel: 'Return',
                });

                if(!updateProduct.isActive) {
                    await Product.findByIdAndUpdate(item.product, { isActive: true });
                }
            }
        }

        returnDoc.status = 'refunded';
        returnDoc.refundAmount = refundAmount;
        returnDoc.stripeRefundId = refund.id;
        returnDoc.stripeTransferReversalId = reversalId;
        returnDoc.reviewedBy = req.user._id;
        returnDoc.reviewedAt = new Date();
        returnDoc.statusHistory.push({ status: 'refunded', note: 'Return approved and refunded' });
        await returnDoc.save();

        subOrder.status = 'returned';
        subOrder.statusHistory.push({ status: 'returned', note: 'Return processed and refunded' });
        await subOrder.save();

        sendSuccess(res, { return: returnDoc}, 'Return approved and refunded');

    } catch (error) {
        next(error);
    }
};

// PATCH /api/returns/:id/reject --------- admin only
const rejectReturn = async (req, res, next) => {
    try{

        const { rejectionReason } = req.body;
        if (!rejectionReason) return next(new AppError('Rejection reason is required', 400));

        const returnDoc = await Return.findById(req.params.id);
        if(!returnDoc) return next(new AppError('Return not found', 404));

        if(returnDoc.status !== 'requested') {
            return next(new AppError('Only requested returns can be rejected', 400));
        }

        returnDoc.status = 'rejected';
        returnDoc.rejectionReason = rejectionReason;
        returnDoc.reviewedBy = req.user._id;
        returnDoc.reviewedAt = new Date();
        returnDoc.statusHistory.push({ status: 'rejected', note: rejectionReason});
        await returnDoc.save();

        await SubOrder.findByIdAndUpdate(returnDoc.subOrder, {
            status: 'delivered',
            $push: { statusHistory: { status: 'delivered', note: 'Return request rejected' } }
        })

        sendSuccess(res, { return: returnDoc}, 'Return rejected');

    } catch (error) {
        next(error);
    }
};


module.exports = {
    requestReturn,
    getMyReturns,
    getReturn,
    getAllReturns,
    approveReturn,
    rejectReturn
};