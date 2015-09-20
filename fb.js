var async = require('async');
var config = require('config');
var _ = require('lodash');
var FB = require('fb');
var wit = require('./wit');
var eventbrite = require('./eventbrite');
var LastMessageRead = require('./models/LastMessageRead.model.js');
var geocode = require('./geocode.js');
var moment = require('moment');
var Reminder = require('./models/reminder.model.js');
var State = require('./models/state.model.js');
var scheduler = require('./schedule');
var sleep = require('sleep');
var request = require('request');
var yelp = require('yelp').createClient({
    consumer_key: "XZYHgCOEsUws1-HGNAKG6w",
    consumer_secret: "OorilNhUdoeScwdbgj0xsPF4XgQ",
    token: "4v5gD9lBIHIzYRbt7i8rj5I2CE-bB-uE",
    token_secret: "k44cj6mfS_3VChUm_GUMfbghtK0"
});

var access_token = config.fb.access_token;
var CHIO_BOT_ID = config.fb.chio_bot_id;

FB.setAccessToken(access_token);

var fbController = {
    checkFacebookMessages: checkFacebookMessages,
    sendUserAMessage: sendUserAMessage
};

module.exports = fbController;


function checkFacebookMessages() {
    var chioBotConversationURL = '/722653077866736/conversations';

    FB.api(chioBotConversationURL, parseConversations);

    function parseConversations(response) {
        if (response && !response.error) {
            var conversations = response.data;

            _.forEach(conversations, function (conversation) {
                var lastMessage = _.first(_.get(conversation, 'messages.data'));
                var lastSenderId = _.get(lastMessage, 'from.id');
                if (lastSenderId !== CHIO_BOT_ID) {
                    LastMessageRead.findOne({
                        conversation_id: conversation.id,
                    }, function (error, state) {
                        if (state) {
                            if (state.message_id !== lastMessage.id) {
                                console.log('Read a new message');
                                wit.parseText(lastMessage.message, function (result) {
                                    var splitMessage = lastMessage.message.split(' ');
                                    if (splitMessage[0] === 'TEST') {
                                        return processResult(result, conversation, splitMessage[1]);
                                    }
                                    processResult(result, conversation)
                                });
                                state.message_id = lastMessage.id
                            } else {
                                console.log('Read an old message');
                            }
                        } else {
                            state = LastMessageRead({
                                conversation_id: conversation.id,
                                message_id: lastMessage.id
                            });

                        }
                        state.save();
                        return state;

                    });
                }
            });
        }
    }

    function processResult(result, conversation, testIntent) {
        var conversationId = conversation.id;
        var lastMessage = _.first(_.get(conversation, 'messages.data'));
        var username = _.get(lastMessage, 'from.name');
        var start_latlng, end_latlng, type, startLocation, endLocation;
        var FUNCTIONS_BY_INTENT = {
            "Date": processDate,
            "Yelp": processYelp,
            "Reminder": processReminder,
            "Uber": processUber,
            "Greeting": processGreeting,
            "Event": processEventSearch,
            "Insult": processInsult,
            "Search": searchGoogle,
            "ViewMore": processViewMore,
            "Location": processLocation
        };

        if (testIntent && FUNCTIONS_BY_INTENT[testIntent]) {
            return FUNCTIONS_BY_INTENT[testIntent]();
        }

        if (FUNCTIONS_BY_INTENT[result.api]) {
            return FUNCTIONS_BY_INTENT[result.api]();
        } else {
            processBadInput();
        }

        function processDate() {
            async.waterfall([
                function (waterfallNext) {
                    getState(conversationId, waterfallNext);
                },
                function (currentState) {
                    if (currentState && currentState.state_type === 'Reminder'){
                        reminder = currentState.outcome;
                        if (!!result.data.date){
                            var reminderDocument = new Reminder({
                                conversation_id: conversationId,
                                username: username,
                                status: 'scheduled',
                                reminder_date: result.data.date,
                                location: _.first(reminder.locations),
                                task: _.first(reminder.reminders)
                            });
                            reminderDocument.save(function (err) {
                                if (!err) {
                                    scheduler.scheduleReminder(reminderDocument);
                                }
                            });
                            var update = {
                                is_active: false
                            };
                            updateState(conversationId, update);
                            sendReminderSavedMessage(conversationId, username, reminderDocument);
                        }
                    }
                }]);
        }


        function processYelp() {
            var searchTerm = _.first(result.data.search_queries) || 'food';
            var location = _.first(result.data.locations) || '200 University Ave. W, Waterloo, ON';
            var options = {
                term: searchTerm,
                location: location,
                limit: 20,
                sort: 1 // 0 for best matched, 1 for distance, 2 for best rated
            };
            yelp.search(options, function (error, data) {
                var businesses = data.businesses;
                var businesses = _.take(businesses, 3);
                var businessStrings = _.map(businesses, mapBusinessInfo);
                var messageToSend = businessStrings.join('\n');
                messageToSend += '\n' + 'Type "view more" to see more results!';
                var messageObject = {
                    message: messageToSend,
                    shareable_attachment: 953061814739331
                };

                var newState = new State({
                    conversation_id: conversationId,
                    create_date: moment(),
                    is_active: true,
                    outcome: data.businesses,
                    meta_data: {
                        last_seen_index: 3
                    },
                    state_type: 'Yelp'
                });
                saveState(conversationId, newState);
                sendUserAMessage(conversationId, messageObject, username);
            });
        }

        function processReminder() {
            var task = _.first(result.data.reminders);

            if (!task) {
                return sendUserAMessage(conversationId, {message: "I'm not sure what you mean by that. Could you say that again?"}, username);
            }
            var reminderDate = _.first(result.data.datetimes);
            if (!reminderDate) {
                var state = new State({
                    conversation_id: conversationId,
                    create_date: moment(),
                    is_active: true,
                    outcome: result.data,
                    meta_data: {},
                    state_type: 'Reminder'
                });
                saveState(conversationId, state);
                sendUserAMessage(conversationId, {message: 'When should I remind you?'}, username);
                return;
            }

            var reminderDocument = new Reminder({
                conversation_id: conversationId,
                username: username,
                status: 'scheduled',
                reminder_date: reminderDate,
                location: _.first(result.data.locations),
                task: task
            });
            sendReminderSavedMessage(conversationId, username, reminderDocument);
            reminderDocument.save(function (err) {
                if (!err) {
                    scheduler.scheduleReminder(reminderDocument);
                }
            });
        }

        function processUber() {
            startLocation = _.first(result.data.start_location);
            endLocation = _.first(result.data.end_location);

            if (_.isEmpty(startLocation) || _.isEmpty(endLocation)) {
                createState();
                var location = _.isEmpty(startLocation) ? 'startLocation' : 'endLocation';
                return promptLocation(location);
            } else {
                async.waterfall([
                    getStartLocation,
                    getEndLocation,
                    findUber,
                    requestUber,
                    acceptUber,
                    getPriceEstimate
                ], finalCallback);
            }

            function createState() {
                var uberState = new State({
                    conversation_id: conversationId,
                    meta_data: {
                        start_location: startLocation || {},
                        end_location: endLocation || {}
                    },
                    state_type: 'Uber',
                    create_date: moment()
                });
                saveState(conversationId, uberState);
            }
        }

        function getStartLocation(waterfallNext) {
            var start_location = result.start_location || startLocation;
            start_location = start_location.value || start_location.toString();

            geocode.locationToGeocode(start_location, waterfallNext)
        }

        function getEndLocation(startLoc, waterfallNext) {
            var end_location = result.end_location || endLocation;
            end_location = end_location.value || end_location.toString();
            start_latlng = startLoc;

            geocode.locationToGeocode(end_location, waterfallNext)
        }

        function findUber(endLoc, waterfallNext) {
            end_latlng = endLoc;
            var url = 'https://sandbox-api.uber.com/v1/products';
            var params = {
                "server_token": "AhNNYnBNwt_BDiHL0hPNGUuEHXpHpO21gvNNVlJL"
            };
            params.longitude = start_latlng.lng.toString() || "-80.5400";
            params.latitude = start_latlng.lat.toString() || "43.4689";
            var options = {
                url: url,
                qs: params
            };
            request.get(options, function (error, response) {
                var uber = JSON.parse(response.body).products[0];
                var uberDetails = {};
                if (uber) {
                    uberDetails = {
                        productId: uber.product_id,
                        type: uber.display_name
                    };
                }
                var messageObject = {
                    message: 'I found you an Uber!'
                };

                type = uber.display_name;

                sendUserAMessage(conversationId, messageObject, _.get(lastMessage, 'from.name'));
                sleep.usleep(300000);
                return waterfallNext(null, uberDetails);
            });
        }

        function requestUber(uberDetails, waterfallNext) {
            var url = 'https://sandbox-api.uber.com/v1/requests';
            var headers = {
                "Authorization": "Bearer sKvt3zQt7dYXLfqCPQXxoOEf03DR3t",
                "Content-Type": "application/json"
            };
            var body = {
                "product_id": uberDetails.productId
            };
            body.start_longitude = start_latlng.lng.toString() || "-80.5400";
            body.start_latitude = start_latlng.lat.toString() || "43.4689";
            body.end_longitude = end_latlng.lng.toString() || "-79.4000";
            body.end_latitude = end_latlng.lat.toString() || "43.7000";

            var options = {
                url: url,
                headers: headers,
                json: body
            };
            var messageObject = {
                message: 'Uber requested. I\'m waiting for driver to accept...'
            };

            request.post(options, function (error, response) {
                sendUserAMessage(conversationId, messageObject, _.get(lastMessage, 'from.name'));
                sleep.usleep(2000000);
                var requestDetails = {
                    requestId: response.body.request_id,
                    eta: response.body.eta
                };
                return waterfallNext(null, requestDetails);
            })
        }

        function acceptUber(requestDetails, waterfallNext) {
            var url = 'https://sandbox-api.uber.com/v1/sandbox/request/' + requestDetails.requestId;
            var headers = {
                "Authorization": "Bearer sKvt3zQt7dYXLfqCPQXxoOEf03DR3t",
                "Content-Type": "application/json"
            };
            var body = {
                "status": "accepted"
            };
            var options = {
                url: url,
                headers: headers,
                json: body
            };

            request.put(options, function (error, response) {
                var message = 'Uber accepted! ' + 'Your Uber is arriving in approximately, ' +
                    requestDetails.eta + ' minutes.';
                var messageObject = {
                    message: message
                };
                sendUserAMessage(conversationId, messageObject, _.get(lastMessage, 'from.name'));
                sleep.usleep(1000000);
                return waterfallNext(null);
            })
        }

        function getPriceEstimate(waterfallNext) {
            var priceUrl = 'https://sandbox-api.uber.com/v1/estimates/price';
            var params = {
                "server_token": "AhNNYnBNwt_BDiHL0hPNGUuEHXpHpO21gvNNVlJL",
                "start_longitude": "-80.5400",
                "start_latitude": "43.4689",
                "end_longitude": "-79.4000",
                "end_latitude": "43.7000"
            };
            params.start_longitude = start_latlng.lng.toString() || "-80.5400";
            params.start_latitude = start_latlng.lat.toString() || "43.4689";
            params.end_longitude = end_latlng.lng.toString() || "-79.4000";
            params.end_latitude = end_latlng.lat.toString() || "43.7000";
            var options = {
                url: priceUrl,
                qs: params
            };

            request.get(options, function (error, response) {
                var price = _.find(JSON.parse(response.body).prices, function (price) {
                    return price.display_name === 'uberX';
                });
                var messageObject = {
                    message: 'Price estimate for your ' + type + ': ' + price.estimate + '.',
                    shareable_attachment: 953066084738904
                };

                sendUserAMessage(conversationId, messageObject, _.get(lastMessage, 'from.name'));
                return waterfallNext(null);
            });
        }

        function finalCallback(error) {
            deleteState(conversationId);
            console.log('done');
        }

        function promptLocation(type) {
            var message;
            if (type === 'startLocation') {
                message = 'Where are you right now?'
            } else {
                message = 'Where would you like to go?'
            }
            sendUserAMessage(conversationId, {message: message}, username);
        }

        function processLocation() {
            async.waterfall([
                getCurrentState,
                determineNextAction
            ], finalCallback);

            function getCurrentState(waterfallNext) {
                getState(conversationId, waterfallNext);
            }

            function determineNextAction(currentState) {
                if (currentState) {
                    if (currentState.is_active && currentState.meta_data) {
                        startLocation = currentState.meta_data.start_location;
                        endLocation = currentState.meta_data.end_location;
                    }

                    if (_.isEmpty(startLocation)) {
                        startLocation = result.data.location;
                    } else {
                        endLocation = result.data.location;
                    }

                    if (endLocation) {
                        async.waterfall([
                            getStartLocation,
                            getEndLocation,
                            findUber,
                            requestUber,
                            acceptUber,
                            getPriceEstimate
                        ], finalCallback);
                    } else {
                        var metaData = {
                            "start_location": startLocation,
                            "end_location": endLocation
                        };
                        updateState(conversationId, { "meta_data": metaData });
                        promptLocation('endLocation');
                    }
                }
            }
        }

        function processGreeting() {
            sendUserAMessage(conversationId, {message: 'Hello, ' + username + '!'}, username);
        }

        function processEventSearch() {
            eventbrite.search(result.data, function (err, data) {
                if (err) console.error(err);
                var eventStrings = _.map(data.events.slice(0, 3), mapEventData);
                var messageToSend = eventStrings.join('\n');
                sendUserAMessage(conversationId, {message: messageToSend}, username);
            });
        }

        function processInsult() {
            sendUserAMessage(conversationId, {message: '#Rude'}, username);
        }

        function processViewMore() {
            async.waterfall([
                function (waterfallNext) {
                    getState(conversationId, waterfallNext);
                },
                function (currentState) {
                    if (currentState && currentState.state_type === 'Yelp') {
                        var businesses = currentState.outcome;
                        var lastIndex = currentState.meta_data.last_seen_index;
                        var quantity = (!!result.data.number) ? result.data.number : 3;
                        var businesses = _.slice(businesses, lastIndex, lastIndex + quantity);
                        var businessStrings = _.map(businesses, mapBusinessInfo);
                        var messageToSend = businessStrings.join('\n');
                        messageToSend += '\n' + 'Type "view more" to see more results!';
                        var messageObject = {
                            message: messageToSend,
                            shareable_attachment: 953061814739331
                        };

                        var update = {
                            "meta_data.last_seen_index": lastIndex + quantity
                        };
                        updateState(conversationId, update);
                        sendUserAMessage(conversationId, messageObject, username);
                    }
                }
            ]);
        }

        function searchGoogle() {
            var url = 'https://ajax.googleapis.com/ajax/services/search/web?v=1.0';
            var params = {
                "q": _.first(result.data.search_queries)
            };
            var options = {
                url: url,
                qs: params
            };
            request.get(options, function (error, response) {
                var results = _.take(_.get(JSON.parse(response.body), "responseData.results"), 3);
                var resultsToSend = _.map(results, function (result) {
                    return result.title.replace(/<\/?[^>]+(>|$)/g, "") + " " + result.visibleUrl + '\n\n';
                });
                var messageObject = {
                    message: resultsToSend.join(''),
                    shareable_attachment: 953071651405014
                };
                sendUserAMessage(conversationId, messageObject, username);
            });
        }

        function processBadInput() {
            sendUserAMessage(conversationId, {message: 'Sorry, I didn\'t understand what you meant by that.'}, username);
        }

        function mapEventData(event) {
            var ret = event.name.text + '\n';
            ret += 'Start: ' + moment(event.start.local).format('ddd, MMM. D, YYYY h:mma') + '\n';
            ret += 'End: ' + moment(event.end.local).format('ddd, MMM. D, YYYY h:mma') + '\n';
            if (!!event.vanity_url)
                ret += event.vanity_url;
            else
                ret += event.url;
            ret += '\n';
            return ret;
        }

        function mapBusinessInfo(business) {
            var newString = business.name;
            if (business.hasOwnProperty('is_closed')) {
                newString += business.is_closed ? ' (CLOSED) ' : ' (OPEN) ';
            }
            newString += '\n';
            newString += business.rating + '/5.0 ' + '\n';
            if (business.location.address) {
                newString += business.location.address + '\n';
            }
            if (business.phone) {
                newString += 'TEL: ' + business.phone + ' ' + '\n';
            }
            if (business.url) {
                newString += business.url + '\n';
            }
            return newString;
        }
    }
}

function sendUserAMessage(conversationId, messageObject, username) {
    if (!messageObject.message) {
        return;
    }

    var conversationURL = '/' + conversationId + '/messages';
    FB.api(conversationURL, 'POST', messageObject, callback);

    function callback(error) {
        if (error.error) {
            console.error('ERROR: ' + error.error.message);
        } else {
            console.log('message sent to ' + username);
        }
    }
}

function deleteState(conversationId) {
    State.remove({ conversation_id: conversationId });
}

function saveState(conversationId, newState) {
    newState = newState.toObject();
    delete newState._id;
    State.update({conversation_id: conversationId}, newState,
        {upsert: true, 'new': true},
        function (error, state) {
            return state;
        });
}

function getState(conversationId, callback) {
    State.findOne({
        conversation_id: conversationId
    }, {}, { sort: { 'create_date' : -1 } }, function (error, state) {
        if (state && state.is_active) {
            return callback(null, state);
        }
        return callback(null, false);
    })
}

function updateState(conversationId, update) {
    State.findOneAndUpdate({
        conversation_id: conversationId
    }, update, {sort: {'create_date': -1 }, new: true}, function (error, state) {
        if (state) {
            return state;
        }
        return false;
    })
}

function sendReminderSavedMessage(conversationId, username, reminder) {
    sendUserAMessage(conversationId, {message: 'I will remind you to \"'+ reminder.task +'\" ' + moment(reminder.reminder_date).fromNow() +'!'}, username);
}
