/**
 * A Signifyd controller.
 *
 * @module controllers/Signifyd
 *
*/

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');
var Transaction = require('dw/system/Transaction');

/* Script Modules */
var app = require('app_storefront_controllers/cartridge/scripts/app');
var Order = app.getModel('Order');
var Transaction = require('dw/system/Transaction');
var params = request.httpParameterMap;
var sig = require('~/cartridge/scripts/service/signifyd');

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
