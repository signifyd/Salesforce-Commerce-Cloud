# Signifyd Salesforce Commerce Cloud Integration - API Documentation

## Overview

Signifyd's Salesforce Commerce Cloud Integration provides automated fraud prevention and protection against chargebacks. This integration enables merchants to automatically send orders to Signifyd for fraud review and receive decisions backed by a 100% financial guarantee.

## Architecture

The integration consists of three main cartridges:
- **`int_signifyd`** - Core integration cartridge (SiteGenesis compatible)
- **`int_signifyd_sfra`** - SFRA (Storefront Reference Architecture) integration
- **`signifyd_sfra_changes`** - SFRA customizations and modifications

---

## Core Service APIs

### Main Service Class: `signifyd.js`

Location: `int_signifyd/cartridge/scripts/service/signifyd.js`

#### Public Methods

##### `Call(order, postAuthFallback)`
**Purpose**: Submit order to Signifyd for fraud analysis  
**Parameters**:
- `order` (dw.order.Order) - The order object to analyze
- `postAuthFallback` (Boolean) - Whether this is a post-authorization fallback call

**Usage Example**:
```javascript
var Signifyd = require('int_signifyd/cartridge/scripts/service/signifyd');
var order = OrderMgr.getOrder('00000001');
var response = Signifyd.Call(order, false);
```

**Response**:
- Returns service response object with case information
- Sets `order.custom.SignifydCaseID` with Signifyd case ID
- Updates order with tracking information

##### `Callback(request)`
**Purpose**: Receive and process decision callbacks from Signifyd  
**Parameters**:
- `request` (HTTP Request) - Webhook request from Signifyd

**Usage**: Configured as webhook endpoint in Signifyd dashboard
```
URL: https://your-site.com/on/demandware.store/Sites-YourSite-Site/default/Signifyd-Callback
```

**Processing**:
- Validates HMAC signature for security
- Updates order with fraud score and decision
- Manages order export status based on decision

##### `SendTransaction(order)`
**Purpose**: Send transaction information post-authorization  
**Parameters**:
- `order` (dw.order.Order) - The order with transaction details

**Usage Example**:
```javascript
// Called after payment authorization
Signifyd.SendTransaction(order);
```

##### `getOrderSessionId()`
**Purpose**: Generate unique session ID for device fingerprinting  
**Returns**: Base64 encoded session identifier

**Usage Example**:
```javascript
var sessionId = Signifyd.getOrderSessionId();
// Returns: encoded string for device fingerprinting
```

##### `setOrderSessionId(order, orderSessionId)`
**Purpose**: Store session ID on order for tracking  
**Parameters**:
- `order` (dw.order.Order) - Target order
- `orderSessionId` (String) - Session identifier

---

## Service Initialization APIs

### Service Registry: `signifydInit.js`

Location: `int_signifyd/cartridge/scripts/service/signifydInit.js`

#### Service Configurations

##### `checkout()`
**Purpose**: Initialize checkout/case creation service
**Returns**: dw.svc.Service configured for case creation

##### `sale()`
**Purpose**: Initialize sale/transaction service  
**Returns**: dw.svc.Service configured for transaction updates

##### `transaction()`
**Purpose**: Initialize transaction service
**Returns**: dw.svc.Service configured for transaction data

##### `sendFulfillment()`
**Purpose**: Initialize fulfillment notification service
**Returns**: dw.svc.Service configured for fulfillment updates

##### `sendReroute()`
**Purpose**: Initialize order rerouting service
**Returns**: dw.svc.Service configured for reroute notifications

**Service Configuration Example**:
```javascript
var signifydInit = require('int_signifyd/cartridge/scripts/service/signifydInit');
var checkoutService = signifydInit.checkout();
var response = checkoutService.call(orderData);
```

---

## Controllers

### SFRA Controller: `CheckoutServices.js`

Location: `int_signifyd_sfra/cartridge/controllers/CheckoutServices.js`

#### Modified Endpoints

##### `PlaceOrder`
**Purpose**: Extended checkout process with Signifyd integration  
**Method**: POST  
**URL**: `/CheckoutServices-PlaceOrder`

**Integration Points**:
1. **Pre-Authorization** (if `SignifydCreateCasePolicy = "PRE_AUTH"`):
   ```javascript
   // Generate session ID
   var orderSessionID = Signifyd.getOrderSessionId();
   
   // Create case before payment
   var signifyResponse = Signifyd.Call(order, false);
   
   // Handle declined orders
   if (signifyResponse.declined && !SignifydPassiveMode) {
       OrderMgr.failOrder(order);
       return error;
   }
   ```

2. **Post-Authorization**:
   ```javascript
   // Send transaction data
   if (SignifydCreateCasePolicy === "PRE_AUTH") {
       Signifyd.SendTransaction(order);
   } else {
       // Create case after payment
       Signifyd.setOrderSessionId(order, orderSessionID);
       Signifyd.Call(order, postAuthFallback);
   }
   ```

### Main Controller: `Signifyd.js`

Location: `int_signifyd/cartridge/controllers/Signifyd.js`

#### Public Endpoints

##### `Test`
**Purpose**: Test Signifyd integration with specific order  
**Method**: GET  
**URL**: `/Signifyd-Test?OrderNumber=00000001`

**Response**: JSON with case ID
```json
[{"caseId": "123456789"}]
```

##### `Callback`
**Purpose**: Receive webhooks from Signifyd  
**Method**: POST  
**URL**: `/Signifyd-Callback`  
**Public**: true

**Expected Headers**:
- `signifyd-sec-hmac-sha256`: HMAC signature
- `x-signifyd-topic`: Event type

##### `IncludeFingerprint`
**Purpose**: Render device fingerprinting script  
**Method**: GET  
**URL**: `/Signifyd-IncludeFingerprint`  
**Public**: true

---

## Job Scripts

### Batch Processing: `createMissingOrders.js`

Location: `int_signifyd/cartridge/scripts/job/createMissingOrders.js`

#### Main Function

##### `execute(args)`
**Purpose**: Process orders that failed to submit to Signifyd  
**Parameters**:
- `args.StartDate` (String) - Start date filter (MM/DD/YYYY format)

**Job Configuration**:
```xml
<job job-id="SignifydCreateMissingOrders">
    <description>Submit orders to Signifyd that failed initial submission</description>
    <parameters>
        <parameter name="StartDate" type="string" required="false"/>
    </parameters>
    <flow>
        <context site-id="Sites-YourSite-Site"/>
        <step step-id="ProcessOrders" type="script">
            <description>Process missing orders</description>
            <parameters>
                <parameter name="script-file">int_signifyd/cartridge/scripts/job/createMissingOrders.js</parameter>
            </parameters>
        </step>
    </flow>
</job>
```

**Search Criteria**:
- Orders with retry count less than `SignifydMaxRetryCount`
- Orders without Signifyd case ID
- Orders not flagged for payment method exclusion
- Orders created after specified start date

---

## Templates and UI Components

### Device Fingerprinting

#### Template: `signifyd_device_fingerprint.isml`
Location: `int_signifyd/cartridge/templates/default/signifyd_device_fingerprint.isml`

**Purpose**: Inject Signifyd's device fingerprinting JavaScript

**Template Code**:
```html
<script async type="text/javascript" id="sig-api" 
        data-order-session-id="${require('int_signifyd/cartridge/scripts/service/signifyd').getOrderSessionId()}" 
        src="https://cdn-scripts.signifyd.com/api/script-tag.js">
</script>
```

#### SFRA Include: `signifydInclude.isml`
Location: `int_signifyd_sfra/cartridge/templates/default/signifydInclude.isml`

**Purpose**: Conditionally include fingerprinting via remote include

**Template Code**:
```html
<isif condition="${dw.system.Site.getCurrent().getCustomPreferenceValue('SignifydEnableCartridge')}">
    <isinclude url="${URLUtils.url('Signifyd-IncludeFingerprint')}" />
</isif>
```

### Hook Integration

#### SFRA Hook: `signifydHook.js`
Location: `int_signifyd_sfra/cartridge/scripts/hooks/signifydHook.js`

**Hook Configuration**:
```json
{
    "hooks": [
        {
            "name": "app.template.htmlHead",
            "script": "./hooks/signifydHook.js"
        }
    ]
}
```

**Implementation**:
```javascript
exports.htmlHead = function () {
    require('dw/template/ISML').renderTemplate('signifydInclude');
};
```

---

## Helper Functions and Utilities

### Checkout Helpers: `checkoutHelpers.js`

Location: `signifyd_sfra_changes/cartridge/scripts/checkout/checkoutHelpers.js`

#### Modified Functions

##### `placeOrder(order, fraudDetectionStatus)`
**Purpose**: Enhanced order placement with Signifyd integration

**Key Modifications**:
```javascript
var signifyEnabled = dw.system.Site.getCurrent().getCustomPreferenceValue('SignifydEnableCartridge');
var signifydHoldOrderEnable = dw.system.Site.getCurrent().getCustomPreferenceValue('SignifydHoldOrderEnable');

if (signifyEnabled) {
    if (signifydHoldOrderEnable === true) {
        order.setExportStatus(Order.EXPORT_STATUS_NOTEXPORTED);
    } else {
        order.setExportStatus(Order.EXPORT_STATUS_READY);
    }
}
```

---

## Configuration and Site Preferences

### Required Site Preferences

| Preference | Type | Description |
|------------|------|-------------|
| `SignifydEnableCartridge` | Boolean | Enable/disable the integration |
| `SignifydApiKey` | String | Signifyd API key for authentication |
| `SignifydHoldOrderEnable` | Boolean | Hold orders pending Signifyd decision |
| `SignifydCreateCasePolicy` | Enum | When to create cases (PRE_AUTH/POST_AUTH) |
| `SignifydDecisionRequest` | Enum | Type of decision requested (GUARANTEE/DECISION) |
| `SignifydPassiveMode` | Boolean | Run in passive mode (no order blocking) |
| `SignifydMaxRetryCount` | Integer | Maximum retry attempts for failed orders |
| `SignifydEnablePostAuthFallback` | Boolean | Enable post-auth fallback |
| `SignifydSCAEnableSCAEvaluation` | Boolean | Enable SCA evaluation |

### Seller Information Preferences

| Preference | Type | Description |
|------------|------|-------------|
| `SignifydSellerName` | String | Merchant name |
| `SignifydSellerDomain` | String | Merchant domain |
| `SignifydFromStreet` | String | Ship-from address street |
| `SignifydFromCity` | String | Ship-from address city |
| `SignifydFromState` | String | Ship-from address state |
| `SignifydFromPostCode` | String | Ship-from address postal code |
| `SignifydFromCountry` | String | Ship-from address country |
| `SignifydCorporateStreet` | String | Corporate address street |
| `SignifydCorporateCity` | String | Corporate address city |

---

## Data Flow and Integration Points

### Order Processing Flow

1. **Customer places order**
2. **Pre-Authorization** (if enabled):
   ```
   Generate Session ID → Create Signifyd Case → Evaluate Response → Proceed/Block Order
   ```
3. **Payment Processing**
4. **Post-Authorization**:
   ```
   Send Transaction Data → Place Order → Send Confirmation Email
   ```

### Callback Processing Flow

1. **Signifyd sends webhook**
2. **Validate HMAC signature**
3. **Parse decision data**:
   ```json
   {
     "orderId": "00000001",
     "signifydId": "123456789",
     "decision": {
       "score": 850,
       "checkpointAction": "ACCEPT",
       "checkpointActionReason": "Low Risk"
     }
   }
   ```
4. **Update order**:
   - Set fraud score
   - Set policy decision
   - Update export status
   - Store Signifyd case URL

### Custom Order Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `SignifydCaseID` | String | Signifyd case identifier |
| `SignifydOrderURL` | String | URL to Signifyd case |
| `SignifydFraudScore` | Integer | Fraud risk score (0-1000) |  
| `SignifydPolicy` | String | Decision (accept/reject/hold) |
| `SignifydPolicyName` | String | Decision reason |
| `SignifydOrderSessionId` | String | Device fingerprint session ID |
| `SignifydRetryCount` | Integer | Number of retry attempts |
| `SignifydOrderFailedReason` | String | Failure reason for blocked orders |
| `SignifydPaymentMethodExclusionFlag` | Boolean | Payment method exclusion flag |

---

## Error Handling and Logging

### Logging Configuration

Logger: `Signifyd` category with `signifyd` subcategory

**Log Levels**:
- **DEBUG**: API requests/responses
- **INFO**: Processing status
- **ERROR**: Integration failures

**Example Log Statements**:
```javascript
Logger.getLogger('Signifyd', 'signifyd').debug('Debug: API callback body: {0}', body);
Logger.getLogger('Signifyd', 'signifyd').error('Error: API Callback processing was interrupted because:{0}', ex.message);
```

### Error Scenarios

1. **Invalid API Key**: 401 Unauthorized response
2. **HMAC Validation Failure**: Request rejected for security
3. **Service Unavailable**: Retry mechanism via job
4. **Payment Method Exclusion**: Order processing continues without Signifyd
5. **Network Timeouts**: Logged and retried via batch job

---

## Testing and Development

### Test Endpoints

#### Test Integration
```
GET /Signifyd-Test?OrderNumber=00000001
```

**Response Format**:
```json
[{"caseId": "123456789"}]
```

### Development Configuration

#### Service Definitions Required

Create these services in Business Manager > Administration > Operations > Services:

1. **SignifydCheckout**
   - URL: `https://api.signifyd.com/v2/cases`
   - Method: POST

2. **SignifydSale** 
   - URL: `https://api.signifyd.com/v2/cases`
   - Method: POST

3. **SignifydTransaction**
   - URL: `https://api.signifyd.com/v2/cases/{caseId}/transactions`
   - Method: POST

4. **SignifydSendFullfilment**
   - URL: `https://api.signifyd.com/v2/cases/orderId/fulfillments`
   - Method: POST

5. **SignifydReroute**
   - URL: `https://api.signifyd.com/v2/cases/{caseId}/reroute`
   - Method: POST

### Mock Testing

Services include mock responses for testing:
```javascript
mockCall: function () {
    return {
        statusCode: 200,
        statusMessage: 'Form post successful',
        text: '{ "investigationId": 1}'
    };
}
```

---

## Security Considerations

### HMAC Validation

All webhook callbacks are validated using HMAC-SHA256:

```javascript
var hmacKey = headers.get('signifyd-sec-hmac-sha256');
var crypt = new Mac(Mac.HMAC_SHA_256);
var cryptedBody = crypt.digest(body, APIkey);
var cryptedBodyString = Encoding.toBase64(cryptedBody);

if (cryptedBodyString.equals(hmacKey)) {
    // Process valid request
} else {
    // Reject unauthorized request
}
```

### Data Protection

- Credit card information is masked in logs on production systems
- API keys are stored in site preferences (encrypted)
- Device fingerprinting uses secure HTTPS endpoints

---

## Performance Considerations

### Asynchronous Processing

- Device fingerprinting loads asynchronously
- Webhook processing is event-driven
- Batch job handles failed/retry scenarios

### Caching Strategy

- Device fingerprint includes cache-busting via remote include
- Session IDs are generated per basket to avoid caching issues

---

## Troubleshooting Guide

### Common Issues

1. **Orders not appearing in Signifyd**
   - Check `SignifydEnableCartridge` preference
   - Verify API key configuration
   - Review service definitions
   - Check payment method exclusions

2. **Callback processing failures**
   - Verify webhook URL configuration
   - Check HMAC key validation
   - Review network connectivity

3. **Device fingerprinting not loading**
   - Verify hook registration
   - Check template inclusion
   - Review Content Security Policy settings

### Diagnostic Steps

1. **Enable debug logging**
2. **Test with known order**: `GET /Signifyd-Test?OrderNumber=00000001`
3. **Review custom order attributes**
4. **Check service call logs**
5. **Validate webhook configuration**

---

## Version Information

- **Integration Version**: Available in `signifyd_version.properties`
- **Supported SFCC Versions**: 20.1+
- **Supported Architectures**: SiteGenesis, SFRA
- **API Version**: Signifyd v2 REST API

---

## Support and Resources

### Documentation
- Integration documentation: `link/documentation/Signifyd LINK Integration Documentation 22.1.0.docx`
- Signifyd API Documentation: https://docs.signifyd.com/

### Configuration URLs
- Signifyd Dashboard: https://app.signifyd.com/
- Webhook Configuration: https://app.signifyd.com/settings/notifications

### Contact Information
- Technical Support: Available through Signifyd dashboard
- Integration Questions: Consult integration documentation