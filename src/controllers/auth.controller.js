const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { sendSuccess } = require ('../utils/apiResponse');
const { sendWelcomeEmail} = require ('../services/email.service');


// ------- Internal Helpers ----------------------------

// Access token - (15 min) contain id, role and isAdmin

const generateAccessToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role, isAdmin: user.isAdmin },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRES }
    );
};

// Refresh token -> 7d only contain Id,

const generateRefreshToken = (user) => {
    return jwt.sign(
        { id: user._id, },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRES }
    );
};

// Hash the token before storing it in the database

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Send accessToken to body and refreshToken to cookie in HttpOnly
const sendTokens = (res, user, statusCode = 200, message = 'OK') => {

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('refreshToken', refreshToken, {

        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Only HTTPS in production
        sameSite: 'strict', // prevent CSRF
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in ms
    });

    // User data returned in the response

    const userResponse = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isAdmin: user.isAdmin || false,
        avatar: user.avatar,
        isVerified: user.isVerified,
    };

    sendSuccess(res, { accessToken, user: userResponse }, message, statusCode);

    return refreshToken;
};

// --------- Controllers ----------------------

// POST /api/auth/register

const register = async (req, res, next) => {
    
    try{
        const {name, email, password } = req.body; 
    
        // Check for duplicate email addresses 

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return next (new AppError('This email is already registered. Do you to log in?', 400));
        }

        // pre-save hook
        const user = await User.create({ name, email, password });

        // Generates tokens and sends a response
        const refreshToken = sendTokens(res, user, 201, 'Account created successfully');

        // Store the hashed refresh token in DB 
        await User.findByIdAndUpdate(user._id, {
            refreshToken: hashToken(refreshToken),
        });

        // Send welcome email
        sendWelcomeEmail(user);
    } catch (error) {
        next(error)
    }
};

// POST /api/auth/login

const login = async (req, res, next) => {
    try{
        const {email,password} = req.body;

        if(!email || !password) {
            return next(new AppError('Email and password are required', 400));
        }

        const user = await User.findOne({ email })
        .select('+password +isActive +isAdmin +refreshToken');

        // Prevent User enumeration attacks
        if (!user || !(await user.comparePassword(password))) {
            return next(new AppError('Incorrect email or password', 401));
        }

        if (!user.isActive) {
            return next(new AppError('Your account has been deactivated. Please contact support.', 401))
        }

        const refreshToken = sendTokens(res, user, 200, 'Logged in successfully');

        await User.findByIdAndUpdate(user._id, {
            refreshToken: hashToken(refreshToken),
        });


    } catch (error) {
        next(error);
    }
};

// POST /api/auth/refresh

// Reads the refresh token from the cookie and issues a new acccess token

const refresh = async (req, res, next) => {
    try{
        const { refreshToken } = req.cookies;

        if(!refreshToken) {
            return next(new AppError('No active session found', 401));
        }

        // Verify JWT in the refresh token is valid
        let decoded;
        try{
            decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        } catch {
            return next(new AppError('Session expired. Please log in again', 401));
        }

        const user = await User.findById(decoded.id)
        .select('+refreshToken +isActive +isAdmin');

        if (!user || !user.isActive) {
            return next(new AppError('User not found or inactive', 401));
        }

        // Compare the received token hash with the stored in DB
        const hashedIncoming = hashToken(refreshToken);
        if(hashedIncoming !== user.refreshToken) {
            return next(new AppError ('Invalid token. Please log in again.', 401));
        }

        const newAccessToken = generateAccessToken(user);

        sendSuccess(res, {accessToken: newAccessToken }, 'Token refreshed successfully');
        
    } catch (error) {
        next(error);
    }
};

// POST /api/auth/logout

const logout = async (req, res, next) => {
    try{

        // Delete refresh token from DB 

        await User.findByIdAndUpdate(req.user._id, { refreshToken: null });

        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
        });

        sendSuccess(res, null, 'Logged out successfully');
    
    } catch (error){
        next(error);
    }
};

// GET /api/auth/me

// Refresh the auth state when the user reloads the page

const getMe = async (req, res, next) => {
    try{
        const user = await User.findById(req.user._id)
        .populate('wishlist', 'name images price slug');

        sendSuccess(res, { user }, 'User data retrived');
    } catch (error) {
        next(error);
    }
};

module.exports = { register, login, refresh, logout, getMe };
