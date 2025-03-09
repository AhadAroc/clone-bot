const { adminOnly } = require('./middlewares');
const { developerIds } = require('./handlers');
const { ensureDatabaseInitialized } = require('./database');
const { createPrimaryDevelopersTable } = require('./database');
// Add this near the top of your file, with other global variables
const videoRestrictionStatus = new Map();
const gifRestrictionStatus = new Map();
const linkRestrictionStatus = new Map();
const photoRestrictionStatus = new Map();
let photoMessages = new Map(); // chatId -> Set of message IDs

const { isDeveloper } = require('./middlewares');



  // ✅ Function to check if the user is admin or owner
  async function isAdminOrOwner(ctx, userId) {
    try {
        console.log('DEBUG: Checking if user is admin or owner:', userId);
        // First check if it's a DM
        if (ctx.chat.type === 'private') {
            console.log('DEBUG: Chat is private, checking if developer');
            return await isDeveloper(ctx, userId);
        }
        
        // For groups, check admin status
        const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
        console.log('DEBUG: Chat member status:', member.status);
        const result = ['creator', 'administrator'].includes(member.status);
        console.log('DEBUG: isAdminOrOwner result:', result);
        return result;
    } catch (error) {
        console.error('Error in isAdminOrOwner:', error);
        return false;
    }
}

// ✅ Display main menu
function showMainMenu(ctx) {
    ctx.replyWithPhoto('https://postimg.cc/QBJ4V7hg/5c655f5c', {
        caption: '🤖 مرحبًا! أنا بوت الحماية. اختر خيارًا:',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📜 عرض الأوامر', callback_data: 'show_commands' }],
                [{ text: '📂 عرض المجموعات النشطة', callback_data: 'show_active_groups' }]
            ]
        }
    });
}

function setupCommands(bot) {

    bot.command('start', (ctx) => {
        ctx.reply('مرحبًا بك في البوت! استخدم الأمر /help للحصول على قائمة الأوامر المتاحة.');
    });

      
// Update the "بدء" command handler
bot.hears('بدء', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const isDM = ctx.chat.type === 'private';
        
        console.log('DEBUG: بدء command triggered by user:', userId, 'in chat type:', ctx.chat.type);
        
        // First check if it's a DM and user is a developer
        if (isDM) {
            const isDevResult = await isDeveloper(ctx, userId);
            console.log('DEBUG: isDeveloper result:', isDevResult);
            
            if (isDevResult) {
                console.log('DEBUG: Showing developer panel');
                return await showDevPanel(ctx);
            } else {
                console.log('DEBUG: Not a developer, showing regular DM message');
                return ctx.reply('مرحبًا! هذا البوت مخصص للاستخدام في المجموعات. يرجى إضافة البوت إلى مجموعتك للاستفادة من خدماته.');
            }
        } 
        
        // For group chats
        if (await isAdminOrOwner(ctx, userId)) {
            console.log('DEBUG: User is admin/owner in group, showing main menu');
            return showMainMenu(ctx);
        } else {
            console.log('DEBUG: Regular user in group, showing basic message');
            return ctx.reply('مرحبًا! يمكنك استخدام الأوامر المتاحة في المجموعة.');
        }
    } catch (error) {
        console.error('Error handling "بدء" command:', error);
        ctx.reply('❌ حدث خطأ أثناء معالجة الأمر. يرجى المحاولة مرة أخرى لاحقًا.');
    }
});


    async function deleteLatestMessage(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            await ctx.deleteMessage();
            ctx.reply('✅ تم حذف آخر رسالة.');
        } catch (error) {
            console.error(error);
            ctx.reply('❌ حدث خطأ أثناء محاولة حذف الرسالة.');
        }
    }
 

    async function isSubscribed(ctx, userId) {
        try {
            // Check if the user is subscribed to the required channel
            const channelUsername = 'ctrlsrc'; // Replace with your channel username
            const member = await ctx.telegram.getChatMember(`@${channelUsername}`, userId);
            
            // Consider these statuses as subscribed
            const subscribedStatuses = ['creator', 'administrator', 'member'];
            return subscribedStatuses.includes(member.status);
        } catch (error) {
            console.error('Error checking subscription:', error);
            // If there's an error, we'll assume they're not subscribed
            return false;
        }
    }


    async function updateActiveGroups(ctx) {
        try {
            const userId = ctx.from.id;
            const chatId = ctx.chat.id;
            const chatTitle = ctx.chat.title || 'Private Chat';
            const chatType = ctx.chat.type;
            
            // Only track groups and supergroups
            if (chatType === 'group' || chatType === 'supergroup') {
                const db = await ensureDatabaseInitialized();
                
                // Update or insert the active group
                await db.collection('active_groups').updateOne(
                    { chat_id: chatId },
                    { 
                        $set: { 
                            chat_title: chatTitle,
                            last_activity: new Date()
                        }
                    },
                    { upsert: true }
                );
                
                // Track user activity in this group
                await db.collection('user_groups').updateOne(
                    { user_id: userId, chat_id: chatId },
                    { 
                        $set: { last_activity: new Date() },
                        $setOnInsert: { joined_at: new Date() }
                    },
                    { upsert: true }
                );
            }
        } catch (error) {
            console.error('Error updating active groups:', error);
        }
    }
    async function removeLinks(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            let deletedCount = 0;
    
            // Get the message that triggered the command
            const triggerMessageId = ctx.message.message_id;
    
            // Fetch messages in reverse order (from newest to oldest)
            for (let i = triggerMessageId; i > triggerMessageId - 100 && i > 0; i--) {
                try {
                    const message = await ctx.telegram.forwardMessage(chatId, chatId, i);
                    
                    if (message.entities && message.entities.some(entity => entity.type === 'url')) {
                        await ctx.telegram.deleteMessage(chatId, i);
                        deletedCount++;
                    }
                    
                    // Delete the forwarded message
                    await ctx.telegram.deleteMessage(chatId, message.message_id);
                } catch (error) {
                    // If message not found or already deleted, continue to the next one
                    if (error.description !== "Bad Request: message to forward not found") {
                        console.error(`Error processing message ${i}:`, error);
                    }
                }
            }
    
            ctx.reply(`✅ تم حذف ${deletedCount} رسالة تحتوي على روابط.`);
        } catch (error) {
            console.error('Error in removeLinks:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة حذف الروابط.');
        }
    }
    function showDevPanel(ctx) {
        const message = 'مرحبا عزيزي المطور الاساسي\nإليك ازرار التحكم بالاقسام\nتستطيع التحكم بجميع الاقسام فقط اضغط على القسم الذي تريده';
        const keyboard = {
            inline_keyboard: [
                [{ text: '• الردود •', callback_data: 'dev_replies' }],
                [{ text: '• الإذاعة •', callback_data: 'dev_broadcast' }],
                [{ text: 'السورس', callback_data: 'dev_source' }],
                [{ text: '• اسم البوت •', callback_data: 'dev_bot_name' }],
                [{ text: 'الاحصائيات', callback_data: 'dev_statistics' }],
                [{ text: 'المطورين', callback_data: 'dev_developers' }],
                [{ text: 'قريبا', callback_data: 'dev_welcome' }],
                [{ text: 'إلغاء', callback_data: 'dev_cancel' }]
            ]
        };
    
        if (ctx.callbackQuery) {
            ctx.editMessageText(message, { reply_markup: keyboard });
        } else {
            ctx.reply(message, { reply_markup: keyboard });
        }
    }
    function getCommandList() {
        return `📜 قائمة الأوامر:
    ⌁︙معرفي ↫ معرفك
    ⌁︙ترقية مميز ↫ مميز
    ⌁︙ترقية ادمن ↫ ادمن
    ⌁︙ترقية مدير ↫ مدير
    ⌁︙ترقية منشئ ↫ منشئ
    ⌁︙منع الصور ↫ منع إرسال الصور
    ⌁︙سماح الصور ↫ السماح بإرسال الصور
    ⌁︙تنزيل ↫ إزالة رتبة مستخدم
    ⌁︙ترقية منشئ اساسي ↫ منشئ اساسي
    ⌁︙ترقية مطور ↫ مطور
    ⌁︙ترقية مطور ثانوي ↫ مطور ثانوي
    ⌁︙ازالة رتبة ↫ تنزيل رتبة
    ⌁︙رابط المجموعة ↫ رابط المجموعة
    ⌁︙نداء الجميع ↫ نداء الكل
    ⌁︙كتم ↫ كتم مستخدم
    ⌁︙الغاء كتم ↫ إلغاء كتم مستخدم
    ⌁︙مسح ↫ حذف آخر رسالة
    ⌁︙تثبيت ↫ تثبيت رسالة
    ⌁︙نكتة ↫ إرسال نكتة
    ⌁︙طرد ↫ طرد مستخدم
    ⌁︙مسح الصور ↫ حذف آخر الصور المرسلة
    ⌁︙منع الصور ↫ منع إرسال الصور
    ⌁︙سماح الصور ↫ السماح بإرسال الصور
    ⌁︙ازالة الروابط ↫ حذف الروابط في المجموعة
    ⌁︙فتح روابط ↫ السماح بمشاركة الروابط
    ⌁︙غلق روابط ↫ منع مشاركة الروابط
    ⌁︙منع فيديو ↫ منع إرسال الفيديوهات
    ⌁︙تفعيل فيديو ↫ السماح بإرسال الفيديوهات
    ⌁︙منع متحركة ↫ منع إرسال الصور المتحركة
    ⌁︙تفعيل متحركة ↫ السماح بإرسال الصور المتحركة`
    
    }
    async function isDeveloper(ctx, userId) {
        if (developerIds.has(userId.toString())) {
            return true;
        }
        try {
            const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, userId);
            return chatMember.custom_title === 'مطور';
        } catch (error) {
            console.error('Error checking developer status:', error);
            return false;
        }
    }
    // Add this function to get the custom bot name for a chat
    async function getCustomBotName(chatId) {
        try {
            const db = await ensureDatabaseInitialized();
            const customName = await db.collection('bot_custom_names').findOne({ chat_id: chatId });
            
            if (customName) {
                return customName.custom_name;
            }
            return null;
        } catch (error) {
            console.error('Error retrieving custom bot name:', error);
            return null;
        }
    }
    async function showUserId(ctx) {
        try {
            const userId = ctx.from.id;
            const firstName = ctx.from.first_name || 'User';
            const username = ctx.from.username ? `@${ctx.from.username}` : 'N/A';
            
            const message = `${firstName}\nمعرفي\n${username} ↫ معرفك ↓\n${userId}`;
            
            await ctx.replyWithHTML(`<code>${message}</code>`);
        } catch (error) {
            console.error('Error in showUserId:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة عرض معرف المستخدم.');
        }
    }
    // Add this function to handle link sharing toggling
async function toggleLinkSharing(ctx, allow) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        linkRestrictionStatus.set(chatId, !allow);

        if (allow) {
            await ctx.reply('✅ تم السماح بمشاركة الروابط للجميع في المجموعة.');
        } else {
            await ctx.reply('✅ تم منع مشاركة الروابط للأعضاء العاديين في المجموعة.');
        }
    } catch (error) {
        console.error('Error in toggleLinkSharing:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تغيير إعدادات مشاركة الروابط.');
    }
}

    
 





  
    
    // Send a joke
    async function sendJoke(ctx) {
        try {
            const jokes = [
                "واحد راح للدكتور قاله: يا دكتور صوتي راح... الدكتور: وانت جاي تدور عليه هنا؟",
                "مرة واحد راح لصاحبه البخيل، قال له: عندك شاي؟ قال: أيوة. قال: طيب ممكن كوباية ماية ساقعة؟",
                "واحد بيقول لصاحبه: تعرف إن النملة بتشيل 50 ضعف وزنها؟ صاحبه: ياه! أمال جوزها بيشيل كام؟",
                "مرة واحد بلديتنا راح يشتري تليفون، البائع قاله: دة موبايل نوكيا. قاله: لا مش عايز نوكيا، عايز واحد يرن بس",
                "واحد بيسأل صاحبه: إيه رأيك في الزواج؟ قاله: زي الحرب كده.. اللي بره نفسه يدخل واللي جوه نفسه يطلع"
            ];
            
            const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
            
            // Send the GIF
            await ctx.replyWithAnimation('https://media.giphy.com/media/fUYhyT9IjftxrxJXcE/giphy.gif?cid=ecf05e47tlilm6ghl00scnmkbgaype5bkcptjdqb0gw9flx0&ep=v1_gifs_search&rid=giphy.gif&ct=g');
            
            // Send the joke text
            await ctx.reply(`😂 إليك نكتة:\n\n${randomJoke}`);
        } catch (error) {
            console.error('Error in sendJoke:', error);
            ctx.reply('❌ عذرًا، حدث خطأ أثناء محاولة إرسال النكتة.');
        }
    }
    async function kickUser(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const replyMessage = ctx.message.reply_to_message;
            if (!replyMessage) {
                return ctx.reply('❌ يجب الرد على رسالة المستخدم الذي تريد طرده.');
            }
    
            const userId = replyMessage.from.id;
            const userMention = `[${replyMessage.from.first_name}](tg://user?id=${userId})`;
    
            await ctx.telegram.kickChatMember(ctx.chat.id, userId);
            await ctx.telegram.unbanChatMember(ctx.chat.id, userId); // Unban to allow rejoining
    
            ctx.replyWithMarkdown(`✅ تم طرد المستخدم ${userMention} من المجموعة.`);
        } catch (error) {
            console.error(error);
            ctx.reply('❌ حدث خطأ أثناء محاولة طرد المستخدم.');
        }
    }
    
    async function enableVideoSharing(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            videoRestrictionStatus.set(chatId, false);
            ctx.reply('✅ تم تفعيل مشاركة الفيديوهات للجميع.');
        } catch (error) {
            console.error('Error in enableVideoSharing:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة تفعيل مشاركة الفيديوهات.');
        }
    }
    async function disableGifSharing(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            gifRestrictionStatus.set(chatId, true);
            ctx.reply('✅ تم تعطيل مشاركة الصور المتحركة للأعضاء العاديين. فقط المشرفين يمكنهم إرسال الصور المتحركة الآن.');
        } catch (error) {
            console.error('Error in disableGifSharing:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة تعطيل مشاركة الصور المتحركة.');
        }
    }
    // ✅ Demote user
    // ✅ Demote user
    async function demoteUser(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            let userId, userMention;
            const replyMessage = ctx.message.reply_to_message;
    
            if (replyMessage) {
                userId = replyMessage.from.id;
                userMention = `[${replyMessage.from.first_name}](tg://user?id=${userId})`;
            } else {
                const args = ctx.message.text.split(' ').slice(1);
                if (args.length === 0) {
                    return ctx.reply('❌ يجب الرد على رسالة المستخدم أو ذكر معرفه (@username) أو معرفه الرقمي.');
                }
                const username = args[0].replace('@', '');
                try {
                    const user = await ctx.telegram.getChatMember(ctx.chat.id, username);
                    userId = user.user.id;
                    userMention = `[${user.user.first_name}](tg://user?id=${userId})`;
                } catch (error) {
                    return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
                }
            }
    
            const botInfo = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
            if (!botInfo || botInfo.status !== "administrator" || !botInfo.can_promote_members) {
                return ctx.reply('❌ البوت ليس لديه إذن "إدارة المستخدمين". يرجى تعديل صلاحيات البوت.');
            }
    
            const targetUserInfo = await ctx.telegram.getChatMember(ctx.chat.id, userId);
            if (targetUserInfo.status === 'creator') {
                return ctx.reply('❌ لا يمكن إزالة رتبة مالك المجموعة.');
            }
    
            if (targetUserInfo.status !== 'administrator') {
                return ctx.reply('❌ هذا المستخدم ليس مشرفًا بالفعل.');
            }
    
            await ctx.telegram.promoteChatMember(ctx.chat.id, userId, {
                can_change_info: false,
                can_post_messages: false,
                can_edit_messages: false,
                can_delete_messages: false,
                can_invite_users: false,
                can_restrict_members: false,
                can_pin_messages: false,
                can_promote_members: false
            });
    
            ctx.replyWithMarkdown(`✅ تم إزالة رتبة المستخدم ${userMention} بنجاح.`);
        } catch (error) {
            console.error('Error in demoteUser:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة إزالة رتبة المستخدم.');
        }
    }
    // ✅ Promote user to the specified role
    // ✅ Promote user to the specified role
    async function promoteUser(ctx, role) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين والمالك فقط.');
            }
    
            const args = ctx.message.text.split(' ').slice(1);
            if (args.length === 0 && !ctx.message.reply_to_message) {
                return ctx.reply('❌ يجب ذكر معرف المستخدم (@username) أو الرد على رسالته لترقيته.');
            }
    
            let userId, userMention;
            if (ctx.message.reply_to_message) {
                userId = ctx.message.reply_to_message.from.id;
                userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
            } else {
                const username = args[0].replace('@', '');
                try {
                    const user = await ctx.telegram.getChat(username);
                    userId = user.id;
                    userMention = `[${user.first_name}](tg://user?id=${userId})`;
                } catch (error) {
                    return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
                }
            }
    
            const db = await ensureDatabaseInitialized();
            let collection, successMessage;
    
            switch (role) {
                case 'مطور':
                case 'developer':
                    collection = 'developers';
                    successMessage = `✅ تم ترقية المستخدم ${userMention} إلى مطور.`;
                    break;
                case 'مطور ثانوي':
                case 'secondary_developer':
                    collection = 'secondary_developers';
                    successMessage = `✅ تم ترقية المستخدم ${userMention} إلى مطور ثانوي.`;
                    break;
                case 'مطور أساسي':
                case 'primary_developer':
                    collection = 'primary_developers';
                    successMessage = `✅ تم ترقية المستخدم ${userMention} إلى مطور أساسي.`;
                    break;
                default:
                    throw new Error('Invalid role specified: ' + role);
            }
    
            await db.collection(collection).updateOne(
                { user_id: userId },
                { $set: { user_id: userId, username: args[0] || ctx.message.reply_to_message.from.username } },
                { upsert: true }
            );
            
            ctx.replyWithMarkdown(successMessage);
        } catch (error) {
            console.error(`Error promoting user to ${role}:`, error);
            ctx.reply(`❌ حدث خطأ أثناء ترقية المستخدم إلى ${role}. الرجاء المحاولة مرة أخرى لاحقًا.`);
        }
    }

    async function disablePhotoSharing(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            photoRestrictionStatus.set(chatId, true);
            ctx.reply('✅ تم تعطيل مشاركة الصور للأعضاء العاديين. فقط المشرفين يمكنهم إرسال الصور الآن.');
        } catch (error) {
            console.error('Error in disablePhotoSharing:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة تعطيل مشاركة الصور.');
        }
    }
    
    async function enablePhotoSharing(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            photoRestrictionStatus.set(chatId, false);
            ctx.reply('✅ تم تفعيل مشاركة الصور للجميع.');
        } catch (error) {
            console.error('Error in enablePhotoSharing:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة تفعيل مشاركة الصور.');
        }
    }
    
    // Function to handle secondary developer promotion
    async function promoteToSecondaryDeveloper(ctx) {
        try {
            // Check if the user is an admin or owner
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين والمالك فقط.');
            }
    
            const args = ctx.message.text.split(' ').slice(1);
            if (args.length === 0 && !ctx.message.reply_to_message) {
                return ctx.reply('❌ يجب ذكر معرف المستخدم (@username) أو الرد على رسالته لترقيته إلى مطور ثانوي.');
            }
    
            let userId, userMention;
            if (ctx.message.reply_to_message) {
                userId = ctx.message.reply_to_message.from.id;
                userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
            } else {
                const username = args[0].replace('@', '');
                try {
                    const user = await ctx.telegram.getChat(username);
                    userId = user.id;
                    userMention = `[${user.first_name}](tg://user?id=${userId})`;
                } catch (error) {
                    return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
                }
            }
    
            const connection = await pool.getConnection();
            await connection.query(
                'INSERT INTO secondary_developers (user_id, username) VALUES (?, ?) ON DUPLICATE KEY UPDATE username = ?',
                [userId, args[0] || ctx.message.reply_to_message.from.username, args[0] || ctx.message.reply_to_message.from.username]
            );
            connection.release();
    
            ctx.replyWithMarkdown(`✅ تم ترقية المستخدم ${userMention} إلى مطور ثانوي بنجاح.`);
        } catch (error) {
            console.error('Error promoting user to secondary developer:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة ترقية المستخدم إلى مطور ثانوي. الرجاء المحاولة مرة أخرى لاحقًا.');
        }
    }
    async function demoteUser(ctx, role) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين والمالك فقط.');
            }
    
            const args = ctx.message.text.split(' ').slice(1);
            if (args.length === 0) {
                return ctx.reply('❌ يجب ذكر معرف المستخدم (@username) أو الرد على رسالته لتنزيله.');
            }
    
            let userId, userMention;
            if (ctx.message.reply_to_message) {
                userId = ctx.message.reply_to_message.from.id;
                userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
            } else {
                const username = args[0].replace('@', '');
                try {
                    const user = await ctx.telegram.getChat(username);
                    userId = user.id;
                    userMention = `[${user.first_name}](tg://user?id=${userId})`;
                } catch (error) {
                    return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
                }
            }
    
            const connection = await pool.getConnection();
            let query, successMessage;
    
            switch (role) {
                case 'developer':
                    query = 'DELETE FROM developers WHERE user_id = ?';
                    successMessage = `✅ تم تنزيل المستخدم ${userMention} من قائمة المطورين.`;
                    break;
                case 'secondary_developer':
                    query = 'DELETE FROM secondary_developers WHERE user_id = ?';
                    successMessage = `✅ تم تنزيل المستخدم ${userMention} من قائمة المطورين الثانويين.`;
                    break;
                case 'primary_developer':
                    query = 'DELETE FROM primary_developers WHERE user_id = ?';
                    successMessage = `✅ تم تنزيل المستخدم ${userMention} من قائمة المطورين الأساسيين.`;
                    break;
                default:
                    throw new Error('Invalid role specified');
            }
    
            await connection.query(query, [userId]);
            connection.release();
            ctx.replyWithMarkdown(successMessage);
        } catch (error) {
            console.error(`Error demoting user from ${role}:`, error);
            ctx.reply(`❌ حدث خطأ أثناء تنزيل المستخدم من ${role}. الرجاء المحاولة مرة أخرى لاحقًا.`);
        }
    }
    //call command
    async function callEveryone(ctx) {
        try {
            // Detailed permission check
            const botInfo = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
            console.log('Bot permissions:', JSON.stringify(botInfo, null, 2));
    
            if (!botInfo || botInfo.status !== "administrator") {
                return ctx.reply('❌ البوت ليس مشرفًا في هذه المجموعة.');
            }
    
            // Check for essential permissions
            const requiredPermissions = [
                'can_manage_chat',
                'can_delete_messages',
                'can_invite_users',
                'can_restrict_members',
                'can_pin_messages'
            ];
    
            const missingPermissions = requiredPermissions.filter(perm => !botInfo[perm]);
    
            if (missingPermissions.length > 0) {
                return ctx.reply(`❌ البوت يفتقد الصلاحيات التالية: ${missingPermissions.join(', ')}. يرجى تعديل صلاحيات البوت.`);
            }
    
            // Get chat information
            const chat = await ctx.telegram.getChat(ctx.chat.id);
    
            // Get chat administrators
            const admins = await ctx.telegram.getChatAdministrators(ctx.chat.id);
    
            if (admins.length === 0) {
                return ctx.reply('❌ لم يتم العثور على مشرفين في المجموعة.');
            }
    
            // Mention administrators
            const chunkSize = 4096;
            let message = "🚨 نداء للمشرفين:\n";
            for (const admin of admins) {
                if (admin.user.is_bot) continue; // Skip bots
                const mention = `[${admin.user.first_name}](tg://user?id=${admin.user.id})`;
                if (message.length + mention.length > chunkSize) {
                    await ctx.reply(message, { parse_mode: "Markdown" });
                    message = "🚨 متابعة النداء للمشرفين:\n";
                }
                message += ` ${mention}`;
            }
    
            if (message !== "🚨 نداء للمشرفين:\n" && message !== "🚨 متابعة النداء للمشرفين:\n") {
                await ctx.reply(message, { parse_mode: "Markdown" });
            }
    
            // Send a general message for all members
            await ctx.reply("🔔 تنبيه لجميع الأعضاء! يرجى الانتباه إلى هذا الإعلان الهام.", { parse_mode: "Markdown" });
        } catch (error) {
            console.error('Error in callEveryone:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة نداء الجميع.');
        }
    }
    // Delete latest message
async function deleteLatestMessage(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        await ctx.deleteMessage();
        ctx.reply('✅ تم حذف آخر رسالة.');
    } catch (error) {
        console.error(error);
        ctx.reply('❌ حدث خطأ أثناء محاولة حذف الرسالة.');
    }
}
// Add this function to check if the chat is a group
function isGroupChat(ctx) {
    return ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
}

// Also update the isPrimaryDeveloper function to use MongoDB
async function isPrimaryDeveloper(ctx, userId) {
    try {
        console.log('DEBUG: Checking if user is primary developer:', userId);
        const { MongoClient } = require('mongodb');
        const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
        const client = new MongoClient(uri);
        
        await client.connect();
        const db = client.db("protectionBot");
        const primaryDev = await db.collection('primary_developers').findOne({ user_id: userId });
        const result = !!primaryDev;
        console.log('DEBUG: isPrimaryDeveloper result:', result);
        
        await client.close();
        return result;
    } catch (error) {
        console.error('Error in isPrimaryDeveloper:', error);
        return false;
    }
}

// Add a function to check if user is secondary developer
async function isSecondaryDeveloper(ctx, userId) {
    try {
        console.log('DEBUG: Checking if user is secondary developer:', userId);
        const { MongoClient } = require('mongodb');
        const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
        const client = new MongoClient(uri);
        
        await client.connect();
        const db = client.db("protectionBot");
        const secondaryDev = await db.collection('secondary_developers').findOne({ user_id: userId });
        const result = !!secondaryDev;
        console.log('DEBUG: isSecondaryDeveloper result:', result);
        
        await client.close();
        return result;
    } catch (error) {
        console.error('Error in isSecondaryDeveloper:', error);
        return false;
    }
}


async function deleteLatestPhotos(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        let deletedCount = 0;
        const photos = photoMessages.get(chatId) || [];

        // Sort photos by timestamp, most recent first
        photos.sort((a, b) => b.timestamp - a.timestamp);

        for (const photo of photos) {
            try {
                await ctx.telegram.deleteMessage(chatId, photo.messageId);
                deletedCount++;
            } catch (error) {
                console.error(`Failed to delete message ${photo.messageId}:`, error);
            }
        }

        // Clear the array after deletion
        photoMessages.set(chatId, []);

        ctx.reply(`✅ تم حذف ${deletedCount} صورة.`);
    } catch (error) {
        console.error('Error in deleteLatestPhotos:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة حذف الصور.');
    }
}
async function enableGifSharing(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        gifRestrictionStatus.set(chatId, false);
        ctx.reply('✅ تم تفعيل مشاركة الصور المتحركة للجميع.');
    } catch (error) {
        console.error('Error in enableGifSharing:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تفعيل مشاركة الصور المتحركة.');
    }
}
async function disableVideoSharing(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        videoRestrictionStatus.set(chatId, true);
        ctx.reply('✅ تم تعطيل مشاركة الفيديوهات للأعضاء العاديين. فقط المشرفين يمكنهم إرسال الفيديوهات الآن.');
    } catch (error) {
        console.error('Error in disableVideoSharing:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تعطيل مشاركة الفيديوهات.');
    }
}
// Pin message
async function pinMessage(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        if (!ctx.message.reply_to_message) {
            return ctx.reply('❌ يجب الرد على الرسالة التي تريد تثبيتها.');
        }

        await ctx.pinChatMessage(ctx.message.reply_to_message.message_id);
        ctx.reply('✅ تم تثبيت الرسالة.');
    } catch (error) {
        console.error(error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تثبيت الرسالة.');
    }
}
// Mute/Unmute user
async function muteUser(ctx, mute = true) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const replyMessage = ctx.message.reply_to_message;
        if (!replyMessage) {
            return ctx.reply('❌ يجب الرد على رسالة المستخدم الذي تريد كتمه/إلغاء كتمه.');
        }

        const userId = replyMessage.from.id;
        const userMention = `[${replyMessage.from.first_name}](tg://user?id=${userId})`;

        await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
            can_send_messages: !mute,
            can_send_media_messages: !mute,
            can_send_polls: !mute,
            can_send_other_messages: !mute,
            can_add_web_page_previews: !mute
        });

        ctx.replyWithMarkdown(mute ? `✅ تم كتم المستخدم ${userMention}.` : `✅ تم إلغاء كتم المستخدم ${userMention}.`);
    } catch (error) {
        console.error('Error in muteUser:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة الكتم/إلغاء الكتم.');
    }
}

//call command
async function callEveryone(ctx) {
    try {
        // Detailed permission check
        const botInfo = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
        console.log('Bot permissions:', JSON.stringify(botInfo, null, 2));

        if (!botInfo || botInfo.status !== "administrator") {
            return ctx.reply('❌ البوت ليس مشرفًا في هذه المجموعة.');
        }

        // Check for essential permissions
        const requiredPermissions = [
            'can_manage_chat',
            'can_delete_messages',
            'can_invite_users',
            'can_restrict_members',
            'can_pin_messages'
        ];

        const missingPermissions = requiredPermissions.filter(perm => !botInfo[perm]);

        if (missingPermissions.length > 0) {
            return ctx.reply(`❌ البوت يفتقد الصلاحيات التالية: ${missingPermissions.join(', ')}. يرجى تعديل صلاحيات البوت.`);
        }

        // Get chat information
        const chat = await ctx.telegram.getChat(ctx.chat.id);

        // Get chat administrators
        const admins = await ctx.telegram.getChatAdministrators(ctx.chat.id);

        if (admins.length === 0) {
            return ctx.reply('❌ لم يتم العثور على مشرفين في المجموعة.');
        }

        // Mention administrators
        const chunkSize = 4096;
        let message = "🚨 نداء للمشرفين:\n";
        for (const admin of admins) {
            if (admin.user.is_bot) continue; // Skip bots
            const mention = `[${admin.user.first_name}](tg://user?id=${admin.user.id})`;
            if (message.length + mention.length > chunkSize) {
                await ctx.reply(message, { parse_mode: "Markdown" });
                message = "🚨 متابعة النداء للمشرفين:\n";
            }
            message += ` ${mention}`;
        }

        if (message !== "🚨 نداء للمشرفين:\n" && message !== "🚨 متابعة النداء للمشرفين:\n") {
            await ctx.reply(message, { parse_mode: "Markdown" });
        }

        // Send a general message for all members
        await ctx.reply("🔔 تنبيه لجميع الأعضاء! يرجى الانتباه إلى هذا الإعلان الهام.", { parse_mode: "Markdown" });
    } catch (error) {
        console.error('Error in callEveryone:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة نداء الجميع.');
    }
}

async function getGroupLink(ctx) {
    try {
        // Check if the chat is a group
        if (!isGroupChat(ctx)) {
            return ctx.reply('❌ هذا الأمر يعمل فقط في المجموعات.');
        }

        // Check if the user is an admin or owner
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        // Generate a new invite link
        const chatInviteLink = await ctx.telegram.exportChatInviteLink(ctx.chat.id);
        
        // Send the link
        ctx.reply(`🔗 رابط المجموعة: ${chatInviteLink}`);
    } catch (error) {
        console.error('Error in getGroupLink:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة جلب رابط المجموعة.');
    }
}



// Add this to your existing command handlers
bot.hears('رابط المجموعة', (ctx) => getGroupLink(ctx));
bot.command('رابط_المجموعة', (ctx) => getGroupLink(ctx));
bot.command('ترقية ثانوي', async (ctx) => {
    try {
        if (!(await isPrimaryDeveloper(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمطورين الأساسيين فقط.');
        }

        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0 && !ctx.message.reply_to_message) {
            return ctx.reply('❌ يجب ذكر معرف المستخدم (@username) أو الرد على رسالته لترقيته إلى مطور ثانوي.');
        }

        let userId, userMention;
        if (ctx.message.reply_to_message) {
            userId = ctx.message.reply_to_message.from.id;
            userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
        } else {
            const username = args[0].replace('@', '');
            try {
                const user = await ctx.telegram.getChat(username);
                userId = user.id;
                userMention = `[${user.first_name}](tg://user?id=${userId})`;
            } catch (error) {
                return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
            }
        }

        const connection = await pool.getConnection();
        await connection.query(
            'INSERT INTO secondary_developers (user_id, username) VALUES (?, ?) ON DUPLICATE KEY UPDATE username = ?',
            [userId, args[0] || ctx.message.reply_to_message.from.username, args[0] || ctx.message.reply_to_message.from.username]
        );
        connection.release();

        ctx.replyWithMarkdown(`✅ تم ترقية المستخدم ${userMention} إلى مطور ثانوي بنجاح.`);
    } catch (error) {
        console.error('Error promoting user to secondary developer:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة ترقية المستخدم إلى مطور ثانوي. الرجاء المحاولة مرة أخرى لاحقًا.');
    }
});

// Command handler for "ترقية_ثانوي"
bot.command('ترقية_ثانوي', promoteToSecondaryDeveloper);

// Text handler for "ترقية ثانوي" (without underscore)
bot.hears(/^ترقية ثانوي/, async (ctx) => {
    // Call the same function as the command handler
    await promoteToSecondaryDeveloper(ctx);
});
bot.command('تنزيل مطور', async (ctx) => {
    if (!(await isOwner(ctx, ctx.from.id))) {
        return ctx.reply('❌ هذا الأمر مخصص للمالك فقط.');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
        return ctx.reply('❌ يجب ذكر معرف المستخدم (@username) أو الرد على رسالته لتنزيله من المطورين.');
    }

    let userId, userMention;
    if (ctx.message.reply_to_message) {
        userId = ctx.message.reply_to_message.from.id;
        userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
    } else {
        const username = args[0].replace('@', '');
        try {
            const user = await ctx.telegram.getChat(username);
            userId = user.id;
            userMention = `[${user.first_name}](tg://user?id=${userId})`;
        } catch (error) {
            return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
        }
    }

    try {
        const connection = await pool.getConnection();
        await connection.query('DELETE FROM developers WHERE user_id = ?', [userId]);
        connection.release();
        ctx.replyWithMarkdown(`✅ تم تنزيل المستخدم ${userMention} من قائمة المطورين.`);
    } catch (error) {
        console.error('Error demoting developer:', error);
        ctx.reply('❌ حدث خطأ أثناء تنزيل المطور. الرجاء المحاولة مرة أخرى لاحقًا.');
    }
});




// Update the /start command handler
bot.start(async (ctx) => {
    console.log('DEBUG: "/start" command triggered by user:', ctx.from.id, ctx.from.username);
    try {
        await handleStartCommand(ctx);
    } catch (error) {
        console.error('Error in /start command handler:', error);
        await ctx.reply('❌ حدث خطأ أثناء معالجة الأمر. يرجى المحاولة مرة أخرى لاحقًا.');
    }
});


   



bot.hears('نداء الجميع', adminOnly((ctx) => callEveryone(ctx, true)));
bot.command('ترقية_ثانوي', (ctx) => promoteUser(ctx, 'مطور ثانوي'));
bot.hears(/^ترقية ثانوي/, (ctx) => promoteUser(ctx, 'مطور ثانوي'));

bot.command('promote', (ctx) => promoteUser(ctx, 'مطور'));
bot.command('promote', (ctx) => promoteUser(ctx, 'developer'));

bot.command('تنزيل مطور', async (ctx) => {
    await demoteUser(ctx, 'developer');
});

bot.hears(/^تنزيل مطور/, async (ctx) => {
    await demoteUser(ctx, 'developer');
});
bot.hears('كتم', adminOnly((ctx) => muteUser(ctx, true)));
bot.hears('الغاء_كتم', adminOnly((ctx) => muteUser(ctx, false)));
bot.command('مسح', adminOnly((ctx) => deleteLatestMessage(ctx)));
bot.command('تثبيت', adminOnly((ctx) => pinMessage(ctx)));
bot.command('نكتة', adminOnly((ctx) => sendJoke(ctx)));
bot.command('طرد', adminOnly((ctx) => kickUser(ctx)));
// Add these lines to your existing command handlers
bot.hears(/^ترقية (مميز|ادمن|مدير|منشئ|منشئ اساسي|مطور|مطور ثانوي)/, (ctx) => {
    const role = ctx.match[1];
    promoteUser(ctx, role);
});

bot.hears('تنزيل', (ctx) => demoteUser(ctx));

// Handle "نكتة" text command
bot.hears('نكتة', adminOnly((ctx) => sendJoke(ctx)));
bot.command('مسح الصور', adminOnly((ctx) => deleteLatestPhotos(ctx)));
bot.command('ازالة الروابط', adminOnly((ctx) => removeLinks(ctx)));
bot.hears('ازالة الروابط', (ctx) => removeLinks(ctx));
bot.command('معرفي', (ctx) => showUserId(ctx));
bot.hears('مسح الصور', (ctx) => deleteLatestPhotos(ctx));
bot.hears('معرفي', (ctx) => showUserId(ctx));
bot.command('تنزيل', adminOnly((ctx) => demoteUser(ctx)));
bot.hears('تنزيل', adminOnly((ctx) => demoteUser(ctx)));
bot.hears('فتح روابط', adminOnly((ctx) => toggleLinkSharing(ctx)));
bot.hears('غلق روابط', adminOnly((ctx) => toggleLinkSharing(ctx)));
bot.hears('تثبيت', adminOnly((ctx) => pinMessage(ctx)));
bot.hears('مسح', adminOnly((ctx) => deleteLatestMessage(ctx)));
bot.command('مسح', adminOnly((ctx) => deleteLatestMessage(ctx)));
bot.command('تثبيت', adminOnly((ctx) => pinMessage(ctx)));
bot.command('نكتة', adminOnly((ctx) => sendJoke(ctx)));
bot.command('طرد', adminOnly((ctx) => kickUser(ctx)));

// Handle "نكتة" text command
bot.hears('نكتة', adminOnly((ctx) => sendJoke(ctx)));
bot.command('مسح الصور', adminOnly((ctx) => deleteLatestPhotos(ctx)));
bot.command('ازالة_الروابط', adminOnly((ctx) => removeLinks(ctx)));

bot.command('منع الصور', adminOnly((ctx) => disablePhotoSharing(ctx)));

bot.command('تفعيل الصور', adminOnly((ctx) => enablePhotoSharing(ctx)));

bot.hears('منع الصور', adminOnly((ctx) => disablePhotoSharing(ctx)));
bot.hears('سماح الصور', adminOnly((ctx) => enablePhotoSharing(ctx)));


bot.command('معرفي', (ctx) => showUserId(ctx));

bot.hears('معرفي', (ctx) => showUserId(ctx));
bot.command('تنزيل', adminOnly((ctx) => demoteUser(ctx)));
bot.hears('تنزيل', adminOnly((ctx) => demoteUser(ctx)));

bot.command('كتم', adminOnly((ctx) => muteUser(ctx, true)));
bot.command('الغاء_كتم', adminOnly((ctx) => muteUser(ctx, false)));

bot.command('منع فيديو', adminOnly((ctx) => disableVideoSharing(ctx)));
bot.command('تفعيل فيديو', adminOnly((ctx) => enableVideoSharing(ctx)));

// Also add handlers for text commands without the slash
bot.hears('منع فيديو', adminOnly((ctx) => disableVideoSharing(ctx)));
bot.hears('تفعيل فيديو', adminOnly((ctx) => enableVideoSharing(ctx)));
bot.command('منع_متحركة', adminOnly((ctx) => disableGifSharing(ctx)));
bot.command('تفعيل_متحركة', adminOnly((ctx) => enableGifSharing(ctx)));

// Also add handlers for text commands without the underscore
bot.hears('منع متحركة', adminOnly((ctx) => disableGifSharing(ctx)));
bot.hears('تفعيل متحركة', adminOnly((ctx) => enableGifSharing(ctx)));
bot.command('ترقية_مطور', (ctx) => promoteUser(ctx, 'مطور'));
bot.hears(/^ترقية مطور/, (ctx) => promoteUser(ctx, 'مطور'));
bot.command('ترقية_اساسي', (ctx) => promoteUser(ctx, 'مطور أساسي'));
bot.hears(/^ترقية اساسي/, (ctx) => promoteUser(ctx, 'مطور أساسي'));

bot.hears('الاوامر', (ctx) => {
    ctx.reply(getCommandList());
});
}


module.exports = { setupCommands, isAdminOrOwner,showMainMenu };

