/**
 * Initialize HTTPForm services for a cartridge
 */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Site = require("dw/system/Site");
var StringUtils = require("dw/util/StringUtils");
/**
*
* HTTPForm Service
*
*/
function createCase() {
    var service = LocalServiceRegistry.createService("Signifyd.REST.CreateCase", {
        createRequest: function(svc, args){
            var sitePrefs = Site.getCurrent().getPreferences();
            var APIkey = sitePrefs.getCustom()["SignifydApiKey"];
            var authKey = StringUtils.encodeBase64(APIkey); // move to site preferences
            svc.setRequestMethod("POST");
            svc.addHeader("Content-Type", "application/json");
            svc.addHeader("Authorization", "Basic " + authKey);
            if(args) {
                return JSON.stringify(args);
            } else {
                return null;
            }
        },
        parseResponse: function(svc, client) {
            return client.text;
        },
        mockCall: function(svc, client) {
            return {
                statusCode: 200,
                statusMessage: "Form post successful",
                text: "{ \"investigationId\": 1}"
            };
        }
    });

    return service;
}

module.exports = {
    createCase: createCase
};
