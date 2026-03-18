// =============================================
// MANGROVE CAFÉ - DELIVERY CONTROLLER
// Handle rider assignments and delivery tracking
// =============================================

const db = require('../database');
const websocket = require('../websocket');

// Get available riders for a branch
async function getAvailableRiders(branchId) {
    try {
        const riders = await db.query(
            `SELECT r.*, u.name, u.phone 
             FROM riders r
             JOIN users u ON r.user_id = u.id
             WHERE r.branch_id = ? AND r.is_available = true
             ORDER BY r.total_deliveries DESC`,
            [branchId]
        );
        
        return riders;
        
    } catch (error) {
        console.error('Get available riders error:', error);
        throw error;
    }
}

// Assign rider to delivery
async function assignRider(orderId, riderId, estimatedPickupTime) {
    const connection = await db.beginTransaction();
    
    try {
        // Check if order exists and is ready
        const order = await db.getOne(
            'SELECT * FROM orders WHERE id = ? AND order_status = "ready"',
            [orderId]
        );
        
        if (!order) {
            await db.rollback(connection);
            return { status: 400, error: 'Order not ready for delivery' };
        }
        
        // Check if rider exists and is available
        const rider = await db.getOne(
            'SELECT * FROM riders WHERE id = ? AND is_available = true',
            [riderId]
        );
        
        if (!rider) {
            await db.rollback(connection);
            return { status: 400, error: 'Rider not available' };
        }
        
        // Calculate estimated delivery time (30 min after pickup)
        const estimatedDeliveryTime = new Date(Date.now() + 60 * 60000); // +60 minutes
        
        // Check if delivery record exists
        let delivery = await db.getOne(
            'SELECT id FROM deliveries WHERE order_id = ?',
            [orderId]
        );
        
        let deliveryId;
        
        if (delivery) {
            // Update existing delivery
            await connection.execute(
                `UPDATE deliveries 
                 SET rider_id = ?, assigned_at = NOW(), 
                     estimated_pickup_time = ?, estimated_delivery_time = ?,
                     delivery_status = 'assigned'
                 WHERE order_id = ?`,
                [riderId, estimatedPickupTime || new Date(), estimatedDeliveryTime, orderId]
            );
            deliveryId = delivery.id;
        } else {
            // Create new delivery
            const [result] = await connection.execute(
                `INSERT INTO deliveries (
                    order_id, rider_id, assigned_at, 
                    estimated_pickup_time, estimated_delivery_time,
                    delivery_address, customer_phone, delivery_status
                ) VALUES (?, ?, NOW(), ?, ?, ?, ?, 'assigned')`,
                [
                    orderId, riderId, estimatedPickupTime || new Date(),
                    estimatedDeliveryTime, order.delivery_address,
                    order.customer_phone
                ]
            );
            deliveryId = result.insertId;
        }
        
        // Update rider availability
        await connection.execute(
            'UPDATE riders SET is_available = false WHERE id = ?',
            [riderId]
        );
        
        // Update order status
        await connection.execute(
            'UPDATE orders SET order_status = "out_for_delivery" WHERE id = ?',
            [orderId]
        );
        
        // Add tracking
        await connection.execute(
            `INSERT INTO order_tracking (order_id, status, notes, updated_by)
             VALUES (?, 'out_for_delivery', 'Rider assigned', ?)`,
            [orderId, order.customer_id] // using customer_id as updated_by for tracking
        );
        
        // Get rider user_id for notification
        const riderUser = await db.getOne(
            'SELECT user_id FROM riders WHERE id = ?',
            [riderId]
        );
        
        await db.commit(connection);
        
        // Get rider details for notification
        const riderDetails = await db.getOne(
            'SELECT u.name, u.phone FROM users u JOIN riders r ON u.id = r.user_id WHERE r.id = ?',
            [riderId]
        );
        
        // Notify via websocket
        if (riderDetails) {
            await websocket.notifyRiderAssigned(orderId, riderId, riderDetails.name, riderDetails.phone);
        }
        
        return {
            status: 200,
            message: 'Rider assigned successfully',
            deliveryId,
            estimatedDeliveryTime
        };
        
    } catch (error) {
        await db.rollback(connection);
        console.error('Assign rider error:', error);
        return {
            status: 500,
            error: 'Failed to assign rider: ' + error.message
        };
    }
}

// Get rider's active delivery
async function getRiderActiveDelivery(userId) {
    try {
        const delivery = await db.getOne(
            `SELECT d.*, 
                    o.order_number, o.total_amount, o.payment_method,
                    o.special_instructions, o.delivery_address, o.delivery_notes,
                    u.name as customer_name, u.phone as customer_phone,
                    b.name as branch_name, b.location as branch_location,
                    b.phone as branch_phone
             FROM deliveries d
             JOIN orders o ON d.order_id = o.id
             JOIN users u ON o.customer_id = u.id
             JOIN branches b ON o.branch_id = b.id
             JOIN riders r ON d.rider_id = r.id
             WHERE r.user_id = ? 
               AND d.delivery_status NOT IN ('delivered', 'failed')
             ORDER BY d.assigned_at DESC
             LIMIT 1`,
            [userId]
        );
        
        if (delivery) {
            // Get recent tracking points
            const tracking = await db.query(
                `SELECT * FROM delivery_tracking 
                 WHERE delivery_id = ? 
                 ORDER BY timestamp DESC 
                 LIMIT 20`,
                [delivery.id]
            );
            delivery.tracking = tracking;
        }
        
        return delivery;
        
    } catch (error) {
        console.error('Get rider active delivery error:', error);
        throw error;
    }
}

// Update delivery status
async function updateDeliveryStatus(deliveryId, status, data, userId) {
    const allowedStatuses = [
        'assigned', 'rider_at_restaurant', 'picked_up', 
        'en_route', 'nearby', 'delivered', 'failed'
    ];
    
    if (!allowedStatuses.includes(status)) {
        return { status: 400, error: 'Invalid status' };
    }
    
    const connection = await db.beginTransaction();
    
    try {
        // Get delivery details
        const delivery = await db.getOne(
            'SELECT * FROM deliveries WHERE id = ?',
            [deliveryId]
        );
        
        if (!delivery) {
            await db.rollback(connection);
            return { status: 404, error: 'Delivery not found' };
        }
        
        // Verify rider owns this delivery
        const rider = await db.getOne(
            'SELECT user_id FROM riders WHERE id = ?',
            [delivery.rider_id]
        );
        
        if (rider.user_id !== userId) {
            await db.rollback(connection);
            return { status: 403, error: 'Access denied' };
        }
        
        // Update timestamps based on status
        const updates = {
            delivery_status: status
        };
        
        if (status === 'picked_up') {
            updates.picked_up_at = new Date();
        }
        
        if (status === 'delivered') {
            updates.delivered_at = new Date();
            updates.actual_delivery_time = new Date();
            
            // Update rider stats
            await connection.execute(
                `UPDATE riders SET 
                    is_available = true,
                    total_deliveries = total_deliveries + 1
                 WHERE id = ?`,
                [delivery.rider_id]
            );
        }
        
        if (status === 'failed') {
            // Make rider available again
            await connection.execute(
                'UPDATE riders SET is_available = true WHERE id = ?',
                [delivery.rider_id]
            );
        }
        
        // Build update query
        const setFields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            setFields.push(`${key} = ?`);
            values.push(value);
        }
        
        setFields.push('updated_at = NOW()');
        values.push(deliveryId);
        
        // Update delivery
        await connection.execute(
            `UPDATE deliveries SET ${setFields.join(', ')} WHERE id = ?`,
            values
        );
        
        // Save GPS location if provided
        if (data.latitude && data.longitude) {
            await connection.execute(
                `INSERT INTO delivery_tracking 
                 (delivery_id, latitude, longitude, speed, heading, accuracy, battery_level)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    deliveryId, data.latitude, data.longitude, 
                    data.speed || 0, data.heading || 0, 
                    data.accuracy || 0, data.battery_level || 100
                ]
            );
        }
        
        // Update order status based on delivery status
        let orderStatus = 'out_for_delivery';
        if (status === 'delivered') orderStatus = 'delivered';
        if (status === 'failed') orderStatus = 'cancelled';
        
        await connection.execute(
            'UPDATE orders SET order_status = ? WHERE id = ?',
            [orderStatus, delivery.order_id]
        );
        
        // Add order tracking
        let trackingNote = '';
        switch(status) {
            case 'rider_at_restaurant':
                trackingNote = 'Rider arrived at restaurant';
                break;
            case 'picked_up':
                trackingNote = 'Order picked up';
                break;
            case 'en_route':
                trackingNote = 'On the way to delivery';
                break;
            case 'nearby':
                trackingNote = 'Rider is nearby';
                break;
            case 'delivered':
                trackingNote = 'Order delivered successfully';
                break;
            default:
                trackingNote = `Delivery ${status}`;
        }
        
        await connection.execute(
            `INSERT INTO order_tracking (order_id, status, notes, updated_by)
             VALUES (?, ?, ?, ?)`,
            [delivery.order_id, orderStatus, trackingNote, userId]
        );
        
        await db.commit(connection);
        
        // Get order details for notification
        const order = await db.getOne(
            'SELECT customer_id FROM orders WHERE id = ?',
            [delivery.order_id]
        );
        
        if (order) {
            // Send real-time update
            let notificationMessage = '';
            switch(status) {
                case 'picked_up':
                    notificationMessage = 'Your order has been picked up and is on the way!';
                    break;
                case 'en_route':
                    notificationMessage = 'Your rider is on the way. ETA: 15-20 minutes';
                    break;
                case 'nearby':
                    notificationMessage = 'Your rider is nearby! Please be ready.';
                    break;
                case 'delivered':
                    notificationMessage = 'Your order has been delivered. Enjoy your meal!';
                    break;
            }
            
            if (notificationMessage) {
                await db.query(
                    `INSERT INTO notifications (user_id, type, title, message, data)
                     VALUES (?, 'delivery_update', ?, ?, ?)`,
                    [
                        order.customer_id,
                        'Delivery Update',
                        notificationMessage,
                        JSON.stringify({ deliveryId, orderId: delivery.order_id, status })
                    ]
                );
                
                websocket.sendToUser(order.customer_id, {
                    type: 'delivery_update',
                    deliveryId,
                    orderId: delivery.order_id,
                    status,
                    message: notificationMessage,
                    location: data.latitude && data.longitude ? {
                        lat: data.latitude,
                        lng: data.longitude
                    } : null,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        return {
            status: 200,
            message: 'Delivery status updated',
            deliveryId,
            status
        };
        
    } catch (error) {
        await db.rollback(connection);
        console.error('Update delivery status error:', error);
        return {
            status: 500,
            error: 'Failed to update delivery status: ' + error.message
        };
    }
}

// Get rider delivery history
async function getRiderDeliveryHistory(userId) {
    try {
        const deliveries = await db.query(
            `SELECT d.*, o.order_number, o.total_amount, o.delivery_address,
                    u.name as customer_name
             FROM deliveries d
             JOIN orders o ON d.order_id = o.id
             JOIN users u ON o.customer_id = u.id
             JOIN riders r ON d.rider_id = r.id
             WHERE r.user_id = ?
             ORDER BY d.assigned_at DESC
             LIMIT 50`,
            [userId]
        );
        
        return deliveries;
        
    } catch (error) {
        console.error('Get rider delivery history error:', error);
        throw error;
    }
}

// Get delivery by ID
async function getDeliveryById(deliveryId, user) {
    try {
        const delivery = await db.getOne(
            `SELECT d.*, o.order_number, o.total_amount, o.delivery_address,
                    o.special_instructions, o.customer_id,
                    u.name as customer_name, u.phone as customer_phone,
                    b.name as branch_name, b.location as branch_location
             FROM deliveries d
             JOIN orders o ON d.order_id = o.id
             JOIN users u ON o.customer_id = u.id
             JOIN branches b ON o.branch_id = b.id
             WHERE d.id = ?`,
            [deliveryId]
        );
        
        if (!delivery) {
            return { status: 404, error: 'Delivery not found' };
        }
        
        // Get tracking history
        const tracking = await db.query(
            'SELECT * FROM delivery_tracking WHERE delivery_id = ? ORDER BY timestamp ASC',
            [deliveryId]
        );
        
        delivery.tracking = tracking;
        
        return {
            status: 200,
            delivery
        };
        
    } catch (error) {
        console.error('Get delivery error:', error);
        return {
            status: 500,
            error: 'Failed to get delivery: ' + error.message
        };
    }
}

// Rate delivery (after completion)
async function rateDelivery(deliveryId, rating, feedback) {
    if (rating < 1 || rating > 5) {
        return { status: 400, error: 'Rating must be between 1 and 5' };
    }
    
    try {
        await db.query(
            `UPDATE deliveries 
             SET rider_rating = ?, customer_feedback = ? 
             WHERE id = ?`,
            [rating, feedback, deliveryId]
        );
        
        // Update rider's average rating
        await db.query(
            `UPDATE riders r
             SET rating = (
                 SELECT AVG(rider_rating) 
                 FROM deliveries 
                 WHERE rider_id = r.id AND rider_rating IS NOT NULL
             )
             WHERE r.id = (SELECT rider_id FROM deliveries WHERE id = ?)`,
            [deliveryId]
        );
        
        return {
            status: 200,
            message: 'Rating submitted successfully'
        };
        
    } catch (error) {
        console.error('Rate delivery error:', error);
        return {
            status: 500,
            error: 'Failed to submit rating: ' + error.message
        };
    }
}

module.exports = {
    getAvailableRiders,
    assignRider,
    getRiderActiveDelivery,
    updateDeliveryStatus,
    getRiderDeliveryHistory,
    getDeliveryById,
    rateDelivery
};