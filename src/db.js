const sqlite3 = require('sqlite3').verbose();

// Initialize SQLite database
const db = new sqlite3.Database('./data/database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// Create tables if they do not exist
const setupDatabase = () => {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            balance REAL DEFAULT 0,
            level INTEGER DEFAULT 1,
            referrals INTEGER DEFAULT 0
        )`);

        // Tasks Table
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            reward REAL NOT NULL
        )`);

        // Referrals Table
        db.run(`CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            referred_id INTEGER NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(referred_id) REFERENCES users(id)
        )`);

        // Transactions Table
        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER,
            receiver_id INTEGER,
            amount REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sender_id) REFERENCES users(id),
            FOREIGN KEY(receiver_id) REFERENCES users(id)
        )`);
    });
};

// Helper function to execute SQL queries
const runQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
};

// Helper function to fetch data
const fetchQuery = (query, params = []) => {
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

module.exports = { db, setupDatabase, runQuery, fetchQuery };
