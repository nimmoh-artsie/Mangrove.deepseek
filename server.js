// =============================================
// MANGROVE CAFÉ - PURE NODE.JS HTTP SERVER
// No Frameworks - Manual Routing
// =============================================

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// Import database
const db = require('./database');
const routes = require('./routes');
const websocket = require('./websocket');

// Import controllers
const authController = require('./controllers/authController');
const menuController = require('./controllers/menuController');
const orderController = require('./controllers/orderController');
const deliveryController = require('./controllers/deliveryController');

// MIME types for static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf'
};

// Parse JSON body helper
function parseJSONBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                if (body) {
                    resolve(JSON.parse(body));
                } else {
                    resolve({});
                }
            } catch (error) {
                reject(error);
            }
        });
    });
}

// Parse form data helper
function parseFormData(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const params = new URLSearchParams(body);
            const result = {};
            for (const [key, value] of params) {
                result[key] = value;
            }
            resolve(result);
        });
    });
}

// Generate JWT token (simplified - for demo only)
function generateToken(payload, secret = process.env.JWT_SECRET) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${header}.${encodedPayload}`)
        .digest('base64url');
    
    return `${header}.${encodedPayload}.${signature}`;
}

// Verify JWT token (simplified)
function verifyToken(token, secret = process.env.JWT_SECRET) {
    try {
        const [header, encodedPayload, signature] = token.split('.');
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(`${header}.${encodedPayload}`)
            .digest('base64url');
        
        if (signature !== expectedSignature) {
            return null;
        }
        
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
        return payload;
    } catch (error) {
        return null;
    }
}

// Authentication middleware
async function authenticate(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    
    const token = authHeader.substring(7);
    return verifyToken(token);
}

// Serve static files
function serveStaticFile(res, filePath) {
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // File not found - serve index.html for SPA routing
                fs.readFile(path.join(__dirname, '../public/index.html'), (err, content) => {
                    if (err) {
                        res.writeHead(500);
                        res.end('Server Error');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(content, 'utf-8');
                    }
                });
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}

// Send JSON response
function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(data));
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;
    
    console.log(`${method} ${pathname}`);
    
    // Handle CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400'
        });
        res.end();
        return;
    }
    
    // =========================================
    // API ROUTES
    // =========================================
    
    // Authentication routes
    if (pathname === '/api/register' && method === 'POST') {
        try {
            const body = await parseJSONBody(req);
            const result = await authController.register(body);
            sendJSON(res, result.status || 200, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    else if (pathname === '/api/login' && method === 'POST') {
        try {
            const body = await parseJSONBody(req);
            const result = await authController.login(body, generateToken);
            sendJSON(res, result.status || 200, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    // Menu routes
    else if (pathname === '/api/menu' && method === 'GET') {
        try {
            const user = await authenticate(req);
            const result = await menuController.getMenu();
            sendJSON(res, 200, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    else if (pathname === '/api/categories' && method === 'GET') {
        try {
            const user = await authenticate(req);
            const result = await menuController.getCategories();
            sendJSON(res, 200, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    else if (pathname === '/api/branches' && method === 'GET') {
        try {
            const result = await menuController.getBranches();
            sendJSON(res, 200, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    // Order routes
    else if (pathname === '/api/orders' && method === 'POST') {
        try {
            const user = await authenticate(req);
            if (!user) {
                sendJSON(res, 401, { error: 'Unauthorized' });
                return;
            }
            const body = await parseJSONBody(req);
            const result = await orderController.createOrder(user, body);
            sendJSON(res, result.status || 201, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    else if (pathname === '/api/my-orders' && method === 'GET') {
        try {
            const user = await authenticate(req);
            if (!user) {
                sendJSON(res, 401, { error: 'Unauthorized' });
                return;
            }
            const result = await orderController.getMyOrders(user.id);
            sendJSON(res, 200, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    else if (pathname.match(/^\/api\/orders\/\d+$/) && method === 'GET') {
        try {
            const user = await authenticate(req);
            if (!user) {
                sendJSON(res, 401, { error: 'Unauthorized' });
                return;
            }
            const orderId = parseInt(pathname.split('/')[3]);
            const result = await orderController.getOrderById(orderId, user);
            sendJSON(res, result.status || 200, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    else if (pathname.match(/^\/api\/orders\/\d+\/status$/) && method === 'PUT') {
        try {
            const user = await authenticate(req);
            if (!user) {
                sendJSON(res, 401, { error: 'Unauthorized' });
                return;
            }
            const orderId = parseInt(pathname.split('/')[3]);
            const body = await parseJSONBody(req);
            const result = await orderController.updateOrderStatus(orderId, body.status, body.notes, user);
            sendJSON(res, result.status || 200, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    // Branch orders (for staff)
    else if (pathname.match(/^\/api\/branch-orders\/\d+$/) && method === 'GET') {
        try {
            const user = await authenticate(req);
            if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
                sendJSON(res, 403, { error: 'Forbidden' });
                return;
            }
            const branchId = parseInt(pathname.split('/')[3]);
            const result = await orderController.getBranchOrders(branchId);
            sendJSON(res, 200, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    // Delivery routes
    else if (pathname === '/api/branch-riders' && method === 'GET') {
        try {
            const user = await authenticate(req);
            if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
                sendJSON(res, 403, { error: 'Forbidden' });
                return;
            }
            const branchId = parseInt(parsedUrl.query.branch_id);
            const result = await deliveryController.getAvailableRiders(branchId);
            sendJSON(res, 200, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    else if (pathname === '/api/deliveries/assign' && method === 'POST') {
        try {
            const user = await authenticate(req);
            if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
                sendJSON(res, 403, { error: 'Forbidden' });
                return;
            }
            const body = await parseJSONBody(req);
            const result = await deliveryController.assignRider(body.order_id, body.rider_id, body.estimated_pickup_time);
            sendJSON(res, result.status || 201, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    else if (pathname === '/api/rider/active-delivery' && method === 'GET') {
        try {
            const user = await authenticate(req);
            if (!user || user.role !== 'rider') {
                sendJSON(res, 403, { error: 'Forbidden' });
                return;
            }
            const result = await deliveryController.getRiderActiveDelivery(user.id);
            sendJSON(res, 200, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    else if (pathname.match(/^\/api\/deliveries\/\d+\/status$/) && method === 'PUT') {
        try {
            const user = await authenticate(req);
            if (!user || user.role !== 'rider') {
                sendJSON(res, 403, { error: 'Forbidden' });
                return;
            }
            const deliveryId = parseInt(pathname.split('/')[3]);
            const body = await parseJSONBody(req);
            const result = await deliveryController.updateDeliveryStatus(deliveryId, body.status, body, user.id);
            sendJSON(res, result.status || 200, result);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    // Notification routes
    else if (pathname === '/api/notifications' && method === 'GET') {
        try {
            const user = await authenticate(req);
            if (!user) {
                sendJSON(res, 401, { error: 'Unauthorized' });
                return;
            }
            const [notifications] = await db.query(
                'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
                [user.id]
            );
            sendJSON(res, 200, notifications);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    else if (pathname === '/api/notifications/unread-count' && method === 'GET') {
        try {
            const user = await authenticate(req);
            if (!user) {
                sendJSON(res, 401, { error: 'Unauthorized' });
                return;
            }
            const [result] = await db.query(
                'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = false',
                [user.id]
            );
            sendJSON(res, 200, { count: result[0].count });
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    else if (pathname.match(/^\/api\/notifications\/\d+\/read$/) && method === 'PUT') {
        try {
            const user = await authenticate(req);
            if (!user) {
                sendJSON(res, 401, { error: 'Unauthorized' });
                return;
            }
            const notificationId = parseInt(pathname.split('/')[3]);
            await db.query(
                'UPDATE notifications SET is_read = true WHERE id = ? AND user_id = ?',
                [notificationId, user.id]
            );
            sendJSON(res, 200, { message: 'Notification marked as read' });
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    else if (pathname === '/api/notifications/read-all' && method === 'PUT') {
        try {
            const user = await authenticate(req);
            if (!user) {
                sendJSON(res, 401, { error: 'Unauthorized' });
                return;
            }
            await db.query(
                'UPDATE notifications SET is_read = true WHERE user_id = ?',
                [user.id]
            );
            sendJSON(res, 200, { message: 'All notifications marked as read' });
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    // Branch stats (for staff dashboard)
    else if (pathname.match(/^\/api\/branch-stats\/\d+$/) && method === 'GET') {
        try {
            const user = await authenticate(req);
            if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
                sendJSON(res, 403, { error: 'Forbidden' });
                return;
            }
            const branchId = parseInt(pathname.split('/')[3]);
            
            const today = new Date().toISOString().split('T')[0];
            
            const [stats] = await db.query(`
                SELECT 
                    COUNT(*) as total_orders_today,
                    SUM(CASE WHEN order_status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
                    SUM(CASE WHEN order_status = 'preparing' THEN 1 ELSE 0 END) as preparing_orders,
                    SUM(CASE WHEN order_status = 'out_for_delivery' THEN 1 ELSE 0 END) as delivery_orders,
                    COALESCE(SUM(total_amount), 0) as total_revenue_today
                FROM orders
                WHERE branch_id = ? AND DATE(created_at) = ?
            `, [branchId, today]);
            
            sendJSON(res, 200, stats[0]);
        } catch (error) {
            sendJSON(res, 500, { error: error.message });
        }
    }
    
    // =========================================
    // STATIC FILES (SPA - serve index.html for all non-API routes)
    // =========================================
    else {
        // Serve static files from public directory
        let filePath = path.join(__dirname, '../public', pathname);
        
        // Default to index.html for root
        if (pathname === '/') {
            filePath = path.join(__dirname, '../public/index.html');
        }
        
        serveStaticFile(res, filePath);
    }
});

// Start HTTP server
const HTTP_PORT = process.env.HTTP_PORT || 3000;
server.listen(HTTP_PORT, () => {
    console.log(`\n=================================`);
    console.log(`🌍 MANGROVE CAFÉ SERVER RUNNING`);
    console.log(`=================================`);
    console.log(`📡 HTTP Server: http://localhost:${HTTP_PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${process.env.WS_PORT || 8080}`);
    console.log(`📅 Started: ${new Date().toLocaleString()}`);
    console.log(`=================================\n`);
});

// Initialize WebSocket server
const wss = websocket.initialize(server);

// Test database connection
db.testConnection().then(connected => {
    if (!connected) {
        console.warn('\n⚠️  Warning: Database not connected. Some features may not work.\n');
    }
});

// Handle server errors
server.on('error', (error) => {
    console.error('❌ Server error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down server...');
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});

// Export for websocket
module.exports = server;