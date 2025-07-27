const pricingLoader = require('./pricing-loader');

/**
 * Central configuration module
 * Loads and manages all configuration files
 */
class ConfigManager {
  constructor() {
    this.configs = {
      pricing: pricingLoader
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
      pricing: this.configs.pricing.getPublicConfig()
    };
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