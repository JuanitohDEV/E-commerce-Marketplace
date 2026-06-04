const multer = require('multer');
const AppError = require('../utils/AppError');

//---------- Multer config ---------------------
// memoryStorage -> files in RAM, never touch disk

const storage = multer.memoryStorage();

// Only accept images file jpeg, png, webp, avif
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

    if(allowedTypes.includes(file.mimetype)) {
        cb(null, true) // accept file
    } else {
        cb(new AppError('Only images are allowed (jpeg, png, webp, avif)', 400), false);
    }
};

const upload = multer ({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max per file
        files: 8, // max 8 files per request
    },
});

// ----------- Named middleware exports ---------------------------------
// uploadSingle -> for category image or seller avatar
// uploadProduct -> for product images 

const uploadSingle = upload.single('image');
const uploadProduct = upload.array('images', 8);

const handleUpload = (uploadFn) => (req, res, next) => {
    uploadFn(req, res, (err) =>{
        if(!err) return next();

        // Multer-specific errors
        if (err.code === 'LIMIT_FILE_SIZE') {
            return next (new AppError('File too large. Maxinum size is 10MB', 400));
        }

        if (err.code === 'LIMIT_FILE_COUNT') {
            return next (new AppError('Too many file. Maxinum is 8 images', 400));
        }

        next(err);
    });
};

module.exports = {
    uploadSingle: (req, res, next) => handleUpload(uploadSingle)(req, res, next),
    uploadProduct: (req, res, next) => handleUpload(uploadProduct)(req, res, next),
};

