const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bot_database.db');

// Initialize tables
db.serialize(() => {
    // User table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            name TEXT,
            level INTEGER DEFAULT 1,
            balance REAL DEFAULT 0,
            referral_count INTEGER DEFAULT 0,
            referred_by INTEGER
        )
    `);

    // Referrals table
    db.run(`
        CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id INTEGER,
            referred_id INTEGER,
            FOREIGN KEY (referrer_id) REFERENCES users(id),
            FOREIGN KEY (referred_id) REFERENCES users(id)
        )
    `);

    // Transfer requests table
    db.run(`
        CREATE TABLE IF NOT EXISTS transfers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_name TEXT NOT NULL,
            amount REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

module.exports = db;
