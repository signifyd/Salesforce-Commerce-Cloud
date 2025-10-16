'use strict';

var assert = require('chai').assert;
var chaiSubset = require('chai-subset');
var chai = require('chai');
chai.use(chaiSubset);

var signifyd = require('../../mocks/service/signifyd');

var request = function (body) {
    return {
        httpParameterMap: {
            getRequestBodyAsString: function () { return body; }
        },
        getHttpHeaders: function () {
            return {
                get: function () {
                    return 'hmacKey';
                }
            };
        }
    };
};

var paymentInstrument = {
    getPaymentTransaction: function () {
        return {
            transactionID: 'tid',
            amount: { currencyCode: 'USD' },
            getPaymentInstrument: function () {
                return {
                    creditCardHolder: 'holder',
                    creditCardNumberLastDigits: '1234',
                    creditCardExpirationMonth: '04',
                    creditCardExpirationYear: '2023',
                    getPaymentMethod: function () { return 'paymentmethod'; }
                };
            },
            getPaymentProcessor: function () { return { ID: 'ppid' }; }
        };
    }
};

var lineItemCtnr = {
    getPaymentInstruments: function () {
        return [paymentInstrument];
    }
};

var productLineItems = [{
    productID: '001',
    productName: 'product001',
    quantityValue: 1,
    grossPrice: { value: 100 },
    lineItemCtnr: lineItemCtnr
},
{
    productID: '001',
    productName: 'product002',
    quantityValue: 2,
    grossPrice: { value: 50 },
    lineItemCtnr: lineItemCtnr
}];

var shipments = [{
    standardShippingLineItem: { ID: '123' },
    shippingMethod: { displayName: 'Shipping Method' },
    shippingTotalGrossPrice: { value: 10 },
    trackingNumber: '123',
    shippingAddress: {
        fullName: '',
        phone: '',
        companyName: '',
        address1: '',
        address2: '',
        city: '',
        stateCode: '',
        postalCode: '',
        countryCode: { value: '' }
    }
}];

var order =  {
    currentOrderNo: '12345',
    creationDate: new Date(),
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
        SignifydRetryCount: 1
    },
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
    billingAddress: {
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
    remoteHost: '127.0.0.1',
    createdBy: 'Customer',
    exportStatus: 0,
    addNote: (title, note) => {
        console.log(`Note added: ${title} - ${note}`);
    }
};

describe('signifyd', function () {
    signifyd.setOrder(order);
    signifyd.setServiceResponse({
                'signifydId': '123',
                'checkpointAction': 'ACCEPT'
            });

    describe('Call', function () {
        it('should return an object with caseId and declined properties', function () {
            // eslint-disable-next-line new-cap
            var result = signifyd.Call(order);
            assert.deepEqual(result, { caseId: '123', declined: false });
        });
        it('should set 123 to order.custom.SignifydCaseID on success', function () {
            // eslint-disable-next-line new-cap
            signifyd.Call(order);
            assert.equal(order.custom.SignifydCaseID, '123');
        });
        it('should set undefined to order.custom.SignifydCaseID on error', function () {
            signifyd.setServiceResponse({
                "messages": [
                    "Failed to parse field"
                ],
                "traceId": "abc123",
                "errors": {
                    "purchase.orderChannel": [
                        "Failed to parse field"
                    ]
                }
            });
            // eslint-disable-next-line new-cap
            signifyd.Call(order);
            assert.equal(order.custom.SignifydCaseID, 'undefined');
        });
        it('should save the retry count on order.custom.SignifydRetryCount', function () {
            // eslint-disable-next-line new-cap
            signifyd.Call(order);
            //retry count should be great than 0
            assert.isAbove(order.custom.SignifydRetryCount, 0);
        });
    });

    describe('Callback', function () {
        it('should save the orderUrl result on order.custom SignifydOrderURL', function () {
            // eslint-disable-next-line new-cap
            signifyd.Callback(request('{"orderId": "123","signifydId": "123", "decision": {"score": 90, "checkpointAction": "ACCEPT"} }'));
            assert.equal(order.custom.SignifydOrderURL, 'https://www.signifyd.com/cases/123');
        });
        it('should set the order.custom.SignifydPolicy to accept when approved', function () {
            // eslint-disable-next-line new-cap
            signifyd.Callback(request('{"orderId": "123","signifydId": "123", "decision": {"score": 90, "checkpointAction": "ACCEPT"} }'));
            assert.equal(order.custom.SignifydPolicy, 'accept');
        });
        it('should set the order.custom SignifydGuaranteeDisposition to reject when declined', function () {
            // eslint-disable-next-line new-cap
            signifyd.Callback(request('{"orderId": "123","signifydId": "123", "decision": {"score": 90, "checkpointAction": "REJECT"} }'));
            assert.equal(order.custom.SignifydPolicy, 'reject');
        });
        it('should save the score result on order.custom.SignifydFraudScore', function () {
            // eslint-disable-next-line new-cap
            signifyd.Callback(request('{"orderId": "123","signifydId": "123", "decision": {"score": "90", "checkpointAction": "ACCEPT"} }'));
            assert.equal(order.custom.SignifydFraudScore, '90');
        });
        it('should set the order to not exported when declined', function () {
            // eslint-disable-next-line new-cap
            signifyd.Callback(request('{"orderId": "123","signifydId": "123", "decision": {"score": 90, "checkpointAction": "REJECT"} }'));
            assert.equal(order.exportStatus, 0);
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
