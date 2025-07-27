# Configuration Files

This directory contains configuration templates for FitFlow. 

## Setup Instructions

1. Copy the template files to create your actual configuration:
   ```bash
   cp pricing.config.template.json pricing.config.json
   ```

2. Edit the configuration files with your actual values:
   - `pricing.config.json` - All pricing, fees, and financial configurations

3. The actual configuration files are gitignored to prevent sensitive pricing data from being committed.

## Configuration Files

### pricing.config.json
Contains all pricing-related configurations including:
- Subscription plan pricing
- Trial package pricing
- Trainer compensation rates
- Payment processing fees
- Tax rates by province
- Discounts and promotions
- Membership tiers
- Class packages

## Important Notes

- Never commit actual configuration files (*.config.json)
- Only commit template files (*.config.template.json)
- Keep configuration files secure and backed up separately
- Use environment-specific configurations for dev/staging/production

## Loading Configuration

```javascript
// Example of loading configuration
const fs = require('fs');
const path = require('path');

function loadPricingConfig() {
  const configPath = path.join(__dirname, 'pricing.config.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error('Pricing configuration not found. Copy pricing.config.template.json to pricing.config.json');
  }
  
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

module.exports = {
  pricing: loadPricingConfig()
};
```