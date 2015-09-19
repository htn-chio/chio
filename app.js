'use strict';
/*
 * Express Dependencies
 */
var express = require('express');

var app = express();
var port = 3000;

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

/*
 * Start it up
 */
app.listen(process.env.PORT || port);
console.log('Express started on port ' + port);
