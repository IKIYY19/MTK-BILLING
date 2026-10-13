/**
 * Form Validation Utilities
 * Provides consistent validation across all forms
 * Use these instead of manual validation checks
 */

// Validation rules
const rules = {
  required: (value, fieldName = 'This field') => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return `${fieldName} is required`;
    }
    return null;
  },

  email: (value, fieldName = 'Email') => {
    if (!value) {return null;} // Use required() for mandatory fields
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return `${fieldName} must be a valid email address`;
    }
    return null;
  },

  phone: (value, fieldName = 'Phone') => {
    if (!value) {return null;}
    const phoneRegex = /^\+?[\d\s\-()]{7,15}$/;
    if (!phoneRegex.test(value)) {
      return `${fieldName} must be a valid phone number`;
    }
    return null;
  },

  minLength: (value, min, fieldName = 'This field') => {
    if (!value) {return null;}
    if (value.length < min) {
      return `${fieldName} must be at least ${min} characters`;
    }
    return null;
  },

  maxLength: (value, max, fieldName = 'This field') => {
    if (!value) {return null;}
    if (value.length > max) {
      return `${fieldName} must be less than ${max} characters`;
    }
    return null;
  },

  min: (value, min, fieldName = 'This field') => {
    if (value === null || value === undefined) {return null;}
    if (Number(value) < min) {
      return `${fieldName} must be at least ${min}`;
    }
    return null;
  },

  max: (value, max, fieldName = 'This field') => {
    if (value === null || value === undefined) {return null;}
    if (Number(value) > max) {
      return `${fieldName} must be no more than ${max}`;
    }
    return null;
  },

  numeric: (value, fieldName = 'This field') => {
    if (!value) {return null;}
    if (isNaN(Number(value))) {
      return `${fieldName} must be a number`;
    }
    return null;
  },

  url: (value, fieldName = 'URL') => {
    if (!value) {return null;}
    try {
      new URL(value);
      return null;
    } catch {
      return `${fieldName} must be a valid URL`;
    }
  },
};

// Validate a form against multiple rules
export const validateForm = (data, validationSchema) => {
  const errors = {};

  for (const [field, fieldRules] of Object.entries(validationSchema)) {
    const value = data[field];

    // fieldRules can be a function or array of rule functions
    const rulesArray = Array.isArray(fieldRules) ? fieldRules : [fieldRules];

    for (const rule of rulesArray) {
      const error = rule(value, field);
      if (error) {
        errors[field] = error;
        break; // Stop at first error for this field
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

// Pre-built validation schemas for common forms
export const validationSchemas = {
  reseller: {
    name: [rules.required],
    email: [rules.email],
    phone: [rules.phone],
    commission_rate: [rules.numeric, (v) => rules.min(v, 0), (v) => rules.max(v, 100)],
    credit_limit: [rules.numeric, (v) => rules.min(v, 0)],
  },

  customer: {
    name: [rules.required],
    email: [rules.email],
    phone: [rules.phone],
    address: [],
  },

  user: {
    name: [rules.required, (v) => rules.minLength(v, 2)],
    email: [rules.required, rules.email],
    password: [rules.required, (v) => rules.minLength(v, 6)],
  },

  login: {
    email: [rules.required, rules.email],
    password: [rules.required],
  },

  project: {
    name: [rules.required, (v) => rules.minLength(v, 3)],
    description: [],
  },

  router: {
    name: [rules.required],
    ip_address: [rules.required, rules.url],
    api_port: [rules.required, rules.numeric, (v) => rules.min(v, 1), (v) => rules.max(v, 65535)],
    username: [rules.required],
    password: [rules.required],
  },
};

// Higher-order function to use in React forms
export const useFormValidation = (schema) => {
  return (data) => validateForm(data, schema);
};

export { rules };
export default { validateForm, validationSchemas, rules };
