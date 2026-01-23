// middlewares/validation.middleware.js

const AppError = require('../utils/AppError');

exports.validate = (schema) => {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      // Check required
      if (rules.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
        errors.push(`${field} is required`);
        continue;
      }

      // Skip further validation if field is not required and empty
      if (!rules.required && !value) {
        continue;
      }

      // Type validation
      if (rules.type === 'email' && value) {
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(value)) {
          errors.push(rules.message || `${field} must be a valid email`);
        }
      }

      // String length validation
      if (rules.type === 'string' && value) {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(rules.message || `${field} must be at least ${rules.minLength} characters`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(rules.message || `${field} must not exceed ${rules.maxLength} characters`);
        }
      }

      // Pattern validation
      if (rules.pattern && value && !rules.pattern.test(value)) {
        errors.push(rules.message || `${field} format is invalid`);
      }
    }

    if (errors.length > 0) {
      return next(new AppError(errors.join(', '), 400));
    }

    next();
  };
};