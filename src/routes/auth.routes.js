const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const { register, login, refresh, logout, getMe } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/authenticate');

// ----------- Validation -----------------------

const validateRegister = [

    body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 60 }).withMessage('Name must be between 2 and 60 characters'),

    body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(), // Convert to lowercase and remove the Gmail atlas

    body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min:8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter and one number')
];

const validateLogin = [
    body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),

    body('password')
    .notEmpty().withMessage('Password is required'),
];

// ----------- Middleware: HandleValidation -------------------------

// Read the validation errors
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
            return res.status(422).json({
            success: false,
            message: 'Invalid input data',
            errors: errors.array().map((e) => ({
                field: e.path,
                message: e.msg,
             })),
        });
    }
    next();
};

// ---------------- Rate limit for auth ---------------------------------

// 10 attempts over 15 minutes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many attempts. Please try again in 15 minutes',
    },
});

// ------------------- Router ----------------------
const router = express.Router();

// POST /api/auth/register
// Order defines the flow

router.post('/register', authLimiter, validateRegister, handleValidation, register);

// POST /api/auth/login

router.post ('/login', authLimiter, validateLogin, handleValidation, login);

// POST /api/auth/refresh

router.post ('/refresh', refresh);

// POST /api/auth/logout

router.post ('/logout', authenticate, logout);

// GET /api/auth/me

router.get ('/me', authenticate, getMe);

module.exports = router;