const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
    buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
    },

    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
    },

    lastMessage: { type: String },

    lastMessageAt: { type: Date },

}, {
    timestamps: true,
});

chatRoomSchema.index({ buyer: 1, seller: 1}, { unique: true });
chatRoomSchema.index({ buyer: 1, lastMessageAt: -1 });
chatRoomSchema.index({ seller: 1, lastMessageAt: -1 });

const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);

module.exports = ChatRoom;