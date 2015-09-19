var _ = require('lodash');
var schedule = require('node-schedule');
var Reminder = require('./models/reminder.model');

module.exports = {
    init: init,
    scheduleReminder: scheduleReminder
};

function init() {
    Reminder.find({status: 'scheduled', reminder_date: {$gte: Date.now()}}, function (err, reminders) {
        if (err) return console.log(err);
        _.forEach(reminders, function (reminder) {
            scheduleReminder(reminder);
        });
    });
}

function scheduleReminder(reminder) {
    console.log(reminder.task + '/' reminder.location + ' being scheduled');
    schedule.scheduleJob(reminder._id, reminder.reminder_date, function () {
        Reminder.findById(reminder._id, function (err, reminder) {
            console.log(reminder._id + " " + reminder.name + " reminder is being triggered");

            //TODO: Send reminder message to user
            var query = {
                _id: reminder._id
            };

            var update = {
                status: 'finished'
            };

            Reminder.findOneAndUpdate(query, update, function (err) {
                if (err) return console.error(err);
            });
        });
    });
}
