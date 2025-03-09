const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

// ===== Configuration =====
const BOT_TOKEN = '7901374595:AAGTDSReIu3gRhsDRXxUIR2UJR5MIK4kMCE'; // Replace with your bot token
const ADMIN_ID = 123456789; // Replace with your Telegram Admin ID
const EXPIRY_DATE = '2025/03/15';
const PORT = process.env.PORT || 4000;

// Store bot subscriptions (you can use a database instead)
const activeBots = {};

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    ctx.reply('🤖 أهلا بك! ماذا تريد أن تفعل؟', Markup.inlineKeyboard([
        [Markup.button.callback('• إنشاء بوت جديد •', 'create_bot')],
        [Markup.button.callback('• عرض البوتات النشطة •', 'show_active_bots')]
    ]));
});

// Handle "Create Bot" option
bot.action('create_bot', (ctx) => {
    ctx.reply('🆕 لإنشاء بوت جديد، أرسل **التوكن** الذي حصلت عليه من @BotFather.');
});

// Handle token submission
bot.on('text', async (ctx) => {
    const token = ctx.message.text.trim();

    // Validate token format
    if (!token.match(/^\d+:[A-Za-z0-9_-]{35}$/)) {
        return ctx.reply('❌ التوكن غير صالح. تأكد من نسخه بشكل صحيح من @BotFather.');
    }

    ctx.reply('⏳ جاري التحقق من التوكن...');

    try {
        const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
        if (response.data && response.data.ok) {
            const botInfo = response.data.result;
            
            // Save bot details
            activeBots[botInfo.id] = {
                name: botInfo.first_name,
                username: botInfo.username,
                token: token,
                expiry: EXPIRY_DATE
            };

            // Send confirmation message
                        // Send confirmation message using HTML formatting
                        ctx.reply(`✅ <b>تم تنصيب بوت الحماية الخاص بك:</b>

                            - اسم البوت: ${botInfo.first_name}
                            - ايدي البوت: ${botInfo.id}
                            - معرف البوت: @${botInfo.username}
                            - توكن البوت: <code>${token}</code>
                            
                            ~ <b>تاريخ انتهاء الاشتراك</b>: ${EXPIRY_DATE}
                            - يمكنك دائما تجديد الاشتراك مجانا سيتم تنبيهك عن طريق البوت الخاص بك لاتقلق.`, { 
                                            parse_mode: 'HTML',
                                            disable_web_page_preview: true 
                                        });

            ctx.reply('هل تريد إنشاء بوت آخر؟', Markup.inlineKeyboard([
                [Markup.button.callback('• إنشاء بوت جديد •', 'create_bot')],
                [Markup.button.callback('• عرض البوتات النشطة •', 'show_active_bots')]
            ]));
        } else {
            ctx.reply('❌ التوكن غير صالح أو البوت غير متاح.');
        }
    } catch (error) {
        console.error('❌ خطأ أثناء التحقق:', error);
        ctx.reply('❌ حدث خطأ أثناء التحقق من التوكن.');
    }
});


// Show Active Bots
bot.action('show_active_bots', (ctx) => {
    if (Object.keys(activeBots).length === 0) {
        return ctx.reply('🚫 لا يوجد أي بوتات نشطة.');
    }

    let message = '🤖 <b>البوتات النشطة:</b>\n';
    Object.values(activeBots).forEach((bot, index) => {
        message += `${index + 1}. <b>${bot.name}</b> - <a href="https://t.me/${bot.username}">@${bot.username}</a>\n`;
    });

    ctx.reply(message, { 
        parse_mode: 'HTML',
        disable_web_page_preview: true 
    });
});
// Start the bot
bot.launch().then(() => console.log('✅ Bot is running...'));

// Handle graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
