const Redis = require ('ioredis');

//Redis is used for:
// 1 Refesh tokens hashed TTL 7 days
// 2 Idempotency keys from Stripe TTL 24h avoid double charges
// 3 Remove duplicates from Stripe webhooks TTL 72h
// 4 Rate limiting for IP Prevents DDoS attacks

let redis;

const connectRedis = () => {

    redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,

        retryStrategy(times){
            return Math.min(times * 200, 2000);
        },
    });

    redis.on('connect', () => console.log('✅ Redis connected'));
    redis.on('error', (err) => console.error(`❌ Redis error: ${err.message}`));

    return redis;
};

//Safe Getter

const getRedis = () => {
    if(!redis) throw new Error('Redis not intialized. Call connectRedis() first.');
    return redis;
}

module.exports = { connectRedis, getRedis};