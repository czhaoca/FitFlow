const express = require('express');
const router = express.Router();
const pricingService = require('../services/pricingService');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * @route   GET /api/payment/pricing/public
 * @desc    Get public pricing information
 * @access  Public
 */
router.get('/pricing/public', async (req, res) => {
  try {
    const config = require('../../shared/config');
    const publicConfig = config.getPublicConfig();
    
    res.json({
      success: true,
      data: publicConfig.pricing
    });
  } catch (error) {
    logger.error('Error fetching public pricing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing information'
    });
  }
});

/**
 * @route   GET /api/payment/pricing/trial-packages
 * @desc    Get all trial package options
 * @access  Public
 */
router.get('/pricing/trial-packages', async (req, res) => {
  try {
    const config = require('../../shared/config');
    const packages = config.pricing.trialPackages;
    
    const formattedPackages = Object.entries(packages).map(([key, pkg]) => {
      const pricingInfo = pricingService.getTrialPackagePricing(pkg.id);
      return pricingInfo;
    });
    
    res.json({
      success: true,
      data: formattedPackages
    });
  } catch (error) {
    logger.error('Error fetching trial packages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trial packages'
    });
  }
});

/**
 * @route   POST /api/payment/pricing/calculate
 * @desc    Calculate pricing for a booking
 * @access  Private
 */
router.post('/pricing/calculate', authenticate, async (req, res) => {
  try {
    const { 
      basePrice, 
      province, 
      discountType, 
      discountMetadata 
    } = req.body;
    
    const pricing = pricingService.calculateBookingTotal(
      basePrice,
      province,
      discountType,
      discountMetadata
    );
    
    res.json({
      success: true,
      data: pricing
    });
  } catch (error) {
    logger.error('Error calculating pricing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate pricing'
    });
  }
});

/**
 * @route   GET /api/payment/pricing/membership-options
 * @desc    Get all membership options
 * @access  Public
 */
router.get('/pricing/membership-options', async (req, res) => {
  try {
    const options = pricingService.getMembershipOptions();
    
    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    logger.error('Error fetching membership options:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch membership options'
    });
  }
});

/**
 * @route   GET /api/payment/pricing/class-packages
 * @desc    Get all class package options
 * @access  Public
 */
router.get('/pricing/class-packages', async (req, res) => {
  try {
    const packages = pricingService.getClassPackageOptions();
    
    res.json({
      success: true,
      data: packages
    });
  } catch (error) {
    logger.error('Error fetching class packages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch class packages'
    });
  }
});

/**
 * @route   POST /api/payment/pricing/validate-promo
 * @desc    Validate a promotional code
 * @access  Private
 */
router.post('/pricing/validate-promo', authenticate, async (req, res) => {
  try {
    const { code, context } = req.body;
    
    const validation = pricingService.validatePromoCode(code, context);
    
    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    logger.error('Error validating promo code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate promotional code'
    });
  }
});

/**
 * @route   POST /api/payment/pricing/trainer-payout
 * @desc    Calculate trainer payout for a session
 * @access  Private (Studio Admin)
 */
router.post('/pricing/trainer-payout', authenticate, async (req, res) => {
  try {
    const { 
      sessionType, 
      sessionPrice, 
      trainerLevel, 
      employmentType 
    } = req.body;
    
    const payout = pricingService.calculateTrainerPayout(
      sessionType,
      sessionPrice,
      trainerLevel,
      employmentType
    );
    
    res.json({
      success: true,
      data: {
        sessionPrice,
        trainerPayout: payout,
        studioCut: sessionPrice - payout
      }
    });
  } catch (error) {
    logger.error('Error calculating trainer payout:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate trainer payout'
    });
  }
});

/**
 * @route   GET /api/payment/pricing/subscription/:planId
 * @desc    Get subscription plan details
 * @access  Public
 */
router.get('/pricing/subscription/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const pricing = pricingService.getSubscriptionPricing(planId);
    
    res.json({
      success: true,
      data: pricing
    });
  } catch (error) {
    logger.error('Error fetching subscription pricing:', error);
    res.status(404).json({
      success: false,
      error: 'Subscription plan not found'
    });
  }
});

module.exports = router;