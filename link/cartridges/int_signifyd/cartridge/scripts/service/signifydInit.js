/**
 * Initialize HTTPForm services for a cartridge
 */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Site = require('dw/system/Site');
var StringUtils = require('dw/util/StringUtils');


// eslint-disable-next-line valid-jsdoc
/**
 *
 * @returns {dw.svc.Service}
 */
function createCase() {
    var service = LocalServiceRegistry.createService('Signifyd.REST.CreateCase', {
        createRequest: function (svc, args) {
            var sitePrefs = Site.getCurrent().getPreferences();
            var APIkey = sitePrefs.getCustom().SignifydApiKey;
            var authKey = StringUtils.encodeBase64(APIkey); // move to site preferences
            svc.setRequestMethod('POST');
            svc.addHeader('Content-Type', 'application/json');
            svc.addHeader('Authorization', 'Basic ' + authKey);
            if (args) {
                return JSON.stringify(args);
            }
            return null;
        },
        parseResponse: function (svc, client) {
            return client.text;
        },
        mockCall: function () {
            return {
                statusCode: 200,
                statusMessage: 'Form post successful',
                text: '{ "investigationId": 1}'
            };
        },
        getResponseLogMessage: function (response) {
            return response.statusMessage;
        },
        filterLogMessage: function (msg) {
            if (!empty(msg)){
                msg = msg.replace(/\"cardLast4\"\:\".{4}\"/, '"cardLast4":"****"');
                msg = msg.replace(/\"cardExpiryMonth\"\:.{2}/, '"cardExpiryMonth":"**"');
                msg = msg.replace(/\"cardExpiryYear\"\:.{4}/, '"cardExpiryYear":"****"');
                msg = msg.replace(/\"accountId\"\:\w*/, '"accountId":"****"');
            }
            return msg;
        }
    });

    return service;
}

module.exports = {
    createCase: createCase
};
