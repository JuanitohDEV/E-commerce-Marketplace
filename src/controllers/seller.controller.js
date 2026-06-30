const SellerProfile = require ('../models/SellerProfile');
const User = require ('../models/User');
const AppError = require('../utils/AppError');
const { sendSuccess, sendPaginated } = require ('../utils/apiResponse');
const { processAndUpload, deleteImage} = require ('../services/image.service');
const paginate = require ('../utils/paginate');
const stripe = require ('../config/stripe');

// POST api/sellers/apply

const applyAsSeller = async (req, res, next) => {
    try{
        const { storeName, description, shippingPolicy, returnPolicy } = req.body;

        // Check if user already has a seller profile
        const existing = await SellerProfile.findOne({ user: req.user._id});
        if(existing){
            return next(new AppError('You already have a seller profile', 400));
        }

        const profileData = {
            user: req.user._id,
            storeName,
            description,
            shippingPolicy,
            returnPolicy,
            status: 'pending',
        };

        // Logo
            if(req.file){
                profileData.logo = await processAndUpload(
                    req.file.buffer,
                    'seller/logos',
                    { width : 400, height: 400, quality: 85}
                );
            }
            
        const profile = await SellerProfile.create(profileData);

        //Notify admin - real time alert of new seller

        const io = req.app.get('io');
        io.to('admins').emit('seller:new_application', {
            sellerId: profile._id,
            storeName: profile.storeName,
            userId: req.user._id,
        });

        sendSuccess(res, { profile }, 'Application submitted. Pending admin review', 201)
    } catch (error) {
        next (error);
    }
};


// GET /api/seller/me
// authenticated seller
const getMyProfile = async (req, res, next) => {
    try{
        const profile = await SellerProfile.findOne({ user: req.user._id });

        if(!profile) {
            return next(new AppError('Seller profile not found', 404));
        }

        sendSuccess(res, { profile }, 'Profile retrieved');
    } catch (error) {
        next(error)
    }
};

// PATCH /api/seller/me
// seller update ther own store profile
const updateMyProfile = async (req, res, next) => {
    try{
        const profile = await SellerProfile.findOne({ user: req.user._id});

        if (!profile) {
            return next(new AppError('Seller profile not found', 404));
        }

        const { storeName, description, shippingPolicy, returnPolicy } = req.body;

        if (storeName) profile.storeName = storeName;
        if (description) profile.description = description;
        if (shippingPolicy) profile.shippingPolicy = shippingPolicy;
        if (returnPolicy) profile.returnPolicy = returnPolicy;

        // replace logo
        if( req.file) {
            if(profile.logo?.publicId) await deleteImage(profile.logo.publicId);
            profile.logo = await processAndUpload(
                req.file.buffer,
                'seller/logo',
                { width: 400, height: 400, quality: 85}
            );
        }

        await profile.save();

        sendSuccess(res, { profile }, 'Profile updated');
    } catch (error) {
        next(error);
    }
};

// POST /api/sellers/onboarding
// Create a Stripe Express account 

const startOnboarding = async (req, res, next) => {
    try{
        const profile = await SellerProfile.findOne({ user: req.user._id})
        .select('+stripeAccountId');

        if(!profile){
            return next(new AppError('Seller profile not found', 404));
        }

        if(profile.status !== 'active') {
            return next(new AppError('Your application must be approved before connecting Stripe', 403));
        }

        if(!profile.stripeAccountId){
            const account = await stripe.accounts.create({
                type: 'express',
                email: req.user.email,
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true},
                },
                business_type: 'individual',
                metadata:{
                    userId: req.user._id.toString(),
                    profileId: profile._id.toString(),
                },
            });

            profile.stripeAccountId = account.id;
            await profile.save();   
        }

        // Generate the KYC onboarding URL

        const accountLink = await stripe.accountLinks.create ({
            account:     profile.stripeAccountId,
            refresh_url: `${process.env.FRONTEND_URL}/seller/onboarding/refresh`,
            return_url:  `${process.env.FRONTEND_URL}/seller/onboarding/complete`,
            type:        'account_onboarding',
        });

        sendSuccess(res, { url: accountLink.url }, 'Onboarding URL generated');
    } catch (error){
        next(error);
    }
};

// GEt /api/sellers/:storeSlug
const getStore = async(req, res, next) => {
    try{ 
        const profile = await SellerProfile.findOne({
            storeSlug: req.params.storeSlug,
            status: 'active',
        }).select('-stripeAccountId -commissionRate -totalRevenue -rejectionReason');

        if(!profile){
            return next (new AppError('Store not found', 404))
        }

        // Get seller's approve products
        const Product = require ('../models/Product');
        const products = await Product.find({
            seller: profile.user,
            isActive: true,
            approvalStatus: 'approved',
        })
        .select('name slug images price compareAtPrice avgRating stock hasVariants')
        .sort({ createdAt: -1 })
        .limit(20);

        sendSuccess(res, { profile, products }, 'Store retrieved');
    } catch (error) {
        next(error);
    }
};

// GET /api/sellers/me/analytics
// Seller dashboard stats
const getMyAnalytics = async(req, res, next) => {
    try{
        const profile = await SellerProfile.findOne({ user: req.user._id });
        if(!profile){
            return next(new AppError('Seller profile not found', 404));
        }

        const Product = require('../models/Product');
        const InventoryMovement = require('../models/InventoryMovement');

        const [totalProducts, lowStockProducts, recentMovements] = await Promise.all([
            Product.countDocuments ({ seller: req.user._id, isActive: true}),
            Product.countDocuments ({
                seller: req.user._id,
                isActive: true,
                $expr: { $lte: ['$stock', '$lowStockThreshold']  },
            }),
            InventoryMovement.find({ createdBy: req.user._id })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('product', 'name'),
        ]);

        sendSuccess(res, {
            totalSales: profile.totalSales,
            totalRevenue: profile.totalRevenue,
            avgRating: profile.avgRating,
            commissionRate: profile.commissionRate,
            totalProducts,
            lowStockProducts,
            recentMovements,
        }, 'Analytics retrieved');
    } catch(error) {
        next(error);
    }
};

// ----------------------------------------- Admin controllers -------------------------------------------
// GET /api/admin/sellers   
const getSellers = async (req, res, next) => {
    try{
        const { status } = req.query;
        const filter = {};
        if(status) filter.status = status

        const result = await paginate(SellerProfile, filter, {
            page: req.query.page,
            limit: req.query.limit,
            populate: { path: 'user', select: 'name email createdAt'},
            select: 'storeName status avgRating totalSales commissionRate createdAt',
        });

        sendPaginated(res, result.data, result.pagination, 'Sellers retrieved');
    } catch (error) {
        next(error);
    }
};

// PATCH /api/admin/sellers/:id/approve

const approveSeller = async(req, res, next) => {
    try{
        const profile = await SellerProfile.findByIdAndUpdate(
            req.params.id,
            {
                status: 'active',
                reviewedBy: req.user._id,
                reviewedAt: new Date(),
            },
            {new: true}
        ).populate('user', 'name email');

        if(!profile){
            return next(new AppError('Seller profile not found', 404));
        }

        // Add seller role to user
        await User.findByIdAndUpdate(profile.user._id, {
            $addToSet: {role: 'seller'} //adToSet for duplicates
        });

        // Notify via Socket.io
        const io =  req.app.get('io');
        io.to(profile.user._id.toString()).emit('seller:approved', {
            message: 'Your seller application has been approved!',
        });

        sendSuccess(res, {profile}, 'seller approved');
    } catch (error) {
        next(error);
    }
};

//PATCH /api/admin/sellers/:id/reject
const rejectSeller = async (req, res, next) => {
    try{
        const { reason } = req.body;

        if(!reason) {
            return next(new AppError('Rejection reason is required', 400));
        }

        const profile = await SellerProfile.findByIdAndUpdate(
            req.params.id,
            {
                status: 'rejected',
                rejectionReason: reason,
                reviewedBy: req.user._id,
                reviewedAt: new Date(),
            },
            { new: true}
        );

        if(!profile){
            return next(new AppError('Seller profile not found',404));
        }

        sendSuccess (res, { profile }, 'Seller rejected');
    } catch (error){
        next(error)
    }
};

//PATCH /api/admin/sellers/:id/suspend
const suspendSeller = async (req, res, next) => {
    try{
        const { reason } = req.body;

        const profile = await SellerProfile.findByIdAndUpdate(
            req.params.id,
            { status: 'suspended' },
            {new : true} 
        ).populate('user', '_id');

        if(!profile){
            return next (new AppError ('Seller profile not found', 404));
        }

        // Deactivate all seller products   
        const Product = require('../models/Product');
        await Product.updateMany(
            { seller: profile.user._id },
            { isActive: false }
        );

        // Notify seller
        const io = req.app.get('io');
        io.to(profile.user._id.toString()).emit('seller:suspended', { reason });

        sendSuccess(res, { profile }, 'Seller suspended');
    } catch(error){
        next(error);
    }
};

module.exports = {
    applyAsSeller,
    getMyProfile,
    updateMyProfile,
    startOnboarding,
    getStore,
    getMyAnalytics,
    getSellers,
    approveSeller,
    rejectSeller,
    suspendSeller,
};

