// =============================================
// MANGROVE CAFÉ - WEBSOCKET SERVER
// Real-time Communication
// =============================================

const WebSocket = require('ws');
const url = require('url');
const db = require('./database');

// Store connected clients
const clients = new Map(); // userId -> WebSocket
const riderLocations = new Map(); // riderId -> { lat, lng, deliveryId }

function initialize(server) {
    const wss = new WebSocket.Server({ 
        server,
        path: '/ws'
    });
    
    console.log('🔌 WebSocket server initialized');
    
    wss.on('connection', async (ws, req) => {
        const parameters = url.parse(req.url, true);
        const token = parameters.query.token;
        
        // Authenticate user (simplified - in production use proper JWT)
        const userId = await authenticateToken(token);
        
        if (!userId) {
            ws.close(1008, 'Unauthorized');
            return;
        }
        
        // Store client connection
        clients.set(userId, ws);
        console.log(`👤 User ${userId} connected via WebSocket`);
        
        // Send connection confirmation
        ws.send(JSON.stringify({
            type: 'connection',
            message: 'Connected to Mangrove Café real-time service',
            timestamp: new Date().toISOString()
        }));
        
        // Handle incoming messages
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                await handleWebSocketMessage(userId, data, ws);
            } catch (error) {
                console.error('WebSocket message error:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format'
                }));
            }
        });
        
        // Handle client disconnect
        ws.on('close', () => {
            clients.delete(userId);
            
            // Remove rider location if they were a rider
            for (const [riderId, location] of riderLocations.entries()) {
                if (location.userId === userId) {
                    riderLocations.delete(riderId);
                    
                    // Notify customers that rider went offline
                    notifyRiderOffline(riderId);
                    break;
                }
            }
            
            console.log(`👋 User ${userId} disconnected`);
        });
        
        // Send any pending notifications
        await sendPendingNotifications(userId, ws);
    });
    
    return wss;
}

// Authenticate token (simplified - mirror server.js verification)
async function authenticateToken(token) {
    if (!token) return null;
    
    try {
        // In production, verify JWT properly
        // For demo, we'll just extract from a simple token format
        // This should match your JWT verification from server.js
        
        // For demo purposes only - replace with actual JWT verification
        const parts = token.split('.');
        if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            return payload.id;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Handle WebSocket messages
async function handleWebSocketMessage(userId, data, ws) {
    switch (data.type) {
        case 'location_update':
            await handleLocationUpdate(userId, data);
            break;
            
        case 'subscribe_order':
            await subscribeToOrder(userId, data.orderId);
            break;
            
        case 'mark_read':
            await markNotificationRead(userId, data.notificationId);
            break;
            
        case 'ping':
            ws.send(JSON.stringify({
                type: 'pong',
                timestamp: new Date().toISOString()
            }));
            break;
            
        default:
            console.log('Unknown message type:', data.type);
    }
}

// Handle rider location updates
async function handleLocationUpdate(userId, data) {
    const { deliveryId, latitude, longitude, speed, heading } = data;
    
    // Store rider location
    riderLocations.set(userId, {
        userId,
        deliveryId,
        latitude,
        longitude,
        speed,
        heading,
        timestamp: new Date().toISOString()
    });
    
    // Get the order associated with this delivery
    try {
        const [deliveries] = await db.query(`
            SELECT d.order_id, o.customer_id 
            FROM deliveries d
            JOIN orders o ON d.order_id = o.id
            WHERE d.id = ? AND d.rider_id = (
                SELECT id FROM riders WHERE user_id = ?
            )
        `, [deliveryId, userId]);
        
        if (deliveries.length > 0) {
            const { customer_id } = deliveries[0];
            
            // Send location update to customer
            sendToUser(customer_id, {
                type: 'rider_location',
                deliveryId,
                latitude,
                longitude,
                speed,
                heading,
                timestamp: new Date().toISOString()
            });
            
            // Save to database for history
            await db.query(
                `INSERT INTO delivery_tracking (delivery_id, latitude, longitude, speed, heading)
                 VALUES (?, ?, ?, ?, ?)`,
                [deliveryId, latitude, longitude, speed, heading]
            );
        }
    } catch (error) {
        console.error('Error handling location update:', error);
    }
}

// Subscribe to order updates
async function subscribeToOrder(userId, orderId) {
    try {
        // Verify user owns this order or is staff/rider
        const [orders] = await db.query(`
            SELECT o.*, d.rider_id 
            FROM orders o
            LEFT JOIN deliveries d ON o.id = d.order_id
            WHERE o.id = ? AND (o.customer_id = ? OR ? IN (
                SELECT user_id FROM users WHERE role IN ('staff', 'admin')
            ) OR d.rider_id = (SELECT id FROM riders WHERE user_id = ?))
        `, [orderId, userId, userId, userId]);
        
        if (orders.length > 0) {
            // Store subscription (in memory - for production use Redis)
            if (!global.orderSubscriptions) {
                global.orderSubscriptions = new Map();
            }
            
            if (!global.orderSubscriptions.has(orderId)) {
                global.orderSubscriptions.set(orderId, new Set());
            }
            
            global.orderSubscriptions.get(orderId).add(userId);
        }
    } catch (error) {
        console.error('Error subscribing to order:', error);
    }
}

// Mark notification as read
async function markNotificationRead(userId, notificationId) {
    try {
        await db.query(
            'UPDATE notifications SET is_read = true WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );
    } catch (error) {
        console.error('Error marking notification read:', error);
    }
}

// Send any pending notifications to newly connected user
async function sendPendingNotifications(userId, ws) {
    try {
        const [notifications] = await db.query(
            'SELECT * FROM notifications WHERE user_id = ? AND is_read = false ORDER BY created_at DESC LIMIT 10',
            [userId]
        );
        
        if (notifications.length > 0) {
            ws.send(JSON.stringify({
                type: 'pending_notifications',
                notifications
            }));
        }
    } catch (error) {
        console.error('Error sending pending notifications:', error);
    }
}

// Notify customers that rider went offline
function notifyRiderOffline(riderId) {
    // In production, you would find all active deliveries for this rider
    // and notify customers
    console.log(`Rider ${riderId} went offline`);
}

// =============================================
// PUBLIC FUNCTIONS FOR OTHER MODULES
// =============================================

// Send notification to a specific user
function sendToUser(userId, data) {
    const client = clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
        return true;
    }
    return false;
}

// Send notification to multiple users
function sendToUsers(userIds, data) {
    userIds.forEach(userId => {
        sendToUser(userId, data);
    });
}

// Broadcast to all connected clients
function broadcast(data, excludeUserId = null) {
    clients.forEach((client, userId) => {
        if (userId !== excludeUserId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Notify order status change
async function notifyOrderStatusChange(orderId, status, notes = '') {
    try {
        // Get all users interested in this order
        const [orders] = await db.query(`
            SELECT o.customer_id, d.rider_id 
            FROM orders o
            LEFT JOIN deliveries d ON o.id = d.order_id
            WHERE o.id = ?
        `, [orderId]);
        
        if (orders.length === 0) return;
        
        const { customer_id, rider_id } = orders[0];
        const userIds = [customer_id];
        
        // Get rider's user_id if exists
        if (rider_id) {
            const [riders] = await db.query(
                'SELECT user_id FROM riders WHERE id = ?',
                [rider_id]
            );
            if (riders.length > 0) {
                userIds.push(riders[0].user_id);
            }
        }
        
        // Also notify staff (in production, you'd get staff users)
        const [staff] = await db.query(
            'SELECT id FROM users WHERE role IN ("staff", "admin")'
        );
        staff.forEach(s => userIds.push(s.id));
        
        // Create notification in database
        const notificationData = {
            order_id: orderId,
            status,
            timestamp: new Date().toISOString()
        };
        
        for (const userId of userIds) {
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, data)
                 VALUES (?, 'order_status', ?, ?, ?)`,
                [
                    userId,
                    `Order #${orderId} Status Update`,
                    `Order status changed to ${status}`,
                    JSON.stringify(notificationData)
                ]
            );
            
            // Send real-time
            sendToUser(userId, {
                type: 'order_status',
                orderId,
                status,
                notes,
                timestamp: new Date().toISOString()
            });
        }
        
        // Also notify subscribers from in-memory store
        if (global.orderSubscriptions && global.orderSubscriptions.has(orderId)) {
            const subscribers = global.orderSubscriptions.get(orderId);
            subscribers.forEach(userId => {
                sendToUser(userId, {
                    type: 'order_status',
                    orderId,
                    status,
                    notes,
                    timestamp: new Date().toISOString()
                });
            });
        }
        
    } catch (error) {
        console.error('Error notifying order status change:', error);
    }
}

// Notify new order to staff
async function notifyNewOrder(orderId, branchId) {
    try {
        // Get staff at this branch
        const [staff] = await db.query(
            'SELECT id FROM users WHERE branch_id = ? AND role IN ("staff", "admin")',
            [branchId]
        );
        
        const [order] = await db.query(
            'SELECT order_number, total_amount FROM orders WHERE id = ?',
            [orderId]
        );
        
        if (order.length === 0) return;
        
        const notificationData = {
            order_id: orderId,
            order_number: order[0].order_number,
            total: order[0].total_amount
        };
        
        for (const s of staff) {
            await db.query(
                `INSERT INTO notifications (user_id, type, title, message, data)
                 VALUES (?, 'order_status', ?, ?, ?)`,
                [
                    s.id,
                    'New Order Received',
                    `New order #${order[0].order_number} - KES ${order[0].total_amount}`,
                    JSON.stringify(notificationData)
                ]
            );
            
            sendToUser(s.id, {
                type: 'new_order',
                orderId,
                orderNumber: order[0].order_number,
                amount: order[0].total_amount,
                timestamp: new Date().toISOString()
            });
        }
        
    } catch (error) {
        console.error('Error notifying new order:', error);
    }
}

// Notify rider assignment
async function notifyRiderAssigned(orderId, riderId, riderName, riderPhone) {
    try {
        // Notify customer
        const [orders] = await db.query(
            'SELECT customer_id FROM orders WHERE id = ?',
            [orderId]
        );
        
        if (orders.length === 0) return;
        
        const customerId = orders[0].customer_id;
        
        // Create notification
        await db.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES (?, 'rider_assigned', ?, ?, ?)`,
            [
                customerId,
                'Rider Assigned',
                `Your rider ${riderName} (${riderPhone}) has been assigned`,
                JSON.stringify({ orderId, riderId, riderName, riderPhone })
            ]
        );
        
        // Send real-time
        sendToUser(customerId, {
            type: 'rider_assigned',
            orderId,
            riderName,
            riderPhone,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error notifying rider assignment:', error);
    }
}

// Get rider's current location
function getRiderLocation(riderUserId) {
    return riderLocations.get(riderUserId) || null;
}

// Export functions
module.exports = {
    initialize,
    sendToUser,
    sendToUsers,
    broadcast,
    notifyOrderStatusChange,
    notifyNewOrder,
    notifyRiderAssigned,
    getRiderLocation
};