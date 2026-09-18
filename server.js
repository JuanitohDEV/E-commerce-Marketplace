// ENVIROMENT VARIABLES

require('dotenv').config();


// MODULES
const express = require('express'); //Framework Web
const http = require('http'); //Module HTTP native
const {Server} = require('socket.io') //Websockets
const helmet = require('helmet'); //security (headers HTTP)
const cors = require('cors'); 
const morgan = require('morgan');  //login request
const cookieParser = require('cookie-parser'); //Cookies
const rateLimit = require('express-rate-limit');
const startLowStockAlert = require('./src/jobs/lowStockAlert') // Review Stock every hour


// Project-specific files

const connectDB = require ('./src/config/db'); //conector BD
const {connectRedis} = require('./src/config/redis'); //conector Redis
const errorHandler = require('./src/middleware/errorHandler');
const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const categoryRoutes = require('./src/routes/category.routes');
const productRoutes = require('./src/routes/product.routes');
const sellerRoutes = require('./src/routes/seller.routes');
const inventoryRoutes = require('./src/routes/inventory.routes');
const cartRoutes = require('./src/routes/cart.routes');
const orderRoutes = require('./src/routes/order.routes');
const couponRoutes = require('./src/routes/coupon.routes');
const webhookRoutes = require('./src/routes/webhook.routes');
const reviewRoutes = require('./src/routes/review.routes');
const returnRoutes = require('./src/routes/return.routes');


// Launch App
const app = express();

const httpServer = http.createServer(app);

// Socket.io
// WebSocket server for real-time communication
const io = new Server(httpServer, {
    
    cors:{

        origin: process.env.FRONTEND_URL,
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

app.set('io', io);


// -------------------Global Middleware----------------------------------

// 1 Helmet

app.use(helmet());

// 2 CORS (Cross-Origin Resource Sharing)

app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true, //for cookies HttpOnly
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 3 Morgan  - only in development

if(process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// 3.5 Stripe webhook 

app.use('/api/webhooks', webhookRoutes);

// 4 Body parsers - limit 10kb prevents large payloads (DoS attack)

app.use(express.json({ limit: '10kb'}));
app.use(express.urlencoded({ extended: true, limit: '10kb'}));

// 5 Cookie parser

app.use(cookieParser());

// 6 Rate limiting global - max 100 requests per Ip address every 15 minutes

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests. Please try again in 15 minutes.'
    },
});
app.use('/api', globalLimiter);

// ROUTES 

// Health check - Railway/Vercel check that the server is up

app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sellers', sellerRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/returns', returnRoutes);

app.all('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
    });
});

// ErrorHandler

app.use(errorHandler);


// STARTUP SERVER

const PORT = process.env.PORT || 5000;

const startServer = async () => {

    await connectDB();
    connectRedis();

    //httpServer.listen

    httpServer.listen(PORT, () => {
        console.log (` Server running on port ${PORT} [${process.env.NODE_ENV}] `);
        console.log (` Health check: http://localhost:${PORT}/health`);
    });

    process.on('unhandledRejection', (err) => {

        console.error(' UNHANDLED REJECTION:', err.message);

        httpServer.close(() => process.exit(1));
    });
    
    process.on('uncaughtException', (err) => {
        
        console.error(' UNCAUGHT EXCEPTION:', err.message); 
        
        process.exit(1);
    });

    startLowStockAlert();
    // SIGTERM

    process.on('SIGTERM', () => {
        
        console.log(' SIGTERM received. Closing server...');

        httpServer.close(() => process.exit(0));
    });
};


startServer();