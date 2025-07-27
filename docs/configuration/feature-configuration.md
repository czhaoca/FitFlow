# Feature Configuration Guide

## Overview

FitFlow uses a two-tier configuration system:
1. **Feature Configuration** - Controls which features are enabled/disabled
2. **Pricing Configuration** - Contains actual pricing values for enabled features

This approach allows you to:
- Enable/disable entire feature sets without code changes
- Customize which options are available within each feature
- Automatically filter pricing configuration based on enabled features
- Validate feature dependencies

## Configuration Files

### 1. features.config.json
Controls which features are available in the system.

### 2. pricing.config.json  
Contains pricing values only for enabled features.

## Feature Configuration Structure

### Top-Level Features

```json
{
  "features": {
    "subscriptionPlans": {
      "enabled": true,
      "availablePlans": {
        "starter": true,
        "professional": true,
        "business": true,
        "enterprise": false
      }
    }
  }
}
```

### Feature Categories

#### 1. Subscription Plans
Controls SaaS subscription tiers:
```json
"subscriptionPlans": {
  "enabled": true,
  "availablePlans": {
    "starter": true,      // $29/month plan
    "professional": true, // $99/month plan
    "business": true,     // $299/month plan
    "enterprise": false   // Custom pricing (disabled)
  }
}
```

#### 2. Trial Packages
Controls trial offerings for new clients:
```json
"trialPackages": {
  "enabled": true,
  "availablePackages": {
    "singleClass": true,      // Single class trial
    "weekUnlimited": true,    // 7-day unlimited
    "twoWeekPass": false,     // Not offered
    "monthDiscovery": false   // Not offered
  },
  "requirePayment": true,
  "autoConversionReminders": true
}
```

#### 3. Membership Tiers
Monthly membership options:
```json
"membershipTiers": {
  "enabled": true,
  "availableTiers": {
    "basic": true,
    "standard": true,
    "premium": true,
    "unlimited": true
  },
  "features": {
    "rolloverClasses": true,
    "guestPasses": false,     // Disabled feature
    "priorityBooking": true
  }
}
```

#### 4. Class Packages
Pre-paid class bundles:
```json
"classPackages": {
  "enabled": true,
  "availablePackages": {
    "dropIn": true,
    "pack5": true,
    "pack10": true,
    "pack20": true,
    "pack50": false    // Large package not offered
  }
}
```

#### 5. Payment Methods
Available payment options:
```json
"paymentMethods": {
  "stripe": {
    "enabled": true,
    "features": {
      "creditCard": true,
      "bankAccount": false,   // ACH disabled
      "walletPay": true,
      "subscriptions": true
    }
  },
  "interac": {
    "enabled": true,
    "autoReconciliation": false
  },
  "cash": {
    "enabled": true,
    "requiresReceipt": true
  },
  "cheque": {
    "enabled": false    // Not accepted
  }
}
```

## How Feature Filtering Works

### Automatic Filtering

When pricing configuration is loaded, it's automatically filtered based on enabled features:

```javascript
// Original pricing.config.json might have:
{
  "trialPackages": {
    "singleClass": { "price": 10 },
    "weekUnlimited": { "price": 25 },
    "monthDiscovery": { "price": 59 }  // This exists in config
  }
}

// If features.config.json has monthDiscovery: false
// The loaded configuration will only contain:
{
  "trialPackages": {
    "singleClass": { "price": 10 },
    "weekUnlimited": { "price": 25 }
    // monthDiscovery is filtered out
  }
}
```

### Code Examples

#### Check if a feature is enabled:
```javascript
const featureLoader = require('./services/shared/config/feature-loader');

if (featureLoader.isEnabled('trialPackages')) {
  // Show trial packages
}

if (featureLoader.isEnabled('paymentMethods.stripe')) {
  // Enable Stripe payments
}
```

#### Get enabled options for a feature:
```javascript
const trialPackages = featureLoader.getEnabledFeatures('trialPackages');
// Returns:
{
  enabled: true,
  features: {
    singleClass: true,
    weekUnlimited: true
  },
  settings: {
    requirePayment: true,
    autoConversionReminders: true
  }
}
```

#### Filter pricing based on features:
```javascript
const config = require('./services/shared/config');

// This automatically returns filtered pricing
const pricing = config.pricing;

// Only enabled trial packages will be included
const trials = pricing.trialPackages; // Only singleClass and weekUnlimited
```

## Business Rules Configuration

Define operational rules:
```json
"businessRules": {
  "minimumBookingWindow": 2,      // Hours in advance
  "maximumBookingWindow": 30,     // Days in advance
  "cancellationWindow": 24,       // Hours before class
  "sessionDuration": [30, 45, 60, 90],  // Available durations
  "businessHours": {
    "monday": { "open": "06:00", "close": "21:00" },
    "saturday": { "open": "08:00", "close": "18:00" }
  }
}
```

## Conditional UI/UX

### Example: Dynamic Pricing Page

```javascript
async function buildPricingPage() {
  const sections = [];
  
  // Only show trial packages if enabled
  if (featureLoader.isEnabled('trialPackages')) {
    const trials = await getEnabledTrialPackages();
    sections.push({
      title: 'Trial Packages',
      items: trials
    });
  }
  
  // Only show memberships if enabled
  if (featureLoader.isEnabled('membershipTiers')) {
    const memberships = await getEnabledMemberships();
    sections.push({
      title: 'Monthly Memberships',
      items: memberships
    });
  }
  
  return sections;
}
```

### Example: Payment Method Selection

```javascript
async function getPaymentOptions() {
  const options = [];
  
  if (featureLoader.isPaymentMethodEnabled('stripe')) {
    options.push({ id: 'card', name: 'Credit/Debit Card' });
  }
  
  if (featureLoader.isPaymentMethodEnabled('interac')) {
    options.push({ id: 'etransfer', name: 'Interac e-Transfer' });
  }
  
  if (featureLoader.isPaymentMethodEnabled('cash')) {
    options.push({ id: 'cash', name: 'Cash (at reception)' });
  }
  
  return options;
}
```

## Migration Strategy

### From All-Inclusive to Feature-Based

1. **Audit Current Features**
   - List all features currently in use
   - Identify which are actually needed
   - Mark unused features for removal

2. **Create Feature Configuration**
   ```bash
   cp features.config.template.json features.config.json
   # Edit to disable unused features
   ```

3. **Simplify Pricing Configuration**
   - Remove pricing for disabled features
   - Reduces configuration complexity
   - Easier to maintain

4. **Update Code**
   - Add feature checks where needed
   - Update UI to hide disabled features
   - Test with various configurations

## Common Scenarios

### Scenario 1: Simple Studio (Minimal Features)

```json
{
  "features": {
    "subscriptionPlans": {
      "enabled": false    // No SaaS fees
    },
    "trialPackages": {
      "enabled": true,
      "availablePackages": {
        "singleClass": true,
        "weekUnlimited": false,
        "twoWeekPass": false,
        "monthDiscovery": false
      }
    },
    "membershipTiers": {
      "enabled": false    // Drop-in only
    },
    "classPackages": {
      "enabled": true,
      "availablePackages": {
        "dropIn": true,
        "pack5": true,
        "pack10": true,
        "pack20": false
      }
    }
  }
}
```

### Scenario 2: Premium Studio (All Features)

```json
{
  "features": {
    "subscriptionPlans": {
      "enabled": true,
      "availablePlans": {
        "starter": false,
        "professional": false,
        "business": true,
        "enterprise": true
      }
    },
    "membershipTiers": {
      "enabled": true,
      "availableTiers": {
        "basic": true,
        "standard": true,
        "premium": true,
        "unlimited": true
      },
      "features": {
        "rolloverClasses": true,
        "guestPasses": true,
        "priorityBooking": true,
        "memberDiscounts": true
      }
    }
  }
}
```

### Scenario 3: Yoga Studio (Specific Needs)

```json
{
  "features": {
    "specialPrograms": {
      "enabled": true,
      "types": {
        "workshops": true,
        "teacherTraining": true,
        "retreats": true,
        "intensives": false
      }
    },
    "classPackages": {
      "enabled": true,
      "availablePackages": {
        "dropIn": true,
        "pack5": false,    // Encourage commitment
        "pack10": true,
        "pack20": true
      }
    }
  }
}
```

## Feature Dependencies

Some features require others to be enabled:

```javascript
// Validation example
const errors = featureLoader.validateDependencies();
// Returns: ['Subscription plans require Stripe payment method to be enabled']
```

### Common Dependencies:
- **Subscriptions** → Requires Stripe
- **Trial Package Payment** → Requires at least one payment method
- **Auto Tax Remittance** → Requires tax system
- **Package Sharing** → Requires client accounts
- **Priority Booking** → Requires membership tiers

## Best Practices

1. **Start Minimal**
   - Enable only features you need
   - Add features as business grows
   - Review quarterly

2. **Test Configurations**
   - Test with features disabled
   - Ensure UI adapts properly
   - Validate business logic

3. **Document Decisions**
   - Why features are enabled/disabled
   - Business rationale
   - Review schedule

4. **Monitor Usage**
   - Track which features are used
   - Identify unused features
   - Optimize configuration

## Troubleshooting

### Feature Not Appearing
```javascript
// Debug feature loading
console.log(featureLoader.isEnabled('trialPackages')); // false
console.log(featureLoader.getEnabledFeatures('trialPackages')); // null
```

### Pricing Not Loading
```javascript
// Check if pricing is filtered out
const config = require('./services/shared/config');
console.log(config.pricing.trialPackages); // undefined if disabled
```

### Dependency Errors
```javascript
// Validate all dependencies
const errors = featureLoader.validateDependencies();
errors.forEach(error => console.error(error));
```