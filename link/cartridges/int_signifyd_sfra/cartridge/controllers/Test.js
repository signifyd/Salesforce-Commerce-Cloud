'use strict';

var server = require('server');
server.extend(module.superModule);

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');

server.post('Config', function (req, res, next) {
    var Site = require("dw/system/Site");
    var sitePrefs = Site.getCurrent().getPreferences();
    var APIkey = sitePrefs.getCustom()["SignifydApiKey"];
    res.json({ 
        APIkey: APIkey
    });
    next();
});

server.post('Callback', function (req, res, next) {
    var orderNumber = req.querystring.orderNumber;
    var order = OrderMgr.getOrder(orderNumber);
    if (order) {
        res.json({
            success: true,
            SignifydGuaranteeDisposition: order.custom.SignifydGuaranteeDisposition ? order.custom.SignifydGuaranteeDisposition.value : '',
            SignifydFraudScore: order.custom.SignifydFraudScore,
            SignifydOrderURL: order.custom.SignifydOrderURL,
            exportStatus: order.exportStatus.value
        });
    } else {
        res.json({ 
            success: false
        });
    }
    next();
});

module.exports = server.exports();
