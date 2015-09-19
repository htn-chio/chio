var config = require('config');
var _ = require('lodash');
var FB = require('fb');
var wit = require('./wit');
var eventbrite = require('./eventbrite');
var Reminder = require('./models/reminder.model.js');
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
    var conversationId;
    var lastMessageG;
    var username;
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
                    username = _.get(lastMessageG, 'from.name');
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
                sendUserAMessage(conversationId, messageToSend, username);
            })
        } else if (result.api === 'Reminder') {
            var task = _.first(result.data.reminders);

            if (!task) {
                return sendUserAMessage(conversationId, 'I don\'t know what to remind you.', username);
            }

            var reminderDocument = new Reminder({
                conversation_id: conversationId,
                status: 'scheduled',
                reminder_date: _.first(result.data.datetimes),
                location: _.first(result.data.locations),
                task: task
            });
            reminderDocument.save(function (err) {
                if (!err) {
                    sendUserAMessage(conversationId, 'Reminder saved!', username);
                }
            })
        } else if (result.api === 'Greeting') {
            sendUserAMessage(conversationId, 'Hello, '+ username + '!', username);
        } else if (result.api === 'Event') {
            eventbrite.search(result.data, function(err, data){
                if (err) console.error(err);
                var eventStrings = _.map(data.events.slice(0, 3), mapEventData);
                var messageToSend = eventStrings.join('\n\n');
                sendUserAMessage(conversationId, messageToSend, username);
            });
        } else if (result.api === 'Insult') {
            sendUserAMessage(conversationId, '#Rude', username);
        } else {
            sendUserAMessage(conversationId, 'Sorry, I don\'t understand what you said.',  username);
        }

        function mapEventData(event) {
            var ret = event.name.text + '\n';
            ret += 'Start: '+ event.start.local + '\n';
            ret += 'End: '+ event.end.local + '\n';
            if (!!event.vanity_url)
                ret += event.vanity_url;
            else
                ret += event.url;
            return ret;
        }

        function mapBusinessInfo(business) {
            var newString = business.name + '\n';
            newString += business.is_closed ? ' (CLOSED) ' : ' (OPEN) ' + '\n';
            newString += ' - ' + business.rating + ' stars ' + '\n';
            newString += business.address + '\n' || '' ;
            if (business.phone) {
                newString += 'TEL: ' + business.phone + '\n';
            }
            newString += business.url || '';
            return newString;
        }
    }
}

function sendUserAMessage(conversationId, message, userName) {
    if (!message) {
        return;
    }

    var conversationURL = '/' + conversationId + '/messages';
    message += '\n\n from ' + config.user.name + '\'s server.';
    FB.api(conversationURL, 'POST', {'message': message}, callback);

    function callback() {
        console.log('message sent to ' + userName);
    }
}
