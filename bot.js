const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');

// Replace with your bot token
const BOT_TOKEN = '8048445649:AAHBHkmHnEOlGFdFw-65mwViNl-9yqES6Ho';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Reusable inline keyboard buttons
const menuButtons = [
    [{ text: '📝 Tasks', callback_data: 'tasks' }],
    [{ text: '💰 Balance', callback_data: 'balance' }],
    [{ text: '🎁 Rewards', callback_data: 'rewards' }],
    [{ text: '👥 Referrals', callback_data: 'referrals' }],
    [{ text: '🔄 Transfer', callback_data: 'transfer' }],
    [{ text: '👤 Profile', callback_data: 'profile' }]
];

// Handle /start command
bot.onText(/\/start(?: (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const referrerId = match[1] || null;
    const name = msg.chat.first_name || 'User';

    console.log(`Checking registration for user: ${chatId}`);

    db.get('SELECT * FROM users WHERE id = ?', [chatId], (err, user) => {
        if (err) {
            console.error('Database error during user check:', err);
            bot.sendMessage(chatId, 'An error occurred. Please try again later.');
            return;
        }

        if (!user) {
            console.log(`User ${chatId} not found. Registering...`);
            db.run('INSERT INTO users (id, name, referrals) VALUES (?, ?, ?)', [chatId, name, 0], (insertErr) => {
                if (insertErr) {
                    console.error('Error registering user:', insertErr);
                    bot.sendMessage(chatId, 'Registration failed. Please try again.');
                    return;
                }

                if (referrerId) {
                    db.get('SELECT * FROM users WHERE id = ?', [referrerId], (referrerErr, referrer) => {
                        if (referrer) {
                            db.run('UPDATE users SET referrals = referrals + 1 WHERE id = ?', [referrerId]);
                            db.run('INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)', [referrerId, chatId]);
                            bot.sendMessage(referrerId, `🎉 You referred ${name} and earned a reward!`);
                        } else {
                            console.log(`Referrer ${referrerId} not found.`);
                        }
                    });
                }

                bot.sendMessage(chatId, `🎉 Welcome, ${name}!`, {
                    reply_markup: { inline_keyboard: menuButtons }
                });
            });
        } else {
            console.log(`User ${chatId} is already registered.`);
            bot.sendMessage(chatId, 'You are already registered. Use the buttons below to navigate.', {
                reply_markup: { inline_keyboard: menuButtons }
            });
        }
    });
});

// Handle button callbacks
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    db.get('SELECT * FROM users WHERE id = ?', [chatId], (err, user) => {
        if (err) {
            console.error('Error fetching user:', err);
            bot.sendMessage(chatId, 'An error occurred. Please try again later.');
            return;
        }

        if (!user) {
            bot.sendMessage(chatId, 'Please register first by clicking /start.');
            return;
        }

        switch (data) {
            case 'tasks':
                const referralLink = `https://t.me/abgm1_bot?start=${chatId}`;
                bot.sendMessage(chatId, `Complete your referral task! Share this link to invite others:\n\n${referralLink}`, {
                    reply_markup: { inline_keyboard: menuButtons }
                });
                break;

                case 'balance':
                    db.get('SELECT balance FROM users WHERE id = ?', [chatId], (err, user) => {
                        if (user) {
                            bot.sendMessage(chatId, `Your balance is: $${user.balance}`, {
                                reply_markup: { inline_keyboard: menuButtons }
                            });
                        } else {
                            bot.sendMessage(chatId, 'Could not retrieve your balance. Please try again later.');
                        }
                    });
                    break;
                

            case 'rewards':
                bot.sendMessage(chatId, 'You earn $1 per referral!', {
                    reply_markup: { inline_keyboard: menuButtons }
                });
                break;

            case 'referrals':
                db.all('SELECT referred_id FROM referrals WHERE referrer_id = ?', [chatId], (refErr, referrals) => {
                    if (refErr) {
                        console.error('Error fetching referrals:', refErr);
                        bot.sendMessage(chatId, 'An error occurred. Please try again later.');
                        return;
                    }

                    if (referrals && referrals.length > 0) {
                        const referralList = referrals.map(r => `- User ID: ${r.referred_id}`).join('\n');
                        bot.sendMessage(chatId, `👥 Your referrals:\n${referralList}`, {
                            reply_markup: { inline_keyboard: menuButtons }
                        });
                    } else {
                        bot.sendMessage(chatId, 'You have no referrals yet. Share your referral link to invite others.', {
                            reply_markup: { inline_keyboard: menuButtons }
                        });
                    }
                });
                break;

            case 'transfer':
                bot.sendMessage(chatId, 'Send the name and amount to transfer in this format:\n`name amount`', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: menuButtons }
                });
                break;

            case 'profile':
                bot.sendMessage(chatId, `Name: ${user.name}\nLevel: ${user.level || 'N/A'}\nReferrals: ${user.referrals || 0}`, {
                    reply_markup: { inline_keyboard: menuButtons }
                });
                break;

            default:
                bot.sendMessage(chatId, 'Invalid option. Use the provided buttons.');
        }
    });
});

// Handle unknown commands
bot.onText(/\/.+/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Unknown command. Please use the provided buttons.');
});
