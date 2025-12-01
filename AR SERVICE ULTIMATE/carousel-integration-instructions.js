/*
═══════════════════════════════════════════════════════════════
AR SERVICE REQUEST - CAROUSEL INTEGRATION
═══════════════════════════════════════════════════════════════

Add this configuration to your smartCardConfigs array in table-experience.html

This adds the AR Service Request card to your existing 3D carousel.
The card will open the AR experience in a new window when activated.

Integration Steps:
1. Add this config to smartCardConfigs array (around line 290)
2. Add corresponding QR code entry to qrCodes object
3. Upload ar-service-request.html to same directory

═══════════════════════════════════════════════════════════════
*/

// ADD THIS TO YOUR smartCardConfigs ARRAY:
{
    id: 'ar-service',
    title: 'AR Service Request',
    description: 'Point & request service at any location',
    color: '#9b59b6',  // Purple
    icon: '📍',
    qrType: 'ar_service',
    position: { x: 400, y: -100, z: -200 }  // Adjust position as needed
}

// ADD THIS TO YOUR qrCodes OBJECT:
ar_service: {
    type: 'ar_service',
    title: 'AR Service Request',
    destination_url: './ar-service-request.html?restaurant=' + restaurantId + '&table=' + tableNumber,
    description: 'AR-powered service requests with location precision'
}

/*
═══════════════════════════════════════════════════════════════
USAGE IN YOUR CAROUSEL:
═══════════════════════════════════════════════════════════════

The AR Service card will appear in your 3D carousel alongside:
- Menu & Specials
- Call Service  
- Brain Games
- Feedback
- etc.

When a guest:
1. Rotates to the AR Service card
2. Taps "Show QR" or direct action button
3. Opens AR Service Request interface
4. Points camera at desired location
5. Selects service type (champagne, coffee, towels, etc.)
6. Chooses timing (now, 15min, 30min, custom)
7. Captures request with photo + GPS
8. Request sent to your backend API

Backend receives:
- service_type: 'champagne', 'coffee', 'towels', etc.
- timing: 'now', '15min', '30min', 'custom'
- scheduled_time: ISO timestamp
- location: { latitude, longitude, accuracy }
- photo: base64 image data
- restaurant_id & table_number

This integrates with your existing:
- Service Recovery system
- Mission Control dashboard
- VIP prediction engine
- Analytics tracking

═══════════════════════════════════════════════════════════════
*/
