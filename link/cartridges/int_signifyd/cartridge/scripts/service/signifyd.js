'use strict';

var Site = require('dw/system/Site');
var enableCartridge = Site.getCurrent().getCustomPreferenceValue('SignifydEnableCartridge');
var Logger = require('dw/system/Logger');
var Transaction = require('dw/system/Transaction');
var URLUtils = require('dw/web/URLUtils');
var Calendar = require('dw/util/Calendar');
var StringUtils = require('dw/util/StringUtils');
var signifydService = require('int_signifyd/cartridge/scripts/service/signifydInit');
var collections = require('*/cartridge/scripts/util/collections');

/**
 * Sends Signifyd order information and stores the case ID as an attribute of the order in Salesforce Commerce Cloud.
 *
 * @param {dw.order.Order} order - The order that has just been placed.
 * @param {boolean} postAuthFallback - Indicates if post-auth fallback is enabled.
 * @returns {Object} An object containing the case ID and the declined status.
 */
exports.Call = function (order, postAuthFallback) {
    var returnObj = { caseId: null, declined: false };

    if (!enableCartridge) {
        addCustomLog('info', 'Cartridge is disabled, skipping Call.', null);
        return returnObj;
    }

    if (!order || !order.currentOrderNo) {
        addCustomLog('error', 'Invalid order object for the Call method.', null);
        return returnObj;
    }

    if (!checkPaymentMethodExclusion(order)) {
        addCustomLog('info', 'Payment method exclusion found, order will not be processed.', order);
        return returnObj;
    }

    try {
        var SignifydCreateCasePolicy = Site.getCurrent().getCustomPreferenceValue('SignifydCreateCasePolicy').value;
        var params = getParams(order, postAuthFallback);

        addCustomLog('info', 'API call for order ' + order.currentOrderNo, order);
        addCustomLog('debug', 'API call body: ' + JSON.stringify(params), order);

        var service = (SignifydCreateCasePolicy === 'PRE_AUTH' && !postAuthFallback) ? signifydService.checkout() : signifydService.sale();

        if (!service) {
            addCustomLog('error', 'Service initialization failed. Please ensure the service is configured correctly.', order);
            return returnObj;
        }

        saveRetryCount(order);
        var result = service.call(params);

        if (result.ok) {
            var answer = JSON.parse(result.object);

            if (answer.decision && answer.decision.checkpointAction === 'REJECT') {
                returnObj.declined = true;
            }

            Transaction.wrap(function () {
                order.custom.SignifydCaseID = String(answer.signifydId);
                if (SignifydCreateCasePolicy === 'PRE_AUTH' && !postAuthFallback) {
                    order.custom.SignifydOrderURL = 'https://www.signifyd.com/cases/' + answer.signifydId;
                    order.custom.SignifydFraudScore = answer.decision.score;
                    order.custom.SignifydPolicy = answer.decision.checkpointAction;
                    order.custom.SignifydPolicyName = answer.decision.checkpointActionReason;

                    if (!empty(answer.scaEvaluation)) {
                        if (!empty(answer.scaEvaluation.outcome)) {
                            order.custom.SignifydSCAOutcome = answer.scaEvaluation.outcome;
                        }
                        if (!empty(answer.scaEvaluation.exemptionDetails)) {
                            order.custom.SignifydExemption = answer.scaEvaluation.exemptionDetails.exemption;
                            order.custom.SignifydPlacement = answer.scaEvaluation.exemptionDetails.placement;
                        }
                    }
                }
            });

            returnObj.caseId = answer.signifydId;
            addCustomLog('info', 'API call succeeded for order ' + order.currentOrderNo, order);
        } else {
            addCustomLog('error', 'API call failed: ' + result.errorMessage, order);
        }
    } catch (e) {
        addCustomLog('error', 'API Call was interrupted unexpectedly. Exception: ' + e.message, order);
    }

    return returnObj;
};

/**
 * Converts an Order into JSON format acceptable on Signifyd side.
 *
 * @param {dw.order.Order} order - Order that has just been placed.
 * @param {boolean} postAuthFallback - Indicates if post-auth fallback is enabled.
 * @returns {Object} The JSON object describing the order.
 */
function getParams(order, postAuthFallback) {
    var SignifydCreateCasePolicy = Site.getCurrent().getCustomPreferenceValue('SignifydCreateCasePolicy').value;
    var SignifydCoverageRequest = Site.getCurrent().getCustomPreferenceValue('SignifydCoverageRequest').value;
    var SignifydPassiveMode = Site.getCurrent().getCustomPreferenceValue('SignifydPassiveMode');
    var SignifydSCAEnableSCAEvaluation = Site.getCurrent().getCustomPreferenceValue('SignifydSCAEnableSCAEvaluation');

    var paramsObj = {
        device: getDeviceInfo(order),
        merchantPlatform: getMerchantPlatform(),
        signifydClient: getSignifydClient(),
        transactions: getTransactions(order, SignifydCreateCasePolicy, postAuthFallback),
        orderId: order.currentOrderNo,
        purchase: getPurchaseInfo(order),
        userAccount: getUser(order),
        coverageRequests: SignifydCoverageRequest
    };

    if (SignifydCreateCasePolicy === 'PRE_AUTH' && !postAuthFallback) {
        paramsObj.checkoutId = order.getUUID();
        if (SignifydSCAEnableSCAEvaluation && checkSCAPaymentMethod(order)) {
            paramsObj.additionalEvalRequests = ['SCA_EVALUATION'];
        }
    }

    if (SignifydPassiveMode) {
        paramsObj.tags = ['Passive Mode'];
    }

    return paramsObj;
}

/**
 * Handles the callback from Signifyd, validates the request, and processes the decision.
 *
 * @param {dw.web.HttpRequest} request - The HTTP request containing the body and headers.
 */
exports.Callback = function (request) {
    if (!enableCartridge) {
        return;
    }

    try {
        var body = request.httpParameterMap.getRequestBodyAsString();
        var headers = request.getHttpHeaders();
        var topicHeader = headers.get('x-signifyd-topic');
        var hmacKey = headers.get('signifyd-sec-hmac-sha256');
        var Mac = require('dw/crypto/Mac');
        var Encoding = require('dw/crypto/Encoding');
        var apiKey = Site.getCurrent().getCustomPreferenceValue('SignifydApiKey');

        addCustomLog('debug', 'API callback header x-signifyd-topic: ' + topicHeader, null);
        addCustomLog('debug', 'API callback body: ' + body, null);

        var parsedBody = JSON.parse(body);
        var crypt = new Mac(Mac.HMAC_SHA_256);
        var cryptedBody = crypt.digest(body, apiKey);
        var cryptedBodyString = Encoding.toBase64(cryptedBody);

        if (cryptedBodyString.equals(hmacKey)) {
            processCallback(parsedBody);
        } else {
            addCustomLog('error', 'Request is not authorized. Please check the API key.', null);
        }
    } catch (e) {
        addCustomLog('error', 'API Callback processing was interrupted: ' + e.message, null);
        response.setStatus(500);
    }
};

/**
 * Processes data about an order when a decision is received from Signifyd.
 *
 * @param {Object} body - The body of the request from Signifyd.
 */
function processCallback(body) {
    var orderId = body.orderId || body.customerCaseId;
    var OrderMgr = require('dw/order/OrderMgr');
    var order = OrderMgr.getOrder(orderId);
    var holdOrderEnabled = Site.getCurrent().getCustomPreferenceValue('SignifydHoldOrderEnable');

    if (!order) {
        addCustomLog('error', 'No order found with ID = ' + orderId, null);
        return;
    }

    if (!checkPaymentMethodExclusion(order)) {
        addCustomLog('info', 'Payment method exclusion found, order ' + orderId + ' will not be processed', null);
        return;
    }

    var receivedScore = body.decision.score.toString();
    var score = parseInt(receivedScore.split('.')[0], 10);

    Transaction.wrap(function () {
        var orderUrl = 'https://www.signifyd.com/cases/' + body.signifydId;
        order.custom.SignifydOrderURL = orderUrl;
        order.custom.SignifydFraudScore = score;

        var checkpointAction = body.decision.checkpointAction ? body.decision.checkpointAction.toUpperCase() : '';
        order.custom.SignifydPolicy = checkpointAction === 'ACCEPT' ? 'accept' : checkpointAction === 'REJECT' ? 'reject' : 'hold';
        order.custom.SignifydPolicyName = body.decision.checkpointActionReason || '';

        if (holdOrderEnabled) {
            order.exportStatus = checkpointAction === 'ACCEPT' ? order.EXPORT_STATUS_READY : order.EXPORT_STATUS_NOTEXPORTED;
        }
    });
}

/**
 * Sends transaction data to Signifyd for order processing.
 *
 * @param {dw.order.Order} order - The order that has just been placed.
 * @returns {number} Returns 0 on completion.
 */
exports.SendTransaction = function (order) {
    if (!enableCartridge) {
        return 0;
    }

    if (!order || !order.currentOrderNo) {
        addCustomLog('error', 'Please provide a valid order for the SendTransaction method.', order);
        return 0;
    }

    if (!checkPaymentMethodExclusion(order)) {
        addCustomLog('info', 'Payment method exclusion found, order will not be processed.', order);
        return 0;
    }

    addCustomLog('info', 'API call for order ' + order.currentOrderNo, order);

    var params = getSendTransactionParams(order);

    addCustomLog('debug', 'API call body: ' + JSON.stringify(params), order);

    var service = signifydService.transaction();

    if (!service) {
        addCustomLog('error', 'Service initialization failed. Please ensure the service is configured correctly.', order);
        return 0;
    }

    try {
        var result = service.call(params);
        if (!result.ok) {
            addCustomLog('error', 'SendTransaction API call failed: ' + result.errorMessage, order);
        } else {
            addCustomLog('info', 'SendTransaction API call succeeded.', order);
        }
    } catch (e) {
        addCustomLog('error', 'The SendTransaction was interrupted unexpectedly. Exception: ' + e.message, order);
    }

    return 0;
};

/**
 * Converts an Order into JSON format for Signifyd transaction processing.
 *
 * @param {dw.order.Order} order - The order that has just been placed.
 * @returns {Object} The JSON object describing the order's transaction details.
 */
function getSendTransactionParams(order) {
    if (!order) {
        throw new Error('Order is required to construct transaction parameters.');
    }

    var orderCreationCal = new Calendar(order.creationDate);
    var paymentInstruments = order.getPaymentInstruments();
    var transactions = [];

    collections.forEach(paymentInstruments, function (paymentInstrument) {
        var paymentTransaction = paymentInstrument.getPaymentTransaction();
        var paymentProcessor = paymentTransaction.getPaymentProcessor();

        var transaction = {
            transactionId: paymentTransaction.transactionID,
            gatewayStatusCode: '', // to be updated by the merchant
            paymentMethod: getMappedPaymentMethod(paymentInstrument.getPaymentMethod()),
            amount: paymentTransaction.amount.value,
            currency: paymentTransaction.amount.currencyCode,
            createdAt: StringUtils.formatCalendar(orderCreationCal, "yyyy-MM-dd'T'HH:mm:ssZ"),
            verifications: {
                avsResponseCode: '', // to be updated by the merchant
                cvvResponseCode: '' // to be updated by the merchant
            },
            // acquirerDetails: null, // to be updated by the merchant if using SCA
            // threeDsResult: null,  // to be updated by the merchant if using SCA
            checkoutPaymentDetails: getCheckoutPaymentDetails(order, paymentInstrument),
            gateway: paymentProcessor ? paymentProcessor.getID() : null
        };

        transactions.push(transaction);
    });

    return {
        orderId: order.currentOrderNo,
        checkoutId: order.getUUID(),
        transactions: transactions
    };
}

/**
 * Sends fulfillment data to Signifyd for the specified order.
 *
 * @param {dw.order.Order} order - The order for which to send fulfillment data.
 * @returns {Object} An object containing the success status, response object, and any error message.
 */
exports.sendFulfillment = function (order) {
    if (!enableCartridge) {
        addCustomLog('info', 'Cartridge is disabled, skipping SendFulfillment.', null);
        return { success: false, error: 'Cartridge is disabled.' };
    }

    if (!order || !order.currentOrderNo) {
        addCustomLog('error', 'Invalid order object for the SendFulfillment method.', null);
        return { success: false, error: 'Invalid order object.' };
    }

    if (!checkPaymentMethodExclusion(order)) {
        addCustomLog('info', 'Payment method exclusion found, order will not be processed.', order);
        return { success: false, error: 'Payment method exclusion.' };
    }

    try {
        var params = getSendFulfillmentParams(order);
        var service = signifydService.sendFulfillment();

        if (!service) {
            addCustomLog('error', 'Could not initialize the SendFulfillment service. Please ensure the service is configured correctly.', order);
            return { success: false, error: 'Service initialization failed.' };
        }

        addCustomLog('info', 'SendFulfillment API call for order ' + order.currentOrderNo, order);
        var result = service.call(params);

        if (!result.ok) {
            addCustomLog('error', 'SendFulfillment API call for order has failed: ' + result.errorMessage, order);
            return { success: false, error: result.errorMessage };
        }

        addCustomLog('info', 'SendFulfillment API call for order has succeeded.', order);
        return { success: true, object: result.object };
    } catch (e) {
        addCustomLog('error', 'SendFulfillment method was interrupted unexpectedly. Exception: ' + e.message, order);
        return { success: false, error: e.message };
    }
};

/**
 * Constructs the parameters for sending a fulfillment request to Signifyd.
 *
 * @param {dw.order.Order} order - The order for which to construct fulfillment parameters.
 * @returns {Object} The parameters object for the fulfillment request.
 */
function getSendFulfillmentParams(order) {
    if (!order) {
        throw new Error('Order is required to construct fulfillment parameters.');
    }

    var fulfillmentStatus = order.getShippingStatus().displayValue === 'PARTSHIPPED' ? 'PARTIAL' : 'COMPLETE';
    var fulfillments = [];

    collections.forEach(order.getShipments(), function (shipment) {
        fulfillments.push({
            shipmentId: shipment.shipmentNo,
            // fulfillmentMethod: '', // to be updated by the merchant
            // shippedAt: '', to be updated by the merchant
            // shipmentStatus: '', // to be updated by the merchant
            // trackingUrls: '', // to be updated by the merchant
            // trackingNumbers: '', // to be updated by the merchant
            // carrier: '', // to be updated by the merchant
            products: getFulfillmentProducts(shipment.productLineItems),
            destination: {
                fullName: shipment.shippingAddress.fullName,
                organization: shipment.shippingAddress.companyName,
                address: getDeliveryAddress(shipment),
                confirmationPhone: shipment.shippingAddress.phone
            }
        });
    });

    return {
        orderId: order.orderNo,
        fulfillmentStatus: fulfillmentStatus,
        fulfillments: fulfillments
    };
}

/**
 * Sends a reroute request to Signifyd for the specified order.
 *
 * @param {string} orderId - The ID of the order to reroute.
 * @returns {Object} An object containing the success status, response object, and any error message.
 */
exports.sendReroute = function (orderId) {
    if (!enableCartridge) {
        addCustomLog('info', 'Cartridge is disabled, skipping SendReroute.', null);
        return { success: false, error: 'Cartridge is disabled.' };
    }
    var OrderMgr = require('dw/order/OrderMgr');
    var order = OrderMgr.getOrder(orderId);
    if (!order || !order.currentOrderNo) {
        addCustomLog('error', 'Invalid order object for the SendReroute method.', null);
        return { success: false, error: 'Invalid order object.' };
    }

    try {
        var params = getSendRerouteParams(order);
        var service = signifydService.sendReroute();

        if (!service) {
            addCustomLog('error', 'Could not initialize SendReroute service.', order);
            return { success: false, error: 'Service initialization failed.' };
        }

        addCustomLog('info', 'SendReroute API call for order ' + order.currentOrderNo, order);
        var result = service.call(params);

        if (!result.ok) {
            addCustomLog('error', 'SendReroute API call for order has failed: ' + result.errorMessage, order);
            return { success: false, error: result.errorMessage };
        }

        addCustomLog('info', 'SendReroute API call for order has succeeded.', order);
        return { success: true, object: result.object };
    } catch (e) {
        addCustomLog('error', 'SendReroute method was interrupted unexpectedly. Exception: ' + e.message, order);
        return { success: false, error: e.message };
    }
};

/**
 * Constructs the parameters for sending a reroute request to Signifyd.
 *
 * @param {dw.order.Order} order - The order for which to construct reroute parameters.
 * @returns {Object} The parameters object for the reroute request.
 */
function getSendRerouteParams(order) {
    if (!order) {
        throw new Error('Order is required to construct reroute parameters.');
    }

    var shipments = [];

    collections.forEach(order.getShipments(), function (shipment) {
        shipments.push({
            shipmentId: shipment.shipmentNo,
            destination: {
                fullName: shipment.shippingAddress.fullName,
                organization: shipment.shippingAddress.companyName,
                address: getDeliveryAddress(shipment)
            }
        });
    });

    return {
        orderId: order.orderNo,
        shipments: shipments
    };
}

/**
 * Generates a unique ID to use in Signifyd Fingerprint.
 *
 * @returns {string|null} The generated fingerprint ID, or null if the cartridge is disabled.
 */
exports.getOrderSessionId = function () {
    if (!enableCartridge) {
        return null;
    }

    var storeURL = URLUtils.home().toString();
    var limitedLengthURL = storeURL.length > 50 ? storeURL.substring(0, 50) : storeURL;
    var basketID = session.custom.firstBasketID;
    var BasketMgr = require('dw/order/BasketMgr');

    if (empty(basketID)) {
        var basket = BasketMgr.getCurrentOrNewBasket();
        basketID = basket.getUUID();
        session.custom.firstBasketID = basketID;
    }

    return StringUtils.encodeBase64(limitedLengthURL + basketID);
};


/**
 * Saves the order session ID to the order's custom attributes for Signifyd fingerprinting.
 *
 * @param {dw.order.Order} order - The recently created order.
 * @param {string} orderSessionId - The order session ID for the Signifyd fingerprint.
 */
exports.setOrderSessionId = function (order, orderSessionId) {
    if (!enableCartridge) {
        return;
    }

    if (!order || !orderSessionId) {
        throw new Error('Both order and orderSessionId are required to set the Signifyd order session ID.');
    }

    Transaction.wrap(function () {
        order.custom.SignifydOrderSessionId = orderSessionId;
    });
};

/**
 * Logs messages to a custom logger and optionally adds a note to the order.
 *
 * @param {string} type - The type of log message ('error' or 'info').
 * @param {string} msg - The message to log.
 * @param {Object} order - The order object.
 * @param {boolean} addNote - Whether to add the message as a note to the order.
 */
function addCustomLog(type, msg, order) {
    var enableOrderNotes = Site.getCurrent().getCustomPreferenceValue('SignifydEnableOrderNotes');
    var orderNotesLogLevel = Site.getCurrent().getCustomPreferenceValue('SignifydOrderNotesLogLevel').value;
    var customLogger = Logger.getLogger('Signifyd', 'signifyd');
    var logMethods = {
        error: customLogger.error,
        info: customLogger.info
    };

    var prefix = {
        error: 'Error: ',
        info: 'Info: ',
        debug: 'Debug: '
    };

    if (logMethods[type]) {
        msg = prefix[type] + msg;

        logMethods[type].call(customLogger, msg);

        if (!empty(order) && enableOrderNotes) {
            if ((type === 'info' && orderNotesLogLevel === 'info') ||
                (type === 'error' && (orderNotesLogLevel === 'error' || orderNotesLogLevel === 'info'))) {
                addOrderNote(order, msg);
            }
        }
    }
}

/**
 * Adds a note to an order.
 *
 * @param {Object} order - The order object.
 * @param {string} note - The note to add.
 */
function addOrderNote(order, note) {
    try {
        Transaction.wrap(function () {
            order.addNote('Signifyd', note);
        });
    } catch (e) {
        addCustomLog('error', 'Failed to add order note. Exception: ' + e.message, order);
    }
}

/**
 * Checks if the order's payment method is excluded from Signifyd processing.
 *
 * @param {dw.order.Order} order - The order to check for payment method exclusion.
 * @returns {boolean} True if the payment method is not excluded, false otherwise.
 */
function checkPaymentMethodExclusion(order) {
    if (!order) {
        throw new Error('Order is required to check payment method exclusion.');
    }

    var paymentMethodExclusion = Site.getCurrent().getCustomPreferenceValue('SignifydPaymentMethodExclusion') || '';
    var paymentMethodExclusionArray = paymentMethodExclusion || '';
    var paymentInstruments = order.getPaymentInstruments();
    var isExcluded = false;

    collections.forEach(paymentInstruments, function (paymentInstrument) {
        if (paymentMethodExclusionArray.includes(paymentInstrument.paymentMethod)) {
            isExcluded = true;
            Transaction.wrap(function () {
                order.custom.SignifydPaymentMethodExclusionFlag = true;
            });
            return false;
        }
    });

    if (!isExcluded) {
        Transaction.wrap(function () {
            order.custom.SignifydPaymentMethodExclusionFlag = false;
        });
    }

    return !isExcluded;
}

/**
 * Checks if any of the order's payment methods require Strong Customer Authentication (SCA).
 *
 * @param {dw.order.Order} order - The order to check for SCA-required payment methods.
 * @returns {boolean} True if any payment method requires SCA, false otherwise.
 */
function checkSCAPaymentMethod(order) {
    if (!order) {
        throw new Error('Order is required to check SCA payment methods.');
    }

    var signifydSCAPaymentMethods = Site.getCurrent().getCustomPreferenceValue('SignifydSCAPaymentMethods') || '';
    var signifydSCAPaymentMethodsArray = signifydSCAPaymentMethods.split(',');
    var paymentInstruments = order.getPaymentInstruments();

    var requiresSCA = false;

    collections.forEach(paymentInstruments, function (paymentInstrument) {
        if (signifydSCAPaymentMethodsArray.includes(paymentInstrument.paymentMethod)) {
            requiresSCA = true;
            return false;
        }
    });

    return requiresSCA;
}

/**
 * Retrieves the credit card BIN (first 6 digits) from a payment instrument.
 * If not available, returns null.
 *
 * @param {dw.order.PaymentInstrument} paymentInstrument - The main payment instrument on the order.
 * @returns {string|null} The credit card BIN or null if not available.
 */
function getCardBin(paymentInstrument) {
    var cardBin = null;

    try {
        if (paymentInstrument.getPaymentMethod() !== 'GIFT_CERTIFICATE') {
            var cardNumber = paymentInstrument.getCreditCardNumber();
            if (!empty(cardNumber) && cardNumber.indexOf('*') < 0) {
                cardBin = cardNumber.substring(0, 6);
            } else {
                var cardNumberField = session.forms.billing.creditCardFields.cardNumber;
                if (!empty(cardNumberField) && !empty(cardNumberField.value)) {
                    cardBin = cardNumberField.value.substring(0, 6);
                }
            }
        }
    } catch (e) {
        addCustomLog('error', 'Error while getting credit card BIN number: ' + e.message, null);
    }

    return cardBin;
}

/**
 * Retrieves checkout payment details for a payment instrument.
 *
 * @param {dw.order.Order} order - The order object.
 * @param {dw.order.PaymentInstrument} paymentInstrument - The payment instrument.
 * @returns {Object} The checkout payment details.
 */
function getCheckoutPaymentDetails(order, paymentInstrument) {
    return {
        billingAddress: {
            streetAddress: order.billingAddress.address1,
            unit: order.billingAddress.address2,
            city: order.billingAddress.city,
            provinceCode: order.billingAddress.stateCode,
            postalCode: order.billingAddress.postalCode,
            countryCode: order.billingAddress.countryCode.value
        },
        accountHolderName: paymentInstrument.creditCardHolder,
        accountLast4: paymentInstrument.getBankAccountNumberLastDigits(),
        cardToken: paymentInstrument.getCreditCardToken(),
        cardBin: getCardBin(paymentInstrument),
        cardExpiryMonth: paymentInstrument.creditCardExpirationMonth,
        cardExpiryYear: paymentInstrument.creditCardExpirationYear,
        cardLast4: paymentInstrument.creditCardNumberLastDigits,
        cardBrand: paymentInstrument.creditCardType
    };
}

/**
 * Constructs a delivery address object from a shipment.
 *
 * @param {dw.order.Shipment} shipment - The shipment containing the address information.
 * @returns {Object} The delivery address object.
 */
function getDeliveryAddress(shipment) {
    if (!shipment || !shipment.shippingAddress) {
        throw new Error('Shipment and its shipping address are required to construct the delivery address.');
    }

    var shippingAddress = shipment.shippingAddress;

    return {
        streetAddress: shippingAddress.address1,
        unit: shippingAddress.address2 || '',
        city: shippingAddress.city,
        provinceCode: shippingAddress.stateCode,
        postalCode: shippingAddress.postalCode,
        countryCode: shippingAddress.countryCode.value
    };
}

/**
 * Retrieves device information for the order.
 *
 * @param {dw.order.Order} order - The order object.
 * @returns {Object} The device information.
 */
function getDeviceInfo(order) {
    return {
        clientIpAddress: order.remoteHost,
        sessionId: order.custom.SignifydOrderSessionId
    };
}

/**
 * Retrieves discount codes and their associated discount amounts or percentages.
 *
 * @param {dw.util.Collection} couponLineItems - Collection of CouponLineItems on the order.
 * @returns {Array<Object>} An array of objects containing coupon codes and discount details.
 */
function getDiscountCodes(couponLineItems) {
    var discountCodes = [];

    if (empty(couponLineItems)) {
        return discountCodes;
    }

    collections.forEach(couponLineItems, function (coupon) {
        var discountAmount = null;
        var discountPercentage = null;

        collections.forEach(coupon.getPriceAdjustments(), function (priceAdjustment) {
            var discount = priceAdjustment.getAppliedDiscount();

            if (discount.getType() === dw.campaign.Discount.TYPE_AMOUNT) {
                discountAmount = discount.getAmount();
            } else if (discount.getType() === dw.campaign.Discount.TYPE_PERCENTAGE) {
                discountPercentage = discount.getPercentage() / 100;
            }
        });

        discountCodes.push({
            amount: discountAmount,
            percentage: discountPercentage,
            code: coupon.getCouponCode()
        });
    });

    return discountCodes;
}

/**
 * Retrieves product line items from a shipment and formats them for fulfillment request.
 *
 * @param {dw.util.Collection} productLineItems - A collection of product line items.
 * @returns {Array<Object>} An array of product objects formatted for fulfillment.
 */
function getFulfillmentProducts(productLineItems) {
    if (!productLineItems) {
        throw new Error('Product line items are required to retrieve fulfillment products.');
    }

    var products = [];

    collections.forEach(productLineItems, function (productLineItem) {
        products.push({
            itemName: productLineItem.lineItemText,
            itemQuantity: productLineItem.quantity.value
        });
    });

    return products;
}

/**
 * Retrieves a mapped payment method string to a standardized payment method identifier.
 *
 * @param {string} paymentMethod - The original payment method string to be mapped.
 * @returns {string} The mapped or original payment method identifier.
 */
function getMappedPaymentMethod(paymentMethod) {
    if (paymentMethod === 'GIFT_CERTIFICATE') {
        paymentMethod = 'GIFT_CARD';
    } else if (paymentMethod.toUpperCase().indexOf('PAYPAL') !== -1) {
        paymentMethod = 'PAYPAL_ACCOUNT';
    } else if (paymentMethod.toUpperCase().indexOf('APPLE') !== -1) {
        paymentMethod = 'APPLE_PAY';
    }
    return paymentMethod;
}

/**
 * Retrieves information about the Salesforce Commerce Cloud platform version.
 *
 * @returns {Object} An object containing the platform name and version.
 */
function getMerchantPlatform() {
    var System = require('dw/system/System');
    return {
        name: 'Salesforce Commerce Cloud',
        version: String(System.getCompatibilityMode())
    };
}

/**
 * Retrieves product information
 *
 * @param {dw.util.Collection} productLineItems - A collection of product line items.
 * @returns {Array<Object>} An array of product objects formatted for Signifyd.
 */
function getProducts(productLineItems) {
    var products = [];

    collections.forEach(productLineItems, function (productLineItem) {
        var product = productLineItem.product;
        var primaryCategory = product.getPrimaryCategory();

        // Get master product's primary category if the variant doesn't have one
        if (empty(primaryCategory) && !product.isMaster()) {
            primaryCategory = product.masterProduct.getPrimaryCategory();
        }
        var parentCategory = primaryCategory ? primaryCategory.getParent() : null;

        products.push({
            itemId: productLineItem.productID,
            itemName: productLineItem.productName,
            itemUrl: URLUtils.abs('Product-Show', 'pid', productLineItem.productID).toString(),
            itemQuantity: productLineItem.quantityValue,
            itemPrice: productLineItem.grossPrice.value,
            itemSubCategory: primaryCategory ? primaryCategory.ID : null,
            itemCategory: parentCategory ? parentCategory.ID : (primaryCategory ? primaryCategory.ID : null),
            itemImage: product.getImage('large', 0).getAbsURL().toString(),
            shipmentId: productLineItem.shipment.shipmentNo,
            itemIsDigital: false // To be updated by the merchant in case of digital item
        });
    });

    return products;
}

/**
 * Retrieves purchase information for the order.
 *
 * @param {dw.order.Order} order - The order object.
 * @returns {Object} The purchase information.
 */
function getPurchaseInfo(order) {
    var orderCreationCalendar = new Calendar(order.creationDate);
    return {
        createdAt: StringUtils.formatCalendar(orderCreationCalendar, "yyyy-MM-dd'T'HH:mm:ssZ"),
        orderChannel: '', // to be updated by the merchant
        totalPrice: order.getTotalGrossPrice().value,
        currency: order.getCurrencyCode(),
        confirmationEmail: order.getCustomerEmail(),
        products: getProducts(order.productLineItems),
        shipments: getShipments(order),
        confirmationPhone: order.getDefaultShipment().shippingAddress.phone,
        totalShippingCost: order.getShippingTotalGrossPrice().value,
        discountCodes: getDiscountCodes(order.getCouponLineItems()),
        receivedBy: order.createdBy !== 'Customer' ? order.createdBy : null
    };
}

/**
 * Returns a client information object for Signifyd integration.
 * @returns {Object} An object containing the application name and version, where:
 *   - application {string}: The name of the application ('Salesforce Commerce Cloud').
 *   - version {string}: The Signifyd integration version, retrieved from localized resources.
 */
function getSignifydClient() {
    var Resource = require('dw/web/Resource');
    return {
        application: 'Salesforce Commerce Cloud',
        version: Resource.msg('signifyd.version.text', 'signifyd_version', null)
    };
}

/**
 * Retrieves shipment details from an order
 *
 * @param {dw.order.Order} order - The order containing shipment information.
 * @returns {Array<Object>} An array of shipment objects formatted for Signifyd.
 */
function getShipments(order) {
    var shipments = [];

    if (!order || !order.shipments) {
        return shipments;
    }

    collections.forEach(order.shipments, function (shipment) {
        var isPickupInStore = shipment.getShippingMethod().custom.storePickupEnabled;
        var addressSource = isPickupInStore ? order.billingAddress : shipment.shippingAddress;

        shipments.push({
            destination: {
                fullName: addressSource.getFullName(),
                address: {
                    streetAddress: addressSource.address1,
                    unit: addressSource.address2,
                    city: addressSource.city,
                    postalCode: addressSource.postalCode,
                    provinceCode: addressSource.stateCode,
                    countryCode: addressSource.countryCode.value
                }
            },
            shipmentId: shipment.shipmentNo,
            fulfillmentMethod: isPickupInStore ? 'COUNTER_PICKUP' : 'DELIVERY'
        });
    });

    return shipments;
}

/**
 * Retrieves transaction information for the order.
 *
 * @param {dw.order.Order} order - The order object.
 * @param {string} createCasePolicy - The Signifyd create case policy.
 * @param {boolean} postAuthFallback - Indicates if post-auth fallback is enabled.
 * @returns {Array<Object>} The transaction information.
 */
function getTransactions(order, createCasePolicy, postAuthFallback) {
    var transactions = [];

    collections.forEach(order.getPaymentInstruments(), function (paymentInstrument) {
        var paymentTransaction = paymentInstrument.getPaymentTransaction();
        var paymentProcessor = paymentTransaction.getPaymentProcessor();

        var transaction = {
            paymentMethod: getMappedPaymentMethod(paymentInstrument.getPaymentMethod()),
            checkoutPaymentDetails: getCheckoutPaymentDetails(order, paymentInstrument),
            amount: paymentTransaction.amount.value,
            currency: paymentTransaction.amount.currencyCode,
            gateway: paymentProcessor ? paymentProcessor.getID() : null
        };

        if (createCasePolicy === 'POST_AUTH' || postAuthFallback) {
            transaction.transactionId = paymentTransaction.transactionID;
            transaction.gatewayStatusCode = ''; // to be updated by the merchant

            if (paymentInstrument.getPaymentMethod() !== 'GIFT_CERTIFICATE') {
                transaction.verifications = {
                    avsResponseCode: '', // to be updated by the merchant
                    cvvResponseCode: '' // to be updated by the merchant
                };
            }
        }

        transactions.push(transaction);
    });

    return transactions;
}

/**
 * Retrieves user information from an order
 *
 * @param {dw.order.Order} order - The order containing customer information.
 * @returns {Object|null} An object describing the user, or null if no profile exists.
 */
function getUser(order) {
    var profile = order.customer.profile;

    if (!profile) {
        return null;
    }

    var phone = profile.phoneMobile || profile.phoneBusiness || profile.phoneHome || null;
    var creationDate = new Calendar(profile.getCreationDate());
    var lastModified = new Calendar(profile.getLastModified());

    return {
        email: profile.email,
        username: order.customerName,
        phone: phone,
        createdDate: StringUtils.formatCalendar(creationDate, "yyyy-MM-dd'T'HH:mm:ssZ"),
        accountNumber: order.customer.ID,
        lastUpdateDate: StringUtils.formatCalendar(lastModified, "yyyy-MM-dd'T'HH:mm:ssZ"),
        aggregateOrderCount: order.customer.activeData.getOrders(),
        aggregateOrderDollars: order.customer.activeData.getOrderValue()
    };
}

/**
 * Sets or increments the retry count for the order, used in the job processing.
 *
 * @param {dw.order.Order} order - The current order being integrated.
 */
function saveRetryCount(order) {
    if (!order) {
        throw new Error('Order is required to save retry count.');
    }

    Transaction.wrap(function () {
        var currentRetryCount = order.custom.SignifydRetryCount || 0;
        order.custom.SignifydRetryCount = currentRetryCount + 1;
    });
}
