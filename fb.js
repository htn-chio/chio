var async = require('async');
var config = require('config');
var _ = require('lodash');
var FB = require('fb');
var wit = require('./wit');
var eventbrite = require('./eventbrite');
var moment = require('moment');
var Reminder = require('./models/reminder.model.js');
var State = require('./models/state.model.js');
var scheduler = require('./schedule')
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
    var chioBotConversationURL = '/952568054788707/conversations';

    FB.api(chioBotConversationURL, parseConversations);

    function parseConversations(response) {
        if (response && !response.error) {
            var conversations = response.data;

            _.forEach(conversations, function (conversation) {
                var lastMessage = _.first(_.get(conversation, 'messages.data'));

                var lastSenderId = _.get(lastMessage, 'from.id');

                if (lastSenderId !== CHIO_BOT_ID) {
                    wit.parseText(lastMessage.message, function (result) {
                        var splitMessage = lastMessage.message.split(' ');
                        if (splitMessage[0] === 'TEST') {
                            return processResult(result, conversation, splitMessage[1]);
                        }
                        processResult(result, conversation)
                    });
                }
            });
        }
    }

    function processResult(result, conversation, testIntent) {
        var conversationId = conversation.id;
        var lastMessage = _.first(_.get(conversation, 'messages.data'));
        var username = _.get(lastMessage, 'from.name');
        var FUNCTIONS_BY_INTENT = {
            "Yelp": processYelp,
            "Reminder": processReminder,
            "Uber": processUber,
            "Greeting": processGreeting,
            "Event": processEventSearch,
            "Insult": processInsult,
            "Search": searchGoogle,
            "ViewMore": processViewMore
        };

        if (testIntent && FUNCTIONS_BY_INTENT[testIntent]) {
            return FUNCTIONS_BY_INTENT[testIntent]();
        }

        if (FUNCTIONS_BY_INTENT[result.api]) {
            return FUNCTIONS_BY_INTENT[result.api]();
        } else {
            processBadInput();
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
                var messageToSend = businessStrings.join('\n\n');
                messageToSend += '\n' + 'Type "View More" to see more results!';
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
                saveState(conversationId, 'Yelp', newState);
                sendUserAMessage(conversationId, messageObject, username);
            });
        }

        function processReminder() {
            var task = _.first(result.data.reminders);

            if (!task) {
                return sendUserAMessage(conversationId, {message: 'I don\'t know what to remind you.'}, username);
            }

            var reminderDocument = new Reminder({
                conversation_id: conversationId,
                username: username,
                status: 'scheduled',
                reminder_date: _.first(result.data.datetimes),
                location: _.first(result.data.locations),
                task: task
            });
            reminderDocument.save(function (err) {
                if (!err) {
                    sendUserAMessage(conversationId, {message: 'Reminder saved!'}, username);
                    scheduler.scheduleReminder(reminderDocument);
                }
            });
        }

        function processUber() {
            var type;

            async.waterfall([
                getCurrentState,
                askForLocation,
                findUber,
                requestUber,
                acceptUber,
                getPriceEstimate,
            ], finalCallback);

            function getCurrentState(waterfallNext) {
                getState(conversationId, waterfallNext);
            }

            function askForLocation(currentState, waterfallNext) {
                waterfallNext(null);
            }

            function findUber(waterfallNext) {
                var url = 'https://sandbox-api.uber.com/v1/products';
                var params = {
                    "server_token": "AhNNYnBNwt_BDiHL0hPNGUuEHXpHpO21gvNNVlJL",
                    "longitude": -80.5400,
                    "latitude": 43.4689
                };
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
                        message: 'Uber found!',
                        shareable_attachment: 953066084738904
                    };

                    type = uber.display_name;

                    sendUserAMessage(conversationId, messageObject, _.get(lastMessage, 'from.name'));
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
                    "product_id": uberDetails.productId,
                    "start_longitude": "-80.5400",
                    "start_latitude": "43.4689",
                    "end_longitude": "-79.4000",
                    "end_latitude": "43.7000"
                };

                var options = {
                    url: url,
                    headers: headers,
                    json: body
                };
                var messageObject = {
                    message: 'Uber requested. Waiting for driver to accept...',
                    shareable_attachment: 953066084738904
                };

                request.post(options, function (error, response) {
                    sendUserAMessage(conversationId, messageObject, _.get(lastMessage, 'from.name'));
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
                        message: message,
                        shareable_attachment: 953066084738904
                    };
                    sendUserAMessage(conversationId, messageObject, _.get(lastMessage, 'from.name'));
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
                var options = {
                    url: priceUrl,
                    qs: params
                };

                request.get(options, function (error, response) {
                    var price = _.find(JSON.parse(response.body).prices, function(price) {
                        return price.display_name === 'uberX';
                    });
                    var messageObject = {
                        message: 'Price estimate for your ' + type + ': ' + price.estimate,
                        shareable_attachment: 953066084738904
                    };

                    sendUserAMessage(conversationId, messageObject, _.get(lastMessage, 'from.name'));
                    return waterfallNext(null);
                });
            }

            function finalCallback(error) {
                console.log('done');
            }
        }

        function processGreeting() {
            sendUserAMessage(conversationId, {message: 'Hello, ' + username + '!'}, username);
        }

        function processEventSearch() {
            eventbrite.search(result.data, function (err, data) {
                if (err) console.error(err);
                var eventStrings = _.map(data.events.slice(0, 3), mapEventData);
                var messageToSend = eventStrings.join('\n\n');
                sendUserAMessage(conversationId, {message: messageToSend}, username);
            });
        }

        function processInsult() {
            sendUserAMessage(conversationId, {message: '#Rude'}, username);
        }

        function processViewMore() {
            async.waterfall([
                function (waterfallNext) {
                    getState(conversationId, 'Yelp', waterfallNext);
                },
                function (currentState) {
                    if (currentState && currentState.state_type === 'Yelp') {
                        var businesses = currentState.outcome;
                        var lastIndex = currentState.meta_data.last_seen_index;
                        var quantity = (!!result.data.number) ? result.data.number : 3;
                        var businesses = _.slice(businesses, lastIndex, lastIndex + quantity);
                        var businessStrings = _.map(businesses, mapBusinessInfo);
                        var messageToSend = businessStrings.join('\n\n');
                        messageToSend += '\n' + 'Type "View More" to see more results!';
                        var messageObject = {
                            message: messageToSend,
                            shareable_attachment: 953061814739331
                        };

                        var update = {
                            "meta_data.last_seen_index": lastIndex + 3
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
            sendUserAMessage(conversationId, {message: 'Sorry, I don\'t understand what you said.'}, username);
        }

        function mapEventData(event) {
            var ret = event.name.text + '\n';
            ret += 'Start: ' + event.start.local + '\n';
            ret += 'End: ' + event.end.local + '\n';
            if (!!event.vanity_url)
                ret += event.vanity_url;
            else
                ret += event.url;
            return ret;
        }

        function mapBusinessInfo(business) {
            var newString = business.name;
            if (business.hasOwnProperty('is_closed')) {
                newString += business.is_closed ? ' (CLOSED) ' : ' (OPEN) ';
            }
            newString += '- ' + business.rating + '/5.0 ';
            newString += business.address || '';
            if (business.phone) {
                newString += '\r\nTEL: ' + business.phone + ' ';
            }
            newString += business.url || '';
            return newString;
        }
    }
}

function sendUserAMessage(conversationId, messageObject, username) {
    if (!messageObject.message) {
        return;
    }

    var conversationURL = '/' + conversationId + '/messages';
    messageObject.message += '\n\n from ' + config.user.name + '\'s server.';
    FB.api(conversationURL, 'POST', messageObject, callback);

    function callback() {
        console.log('message sent to ' + username);
    }
}

function saveState(conversationId, newState) {
    State.findOne({
        conversation_id: conversationId,
        state_type: state_type
    }, function (error, state) {
        if (state) {
            state = _.assign(state, newState);
        } else {
            state = newState;
        }
        state.save();
        return state;
    });
}

function getState(conversationId, state_type, callback) {
    State.findOne({
        conversation_id: conversationId,
        state_type: state_type
    }, function (error, state) {
        if (state) {
            return callback(null, state);
        }
        return callback(null, false);
    })
}

function updateState(conversationId, state_type, update) {
    State.findOneAndUpdate({
        conversation_id: conversationId,
        state_type: state_type
    }, update, {new: true}, function (error, state) {
        if (state) {
            return state;
        }
        return false;
    })
}
