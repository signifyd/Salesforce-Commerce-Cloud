'use strict';

var assert = require('chai').assert;
var chaiSubset = require('chai-subset');
var chai = require('chai');
chai.use(chaiSubset);

var signifyd = require('../../mocks/service/signifyd');

var request = function (body) {
    return {
        httpParameterMap: {
            getRequestBodyAsString: function () { return body }
        },
        getHttpHeaders: function () {
            return {
                get: function () {
                    return "hmacKey";
                }
            };
        }
    };
}

var paymentInstrument = {
    getPaymentTransaction: function () {
        return {
            transactionID: "tid",
            amount: { currencyCode: "USD" },
            getPaymentInstrument: function () {
                return { 
                    creditCardHolder: "holder",
                    creditCardNumberLastDigits: "1234",
                    creditCardExpirationMonth: "04",
                    creditCardExpirationYear: "2023",
                    getPaymentMethod: function () { return "paymentmethod"; },
                }
            },
            getPaymentProcessor: function () { return { ID: "ppid" };}
        };
    }
};

var lineItemCtnr = {
    getPaymentInstruments: function () {
        return [paymentInstrument];
    }
};

var productLineItems = [{
        productID: "001",
        productName: "product001",
        quantityValue: 1,
        grossPrice: { value: 100 },
        lineItemCtnr: lineItemCtnr
    },
    {
        productID: "001",
        productName: "product002",
        quantityValue: 2,
        grossPrice: { value: 50 },
        lineItemCtnr: lineItemCtnr
}];

var shipments = [{
    standardShippingLineItem: { ID: "123" },
    shippingMethod: { displayName: "Shipping Method" },
    shippingTotalGrossPrice: { value: 10 },
    trackingNumber: "123",
    shippingAddress: {
        fullName: "",
        phone: "",
        companyName: "",
        address1: "",
        address2: "",
        city: "",
        stateCode: "",
        postalCode: "",
        countryCode: { value: "" }
    }
}];

var order = {
    currentOrderNo: "1234",
    creationDate: "01/01/2020",
    getTotalGrossPrice: function () {
        return { value: "210" };
    },
    allProductLineItems: productLineItems,
    productLineItems: productLineItems,
    shipments: shipments,
    exportStatus: null,
    billingAddress: {
        address1: "",
        address2: "",
        city: "",
        stateCode: "",
        postalCode: "",
        countryCode: { value: "" }
    },
    customerEmail: "test@test.com",
    customerName: "Test",
    customerNo: "123",
    custom: {
        SignifydCaseID: null,
        SignifydOrderSessionId: "1234",
        SignifydOrderURL: null,
        SignifydFraudScore: null,
        SignifydRetryCount: null,
        SignifydGuaranteeDisposition: null
    },
    customer: {
        ID: "123",
        profile: {
            phoneMobile: "",
            phoneBusiness: "",
            phoneHome: "",
            getCreationDate: function () { return "01/01/2020" },
            getLastModified: function () { return "01/01/2020" },
            email: "test@test.com"
        }
    }
};

describe('signifyd', function () {
    signifyd.setOrder(order);

    describe('Call', function () {
        it('should return 1 on success', function () {
            var result = signifyd.Call(order);
            assert.equal(result, '1');
        });
        it('should set 1 to order.custom.SignifydCaseID on success', function () {
            signifyd.Call(order);
            assert.equal(order.custom.SignifydCaseID, '1');
        });
        it('should set 0 to order.custom.SignifydCaseID on error', function () {
            signifyd.setServiceResponse({
                "investigationId": "0"
            });
            signifyd.Call(order);
            assert.equal(order.custom.SignifydCaseID, '0');
        });
        it('should return 0 on error', function () {
            signifyd.setServiceResponse({
                "investigationId": "0"
            });
            var result = signifyd.Call(order);
            assert.equal(result, '0');
        });
        it('should save the retry count on order.custom.SignifydRetryCount', function () {
            signifyd.Call(order);
            assert.equal(order.custom.SignifydRetryCount, '5');
        });
    });

    describe('Callback', function () {
        it('should save the orderUrl result on order.custom SignifydOrderURL', function () {
            signifyd.Callback(request('{"orderId": "123","score": "12.0","orderUrl": "testingURL","guaranteeDisposition": "APPROVED"}'));
            assert.equal(order.custom.SignifydOrderURL, 'testingURL');
        });
        it('should set the order.custom SignifydGuaranteeDisposition to approved when approved', function () {
            signifyd.Callback(request('{"orderId": "123","score": "12.0","orderUrl": "testingURL","guaranteeDisposition": "APPROVED"}'));
            assert.equal(order.custom.SignifydGuaranteeDisposition, 'approved');
        });
        it('should set the order.custom SignifydGuaranteeDisposition to declined when declined', function () {
            signifyd.Callback(request('{"orderId": "123","score": "12.0","orderUrl": "testingURL","guaranteeDisposition": "DECLINED"}'));
            assert.equal(order.custom.SignifydGuaranteeDisposition, 'declined');
        });
        it('should save the score result on order.custom.SignifydFraudScore', function () {
            signifyd.Callback(request('{"orderId": "123","score": "13.7","orderUrl": "testingURL","guaranteeDisposition": "APPROVED"}'));
            assert.equal(order.custom.SignifydFraudScore, '13');
        });
        it('should set the order to not exported when declined', function () {
            signifyd.Callback(request('{"orderId": "123","score": "13.7","orderUrl": "testingURL","guaranteeDisposition": "DECLINED"}'));
            assert.equal(order.exportStatus, '0');
        });
        it('should set the order to exported when approved', function () {
            signifyd.Callback(request('{"orderId": "123","score": "13.7","orderUrl": "testingURL","guaranteeDisposition": "APPROVED"}'));
            assert.equal(order.exportStatus, '2');
        });
    });

    describe('getOrderSessionId', function () {
        it('should return the orderSessionId', function () {
            var orderSessionId = signifyd.getOrderSessionId();
            assert.equal(orderSessionId, 'homeUrlUUIDencoded64');
        });
    });

    describe('setOrderSessionId', function () {
        it('should set a value to order.custom.SignifydOrderSessionId', function () {
            signifyd.setOrderSessionId(order, 'value');
            assert.equal(order.custom.SignifydOrderSessionId, 'value');
        });
    });
});
