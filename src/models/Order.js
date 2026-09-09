const mongoose = require('mongoose');

const addressSnapshotSchema = new mongoose.Schema({
  street:  { type: String },
  city:    { type: String },
  state:   { type: String },
  zip:     { type: String },
  country: { type: String },
  name:    { type: String },
  phone:   { type: String },
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  note:   { type: String },
  date:   { type: Date, default: Date.now },
}, { _id: false });

// Item snapshot — mirrors CartItemSchema so checkout can save cart.items as-is
const orderItemSchema = new mongoose.Schema({
  product:    { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  seller:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sku:        { type: String, default: null },
  attributes: { type: Map, of: String },
  quantity:   { type: Number, required: true },
  price:      { type: Number, required: true },
  name:       { type: String, required: true },
  image:      { type: String },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  user: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },
  status: {
    type:    String,
    enum:    ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'pending',
  },
  statusHistory: [statusHistorySchema],
  items: {
    type: [orderItemSchema],
    required: true,
  },
  subtotal:     { type: Number, required: true },
  discount:     { type: Number, default: 0 },
  total:        { type: Number, required: true },
  coupon:       { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
  couponCode:   { type: String },
  shippingAddress: addressSnapshotSchema,
  paymentIntentId: { type: String, unique: true, sparse: true },
  chargeId: { type: String },
  idempotencyKey:  { type: String, unique: true, sparse: true },
  paidAt:      { type: Date },
  cancelledAt: { type: Date },
  deliveredAt: { type: Date },
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentIntentId: 1 });

orderSchema.pre('save', async function (next) {
  if (this.orderNumber) return next();
  const count = await mongoose.model('Order').countDocuments();
  const year  = new Date().getFullYear();
  this.orderNumber = `ORD-${year}-${String(count + 1).padStart(5, '0')}`;
  next();
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;