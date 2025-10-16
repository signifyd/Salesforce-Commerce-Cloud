'use strict';

var OrderMgr = require('dw/order/OrderMgr');
var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var Order = require('dw/order/Order');

// eslint-disable-next-line valid-jsdoc
/**
 * prepares the search query
 * @returns {{string: string, values: []}}
 */
function getSearchQuery(args) {
    var queryFields = [];
    var queryValues = [];

    // add retry count to filter
    var signifydMaxRetryCount = Site.getCurrent().getCustomPreferenceValue('SignifydMaxRetryCount');
    queryFields.push('(custom.SignifydRetryCount < {0} AND custom.SignifydRetryCount >= {1})');
    queryValues.push(signifydMaxRetryCount);
    queryValues.push(0);

    // add signifydCaseID to filter
    queryFields.push('custom.SignifydCaseID = {2}');
    queryValues.push(null);

    // add SignifydPaymentMethodExclusionFlag to filter
    queryFields.push('custom.SignifydPaymentMethodExclusionFlag = {3}');
    queryValues.push(false);

    var currentDate = formatDate(args.StartDate);

    queryFields.push('creationDate > {4}');
    queryValues.push(currentDate);

    return {
        string: queryFields.join(' AND '),
        values: queryValues
    };
}

/**
 * Gets the orders iterator
 * @param {Object} args - arguments
 * @returns {dw.util.SeekableIterator<dw.order.Order>} - orders iterator
 */
function getOrdersIterator(args) {
    var searchQuery = getSearchQuery(args);
    var ordersIterator = OrderMgr.searchOrders(searchQuery.string, 'creationDate desc', searchQuery.values);
    return ordersIterator;
}


/**
 * Formats the date
 * @param {string} startDate - date string
 * @returns {Date} - formatted date
 */
function formatDate(startDate) {
    var currentDate = new Date(new Date().setHours(0, 0, 0, 0));
    if (!empty(startDate)) {
        var dateArray = startDate.split('/');
        currentDate.setDate(dateArray[1]);
        currentDate.setMonth(dateArray[0] - 1);
        currentDate.setYear(dateArray[2]);
    }
    return currentDate;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Iterates over each order and call Signifyd
 * @param {dw.util.SeekableIterator<dw.order.Order>} ordersIterator
 */
function processOrders(ordersIterator) {
    while (ordersIterator.hasNext()) {
        var order = ordersIterator.next();
        var orderStatus = order.getStatus();

        if (orderStatus !== Order.ORDER_STATUS_CREATED && orderStatus !== Order.ORDER_STATUS_CANCELLED && orderStatus !== Order.ORDER_STATUS_FAILED) {
            Logger.info('Processing OrderNo: {0}', order.orderNo);
            // eslint-disable-next-line new-cap
            require('int_signifyd/cartridge/scripts/service/signifyd').Call(order);
        }
    }
}

/**
 * Job entry point
 * @param {Object} args - arguments
 */
function execute(args) {
    if (Site.getCurrent().getCustomPreferenceValue('SignifydEnableCartridge')) {
        var ordersIterator = getOrdersIterator(args);

        Logger.info('Orders count: {0}', ordersIterator.count);

        processOrders(ordersIterator);

        Logger.info('Finished order processing');
    }
}

exports.execute = execute;
