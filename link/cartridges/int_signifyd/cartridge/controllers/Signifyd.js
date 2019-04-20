/**
 * A Signifyd controller.
 *
 * @module controllers/Signifyd
 *
*/

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');

/* Script Modules */
var sig = require('int_signifyd/cartridge/scripts/service/signifyd');

/**
 * Tests Signifyd service. Use order number from HTTP request.
 * Use ../Signifyd-Test?OrderNumber=00000001 to test with first order.
 * Calls method from signifyd script. 
 * Displays caseID as a response on page.
 */

function test(){
    var orderNumber = request.httpParameterMap.get("OrderNumber");
    var order = OrderMgr.getOrder(orderNumber);
    var caseId = sig.Call(order);
    response.getWriter().println(caseId);
}

/**
 * Renders template with device fingerprint. Used for remote including
 * in order to prevent fingerprint caching
 */
function includeFingerprint() {
    var ISML = require('dw/template/ISML');
    ISML.renderTemplate('signifyd_device_fingerprint');
}

/**
 * Receives a webhook callbacks from Signifyd server.
 * Url to this method must be set in https://app.signifyd.com/settings/notifications
 */
function callback(){
    sig.Callback(request);
}

exports.Callback = callback;
exports.Callback.public = true; 

exports.Test = test;
exports.Test.public = true; 

exports.IncludeFingerprint = includeFingerprint;
exports.IncludeFingerprint.public = true; 
