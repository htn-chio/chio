var config = require('config');
var _ = require('lodash');
var FB = require('fb');

var ACCESS_TOKEN = config.fb.access_token;
var CHIO_BOT_ID = config.fb.chio_bot_id;

FB.setAccessToken(ACCESS_TOKEN);

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

            _.forEach(conversations, function(conversation) {
                var lastMessage = _.first(_.get(conversation, 'messages.data'));

                var lastSenderId = _.get(lastMessage, 'from.id');

                if (lastSenderId !== CHIO_BOT_ID) {
                    sendUserAMessage(conversation.id, 'Hi Im Chio Bot!', _.get(lastMessage, 'from.name'));
                }
            });
        }
    }
}

function sendUserAMessage(conversationId, message, userName) {
    var conversationURL = '/' +  conversationId + '/messages';
    FB.api(conversationURL, 'POST', { 'message': message }, callback);

    function callback() {
        console.log('message sent to ' + userName);
    }
}