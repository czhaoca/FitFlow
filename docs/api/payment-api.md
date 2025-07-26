# Payment API Documentation

## Overview
The Payment Service handles all payment processing through Stripe, including one-time payments, subscriptions, refunds, and payment method management.

## Base URL
```
http://localhost:3002/api/payment
```

## Authentication
All endpoints (except webhook) require JWT authentication via Bearer token:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Create Payment Intent
Create a payment intent for a single appointment payment.

**POST** `/payment-intent`

**Request Body:**
```json
{
  "amount": 100.00,
  "appointmentId": "uuid",
  "clientId": "uuid",
  "trainerId": "uuid",
  "studioId": "uuid" // optional
}
```

**Response:**
```json
{
  "clientSecret": "pi_xxx_secret_xxx",
  "paymentIntentId": "pi_xxx",
  "amount": 100.00
}
```

### Create Package Payment
Create a payment intent for a package purchase.

**POST** `/package-payment`

**Request Body:**
```json
{
  "packageId": "uuid",
  "clientId": "uuid",
  "trainerId": "uuid"
}
```

**Response:**
```json
{
  "clientSecret": "pi_xxx_secret_xxx",
  "paymentIntentId": "pi_xxx",
  "amount": 500.00
}
```

### Create Subscription
Create a recurring subscription for a package.

**POST** `/subscription`

**Request Body:**
```json
{
  "packageId": "uuid",
  "clientId": "uuid",
  "trainerId": "uuid",
  "paymentMethodId": "pm_xxx"
}
```

**Response:**
```json
{
  "subscriptionId": "sub_xxx",
  "status": "active",
  "currentPeriodEnd": 1234567890
}
```

### Cancel Subscription
Cancel an active subscription.

**PUT** `/subscription/:subscriptionId/cancel`

**Request Body:**
```json
{
  "immediately": false // optional, default false (cancel at period end)
}
```

**Response:**
```json
{
  "subscriptionId": "sub_xxx",
  "status": "canceled",
  "cancelAtPeriodEnd": true
}
```

### Create Refund
Process a refund for a payment.

**POST** `/refund`

**Request Body:**
```json
{
  "paymentIntentId": "pi_xxx",
  "amount": 50.00, // optional, for partial refund
  "reason": "requested_by_customer" // optional
}
```

**Response:**
```json
{
  "refundId": "re_xxx",
  "amount": 50.00,
  "status": "succeeded"
}
```

### Save Payment Method
Save a payment method for future use.

**POST** `/payment-method`

**Request Body:**
```json
{
  "paymentMethodId": "pm_xxx",
  "clientId": "uuid"
}
```

**Response:**
```json
{
  "paymentMethodId": "pm_xxx",
  "type": "card",
  "card": {
    "brand": "visa",
    "last4": "4242",
    "expMonth": 12,
    "expYear": 2025
  }
}
```

### List Payment Methods
Get all saved payment methods for a client.

**GET** `/payment-methods/:clientId`

**Response:**
```json
{
  "paymentMethods": [
    {
      "id": "pm_xxx",
      "type": "card",
      "card": {
        "brand": "visa",
        "last4": "4242",
        "expMonth": 12,
        "expYear": 2025
      }
    }
  ]
}
```

### Delete Payment Method
Remove a saved payment method.

**DELETE** `/payment-method/:paymentMethodId`

**Request Body:**
```json
{
  "clientId": "uuid"
}
```

**Response:**
```json
{
  "success": true
}
```

### Get Payment History
Retrieve payment history for a client.

**GET** `/history/:clientId`

**Query Parameters:**
- `limit` (optional): Number of records to return (default: 20)
- `offset` (optional): Number of records to skip (default: 0)

**Response:**
```json
{
  "payments": [
    {
      "id": "uuid",
      "amount": 100.00,
      "status": "completed",
      "paymentDate": "2024-01-15",
      "paymentMethod": "stripe",
      "appointmentDetails": {
        "date": "2024-01-20",
        "trainer": "John Doe"
      }
    }
  ],
  "limit": 20,
  "offset": 0
}
```

### Get Payment Details
Get detailed information about a specific payment.

**GET** `/payment/:paymentId`

**Response:**
```json
{
  "id": "uuid",
  "amount": 100.00,
  "status": "completed",
  "paymentDate": "2024-01-15",
  "paymentMethod": "stripe",
  "stripePaymentIntentId": "pi_xxx",
  "refundInfo": null,
  "appointmentDetails": {
    "id": "uuid",
    "date": "2024-01-20",
    "trainer": "John Doe",
    "classType": "Personal Training"
  }
}
```

### Webhook Endpoint
Handle Stripe webhook events.

**POST** `/webhook`

**Headers:**
```
Stripe-Signature: t=xxx,v1=xxx
Content-Type: application/json
```

**Note:** This endpoint requires the raw request body and uses Stripe signature verification.

## Error Responses

All endpoints may return the following error structures:

### 400 Bad Request
```json
{
  "error": "Validation error message"
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "error": "Insufficient permissions"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

## Rate Limiting
- Standard endpoints: 100 requests per 15 minutes per IP
- Sensitive operations (refunds, payment creation): 10 requests per 15 minutes per IP

## Webhook Events
The service handles the following Stripe webhook events:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `subscription.created`
- `subscription.updated`
- `subscription.deleted`
- `invoice.payment_succeeded`

## Integration Example

### Client-Side Payment Flow
```javascript
// 1. Create payment intent
const response = await fetch('/api/payment/payment-intent', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: 100.00,
    appointmentId: 'uuid',
    clientId: 'uuid',
    trainerId: 'uuid'
  })
});

const { clientSecret } = await response.json();

// 2. Confirm payment with Stripe.js
const result = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: {
      name: 'John Doe',
      email: 'john@example.com'
    }
  }
});

if (result.error) {
  // Handle error
} else {
  // Payment successful
}
```