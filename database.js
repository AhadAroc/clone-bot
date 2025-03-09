const { MongoClient } = require('mongodb');
const { mongoUri, dbName, developerIds } = require('./config');

// MongoDB connection
let db = null;
let client = null;

async function connectToMongoDB() {
    try {
        client = new MongoClient(mongoUri);
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

// Reply functions
async function getReplies() {
    try {
        return await db.collection('replies').find().toArray();
    } catch (error) {
        console.error('Error fetching replies:', error);
        return [];
    }
}

async function getReply(triggerWord) {
    try {
        return await db.collection('replies').findOne({ trigger_word: triggerWord });
    } catch (error) {
        console.error(`Error fetching reply for trigger "${triggerWord}":`, error);
        return null;
    }
}

async function saveReply(triggerWord, replyText) {
    try {
        const result = await db.collection('replies').updateOne(
            { trigger_word: triggerWord },
            { 
                $set: { 
                    reply_text: replyText, 
                    updated_at: new Date() 
                }
            },
            { upsert: true }
        );
        return result;
    } catch (error) {
        console.error('Error saving reply:', error);
        throw error;
    }
}

async function deleteReply(triggerWord) {
    try {
        const result = await db.collection('replies').deleteOne({ trigger_word: triggerWord });
        return result.deletedCount > 0;
    } catch (error) {
        console.error('Error deleting reply:', error);
        throw error;
    }
}

// Developer functions
async function getDevelopers() {
    try {
        return await db.collection('developers').find().toArray();
    } catch (error) {
        console.error('Error fetching developers:', error);
        return [];
    }
}

// Add the isDeveloper function
async function isDeveloper(userId) {
    try {
        console.log('DEBUG: Checking if user is developer:', userId);
        
        // Check in all developer collections
        const developer = await db.collection('developers').findOne({ user_id: userId });
        const primaryDev = await db.collection('primary_developers').findOne({ user_id: userId });
        const secondaryDev = await db.collection('secondary_developers').findOne({ user_id: userId });
        
        const result = !!(developer || primaryDev || secondaryDev);
        console.log('DEBUG: isDeveloper result for user', userId, ':', result);
        
        return result;
    } catch (error) {
        console.error('Error in isDeveloper:', error);
        return false;
    }
}

async function addDeveloper(userId, username) {
    try {
        const result = await db.collection('developers').updateOne(
            { user_id: userId },
            { 
                $set: { 
                    username: username, 
                    added_at: new Date() 
                }
            },
            { upsert: true }
        );
        return result;
    } catch (error) {
        console.error('Error adding developer:', error);
        throw error;
    }
}

async function removeDeveloper(userId) {
    try {
        const result = await db.collection('developers').deleteOne({ user_id: userId });
        return result.deletedCount > 0;
    } catch (error) {
        console.error('Error removing developer:', error);
        throw error;
    }
}

// Group functions
async function getGroups() {
    try {
        return await db.collection('groups').find().toArray();
    } catch (error) {
        console.error('Error fetching groups:', error);
        return [];
    }
}

async function addGroup(groupId, title) {
    try {
        const result = await db.collection('groups').updateOne(
            { group_id: groupId },
            { 
                $set: { 
                    title: title,
                    is_active: true,
                    last_activity: new Date()
                }
            },
            { upsert: true }
        );
        return result;
    } catch (error) {
        console.error('Error adding group:', error);
        throw error;
    }
}

async function updateGroupActivity(groupId) {
    try {
        await db.collection('groups').updateOne(
            { group_id: groupId },
            { $set: { last_activity: new Date() } }
        );
    } catch (error) {
        console.error('Error updating group activity:', error);
    }
}

// User functions
async function getUsers() {
    try {
        return await db.collection('users').find().toArray();
    } catch (error) {
        console.error('Error fetching users:', error);
        return [];
    }
}

async function addUser(userId, username, firstName, lastName) {
    try {
        const result = await db.collection('users').updateOne(
            { user_id: userId },
            { 
                $set: { 
                    username: username,
                    first_name: firstName,
                    last_name: lastName,
                    is_active: true,
                    last_activity: new Date()
                }
            },
            { upsert: true }
        );
        return result;
    } catch (error) {
        console.error('Error adding user:', error);
        throw error;
    }
}

async function updateUserActivity(userId) {
    try {
        await db.collection('users').updateOne(
            { user_id: userId },
            { $set: { last_activity: new Date() } }
        );
    } catch (error) {
        console.error('Error updating user activity:', error);
    }
}

// Export the functions and objects
module.exports = {
    getDb: () => db,
    getClient: () => client,
    connectToMongoDB,
    setupDatabase,
    
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