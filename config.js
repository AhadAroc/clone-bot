require('dotenv').config();

module.exports = {
    // Bot configuration
    token: process.env.BOT_TOKEN || '7511592050:AAH1IMH8kG6UolhwwzIOW-Pf2UUM04hEdTM',
    
    // MongoDB configuration
    mongoUri: process.env.MONGODB_URI || 'mongodb+srv://Amr:NidisuSI@cluster0.ay6fa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
    dbName: process.env.DB_NAME || 'replays',
    
    // MongoDB connection options to improve stability
    mongoOptions: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        retryWrites: true,
        w: 'majority',
        maxPoolSize: 10,
        minPoolSize: 5,
        serverSelectionTimeoutMS: 10000
    },
    
    // Database mode: only MongoDB
    dbMode: 'mongodb',
    
    // Developer IDs
    developerIds: new Set([process.env.PRIMARY_DEVELOPER_ID || '7308214106']),
    
    // Cloudinary configuration
    cloudinary: {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dpxowt5m5',
        api_key: process.env.CLOUDINARY_API_KEY || '248273337268518',
        api_secret: process.env.CLOUDINARY_API_SECRET || 'SihooJWz6cMi5bNDAU26Tmf-tIw'
    },
    
    // Application settings
    appSettings: {
        // Maximum number of retries for database operations
        maxDatabaseRetries: 3,
        
        // Delay between retries (in milliseconds)
        retryDelay: 1000,
        
        // Enable debug logging
        debug: false,
        
        // Default language
        defaultLanguage: 'en'
    }
};
