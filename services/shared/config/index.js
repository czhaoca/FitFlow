const pricingLoader = require('./pricing-loader');
const featureLoader = require('./feature-loader');

/**
 * Central configuration module
 * Loads and manages all configuration files
 */
class ConfigManager {
  constructor() {
    this.configs = {
      pricing: pricingLoader,
      features: featureLoader
    };
  }

  /**
   * Get pricing configuration
   */
  get pricing() {
    return this.configs.pricing.get();
  }

  /**
   * Get specific subscription plan
   */
  getSubscriptionPlan(planId) {
    return this.configs.pricing.getSubscriptionPlan(planId);
  }

  /**
   * Get trial package
   */
  getTrialPackage(packageId) {
    return this.configs.pricing.getTrialPackage(packageId);
  }

  /**
   * Calculate tax for amount and province
   */
  calculateTax(amount, province) {
    return this.configs.pricing.calculateTax(amount, province);
  }

  /**
   * Get trainer compensation
   */
  getTrainerCompensation(type, trainerLevel, employmentType) {
    return this.configs.pricing.getTrainerCompensation(type, trainerLevel, employmentType);
  }

  /**
   * Get processing fees
   */
  getProcessingFees(paymentMethod) {
    return this.configs.pricing.getProcessingFees(paymentMethod);
  }

  /**
   * Calculate discount
   */
  calculateDiscount(originalPrice, discountType, metadata) {
    return this.configs.pricing.calculateDiscount(originalPrice, discountType, metadata);
  }

  /**
   * Get public configuration for client-side
   */
  getPublicConfig() {
    return {
      pricing: this.configs.pricing.getPublicConfig(),
      features: this.getEnabledFeatures()
    };
  }
  
  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(featurePath) {
    return this.configs.features.isEnabled(featurePath);
  }
  
  /**
   * Get enabled features for public consumption
   */
  getEnabledFeatures() {
    const features = this.configs.features.get().features;
    const publicFeatures = {};
    
    // Only expose relevant feature flags to frontend
    if (features.trialPackages?.enabled) {
      publicFeatures.trialPackages = {
        enabled: true,
        packages: features.trialPackages.availablePackages
      };
    }
    
    if (features.membershipTiers?.enabled) {
      publicFeatures.memberships = {
        enabled: true,
        tiers: features.membershipTiers.availableTiers,
        features: features.membershipTiers.features
      };
    }
    
    if (features.classPackages?.enabled) {
      publicFeatures.classPackages = {
        enabled: true,
        packages: features.classPackages.availablePackages
      };
    }
    
    publicFeatures.paymentMethods = this.configs.features.getEnabledPaymentMethods();
    
    return publicFeatures;
  }

  /**
   * Reload all configurations
   */
  reload() {
    Object.values(this.configs).forEach(config => {
      if (typeof config.load === 'function') {
        config.load();
      }
    });
  }
}

// Export singleton instance
module.exports = new ConfigManager();