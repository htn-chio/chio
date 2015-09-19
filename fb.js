var config = require('config');
var _ = require('lodash');
var FB = require('fb');
var wit = require('./wit');
var Reminder = require('./models/reminder.model.js');
var yelp = require('yelp').createClient({
    consumer_key: "XZYHgCOEsUws1-HGNAKG6w",
    consumer_secret: "OorilNhUdoeScwdbgj0xsPF4XgQ",
    token: "4v5gD9lBIHIzYRbt7i8rj5I2CE-bB-uE",
    token_secret: "k44cj6mfS_3VChUm_GUMfbghtK0"
});
var BitlyAPI = require("node-bitlyapi");
var Bitly = new BitlyAPI({
    client_id: "732827186896c0fa364ae60ac0bfad0bafcda25f",
    client_secret: "f91e1cef3dfb292cb46b9bb81f6cb81266c8bb6f"
});
Bitly.authenticate(config.bitly.username, config.bitly.password, function (err, access_token) {
    if (err) {
        console.log(err);
    } else {
        Bitly.setAccessToken(access_token);
    }
});

var ACCESS_TOKEN = config.fb.access_token;
var CHIO_BOT_ID = config.fb.chio_bot_id;

FB.setAccessToken(ACCESS_TOKEN);

var fbController = {
    checkFacebookMessages: checkFacebookMessages,
    sendUserAMessage: sendUserAMessage
};

module.exports = fbController;

function checkFacebookMessages() {
    var conversationId;
    var lastMessageG;
    var chioBotConversationURL = '/952568054788707/conversations';

    FB.api(chioBotConversationURL, parseConversations);

    function parseConversations(response) {
        if (response && !response.error) {
            var conversations = response.data;

            _.forEach(conversations, function (conversation) {
                var lastMessage = _.first(_.get(conversation, 'messages.data'));

                var lastSenderId = _.get(lastMessage, 'from.id');

                if (lastSenderId !== CHIO_BOT_ID) {
                    wit.parseText(lastMessage.message, processResult);
                    conversationId = conversation.id;
                    lastMessageG = lastMessage;
                }
            });
        }
    }

    function processResult(result) {
        if (result.api === 'Yelp') {
            var searchTerm = _.first(result.data.search_queries) || 'food';
            var location = _.first(result.data.locations) || '200 University Ave. W, Waterloo, ON';
            var options = {
                term: searchTerm,
                location: location,
                limit: 3,
                sort: 1 // 0 for best matched, 1 for distance, 2 for best rated
            };
            yelp.search(options, function (error, data) {
                var businesses = data.businesses;
                var businessStrings = _.map(businesses, mapBusinessInfo);
                var messageToSend = businessStrings.join('\n\n');
                sendUserAMessage(conversationId, messageToSend, _.get(lastMessageG, 'from.name'));
            })
        } else if (result.api === 'Reminder') {
            var reminderDocument = new Reminder({
                conversation_id: conversationId,
                status: 'scheduled',
                reminder_date: _.first(result.data.datetimes),
                location: _.first(result.data.locations),
                task: _.first(result.data.reminders)
            });
            reminderDocument.save(function (err) {

                sendUserAMessage(conversationId, 'Reminder saved!', _.get(lastMessageG, 'from.name'));
                if (err) handleError(err);
                // saved!
            })
        }

        function mapBusinessInfo(business) {
            var newString = business.name;
            newString += business.is_closed ? ' (CLOSED) ' : ' (OPEN) ';
            newString += ' - ' + business.rating + ' stars ';
            newString += business.address || '';
            if (business.phone) {
                newString += 'TEL: ' + business.phone + ' ';
            }
            newString += business.url || '';
            return newString;
        }
    }
}

function sendUserAMessage(conversationId, message, userName) {
    var conversationURL = '/' + conversationId + '/messages';
    FB.api(conversationURL, 'POST', {'message': message}, callback);

    function callback() {
        console.log('message sent to ' + userName);
    }
}
