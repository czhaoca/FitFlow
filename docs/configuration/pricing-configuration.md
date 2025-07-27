# Pricing Configuration Guide

## Overview

FitFlow uses an external JSON configuration file for all pricing-related settings. This approach allows for:
- Easy pricing updates without code changes
- Environment-specific pricing (dev/staging/production)
- Secure pricing data management (excluded from version control)
- Centralized pricing logic

## Setup

### 1. Create Configuration File

Copy the template to create your configuration:

```bash
cd config
cp pricing.config.template.json pricing.config.json
```

### 2. Edit Configuration

Edit `config/pricing.config.json` with your actual pricing values. The file is structured as follows:

```json
{
  "subscriptionPlans": { ... },
  "trialPackages": { ... },
  "trainerCompensation": { ... },
  "paymentProcessing": { ... },
  "taxes": { ... },
  "discounts": { ... },
  "membershipTiers": { ... },
  "classPackages": { ... }
}
```

### 3. Environment Variables

Set the configuration reload interval (optional):

```bash
CONFIG_RELOAD_INTERVAL=3600000  # 1 hour in milliseconds
```

## Configuration Structure

### Subscription Plans

Define SaaS subscription tiers:

```json
"subscriptionPlans": {
  "starter": {
    "name": "Starter",
    "monthlyFee": 29,
    "includedBookings": 50,
    "overageRate": 0.50,
    "processingRate": 0.029,
    "transactionFee": 0.30,
    "maxTrainers": 1,
    "features": ["Basic scheduling", "Payment processing"]
  }
}
```

### Trial Packages

Configure trial offerings:

```json
"trialPackages": {
  "singleClass": {
    "id": "trial-single",
    "name": "Single Class Trial",
    "regularPrice": 25,
    "trialPrice": 10,
    "classes": 1,
    "validityDays": 7
  }
}
```

### Trainer Compensation

Set compensation rates by trainer level and employment type:

```json
"trainerCompensation": {
  "default": {
    "groupClass": {
      "employee": 0.50,      // 50% of revenue
      "contractor": 0.70,    // 70% of revenue
      "trialClass": 25       // Fixed $25 for trial classes
    }
  },
  "seniorTrainer": {
    "groupClass": 0.60,
    "yearsExperienceRequired": 5
  }
}
```

### Tax Configuration

Canadian tax rates by province:

```json
"taxes": {
  "GST": {
    "rate": 0.05,
    "provinces": ["AB", "BC", "MB", "NT", "NU", "QC", "SK", "YT"]
  },
  "HST": {
    "ON": 0.13,
    "NS": 0.15
  }
}
```

## Usage in Code

### Loading Configuration

```javascript
const config = require('./services/shared/config');

// Get entire pricing configuration
const pricingConfig = config.pricing;

// Get specific plan
const starterPlan = config.getSubscriptionPlan('starter');

// Calculate tax
const taxInfo = config.calculateTax(100, 'ON');
// Returns: { rate: 0.13, amount: 13, total: 113 }
```

### Using the Pricing Service

```javascript
const pricingService = require('./services/payment/services/pricingService');

// Calculate booking total with tax and discount
const total = pricingService.calculateBookingTotal(
  100,        // base price
  'ON',       // province
  'student',  // discount type
  {}         // discount metadata
);

// Get trainer payout
const payout = pricingService.calculateTrainerPayout(
  'groupClass',
  100,          // session price
  'default',    // trainer level
  'contractor'  // employment type
);

// Validate promo code
const promo = pricingService.validatePromoCode('SUMMER2024', {
  isNewClient: true
});
```

## API Endpoints

### Public Endpoints

```bash
# Get public pricing information
GET /api/payment/pricing/public

# Get trial packages
GET /api/payment/pricing/trial-packages

# Get membership options
GET /api/payment/pricing/membership-options

# Get class packages
GET /api/payment/pricing/class-packages

# Get subscription plan details
GET /api/payment/pricing/subscription/:planId
```

### Private Endpoints

```bash
# Calculate pricing for a booking
POST /api/payment/pricing/calculate
{
  "basePrice": 100,
  "province": "ON",
  "discountType": "student",
  "discountMetadata": {}
}

# Validate promotional code
POST /api/payment/pricing/validate-promo
{
  "code": "SUMMER2024",
  "context": {
    "isNewClient": true
  }
}

# Calculate trainer payout
POST /api/payment/pricing/trainer-payout
{
  "sessionType": "groupClass",
  "sessionPrice": 100,
  "trainerLevel": "default",
  "employmentType": "contractor"
}
```

## Security Considerations

1. **Never commit actual pricing files** - Only commit template files
2. **Use environment-specific configs** - Different pricing for dev/staging/prod
3. **Secure file permissions** - Restrict read access to application user
4. **Backup configurations** - Keep secure backups of production configs
5. **Audit changes** - Log all configuration reloads and changes

## Configuration Validation

The system validates configuration on load:
- Required fields presence
- Data type validation
- Logical consistency (e.g., rates between 0 and 1)
- Plan structure completeness

Invalid configurations will prevent application startup.

## Hot Reloading

Configuration is automatically reloaded based on `CONFIG_RELOAD_INTERVAL`:
- Default: 1 hour
- Set to 0 to disable auto-reload
- Manual reload available via API endpoint (admin only)

## Troubleshooting

### Configuration Not Found

```
Error: Pricing configuration not found. Copy config/pricing.config.template.json to config/pricing.config.json
```

**Solution**: Create the configuration file from template

### Invalid Configuration

```
Error: Missing required configuration field: subscriptionPlans
```

**Solution**: Ensure all required fields are present in configuration

### Permission Denied

```
Error: EACCES: permission denied, open 'config/pricing.config.json'
```

**Solution**: Check file permissions: `chmod 640 config/pricing.config.json`

## Best Practices

1. **Version your configurations** - Keep a history of pricing changes
2. **Test pricing changes** - Validate in staging before production
3. **Document changes** - Include reason and date for pricing updates
4. **Gradual rollouts** - Use feature flags for major pricing changes
5. **Monitor impact** - Track metrics after pricing updates

## Migration Guide

### From Hardcoded Pricing

1. Extract all hardcoded prices to configuration
2. Replace direct values with config calls
3. Test all pricing calculations
4. Deploy configuration before code

### Updating Prices

1. Update configuration file
2. Test in development
3. Deploy to staging for validation
4. Schedule production deployment
5. Monitor for issues

## Example Configurations

### Development Environment

Lower prices for testing:

```json
{
  "subscriptionPlans": {
    "starter": {
      "monthlyFee": 1,
      "processingRate": 0
    }
  }
}
```

### Promotional Period

Temporary discounts:

```json
{
  "promotions": {
    "seasonal": {
      "blackFriday": 0.50,
      "validFrom": "2024-11-24",
      "validTo": "2024-11-30"
    }
  }
}
```