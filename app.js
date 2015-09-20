'use strict';
/*
 * Express Dependencies
 */
var request = require('request');
var express = require('express');
var mongoose = require('mongoose');
var config = require('config');

// Connect to database
mongoose.connect(config.mongo.config);
mongoose.connection.on('error', function(err) {
	console.error('MongoDB connection error: ' + err);
	process.exit(-1);
	}
);
mongoose.connection.once('open', function(callback) {
	console.log('yaaaay, connected');
});

var app = express();
var port = 3000;
var OAuth = require('oauth'), OAuth2 = OAuth.OAuth2;

var clientID = 'SsubnbKVlV6TePcEVhHkEHwUQZUl8tGQ';
var clientSecret = 'Hp1UDHxwkzlF3opfI-1HnKpaBupAD7J7ShRB6W_m';
var oauth2 = new OAuth2(clientID,
                        clientSecret,
                        '',
                        'https://login.uber.com/oauth/authorize',
                        'https://login.uber.com/oauth/token',
                        null); /** Custom headers */

// For gzip compression
app.use(express.compress());

var Facebook = require('./fb');

var scheduler = require('./schedule')
scheduler.init()

setInterval(function () {
    Facebook.checkFacebookMessages();
}, 1000);

/*
 * Routes
 */
// Index Page
app.get('/', function (request, response) {
    response.render('index');
});

app.get('/redirect', function(req, res) {
    console.log(req.query.code);
    var option = {
        client_id: clientID,
        client_secret: clientSecret,
        code: req.query.code,
        redirect_uri: 'http://localhost:3000/redirect',
        grant_type: 'authorization_code'
    };
    console.log(option);
    if(req.query.code) {
        oauth2.getOAuthAccessToken(req.query.code, option, function (err, access_token, refresh_token) {
          console.log('access ' + access_token);
          console.log('ref ' + refresh_token);
            if (err) {
                console.log(err);
            }
        })
    }
});

app.get('/authUber', function(req, res) {
  console.log(oauth2.getAuthorizeUrl({
    'response_type': 'code',
    'redirect_uri': 'http://localhost:3000/redirect',
    'scope': 'request'
  }));
});

app.get('/success', function(req, res) {
  console.log(req.query);
  console.log('access code: ' + req.query.code);
})

/*
 * Start it up
 */
app.listen(process.env.PORT || port);
console.log('Express started on port ' + port);
