// =============================================
// MANGROVE CAFÉ - AUTHENTICATION CONTROLLER
// Pure Node.js - No Frameworks
// =============================================

const crypto = require('crypto');
const db = require('../database');

// Hash password using PBKDF2 (built into Node.js - no bcrypt needed!)
function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
            if (err) reject(err);
            resolve(salt + ':' + derivedKey.toString('hex'));
        });
    });
}

// Verify password
function verifyPassword(password, hash) {
    return new Promise((resolve, reject) => {
        const [salt, key] = hash.split(':');
        crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
            if (err) reject(err);
            resolve(key === derivedKey.toString('hex'));
        });
    });
}

// Register new user
async function register(userData) {
    const { name, phone, email, password, branch_id, role = 'customer' } = userData;
    
    // Validate required fields
    if (!name || !phone || !password) {
        return {
            status: 400,
            error: 'Name, phone and password are required'
        };
    }
    
    try {
        // Check if user already exists
        const existingUser = await db.getOne(
            'SELECT id FROM users WHERE phone = ? OR (email IS NOT NULL AND email = ?)',
            [phone, email || '']
        );
        
        if (existingUser) {
            return {
                status: 400,
                error: 'User with this phone or email already exists'
            };
        }
        
        // Hash password
        const passwordHash = await hashPassword(password);
        
        // Insert user
        const userId = await db.insert(
            `INSERT INTO users (name, phone, email, password_hash, role, branch_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, phone, email || null, passwordHash, role, branch_id || null]
        );
        
        // If role is rider, create rider record
        if (role === 'rider' && branch_id) {
            await db.insert(
                `INSERT INTO riders (user_id, branch_id, vehicle_type)
                 VALUES (?, ?, 'motorcycle')`,
                [userId, branch_id]
            );
        }
        
        return {
            status: 201,
            message: 'Registration successful',
            userId
        };
        
    } catch (error) {
        console.error('Registration error:', error);
        return {
            status: 500,
            error: 'Registration failed: ' + error.message
        };
    }
}

// Login user
async function login(credentials, generateToken) {
    const { phone, password } = credentials;
    
    if (!phone || !password) {
        return {
            status: 400,
            error: 'Phone and password are required'
        };
    }
    
    try {
        // Get user from database
        const user = await db.getOne(
            `SELECT u.*, r.id as rider_id, r.vehicle_type, r.is_available 
             FROM users u
             LEFT JOIN riders r ON u.id = r.user_id
             WHERE u.phone = ?`,
            [phone]
        );
        
        if (!user) {
            return {
                status: 401,
                error: 'Invalid phone or password'
            };
        }
        
        // Verify password
        const isValid = await verifyPassword(password, user.password_hash);
        
        if (!isValid) {
            return {
                status: 401,
                error: 'Invalid phone or password'
            };
        }
        
        // Check if user is active
        if (!user.is_active) {
            return {
                status: 403,
                error: 'Account is deactivated. Please contact support.'
            };
        }
        
        // Update last login
        await db.query(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );
        
        // Generate JWT token (using provided function)
        const token = generateToken({
            id: user.id,
            phone: user.phone,
            role: user.role,
            branch_id: user.branch_id,
            rider_id: user.rider_id
        });
        
        // Return user info (excluding password)
        const { password_hash, ...userInfo } = user;
        
        return {
            status: 200,
            message: 'Login successful',
            token,
            user: userInfo
        };
        
    } catch (error) {
        console.error('Login error:', error);
        return {
            status: 500,
            error: 'Login failed: ' + error.message
        };
    }
}

// Get user profile
async function getProfile(userId) {
    try {
        const user = await db.getOne(
            `SELECT u.id, u.name, u.phone, u.email, u.role, u.branch_id,
                    b.name as branch_name, b.location as branch_location,
                    r.vehicle_type, r.license_plate, r.total_deliveries, r.rating
             FROM users u
             LEFT JOIN branches b ON u.branch_id = b.id
             LEFT JOIN riders r ON u.id = r.user_id
             WHERE u.id = ?`,
            [userId]
        );
        
        if (!user) {
            return {
                status: 404,
                error: 'User not found'
            };
        }
        
        return {
            status: 200,
            user
        };
        
    } catch (error) {
        console.error('Get profile error:', error);
        return {
            status: 500,
            error: 'Failed to get profile: ' + error.message
        };
    }
}

// Update user profile
async function updateProfile(userId, updates) {
    const { name, email, current_password, new_password } = updates;
    
    try {
        // Build update query
        const fields = [];
        const values = [];
        
        if (name) {
            fields.push('name = ?');
            values.push(name);
        }
        
        if (email) {
            fields.push('email = ?');
            values.push(email);
        }
        
        // If changing password
        if (current_password && new_password) {
            // Verify current password
            const user = await db.getOne(
                'SELECT password_hash FROM users WHERE id = ?',
                [userId]
            );
            
            const isValid = await verifyPassword(current_password, user.password_hash);
            
            if (!isValid) {
                return {
                    status: 401,
                    error: 'Current password is incorrect'
                };
            }
            
            // Hash new password
            const newHash = await hashPassword(new_password);
            fields.push('password_hash = ?');
            values.push(newHash);
        }
        
        if (fields.length === 0) {
            return {
                status: 400,
                error: 'No updates provided'
            };
        }
        
        // Add userId to values
        values.push(userId);
        
        // Update user
        await db.query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        
        return {
            status: 200,
            message: 'Profile updated successfully'
        };
        
    } catch (error) {
        console.error('Update profile error:', error);
        return {
            status: 500,
            error: 'Failed to update profile: ' + error.message
        };
    }
}

// Change password
async function changePassword(userId, oldPassword, newPassword) {
    try {
        const user = await db.getOne(
            'SELECT password_hash FROM users WHERE id = ?',
            [userId]
        );
        
        const isValid = await verifyPassword(oldPassword, user.password_hash);
        
        if (!isValid) {
            return {
                status: 401,
                error: 'Current password is incorrect'
            };
        }
        
        const newHash = await hashPassword(newPassword);
        
        await db.query(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [newHash, userId]
        );
        
        return {
            status: 200,
            message: 'Password changed successfully'
        };
        
    } catch (error) {
        console.error('Change password error:', error);
        return {
            status: 500,
            error: 'Failed to change password: ' + error.message
        };
    }
}

// Logout (client-side only - just for API completeness)
async function logout() {
    return {
        status: 200,
        message: 'Logged out successfully'
    };
}

module.exports = {
    register,
    login,
    getProfile,
    updateProfile,
    changePassword,
    logout,
    // Exported for testing
    hashPassword,
    verifyPassword
};