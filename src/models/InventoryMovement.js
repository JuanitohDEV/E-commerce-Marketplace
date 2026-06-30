const mongoose = require('mongoose');

const inventoryMovementSchema = new mongoose.Schema(
   {
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },

    sku: {
      type: String,
      default: null,   
    },

    type: { 
      type: String,
      // sale -> Confirmed Stripe payment
      // restock -> admin or seller adds stock manually
      // adjustment -> manual correction  after physical count
      // return -> approved return restore stock
      // reservation -> stock reserved
      // reservation_released -> reservation expire without payment
      enum: ['sale', 'restock', 'adjustment', 'return', 'reservation', 'reservation_released'],
      required: true,
    },

    quantity:{ // positive -> stock in / negative -> stock out
      type: Number,
      required: true,
    },

    stockBefore:{
      type: Number,
      required: true,
    },

    stockAfter:{
      type: Number,
      required: true,
    },

    //reference to the order
    reference: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'referenceModel', 
    },

    referenceModel: {
      type: String,
      enum: ['Order', 'Return', 'ManualAdjustment'],
    },

    note: { //Required for manual Adjustment
      type: String
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
   },

   {
      timestamps: { createdAt: true, updatedAt: false},
   }
);

// ------------------------------------ Index --------------------------------------------

inventoryMovementSchema.index ({ product: 1, createdAt: -1 });
inventoryMovementSchema.index ({ type: 1, createdAt: -1 });
inventoryMovementSchema.index ({ createdBy: 1});

const InventoryMovement = mongoose.model('InventoryMovement', inventoryMovementSchema);

module.exports =  InventoryMovement;