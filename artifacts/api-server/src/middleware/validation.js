/**
 * Request Validation Middleware
 * Uses express-validator for consistent backend validation
 */

const { body, param, query, validationResult } = require('express-validator');

// Run validation results middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

// Common validation rules
const validations = {
  // UUID validation
  uuid: (field) => param(field).isUUID().withMessage(`${field} must be a valid UUID`),
  
  // Email validation
  email: body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  
  // Password validation
  password: body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/\d/)
    .withMessage('Password must contain a number')
    .optional({ nullable: true }),
  
  // Name validation
  name: body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Name must be 1-255 characters'),
  
  // Phone validation
  phone: body('phone')
    .matches(/^\+?[\d\s\-()]{7,15}$/)
    .withMessage('Valid phone number required')
    .optional({ nullable: true }),
  
  // Commission rate validation
  commissionRate: body('commission_rate')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Commission rate must be 0-100')
    .optional({ nullable: true }),
  
  // Credit limit validation
  creditLimit: body('credit_limit')
    .isFloat({ min: 0 })
    .withMessage('Credit limit must be positive')
    .optional({ nullable: true }),
  
  // Status validation
  status: body('status')
    .isIn(['active', 'inactive', 'suspended'])
    .withMessage('Status must be active, inactive, or suspended')
    .optional({ nullable: true }),
};

// Pre-built validation middleware for common operations
const resellerValidation = [
  validations.name,
  body('company').trim().isLength({ max: 255 }).optional({ nullable: true }),
  validations.email,
  validations.phone,
  validations.commissionRate,
  validations.creditLimit,
  validations.status,
  validate,
];

const customerValidation = [
  validations.name,
  validations.email,
  validations.phone,
  body('address').trim().optional({ nullable: true }),
  body('service_plan_id').isUUID().optional({ nullable: true }),
  body('reseller_id').isUUID().optional({ nullable: true }),
  validations.status,
  validate,
];

const userValidation = [
  validations.name,
  validations.email,
  validations.password,
  body('role')
    .isIn(['admin', 'staff', 'technician', 'reseller', 'customer'])
    .withMessage('Invalid role')
    .optional({ nullable: true }),
  validate,
];

const loginValidation = [
  validations.email,
  body('password').notEmpty().withMessage('Password required'),
  validate,
];

const projectValidation = [
  validations.name,
  body('description').trim().optional({ nullable: true }),
  body('routeros_version').trim().optional({ nullable: true }),
  validate,
];

const paginationValidation = [
  query('page')
    .isInt({ min: 1 })
    .withMessage('Page must be positive integer')
    .optional({ nullable: true })
    .toInt(),
  query('limit')
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be 1-100')
    .optional({ nullable: true })
    .toInt(),
  validate,
];

module.exports = {
  validate,
  validations,
  resellerValidation,
  customerValidation,
  userValidation,
  loginValidation,
  projectValidation,
  paginationValidation,
};
