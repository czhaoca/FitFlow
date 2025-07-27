const config = require('../../shared/config');
const logger = require('../utils/logger');

class PricingService {
  /**
   * Calculate total price for a booking including taxes
   */
  calculateBookingTotal(basePrice, province, discountType = null, discountMetadata = {}) {
    try {
      let price = basePrice;

      // Apply discount if applicable
      if (discountType) {
        price = config.calculateDiscount(price, discountType, discountMetadata);
      }

      // Calculate tax
      const taxInfo = config.calculateTax(price, province);

      return {
        subtotal: price,
        discount: basePrice - price,
        taxRate: taxInfo.rate,
        taxAmount: taxInfo.amount,
        total: taxInfo.total
      };
    } catch (error) {
      logger.error('Error calculating booking total:', error);
      throw error;
    }
  }

  /**
   * Get subscription pricing for a plan
   */
  getSubscriptionPricing(planId) {
    const plan = config.getSubscriptionPlan(planId);
    if (!plan) {
      throw new Error(`Invalid subscription plan: ${planId}`);
    }

    return {
      planId,
      name: plan.name,
      description: plan.description,
      monthlyFee: plan.monthlyFee,
      includedBookings: plan.includedBookings,
      overageRate: plan.overageRate,
      processingRate: plan.processingRate,
      features: plan.features
    };
  }

  /**
   * Calculate trainer payout for a session
   */
  calculateTrainerPayout(sessionType, sessionPrice, trainerLevel = 'default', employmentType = 'contractor') {
    const compensationRate = config.getTrainerCompensation(sessionType, trainerLevel, employmentType);
    
    if (typeof compensationRate === 'number' && compensationRate <= 1) {
      // Percentage-based compensation
      return sessionPrice * compensationRate;
    } else {
      // Fixed rate (e.g., for trial classes)
      return compensationRate;
    }
  }

  /**
   * Get trial package pricing
   */
  getTrialPackagePricing(packageId) {
    const trialPackage = config.getTrialPackage(packageId);
    if (!trialPackage) {
      throw new Error(`Invalid trial package: ${packageId}`);
    }

    const savings = trialPackage.regularPrice - trialPackage.trialPrice;
    const savingsPercent = (savings / trialPackage.regularPrice) * 100;

    return {
      ...trialPackage,
      savings,
      savingsPercent: Math.round(savingsPercent)
    };
  }

  /**
   * Calculate platform fees for a transaction
   */
  calculatePlatformFees(amount, subscriptionPlanId) {
    const plan = config.getSubscriptionPlan(subscriptionPlanId);
    const processingFees = config.getProcessingFees();

    const stripeFee = amount * processingFees.baseRate + processingFees.transactionFee;
    const platformProcessingRate = plan.processingRate - processingFees.baseRate;
    const platformRevenue = amount * platformProcessingRate;

    return {
      stripeFee,
      platformRevenue,
      totalFees: stripeFee + platformRevenue,
      netToStudio: amount - stripeFee - platformRevenue
    };
  }

  /**
   * Get membership pricing options
   */
  getMembershipOptions() {
    const membershipTiers = config.pricing.membershipTiers;
    
    return Object.entries(membershipTiers).map(([key, tier]) => ({
      id: key,
      ...tier,
      pricePerClass: tier.classesPerMonth > 0 
        ? Math.round(tier.monthlyFee / tier.classesPerMonth * 100) / 100 
        : 0
    }));
  }

  /**
   * Calculate late cancellation fee
   */
  getLateCancellationFee(classPrice, hoursBeforeClass) {
    const lateFees = config.pricing.lateFees.cancellation;
    
    if (hoursBeforeClass >= 24) {
      return 0;
    } else if (hoursBeforeClass >= 12) {
      return classPrice * lateFees['12hours'];
    } else {
      return classPrice * lateFees.noShow;
    }
  }

  /**
   * Get class package options
   */
  getClassPackageOptions() {
    const packages = config.pricing.classPackages;
    
    return Object.entries(packages).map(([key, pkg]) => ({
      id: key,
      ...pkg,
      pricePerClass: pkg.pricePerClass || (pkg.price / pkg.classes),
      savings: pkg.classes > 1 
        ? (packages.drop_in.price * pkg.classes) - pkg.price 
        : 0
    }));
  }

  /**
   * Validate promotional code
   */
  validatePromoCode(code, context = {}) {
    const promotions = config.pricing.promotions;
    
    // Check seasonal promotions
    const today = new Date();
    const month = today.getMonth();
    
    // Example promotion validation (extend as needed)
    switch (code.toUpperCase()) {
      case 'NEWCLIENT':
        if (context.isNewClient) {
          return {
            valid: true,
            discount: promotions.newClient.firstMonthDiscount,
            type: 'percentage'
          };
        }
        break;
      
      case 'SUMMER2024':
        if (month >= 5 && month <= 7) { // June-August
          return {
            valid: true,
            discount: promotions.seasonal.summerSpecial,
            type: 'percentage'
          };
        }
        break;
      
      case 'REFERRAL':
        if (context.hasReferral) {
          return {
            valid: true,
            discount: promotions.newClient.referralBonus,
            type: 'fixed'
          };
        }
        break;
    }
    
    return { valid: false };
  }
}

module.exports = new PricingService();