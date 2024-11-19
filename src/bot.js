const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve('./database.sqlite'));

// Your code continues here...
// Create the 'users' table if it doesn't exist
db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL,
        username TEXT,
        full_name TEXT
      )
    `, (err) => {
      if (err) {
        console.error("Error creating users table:", err);
      } else {
        console.log("Users table created successfully!");
      }
    });
  });


// Replace with your bot token from BotFather
const token = '8048445649:AAHBHkmHnEOlGFdFw-65mwViNl-9yqES6Ho';
const bot = new TelegramBot(token, { polling: true });

// Welcome message when users start the bot
bot.onText(/\/start(?:\?ref=(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referrerId = match[1]; // Extract the referral ID if provided

  // Welcome message
  bot.sendMessage(chatId, `Welcome to the Mini-App Bot!`);

  try {
      // Check if user is already registered
      const user = await fetchQuery('SELECT * FROM users WHERE telegram_id = ?', [chatId]);

      if (!user.length) {
          // Ask for the user's name
          bot.sendMessage(chatId, `Please provide your name to register.`);

          bot.once('message', async (msg) => {
              const name = msg.text.trim();
              if (name) {
                  await runQuery(
                      'INSERT INTO users (telegram_id, username, full_name) VALUES (?, ?, ?)',
                      [chatId, msg.chat.username || '', name]
                  );

                  // If referrer exists, log the referral
                  if (referrerId) {
                      const referrer = await fetchQuery(
                          'SELECT * FROM users WHERE telegram_id = ?',
                          [referrerId]
                      );

                      if (referrer.length) {
                          await runQuery(
                              'INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)',
                              [referrer[0].id, chatId]
                          );
                          await runQuery(
                              'UPDATE users SET referral_count = referral_count + 1 WHERE id = ?',
                              [referrer[0].id]
                          );

                          bot.sendMessage(
                              referrerId,
                              `🎉 You earned a referral! Your current count is now ${
                                  referrer[0].referral_count + 1
                              }.`
                          );
                      }
                  }

                  bot.sendMessage(chatId, `🎉 Registration successful!`, mainMenu());
              } else {
                  bot.sendMessage(chatId, `Invalid name. Please restart with /start.`);
              }
          });
      } else {
          bot.sendMessage(chatId, `You're already registered!`, mainMenu());
      }
  } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, `An error occurred. Please try again later.`);
  }
});





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
        ],
    },
});


// Handle inline keyboard button clicks
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  try {
      if (data === 'tasks') {
          // Example: Fetch and display available tasks
          const tasks = await fetchQuery('SELECT * FROM tasks', []);
          if (tasks.length > 0) {
              const taskList = tasks
                  .map((task, index) => `${index + 1}. ${task.title} - $${task.reward}`)
                  .join('\n');
              bot.sendMessage(chatId, `📝 Here are the available tasks:\n\n${taskList}`);
          } else {
              bot.sendMessage(chatId, `No tasks are available at the moment. Check back later!`);
          }
      } else if (data === 'balance') {
          // Fetch and display the user's balance
          const user = await fetchQuery('SELECT * FROM users WHERE telegram_id = ?', [chatId]);
          if (user.length > 0) {
              bot.sendMessage(chatId, `💰 Your current balance is: $${user[0].balance || 0}.`);
          } else {
              bot.sendMessage(chatId, `You are not registered yet. Please type /start to register.`);
          }
      } else if (data === 'rewards') {
          bot.sendMessage(chatId, `🎁 Daily and weekly rewards will be available here.`);
      } else if (data === 'referrals') {
          bot.sendMessage(chatId, `👥 Referral information and leaderboards will be available here.`);
      } else {
          bot.sendMessage(chatId, `Unknown option. Please try again.`);
      }
  } catch (err) {
      console.error('Error handling callback query:', err);
      bot.sendMessage(chatId, `An error occurred. Please try again later.`);
  }

  // Acknowledge the callback to remove the "loading" animation in Telegram
  bot.answerCallbackQuery(callbackQuery.id);
});


// Define runQuery function for non-SELECT queries
const runQuery = (query, params) => {
    return new Promise((resolve, reject) => {
      db.run(query, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this); // `this` refers to the inserted row's ID
        }
      });
    });
  };
  
  // Modify registerUser to use runQuery
  const registerUser = async (telegramId, username, fullName) => {
    const insertQuery = 'INSERT INTO users (telegram_id, username, full_name) VALUES (?, ?, ?)';
    const params = [telegramId, username, fullName];
    try {
      const result = await runQuery(insertQuery, params);
      console.log('User registered successfully!', result);
    } catch (err) {
      console.error('Error registering user:', err);
    }
  };
  


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


// Define fetchQuery function
const fetchQuery = (query, params) => {
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  };
  
  // Main async function to handle the logic
  const main = async () => {
    const chatId = 12345; // Example chatId
    try {
      const userExists = await fetchQuery('SELECT * FROM users WHERE telegram_id = ?', [chatId]);
      console.log(userExists);
    } catch (err) {
      console.error(err);
    }
  };
  
  // Call the main function
  main();
