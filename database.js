// =============================================
// MANGROVE CAFÉ - DATABASE CONNECTION
// Pure Node.js - No Frameworks
// =============================================

const mysql = require('mysql2');
require('dotenv').config();

// Create connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mangrove_cafe',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Convert pool to use promises
const promisePool = pool.promise();

// Test database connection
async function testConnection() {
    try {
        const connection = await promisePool.getConnection();
        console.log('✅ Database connected successfully!');
        console.log(`📊 Database: ${process.env.DB_NAME}`);
        
        // Test query
        const [rows] = await connection.query('SELECT COUNT(*) as count FROM users');
        console.log(`👥 Total users: ${rows[0].count}`);
        
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.error('💡 Please check:');
        console.error('   1. MySQL is running');
        console.error('   2. Database credentials in .env file');
        console.error('   3. Database exists (run schema.sql)');
        return false;
    }
}

// Helper function to execute queries with error handling
async function query(sql, params = []) {
    try {
        const [results] = await promisePool.execute(sql, params);
        return results;
    } catch (error) {
        console.error('Database query error:', error.message);
        console.error('SQL:', sql);
        console.error('Params:', params);
        throw error;
    }
}

// Helper function to get a single row
async function getOne(sql, params = []) {
    const results = await query(sql, params);
    return results[0] || null;
}

// Helper function to insert and return ID
async function insert(sql, params = []) {
    const [result] = await promisePool.execute(sql, params);
    return result.insertId;
}

// Helper function to begin transaction
async function beginTransaction() {
    const connection = await promisePool.getConnection();
    await connection.beginTransaction();
    return connection;
}

// Helper function to commit transaction
async function commit(connection) {
    await connection.commit();
    connection.release();
}

// Helper function to rollback transaction
async function rollback(connection) {
    await connection.rollback();
    connection.release();
}

// Export all database functions
module.exports = {
    pool: promisePool,
    query,
    getOne,
    insert,
    beginTransaction,
    commit,
    rollback,
    testConnection
};

// If this file is run directly, test the connection
if (require.main === module) {
    testConnection().then(success => {
        process.exit(success ? 0 : 1);
    });
}