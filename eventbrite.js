var _ = require('lodash');
var eventbriteAPI = require('node-eventbrite');

var ACCESS_TOKEN = '7XC6GTIJEOF26N5NINNT';
var eventbrite = eventbriteAPI({
    token: ACCESS_TOKEN,
    version : 'v3'
});

module.exports = {
    search: search
}

function search(data, callback){
    var start;
    if (data.datetimes.length != 0) {
        start = (new Date(_.first(data.datetimes))).toISOString();
        start = start.slice(0, 19) + 'Z';
    }

    options = {
        q: _.first(data.search_queries),
        'location.address': _.first(data.locations),
        'start_date.range_start': start

    };
    console.log(options);
    eventbrite.search(options, callback);
}
