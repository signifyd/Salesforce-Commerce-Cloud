/**
* Main Signifyd Script File
* Two main public methods are Call and Callback
*
* Call - for export order info to.
* Callback - for receive data about guarantie Status.
*
*/
var Site = require('dw/system/Site');
var System = require('dw/system/System');
var sitePrefs = Site.getCurrent().getPreferences();
var APIkey = sitePrefs.getCustom().SignifydApiKey;
var HoldBySignified = sitePrefs.getCustom().SignifydHoldOrderEnable;
var EnableDecisionCentre = sitePrefs.getCustom().SignifydEnableDecisionCentre;
var EnableCartridge = sitePrefs.getCustom().SignifydEnableCartridge;
var Mac = require('dw/crypto/Mac');
var Logger = require('dw/system/Logger');
var Transaction = require('dw/system/Transaction');
var Encoding = require('dw/crypto/Encoding');
var URLUtils = require('dw/web/URLUtils');
var Calendar = require('dw/util/Calendar');
var StringUtils = require('dw/util/StringUtils');
var BasketMgr = require('dw/order/BasketMgr');
var OrderMgr = require('dw/order/OrderMgr');
var signifydInit = require('int_signifyd/cartridge/scripts/service/signifydInit');


/**
 * Get information about the SFCC version
 * @return {Object} - json describing the version
 */
function getPlatform() {
    return {
        storePlatform: 'Salesforce Commerce Cloud',
        storePlatformVersion: String(System.getCompatibilityMode()), // returns a string with the platform version: 1602
        signifydClientApp: 'Salesforce Commerce Cloud',
        signifydClientAppVersion: '19.2' // current year + number of certifications in the year
    };
}

// eslint-disable-next-line valid-jsdoc
/**
 * Get Information about customer in JSON format
 * acceptable on Stringifyd side
 *
 * @param {dw.order.Shipment} shipment to be verifyed
 * @param {String} email: String from order propertie
 * @return {Object}  json objects describes User.
 */
function getRecipient(shipment, email) {
    return {
        fullName: shipment.shippingAddress.fullName,
        confirmationEmail: email,
        confirmationPhone: shipment.shippingAddress.phone,
        organization: shipment.shippingAddress.companyName,
        deliveryAddress: {
            streetAddress: shipment.shippingAddress.address1,
            unit: shipment.shippingAddress.address2,
            city: shipment.shippingAddress.city,
            provinceCode: shipment.shippingAddress.stateCode,
            postalCode: shipment.shippingAddress.postalCode,
            countryCode: shipment.shippingAddress.countryCode.value
        }
    };
}

// eslint-disable-next-line valid-jsdoc
/**
 * Get list of shipments in JSON format
 * acceptable on Stringifyd side
 * * @param {Array} shipments array .
 * @return {Array}  array of shipments as json objects.
 */
function getShipments(shipments) {
    var Ashipments = [];
    for (var i = 0; i < shipments.length; i++) {
        var shipment = shipments[i];
        Ashipments.push({
            shipper: shipment.standardShippingLineItem.ID,
            shippingMethod: shipment.shippingMethod.displayName,
            shippingPrice: shipment.shippingTotalGrossPrice.value,
            trackingNumber: shipment.trackingNumber
        });
    }
    return Ashipments;
}

/**
 * Get Information about customer in JSON format
 * acceptable on Stringifyd side
 *
 * @param {order}  order that just have been placed.
 * @return {Object}  json objects describes User.
 */
function getUser(order) {
    if (order.customer.profile) {
        var phone;
        if (order.customer.profile.phoneMobile) phone = order.customer.profile.phoneMobile;
        if (order.customer.profile.phoneBusiness) phone = order.customer.profile.phoneBusiness;
        if (order.customer.profile.phoneHome) phone = order.customer.profile.phoneHome;
        var creationCal = new Calendar(order.customer.profile.getCreationDate());
        var updateCal = new Calendar(order.customer.profile.getLastModified());
        return {
            email: order.customer.profile.email,
            username: order.customerName,
            phone: phone,
            createdDate: StringUtils.formatCalendar(creationCal, "yyyy-MM-dd'T'HH:mm:ssZ"),
            accountNumber: order.customer.ID,
            lastUpdateDate: StringUtils.formatCalendar(updateCal, "yyyy-MM-dd'T'HH:mm:ssZ")
        };
    }
    return {
        email: order.customerEmail,
        username: order.customerName,
        phone: '',
        createdDate: '',
        accountNumber: order.customerNo
    };
}

/**
 * Get information about seller in JSON format
 *
 * @return {Object} json  object with String attributes.
 */
function getSeller() {
    var settings = sitePrefs.getCustom();// ["SignifydApiKey"];
    return {
        name: settings.SignifydSellerName,
        domain: settings.SignifydSellerDomain,
        shipFromAddress: {
            streetAddress: settings.SignifydFromStreet,
            unit: settings.SignifydFromUnit,
            city: settings.SignifydFromCity,
            provinceCode: settings.SignifydFromState,
            postalCode: settings.SignifydFromPostCode,
            countryCode: settings.SignifydFromCountry,
            latitude: settings.SignifydFromLatitude,
            longitude: settings.SignifydFromLongitude
        },
        corporateAddress: {
            streetAddress: settings.SignifydCorporateStreet,
            unit: settings.SignifydCorporateUnit,
            city: settings.SignifydCorporateCity,
            provinceCode: settings.SignifydCorporateState,
            postalCode: settings.SignifydCorporatePostCode,
            countryCode: settings.SignifydCorporateCountry,
            latitude: settings.SignifydCorporateLatitude,
            longitude: settings.SignifydCorporateLongitude
        }
    };
}

/**
 * Get list of products in JSON format
 * acceptable on Stringifyd side
 *
 * @param {products} products array of products.
 * @return {result} - array of products as json objects.
 */
function getProducts(products) {
    var result = [];
    for (var i = 0; i < products.length; i++) {
        var product = products[i];
        result.push({
            itemId: product.productID,
            itemName: product.productName,
            itemUrl: URLUtils.abs('Product-Show', 'pid', product.productID).toString(),
            itemQuantity: product.quantityValue,
            itemPrice: product.grossPrice.value
        });
    }
    return result;
}


// eslint-disable-next-line valid-jsdoc
/**
 * Sets or increments the retry count for the Order (used in the Job)
 * @param {dw.order.Order} - the current order being integrated
 */
function saveRetryCount(order) {
    Transaction.wrap(function () {
        if (!order.custom.SignifydRetryCount) {
            // eslint-disable-next-line no-param-reassign
            order.custom.SignifydRetryCount = 0;
        }
        // eslint-disable-next-line no-param-reassign,operator-assignment
        order.custom.SignifydRetryCount = order.custom.SignifydRetryCount + 1;
    });
}


// eslint-disable-next-line valid-jsdoc
/**
 * Process data about order when decision was received.
 *
 * @param {body} - body of request from Signifyd.
 */
function process(body) {
    var orderId = body.orderId || body.customerCaseId;
    var order = OrderMgr.getOrder(orderId);
    var receivedScore = body.score.toString();
    var roundScore = receivedScore;
    if (receivedScore.indexOf('.') >= 0) {
        roundScore = receivedScore.substring(0, receivedScore.indexOf('.'));
    }
    var score = Number(roundScore);
    if (order) {
        Transaction.wrap(function () {
            var orderUrl;
            var modifiedUrl;
            if (body.orderUrl) {
                orderUrl = body.orderUrl;
                modifiedUrl = orderUrl.replace(/(.+)\/(\d+)\/(.+)/, 'https://www.signifyd.com/cases/$2');
            } else {
                modifiedUrl = 'https://www.signifyd.com/cases/' + body.caseId;
            }
            order.custom.SignifydOrderURL = modifiedUrl;
            order.custom.SignifydFraudScore = score;
            if (EnableDecisionCentre) {
                if (body.checkpointAction === 'ACCEPT') {
                    order.custom.SignifydPolicy = 'accept';
                } else if (body.checkpointAction === 'REJECT') {
                    order.custom.SignifydPolicy = 'reject';
                } else {
                    order.custom.SignifydPolicy = 'hold';
                }

                order.custom.SignifydPolicyName = body.checkpointActionReason || '';

                if (HoldBySignified) { //processing is enabled in site preferences
                    if (body.checkpointAction != 'ACCEPT') {
                        order.exportStatus = 0; //NOTEXPORTED
                    } else {
                        order.exportStatus = 2; //Ready to export
                    }
                }
            } else {
                if (body.guaranteeDisposition) {
                    if (body.guaranteeDisposition !== 'APPROVED') {
                        order.custom.SignifydGuaranteeDisposition = 'declined';
                    } else {
                        order.custom.SignifydGuaranteeDisposition = 'approved';
                    }
                }

                if (HoldBySignified) { // processing is enabled in site preferences
                    if (body.guaranteeDisposition !== 'APPROVED') {
                        order.exportStatus = 0; // NOTEXPORTED
                    } else {
                        order.exportStatus = 2; // Ready to export
                    }
                }
            }
        });
    } else {
        Logger.getLogger('Signifyd', 'signifyd').error('An error===>>>: There is no order with ID = {0}', body.orderId);
    }
}

// eslint-disable-next-line valid-jsdoc
/**
 * Receive decision about case related to order.
 * Validate signifyd server by api key and
 * delegate processing to next method.
 *
 * @param {request} - http request with body and headers.
 */
exports.Callback = function (request) {
    if (EnableCartridge) {
        try {
            var body = request.httpParameterMap.getRequestBodyAsString();
            var headers = request.getHttpHeaders();
            Logger.getLogger('Signifyd', 'signifyd').debug('Debug: API callback header x-signifyd-topic: {0}', headers.get('x-signifyd-topic'));
            Logger.getLogger('Signifyd', 'signifyd').debug('Debug: API callback body: {0}', body);
            var parsedBody = JSON.parse(body);
            var hmacKey = headers.get('x-signifyd-sec-hmac-sha256');
            var crypt = new Mac(Mac.HMAC_SHA_256);
            var cryptedBody = crypt.digest(body, APIkey);
            // var cryptedBody: Bytes = crypt.digest(body, "ABCDE"); //test APIKEY
            var cryptedBodyString = Encoding.toBase64(cryptedBody);
            if (cryptedBodyString.equals(hmacKey)) {
                process(parsedBody);
            } else {
                Logger.getLogger('Signifyd', 'signifyd').error('An error===>>>: Request is not Authorized. Please check an API key.');
            }
        } catch (e) {
            var ex = e;
            Logger.getLogger('Signifyd', 'signifyd').error('Error: API Callback processing was interrupted because:{0}', ex.message);
        }
    }
};

/**
 * Generates an unique ID to use in Signifyd Fingerprint
 *
 * @return {deviceFingerprintID} - The generated finger print id
 */
function getOrderSessionId() {
    if (EnableCartridge) {
        var storeURL = URLUtils.home().toString();
        var limitedLengthURL = storeURL.length > 50 ? storeURL.substr(0, 50) : storeURL;
        var basketID = BasketMgr.getCurrentOrNewBasket().getUUID();
        var orderSessionId = StringUtils.encodeBase64(limitedLengthURL + basketID);
        return orderSessionId;
    }
    return null;
}


/**
 * Save the orderSessionId to the order
 * @param {order} order the recently created order
 * @param {orderSessionId} orderSessionId the order session id for the signifyd fingerprint
 */
function setOrderSessionId(order, orderSessionId) {
    if (EnableCartridge && orderSessionId) {
        Transaction.wrap(function () {
            // eslint-disable-next-line no-param-reassign
            order.custom.SignifydOrderSessionId = orderSessionId;
        });
    }
}


/**
 * Converts an Order into JSON format
 * acceptable on Stringifyd side
 *
 * @param {order} order Order that just have been placed.
 * @return {result} the json objects describes Order.
 */
function getParams(order) {
    var cal = new Calendar(order.creationDate);
    var paymentInstruments = order.allProductLineItems[0].lineItemCtnr.getPaymentInstruments();
    var paymentTransaction = paymentInstruments[0].getPaymentTransaction();
    var paymentInstrument = paymentTransaction.getPaymentInstrument();
    var paymentProcessor = paymentTransaction.getPaymentProcessor();
    return {
        purchase: {
            browserIpAddress: order.remoteHost,
            orderId: order.currentOrderNo,
            createdAt: StringUtils.formatCalendar(cal, "yyyy-MM-dd'T'HH:mm:ssZ"),
            paymentGateway: paymentProcessor.ID,
            paymentMethod: paymentInstrument.getPaymentMethod(),
            transactionId: paymentTransaction.transactionID,
            currency: paymentTransaction.amount.currencyCode,
            avsResponseCode: '',
            cvvResponseCode: '',
            orderChannel: '',
            totalPrice: order.getTotalGrossPrice().value,
            products: getProducts(order.productLineItems),
            shipments: getShipments(order.shipments),
            orderSessionId: order.custom.SignifydOrderSessionId
        },
        recipient: getRecipient(order.shipments[0], order.customerEmail),
        card: {
            cardHolderName: paymentInstrument.creditCardHolder,
            bin: '',
            last4: paymentInstrument.creditCardNumberLastDigits,
            expiryMonth: paymentInstrument.creditCardExpirationMonth,
            expiryYear: paymentInstrument.creditCardExpirationYear,
            billingAddress: {
                streetAddress: order.billingAddress.address1,
                unit: order.billingAddress.address2,
                city: order.billingAddress.city,
                provinceCode: order.billingAddress.stateCode,
                postalCode: order.billingAddress.postalCode,
                countryCode: order.billingAddress.countryCode.value
            }
        },
        userAccount: getUser(order),
        seller: {}, // getSeller()
        platformAndClient: getPlatform()
    };
}


// eslint-disable-next-line valid-jsdoc
/**
 * Send Signifyd order info and
 * store case id as an attribute of order in DW.
 *
 * @param {Object} - Order that just have been placed.
 * @returns  {number} on error.
 */
exports.Call = function (order) {
    if (EnableCartridge) {
        if (order && order.currentOrderNo) {
            Logger.getLogger('Signifyd', 'signifyd').info('Info: API call for order {0}', order.currentOrderNo);
            var params = getParams(order);
            Logger.getLogger('Signifyd', 'signifyd').debug('Debug: API call body: {0}', JSON.stringify(params));
            var service = signifydInit.createCase();
            if (service) {
                try {
                    saveRetryCount(order);
                    var result = service.call(params);
                    if (result.ok) {
                        var answer = JSON.parse(result.object);
                        var caseId = answer.investigationId;
                        Transaction.wrap(function () {
                            // eslint-disable-next-line no-param-reassign
                            order.custom.SignifydCaseID = caseId;
                        });
                        return caseId;
                    }
                    Logger.getLogger('Signifyd', 'signifyd').error('Error: {0} : {1}', result.error, JSON.parse(result.errorMessage).message);
                } catch (e) {
                    Logger.getLogger('Signifyd', 'signifyd').error('Error: API Call was interrupted unexpectedly. Exception: {0}', e.message);
                }
            } else {
                Logger.getLogger('Signifyd', 'signifyd').error('Error: Service Please provide correct order for Call method');
            }
        } else {
            Logger.getLogger('Signifyd', 'signifyd').error('Error: Please provide correct order for Call method');
        }
    }

    return 0;
};

exports.setOrderSessionId = setOrderSessionId;
exports.getOrderSessionId = getOrderSessionId;
exports.getSeler = getSeller;
