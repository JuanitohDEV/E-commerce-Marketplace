const cron = require('node-cron');
const Product = require('../models/Product');

// Runs every hour --- check products with low or zero stock

const startLowStockAlert = ()  => {
    cron.schedule('0 * * * *', async () => {
        try{
            console.log('Running low stock check...');

            //Find all active products where stock <= lowStock
            const lowStockProducts = await Product.find({
                isActive: true,
                $expr: {
                    $and: [
                        {$lte: ['$stock', '$lowStockThreshold'] },
                        {$gt: ['$stock', 0] },
                    ],
                },
            })
            .select('name stock lowStockThreshold seller')
            .populate('seller', 'name email');

            //Find all out of stock products
            const outOfStockProducts = await Product.find({
                isActive: true,
                stock: 0,
            })
            .select('name seller')
            .populate('seller', 'name email');

            if(lowStockProducts.length > 0){
                console.warn(` ${lowStockProducts.length} products with low stock:`);
                lowStockProducts.forEach((p) => {
                    console.warn(` -${p.name} | Stock: ${p.stock} | Threshold: ${p.lowStockThreshold} | Seller: ${p.seller?.email} `);
                });
            }

            if (outOfStockProducts.length > 0) {
                console.error(` ${outOfStockProducts.length} Products out of stock:`);
                outOfStockProducts.forEach((p) => {
                    console.error(` - ${p.name} | Seller: ${p.seller?.email}`);
                });
            }

            if( lowStockProducts.length === 0 && outOfStockProducts.length === 0) {
                console.log(' All products have sufficient stock');
            }

            // Phase 6 -> here we will sen real emails via emailService
        } catch (error) {
            console.error(' Low stock alert job failed', error.message);
        }
    });

    console.log (' Low Stock alert job schedule (every hour)');
};

module.exports = startLowStockAlert;