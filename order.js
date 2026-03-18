// =============================================
// MANGROVE CAFÉ - ORDER MANAGEMENT MODULE
// View Orders, Track Orders, Order History
// =============================================

// Load customer orders
async function loadOrders() {
    try {
        const orders = await window.apiRequest('/api/my-orders');
        displayOrders(orders);
    } catch (error) {
        console.error('Failed to load orders:', error);
    }
}

// Display orders
function displayOrders(orders) {
    const container = document.getElementById('ordersList');
    if (!container) return;
    
    const filter = document.getElementById('orderStatusFilter')?.value;
    
    let filteredOrders = orders;
    if (filter) {
        filteredOrders = orders.filter(o => o.order_status === filter);
    }
    
    if (filteredOrders.length === 0) {
        container.innerHTML = `
            <div class="empty-orders">
                <span class="empty-icon">📦</span>
                <h3>No orders found</h3>
                <p>Ready to order some delicious Swahili cuisine?</p>
                <button onclick="window.showPage('menu')" class="btn-primary">
                    Browse Menu
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredOrders.map(order => `
        <div class="order-card" onclick="viewOrderDetails(${order.id})">
            <div class="order-header">
                <span class="order-number">${order.order_number}</span>
                <span class="order-status status-${order.order_status}">
                    ${formatStatus(order.order_status)}
                </span>
            </div>
            
            <div class="order-details">
                <div class="order-info">
                    <span class="info-icon">🏪</span>
                    <span>${order.branch_name}</span>
                </div>
                
                <div class="order-info">
                    <span class="info-icon">💰</span>
                    <span>${window.formatCurrency(order.total_amount)}</span>
                </div>
                
                <div class="order-info">
                    <span class="info-icon">⏱️</span>
                    <span>${window.formatDate(order.created_at)}</span>
                </div>
                
                <div class="order-info">
                    <span class="info-icon">📦</span>
                    <span>${order.order_type}</span>
                </div>
            </div>
            
            <div class="order-progress">
                ${getOrderProgress(order.order_status)}
            </div>
        </div>
    `).join('');
}

// Format status
function formatStatus(status) {
    return status.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

// Get order progress indicator
function getOrderProgress(status) {
    const steps = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
    const currentIndex = steps.indexOf(status);
    
    if (status === 'cancelled') {
        return '<span class="cancelled-label">❌ Cancelled</span>';
    }
    
    if (currentIndex === -1) return '';
    
    const progress = ((currentIndex + 1) / steps.length) * 100;
    
    return `
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <div class="progress-labels">
            <span>Pending</span>
            <span>Confirmed</span>
            <span>Preparing</span>
            <span>Ready</span>
            <span>Out for Delivery</span>
            <span>Delivered</span>
        </div>
    `;
}

// View order details
async function viewOrderDetails(orderId) {
    try {
        const data = await window.apiRequest(`/api/orders/${orderId}`);
        displayOrderDetails(data.order);
        window.showPage('orderDetails');
    } catch (error) {
        console.error('Failed to load order details:', error);
    }
}

// Display order details
function displayOrderDetails(order) {
    const container = document.getElementById('orderDetails');
    if (!container) return;
    
    window.AppState.currentOrder = order;
    
    // Check if user can track order
    const canTrack = order.order_status === 'out_for_delivery' && order.delivery_id;
    const canReorder = order.order_status === 'delivered';
    
    document.getElementById('trackOrderBtn').style.display = canTrack ? 'inline-flex' : 'none';
    document.getElementById('reorderBtn').style.display = canReorder ? 'inline-flex' : 'none';
    
    // Generate tracking timeline
    let timelineHtml = '';
    if (order.tracking && order.tracking.length > 0) {
        timelineHtml = order.tracking.map((track, index) => `
            <div class="tracking-step ${index === 0 ? 'current' : 'completed'}">
                <div class="step-marker">${index + 1}</div>
                <div class="step-content">
                    <h4>${formatStatus(track.status)}</h4>
                    <p>${track.notes || ''}</p>
                    <small>${window.formatDate(track.created_at)}</small>
                </div>
            </div>
        `).join('');
    }
    
    // Generate items list
    const itemsHtml = order.items.map(item => `
        <div class="order-item">
            <div class="item-name">
                <span class="item-quantity">${item.quantity}x</span>
                ${item.item_name}
                ${item.special_requests ? `<small>📝 ${item.special_requests}</small>` : ''}
            </div>
            <div class="item-price">${window.formatCurrency(item.subtotal)}</div>
        </div>
    `).join('');
    
    container.innerHTML = `
        <div class="order-header-large">
            <h2>Order ${order.order_number}</h2>
            <span class="order-status status-${order.order_status}">
                ${formatStatus(order.order_status)}
            </span>
        </div>
        
        <div class="order-grid">
            <div class="order-section">
                <h3>📍 Delivery Details</h3>
                <p><strong>Branch:</strong> ${order.branch_name}</p>
                <p><strong>Location:</strong> ${order.branch_location}</p>
                <p><strong>Type:</strong> ${order.order_type}</p>
                ${order.delivery_address ? `
                    <p><strong>Address:</strong> ${order.delivery_address}</p>
                ` : ''}
                ${order.delivery_notes ? `
                    <p><strong>Notes:</strong> ${order.delivery_notes}</p>
                ` : ''}
            </div>
            
            <div class="order-section">
                <h3>💰 Payment Details</h3>
                <p><strong>Method:</strong> ${order.payment_method.toUpperCase()}</p>
                <p><strong>Status:</strong> ${order.payment_status}</p>
                <p><strong>Subtotal:</strong> ${window.formatCurrency(order.subtotal)}</p>
                <p><strong>Delivery:</strong> ${window.formatCurrency(order.delivery_fee)}</p>
                <p><strong>Tax (16%):</strong> ${window.formatCurrency(order.tax || 0)}</p>
                <p class="total"><strong>Total:</strong> ${window.formatCurrency(order.total_amount)}</p>
            </div>
            
            ${order.rider_name ? `
                <div class="order-section">
                    <h3>🛵 Rider Details</h3>
                    <p><strong>Name:</strong> ${order.rider_name}</p>
                    <p><strong>Phone:</strong> ${order.rider_phone}</p>
                </div>
            ` : ''}
            
            <div class="order-section full-width">
                <h3>📦 Order Items</h3>
                <div class="items-list">
                    ${itemsHtml}
                </div>
            </div>
            
            ${order.special_instructions ? `
                <div class="order-section full-width">
                    <h3>📝 Special Instructions</h3>
                    <p>${order.special_instructions}</p>
                </div>
            ` : ''}
            
            ${order.tracking && order.tracking.length > 0 ? `
                <div class="order-section full-width">
                    <h3>⏱️ Tracking Timeline</h3>
                    <div class="tracking-timeline">
                        ${timelineHtml}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// Track order (for customer)
function trackOrder() {
    const order = window.AppState.currentOrder;
    if (!order || !order.delivery_id) return;
    
    // Show tracking modal with map
    const modal = document.getElementById('itemModal');
    const content = document.getElementById('modalContent');
    
    content.innerHTML = `
        <h2>Track Your Order</h2>
        <p>Order #${order.order_number}</p>
        
        <div id="trackingMap" class="tracking-map">
            <div class="map-placeholder">
                <span class="map-icon">🗺️</span>
                <p>Rider location will appear here</p>
                <p class="small">Rider: ${order.rider_name || 'Assigned'}</p>
            </div>
        </div>
        
        <div class="tracking-status">
            <div class="status-item">
                <span class="status-dot"></span>
                <span>Order picked up</span>
            </div>
            <div class="status-item">
                <span class="status-dot active"></span>
                <span>En route</span>
            </div>
            <div class="status-item">
                <span class="status-dot"></span>
                <span>Nearby</span>
            </div>
        </div>
        
        <button onclick="window.closeModal()" class="btn-secondary btn-block">Close</button>
    `;
    
    modal.style.display = 'block';
    
    // In a real app, you'd initialize a map here
    // For demo, we'll just show placeholder
}

// Reorder
async function reorder() {
    const order = window.AppState.currentOrder;
    if (!order) return;
    
    // Add items to cart
    order.items.forEach(item => {
        const existingItem = window.AppState.cart.find(i => i.id === item.menu_item_id);
        if (existingItem) {
            existingItem.quantity += item.quantity;
        } else {
            window.AppState.cart.push({
                id: item.menu_item_id,
                name: item.item_name,
                price: item.unit_price,
                quantity: item.quantity,
                instructions: item.special_requests
            });
        }
    });
    
    localStorage.setItem('cart', JSON.stringify(window.AppState.cart));
    window.updateCartCount();
    
    window.showNotification(
        'Reorder',
        'Items added to your cart',
        'success'
    );
    
    window.showCart();
}

// ===== STAFF FUNCTIONS =====

// Load branch orders (staff view)
async function loadBranchOrders() {
    if (!window.AppState.currentUser || 
        (window.AppState.currentUser.role !== 'staff' && window.AppState.currentUser.role !== 'admin')) {
        return;
    }
    
    const branchId = window.AppState.currentUser.branch_id;
    const statusFilter = document.getElementById('staffStatusFilter')?.value;
    
    try {
        let url = `/api/branch-orders/${branchId}`;
        if (statusFilter) {
            url += `?status=${statusFilter}`;
        }
        
        const orders = await window.apiRequest(url);
        displayBranchOrders(orders);
    } catch (error) {
        console.error('Failed to load branch orders:', error);
    }
}

// Display branch orders (staff view)
function displayBranchOrders(orders) {
    const container = document.getElementById('branchOrders');
    if (!container) return;
    
    if (orders.length === 0) {
        container.innerHTML = '<div class="no-orders">No orders found</div>';
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="order-card staff-card">
            <div class="order-header">
                <span class="order-number">${order.order_number}</span>
                <span class="order-status status-${order.order_status}">
                    ${formatStatus(order.order_status)}
                </span>
            </div>
            
            <div class="order-details">
                <p><strong>Customer:</strong> ${order.customer_name} (${order.customer_phone})</p>
                <p><strong>Items:</strong> ${order.items_summary || 'N/A'}</p>
                <p><strong>Total:</strong> ${window.formatCurrency(order.total_amount)}</p>
                <p><strong>Type:</strong> ${order.order_type}</p>
                <p><strong>Time:</strong> ${new Date(order.created_at).toLocaleString()}</p>
                ${order.delivery_address ? `<p><strong>Address:</strong> ${order.delivery_address}</p>` : ''}
            </div>
            
            <div class="staff-actions">
                <select class="status-select" onchange="updateOrderStatus(${order.id}, this.value)">
                    <option value="">Update Status</option>
                    <option value="confirmed">✅ Confirm</option>
                    <option value="preparing">👨‍🍳 Start Preparing</option>
                    <option value="ready">✅ Mark Ready</option>
                </select>
                
                ${order.order_status === 'ready' ? `
                    <button onclick="showAssignRider(${order.id})" class="btn-primary btn-small">
                        Assign Rider
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Update order status (staff)
async function updateOrderStatus(orderId, newStatus) {
    if (!newStatus) return;
    
    try {
        await window.apiRequest(`/api/orders/${orderId}/status`, {
            method: 'PUT',
            body: JSON.stringify({
                status: newStatus,
                notes: `Status updated by ${window.AppState.currentUser.name}`
            })
        });
        
        window.showNotification('Success', 'Order status updated', 'success');
        loadBranchOrders();
        loadBranchStats();
    } catch (error) {
        console.error('Status update failed:', error);
    }
}

// Show assign rider modal
async function showAssignRider(orderId) {
    if (!window.AppState.currentUser) return;
    
    try {
        const riders = await window.apiRequest(`/api/branch-riders?branch_id=${window.AppState.currentUser.branch_id}`);
        
        const modal = document.getElementById('itemModal');
        const content = document.getElementById('modalContent');
        
        if (riders.length === 0) {
            content.innerHTML = `
                <h2>No Riders Available</h2>
                <p>There are no available riders at the moment.</p>
                <button onclick="window.closeModal()" class="btn-primary">Close</button>
            `;
        } else {
            content.innerHTML = `
                <h2>Assign Rider</h2>
                <p>Select a rider for order #${orderId}</p>
                
                <div class="riders-select">
                    ${riders.map(rider => `
                        <div class="rider-option" onclick="assignRider(${orderId}, ${rider.id})">
                            <div class="rider-info">
                                <span class="rider-name">${rider.name}</span>
                                <span class="rider-phone">📱 ${rider.phone}</span>
                                <span class="rider-vehicle">🛵 ${rider.vehicle_type}</span>
                            </div>
                            <span class="rider-stats">📊 ${rider.total_deliveries} deliveries</span>
                        </div>
                    `).join('')}
                </div>
                
                <button onclick="window.closeModal()" class="btn-secondary btn-block">Cancel</button>
            `;
        }
        
        modal.style.display = 'block';
    } catch (error) {
        console.error('Failed to load riders:', error);
    }
}

// Assign rider
async function assignRider(orderId, riderId) {
    try {
        await window.apiRequest('/api/deliveries/assign', {
            method: 'POST',
            body: JSON.stringify({
                order_id: orderId,
                rider_id: riderId,
                estimated_pickup_time: new Date(Date.now() + 10 * 60000) // +10 minutes
            })
        });
        
        window.showNotification('Success', 'Rider assigned successfully', 'success');
        window.closeModal();
        loadBranchOrders();
    } catch (error) {
        console.error('Rider assignment failed:', error);
    }
}

// Load branch statistics
async function loadBranchStats() {
    if (!window.AppState.currentUser || !window.AppState.currentUser.branch_id) return;
    
    try {
        const stats = await window.apiRequest(`/api/branch-stats/${window.AppState.currentUser.branch_id}`);
        displayBranchStats(stats);
    } catch (error) {
        console.error('Failed to load branch stats:', error);
    }
}

// Display branch statistics
function displayBranchStats(stats) {
    const container = document.getElementById('branchStats');
    if (!container) return;
    
    container.innerHTML = `
        <div class="stat-card">
            <h4>Today's Orders</h4>
            <p class="stat-value">${stats.total_orders_today || 0}</p>
        </div>
        <div class="stat-card">
            <h4>Pending</h4>
            <p class="stat-value">${stats.pending_orders || 0}</p>
        </div>
        <div class="stat-card">
            <h4>Preparing</h4>
            <p class="stat-value">${stats.preparing_orders || 0}</p>
        </div>
        <div class="stat-card">
            <h4>Out for Delivery</h4>
            <p class="stat-value">${stats.delivery_orders || 0}</p>
        </div>
        <div class="stat-card">
            <h4>Revenue</h4>
            <p class="stat-value">${window.formatCurrency(stats.total_revenue_today || 0)}</p>
        </div>
    `;
}

// Switch dashboard tab
function switchDashboardTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    document.querySelectorAll('.dashboard-tab').forEach(t => {
        t.classList.remove('active');
    });
    
    document.getElementById(`dashboard${tab.charAt(0).toUpperCase() + tab.slice(1)}Tab`).classList.add('active');
    
    if (tab === 'riders') {
        loadAvailableRiders();
    }
}

// Load available riders
async function loadAvailableRiders() {
    if (!window.AppState.currentUser) return;
    
    try {
        const riders = await window.apiRequest(`/api/branch-riders?branch_id=${window.AppState.currentUser.branch_id}`);
        displayRiders(riders);
    } catch (error) {
        console.error('Failed to load riders:', error);
    }
}

// Display riders
function displayRiders(riders) {
    const container = document.getElementById('ridersList');
    if (!container) return;
    
    if (riders.length === 0) {
        container.innerHTML = '<div class="no-riders">No riders available</div>';
        return;
    }
    
    container.innerHTML = riders.map(rider => `
        <div class="rider-card">
            <h4>${rider.name}</h4>
            <p>📱 ${rider.phone}</p>
            <p>🛵 ${rider.vehicle_type} ${rider.license_plate ? `(${rider.license_plate})` : ''}</p>
            <p>📊 ${rider.total_deliveries} deliveries</p>
            <p>⭐ ${rider.rating.toFixed(1)}</p>
            <span class="badge-available">${rider.is_available ? '🟢 Available' : '🔴 Busy'}</span>
        </div>
    `).join('');
}

// Export functions
window.loadOrders = loadOrders;
window.viewOrderDetails = viewOrderDetails;
window.trackOrder = trackOrder;
window.reorder = reorder;
window.loadBranchOrders = loadBranchOrders;
window.updateOrderStatus = updateOrderStatus;
window.showAssignRider = showAssignRider;
window.assignRider = assignRider;
window.loadBranchStats = loadBranchStats;
window.switchDashboardTab = switchDashboardTab;
window.loadAvailableRiders = loadAvailableRiders;