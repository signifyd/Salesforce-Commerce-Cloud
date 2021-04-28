'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var serviceResult = {
    'investigationId': '1'
};

var localServiceRegistry = {
    createService: function (serviceId, configObj) {
        return {
            call: function (params) {
                var service = {
                    setRequestMethod: function () {},
                    addHeader: function () {}
                };
                configObj.createRequest(service, params);
                var client = {
                    text: JSON.stringify(serviceResult)
                };
                return {
                    ok: true,
                    object: configObj.parseResponse(service, client)
                };
            }
        };
    }
};

var site = {
    getCurrent: function () {
        return {
            getPreferences: function () {
                return {
                    getCustom: function () {
                        return {
                            SignifydApiKey: ''
                        };
                    }
                };
            }
        };
    }
};

function proxyModel() {
    return proxyquire('../../../cartridges/int_signifyd/cartridge/scripts/service/signifydInit', {
        'dw/svc/LocalServiceRegistry': localServiceRegistry,
        'dw/system/Site': site,
        'dw/util/StringUtils': require('../dw.util.StringUtils')
    });
}
var model = proxyModel();
model.setServiceResponse = function (response) {
    serviceResult = response;
};
module.exports = model;
