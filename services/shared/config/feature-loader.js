const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class FeatureConfigLoader {
  constructor() {
    this.config = null;
    this.configPath = path.join(__dirname, '../../../config/features.config.json');
    this.templatePath = path.join(__dirname, '../../../config/features.config.template.json');
    this.lastLoaded = null;
  }

  /**
   * Load feature configuration
   */
  load() {
    try {
      if (!fs.existsSync(this.configPath)) {
        if (process.env.NODE_ENV === 'development' && fs.existsSync(this.templatePath)) {
          logger.warn('Using template feature configuration. Create features.config.json for production.');
          this.config = JSON.parse(fs.readFileSync(this.templatePath, 'utf8'));
        } else {
          throw new Error('Feature configuration not found. Copy features.config.template.json to features.config.json');
        }
      } else {
        this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }

      this.lastLoaded = Date.now();
      logger.info('Feature configuration loaded successfully');
      return this.config;
    } catch (error) {
      logger.error('Failed to load feature configuration:', error);
      throw error;
    }
  }

  /**
   * Get configuration
   */
  get() {
    if (!this.config) {
      this.load();
    }
    return this.config;
  }

  /**
   * Check if a feature is enabled
   */
  isEnabled(featurePath) {
    const config = this.get();
    const paths = featurePath.split('.');
    
    let current = config.features;
    for (const path of paths) {
      if (!current || typeof current !== 'object') return false;
      current = current[path];
    }
    
    return current === true || (current && current.enabled === true);
  }

  /**
   * Get enabled features for a category
   */
  getEnabledFeatures(category) {
    const config = this.get();
    const categoryConfig = config.features[category];
    
    if (!categoryConfig || !categoryConfig.enabled) {
      return null;
    }

    const enabled = {};
    
    // Check for available sub-features
    if (categoryConfig.availablePackages) {
      Object.entries(categoryConfig.availablePackages).forEach(([key, value]) => {
        if (value === true) enabled[key] = true;
      });
    } else if (categoryConfig.availablePlans) {
      Object.entries(categoryConfig.availablePlans).forEach(([key, value]) => {
        if (value === true) enabled[key] = true;
      });
    } else if (categoryConfig.availableTiers) {
      Object.entries(categoryConfig.availableTiers).forEach(([key, value]) => {
        if (value === true) enabled[key] = true;
      });
    } else if (categoryConfig.types) {
      Object.entries(categoryConfig.types).forEach(([key, value]) => {
        if (value === true) enabled[key] = true;
      });
    }

    return {
      enabled: true,
      features: enabled,
      settings: categoryConfig.features || {}
    };
  }

  /**
   * Filter pricing config based on enabled features
   */
  filterPricingConfig(pricingConfig) {
    const features = this.get().features;
    const filtered = {
      version: pricingConfig.version,
      currency: pricingConfig.currency,
      lastUpdated: pricingConfig.lastUpdated
    };

    // Only include enabled subscription plans
    if (features.subscriptionPlans?.enabled) {
      filtered.subscriptionPlans = {};
      const enabledPlans = features.subscriptionPlans.availablePlans;
      
      Object.entries(pricingConfig.subscriptionPlans || {}).forEach(([key, plan]) => {
        if (enabledPlans[key]) {
          filtered.subscriptionPlans[key] = plan;
        }
      });
    }

    // Only include enabled trial packages
    if (features.trialPackages?.enabled) {
      filtered.trialPackages = {};
      const enabledPackages = features.trialPackages.availablePackages;
      
      Object.entries(pricingConfig.trialPackages || {}).forEach(([key, pkg]) => {
        if (enabledPackages[key]) {
          filtered.trialPackages[key] = pkg;
        }
      });
    }

    // Only include enabled membership tiers
    if (features.membershipTiers?.enabled) {
      filtered.membershipTiers = {};
      const enabledTiers = features.membershipTiers.availableTiers;
      
      Object.entries(pricingConfig.membershipTiers || {}).forEach(([key, tier]) => {
        if (enabledTiers[key]) {
          filtered.membershipTiers[key] = tier;
        }
      });
    }

    // Only include enabled class packages
    if (features.classPackages?.enabled) {
      filtered.classPackages = {};
      const enabledPackages = features.classPackages.availablePackages;
      
      Object.entries(pricingConfig.classPackages || {}).forEach(([key, pkg]) => {
        if (enabledPackages[key]) {
          filtered.classPackages[key] = pkg;
        }
      });
    }

    // Include trainer compensation if enabled
    if (features.trainerCompensation?.enabled) {
      filtered.trainerCompensation = pricingConfig.trainerCompensation;
    }

    // Include payment processing based on enabled methods
    if (features.paymentMethods) {
      filtered.paymentProcessing = {};
      
      if (features.paymentMethods.stripe?.enabled) {
        filtered.paymentProcessing.stripe = pricingConfig.paymentProcessing?.stripe;
      }
      if (features.paymentMethods.interac?.enabled) {
        filtered.paymentProcessing.interac = pricingConfig.paymentProcessing?.interac;
      }
      if (features.paymentMethods.cash?.enabled) {
        filtered.paymentProcessing.cash = pricingConfig.paymentProcessing?.cash;
      }
    }

    // Include taxes if enabled
    if (features.taxSystem?.enabled) {
      filtered.taxes = pricingConfig.taxes;
    }

    // Include discounts if enabled
    if (features.discounts?.enabled) {
      filtered.discounts = {};
      const enabledDiscounts = features.discounts.types;
      
      Object.entries(pricingConfig.discounts || {}).forEach(([key, discount]) => {
        if (enabledDiscounts[key]) {
          filtered.discounts[key] = discount;
        }
      });
    }

    // Include late fees if enabled
    if (features.lateFees?.enabled) {
      filtered.lateFees = pricingConfig.lateFees;
    }

    // Include promotions if enabled
    if (features.promotions?.enabled) {
      filtered.promotions = pricingConfig.promotions;
    }

    // Include special programs if enabled
    if (features.specialPrograms?.enabled) {
      filtered.specialPrograms = pricingConfig.specialPrograms;
    }

    return filtered;
  }

  /**
   * Get business rules
   */
  getBusinessRules() {
    const config = this.get();
    return config.businessRules || {};
  }

  /**
   * Get regionalization settings
   */
  getRegionalization() {
    const config = this.get();
    return config.regionalization || {};
  }

  /**
   * Check if a specific payment method is enabled
   */
  isPaymentMethodEnabled(method) {
    return this.isEnabled(`paymentMethods.${method}`);
  }

  /**
   * Get all enabled payment methods
   */
  getEnabledPaymentMethods() {
    const config = this.get();
    const paymentMethods = config.features.paymentMethods || {};
    
    return Object.entries(paymentMethods)
      .filter(([_, settings]) => settings.enabled === true)
      .map(([method, _]) => method);
  }

  /**
   * Check if a specific integration is enabled
   */
  isIntegrationEnabled(integration) {
    const config = this.get();
    return config.features.integrations?.available?.[integration] === true;
  }

  /**
   * Validate feature dependencies
   */
  validateDependencies() {
    const features = this.get().features;
    const errors = [];

    // Example: Trial packages require payment methods
    if (features.trialPackages?.enabled && features.trialPackages?.requirePayment) {
      const hasPaymentMethod = this.getEnabledPaymentMethods().length > 0;
      if (!hasPaymentMethod) {
        errors.push('Trial packages require at least one payment method to be enabled');
      }
    }

    // Example: Subscriptions require Stripe
    if (features.subscriptionPlans?.enabled && !features.paymentMethods?.stripe?.enabled) {
      errors.push('Subscription plans require Stripe payment method to be enabled');
    }

    // Example: Tax remittance requires tax system
    if (features.taxSystem?.features?.automaticRemittance && !features.taxSystem?.enabled) {
      errors.push('Automatic tax remittance requires tax system to be enabled');
    }

    return errors;
  }
}

// Export singleton instance
module.exports = new FeatureConfigLoader();