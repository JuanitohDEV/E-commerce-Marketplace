const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');

// ------ Authenticate ---------------
// Verify that the request contains a valid JWT

const authenticate = async (req, res, next) => {
    try{
        // Read token from the authorization Bearer<token> header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(new AppError('You are not logged in. Please log in to get access.', 401));
        }

        const token = authHeader.split(' ')[1];

        // Token Verification
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        //  Verify that the user exists and is active
        const currentUser = await User.findById(decoded.id).select('+isActive +isAdmin');

        if (!currentUser) {
            return next(new AppError('The user belonging to this token no longer exists.', 401))
        }

        if (!currentUser.isActive) {
            return next(new AppError('Your account has been deactivated. Please contact support.', 401));
        }

        // Attach user to request
        req.user = currentUser;
        next();

    } catch (error) {
        // Jwt.verify throws errors
        next(error);
    }
};   


// ------------ Authorize --------------------------
// Verufy that the authenticated user has the required role

const authorize = (...roles) => {
    return (req, res, next) => {
        // Admins can do anything
        if (roles.includes('admin') && req.user.isAdmin) return next();

        // req.user.role has a Array: ['customer', 'seller']
        const  hasRole = req.user.role.some((r) => roles.includes(r));

        if(!hasRole){
            return next (new AppError('You do not have permission to perform this action.', 403))
        }

        next();
    };
};


// ------------- OptionalAuth ------------------------
// Routes that work both with and withour authentication

const optionalAuth = async (req, res, next) => {
    try{
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            req.user = null;
            return next();
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const currentUser = await User.findById(decoded.id).select('+isActive');

        req.user = currentUser?.isActive ? currentUser : null;
        next();

    } catch {
        // Invalid or expired token when acting as anonymous; no error is thrown
        req.user = null;
        next();
    }
};

module.exports = { authenticate, authorize, optionalAuth };