const stripe = require('../config/stripe');
const Order = require('../models/Order');
const SubOrder = require('../models/SubOrder');
const Product = require('../models/Product');
const SellerProfile = require('../models/SellerProfile');
const InventoryMovement = require('../models/InventoryMovement');
const Coupon = require('../models/Coupon');
const Cart = require('../models/Cart');
const User = require('../models/User');
const { sendOrderConfirmationEmail } = require('../services/email.service');

// POST /api/webhook/stripe

const handleStripeWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try{
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'payment_intent.succeeded':
                await handlePaymentSucceeded(event.data.object);
                break;
            case 'payment_intent.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;
            default:
                console.log(`Unhandled Stripe event type ${event.type}`);
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Error processing webhook event:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// -------------------------------- payment_intent.succeeded --------------------------------

const handlePaymentSucceeded = async (paymentIntent) => {
    const order = await Order.findOne({ paymentIntentId: paymentIntent.id});

    // Idempontency
    // If we already processed this order, do nothing
    if(!order || order.status !== 'pending') return;

        // Decrement stock for every item
        for (const item of order.items) {
            const filter = item.sku
            ? { _id: item.product, variants: { $elemMatch: { sku: item.sku, stock: { $gte: item.quantity } } } }
            : { _id: item.product, stock: { $gte: item.quantity } };

            const update = item.sku
            ? { $inc: { 'variants.$.stock': -item.quantity } }
            : { $inc: { stock: -item.quantity } };

            const updateProduct = await Product.findOneAndUpdate(filter, update, { new: true });

            if(!updateProduct) {
                // Payment already succeded but stock ran out in the maintime
                // out of scope for now
                // workflow
                console.error(`Stock shortage for product ${item.product} on order ${order._id}`);
                continue;
            }

            const stockAfter = item.sku
            ? updateProduct.variants.find((v) => v.sku === item.sku).stock
            : updateProduct.stock;

            await InventoryMovement.create({
                product: item.product,
                sku: item.sku || null,
                type: 'sale',
                quantity: -item.quantity,
                stockBefore: stockAfter + item.quantity,
                stockAfter,
                reference: order._id,
                referenceModel: 'Order',
            });
        }

        // Split items by seller and create one suborder per seller

        const itemsBySeller = {};
        for (const item of order.items) {
            const sellerId = item.seller.toString();
            if (!itemsBySeller[sellerId]) itemsBySeller[sellerId] = [];
            itemsBySeller[sellerId].push(item);
        }

        for (const [sellerId, items] of Object.entries(itemsBySeller)) {
            const sellerProfile = await SellerProfile.findOne({ user: sellerId }).select('commissionRate');
            const commissionRate = sellerProfile ? sellerProfile.commissionRate : 10; // Platform default fallback

            const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
            const commission = Math.round(subtotal * commissionRate) / 100;
            const sellerEarnings = subtotal - commission;

            await SubOrder.create({
                order: order._id,
                seller: sellerId,
                items: items.map((it) => ({
                    product: it.product,
                    name: it.name,
                    image: it.image,
                    price: it.price,
                    quantity: it.quantity,
                    sku: it.sku,
                    attributes: it.attributes,
                })),
                subtotal,
                commission,
                sellerEarnings,
                commissionRate,
                status: 'paid',
                statusHistory: [{ status: 'paid', note: 'Payment confirmed'}],
            });
        }

        // Mark the order as paid
        order.status = 'paid';
        order.paidAt = new Date();
        order.statusHistory.push({ status: 'paid', note: 'Payment confirmed via Stripe' });
        await order.save();

        // Register coupon usage 
        if (order.coupon) {
            const coupon = await Coupon.findById(order.coupon);
            if (coupon) {
                coupon.currentUses += 1;
                const userUsage = coupon.usedBy.find((u) => u.user.toString() === order.user.toString());
                if(userUsage) {
                    userUsage.count += 1;
                } else {
                    coupon.usedBy.push({ user: order.user, count: 1 });
                }
                await coupon.save();
            }
        }

        // Clear the cart 
        await Cart.findOneAndUpdate(
            { user: order.user },
            { $set: { items: [] }, $unset: { couponCode: '' } }
        );

        // Send order confirmation email
        const user = await User.findById(order.user);
        if (user) {
            await sendOrderConfirmationEmail(order, user);
        }

}; 


// -------------------------------- payment_intent.payment_failed --------------------------------

const handlePaymentFailed = async (paymentIntent) => {
    const order = await Order.findOne({ paymentIntentId: paymentIntent.id });
    if (!order || order.status !== 'pending') return;

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.statusHistory.push({ status: 'cancelled', note: 'Payment failed' });
    await order.save();
};

module.exports = {
    handleStripeWebhook,
};

