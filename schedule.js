var _ = require('lodash');
var config = require('config');
var schedule = require('node-schedule');
var Reminder = require('./models/reminder.model');
var FB = require('fb');
module.exports = {
    init: init,
    scheduleReminder: scheduleReminder
};

function init() {
    Reminder.find({status: 'scheduled'}, function (err, reminders) {
        if (err) return console.log(err);
        _.forEach(reminders, function (reminder) {
            if (reminder.reminder_date < Date.now()) {
                sendUserAMessage(reminder);
            } else {
                scheduleReminder(reminder);
            }
        });
    });
}

function scheduleReminder(reminder) {
    console.log('SCHEDULING: ' + reminder.task + '/' + reminder.location);

    schedule.scheduleJob(reminder._id, reminder.reminder_date, function () {
        Reminder.findById(reminder._id, function (err, reminder) {
            console.log(reminder._id + " " + reminder.task + " reminder is being triggered");
            sendUserAMessage(reminder);
        });
    });
}

function sendUserAMessage(reminder) {
    var conversationURL = '/' + reminder.conversation_id + '/messages';
    FB.api(conversationURL, 'POST', {'message': 'REMINDER: ' + reminder.task}, callback);

    function callback() {
        var query = {
            _id: reminder._id
        };

        var update = {
            status: 'finished'
        };

        Reminder.findOneAndUpdate(query, update, function (err) {
            if (err) return console.error(err);
            console.log('message sent to ' + reminder.username);
        });

    }
}
