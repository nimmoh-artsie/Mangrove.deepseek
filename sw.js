// =============================================
// MANGROVE CAFÉ - SERVICE WORKER
// Push Notifications & Offline Support
// =============================================

const CACHE_NAME = 'mangrove-cafe-v1';
const urlsToCache = [
    '/',
    '/css/styles.css',
    '/js/app.js',
    '/js/auth.js',
    '/js/cart.js',
    '/js/orders.js',
    '/js/delivery.js',
    '/js/notifications.js',
    'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap'
];

// Install service worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// Activate service worker
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch event - serve from cache if offline
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                
                // Clone the request
                const fetchRequest = event.request.clone();
                
                return fetch(fetchRequest).then(response => {
                    // Check if valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // Clone the response
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                });
            })
    );
});

// Push notification event
self.addEventListener('push', event => {
    const data = event.data.json();
    
    const options = {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url,
            orderId: data.orderId
        },
        actions: [
            {
                action: 'view',
                title: 'View Order'
            },
            {
                action: 'close',
                title: 'Close'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Notification click event
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'view') {
        // Open the order page
        const urlToOpen = event.notification.data.url || '/';
        
        event.waitUntil(
            clients.matchAll({
                type: 'window',
                includeUncontrolled: true
            }).then(windowClients => {
                // Check if there's already a window open
                for (let client of windowClients) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                // If not, open a new window
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
        );
    }
});

// Background sync for offline orders
self.addEventListener('sync', event => {
    if (event.tag === 'sync-orders') {
        event.waitUntil(syncOfflineOrders());
    }
});

// Sync offline orders
async function syncOfflineOrders() {
    try {
        const cache = await caches.open('offline-orders');
        const requests = await cache.keys();
        
        for (const request of requests) {
            const response = await cache.match(request);
            const order = await response.json();
            
            // Try to send the order
            try {
                const fetchResponse = await fetch('/api/orders', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(order)
                });
                
                if (fetchResponse.ok) {
                    // Order sent successfully, remove from cache
                    await cache.delete(request);
                    
                    // Show notification
                    self.registration.showNotification('Order Synced', {
                        body: 'Your offline order has been placed successfully!',
                        icon: '/icons/icon-192.png'
                    });
                }
            } catch (error) {
                console.error('Failed to sync order:', error);
            }
        }
    } catch (error) {
        console.error('Sync failed:', error);
    }
}