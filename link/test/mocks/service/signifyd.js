'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var signifydInit = require('./signifydInit');
var Array = require('../Array');

var site = {
    getCurrent: function () {
        return {
            getCustomPreferenceValue: function (value) {
                var preferenceMap =
                    {'SignifydApiKey': '123',
                    'SignifydHoldOrderEnable': true,
                    'SignifydEnableCartridge': true,
                    'SignifydPaymentMethodExclusion': new Array() ,
                    'SignifydOrderNotesLogLevel': {value:true},
                    'SignifydCreateCasePolicy': {value: "POST_AUTH"},
                    'SignifydCoverageRequest': {value: "FRAUD"},
                    'SignifydSCAEnableSCAEvaluation': false,
                    "SignifydHoldOrderEnable": false
                    }

                return preferenceMap[value];

            }
        };
    }
};

global.response = {
    setStatus: function () { return true}
};

var checkPaymentMethodExclusion = function () {
    return {
        contains: function (value) {
            return false;
        }
    };
}();

global.session = {
    custom: {}
}

var collections = require('../util/collections');

var system = {
    getCompatibilityMode: function () {
        return '1602';
    }
};

var mac = function () {
    this.HMAC_SHA_256 = 'HmacSHA256';
    // eslint-disable-next-line no-unused-vars
    this.digest = function (input, key) {
        return 'hmacKey';
    };
};

var logger = {
    // eslint-disable-next-line no-unused-vars
    getLogger: function (fileNamePrefix, category) {
        return {
            // eslint-disable-next-line no-unused-vars
            info: function (msg, ...args) {},
            // eslint-disable-next-line no-unused-vars
            debug: function (msg, ...args) {},
            // eslint-disable-next-line no-unused-vars
            error: function (msg, ...args) {}
        };
    }
};

var transaction = {
    wrap: function (method) {
        try {
            method();
            // eslint-disable-next-line no-empty
        } catch (e) {}
    }
};

global.empty = function(val) {
    if (val === undefined || val == null || val.length <= 0) {
        return true;
    } else {
        return false;
    }
};
var encoding = {
    toBase64: function (str) {
        return { equals: function (otherStr) { return otherStr === str; } };
    }
};

var urlUtils = {
    home: function () {
        return {
            toString: function () {
                return 'homeUrl';
            }
        };
    },
    abs: function (action, ...params) {
        return {
            toString: function () {
                var strParams = '';
                if (params) {
                    strParams = '?';
                    for (var i = 0; i < params.length; i++) {
                        strParams += ((i > 0 ? '&' : '') + params[i]);
                    }
                }
                return action + '/' + strParams;
            }
        };
    }
};

var calendar = function (date) {
    return {
        date: date
    };
};

var basketMgr = {
    getCurrentOrNewBasket: function () {
        return {
            getUUID: function () {
                return 'UUID';
            }
        };
    }
};

var order = {
    currentOrderNo: '12345',
    custom: {
        SignifydCaseID: null,
        SignifydOrderURL: null,
        SignifydFraudScore: null,
        SignifydPolicy: null,
        SignifydPolicyName: null,
        SignifydSCAOutcome: null,
        SignifydExemption: null,
        SignifydPlacement: null,
        SignifydOrderSessionId: null,
        SignifydPaymentMethodExclusionFlag: false,
        SignifydRetryCount: 0
    },
    creationDate: new Date(),
    getUUID: () => 'uuid-12345',
    getPaymentInstruments: () => [
        {
            getPaymentTransaction: () => ({
                transactionID: 'txn-123',
                amount: { value: 100, currencyCode: 'USD' },
                getPaymentProcessor: () => ({ getID: () => 'processor-123' })
            }),
            getPaymentMethod: () => 'CREDIT_CARD',
            creditCardHolder: 'John Doe',
            getBankAccountNumberLastDigits: () => '1234',
            getCreditCardToken: () => 'token-123',
            creditCardExpirationMonth: 12,
            creditCardExpirationYear: 2025,
            creditCardNumberLastDigits: '5678',
            creditCardType: 'Visa'
        }
    ],
    getCouponLineItems: () => [],
    getShipments: () => [
        {
            shipmentNo: 'shipment-123',
            shippingAddress: {
                fullName: 'John Doe',
                companyName: 'Company Inc.',
                address1: '123 Main St',
                address2: 'Apt 4B',
                city: 'Anytown',
                stateCode: 'CA',
                postalCode: '12345',
                countryCode: { value: 'US' },
                phone: '555-1234'
            },
            productLineItems: [
                {
                    productID: 'prod-123',
                    productName: 'Product Name',
                    lineItemText: 'Product Description',
                    quantity: { value: 1 },
                    grossPrice: { value: 100 },
                    shipment: { shipmentNo: 'shipment-123' }
                }
            ],
            getShippingMethod: () => ({
                custom: { storePickupEnabled: false }
            })
        }
    ],
    getCustomerEmail: () => 'customer@example.com',
    getDefaultShipment: () => ({
        shippingAddress: {
            phone: '555-1234'
        }
    }),
    getTotalGrossPrice: () => ({ value: 100 }),
    getCurrencyCode: () => 'USD',
    getShippingTotalGrossPrice: () => ({ value: 10 }),
    customer: {
        profile: {
            email: 'customer@example.com',
            phoneMobile: '555-1234',
            getCreationDate: () => new Date(),
            getLastModified: () => new Date()
        },
        ID: 'customer-123',
        activeData: {
            getOrders: () => 5,
            getOrderValue: () => 500
        }
    },
    remoteHost: '127.0.0.1',
    createdBy: 'Customer',
    exportStatus: null
};

var orderMgr = {
    getOrder: function () {
        return order;
    }
};

function proxyModel() {
    return proxyquire('../../../cartridges/int_signifyd/cartridge/scripts/service/signifyd', {
        'dw/system/Site': site,
        'dw/system/System': system,
        'dw/crypto/Mac': mac,
        'dw/system/Logger': logger,
        'dw/system/Transaction': transaction,
        'dw/crypto/Encoding': encoding,
        'dw/web/URLUtils': urlUtils,
        'dw/util/Calendar': calendar,
        'dw/util/StringUtils': require('../dw.util.StringUtils'),
        'dw/order/BasketMgr': basketMgr,
        'dw/order/OrderMgr': orderMgr,
        'int_signifyd/cartridge/scripts/service/signifydInit': signifydInit,
        '*/cartridge/scripts/util/collections': collections,
        'dw/web/Resource': require('../dw/web/Resource'),
        'dw/order/PaymentInstrument': require('../dw/order/PaymentInstrument')
    });
}

var model = proxyModel();
model.setOrder = function (param) {
    order = param;
};
// eslint-disable-next-line no-unused-vars
model.getOrder = function (param) {
    return order;
};
model.setServiceResponse = function (response) {
    signifydInit.setServiceResponse(response);
};

model.checkPaymentMethodExclusion = checkPaymentMethodExclusion;
module.exports = model;
