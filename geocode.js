var _ = require('lodash');
var request = require('request');

var ACCESS_TOKEN = 'spPSmOTYsFpGU74bs5mCNDDu9q6drDNd';
var LOCATION_PARAM = '&location=';

var URL = 'http://www.mapquestapi.com/geocoding/v1/address?key=' + ACCESS_TOKEN + LOCATION_PARAM


module.exports = {
    locationToGeocode: locationToGeocode
};

function locationToGeocode(location, callback){
    url = URL + location;
    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            return callback(null, _.first(_.first(JSON.parse(response.body).results).locations).latLng);
        }
        return callback(error, null);
    });
}
