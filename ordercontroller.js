// =============================================
// MANGROVE CAFÉ - ORDER CONTROLLER
// Handle orders and order management
// =============================================

const db = require('../database');
const websocket = require('../websocket');

// Generate order number
function generateOrderNumber() {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    return `ORD-${year}${month}${day}-${random}`;
}

// Create new order
async function createOrder(user, orderData) {
    const {
        branch_id,
        order_type,
        delivery_address,
        delivery_notes,
        items,
        payment_method = 'mpesa',
        special_instructions
    } = orderData;
    
    // Validation
    if (!branch_id) {
        return { status: 400, error: 'Branch is required' };
    }
    
    if (!items || items.length === 0) {
        return { status: 400, error: 'Order must contain at least one item' };
    }
    
    if (order_type === 'delivery' && !delivery_address) {
        return { status: 400, error: 'Delivery address is required for delivery orders' };
    }
    
    const connection = await db.beginTransaction();
    
    try {
        // Calculate totals
        let subtotal = 0;
        const orderItems = [];
        
        for (const item of items) {
            const menuItem = await db.getOne(
                'SELECT id, name, price FROM menu_items WHERE id = ? AND is_available = true',
                [item.menu_item_id]
            );
            
            if (!menuItem) {
                await db.rollback(connection);
                return { status: 400, error: `Menu item ${item.menu_item_id} not available` };
            }
            
            const itemSubtotal = menuItem.price * item.quantity;
            subtotal += itemSubtotal;
            
            orderItems.push({
                ...menuItem,
                quantity: item.quantity,
                unit_price: menuItem.price,
                subtotal: itemSubtotal,
                special_requests: item.special_requests
            });
        }
        
        const delivery_fee = order_type === 'delivery' ? 100 : 0;
        const tax = subtotal * 0.16; // 16% VAT
        const total_amount = subtotal + delivery_fee + tax;
        
        // Generate order number
        const orderNumber = generateOrderNumber();
        
        // Insert order
        const [orderResult] = await connection.execute(
            `INSERT INTO orders (
                order_number, customer_id, branch_id, order_type, 
                delivery_address, delivery_notes, subtotal, delivery_fee, 
                tax, total_amount, payment_method, special_instructions,
                estimated_pickup_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
            [
                orderNumber, user.id, branch_id, order_type,
                delivery_address, delivery_notes, subtotal, delivery_fee,
                tax, total_amount, payment_method, special_instructions
            ]
        );
        
        const orderId = orderResult.insertId;
        
        // Insert order items
        for (const item of orderItems) {
            await connection.execute(
                `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal, special_requests)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [orderId, item.id, item.quantity, item.unit_price, item.subtotal, item.special_requests]
            );
        }
        
        // Create initial tracking
        await connection.execute(
            `INSERT INTO order_tracking (order_id, status, notes, updated_by)
             VALUES (?, 'pending', 'Order received', ?)`,
            [orderId, user.id]
        );
        
        // Create payment record
        await connection.execute(
            `INSERT INTO payments (order_id, user_id, amount, payment_method, status)
             VALUES (?, ?, ?, ?, 'pending')`,
            [orderId, user.id, total_amount, payment_method]
        );
        
        await db.commit(connection);
        
        // Send notifications
        await websocket.notifyNewOrder(orderId, branch_id);
        
        // Create notification for customer
        await db.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES (?, 'order_confirmation', ?, ?, ?)`,
            [
                user.id,
                'Order Confirmed',
                `Your order #${orderNumber} has been placed successfully. Total: KES ${total_amount}`,
                JSON.stringify({ orderId, orderNumber, total: total_amount })
            ]
        );
        
        return {
            status: 201,
            message: 'Order created successfully',
            orderId,
            orderNumber,
            total_amount
        };
        
    } catch (error) {
        await db.rollback(connection);
        console.error('Create order error:', error);
        return {
            status: 500,
            error: 'Failed to create order: ' + error.message
        };
    }
}

// Get order by ID
async function getOrderById(orderId, user) {
    try {
        const order = await db.getOne(
            `SELECT o.*, 
                    u.name as customer_name, u.phone as customer_phone,
                    b.name as branch_name, b.location as branch_location,
                    d.id as delivery_id, d.delivery_status, d.rider_id,
                    r.user_id as rider_user_id, rd.name as rider_name, rd.phone as rider_phone
             FROM orders o
             JOIN users u ON o.customer_id = u.id
             JOIN branches b ON o.branch_id = b.id
             LEFT JOIN deliveries d ON o.id = d.order_id
             LEFT JOIN riders r ON d.rider_id = r.id
             LEFT JOIN users rd ON r.user_id = rd.id
             WHERE o.id = ?`,
            [orderId]
        );
        
        if (!order) {
            return { status: 404, error: 'Order not found' };
        }
        
        // Check authorization
        if (user.role === 'customer' && order.customer_id !== user.id) {
            return { status: 403, error: 'Access denied' };
        }
        
        if (user.role === 'staff' && order.branch_id !== user.branch_id) {
            return { status: 403, error: 'Access denied' };
        }
        
        if (user.role === 'rider' && order.rider_user_id !== user.id) {
            return { status: 403, error: 'Access denied' };
        }
        
        // Get order items
        const items = await db.query(
            `SELECT oi.*, mi.name as item_name, mi.description, mi.image_url
             FROM order_items oi
             JOIN menu_items mi ON oi.menu_item_id = mi.id
             WHERE oi.order_id = ?`,
            [orderId]
        );
        
        // Get tracking history
        const tracking = await db.query(
            `SELECT ot.*, u.name as updated_by_name
             FROM order_tracking ot
             LEFT JOIN users u ON ot.updated_by = u.id
             WHERE ot.order_id = ?
             ORDER BY ot.created_at ASC`,
            [orderId]
        );
        
        // Get payment
        const payment = await db.getOne(
            'SELECT * FROM payments WHERE order_id = ?',
            [orderId]
        );
        
        // Get delivery tracking points if exists
        let deliveryTracking = [];
        if (order.delivery_id) {
            deliveryTracking = await db.query(
                `SELECT * FROM delivery_tracking 
                 WHERE delivery_id = ?
                 ORDER BY timestamp DESC
                 LIMIT 50`,
                [order.delivery_id]
            );
        }
        
        return {
            status: 200,
            order: {
                ...order,
                items,
                tracking,
                payment,
                delivery_tracking: deliveryTracking
            }
        };
        
    } catch (error) {
        console.error('Get order error:', error);
        return {
            status: 500,
            error: 'Failed to get order: ' + error.message
        };
    }
}

// Get customer's orders
async function getMyOrders(customerId) {
    try {
        const orders = await db.query(
            `SELECT o.*, b.name as branch_name
             FROM orders o
             JOIN branches b ON o.branch_id = b.id
             WHERE o.customer_id = ?
             ORDER BY o.created_at DESC
             LIMIT 50`,
            [customerId]
        );
        
        return orders;
        
    } catch (error) {
        console.error('Get my orders error:', error);
        throw error;
    }
}

// Get branch orders (for staff)
async function getBranchOrders(branchId) {
    try {
        const orders = await db.query(
            `SELECT o.*, u.name as customer_name, u.phone as customer_phone,
                    GROUP_CONCAT(CONCAT(mi.name, ' (', oi.quantity, ')') SEPARATOR ', ') as items_summary
             FROM orders o
             JOIN users u ON o.customer_id = u.id
             JOIN order_items oi ON o.id = oi.order_id
             JOIN menu_items mi ON oi.menu_item_id = mi.id
             WHERE o.branch_id = ?
             GROUP BY o.id
             ORDER BY 
                CASE o.order_status
                    WHEN 'pending' THEN 1
                    WHEN 'confirmed' THEN 2
                    WHEN 'preparing' THEN 3
                    WHEN 'ready' THEN 4
                    WHEN 'out_for_delivery' THEN 5
                    WHEN 'delivered' THEN 6
                    ELSE 7
                END,
                o.created_at DESC`,
            [branchId]
        );
        
        return orders;
        
    } catch (error) {
        console.error('Get branch orders error:', error);
        throw error;
    }
}

// Update order status
async function updateOrderStatus(orderId, status, notes, user) {
    const allowedStatuses = [
        'pending', 'confirmed', 'preparing', 'ready', 
        'out_for_delivery', 'delivered', 'cancelled'
    ];
    
    if (!allowedStatuses.includes(status)) {
        return { status: 400, error: 'Invalid status' };
    }
    
    const connection = await db.beginTransaction();
    
    try {
        // Get current order
        const order = await db.getOne(
            'SELECT * FROM orders WHERE id = ?',
            [orderId]
        );
        
        if (!order) {
            await db.rollback(connection);
            return { status: 404, error: 'Order not found' };
        }
        
        // Check authorization
        if (user.role === 'staff' && order.branch_id !== user.branch_id) {
            await db.rollback(connection);
            return { status: 403, error: 'Access denied' };
        }
        
        // Update order status
        await connection.execute(
            'UPDATE orders SET order_status = ? WHERE id = ?',
            [status, orderId]
        );
        
        // Add tracking
        await connection.execute(
            `INSERT INTO order_tracking (order_id, status, notes, updated_by)
             VALUES (?, ?, ?, ?)`,
            [orderId, status, notes || `Status updated to ${status}`, user.id]
        );
        
        // If status is 'ready' and order is for delivery, prepare for rider assignment
        if (status === 'ready' && order.order_type === 'delivery') {
            // Create delivery record if not exists
            const delivery = await db.getOne(
                'SELECT id FROM deliveries WHERE order_id = ?',
                [orderId]
            );
            
            if (!delivery) {
                await connection.execute(
                    `INSERT INTO deliveries (order_id, delivery_status, delivery_address, customer_phone, pickup_address)
                     VALUES (?, 'pending', ?, ?, ?)`,
                    [orderId, order.delivery_address, order.customer_phone, 'Mangrove Café Branch']
                );
            }
        }
        
        // If delivered, update actual delivery time
        if (status === 'delivered') {
            await connection.execute(
                'UPDATE orders SET actual_delivery_time = NOW() WHERE id = ?',
                [orderId]
            );
            
            // Update delivery record if exists
            await connection.execute(
                `UPDATE deliveries 
                 SET delivery_status = 'delivered', actual_delivery_time = NOW() 
                 WHERE order_id = ?`,
                [orderId]
            );
        }
        
        await db.commit(connection);
        
        // Notify via websocket
        await websocket.notifyOrderStatusChange(orderId, status, notes);
        
        return {
            status: 200,
            message: 'Order status updated',
            orderId,
            newStatus: status
        };
        
    } catch (error) {
        await db.rollback(connection);
        console.error('Update order status error:', error);
        return {
            status: 500,
            error: 'Failed to update order status: ' + error.message
        };
    }
}

// Cancel order
async function cancelOrder(orderId, reason, user) {
    const connection = await db.beginTransaction();
    
    try {
        const order = await db.getOne(
            'SELECT * FROM orders WHERE id = ?',
            [orderId]
        );
        
        if (!order) {
            await db.rollback(connection);
            return { status: 404, error: 'Order not found' };
        }
        
        // Check if order can be cancelled
        const cancellableStatuses = ['pending', 'confirmed'];
        if (!cancellableStatuses.includes(order.order_status)) {
            await db.rollback(connection);
            return { 
                status: 400, 
                error: `Order cannot be cancelled in ${order.order_status} status` 
            };
        }
        
        // Check authorization
        if (user.role === 'customer' && order.customer_id !== user.id) {
            await db.rollback(connection);
            return { status: 403, error: 'Access denied' };
        }
        
        // Update order
        await connection.execute(
            `UPDATE orders 
             SET order_status = 'cancelled', cancellation_reason = ? 
             WHERE id = ?`,
            [reason, orderId]
        );
        
        // Add tracking
        await connection.execute(
            `INSERT INTO order_tracking (order_id, status, notes, updated_by)
             VALUES (?, 'cancelled', ?, ?)`,
            [orderId, reason || 'Order cancelled', user.id]
        );
        
        await db.commit(connection);
        
        // Notify
        await websocket.notifyOrderStatusChange(orderId, 'cancelled', reason);
        
        return {
            status: 200,
            message: 'Order cancelled successfully'
        };
        
    } catch (error) {
        await db.rollback(connection);
        console.error('Cancel order error:', error);
        return {
            status: 500,
            error: 'Failed to cancel order: ' + error.message
        };
    }
}

// Get order statistics
async function getOrderStats(branchId, period = 'today') {
    try {
        let dateCondition;
        const today = new Date().toISOString().split('T')[0];
        
        switch(period) {
            case 'today':
                dateCondition = `DATE(created_at) = '${today}'`;
                break;
            case 'week':
                dateCondition = `YEARWEEK(created_at) = YEARWEEK(NOW())`;
                break;
            case 'month':
                dateCondition = `MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())`;
                break;
            default:
                dateCondition = `DATE(created_at) = '${today}'`;
        }
        
        const branchCondition = branchId ? `AND branch_id = ${branchId}` : '';
        
        const [stats] = await db.query(`
            SELECT 
                COUNT(*) as total_orders,
                SUM(CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END) as completed_orders,
                SUM(CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
                COALESCE(SUM(total_amount), 0) as total_revenue,
                AVG(total_amount) as average_order_value,
                COUNT(DISTINCT customer_id) as unique_customers
            FROM orders
            WHERE ${dateCondition} ${branchCondition}
        `);
        
        return stats;
        
    } catch (error) {
        console.error('Get order stats error:', error);
        throw error;
    }
}

module.exports = {
    createOrder,
    getOrderById,
    getMyOrders,
    getBranchOrders,
    updateOrderStatus,
    cancelOrder,
    getOrderStats
};