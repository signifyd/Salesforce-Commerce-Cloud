'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var signifydInit = require('./signifydInit');

var site = {
    getCurrent: function () {
        return {
            getPreferences: function () {
                return {
                    getCustom: function () {
                        return {
                            SignifydApiKey: '',
                            SignifydHoldOrderEnable: true,
                            SignifydEnableCartridge: true,
                            SignifydSellerName: '',
                            SignifydSellerDomain: '',
                            SignifydFromStreet: '',
                            SignifydFromUnit: '',
                            SignifydFromCity: '',
                            SignifydFromState: '',
                            SignifydFromPostCode: '',
                            SignifydFromCountry: '',
                            SignifydFromLatitude: '',
                            SignifydFromLongitude: '',
                            SignifydCorporateStreet: '',
                            SignifydCorporateUnit: '',
                            SignifydCorporateCity: '',
                            SignifydCorporateState: '',
                            SignifydCorporatePostCode: '',
                            SignifydCorporateCountry: '',
                            SignifydCorporateLatitude: '',
                            SignifydCorporateLongitude: ''
                        };
                    }
                };
            }
        };
    }
};

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

var order = null;

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
        'int_signifyd/cartridge/scripts/service/signifydInit': signifydInit
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
module.exports = model;
