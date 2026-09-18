const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    chatRoom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ChatRoom',
        required: true,
    },
    
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    text: {
        type: String,
        trim: true,
        required: true,
        maxlength: 2000,
    },

    readAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
});

chatMessageSchema.index({ chatRoom: 1, createdAt: 1 });


// Keep parent room's in sync automatically

chatMessageSchema.post('save', async function() {

    await mongoose.model('ChatRoom').findByIdAndUpdate(this.chatRoom, {
        lastMessage: this.text,
        lastMessageAt: this.createdAt,
    });
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;