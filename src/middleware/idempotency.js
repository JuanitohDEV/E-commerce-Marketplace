const { getRedis } = require('../config/redis');
const AppError = require('../utils/AppError');

const IDEMPOTENCY_TTL = 60 * 60 * 24; // 24 hours in seconds

const idempotency = async (req, res, next) => {
    const key = req.headers['idempotency-key'];

    if (!key) {
        return next(new AppError('Idempotency key header is required', 400));
    }

    const redis = getRedis();

    const redisKey = `idempotency:${req.user._id}:${key}`;

    const reserved = await redis.set(
        redisKey,
        JSON.stringify({ status: 'processing' }),
        'EX', IDEMPOTENCY_TTL,
        'NX' 
    );

    if(!reserved) {
        const existing = JSON.parse(await redis.get(redisKey));

        if(existing.status === 'processing') {
            return next(new AppError('A request with this idempotency key is already being processed', 409));    
        }

        return res.status(existing.statusCode).json(existing.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
        redis.set(
            redisKey,
            JSON.stringify({ status: 'done', statusCode: res.statusCode, body }),
            'EX', IDEMPOTENCY_TTL
        ).catch((err) => console.error('Failed to cache idempotent response:', err));

        return originalJson(body);
    };

    next();
};

module.exports = idempotency;