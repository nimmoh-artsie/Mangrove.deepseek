// =============================================
// MANGROVE CAFÉ - DELIVERY MODULE
// Rider Functions, Delivery Tracking
// =============================================

// Load rider's active delivery
async function loadRiderActiveDelivery() {
    try {
        const delivery = await window.apiRequest('/api/rider/active-delivery');
        displayRiderDelivery(delivery);
    } catch (error) {
        console.error('Failed to load active delivery:', error);
    }
}

// Display rider's current delivery
function displayRiderDelivery(delivery) {
    const container = document.getElementById('riderDeliveryView');
    if (!container) return;
    
    if (!delivery) {
        container.innerHTML = `
            <div class="no-active-delivery">
                <span class="empty-icon">🛵</span>
                <h3>No Active Delivery</h3>
                <p>You're currently free. Check back soon for new deliveries.</p>
            </div>
        `;
        return;
    }
    
    const statusSteps = [
        'assigned',
        'rider_at_restaurant',
        'picked_up',
        'en_route',
        'nearby',
        'delivered'
    ];
    
    const currentStepIndex = statusSteps.indexOf(delivery.delivery_status);
    const progress = ((currentStepIndex + 1) / statusSteps.length) * 100;
    
    // Generate step indicators
    const stepsHtml = statusSteps.map((step, index) => {
        let statusClass = '';
        if (index < currentStepIndex) statusClass = 'completed';
        if (index === currentStepIndex) statusClass = 'current';
        
        return `
            <div class="progress-step ${statusClass}">
                <div class="step-icon">${getStepIcon(step)}</div>
                <div class="step-label">${formatStepName(step)}</div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div class="active-delivery-card">
            <div class="delivery-header">
                <h3>Order #${delivery.order_number}</h3>
                <span class="delivery-status">${formatStepName(delivery.delivery_status)}</span>
            </div>
            
            <div class="delivery-progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            
            <div class="delivery-steps">
                ${stepsHtml}
            </div>
            
            <div class="delivery-info-grid">
                <div class="info-card">
                    <h4>🏪 Pickup</h4>
                    <p><strong>${delivery.branch_name}</strong></p>
                    <p>${delivery.branch_location}</p>
                    <p>📞 ${delivery.branch_phone}</p>
                </div>
                
                <div class="info-card">
                    <h4>👤 Customer</h4>
                    <p><strong>${delivery.customer_name}</strong></p>
                    <p>📞 ${delivery.customer_phone}</p>
                    <p>📍 ${delivery.delivery_address}</p>
                    ${delivery.delivery_notes ? `<p class="notes">📝 ${delivery.delivery_notes}</p>` : ''}
                </div>
            </div>
            
            <div class="delivery-actions">
                ${delivery.delivery_status === 'assigned' ? `
                    <button onclick="updateDeliveryStatus('rider_at_restaurant')" class="btn-primary">
                        <span class="btn-icon">🏪</span> I'm at the Restaurant
                    </button>
                ` : ''}
                
                ${delivery.delivery_status === 'rider_at_restaurant' ? `
                    <button onclick="updateDeliveryStatus('picked_up')" class="btn-primary">
                        <span class="btn-icon">📦</span> Picked Up Order
                    </button>
                ` : ''}
                
                ${delivery.delivery_status === 'picked_up' ? `
                    <button onclick="updateDeliveryStatus('en_route')" class="btn-primary">
                        <span class="btn-icon">🛵</span> Start Journey
                    </button>
                ` : ''}
                
                ${delivery.delivery_status === 'en_route' ? `
                    <button onclick="updateDeliveryStatus('nearby')" class="btn-primary">
                        <span class="btn-icon">📍</span> I'm Nearby
                    </button>
                ` : ''}
                
                ${delivery.delivery_status === 'nearby' ? `
                    <button onclick="updateDeliveryStatus('delivered')" class="btn-success">
                        <span class="btn-icon">✅</span> Mark as Delivered
                    </button>
                ` : ''}
            </div>
            
            <div id="riderMap" class="delivery-map">
                <!-- Map will be initialized here -->
                <div class="map-placeholder">
                    <span class="map-icon">🗺️</span>
                    <p>Live tracking map</p>
                    <small>Your location is being shared with the customer</small>
                </div>
            </div>
        </div>
    `;
    
    // Start GPS tracking
    startGPSTracking(delivery.id);
}

// Get step icon
function getStepIcon(step) {
    const icons = {
        'assigned': '📋',
        'rider_at_restaurant': '🏪',
        'picked_up': '📦',
        'en_route': '🛵',
        'nearby': '📍',
        'delivered': '✅'
    };
    return icons[step] || '•';
}

// Format step name
function formatStepName(step) {
    return step.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

// Update delivery status (rider)
async function updateDeliveryStatus(newStatus) {
    if (!window.AppState.currentOrder) return;
    
    if (!confirm(`Mark delivery as ${formatStepName(newStatus)}?`)) return;
    
    try {
        // Get current location
        const position = await getCurrentPosition();
        
        const data = {
            status: newStatus,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            speed: position.coords.speed || 0,
            heading: position.coords.heading || 0,
            accuracy: position.coords.accuracy,
            battery_level: await getBatteryLevel()
        };
        
        await window.apiRequest(`/api/deliveries/${window.AppState.currentOrder.delivery_id}/status`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        
        window.showNotification('Success', 'Delivery status updated', 'success');
        loadRiderActiveDelivery();
    } catch (error) {
        console.error('Status update failed:', error);
    }
}

// Get current GPS position
function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
        } else {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        }
    });
}

// Get battery level (if available)
async function getBatteryLevel() {
    if ('getBattery' in navigator) {
        try {
            const battery = await navigator.getBattery();
            return Math.floor(battery.level * 100);
        } catch (error) {
            return null;
        }
    }
    return null;
}

// Start GPS tracking
function startGPSTracking(deliveryId) {
    if (!navigator.geolocation) return;
    
    // Send location update every 10 seconds
    const trackingInterval = setInterval(async () => {
        try {
            const position = await getCurrentPosition();
            
            // Send via WebSocket
            if (window.AppState.ws && window.AppState.ws.readyState === WebSocket.OPEN) {
                window.AppState.ws.send(JSON.stringify({
                    type: 'location_update',
                    delivery_id: deliveryId,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    speed: position.coords.speed || 0,
                    heading: position.coords.heading || 0
                }));
            }
            
            // Update map if visible
            updateRiderMap(position.coords);
        } catch (error) {
            console.error('GPS tracking error:', error);
        }
    }, 10000);
    
    // Store interval ID to clear when done
    window.trackingInterval = trackingInterval;
}

// Update rider map
function updateRiderMap(coords) {
    // In a real app, you'd update a map here
    // For demo, we'll just update the placeholder
    const mapElement = document.getElementById('riderMap');
    if (mapElement) {
        mapElement.innerHTML = `
            <div class="map-placeholder active">
                <span class="map-icon">📍</span>
                <p>Live tracking active</p>
                <small>Lat: ${coords.latitude.toFixed(4)}, Lng: ${coords.longitude.toFixed(4)}</small>
                <small>Speed: ${(coords.speed * 3.6).toFixed(1)} km/h</small>
            </div>
        `;
    }
}

// Load rider delivery history
async function loadRiderHistory() {
    try {
        const deliveries = await window.apiRequest('/api/rider/delivery-history');
        displayRiderHistory(deliveries);
    } catch (error) {
        console.error('Failed to load delivery history:', error);
    }
}

// Display rider history
function displayRiderHistory(deliveries) {
    const container = document.getElementById('riderHistory');
    if (!container) return;
    
    if (deliveries.length === 0) {
        container.innerHTML = '<div class="no-history">No delivery history yet</div>';
        return;
    }
    
    container.innerHTML = deliveries.map(delivery => `
        <div class="delivery-history-item">
            <div class="history-header">
                <span class="order-number">${delivery.order_number}</span>
                <span class="delivery-status">${formatStepName(delivery.delivery_status)}</span>
            </div>
            <div class="history-details">
                <p><strong>Amount:</strong> ${window.formatCurrency(delivery.total_amount)}</p>
                <p><strong>Address:</strong> ${delivery.delivery_address}</p>
                <p><strong>Customer:</strong> ${delivery.customer_name}</p>
                <p><strong>Time:</strong> ${new Date(delivery.delivered_at || delivery.assigned_at).toLocaleString()}</p>
                ${delivery.rider_rating ? `
                    <p><strong>Rating:</strong> ${'⭐'.repeat(delivery.rider_rating)}</p>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Update rider location on map (customer view)
function updateRiderLocationOnMap(data) {
    const mapElement = document.querySelector('.tracking-map .map-placeholder');
    if (mapElement) {
        mapElement.innerHTML = `
            <span class="map-icon">🛵</span>
            <p>Rider is on the way!</p>
            <small>Last update: ${new Date(data.timestamp).toLocaleTimeString()}</small>
        `;
    }
}

// Clean up tracking when done
window.addEventListener('beforeunload', () => {
    if (window.trackingInterval) {
        clearInterval(window.trackingInterval);
    }
});

// Export functions
window.loadRiderActiveDelivery = loadRiderActiveDelivery;
window.updateDeliveryStatus = updateDeliveryStatus;
window.loadRiderHistory = loadRiderHistory;