const AppError = require('../utils/AppError');

// ----- Error handlers for specific external libraries ---------

// Mongoose: Invalid ID format -> /api/products/abc

const handleCastErrorDB = (err) => {

    const message = `Invalid value for field '${err.path}': ${err.value}`;
    return new AppError(message, 400);
};

// Mongoose: Duplicated value in a single field -> email registered

const handleDuplicateFieldsBD = (err) => {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    const message = `'${value}' already exists for field '${field}'. Please use another value.`;
    return new AppError(message, 400);
};

// Mongoose: Schema validations failed -> required field is empty, invalid enum

const handleValidationErrorBD = (err) => {
    const errors = Object.values(err.errors).map((el) => el.message);
    const message = `Invalid input data: ${errors.join('. ')}`
    return new AppError(message, 400);
};

// JWT: token with an invalid signature or incorrect format

const handleJWTError = () =>
    new AppError('Invalid token. Please log in again', 401);


// JWT: Token access has expired

const handleJWTExpiredError = () =>
    new AppError('Your session has expired. Please log in again', 401);


// -------- Answer in DEVELOPMENT --------------------

// Show all: stack trace, internal message
// For quick debugging

const sendErrorDev = (err, res) => {
    res.status(err.statusCode).json({
        success: false,
        error: err,
        message: err.message,
        stack: err.stack,
    });
};


// --------- Answer in PRODUCTION ----------------------------

// Operationals Errors (isOperational:true) -> are show to the customer
// Programation Errors (isOperational:false) -> are they hide; they just log in

const sendErrorProd = (err, res) => {

    if(err.isOperational){
        res.status(err.statusCode).json({
            success: false,
            message: err.message,
        });
    } else {
        // Unexpected error - don't show details to the customer
        console.error('💥 UNEXPECTED ERROR:', err);
        res.status(500).json({
            success: false,
            message: 'Something went wrong. Please try again',
        });
    }
};

// ---- PRINCIPAL MIDDLEWARE -------------------

const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.message = err.message || 'Internal server error';

    if(process.env.NODE_ENV === 'development') {
        sendErrorDev(err, res);
    } else {
        // In production, we convert library errors into readable AppErrors

        let error = {...err, message: err.message};

        if(err.name === 'CastError') error = handleCastErrorDB(error);
        if(err.code === 11000) error = handleDuplicateFieldsBD(error);
        if(err.name === 'ValidationError') error = handleValidationErrorBD(error);
        if(err.name === 'JsonWebTokenError') error = handleJWTError();
        if(err.name === 'TokenExpiredError') error = handleJWTExpiredError();

        sendErrorProd(error, res);
    }
};

module.exports = errorHandler;