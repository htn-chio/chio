var mongoose = require('mongoose');

var reminderSchema = {
    conversation_id: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: [
            'scheduled',
            'finished'
        ]
    },
    reminder_date: Date,
    location: String,
    task: String
};

var Reminder = mongoose.model('Reminder', reminderSchema);

module.exports = Reminder;
