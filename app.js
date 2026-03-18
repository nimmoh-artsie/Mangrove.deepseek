// =============================================
// MANGROVE CAFÉ - MAIN APPLICATION
// Pure JavaScript - No Frameworks
// Authentic Swahili Cuisine Since 2001
// =============================================

// ===== GLOBAL STATE =====
const AppState = {
    currentUser: null,
    token: localStorage.getItem('token'),
    cart: JSON.parse(localStorage.getItem('cart')) || [],
    menu: [],
    categories: [],
    branches: [],
    currentOrder: null,
    ws: null,
    notificationCount: 0,
    isLoading: false
};

// ===== API CONFIGURATION =====
const API = {
    baseUrl: window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : '', // Production URL would go here
    wsUrl: window.location.hostname === 'localhost'
        ? 'ws://localhost:8080'
        : 'wss://your-domain.com/ws'
};

// ===== UTILITY FUNCTIONS =====

// Show loading spinner
function showLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        AppState.isLoading = true;
        spinner.style.display = 'flex';
    }
}

// Hide loading spinner
function hideLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        AppState.isLoading = false;
        spinner.style.display = 'none';
    }
}

// Format currency
function formatCurrency(amount) {
    return `KES ${amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Show notification popup
function showNotification(title, message, type = 'info') {
    const popup = document.getElementById('notificationPopup');
    if (!popup) return;

    popup.innerHTML = `
        <h4>${title}</h4>
        <p>${message}</p>
    `;
    popup.className = `notification-popup ${type}`;
    popup.style.display = 'block';

    setTimeout(() => {
        popup.style.display = 'none';
    }, 5000);
}

// Make API request
async function apiRequest(endpoint, options = {}) {
    const url = `${API.baseUrl}${endpoint}`;
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (AppState.token) {
        headers['Authorization'] = `Bearer ${AppState.token}`;
    }

    try {
        showLoading();
        
        const response = await fetch(url, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        showNotification('Error', error.message, 'error');
        throw error;
    } finally {
        hideLoading();
    }
}

// ===== PAGE NAVIGATION =====
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // Show selected page
    const page = document.getElementById(`${pageId}Page`);
    if (page) {
        page.classList.add('active');
        
        // Load page-specific data
        switch(pageId) {
            case 'menu':
                loadMenuData();
                break;
            case 'orders':
                if (AppState.currentUser) loadOrders();
                break;
            case 'staffDashboard':
                if (AppState.currentUser?.role === 'staff' || AppState.currentUser?.role === 'admin') {
                    loadBranchStats();
                    loadBranchOrders();
                }
                break;
            case 'riderDashboard':
                if (AppState.currentUser?.role === 'rider') {
                    loadRiderActiveDelivery();
                    loadRiderHistory();
                }
                break;
        }
    }

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    const activeLink = document.getElementById(`nav-${pageId}`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

// Toggle mobile menu
function toggleMobileMenu() {
    const navMenu = document.getElementById('navMenu');
    navMenu.classList.toggle('show');
}

// ===== AUTHENTICATION =====
async function validateToken() {
    if (!AppState.token) return false;

    try {
        const data = await apiRequest('/api/menu');
        if (data) {
            // Token is valid, get user from localStorage
            const userData = localStorage.getItem('user');
            if (userData) {
                AppState.currentUser = JSON.parse(userData);
                updateUIForUser();
                connectWebSocket();
                startNotificationPolling();
                return true;
            }
        }
    } catch (error) {
        console.error('Token validation failed:', error);
        logout();
    }
    return false;
}

function updateUIForUser() {
    const authLink = document.getElementById('nav-auth');
    
    if (AppState.currentUser) {
        authLink.innerHTML = `<span class="nav-icon">👤</span> ${AppState.currentUser.name.split(' ')[0]}`;
        authLink.onclick = logout;
        
        // Show role-specific navigation
        if (AppState.currentUser.role === 'staff' || AppState.currentUser.role === 'admin') {
            addStaffNavLink();
        } else if (AppState.currentUser.role === 'rider') {
            addRiderNavLink();
        }
    } else {
        authLink.innerHTML = `<span class="nav-icon">🔓</span> Login`;
        authLink.onclick = () => showPage('login');
    }
    
    updateCartCount();
}

function addStaffNavLink() {
    const navMenu = document.getElementById('navMenu');
    if (!document.getElementById('nav-staffDashboard')) {
        const staffLink = document.createElement('a');
        staffLink.href = '#';
        staffLink.id = 'nav-staffDashboard';
        staffLink.className = 'nav-link';
        staffLink.innerHTML = '<span class="nav-icon">📊</span> Dashboard';
        staffLink.onclick = () => showPage('staffDashboard');
        navMenu.insertBefore(staffLink, document.getElementById('nav-auth'));
    }
}

function addRiderNavLink() {
    const navMenu = document.getElementById('navMenu');
    if (!document.getElementById('nav-riderDashboard')) {
        const riderLink = document.createElement('a');
        riderLink.href = '#';
        riderLink.id = 'nav-riderDashboard';
        riderLink.className = 'nav-link';
        riderLink.innerHTML = '<span class="nav-icon">🛵</span> My Deliveries';
        riderLink.onclick = () => showPage('riderDashboard');
        navMenu.insertBefore(riderLink, document.getElementById('nav-auth'));
    }
}

function logout() {
    AppState.currentUser = null;
    AppState.token = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('cart');
    
    if (AppState.ws) {
        AppState.ws.close();
    }
    
    // Remove role-specific links
    const staffLink = document.getElementById('nav-staffDashboard');
    if (staffLink) staffLink.remove();
    
    const riderLink = document.getElementById('nav-riderDashboard');
    if (riderLink) riderLink.remove();
    
    showPage('login');
    showNotification('Logged out', 'You have been successfully logged out', 'success');
}

// ===== WEBSOCKET CONNECTION =====
function connectWebSocket() {
    if (!AppState.token || !AppState.currentUser) return;

    try {
        AppState.ws = new WebSocket(`${API.wsUrl}?token=${AppState.token}`);

        AppState.ws.onopen = () => {
            console.log('WebSocket connected');
        };

        AppState.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        };

        AppState.ws.onclose = () => {
            console.log('WebSocket disconnected');
            // Attempt to reconnect after 5 seconds
            setTimeout(connectWebSocket, 5000);
        };

        AppState.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    } catch (error) {
        console.error('WebSocket connection failed:', error);
    }
}

function handleWebSocketMessage(data) {
    switch(data.type) {
        case 'order_status':
            handleOrderStatusUpdate(data);
            break;
        case 'new_order':
            handleNewOrderNotification(data);
            break;
        case 'rider_location':
            handleRiderLocationUpdate(data);
            break;
        case 'delivery_update':
            handleDeliveryUpdate(data);
            break;
        case 'pending_notifications':
            updateNotificationBadge(data.notifications.length);
            break;
    }
}

function handleOrderStatusUpdate(data) {
    showNotification(
        'Order Update',
        `Order #${data.orderId} status changed to ${data.status}`,
        'info'
    );
    
    // Reload orders if on orders page
    if (document.getElementById('ordersPage').classList.contains('active')) {
        loadOrders();
    }
    
    // Reload order details if viewing this order
    if (AppState.currentOrder && AppState.currentOrder.id === data.orderId) {
        viewOrderDetails(data.orderId);
    }
}

function handleNewOrderNotification(data) {
    if (AppState.currentUser?.role === 'staff' || AppState.currentUser?.role === 'admin') {
        showNotification(
            '🆕 New Order',
            `Order #${data.orderNumber} - KES ${data.amount}`,
            'success'
        );
        
        // Play sound (optional)
        // new Audio('/sounds/notification.mp3').play().catch(e => console.log('Audio play failed:', e));
        
        // Reload branch orders if on dashboard
        if (document.getElementById('staffDashboardPage').classList.contains('active')) {
            loadBranchOrders();
        }
    }
}

function handleRiderLocationUpdate(data) {
    // Update rider location on map if viewing order
    updateRiderLocationOnMap(data);
}

function handleDeliveryUpdate(data) {
    showNotification('Delivery Update', data.message, 'info');
    
    // Reload rider view if on rider dashboard
    if (document.getElementById('riderDashboardPage').classList.contains('active')) {
        loadRiderActiveDelivery();
    }
}

// ===== NOTIFICATION POLLING =====
function startNotificationPolling() {
    if (!AppState.currentUser) return;
    
    // Poll for unread count every 30 seconds
    setInterval(async () => {
        if (!AppState.token) return;
        
        try {
            const data = await apiRequest('/api/notifications/unread-count');
            updateNotificationBadge(data.count);
        } catch (error) {
            console.error('Notification polling error:', error);
        }
    }, 30000);
}

function updateNotificationBadge(count) {
    AppState.notificationCount = count;
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Toggle notifications panel
function toggleNotifications() {
    const panel = document.getElementById('notificationPanel');
    panel.classList.toggle('show');
    
    if (panel.classList.contains('show')) {
        loadNotifications();
    }
}

// Load notifications
async function loadNotifications() {
    try {
        const notifications = await apiRequest('/api/notifications');
        displayNotifications(notifications);
    } catch (error) {
        console.error('Failed to load notifications:', error);
    }
}

// Display notifications
function displayNotifications(notifications) {
    const list = document.getElementById('notificationsList');
    if (!list) return;
    
    if (notifications.length === 0) {
        list.innerHTML = '<div class="no-notifications">No notifications</div>';
        return;
    }
    
    list.innerHTML = notifications.map(notification => `
        <div class="notification-item ${notification.is_read ? '' : 'unread'}" 
             onclick="window.handleNotificationClick(${JSON.stringify(notification).replace(/"/g, '&quot;')})">
            <div class="notification-icon">${getNotificationIcon(notification.type)}</div>
            <div class="notification-content">
                <h4>${notification.title}</h4>
                <p>${notification.message}</p>
                <span class="notification-time">${formatDate(notification.created_at)}</span>
            </div>
            ${!notification.is_read ? '<span class="unread-dot"></span>' : ''}
        </div>
    `).join('');
}

function getNotificationIcon(type) {
    const icons = {
        'order_confirmation': '✅',
        'order_status': '📦',
        'payment_received': '💰',
        'rider_assigned': '🛵',
        'rider_arriving': '📍',
        'delivery_update': '🚚',
        'order_ready': '🍽️',
        'promotion': '🎉',
        'system_alert': '⚠️'
    };
    return icons[type] || '🔔';
}

async function handleNotificationClick(notification) {
    // Mark as read
    if (!notification.is_read) {
        try {
            await apiRequest(`/api/notifications/${notification.id}/read`, {
                method: 'PUT'
            });
            
            // Update badge
            updateNotificationBadge(Math.max(0, AppState.notificationCount - 1));
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    }
    
    // Navigate based on type
    const data = notification.data ? JSON.parse(notification.data) : {};
    
    switch(notification.type) {
        case 'order_confirmation':
        case 'order_status':
        case 'delivery_update':
            if (data.order_id) {
                viewOrderDetails(data.order_id);
            }
            break;
        case 'rider_assigned':
            if (data.order_id) {
                showPage('orders');
            }
            break;
    }
    
    // Close panel
    document.getElementById('notificationPanel').classList.remove('show');
}

async function markAllNotificationsRead() {
    try {
        await apiRequest('/api/notifications/read-all', {
            method: 'PUT'
        });
        
        updateNotificationBadge(0);
        loadNotifications();
        showNotification('Success', 'All notifications marked as read', 'success');
    } catch (error) {
        console.error('Failed to mark all as read:', error);
    }
}

// ===== MENU FUNCTIONS =====
async function loadMenuData() {
    try {
        const [menu, categories, branches] = await Promise.all([
            apiRequest('/api/menu'),
            apiRequest('/api/categories'),
            apiRequest('/api/branches')
        ]);
        
        AppState.menu = menu;
        AppState.categories = categories;
        AppState.branches = branches;
        
        displayCategories();
        displayMenu();
    } catch (error) {
        console.error('Failed to load menu:', error);
    }
}

function displayCategories() {
    const tabs = document.getElementById('categoryTabs');
    if (!tabs) return;
    
    tabs.innerHTML = `
        <button class="category-tab active" onclick="window.filterByCategory(0)">All</button>
        ${AppState.categories.map(cat => `
            <button class="category-tab" onclick="window.filterByCategory(${cat.id})">
                ${cat.name}
            </button>
        `).join('')}
    `;
}

function filterByCategory(categoryId) {
    // Update active tab
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Filter menu
    const filtered = categoryId === 0 
        ? AppState.menu 
        : AppState.menu.filter(item => item.category_id === categoryId);
    
    displayFilteredMenu(filtered);
}

function displayMenu() {
    displayFilteredMenu(AppState.menu);
}

function displayFilteredMenu(items) {
    const grid = document.getElementById('menuItems');
    if (!grid) return;
    
    if (items.length === 0) {
        grid.innerHTML = '<div class="no-items">No menu items available</div>';
        return;
    }
    
    grid.innerHTML = items.map(item => `
        <div class="menu-card">
            <div class="menu-card-content">
                <div class="menu-badges">
                    ${item.is_signature ? '<span class="badge badge-signature">✨ Signature</span>' : ''}
                    ${item.is_fresh ? '<span class="badge badge-fresh">🌿 Fresh</span>' : ''}
                    ${item.spice_level === 'hot' ? '<span class="badge badge-spicy">🌶️ Spicy</span>' : ''}
                </div>
                <h3>${item.name}</h3>
                <p>${item.description || ''}</p>
                <div class="price">${formatCurrency(item.price)}</div>
                <p class="prep-time">⏱️ Prep time: ${item.preparation_time || 15} min</p>
                <button class="add-to-cart-btn" onclick="window.showItemModal(${item.id})">
                    <span class="btn-icon">➕</span> Add to Cart
                </button>
            </div>
        </div>
    `).join('');
}

// ===== CART FUNCTIONS =====
function showCart() {
    // These functions are in cart.js
    if (typeof window.displayCart === 'function') {
        window.displayCart();
    }
    showPage('cart');
}

function updateCartCount() {
    const count = AppState.cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cartCount').textContent = count;
    localStorage.setItem('cart', JSON.stringify(AppState.cart));
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
    // Load branches for registration
    try {
        const branches = await apiRequest('/api/branches');
        AppState.branches = branches;
        
        const branchSelect = document.getElementById('regBranch');
        if (branchSelect) {
            branchSelect.innerHTML = `
                <option value="">Select your nearest branch</option>
                ${branches.map(b => `
                    <option value="${b.id}">${b.name} - ${b.location}</option>
                `).join('')}
            `;
        }
    } catch (error) {
        console.error('Failed to load branches:', error);
    }
    
    // Check if user is logged in
    if (AppState.token) {
        const isValid = await validateToken();
        if (isValid) {
            showPage('menu');
        } else {
            showPage('login');
        }
    } else {
        showPage('login');
    }
    
    // Close notifications panel when clicking outside
    document.addEventListener('click', (event) => {
        const panel = document.getElementById('notificationPanel');
        const container = document.querySelector('.notification-container');
        
        if (panel && container && !container.contains(event.target)) {
            panel.classList.remove('show');
        }
    });
});

// ===== EXPORT GLOBALLY =====
window.AppState = AppState;
window.showPage = showPage;
window.toggleMobileMenu = toggleMobileMenu;
window.toggleNotifications = toggleNotifications;
window.markAllNotificationsRead = markAllNotificationsRead;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.showNotification = showNotification;
window.apiRequest = apiRequest;
window.filterByCategory = filterByCategory;
window.showCart = showCart;
window.updateCartCount = updateCartCount;
window.logout = logout;