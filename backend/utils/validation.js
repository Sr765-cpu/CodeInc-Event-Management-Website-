import { body, validationResult } from 'express-validator';

// Validation middleware
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation error',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// Registration validation rules
export const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
  
  body('address')
    .trim()
    .notEmpty().withMessage('Address is required')
    .isLength({ min: 5, max: 200 }).withMessage('Address must be between 5 and 200 characters'),
  
  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['user', 'participant']).withMessage('Role must be either user or participant')
];

// Login validation rules
export const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required'),
  
  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['user', 'participant']).withMessage('Role must be either user or participant')
];

// Event creation validation
export const eventValidation = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 200 }).withMessage('Title must be between 3 and 200 characters'),
  
  body('category')
    .trim()
    .notEmpty().withMessage('Category is required'),
  
  body('organizer')
    .trim()
    .notEmpty().withMessage('Organizer is required'),
  
  body('city')
    .trim()
    .notEmpty().withMessage('City is required'),
  
  body('start')
    .notEmpty().withMessage('Start date is required'),
  
  body('end')
    .notEmpty().withMessage('End date is required'),
  
  body('desc')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 10 }).withMessage('Description must be at least 10 characters')
];

// RSVP validation
export const rsvpValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('message')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Message must not exceed 500 characters')
];

// Volunteer validation
export const volunteerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone is required')
    .matches(/^[\+]?[\d\s\-()]{7,20}$/).withMessage('Invalid phone number'),
  
  body('speciality')
    .trim()
    .notEmpty().withMessage('Speciality is required'),
  
  body('availableDates')
    .trim()
    .notEmpty().withMessage('Available dates are required')
];
