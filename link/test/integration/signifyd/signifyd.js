var assert = require('chai').assert;
var chaiSubset = require('chai-subset');
var chai = require('chai');
chai.use(chaiSubset);

var request = require('request-promise');
var config = require('../it.config');
var crypto = require('crypto');

describe('signifyd', function () {
    this.timeout(30000);

    var orderNumber = "";

    describe('Include Fingerprint', function () {
        it('should return status code 200', function () {
            var url = config.baseUrl + '/Signifyd-IncludeFingerprint';
            var myRequest = {
                url: url,
                method: 'GET',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            };
            return request(myRequest)
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                });
        });
    });

    describe('Callback', function () {
        var cookieJar = request.jar();
        var APIkey = ""
        var myRequest = {
            url: '',
            method: 'POST',
            rejectUnauthorized: false,
            resolveWithFullResponse: true,
            jar: cookieJar,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
            }
        };

        before(function () {
            myRequest.url = config.baseUrl + '/Test-Config';
            return request(myRequest)
                .then(function (response) {
                    assert.equal(response.statusCode, 200);
                    var bodyAsJson = JSON.parse(response.body);
                    APIkey = bodyAsJson.APIkey;

                    // Adding product
                    var pid = 'mitsubishi-wd-73736M';
                    var quantity = '1';
                    var options = [{ 'optionId': 'tvWarranty', 'selectedValueId': '001' }];
                    var optionsString = JSON.stringify(options);

                    myRequest.url = config.baseUrl + '/Cart-AddProduct';
                    myRequest.form = {
                        pid: pid,
                        childProducts: [],
                        quantity: quantity,
                        options: optionsString
                    };
                    return request(myRequest)
                })
                .then(function () {
                    myRequest.url = config.baseUrl + '/CSRF-Generate';
                    return request(myRequest);
                })
                .then(function (csrfResponse) {
                    var csrfJsonResponse = JSON.parse(csrfResponse.body);
                    // Submit billing request with token aquired
                    myRequest.url = config.baseUrl + '/CheckoutShippingServices-SubmitShipping?' +
                        csrfJsonResponse.csrf.tokenName + '=' +
                        csrfJsonResponse.csrf.token;
                    myRequest.form = {
                        dwfrm_shipping_shippingAddressUseAsBillingAddress: 'true',
                        dwfrm_shipping_shippingAddress_addressFields_firstName: 'John',
                        dwfrm_shipping_shippingAddress_addressFields_lastName: 'Smith',
                        dwfrm_shipping_shippingAddress_addressFields_address1: '10 main St',
                        dwfrm_shipping_shippingAddress_addressFields_address2: '',
                        dwfrm_shipping_shippingAddress_addressFields_country: 'us',
                        dwfrm_shipping_shippingAddress_addressFields_phone: '9786543213',
                        dwfrm_shipping_shippingAddress_addressFields_states_stateCode: 'MA',
                        dwfrm_shipping_shippingAddress_addressFields_city: 'burlington',
                        dwfrm_shipping_shippingAddress_addressFields_postalCode: '09876',
                        dwfrm_shipping_shippingMethodID: "001"
                    };
                    return request(myRequest);
                })
                .then(function () {
                    var shipMethodId = '001';   // 001 = Ground
                    myRequest.method = 'POST';
                    myRequest.url = config.baseUrl + '/Cart-SelectShippingMethod?methodID=' + shipMethodId;
                    return request(myRequest);
                })
                .then(function () {
                    myRequest.url = config.baseUrl + '/CSRF-Generate';
                    return request(myRequest);
                })
                .then(function (csrfResponse) {
                    var csrfJsonResponse = JSON.parse(csrfResponse.body);
                    // Submit billing request with token aquired
                    myRequest.url = config.baseUrl + '/CheckoutServices-SubmitPayment?' +
                        csrfJsonResponse.csrf.tokenName + '=' +
                        csrfJsonResponse.csrf.token;
                    myRequest.form = {
                        dwfrm_billing_shippingAddressUseAsBillingAddress: 'true',
                        dwfrm_billing_addressFields_firstName: 'John',
                        dwfrm_billing_addressFields_lastName: 'Smith',
                        dwfrm_billing_addressFields_address1: '10 main St',
                        dwfrm_billing_addressFields_address2: '',
                        dwfrm_billing_addressFields_country: 'us',
                        dwfrm_billing_addressFields_states_stateCode: 'MA',
                        dwfrm_billing_addressFields_city: 'burlington',
                        dwfrm_billing_addressFields_postalCode: '09876',
                        dwfrm_billing_paymentMethod: 'CREDIT_CARD',
                        dwfrm_billing_creditCardFields_cardType: 'Visa',
                        dwfrm_billing_creditCardFields_cardNumber: '4111111111111111',
                        dwfrm_billing_creditCardFields_expirationMonth: '2',
                        dwfrm_billing_creditCardFields_expirationYear: '2030.0',
                        dwfrm_billing_creditCardFields_securityCode: '342',
                        dwfrm_billing_contactInfoFields_email: 'blahblah@gmail.com',
                        dwfrm_billing_contactInfoFields_phone: '9786543213'
                    };
                    return request(myRequest);
                })
                .then(function () {
                    myRequest.url = config.baseUrl + '/CheckoutServices-PlaceOrder';
                    return request(myRequest);
                })
                .then(function (response) {
                    var bodyAsJson = JSON.parse(response.body);
                    assert.equal(bodyAsJson.error, false, 'Could not place order');
                    orderNumber = bodyAsJson.orderID;
                });
        });

        it('should update the order properties', function () {
            var body = {
                orderId: orderNumber,
                score: '12',
                orderUrl: 'testing',
                guaranteeDisposition: 'APPROVED'
            };
            var myRequest = {
                url: config.baseUrl + '/Signifyd-Callback',
                method: 'POST',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                jar: cookieJar,
                json: true,
                body: body,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'x-signifyd-sec-hmac-sha256': crypto.createHmac('sha256', APIkey).update(JSON.stringify(body)).digest("base64")
                }
            };
            return request(myRequest)
                .then(function (response) {
                    myRequest.url = config.baseUrl + '/Test-Callback?orderNumber=' + body.orderId;
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    return request(myRequest)
                        .then(function (response) {
                            assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                            var bodyAsJson = response.body;
                            assert.equal(bodyAsJson.success, true, 'Expected success to be true');
                            assert.equal(bodyAsJson.SignifydGuaranteeDisposition, 'approved', 'Expected SignifydGuaranteeDisposition to be approved');
                            assert.equal(bodyAsJson.SignifydFraudScore, 12, 'Expected SignifydFraudScore to be 12');
                            assert.equal(bodyAsJson.SignifydOrderURL, 'testing', 'Expected SignifydOrderURL to be testing');
                            assert.equal(bodyAsJson.exportStatus, '2', 'Expected exportStatus to be 2');
                        });
                });
        });
    });

    describe('Test', function () {
        it('should return the caseId', function () {
            var url = config.baseUrl + '/Signifyd-Test?OrderNumber=' + orderNumber;
            var myRequest = {
                url: url,
                method: 'GET',
                rejectUnauthorized: false,
                resolveWithFullResponse: true,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            };
            return request(myRequest)
                .then(function (response) {
                    assert.equal(response.statusCode, 200, 'Expected statusCode to be 200.');
                    var bodyAsJson = JSON.parse(response.body);
                    assert.notEqual(bodyAsJson, '0');
                });
        });
    });
});
