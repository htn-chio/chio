var _ = require('lodash');
var async = require('async');
var wit = require('node-wit');


var ACCESS_TOKEN = '73NJLBMT4DZ6E7Q4OEGALQASWS7V2Y7C';
var FUNC_BY_INTENT = {
    date: parseDateResponse,
    eventSearch: parseEventResponse,
    greeting: parseGreetingResponse,
    insult: parseInsultResponse,
    location: parseLocationResponse,
    Reminder: parseReminderResponse,
    restaurantSearch: parseYelpResponse,
    ride: parseUberResponse,
    viewMore: parseViewMoreResponse,
    search: parseSearchResponse
};

module.exports = {
    parseText: parseText
};

function parseText(text, callback) {
    async.waterfall([
        getWitResponse,
        parseWitResponse
    ], callback);

    function getWitResponse(waterfallNext) {
        wit.captureTextIntent(ACCESS_TOKEN, text, function (err, res) {
            if (err) waterfallNext(err);
            waterfallNext(null, res);
        });
    }

    function parseWitResponse(res, waterfallNext) {
        var outcome = _.max(res.outcomes, 'confidence');

        if (outcome.confidence < 0.7){
            return waterfallNext('Not enough confidence');
        }

        if(!FUNC_BY_INTENT.hasOwnProperty(outcome.intent)){
            return waterfallNext('Intent does not exist: ' + outcome.intent);
        }

        return waterfallNext(FUNC_BY_INTENT[outcome.intent](outcome));
    }
}

function parseDateResponse(outcome) {
    return {
        api: 'Date',
        data: {
            date: _.first(_.map(outcome.entities.datetime, getValueFromEntity))
        }
    }
}

function parseGreetingResponse(outcome){
    return {
        api: 'Greeting',
        data: {
            contacts: _.map(outcome.entities.contact, getValueFromEntity),
        }
    }
}


function parseEventResponse(outcome){
    return {
        api: 'Event',
        data: {
            locations: _.map(outcome.entities.location, getValueFromEntity),
            search_queries: _.map(outcome.entities.search_query, getValueFromEntity),
            datetimes: _.map(outcome.entities.datetime, getValueFromEntity)
        }
    }
}


function parseInsultResponse(outcome){
    return {
        api: 'Insult',
        data: {
            contacts: _.map(outcome.entities.contact, getValueFromEntity)
        }
    }
}

function parseLocationResponse(outcome) {
    return {
        api: 'Location',
        data: {
            location: _.first(outcome.entities.location, getValueFromEntity)
        }
    }
}

function parseSearchResponse(outcome){
    return {
        api: 'Search',
        data: {
            search_queries: _.map(outcome.entities.search_query, getValueFromEntity)
        }
    }
}


function parseReminderResponse(outcome){
    return {
        api: 'Reminder',
        data: {
            locations: _.map(outcome.entities.location, getValueFromEntity),
            reminders: _.map(outcome.entities.reminder, getValueFromEntity),
            datetimes: _.map(outcome.entities.datetime, getValueFromEntity),
        }
    }
}


function parseYelpResponse(outcome){
    return {
        api: 'Yelp',
        data: {
            locations: _.map(outcome.entities.location, getValueFromEntity),
            search_queries: _.map(outcome.entities.search_query, getValueFromEntity),
            user_locations: _.map(outcome.entities.user_location, getValueFromEntity)
        }
    }
}

function parseUberResponse(outcome){
    return {
        api: 'Uber',
        data: {
            start_location: _.map(outcome.entities.start, getValueFromEntity),
            end_location: _.map(outcome.entities.end, getValueFromEntity),
            contacts: _.map(outcome.entities.contact, getValueFromEntity),
        }
    }
}

function parseViewMoreResponse(outcome) {
    return {
        api: 'ViewMore',
        data: {
            number: _.first(_.map(outcome.entities.number, getValueFromEntity)),
        }
    }
}

function getIntentFromOutcome(outcome){
    return outcome.intent;
}

function getValueFromEntity(entity){
    return entity.value
}
