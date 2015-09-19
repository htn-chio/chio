'use strict';
/*
 * Express Dependencies
 */
var request = require('request');
var express = require('express');

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
        redirect_uri: 'localhost:3000/success',
        grant_type: 'authorization_code'
    };
    console.log(option);
    if(req.query.code) {
        oauth2.getOAuthAccessToken(req.query.code, option, function (err, access_token, refresh_token) {
            if (err) {
                console.log(err);
            }
            console.log(access_token);
        })
    }
});

app.get('/authUber', function(req, res) {
  console.log(oauth2.getAuthorizeUrl({
    'response_type': 'code'
  }));
});

/*
 * Start it up
 */
app.listen(process.env.PORT || port);
console.log('Express started on port ' + port);
