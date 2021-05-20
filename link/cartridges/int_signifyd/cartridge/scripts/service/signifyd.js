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
            // TODO:
            // shipmentId
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
            // SIG-11 TODO: add:
            // lastOrderId
            // aggregateOrderCount
            // aggregateOrderDollars
            // rating (marketplace)
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
            // SIG-11 TODO: add missing:
            // shipmentId
            // itemIsDigital
            // itemCategory
            // itemSubCategory
            // itemImage
            // itemWeight
            // sellerAccountNumber
            // subscription (optional?)
        });
    }
    return result;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Get Checkout Token, which is the credit payment instrument unique ID
 * acceptable on Stringifyd side
 *
 * @param {dw.util.Collection} paymentInstruments collection of PaymentInstruments on order
 * @return {String} credit card payment instrument unique ID
 */
function getCheckoutToken(paymentInstruments) {
    var checkoutToken = '';
    if (!empty(paymentInstruments)) {
        var iterator = paymentInstruments.iterator();

        while (iterator.hasNext() && empty(checkoutToken)) {
            var paymentInst = iterator.next();
            if (paymentInst.getPaymentMethod() === dw.order.PaymentInstrument.METHOD_CREDIT_CARD) {
                checkoutToken = paymentInst.UUID;
            }
        }
    }
    return checkoutToken;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Get Checkout Token, which is the credit payment instrument unique ID
 * acceptable on Stringifyd side
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
    // TODO: change to methods instead of getting the attribute directly whenever possible
    // please review and compare with documentation for CreateCase, because there was another ticket that changed a lot of this
    return {
        purchase: {
            // SIG-11 TODO: add missing
            orderId: order.currentOrderNo,
            orderSessionId: order.custom.SignifydOrderSessionId,
            checkoutToken: getCheckoutToken(order.getPaymentInstruments()), // TODO: test with gift certificate too
            browserIpAddress: order.remoteHost,
            discountCodes: getDiscountCodes(order.getCouponLineItems()),
            shipments: getShipments(order.shipments),
            products: getProducts(order.productLineItems),
            createdAt: StringUtils.formatCalendar(cal, "yyyy-MM-dd'T'HH:mm:ssZ"),
            currency: paymentTransaction.amount.currencyCode,
            orderChannel: '',
            receivedBy: order.createdBy !== 'Customer' ? order.createdBy : '',
            totalPrice: order.getTotalGrossPrice().value
            // SIG-11 TODO: review and remove extras (paymentGateway, paymentMethod, transactionId, avsResponseCode, cvvResponseCode)
            // compare with documentation
            // paymentGateway: paymentProcessor.ID,
            // paymentMethod: paymentInstrument.getPaymentMethod(),
            // transactionId: paymentTransaction.transactionID,
            // avsResponseCode: '',
            // cvvResponseCode: '',
        },
        recipient: getRecipient(order.getShipments(), order.customerEmail),
        // SIG-11 TODO: remove
        // card: {
        //     cardHolderName: paymentInstrument.creditCardHolder,
        //     bin: '',
        //     last4: paymentInstrument.creditCardNumberLastDigits,
        //     expiryMonth: paymentInstrument.creditCardExpirationMonth,
        //     expiryYear: paymentInstrument.creditCardExpirationYear,
        //     billingAddress: {
        //         streetAddress: order.billingAddress.address1,
        //         unit: order.billingAddress.address2,
        //         city: order.billingAddress.city,
        //         provinceCode: order.billingAddress.stateCode,
        //         postalCode: order.billingAddress.postalCode,
        //         countryCode: order.billingAddress.countryCode.value
        //     }
        // },
        transaction: {
            // SIG-11 TODO: add
            // parentTransactionId FIXME:
            // transactionId = paymentTransaction.transactionID
            // createdAt = transaction object creation date
            // gateway = paymentProcessor.ID
            // paymentMethod = paymentInstrument.getPaymentMethod()
            // type FIXME: paymentTransaction.type?
            // gatewayStatusCode FIXME:
            // gatewayStatusMessage FIXME:
            // gatewayErrorCode FIXME:
            // currency = paymentTransaction.amount.currencyCode
            // amount = paymentTransaction.amount
            // avsResponseCode = "Y"
            // cvvResponseCode = "M"
            // paypalPendingReasonCode FIXME:
            // paypalProtectionEligibility FIXME:
            // paypalProtectionEligibilityType FIXME:
            // checkoutPaymentDetails: {
            //     holderName = paymentInstrument.creditCardHolder
            //     cardBin
            //     cardLast4 = paymentInstrument.creditCardNumberLastDigits
            //     cardExpiryMonth = paymentInstrument.creditCardExpirationMonth  
            //     cardExpiryYear = paymentInstrument.creditCardExpirationYear
            //     bankAccountNumber = paymentInstrument.getBankAccountNumber()
            //     bankRoutingNumber = paymentInstrument.getBankRoutingNumber()
            //     "billingAddress": {
            //         "streetAddress": order.billingAddress.address1,
            //         "unit": order.billingAddress.address2,
            //         "city": order.billingAddress.city,
            //         "provinceCode": order.billingAddress.stateCode,
            //         "postalCode": order.billingAddress.postalCode,
            //         "countryCode": order.billingAddress.countryCode.value,
            //     }
            // }
            // paymentAccountHolder : {
                // accountCreatedAt
                // accountId
                // accountHolderName
                // accountHolderPhone
                // accountHolderEmail
                // accountHolderDob
                // accountHolderAnnualIncome
                // accountIsVerified
                // accountIsActive
                // accountCreditLine
                // accountBalance
                // "billingAddress": {
                //         "streetAddress": order.billingAddress.address1,
                //         "unit": order.billingAddress.address2,
                //         "city": order.billingAddress.city,
                //         "provinceCode": order.billingAddress.stateCode,
                //         "postalCode": order.billingAddress.postalCode,
                //         "countryCode": order.billingAddress.countryCode.value,
                //     }
                // }
            // }
            // bankAuthCode FIXME:
            // verifications : {
            //     avsResponseCode = "Y"
            //     cvvResponseCode = "M"
            //     avsResponse : {
            //         addressMatchCode
            //         zipMatchCode
            //     }
            // }
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
