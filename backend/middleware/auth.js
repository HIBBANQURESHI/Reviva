const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Verify JWT token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login.',
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.userId)
      .select('-password -refreshTokens')
      .populate('company');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Please login again.',
      });
    }
    
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.',
      });
    }
    
    // Check if user is locked
    if (user.isLocked()) {
      return res.status(403).json({
        success: false,
        message: 'Your account is locked due to multiple failed login attempts.',
      });
    }
    
    // Attach user to request
    req.user = user;
    
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.',
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.',
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Authentication failed.',
    });
  }
};

/**
 * Optional authentication - does not fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId)
        .select('-password -refreshTokens')
        .populate('company');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
  } catch (error) {
    // Silently fail for optional auth
    logger.debug('Optional auth failed:', error.message);
  }
  
  next();
};

/**
 * Audit log middleware - logs all authenticated requests
 */
const auditLog = (action, entity) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json;
    
    // Override json method to capture response
    res.json = function(data) {
      // Create audit log after successful response
      if (req.user && res.statusCode < 400) {
        AuditLog.create({
          company: req.user.company?._id,
          user: req.user._id,
          action,
          entity,
          entityId: req.params.id || req.body._id,
          changes: req.body,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          severity: 'info',
        }).catch(err => logger.error('Audit log error:', err));
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };
    
    next();
  };
};

module.exports = { authenticate, optionalAuth, auditLog };