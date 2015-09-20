var mongoose = require('mongoose');

var stateSchema = {
    conversation_id: {
        type: String,
        required: true
    },
    create_date: Date,
    meta_data: {},
    is_active: {
        type: Boolean,
        default: true
    },
    state_type: {
        type: String,
        enum: ['Yelp', 'Uber', 'Reminder']
    },
    outcome: {}
};

var State = mongoose.model('State', stateSchema);

module.exports = State;
