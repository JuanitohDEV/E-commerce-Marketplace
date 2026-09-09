const Cart    = require('../models/Cart');
const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const { sendSuccess } = require('../utils/apiResponse');

// GET /api/cart
// Returns the current user's cart with populated product data
const getCart = async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id })
      .populate('items.product', 'name images price stock isActive approvalStatus');

    // If cart doesn't exist yet, return an empty one
    if (!cart) {
      return sendSuccess(res, {
        items:      [],
        subtotal:   0,
        totalItems: 0,
      }, 'Cart is empty');
    }

    // Remove items whose products are no longer available
    // Filters out deleted, deactivated or unapproved products
    const validItems = cart.items.filter(
      (item) =>
        item.product &&
        item.product.isActive &&
        item.product.approvalStatus === 'approved'
    );

    if (validItems.length !== cart.items.length) {
      cart.items = validItems;
      await cart.save();
    }

    sendSuccess(res, {
      items:      cart.items,
      subtotal:   cart.subtotal,
      totalItems: cart.totalItems,
      couponCode: cart.couponCode,
    }, 'Cart retrieved');
  } catch (error) {
    next(error);
  }
};

// POST /api/cart/add
const addToCart = async (req, res, next) => {
  try {
    const { productId, quantity = 1, sku } = req.body;

    if (!productId) {
      return next(new AppError('Product ID is required', 400));
    }

    // Validate product exists and is available
    const product = await Product.findById(productId)
      .populate('sellerProfile', 'commissionRate');

    if (!product || !product.isActive || product.approvalStatus !== 'approved') {
      return next(new AppError('Product not available', 404));
    }

    // Get price and stock — depends on whether product has variants
    let price, stock;

    if (product.hasVariants) {
      if (!sku) return next(new AppError('SKU is required for variant products', 400));

      const variant = product.variants.find((v) => v.sku === sku && v.isActive);
      if (!variant) return next(new AppError('Variant not found or unavailable', 404));

      price = variant.price;
      stock = variant.stock;
    } else {
      price = product.price;
      stock = product.stock;
    }

    if (stock < quantity) {
      return next(new AppError(`Only ${stock} units available`, 400));
    }

    // Find or create cart
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    // Check if this item (same product + same sku) already exists in cart
    const existingIndex = cart.items.findIndex(
      (item) =>
        item.product.toString() === productId &&
        item.sku === (sku || null)
    );

    if (existingIndex > -1) {
      // Item exists — update quantity
      const newQuantity = cart.items[existingIndex].quantity + quantity;

      if (newQuantity > stock) {
        return next(new AppError(`Only ${stock} units available`, 400));
      }

      cart.items[existingIndex].quantity = newQuantity;
    } else {
      // New item — add to cart with snapshots
      cart.items.push({
        product:    product._id,
        seller:     product.seller,
        sku:        sku || null,
        attributes: sku
          ? product.variants.find((v) => v.sku === sku)?.attributes
          : undefined,
        quantity,
        price,
        name:  product.name,
        image: product.images[0]?.url || null,
      });
    }

    await cart.save();

    sendSuccess(res, {
      items:      cart.items,
      subtotal:   cart.subtotal,
      totalItems: cart.totalItems,
    }, 'Product added to cart');
  } catch (error) {
    next(error);
  }
};

// PATCH /api/cart/update
// Update quantity of a specific cart item
const updateCartItem = async (req, res, next) => {
  try {
    const { itemId, quantity } = req.body;

    if (!itemId || quantity === undefined) {
      return next(new AppError('Item ID and quantity are required', 400));
    }

    if (quantity < 1) {
      return next(new AppError('Quantity must be at least 1. Use remove to delete an item', 400));
    }

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return next(new AppError('Cart not found', 404));

    const item = cart.items.id(itemId);
    if (!item) return next(new AppError('Item not found in cart', 404));

    // Verify stock is still available
    const product = await Product.findById(item.product);
    const stock = item.sku
      ? product.variants.find((v) => v.sku === item.sku)?.stock ?? 0
      : product.stock;

    if (quantity > stock) {
      return next(new AppError(`Only ${stock} units available`, 400));
    }

    item.quantity = quantity;
    await cart.save();

    sendSuccess(res, {
      items:      cart.items,
      subtotal:   cart.subtotal,
      totalItems: cart.totalItems,
    }, 'Cart updated');
  } catch (error) {
    next(error);
  }
};

// DELETE /api/cart/remove/:itemId
const removeFromCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return next(new AppError('Cart not found', 404));

    const itemIndex = cart.items.findIndex(
      (item) => item._id.toString() === req.params.itemId
    );

    if (itemIndex === -1) return next(new AppError('Item not found in cart', 404));

    cart.items.splice(itemIndex, 1);
    await cart.save();

    sendSuccess(res, {
      items:      cart.items,
      subtotal:   cart.subtotal,
      totalItems: cart.totalItems,
    }, 'Item removed from cart');
  } catch (error) {
    next(error);
  }
};

// DELETE /api/cart/clear
const clearCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return sendSuccess(res, null, 'Cart is already empty');

    cart.items     = [];
    cart.couponCode = null;
    await cart.save();

    sendSuccess(res, null, 'Cart cleared');
  } catch (error) {
    next(error);
  }
};

module.exports = { getCart, addToCart, updateCartItem, removeFromCart, clearCart };