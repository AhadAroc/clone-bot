const { MongoClient } = require('mongodb');
const { mongoUri, dbName, developerIds } = require('./config');

// MongoDB connection
let db = null;
let client = null;

async function connectToMongoDB() {
    try {
        // Add connection options to handle potential SSL issues
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            connectTimeoutMS: 30000,
            socketTimeoutMS: 45000
        };
        
        client = new MongoClient(mongoUri, options);
        await client.connect();
        db = client.db(dbName);
        console.log('Connected to MongoDB successfully');
        return db;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

async function setupDatabase() {
    try {
        console.log('Setting up MongoDB connection...');
        await connectToMongoDB();
        
        // Add primary developer if not exists
        if (developerIds && developerIds.size > 0) {
            const primaryDevId = Array.from(developerIds)[0];
            const existingDev = await db.collection('developers').findOne({ user_id: primaryDevId });
            
            if (!existingDev) {
                await db.collection('developers').insertOne({
                    user_id: primaryDevId,
                    username: 'primary_developer',
                    added_at: new Date()
                });
                console.log(`Primary developer (${primaryDevId}) added to database`);
            }
        }
        
        console.log('Database setup completed');
    } catch (error) {
        console.error('Error setting up database:', error);
        throw error;
    }
}

// Rest of your code remains unchanged
// ... existing code ...

// Add a function to gracefully close the MongoDB connection
async function closeConnection() {
    if (client) {
        try {
            await client.close();
            console.log('MongoDB connection closed');
        } catch (error) {
            console.error('Error closing MongoDB connection:', error);
        }
    }
}

// Add a function to check database connection health
async function checkConnection() {
    if (!client || !db) {
        console.log('No active MongoDB connection, attempting to reconnect...');
        try {
            await connectToMongoDB();
            return true;
        } catch (error) {
            console.error('Failed to reconnect to MongoDB:', error);
            return false;
        }
    }
    
    try {
        // Ping the database to check connection
        await db.command({ ping: 1 });
        return true;
    } catch (error) {
        console.error('MongoDB connection check failed:', error);
        
        // Try to reconnect
        try {
            console.log('Attempting to reconnect to MongoDB...');
            await client.close();
            await connectToMongoDB();
            return true;
        } catch (reconnectError) {
            console.error('Failed to reconnect to MongoDB:', reconnectError);
            return false;
        }
    }
}

// Export the functions and objects
module.exports = {
    getDb: () => db,
    getClient: () => client,
    connectToMongoDB,
    setupDatabase,
    closeConnection,
    checkConnection,
    
    // Reply functions
    getReplies,
    getReply,
    saveReply,
    deleteReply,
    
    // Developer functions
    getDevelopers,
    isDeveloper,
    addDeveloper,
    removeDeveloper,
    
    // Group functions
    getGroups,
    addGroup,
    updateGroupActivity,
    
    // User functions
    getUsers,
    addUser,
    updateUserActivity
};
