'use strict';
/*
 * Express Dependencies
 */
var express = require('express');
var mongoose = require('mongoose');

// Connect to database
mongoose.connect('54.69.56.146', 'mine-prod');
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
