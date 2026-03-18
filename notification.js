// =============================================
// MANGROVE CAFÉ - NOTIFICATIONS MODULE
// Push Notifications, In-App Alerts
// =============================================

// Request notification permission
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return false;
    }
    
    if (Notification.permission === 'granted') {
        return true;
    }
    
    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }
    
    return false;
}

// Send browser notification
function sendBrowserNotification(title, options = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
    }
    
    try {
        const notification = new Notification(title, {
            icon: '/icons/icon-192.png',
            badge: '/icons/badge.png',
            vibrate: [200, 100, 200],
            ...options
        });
        
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
        
        return notification;
    } catch (error) {
        console.error('Failed to send notification:', error);
    }
}

// Play notification sound
function playNotificationSound(type = 'notification') {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create a simple beep sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = type === 'success' ? 800 : 600;
    gainNode.gain.value = 0.1;
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1);
}

// Initialize push notifications
async function initPushNotifications() {
    const hasPermission = await requestNotificationPermission();
    
    if (hasPermission && 'serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('ServiceWorker registered');
            
            // Get push subscription
            let subscription = await registration.pushManager.getSubscription();
            
            if (!subscription) {
                const publicKey = await getVapidPublicKey();
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey)
                });
                
                // Send subscription to server
                await window.apiRequest('/api/push-subscribe', {
                    method: 'POST',
                    body: JSON.stringify(subscription)
                });
            }
        } catch (error) {
            console.error('Push notification init failed:', error);
        }
    }
}

// Convert VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Get VAPID public key from server
async function getVapidPublicKey() {
    try {
        const data = await window.apiRequest('/api/vapid-public-key');
        return data.publicKey;
    } catch (error) {
        console.error('Failed to get VAPID key:', error);
        return 'BJx7PqkqXQvRqQXxQvRqQXxQvRqQXxQvRqQXxQvRqQXxQvRqQXxQvRqQXxQ'; // Placeholder
    }
}

// Show order status notification
function showOrderStatusNotification(orderNumber, status) {
    const messages = {
        'confirmed': 'Your order has been confirmed!',
        'preparing': 'Your order is being prepared',
        'ready': 'Your order is ready!',
        'out_for_delivery': 'Your order is out for delivery',
        'delivered': 'Your order has been delivered. Enjoy!'
    };
    
    const title = `Order #${orderNumber}`;
    const message = messages[status] || `Status updated to ${status}`;
    
    // Show in-app notification
    window.showNotification(title, message, 'info');
    
    // Show browser notification
    sendBrowserNotification(title, {
        body: message,
        tag: `order-${orderNumber}`
    });
    
    // Play sound
    playNotificationSound('success');
}

// Show rider notification
function showRiderNotification(riderName, riderPhone, eta) {
    const title = 'Rider Assigned';
    const message = `${riderName} will deliver your order. ETA: ${eta} minutes`;
    
    window.showNotification(title, message, 'success');
    
    sendBrowserNotification(title, {
        body: message,
        tag: 'rider-assigned'
    });
    
    playNotificationSound('success');
}

// Show delivery update notification
function showDeliveryUpdateNotification(message, type = 'info') {
    window.showNotification('Delivery Update', message, type);
    
    sendBrowserNotification('Delivery Update', {
        body: message,
        tag: 'delivery-update'
    });
    
    playNotificationSound('info');
}

// Show promotion notification
function showPromotionNotification(title, message) {
    window.showNotification(title, message, 'promotion');
    
    sendBrowserNotification(title, {
        body: message,
        tag: 'promotion',
        requireInteraction: true
    });
}

// Initialize when user logs in
document.addEventListener('DOMContentLoaded', () => {
    // Check if we should initialize notifications
    const checkUser = setInterval(() => {
        if (window.AppState?.currentUser) {
            clearInterval(checkUser);
            initPushNotifications();
        }
    }, 1000);
});

// Export functions
window.sendBrowserNotification = sendBrowserNotification;
window.playNotificationSound = playNotificationSound;
window.showOrderStatusNotification = showOrderStatusNotification;
window.showRiderNotification = showRiderNotification;
window.showDeliveryUpdateNotification = showDeliveryUpdateNotification;
window.showPromotionNotification = showPromotionNotification;