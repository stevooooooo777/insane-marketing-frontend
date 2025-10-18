// sw.js - Production Service Worker
const CACHE_NAME = 'qr-business-intelligence-v1';

// Install Service Worker
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', function(event) {
  self.clients.claim();
});

// Handle push notifications from your server
self.addEventListener('push', function(event) {
  if (!event.data) return;

  try {
    const data = event.data.json();
    console.log('[SW] Push notification received:', data);

    const options = {
      body: data.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      tag: data.tag || 'table-alert',
      data: {
        tableNumber: data.tableNumber,
        alertId: data.alertId,
        type: data.type,
        url: data.url || '/'
      },
      actions: [
        {
          action: 'acknowledge',
          title: 'Mark Resolved',
          icon: '/favicon.ico'
        },
        {
          action: 'view',
          title: 'View Table',
          icon: '/favicon.ico'
        }
      ]
    };

    // Show notification
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );

    // Send confirmation back to server - PRODUCTION URL
    fetch('https://qr.insane.marketing/api/notifications/delivered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alertId: data.alertId,
        deliveredAt: new Date().toISOString()
      })
    }).catch(err => console.log('[SW] Delivery confirmation failed:', err));

  } catch (error) {
    console.error('[SW] Error handling push notification:', error);
    
    // Fallback notification
    event.waitUntil(
      self.registration.showNotification('Service Request', {
        body: 'A customer needs assistance',
        icon: '/favicon.ico',
        vibrate: [300, 100, 300]
      })
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'acknowledge') {
    event.waitUntil(
      fetch('https://qr.insane.marketing/api/service/resolve/' + event.notification.data.alertId, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${event.notification.data.token || ''}` // Pass token if available
        },
        body: JSON.stringify({
          resolvedBy: 'mobile-notification',
          resolvedAt: new Date().toISOString()
        })
      }).then(response => {
        if (response.ok) {
          self.registration.showNotification('Alert Resolved', {
            body: `Table ${event.notification.data.tableNumber} request marked as resolved`,
            icon: '/favicon.ico',
            tag: 'resolved-confirmation'
          });
        }
      }).catch(error => {
        console.error('[SW] Failed to resolve alert:', error);
      })
    );
  } else {
    


        
        // Check if app is already open
        for (let client of clientList) {
          if (client.url.includes('table-control-center.html') && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow('/table-control-center.html?mobile=true');
        }
      })
    );
  }
});