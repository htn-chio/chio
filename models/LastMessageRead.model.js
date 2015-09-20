var mongoose = require('mongoose');

var lastMessageReadSchema = {
    conversation_id: {
        type: String,
        required: true
    },
    message_id: {
        type: String,
        required: true
    }
};

var LastMessageRead = mongoose.model('LastMessageRead', lastMessageReadSchema);

module.exports = LastMessageRead;
