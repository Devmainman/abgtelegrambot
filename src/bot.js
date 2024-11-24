const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ensure the database path is correct
const db = new sqlite3.Database(path.resolve(__dirname, '.database.sqlite'), (err) => {
    if (err) {
        console.error("Error connecting to the database:", err.message);
    } else {
        console.log("Connected to SQLite database successfully!");
    }
});

// Table creation
db.serialize(() => {
    // Drop users table if it exists (only for development/testing)
    db.run(`DROP TABLE IF EXISTS users`);
    
    // Create the users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id TEXT NOT NULL UNIQUE,
            username TEXT,
            full_name TEXT,
            balance REAL DEFAULT 0,
            referral_count INTEGER DEFAULT 0,
            level TEXT DEFAULT 'basic'
        )
    `);

    // Drop referrals table if it exists
    db.run(`DROP TABLE IF EXISTS referrals`);
    
    // Create the referrals table
    db.run(`
       CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id INTEGER NOT NULL,
            referral_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log("Database initialized successfully!");
});



// Replace with your bot token from BotFather
const token = '8048445649:AAHBHkmHnEOlGFdFw-65mwViNl-9yqES6Ho';
const bot = new TelegramBot(token, { polling: true });

let botUsername; // Declare a variable to store the bot's username

// Fetch bot information to set its username
bot.getMe().then((botInfo) => {
    botUsername = botInfo.username; // Save the bot's username
    console.log(`Bot username set to: @${botUsername}`);
}).catch((err) => {
    console.error("Error fetching bot info:", err);
});


// Polling error handling
bot.on('polling_error', (error) => {
  console.error('Polling error details:', JSON.stringify(error, null, 2));
});

// Run a query that modifies data (INSERT/UPDATE/DELETE)
const runQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this); // this refers to the last inserted ID or changes
        });
    });
};

// Fetch query results (SELECT)
const fetchQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};




// Main menu layout
const mainMenu = () => ({
    reply_markup: {
        inline_keyboard: [
            [
                { text: '📝 Tasks', callback_data: 'tasks' },
                { text: '💰 Balance', callback_data: 'balance' },
            ],
            [
                { text: '🎁 Rewards', callback_data: 'rewards' },
                { text: '👥 Referrals', callback_data: 'referrals' },
            ],
            [
                { text: '🏆 Leaderboard', callback_data: 'leaderboard' },
                { text: '🔄 Transfer', callback_data: 'transfer' },
            ],
            
        ],
    },
});


// Handle `/transfer` Command
bot.onText(/\/transfer (\d+)\s+(@\S+)/, async (msg, match) => {
    const senderId = msg.chat.id;
    const amount = parseFloat(match[1]);
    const recipientUsername = match[2].replace('@', '');

    try {
        // Fetch sender and recipient
        const sender = await fetchQuery('SELECT * FROM users WHERE telegram_id = ?', [senderId]);
        const recipient = await fetchQuery('SELECT * FROM users WHERE username = ?', [recipientUsername]);

        if (!sender.length) return bot.sendMessage(senderId, "You're not registered. Use /start to register.");
        if (!recipient.length) return bot.sendMessage(senderId, `Recipient @${recipientUsername} not found.`);
        if (sender[0].balance < amount) return bot.sendMessage(senderId, "Insufficient balance.");

        // Transfer funds
        await runQuery('UPDATE users SET balance = balance - ? WHERE telegram_id = ?', [amount, senderId]);
        await runQuery('UPDATE users SET balance = balance + ? WHERE telegram_id = ?', [amount, recipient[0].telegram_id]);

        bot.sendMessage(senderId, `✅ You sent $${amount} to @${recipientUsername}.`);
        bot.sendMessage(recipient[0].telegram_id, `🎉 You received $${amount} from @${sender[0].username || "Anonymous"}.`);
    } catch (err) {
        console.error("Error during transfer:", err.message);
        bot.sendMessage(senderId, "An error occurred. Please try again.");
    }
});


// Handle Transfer button click
// Handle the 'Transfer' button click
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'transfer') {
        // Step 1: Ask for the amount
        bot.sendMessage(chatId, "Please enter the amount you would like to transfer (e.g., 50):");
        bot.once('message', async (msg) => {
            const amount = parseFloat(msg.text.trim());

            if (isNaN(amount) || amount <= 0) {
                bot.sendMessage(chatId, "Invalid amount. Please try again.");
                return;
            }

            // Step 2: Ask for the recipient's username
            bot.sendMessage(chatId, "Now, please enter the recipient's username (e.g., @username):");
            bot.once('message', async (msg) => {
                const recipientUsername = msg.text.trim();

                if (!recipientUsername.startsWith('@')) {
                    bot.sendMessage(chatId, "Please make sure the username starts with '@'. Try again.");
                    return;
                }

                // Step 3: Confirm the transfer
                bot.sendMessage(chatId, `
✅ **Transfer Details:**
- **Amount**: $${amount}
- **Recipient**: ${recipientUsername}

Do you want to proceed with the transfer?

✅ Type 'Yes' to confirm, or 'Cancel' to cancel.`);
                
                bot.once('message', async (msg) => {
                    const confirmation = msg.text.trim().toLowerCase();

                    if (confirmation === 'yes') {
                        // Perform transfer logic
                        const user = await fetchQuery('SELECT * FROM users WHERE telegram_id = ?', [chatId]);
                        if (user.length > 0 && user[0].balance >= amount) {
                            // Deduct amount from sender
                            await runQuery('UPDATE users SET balance = balance - ? WHERE telegram_id = ?', [amount, chatId]);
                            // Add amount to recipient
                            const recipient = await fetchQuery('SELECT * FROM users WHERE username = ?', [recipientUsername]);
                            if (recipient.length > 0) {
                                await runQuery('UPDATE users SET balance = balance + ? WHERE telegram_id = ?', [amount, recipient[0].telegram_id]);
                                bot.sendMessage(chatId, `✅ Transfer successful! You have sent $${amount} to ${recipientUsername}.`);
                                bot.sendMessage(recipient[0].telegram_id, `🎉 You have received $${amount} from ${msg.chat.username || msg.chat.first_name}.`);
                            } else {
                                bot.sendMessage(chatId, "Recipient not found. Please check the username.");
                            }
                        } else {
                            bot.sendMessage(chatId, "You don't have enough balance for this transfer.");
                        }
                    } else if (confirmation === 'cancel') {
                        bot.sendMessage(chatId, "Transfer has been canceled.");
                    } else {
                        bot.sendMessage(chatId, "Invalid response. Transfer canceled.");
                    }
                });
            });
        });
    }
});






// Handle the /referrals command
bot.onText(/\/referrals/, async (msg) => {
    const chatId = msg.chat.id;
    await handleReferrals(chatId);
});

const handleReferrals = async (chatId) => {
    try {
        const referrals = await fetchQuery(
            `SELECT r.referred_id, u.username, u.full_name 
             FROM referrals r
             LEFT JOIN users u ON r.referred_id = u.telegram_id
             WHERE r.referrer_id = ?`,
            [chatId]
        );

        if (referrals.length > 0) {
            const referralList = referrals
                .map((ref, index) => `${index + 1}. ${ref.full_name || ref.username || 'Unknown User'}`)
                .join('\n');
            bot.sendMessage(chatId, `👥 *Your Referrals:*\n\n${referralList}`, { parse_mode: 'Markdown' });
        } else {
            const referralLink = `https://t.me/${botUsername}?start=ref_${chatId}`;
            bot.sendMessage(chatId, `You have no referrals yet. Share your referral link!\n\n🔗 Referral Link: ${referralLink}`);
        }

        // Optionally, show leaderboard at the end
        const leaderboardText = await getLeaderboard();
        bot.sendMessage(chatId, `🏆 *Global Leaderboard:*\n\n${leaderboardText}`, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('Error fetching referrals:', err.message);
        bot.sendMessage(chatId, `An error occurred while fetching your referrals. Please try again later.`);
    }
};








bot.onText(/\/start(?:\s+ref_(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const referrerId = match[1]; // Extract referrer ID if present

    try {
        // Check if user already exists
        const existingUser = await fetchQuery('SELECT * FROM users WHERE telegram_id = ?', [chatId]);
        if (existingUser.length > 0) {
            return bot.sendMessage(chatId, "You're already registered!", mainMenu());
        }

        // Register new user
        bot.sendMessage(chatId, "Welcome! Please enter your full name to complete registration.");
        bot.once('message', async (msg) => {
            const fullName = msg.text.trim();
            if (!fullName) {
                return bot.sendMessage(chatId, "Invalid name. Please restart registration with /start.");
            }

            await runQuery(
                'INSERT INTO users (telegram_id, username, full_name) VALUES (?, ?, ?)',
                [chatId, msg.chat.username || '', fullName]
            );

            // Handle referral
            if (referrerId) {
                await runQuery(
                    'INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)',
                    [referrerId, chatId]
                );
                await runQuery(
                    'UPDATE users SET referral_count = referral_count + 1 WHERE id = ?',
                    [referrerId]
                );
                bot.sendMessage(referrerId, "🎉 You gained a referral!");
            }

            bot.sendMessage(chatId, "🎉 Registration complete!", mainMenu());
        });
    } catch (err) {
        console.error("Error during registration:", err.message);
        bot.sendMessage(chatId, "An error occurred. Please try again.");
    }
});





// Handle the /balance command
bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const user = await fetchQuery('SELECT * FROM users WHERE telegram_id = ?', [chatId]);
        if (user.length > 0) {
            bot.sendMessage(chatId, `Your current balance is: $${user[0].balance.toFixed(2)}.`);
        } else {
            bot.sendMessage(chatId, `You are not registered yet. Please type /start to register.`);
        }
    } catch (err) {
        console.error('Error fetching balance:', err.message);
        bot.sendMessage(chatId, `There was an error retrieving your balance. Please try again later.`);
    }
});

// Update the User Level based on the number of referrals
// Update User Level based on referral count
const updateUserLevel = async (userId) => {
    try {
        const user = await fetchQuery('SELECT * FROM users WHERE id = ?', [userId]);
        if (user.length) {
            const referralCount = user[0].referral_count;
            let newLevel = user[0].level;

            if (referralCount >= 4 && referralCount < 9) newLevel = 2;
            else if (referralCount >= 9 && referralCount < 13) newLevel = 3;
            else if (referralCount >= 13 && referralCount < 18) newLevel = 4;
            else if (referralCount >= 18) newLevel = 5;

            if (newLevel > user[0].level) {
                await runQuery('UPDATE users SET level = ? WHERE id = ?', [newLevel, userId]);
                return newLevel;
            }
        }
        return null;
    } catch (err) {
        console.error('Error updating user level:', err.message);
    }
};



// Handle inline keyboard button clicks
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id; // Use the userId for specific operations
    const data = callbackQuery.data;

    console.log(`Callback query received: ${JSON.stringify(callbackQuery)}`);
    console.log(`Data received: ${data}`);

    try {
        switch (data) {
            case 'leaderboard':
                await handleLeaderboard(chatId); // Function to handle leaderboard logic
                break;

            case 'referrals':
                await handleReferrals(chatId, userId); // Pass both chatId and userId
                break;

            case 'tasks':
                await handleTasks(chatId);
                break;

            case 'balance':
                await handleBalance(chatId);
                break;

            default:
                await bot.sendMessage(chatId, `Unknown option. Please try again.`);
                break;
        }
    } catch (err) {
        console.error('Error handling callback query:', err);
        await bot.sendMessage(chatId, `An error occurred. Please try again later.`);
    }

    // Acknowledge the callback to remove the "loading" animation
    bot.answerCallbackQuery(callbackQuery.id).catch(err => console.error('Error answering callback:', err));
});




const getReferralsForUser = (userId) => {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database('path_to_your_database.db');
        db.all("SELECT referral_name FROM referrals WHERE referrer_id = ?", [userId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
        db.close();
    });
};


  






// Admin task addition
const ADMIN_IDS = ['123456789']; // Replace with actual Telegram IDs of admins

bot.onText(/\/addtask (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    if (!ADMIN_IDS.includes(chatId.toString())) {
        bot.sendMessage(chatId, `You don't have permission to add tasks.`);
        return;
    }

    const taskDetails = match[1].split('|');
    if (taskDetails.length !== 2) {
        bot.sendMessage(chatId, `Invalid format. Use: /addtask Task Title | Reward Amount`);
        return;
    }

    const [title, reward] = taskDetails.map((t) => t.trim());

    if (!title || isNaN(reward)) {
        bot.sendMessage(chatId, `Invalid input. Make sure to provide a valid task title and reward amount.`);
        return;
    }

    try {
        await runQuery('INSERT INTO tasks (title, reward) VALUES (?, ?)', [title, parseFloat(reward)]);
        bot.sendMessage(chatId, `Task "${title}" added successfully with a reward of $${reward}.`);
    } catch (err) {
        console.error('Error adding task:', err.message);
        bot.sendMessage(chatId, `There was an error adding the task. Please try again.`);
    }
});


const getLeaderboard = () => {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database('path_to_your_database.db');
        db.all(
            "SELECT user_id, COUNT(*) AS referrals_count FROM referrals GROUP BY user_id ORDER BY referrals_count DESC",
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
        db.close();
    });
};

const handleLeaderboard = async (chatId) => {
    try {
        const leaderboard = await getLeaderboard();
        if (leaderboard.length === 0) {
            await bot.sendMessage(chatId, "No data available on the leaderboard.");
            return;
        }

        const leaderboardText = leaderboard
            .map((entry, index) => `${index + 1}. User ${entry.user_id} - ${entry.referrals_count} referrals`)
            .join('\n');

        await bot.sendMessage(chatId, `🏆 Leaderboard:\n\n${leaderboardText}`);
    } catch (err) {
        console.error('Error fetching leaderboard:', err);
        await bot.sendMessage(chatId, "An error occurred while fetching the leaderboard.");
    }
};



  

bot.onText(/\/leaderboard/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const leaderboardText = await getLeaderboard();

        bot.sendMessage(chatId, `🏆 *Leaderboard:*\n\n${leaderboardText}`, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('Error fetching leaderboard:', err.message);
        bot.sendMessage(chatId, "An error occurred while fetching the leaderboard. Please try again later.");
    }
});







