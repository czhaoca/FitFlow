const config = require('./index');
const featureLoader = require('./feature-loader');

/**
 * Example of how conditional pricing works based on enabled features
 */

// Example 1: Check if trial packages are enabled before showing them
async function getAvailableTrialPackages() {
  if (!featureLoader.isEnabled('trialPackages')) {
    return {
      enabled: false,
      message: 'Trial packages are not available'
    };
  }

  // Get only enabled trial packages
  const enabledPackages = featureLoader.getEnabledFeatures('trialPackages');
  const allPackages = config.pricing.trialPackages || {};
  
  const availablePackages = {};
  Object.entries(allPackages).forEach(([key, pkg]) => {
    if (enabledPackages.features[key]) {
      availablePackages[key] = pkg;
    }
  });

  return {
    enabled: true,
    packages: availablePackages,
    requiresPayment: enabledPackages.settings.requirePayment
  };
}

// Example 2: Build pricing page dynamically based on features
async function buildPricingPageData() {
  const pricingData = {
    currency: config.pricing.currency,
    sections: []
  };

  // Add subscription plans if enabled
  if (featureLoader.isEnabled('subscriptionPlans')) {
    const plans = featureLoader.getEnabledFeatures('subscriptionPlans');
    const subscriptionSection = {
      type: 'subscriptions',
      title: 'Subscription Plans',
      items: []
    };

    Object.entries(config.pricing.subscriptionPlans || {}).forEach(([key, plan]) => {
      if (plans.features[key]) {
        subscriptionSection.items.push({
          id: key,
          ...plan
        });
      }
    });

    if (subscriptionSection.items.length > 0) {
      pricingData.sections.push(subscriptionSection);
    }
  }

  // Add membership tiers if enabled
  if (featureLoader.isEnabled('membershipTiers')) {
    const tiers = featureLoader.getEnabledFeatures('membershipTiers');
    const membershipSection = {
      type: 'memberships',
      title: 'Membership Options',
      items: []
    };

    Object.entries(config.pricing.membershipTiers || {}).forEach(([key, tier]) => {
      if (tiers.features[key]) {
        const tierData = { id: key, ...tier };
        
        // Only include features that are enabled
        if (!tiers.settings.rolloverClasses) {
          delete tierData.rolloverClasses;
        }
        if (!tiers.settings.guestPasses) {
          delete tierData.guestPasses;
        }
        
        membershipSection.items.push(tierData);
      }
    });

    if (membershipSection.items.length > 0) {
      pricingData.sections.push(membershipSection);
    }
  }

  // Add class packages if enabled
  if (featureLoader.isEnabled('classPackages')) {
    const packages = featureLoader.getEnabledFeatures('classPackages');
    const packageSection = {
      type: 'packages',
      title: 'Class Packages',
      items: []
    };

    Object.entries(config.pricing.classPackages || {}).forEach(([key, pkg]) => {
      if (packages.features[key]) {
        packageSection.items.push({
          id: key,
          ...pkg,
          sharingAllowed: packages.settings.packageSharing,
          transferAllowed: packages.settings.packageTransfer
        });
      }
    });

    if (packageSection.items.length > 0) {
      pricingData.sections.push(packageSection);
    }
  }

  return pricingData;
}

// Example 3: Calculate pricing with feature checks
async function calculateSessionPrice(sessionType, basePrice, clientInfo) {
  let finalPrice = basePrice;
  const appliedDiscounts = [];

  // Check if discounts are enabled
  if (featureLoader.isEnabled('discounts')) {
    const discountFeatures = featureLoader.getEnabledFeatures('discounts');
    
    // Apply student discount if enabled
    if (discountFeatures.features.student && clientInfo.isStudent) {
      const discount = config.pricing.discounts?.student || 0;
      finalPrice = finalPrice * (1 - discount);
      appliedDiscounts.push({
        type: 'student',
        amount: basePrice * discount
      });
    }

    // Apply senior discount if enabled
    if (discountFeatures.features.senior && clientInfo.isSenior) {
      const discount = config.pricing.discounts?.senior || 0;
      
      // Check if discounts can stack
      if (discountFeatures.settings.stackableDiscounts || appliedDiscounts.length === 0) {
        finalPrice = finalPrice * (1 - discount);
        appliedDiscounts.push({
          type: 'senior',
          amount: basePrice * discount
        });
      }
    }

    // Apply early bird discount if enabled
    if (discountFeatures.features.earlyBird && clientInfo.daysInAdvance >= 7) {
      const earlyBirdConfig = config.pricing.discounts?.earlyBird;
      if (earlyBirdConfig && clientInfo.daysInAdvance >= earlyBirdConfig.daysInAdvance) {
        const discount = earlyBirdConfig.percentage;
        
        if (discountFeatures.settings.stackableDiscounts || appliedDiscounts.length === 0) {
          finalPrice = finalPrice * (1 - discount);
          appliedDiscounts.push({
            type: 'earlyBird',
            amount: basePrice * discount
          });
        }
      }
    }
  }

  // Calculate tax if enabled
  let tax = { rate: 0, amount: 0 };
  if (featureLoader.isEnabled('taxSystem')) {
    tax = config.calculateTax(finalPrice, clientInfo.province);
  }

  return {
    basePrice,
    discounts: appliedDiscounts,
    subtotal: finalPrice,
    tax,
    total: finalPrice + tax.amount
  };
}

// Example 4: Get available payment methods
async function getPaymentMethods() {
  const methods = [];
  
  if (featureLoader.isPaymentMethodEnabled('stripe')) {
    const stripeFeatures = featureLoader.get().features.paymentMethods.stripe.features;
    methods.push({
      id: 'stripe',
      name: 'Credit/Debit Card',
      enabled: true,
      features: {
        saveCard: stripeFeatures.creditCard,
        walletPay: stripeFeatures.walletPay,
        subscriptions: stripeFeatures.subscriptions
      }
    });
  }

  if (featureLoader.isPaymentMethodEnabled('interac')) {
    methods.push({
      id: 'interac',
      name: 'Interac e-Transfer',
      enabled: true,
      autoReconciliation: featureLoader.get().features.paymentMethods.interac.autoReconciliation
    });
  }

  if (featureLoader.isPaymentMethodEnabled('cash')) {
    methods.push({
      id: 'cash',
      name: 'Cash',
      enabled: true,
      requiresReceipt: featureLoader.get().features.paymentMethods.cash.requiresReceipt
    });
  }

  return methods;
}

// Example 5: Validate business rules
async function validateBooking(bookingData) {
  const rules = featureLoader.getBusinessRules();
  const errors = [];

  // Check booking window
  const daysInAdvance = Math.ceil((bookingData.date - new Date()) / (1000 * 60 * 60 * 24));
  
  if (daysInAdvance < rules.minimumBookingWindow) {
    errors.push(`Bookings must be made at least ${rules.minimumBookingWindow} hours in advance`);
  }
  
  if (daysInAdvance > rules.maximumBookingWindow) {
    errors.push(`Bookings cannot be made more than ${rules.maximumBookingWindow} days in advance`);
  }

  // Check session duration
  if (!rules.sessionDuration.includes(bookingData.duration)) {
    errors.push(`Invalid session duration. Allowed durations: ${rules.sessionDuration.join(', ')} minutes`);
  }

  // Check business hours
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][bookingData.date.getDay()];
  const businessHours = rules.businessHours[dayOfWeek];
  
  if (businessHours) {
    const bookingTime = bookingData.time;
    if (bookingTime < businessHours.open || bookingTime > businessHours.close) {
      errors.push(`Booking time must be between ${businessHours.open} and ${businessHours.close}`);
    }
  }

  // Check cancellation policy
  if (featureLoader.isEnabled('lateFees')) {
    const hoursUntilClass = Math.ceil((bookingData.date - new Date()) / (1000 * 60 * 60));
    if (hoursUntilClass < rules.cancellationWindow) {
      errors.push(`Cancellations must be made at least ${rules.cancellationWindow} hours in advance`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Example 6: Build feature-aware API response
async function getStudioFeatures() {
  const features = featureLoader.get().features;
  const enabledFeatures = {};

  // Client features
  if (features.clientFeatures?.enabled) {
    enabledFeatures.client = {
      onlineBooking: features.clientFeatures.features.onlineBooking,
      mobileApp: features.clientFeatures.features.mobileApp,
      waitlist: features.clientFeatures.features.waitlist,
      favorites: features.clientFeatures.features.favorites,
      referralProgram: features.clientFeatures.features.referralProgram
    };
  }

  // Payment options
  enabledFeatures.payments = featureLoader.getEnabledPaymentMethods();

  // Integrations
  if (features.integrations?.enabled) {
    enabledFeatures.integrations = Object.entries(features.integrations.available)
      .filter(([_, enabled]) => enabled)
      .map(([name, _]) => name);
  }

  // Multi-location features
  if (features.multiLocation?.enabled) {
    enabledFeatures.multiLocation = features.multiLocation.features;
  }

  // Compliance features
  if (features.compliance?.enabled) {
    enabledFeatures.compliance = {
      digitalWaivers: features.compliance.features.digitalWaivers,
      medicalClearance: features.compliance.features.medicalClearance
    };
  }

  return enabledFeatures;
}

module.exports = {
  getAvailableTrialPackages,
  buildPricingPageData,
  calculateSessionPrice,
  getPaymentMethods,
  validateBooking,
  getStudioFeatures
};