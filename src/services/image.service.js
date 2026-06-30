const sharp = require('sharp');
const cloudinary = require ('../config/cloudinary');
const AppError = require('../utils/AppError');

// --- processAndUpload ------
// Buffer (from Multer) -> Sharp (optimize) -> Cloudinary (CDN)
const processAndUpload = async (buffer, folder, options = {})  => {
    const{
        width = 800,
        height = 800,
        quality = 82,
    } = options;

    const processedBuffer = await sharp(buffer)
        .resize(width, height, {
            fit: 'cover', // fill the area, crop if needed
            withoutEnlargement: true, // never upscale smaller images
        })
        .webp({ quality })
        .toBuffer();

    // Upload to Cloduinary
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: 'image',
                transformation: [{ quality:'auto', fetch_format: 'auto' }],
            },
            (error, result) => {
                if(error) return reject(new AppError(`Cloudinary upload failed: ${error.message}`,500));
                resolve({
                    url: result.secure_url, // always HTTPS
                    publicId: result.public_id, // needed to delete the image later
                });
            }
        );
        uploadStream.end(processedBuffer);
    });
};

// -------------- processMultiple ------------------   
// Process and upload multiple images 

const processMultiple = async (buffers, folder, options = {}) => {
    return Promise.all(
        buffers.map((buffer) => processAndUpload(buffer, folder, options))
    );
};

//-------------- deleteImage ------------------
// delete an image from Cloudinary by its publicID

const deleteImage = async (publicId) => {
    try{
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error(`Failed to delete image ${publicId}:`, error.message);
    }
};

// --------------- generateThumbnail ------------------
// Creates a smaller version for cart items and product lists (80x80)

const generateThumbnail = async (buffer, folder) => {
    return processAndUpload(buffer, `${folder}/thumbnails`, {
        width: 400,
        height: 400,
        quality: 75,
    })
}

module.exports = { processAndUpload, processMultiple, deleteImage, generateThumbnail };