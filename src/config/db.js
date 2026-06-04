const mongoose = require('mongoose');

// Conection to MongoDB

const connectDB = async () => {
    
    try{
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            //maxPoolSize - simultaneous connections
            maxPoolSize: 10,
        });

        console.log(`✅ MongoDB connected: ${conn.connection.host}`);

        //Connection events

        mongoose.connection.on('error', (err) => {
            console.error(`❌ MongoDB error: ${err.message}`);
        });

        mongoose.connection.on('disconnected', () => {
            console.error('⚠️ MongoDB disconnected');
        });

    } catch (error) {
        console.error(`❌ MongoDB connection failed: ${error.message}`);
        process.exit(1); //Prevention if there is no database
    }
    
};
    
//export function to other files
module.exports = connectDB;