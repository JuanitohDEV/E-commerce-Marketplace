const express = require('express');
const User = require('../models/User');
const { sendSuccess, sendPaginated } = require('../utils/apiResponse');
const { authenticate, authorize } = require ('../middleware/authenticate');
const AppError = require('../utils/AppError');

const router = express.Router();

// GET /api/users/profile --- authenticated user profile

router.get('/profile', authenticate, async (req, res, next) => {
    try{
        const user = await User.findById(req.user._id)
        .populate('wishlist', 'name images price slug');

        sendSuccess(res, { user }, 'Profile retrieved');
    } catch (error) {
        next(error);
    }
});

// PATCH /api/users/profile --- Update name and address

router.patch('/profile', authenticate, async (req, res, next) => {
    try{
        const { name, address} = req.body;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            {name, address},
            {new: true, runValidators: true} 
        );

        sendSuccess(res, {user}, 'Profile updated');
    } catch (error) {
        next (error);
    }
});

// PATCH /api/users/change-password --- Change password

router.patch('/change-password', authenticate, async (req, res, next) => {
    try{
        const { currentPassword, newPassword} = req.body;

        if(!currentPassword || !newPassword) {
            return next(new AppError ('Current and new password are required', 400));
        }

        const user = await User.findById(req.user._id).select('+password');

        if(!(await user.comparePassword(currentPassword))) {
            return next (new AppError('Current password is incorrect', 401));
        }

        user.password = newPassword
        await user.save(); // pre-save hook

        sendSuccess(res, null, 'Password changed successfully');
    } catch (error) {
        next(error);
    }
});


//------------------ Routes for admins only --------------------------------------------

// GET /api/users --- list all users

router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
    try{
        const { page = 1, limit = 20, role} = req.query;
        const filter = {};

        if(role) filter.role = role;

        const [users, total] = await Promise.all([
            User.find(filter)
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .sort({ createdAt: -1}),
            User.countDocuments(filter),
        ]);

        // Promise.all

        sendPaginated(res, users, {
            page: Number(page),
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            hasNextPage: page * limit < total,
        });
    } catch(error) {
        next(error);
    }
});

// PATCH /api/user/:id/deactivate --- Soft delete (only admin)

router.patch('/:id/deactivate', authenticate, authorize('admin'), async (req, res, next) => {
    try{
        //Prevents the admin from deactivating it
        if(req.params.id === req.user._id.toString()) {
            return next (new AppError('You cannot deactivate your own account', 400));
        }

        await User.findByIdAndUpdate(req.params.id, {isActive: false});
        sendSuccess(res, null, 'User deactivated successfully');
    } catch (error){
        next(error);
    }
});

// PATCH /api/user/:id/activate --- Reactivate user (only admin)

router.patch('/:id/activate', authenticate, authorize('admin'), async (req, res, next) => {
    try{
        await User.findByIdAndUpdate(req.params.id, {isActive: true});
        sendSuccess(res, null, 'User activated successfully');
    } catch (error) {
        next(error);
    }
});

module.exports = router;