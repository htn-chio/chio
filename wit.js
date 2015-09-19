var _ = require('lodash');
var async = require('async');
var wit = require('node-wit');


var ACCESS_TOKEN = '73NJLBMT4DZ6E7Q4OEGALQASWS7V2Y7C'
var FUNC_BY_INTENT = {
    Reminder: parseReminderResponse,
    restaurantSearch: parseYelpResponse,
}

module.exports = {
    parseText: parseText
}

function parseText(text, callback) {
    async.waterfall([
        getWitResponse,
        parseWitResponse
    ], callback);

    function getWitResponse(next) {
        wit.captureTextIntent(ACCESS_TOKEN, text, function (err, res) {
            if (err) next(err);
            next(null, res);
        });
    }

    function parseWitResponse(res, next) {
        var outcome = _.max(res.outcomes, 'confidence');
        next(null, FUNC_BY_INTENT[outcome.intent](outcome));
    }
}

function parseReminderResponse(res){
    return {
        api: 'Reminder',
        data: {
            locations: _.map(res.entities.location, getValueFromEntity),
            reminders: _.map(res.entities.reminder, getValueFromEntity),
            datetimes: _.map(res.entities.datetime, getValueFromEntity),
        }
    }
}


function parseYelpResponse(res){
    return {
        api: 'Yelp',
        data: {
            locations: _.map(res.entities.location, getValueFromEntity),
            search_queries: _.map(res.entities.search_query, getValueFromEntity),
        }
    }
}

function getIntentFromOutcome(outcome){
    return outcome.intent;
}

function getValueFromEntity(entity){
    return entity.value
}
