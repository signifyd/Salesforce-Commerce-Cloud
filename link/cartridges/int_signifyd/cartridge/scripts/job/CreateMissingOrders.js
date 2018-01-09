'use strict';

var Order    = require('dw/order/Order');
var OrderMgr = require('dw/order/OrderMgr');
var Logger   = require('dw/system/Logger');

/**
 * Mounts the search query
 */
function getSearchQuery() {

    var queryFields = [],
        queryValues = [];

    // add retry count to filter
    var signifydMaxRetryCount = dw.system.Site.getCurrent().getCustomPreferenceValue('SignifydMaxRetryCount');
    queryFields.push('(custom.SignifydRetryCount < {0} AND custom.SignifydRetryCount >= {1})');
    queryValues.push(signifydMaxRetryCount);
    queryValues.push(0);

    // add signifydCaseID to filter
    queryFields.push('custom.SignifydCaseID = {2}');
    queryValues.push(null);

    return {
        string : queryFields.join(' AND '),
        values : queryValues
    };
}

/**
 * Searchs for order in the Salesforce Commerce Cloud
 */
function getOrdersIterator() {
    var searchQuery = getSearchQuery();
    var ordersIterator = OrderMgr.searchOrders(searchQuery.string, 'creationDate desc', searchQuery.values);
    return ordersIterator;
}

/**
 * Iterates over each order and call Signifyd
 * @param {*} ordersIterator 
 */
function processOrders(ordersIterator) {
    while (ordersIterator.hasNext()) {
        var order = ordersIterator.next();
        Logger.info('Processing OrderNo: {0}', order.orderNo);
        require('int_signifyd/cartridge/scripts/service/signifyd').Call(order);
    }
}

/**
 * Main entry point for the Job call
 * @param {Object} args - Optional arguments to filter the search
 */
function execute(args) {

    if (dw.system.Site.getCurrent().getCustomPreferenceValue("SignifydEnableCartridge")) {
        var ordersIterator = getOrdersIterator();

        Logger.info('Orders count: {0}', ordersIterator.count);

        processOrders(ordersIterator);

        Logger.info('Finished order processing');
    }

}

exports.execute = execute;
