/**
 * Role-Based Access Control (RBAC) Middleware
 */

const logger = require('../utils/logger');

/**
 * Permission matrix defining what each role can do
 */
const PERMISSIONS = {
  admin: [
    // Full access to everything
    '*',
  ],
  finance_manager: [
    // Dashboard
    'dashboard:view',
    'dashboard:export',
    // Leaks
    'leaks:view',
    'leaks:create',
    'leaks:update',
    'leaks:delete',
    // Recovery
    'recovery:view',
    'recovery:create',
    'recovery:update',
    'recovery:assign',
    // Contracts
    'contracts:view',
    'contracts:create',
    'contracts:update',
    // Billing
    'billing:view',
    'billing:create',
    'billing:update',
    // Reports
    'reports:view',
    'reports:export',
    // Users (limited)
    'users:view',
    // Integrations
    'integrations:view',
    'integrations:sync',
  ],
  analyst: [
    // Dashboard
    'dashboard:view',
    // Leaks
    'leaks:view',
    'leaks:create',
    // Recovery (limited)
    'recovery:view',
    'recovery:update',
    // Contracts (view only)
    'contracts:view',
    // Billing (view only)
    'billing:view',
    // Reports
    'reports:view',
  ],
};

/**
 * Check if user has required permission
 */
const hasPermission = (userRole, requiredPermission) => {
  const rolePermissions = PERMISSIONS[userRole] || [];
  
  // Admin has all permissions
  if (rolePermissions.includes('*')) {
    return true;
  }
  
  // Check if role has specific permission
  return rolePermissions.includes(requiredPermission);
};

/**
 * Middleware to check if user has required permission
 */
const authorize = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }
    
    const userRole = req.user.role;
    
    // Check if user has any of the required permissions
    const hasAccess = requiredPermissions.some(permission => 
      hasPermission(userRole, permission)
    );
    
    if (!hasAccess) {
      logger.warn(`Access denied for user ${req.user.email} with role ${userRole}`);
      
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
        requiredPermissions,
        userRole,
      });
    }
    
    next();
  };
};

/**
 * Middleware to check if user has specific role
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Role check failed for user ${req.user.email}`);
      
      return res.status(403).json({
        success: false,
        message: 'Insufficient privileges.',
        requiredRoles: allowedRoles,
        userRole: req.user.role,
      });
    }
    
    next();
  };
};

/**
 * Middleware to check if user belongs to the same company
 */
const sameCompany = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }
  
  // Admin can access all companies
  if (req.user.role === 'admin') {
    return next();
  }
  
  // Check if resource belongs to user's company
  const resourceCompanyId = req.params.companyId || req.body.company || req.query.company;
  
  if (resourceCompanyId && resourceCompanyId !== req.user.company._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Resource belongs to different company.',
    });
  }
  
  next();
};

module.exports = {
  authorize,
  requireRole,
  sameCompany,
  hasPermission,
  PERMISSIONS,
};