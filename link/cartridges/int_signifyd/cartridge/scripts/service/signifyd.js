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
var Shipment = require('dw/order/Shipment');
var Resource = require('dw/web/Resource');


/**
 * Get information about the SFCC version
 * @return {Object} - json describing the version
 */
function getMerchantPlatform() {
    return {
        name: 'Salesforce Commerce Cloud',
        version: String(System.getCompatibilityMode()) // returns a string with the platform version: 1602
    };
}

/**
 * Get information about the Signifyd Client version
 * @return {Object} - json describing the version
 */
function getSignifydClient() {
    return {
        application: 'Salesforce Commerce Cloud',
        version: Resource.msg('signifyd.version.text', 'signifyd_version', null) // Github version
    };
}

// eslint-disable-next-line valid-jsdoc
/**
 * Get Information about customer in JSON format
 * acceptable on Stringifyd side
 *
 * @param {dw.order.Shipment} shipment to be verifyed
 * @param {String} email: String from order propertie
 * @return {Array}  Array of json objects for each recipient.
 */
function getRecipient(shipments, email) {
    var recipients = [];

    if (!empty(shipments)) {
        var iterator = shipments.iterator();
        while (iterator.hasNext()) {
            var shipment = iterator.next();
            recipients.push({
                fullName: shipment.shippingAddress.fullName,
                confirmationEmail: email,
                confirmationPhone: shipment.shippingAddress.phone,
                organization: shipment.shippingAddress.companyName,
                shipmentId: shipment.shipmentNo,
                deliveryAddress: {
                    streetAddress: shipment.shippingAddress.address1,
                    unit: shipment.shippingAddress.address2,
                    city: shipment.shippingAddress.city,
                    provinceCode: shipment.shippingAddress.stateCode,
                    postalCode: shipment.shippingAddress.postalCode,
                    countryCode: shipment.shippingAddress.countryCode.value
                }
            });
        }
    }

    return recipients;
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
            destination: {
                fullName: shipment.shippingAddress.getFullName(),
                address: {
                    streetAddress: shipment.shippingAddress.address1,
                    unit: shipment.shippingAddress.address2,
                    postalCode: shipment.shippingAddress.postalCode,
                    city: shipment.shippingAddress.city,
                    provinceCode: shipment.shippingAddress.stateCode,
                    countryCode: shipment.shippingAddress.countryCode.value
                }
            },
            shipmentId: shipment.shipmentNo,
            // fulfillmentMethod: '', // To be updated by the merchant
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
            lastUpdateDate: StringUtils.formatCalendar(updateCal, "yyyy-MM-dd'T'HH:mm:ssZ"),
            aggregateOrderCount: order.customer.activeData.getOrders(),
            aggregateOrderDollars: order.customer.activeData.getOrderValue(),
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
        var primaryCat = product.product.getPrimaryCategory();

        // get master product's primary category if variant doesn't have one
        if (empty(primaryCat) && !product.product.isMaster()) {
            primaryCat = product.product.masterProduct.getPrimaryCategory();
        }
        var parentCat = !empty(primaryCat) ? primaryCat.getParent() : null;

        result.push({
            itemId: product.productID,
            itemName: product.productName,
            itemUrl: URLUtils.abs('Product-Show', 'pid', product.productID).toString(),
            itemQuantity: product.quantityValue,
            itemPrice: product.grossPrice.value,
            itemSubCategory: !empty(primaryCat) ? primaryCat.ID : null,
            itemCategory: !empty(parentCat) ? parentCat.ID : (!empty(primaryCat) ? primaryCat.ID : null),
            itemImage: product.product.getImage('large', 0).getAbsURL().toString(),
            shipmentId: product.shipment.shipmentNo,
            itemIsDigital: false // to be updated by the merchant in case of digital item
        });
    }
    return result;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Get Main Payment Instrument. It's the first credit card payment instrument,
 * If not available, the first payment instrument is returned
 *
 * @param {dw.util.Collection} paymentInstruments collection of PaymentInstruments on order
 * @return {dw.order.PaymentInstrument} main payment instrument
 */
function getMainPaymentInst(paymentInstruments) {
    var creditCardPaymentInst = null;
    var firstPaymentInst = null;
    if (!empty(paymentInstruments)) {
        var iterator = paymentInstruments.iterator();
        firstPaymentInst = paymentInstruments[0];

        while (iterator.hasNext() && empty(creditCardPaymentInst)) {
            var paymentInst = iterator.next();
            if (paymentInst.getPaymentMethod() === dw.order.PaymentInstrument.METHOD_CREDIT_CARD) {
                creditCardPaymentInst = paymentInst;
            }
        }
    }

    if (!empty(creditCardPaymentInst)) {
        return creditCardPaymentInst;
    } else {
        return firstPaymentInst;
    }
}

/**
 * Get Credit Card Bin. It's the first 6 digits of the credit card number,
 * If not available, null is returned
 *
 * @param {dw.order.PaymentInstrument} mainPaymentInst main payment instrument on order
 * @return {String} credit card bin or null
 */
function getCardBin(mainPaymentInst) {
    var cardBin = null;
    try {
        if (!empty(mainPaymentInst.getCreditCardNumber()) && mainPaymentInst.getCreditCardNumber().indexOf("*") < 0) {
            cardBin = mainPaymentInst.getCreditCardNumber().substring(0, 6);
        } else if (!empty(session.forms.billing.creditCardFields) &&
            !empty(session.forms.billing.creditCardFields.cardNumber) && !empty(session.forms.billing.creditCardFields.cardNumber.value)) {
            cardBin = session.forms.billing.creditCardFields.cardNumber.value.substring(0, 6);
        }
    } catch (e) {
        Logger.getLogger('Signifyd', 'signifyd').error('Error: Error while getting credit card bin number: {0}', e.message);
    }
    return cardBin;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Get Discount Codes array, which are the coupon codes applied to the order
 *
 * @param {dw.util.Collection} couponLineItems collection of CouponLineItems on order
 * @return {Array} coupon codes and discount amount/percentage
 */
function getDiscountCodes(couponLineItems) {
    var discountCodes = [];
    if (!empty(couponLineItems)) {
        var iterator = couponLineItems.iterator();

        while (iterator.hasNext()) {
            var coupon = iterator.next();
            var priceAdjustments = coupon.getPriceAdjustments().iterator();
            var discountAmount = null;
            var discountPercentage = null;

            while (priceAdjustments.hasNext() && empty(discountAmount) && empty(discountPercentage)) {
                var priceAdj = priceAdjustments.next();
                var discount = priceAdj.getAppliedDiscount();

                if (discount.getType() === dw.campaign.Discount.TYPE_AMOUNT) {
                    discountAmount = discount.getAmount();
                } else if (discount.getType() === dw.campaign.Discount.TYPE_PERCENTAGE) {
                    discountPercentage = discount.getPercentage();
                }
            }

            discountCodes.push({
                amount: discountAmount,
                percentage: discountPercentage,
                code: coupon.getCouponCode()
            });
        }
    }
    return discountCodes;
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
    if (checkPaymentMethodExclusion(order)) {
        var receivedScore = body.decision.score.toString();
        var roundScore = receivedScore;
        if (receivedScore.indexOf('.') >= 0) {
            roundScore = receivedScore.substring(0, receivedScore.indexOf('.'));
        }
        var score = Number(roundScore);
        if (order) {
            Transaction.wrap(function () {
                var orderUrl;
                var modifiedUrl = 'https://www.signifyd.com/cases/' + body.signifydId;
                order.custom.SignifydOrderURL = modifiedUrl;
                order.custom.SignifydFraudScore = score;
                if (body.decision.checkpointAction) {
                    if (body.decision.checkpointAction.toUpperCase() === 'ACCEPT') {
                        order.custom.SignifydPolicy = 'accept';
                        order.setExportStatus(order.EXPORT_STATUS_READY);
                    } else if (body.decision.checkpointAction.toUpperCase() === 'REJECT') {
                        order.custom.SignifydPolicy = 'reject';
                    } else {
                        order.custom.SignifydPolicy = 'hold';
                    }
    
                    order.custom.SignifydPolicyName = body.decision.checkpointActionReason || '';
    
                    if (HoldBySignified) { //processing is enabled in site preferences
                        if (body.decision.checkpointAction.toUpperCase() != 'ACCEPT') {
                            order.exportStatus = 0; //NOTEXPORTED
                        } else {
                            order.exportStatus = 2; //Ready to export
                        }
                    }
                }
            });
        } else {
            Logger.getLogger('Signifyd', 'signifyd').error('An error===>>>: There is no order with ID = {0}', body.orderId);
        }
    } else {
        Logger.getLogger('Signifyd', 'signifyd').error('Warn===>>>: Payment method exclusion found, order will not be processed');
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
            var hmacKey = headers.get('signifyd-sec-hmac-sha256');
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
            response.setStatus(500);
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
 function getParams(order, postAuthFallback) {
    var SignifydCreateCasePolicy = dw.system.Site.getCurrent().getCustomPreferenceValue('SignifydCreateCasePolicy').value;
    var SignifydCoverageRequest = dw.system.Site.getCurrent().getCustomPreferenceValue('SignifydCoverageRequest').value;
    var SignifydPassiveMode = dw.system.Site.getCurrent().getCustomPreferenceValue('SignifydPassiveMode');
    var SignifydSCAEnableSCAEvaluation = dw.system.Site.getCurrent().getCustomPreferenceValue('SignifydSCAEnableSCAEvaluation');
    var orderCreationCal = new Calendar(order.creationDate);
    var paramsObj = {
        device: {
            clientIpAddress: order.remoteHost,
            sessionId: order.custom.SignifydOrderSessionId
        },
        merchantPlatform: getMerchantPlatform(),
        signifydClient: getSignifydClient(),
        transactions: [],
        orderId: order.currentOrderNo,
        purchase: {
            createdAt: StringUtils.formatCalendar(orderCreationCal, "yyyy-MM-dd'T'HH:mm:ssZ"),
            orderChannel: "", // to be updated by the merchant
            totalPrice: order.getTotalGrossPrice().value,
            currency: dw.system.Site.getCurrent().getDefaultCurrency(),
            confirmationEmail: order.getCustomerEmail(),
            products: getProducts(order.productLineItems),
            shipments: getShipments(order.shipments),
            confirmationPhone: order.getDefaultShipment().shippingAddress.phone,
            totalShippingCost: order.getShippingTotalGrossPrice().value,
            discountCodes: getDiscountCodes(order.getCouponLineItems()),
            receivedBy: order.createdBy !== 'Customer' ? order.createdBy : null
        },
        userAccount: getUser(order),
        coverageRequests: SignifydCoverageRequest
    };

    if (SignifydCreateCasePolicy === "PRE_AUTH" && !postAuthFallback) {
        paramsObj.checkoutId = order.getUUID();
        if (SignifydSCAEnableSCAEvaluation && checkSCAPaymentMethod(order)) {
            paramsObj.additionalEvalRequests = ["SCA_EVALUATION"];
        }
    }

    if (SignifydPassiveMode) {
        paramsObj.tags = ["Passive Mode"];
    }

    // add payment instrument related fields
    var mainPaymentInst = getMainPaymentInst(order.getPaymentInstruments());
    if (!empty(mainPaymentInst)) {
        var mainTransaction = mainPaymentInst.getPaymentTransaction();
        var mainPaymentProcessor = mainTransaction.getPaymentProcessor();
        var transactionCreationCal = new Calendar(mainTransaction.getCreationDate());

        paramsObj.purchase.currency = mainTransaction.amount.currencyCode;
        paramsObj.transactions = [{
            paymentMethod: mainPaymentInst.getPaymentMethod(),
            checkoutPaymentDetails: {
                billingAddress: {
                    streetAddress: order.billingAddress.address1,
                    unit: order.billingAddress.address2,
                    city: order.billingAddress.city,
                    provinceCode: order.billingAddress.stateCode,
                    postalCode: order.billingAddress.postalCode,
                    countryCode: order.billingAddress.countryCode.value
                },
                accountHolderName: mainPaymentInst.creditCardHolder,
                accountLast4: mainPaymentInst.getBankAccountNumberLastDigits(),
                cardToken: mainPaymentInst.getCreditCardToken(),
                cardBin: getCardBin(mainPaymentInst),
                cardExpiryMonth: mainPaymentInst.creditCardExpirationMonth,
                cardExpiryYear: mainPaymentInst.creditCardExpirationYear,
                cardLast4: mainPaymentInst.creditCardNumberLastDigits,
                cardBrand: mainPaymentInst.creditCardType
            },
            amount: mainTransaction.amount.value,
            currency: mainTransaction.amount.currencyCode,
            gateway: mainPaymentProcessor ? mainPaymentProcessor.ID : null
        }];

        if (SignifydCreateCasePolicy === "POST_AUTH" || postAuthFallback) {
            paramsObj.transactions[0].transactionId = mainTransaction.transactionID;
            paramsObj.transactions[0].gatewayStatusCode = ""; // to be updated by the merchant
            paramsObj.transactions[0].paymentMethod = mainPaymentProcessor.ID;
            paramsObj.transactions[0].verifications = {
                avsResponseCode: '', // to be updated by the merchant
                cvvResponseCode: '', // to be updated by the merchant
            };
        }
    }

    return paramsObj;
}

/**
 * Converts an Order into JSON format
 * acceptable on Stringifyd side
 *
 * @param {order} order Order that just have been placed.
 * @return {result} the json objects describes Order.
 */

function getSendTransactionParams(order) {
    var SignifydCreateCasePolicy = dw.system.Site.getCurrent().getCustomPreferenceValue('SignifydCreateCasePolicy').value;
    var cal = new Calendar(order.creationDate);
    var paymentInstruments = order.allProductLineItems[0].lineItemCtnr.getPaymentInstruments();
    var paymentTransaction = paymentInstruments[0].getPaymentTransaction();
    var paymentInstrument = paymentTransaction.getPaymentInstrument();
    var paymentProcessor = paymentTransaction.getPaymentProcessor();
    var mainPaymentInst = getMainPaymentInst(order.getPaymentInstruments());
    var mainTransaction = mainPaymentInst.getPaymentTransaction();
    var mainPaymentProcessor = mainTransaction.getPaymentProcessor();
    var paramsObj = {
        transactions: [{
            transactionId: paymentTransaction.transactionID,
            gatewayStatusCode: '', // to be updated by the merchant
            paymentMethod: paymentInstrument.getPaymentMethod(),
            amount: paymentTransaction.amount.value,
            currency: paymentTransaction.amount.currencyCode,
            createdAt: StringUtils.formatCalendar(cal, "yyyy-MM-dd'T'HH:mm:ssZ"),
            verifications: {
                avsResponseCode: '', // to be updated by the merchant
                cvvResponseCode: '', // to be updated by the merchant
            },
            acquirerDetails: null, // to be updated by the merchant if using SCA
            threeDsResult: null,  // to be updated by the merchant if using SCA
            // uncomment line below if using SCA
            // scaExemptionRequested: order.custom.SignifydExemption
        }],
    };

    if (!empty(mainPaymentInst)) {
        if (SignifydCreateCasePolicy === "PRE_AUTH") {
            paramsObj.checkoutId = order.getUUID();
        }
        paramsObj.orderId = order.currentOrderNo;

        paramsObj.transactions[0].checkoutPaymentDetails = {
            billingAddress: {
                streetAddress: order.billingAddress.address1,
                unit: order.billingAddress.address2,
                city: order.billingAddress.city,
                provinceCode: order.billingAddress.stateCode,
                postalCode: order.billingAddress.postalCode,
                countryCode: order.billingAddress.countryCode.value
            },
            accountHolderName: mainPaymentInst.creditCardHolder,
            accountLast4: mainPaymentInst.getBankAccountNumberLastDigits(),
            cardToken: mainPaymentInst.getCreditCardToken(),
            cardBin: getCardBin(mainPaymentInst),
            cardExpiryMonth: mainPaymentInst.creditCardExpirationMonth,
            cardExpiryYear: mainPaymentInst.creditCardExpirationYear,
            cardLast4: mainPaymentInst.creditCardNumberLastDigits,
            cardBrand: mainPaymentInst.creditCardType
        }
    }

    if (!empty(mainPaymentProcessor)) {
        paramsObj.transactions[0].gateway = mainPaymentProcessor.ID;
    }

    return paramsObj;
}

function checkPaymentMethodExclusion(order) {
    var paymentMethodExclusion = Site.getCurrent().getCustomPreferenceValue('SignifydPaymentMethodExclusion');
    var paymentMethodExclusionArray = paymentMethodExclusion ? paymentMethodExclusion : "";
    var paymentInstruments = order.getPaymentInstruments();
    var result;

    var iterator = paymentInstruments.iterator();
    while(iterator.hasNext()) {
        var paymentInstrument = iterator.next();
        result = paymentMethodExclusionArray.indexOf(paymentInstrument.paymentMethod) > -1;
        if (result) {
            Transaction.wrap(function () {
                order.custom.SignifydPaymentMethodExclusionFlag = true;
            });
            break;
        } else {
            Transaction.wrap(function () {
                order.custom.SignifydPaymentMethodExclusionFlag = false;
            });
            break;
        }
    }

    return !result;
}

function checkSCAPaymentMethod(order) {
    var signifydSCAPaymentMethods = Site.getCurrent().getCustomPreferenceValue('SignifydSCAPaymentMethods');
    var signifydSCAPaymentMethodsArray = signifydSCAPaymentMethods ? signifydSCAPaymentMethods : "";
    var paymentInstruments = order.getPaymentInstruments();
    var result;

    var iterator = paymentInstruments.iterator();
    while(iterator.hasNext()) {
        var paymentInstrument = iterator.next();
        result = signifydSCAPaymentMethodsArray.indexOf(paymentInstrument.paymentMethod) > -1;
    }

    return result;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Send Signifyd order info and
 *
 * @param {Object} - Order that just have been placed.
 * @returns  {number} on error.
 */
 exports.SendTransaction = function (order) {
    if (EnableCartridge && checkPaymentMethodExclusion(order)) {
        if (order && order.currentOrderNo) {
            Logger.getLogger('Signifyd', 'signifyd').info('Info: API call for order {0}', order.currentOrderNo);
            var params = getSendTransactionParams(order);
            Logger.getLogger('Signifyd', 'signifyd').debug('Debug: API call body: {0}', JSON.stringify(params));
            var service = signifydInit.transaction();

            if (service) {
                try {
                    var result = service.call(params);
                } catch (e) {
                    Logger.getLogger('Signifyd', 'signifyd').error('Error: API the SendTransaction was interrupted unexpectedly. Exception: {0}', e.message);
                }
            } else {
                Logger.getLogger('Signifyd', 'signifyd').error('Error: Service Please provide correct order for the SendTransaction method');
            }
        } else {
            Logger.getLogger('Signifyd', 'signifyd').error('Error: Please provide correct order for the SendTransaction method');
        }
    }

    return 0;
};


// eslint-disable-next-line valid-jsdoc
/**
 * Send Signifyd order info and
 * store case id as an attribute of order in DW.
 *
 * @param {Object} - Order that just have been placed.
 * @returns  {Object} - Object containing the case id and the error status.
 */
exports.Call = function (order, postAuthFallback) {
    var returnObj = {};
    var declined = false;

    if (EnableCartridge && checkPaymentMethodExclusion(order) && order.getStatus() != order.ORDER_STATUS_FAILED) {
        if (order && order.currentOrderNo) {
            var SignifydCreateCasePolicy = dw.system.Site.getCurrent().getCustomPreferenceValue('SignifydCreateCasePolicy').value;
            var service;

            Logger.getLogger('Signifyd', 'signifyd').info('Info: API call for order {0}', order.currentOrderNo);

            var params = getParams(order, postAuthFallback);

            Logger.getLogger('Signifyd', 'signifyd').debug('Debug: API call body: {0}', JSON.stringify(params));

            if (SignifydCreateCasePolicy === "PRE_AUTH" && !postAuthFallback) {
                service = signifydInit.checkout();
            } else {
                service = signifydInit.sale();
            }

            if (service) {
                try {
                    saveRetryCount(order);
                    var result = service.call(params);
                    returnObj.ok = result.ok;

                    if (result.ok) {
                        var answer = JSON.parse(result.object);

                        if (answer.decision && answer.decision.checkpointAction === "REJECT") {
                            declined = true;
                        }

                        Transaction.wrap(function () {
                            order.custom.SignifydCaseID = String(answer.signifydId);
                            if (SignifydCreateCasePolicy === "PRE_AUTH" && !postAuthFallback) {
                                var orderUrl = 'https://www.signifyd.com/cases/' + answer.signifydId;

                                order.custom.SignifydOrderURL = orderUrl;
                                order.custom.SignifydFraudScore = answer.decision.score;
                                order.custom.SignifydPolicy = answer.decision.checkpointAction;
                                order.custom.SignifydPolicyName = answer.decision.checkpointActionReason;

                                if (!empty(answer.scaEvaluation)) {
                                    if (!empty(answer.scaEvaluation.outcome)) {
                                        order.custom.SignifydSCAOutcome = answer.scaEvaluation.outcome;
                                    }
                                    if (!empty(answer.scaEvaluation.exemptionDetails)) {
                                        order.custom.SignifydExemption = answer.scaEvaluation.exemptionDetails.exemption;
                                    }
                                    if (!empty(answer.scaEvaluation.exemptionDetails)) {
                                        order.custom.SignifydPlacement = answer.scaEvaluation.exemptionDetails.placement;
                                    }
                                }
                            }
                        });

                        returnObj.caseId = answer.signifydId;
                        returnObj.declined = declined;

                        return returnObj;
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

    return returnObj;
};

function getproductLineItems(productLineItems) {
    var products = [];

    if (!empty(productLineItems)) {
        var iterator = productLineItems.iterator();
        while (iterator.hasNext()) {
            var product = iterator.next();
            products.push({
                itemName: product.lineItemText,
                itemQuantity: product.quantity.value
            });
        }
    }

    return products;
}

function getDeliveryAddress(shipment) {
    var deliveryAddress = {
        streetAddress: shipment.shippingAddress.address1,
                streetAddress: shipment.shippingAddress.address1, 
        streetAddress: shipment.shippingAddress.address1,
        unit: shipment.shippingAddress.address2 || "",
        city: shipment.shippingAddress.city,
        provinceCode: "" ,
        postalCode: shipment.shippingAddress.postalCode ,
        countryCode: shipment.shippingAddress.countryCode.value
    };

    return deliveryAddress;
}

function getSendFulfillmentParams(order) {
    var fulfillmentStatus = order.getShippingStatus().displayValue === "PARTSHIPPED" ? "PARTIAL" : "COMPLETE";
    var shipments = order.getShipments();

    var paramsObj = {
        orderId: order.orderNo,
        fulfillmentStatus: fulfillmentStatus,
        fulfillments: []
    };

    var iterator = shipments.iterator();
    while (iterator.hasNext()) {
        var shipment = iterator.next();
        paramsObj.fulfillments.push({
            shipmentId: shipment.shipmentNo,
            // shipmentStatus: '', // to be updated by the merchant
            // trackingUrls: '', // to be updated by the merchant
            // trackingNumbers: '', // to be updated by the merchant
            // carrier: '', // to be updated by the merchant
            products: getproductLineItems(shipment.productLineItems),
            destination: {
                fullName: shipment.shippingAddress.fullName,
                organization: shipment.shippingAddress.companyName,
                address: getDeliveryAddress(shipment),
                confirmationPhone: shipment.shippingAddress.phone
            }
        });
    }

    return paramsObj;
}

function sendFulfillment(order) {
    if (EnableCartridge && checkPaymentMethodExclusion(order)) {
        if (order && order.currentOrderNo) {
            try {
                var params = getSendFulfillmentParams(order);
                var service = signifydInit.sendFulfillment();

                if (service) {
                    Logger.getLogger('Signifyd', 'signifyd').info('Info: SendFulfillment API call for order {0}', order.currentOrderNo);

                    var result = service.call(params);

                    if (!result.ok) {
                        Logger.getLogger('Signifyd', 'signifyd').error('Error: SendFulfillment API call for order {0} has failed.', order.currentOrderNo);
                    } else {
                        Logger.getLogger('Signifyd', 'signifyd').info('OK: SendFulfillment API call for order {0} has succeed.', order.currentOrderNo);
                    }

                    return {
                        success: result.ok || "false",
                        object: result.object,
                        error: result.errorMessage
                    };
                } else {
                    Logger.getLogger('Signifyd', 'signifyd').error('Error: Could not initialize SendFulfillment service.');
                }
            } catch (e) {
                Logger.getLogger('Signifyd', 'signifyd').error('Error: SendFulfillment method was interrupted unexpectedly. Exception: {0}', e.message);
            }
        } else {
            Logger.getLogger('Signifyd', 'signifyd').error('Error: Please provide correct order for the SendFulfillment method');
        }
    }
};

function getSendRerouteParams(order) {
    var orderShipments = order.getShipments();
    var shipments = [];

    if (!empty(orderShipments)) {
        var iterator = orderShipments.iterator();
        while (iterator.hasNext()) {
            var shipment = iterator.next();
            shipments.push({
                shipmentId: shipment.shipmentNo,
                destination: {
                    fullName: shipment.shippingAddress.fullName,
                    organization: shipment.shippingAddress.companyName,
                    address: {
                        streetAddress: shipment.shippingAddress.address1,
                        unit: shipment.shippingAddress.address2,
                        city: shipment.shippingAddress.city,
                        provinceCode: shipment.shippingAddress.stateCode,
                        postalCode: shipment.shippingAddress.postalCode,
                        countryCode: shipment.shippingAddress.countryCode.value
                    }
                }
            });
        }
    }

    var paramsObj = {
        orderId: order.orderNo,
        shipments: shipments
    }

    return paramsObj;
}

function sendReroute(orderId) {
    var order = OrderMgr.getOrder(orderId);

    if (EnableCartridge) {
        if (order && order.currentOrderNo) {
            try {
                var params = getSendRerouteParams(order);
                var service = signifydInit.sendReroute();

                if (service) {
                    Logger.getLogger('Signifyd', 'signifyd').info('Info: SendReroute API call for order {0}', order.currentOrderNo);

                    var result = service.call(params);

                    if (!result.ok) {
                        Logger.getLogger('Signifyd', 'signifyd').error('Error: SendReroute API call for order {0} has failed.', order.currentOrderNo);
                    } else {
                        Logger.getLogger('Signifyd', 'signifyd').info('OK: SendReroute API call for order {0} has succeed.', order.currentOrderNo);
                    }

                    return {
                        success: result.ok || "false",
                        object: result.object,
                        error: result.errorMessage
                    };
                } else {
                    Logger.getLogger('Signifyd', 'signifyd').error('Error: Could not initialize SendReroute service.');
                }
            } catch (e) {
                Logger.getLogger('Signifyd', 'signifyd').error('Error: SendReroute method was interrupted unexpectedly. Exception: {0}', e.message);
            }
        } else {
            Logger.getLogger('Signifyd', 'signifyd').error('Error: Please provide correct order for the SendReroute method');
        }
    }
};

exports.setOrderSessionId = setOrderSessionId;
exports.getOrderSessionId = getOrderSessionId;
exports.getSeler = getSeller;
exports.sendFulfillment = sendFulfillment;
exports.sendReroute = sendReroute;
