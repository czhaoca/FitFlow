const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const featureLoader = require('./feature-loader');

class PricingConfigLoader {
  constructor() {
    this.config = null;
    this.configPath = path.join(__dirname, '../../../config/pricing.config.json');
    this.templatePath = path.join(__dirname, '../../../config/pricing.config.template.json');
    this.lastLoaded = null;
    this.reloadInterval = process.env.CONFIG_RELOAD_INTERVAL || 3600000; // 1 hour default
  }

  /**
   * Load pricing configuration
   */
  load() {
    try {
      // Check if config file exists
      if (!fs.existsSync(this.configPath)) {
        // Try to use template for development
        if (process.env.NODE_ENV === 'development' && fs.existsSync(this.templatePath)) {
          logger.warn('Using template pricing configuration. Create pricing.config.json for production.');
          this.config = JSON.parse(fs.readFileSync(this.templatePath, 'utf8'));
        } else {
          throw new Error(
            'Pricing configuration not found. ' +
            'Copy config/pricing.config.template.json to config/pricing.config.json'
          );
        }
      } else {
        // Load actual configuration
        this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }

      // Filter config based on enabled features
      this.config = featureLoader.filterPricingConfig(this.config);
      
      this.lastLoaded = Date.now();
      this.validateConfig();
      
      logger.info('Pricing configuration loaded successfully');
      return this.config;
    } catch (error) {
      logger.error('Failed to load pricing configuration:', error);
      throw error;
    }
  }

  /**
   * Get configuration with auto-reload
   */
  get() {
    if (!this.config || this.shouldReload()) {
      this.load();
    }
    return this.config;
  }

  /**
   * Check if configuration should be reloaded
   */
  shouldReload() {
    if (!this.lastLoaded) return true;
    return Date.now() - this.lastLoaded > this.reloadInterval;
  }

  /**
   * Validate configuration structure
   */
  validateConfig() {
    const required = [
      'subscriptionPlans',
      'trialPackages',
      'paymentProcessing',
      'taxes'
    ];

    for (const field of required) {
      if (!this.config[field]) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }

    // Validate subscription plans
    const plans = Object.values(this.config.subscriptionPlans);
    for (const plan of plans) {
      if (!plan.monthlyFee || !plan.processingRate) {
        throw new Error(`Invalid subscription plan configuration: ${JSON.stringify(plan)}`);
      }
    }
  }

  /**
   * Get subscription plan by ID
   */
  getSubscriptionPlan(planId) {
    if (!featureLoader.isEnabled('subscriptionPlans')) {
      return null;
    }
    const config = this.get();
    return config.subscriptionPlans?.[planId];
  }

  /**
   * Get trial package by ID
   */
  getTrialPackage(packageId) {
    if (!featureLoader.isEnabled('trialPackages')) {
      return null;
    }
    const config = this.get();
    return config.trialPackages ? Object.values(config.trialPackages).find(pkg => pkg.id === packageId) : null;
  }

  /**
   * Calculate tax for a given amount and province
   */
  calculateTax(amount, province) {
    if (!featureLoader.isEnabled('taxSystem')) {
      return {
        rate: 0,
        amount: 0,
        total: amount
      };
    }
    
    const config = this.get();
    const taxes = config.taxes;
    if (!taxes) {
      return {
        rate: 0,
        amount: 0,
        total: amount
      };
    }
    
    let taxRate = 0;

    // GST/HST
    if (taxes.HST?.[province]) {
      taxRate = taxes.HST[province];
    } else if (taxes.GST?.provinces?.includes(province)) {
      taxRate = taxes.GST.rate;
      // Add PST if applicable
      if (taxes.PST?.[province]) {
        taxRate += taxes.PST[province];
      }
    }

    return {
      rate: taxRate,
      amount: amount * taxRate,
      total: amount * (1 + taxRate)
    };
  }

  /**
   * Get trainer compensation rate
   */
  getTrainerCompensation(type, trainerLevel = 'default', employmentType = 'contractor') {
    const config = this.get();
    const compensation = config.trainerCompensation;
    
    if (compensation[trainerLevel] && compensation[trainerLevel][type]) {
      return compensation[trainerLevel][type][employmentType] || compensation[trainerLevel][type];
    }
    
    return compensation.default[type][employmentType];
  }

  /**
   * Get processing fees
   */
  getProcessingFees(paymentMethod = 'stripe') {
    const config = this.get();
    return config.paymentProcessing[paymentMethod] || config.paymentProcessing.stripe;
  }

  /**
   * Calculate discounted price
   */
  calculateDiscount(originalPrice, discountType, metadata = {}) {
    const config = this.get();
    const discounts = config.discounts;
    
    let discountRate = 0;
    
    switch (discountType) {
      case 'earlyBird':
        if (metadata.daysInAdvance >= discounts.earlyBird.daysInAdvance) {
          discountRate = discounts.earlyBird.percentage;
        }
        break;
      
      case 'multiClass':
        const classes = metadata.classCount;
        if (classes >= 20) discountRate = discounts.multiClass['20classes'];
        else if (classes >= 10) discountRate = discounts.multiClass['10classes'];
        else if (classes >= 5) discountRate = discounts.multiClass['5classes'];
        break;
      
      case 'student':
      case 'senior':
      case 'corporate':
        discountRate = discounts[discountType];
        break;
      
      case 'referral':
        return metadata.isReferrer 
          ? discounts.referral.referrer 
          : originalPrice * (1 - discounts.referral.referee);
    }
    
    return originalPrice * (1 - discountRate);
  }

  /**
   * Get membership tier details
   */
  getMembershipTier(tierId) {
    const config = this.get();
    return config.membershipTiers[tierId];
  }

  /**
   * Get class package details
   */
  getClassPackage(packageId) {
    const config = this.get();
    return config.classPackages[packageId];
  }

  /**
   * Export configuration for client-side use (filtered)
   */
  getPublicConfig() {
    const config = this.get();
    
    // Return only non-sensitive pricing information
    return {
      currency: config.currency,
      trialPackages: Object.entries(config.trialPackages).reduce((acc, [key, pkg]) => {
        acc[key] = {
          name: pkg.name,
          description: pkg.description,
          regularPrice: pkg.regularPrice,
          trialPrice: pkg.trialPrice,
          classes: pkg.classes,
          validityDays: pkg.validityDays
        };
        return acc;
      }, {}),
      membershipTiers: Object.entries(config.membershipTiers).reduce((acc, [key, tier]) => {
        acc[key] = {
          name: tier.name,
          monthlyFee: tier.monthlyFee,
          classesPerMonth: tier.classesPerMonth,
          features: tier.features || []
        };
        return acc;
      }, {}),
      classPackages: Object.entries(config.classPackages).reduce((acc, [key, pkg]) => {
        acc[key] = {
          name: pkg.name,
          classes: pkg.classes,
          price: pkg.price,
          validityDays: pkg.validityDays
        };
        return acc;
      }, {})
    };
  }
}

// Export singleton instance
module.exports = new PricingConfigLoader();