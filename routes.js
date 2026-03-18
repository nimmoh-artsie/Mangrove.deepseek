// =============================================
// MANGROVE CAFÉ - ROUTE DEFINITIONS
// Centralized route configuration
// =============================================

const routes = {
    // Public routes (no auth required)
    public: {
        POST: [
            '/api/register',
            '/api/login'
        ],
        GET: [
            '/api/branches'
        ]
    },
    
    // Customer routes
    customer: {
        GET: [
            '/api/menu',
            '/api/categories',
            '/api/my-orders',
            '/api/notifications',
            '/api/notifications/unread-count'
        ],
        POST: [
            '/api/orders'
        ],
        PUT: [
            '/api/notifications/:id/read',
            '/api/notifications/read-all'
        ]
    },
    
    // Staff routes
    staff: {
        GET: [
            '/api/branch-orders/:branchId',
            '/api/branch-stats/:branchId',
            '/api/branch-riders'
        ],
        POST: [
            '/api/deliveries/assign'
        ],
        PUT: [
            '/api/orders/:orderId/status'
        ]
    },
    
    // Rider routes
    rider: {
        GET: [
            '/api/rider/active-delivery',
            '/api/rider/delivery-history'
        ],
        PUT: [
            '/api/deliveries/:deliveryId/status'
        ]
    },
    
    // Admin routes (all routes)
    admin: {
        GET: [
            '/api/users',
            '/api/reports/*'
        ],
        POST: [
            '/api/menu',
            '/api/categories'
        ],
        PUT: [
            '/api/menu/:id',
            '/api/users/:id'
        ],
        DELETE: [
            '/api/menu/:id',
            '/api/users/:id'
        ]
    }
};

// Helper to check if route matches pattern
function routeMatches(pattern, path) {
    // Convert route pattern to regex
    // e.g., '/api/orders/:id' -> /^\/api\/orders\/\d+$/
    if (pattern.includes(':')) {
        const regexPattern = pattern
            .replace(/\//g, '\\/')
            .replace(/:id/g, '\\d+')
            .replace(/:branchId/g, '\\d+')
            .replace(/:orderId/g, '\\d+')
            .replace(/:deliveryId/g, '\\d+')
            .replace(/\*/g, '.*');
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(path);
    }
    
    return pattern === path;
}

// Check if user has access to route
function hasAccess(userRole, method, path) {
    // If no user, check public routes
    if (!userRole) {
        const publicRoutes = routes.public[method] || [];
        return publicRoutes.some(pattern => routeMatches(pattern, path));
    }
    
    // Check role-specific routes
    const roleRoutes = routes[userRole]?.[method] || [];
    if (roleRoutes.some(pattern => routeMatches(pattern, path))) {
        return true;
    }
    
    // Admin has access to everything
    if (userRole === 'admin') {
        return true;
    }
    
    return false;
}

module.exports = {
    routes,
    hasAccess,
    routeMatches
};