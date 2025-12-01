/*
═══════════════════════════════════════════════════════════════
AR SERVICE REQUEST API ENDPOINT
═══════════════════════════════════════════════════════════════

This endpoint receives AR service requests and integrates with your
existing backend systems (PostgreSQL, Service Recovery, Analytics)

Add this to your existing Express.js API on Railway

═══════════════════════════════════════════════════════════════
*/

const express = require('express');
const router = express.Router();

/**
 * POST /api/service/ar-request
 * 
 * Receives AR-enhanced service requests with:
 * - Precise GPS location
 * - Photo of exact spot
 * - Service type & timing
 * - Guest context
 */
router.post('/api/service/ar-request', async (req, res) => {
    try {
        const {
            restaurant_id,
            table_number,
            service_type,
            timing,
            scheduled_time,
            location,
            photo,
            timestamp
        } = req.body;

        // Validate required fields
        if (!restaurant_id || !service_type || !timing) {
            return res.status(400).json({ 
                error: 'Missing required fields' 
            });
        }

        // Calculate priority based on timing and VIP status
        const priority = calculatePriority(timing, table_number);

        // Store in database
        const result = await storeARServiceRequest({
            restaurant_id,
            table_number,
            service_type,
            timing,
            scheduled_time,
            location_lat: location?.latitude,
            location_lng: location?.longitude,
            location_accuracy: location?.accuracy,
            photo_data: photo,
            priority,
            status: 'pending',
            created_at: timestamp || new Date().toISOString()
        });

        // Trigger real-time notification to staff
        await notifyStaff({
            restaurant_id,
            request_id: result.id,
            service_type,
            table_number,
            timing,
            priority,
            location: location ? {
                lat: location.latitude,
                lng: location.longitude
            } : null
        });

        // Track analytics
        await trackARServiceRequest({
            restaurant_id,
            table_number,
            service_type,
            timing,
            timestamp
        });

        // Return success
        res.status(200).json({
            success: true,
            request_id: result.id,
            message: 'AR service request received',
            estimated_time: calculateEstimatedTime(timing, priority)
        });

    } catch (error) {
        console.error('AR service request error:', error);
        res.status(500).json({ 
            error: 'Failed to process AR service request' 
        });
    }
});

/**
 * Store AR service request in database
 */
async function storeARServiceRequest(data) {
    const query = `
        INSERT INTO ar_service_requests (
            restaurant_id,
            table_number,
            service_type,
            timing,
            scheduled_time,
            location_lat,
            location_lng,
            location_accuracy,
            photo_data,
            priority,
            status,
            created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, created_at
    `;

    const values = [
        data.restaurant_id,
        data.table_number,
        data.service_type,
        data.timing,
        data.scheduled_time,
        data.location_lat,
        data.location_lng,
        data.location_accuracy,
        data.photo_data,
        data.priority,
        data.status,
        data.created_at
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
}

/**
 * Calculate request priority
 * Factors: timing urgency, VIP status, service type
 */
function calculatePriority(timing, table_number) {
    let priority = 'medium';

    // Check if VIP table (you already have VIP prediction)
    const isVIP = checkVIPStatus(table_number);
    
    if (timing === 'now') {
        priority = isVIP ? 'urgent' : 'high';
    } else if (timing === '15min') {
        priority = isVIP ? 'high' : 'medium';
    } else {
        priority = isVIP ? 'medium' : 'low';
    }

    return priority;
}

/**
 * Notify staff via WebSocket/Push
 * Integrates with your existing Mission Control dashboard
 */
async function notifyStaff(data) {
    // Send to Mission Control dashboard via WebSocket
    const notification = {
        type: 'ar_service_request',
        request_id: data.request_id,
        restaurant_id: data.restaurant_id,
        table_number: data.table_number,
        service_type: data.service_type,
        timing: data.timing,
        priority: data.priority,
        location: data.location,
        timestamp: new Date().toISOString()
    };

    // Broadcast to connected Mission Control clients
    // (Use your existing WebSocket implementation)
    broadcastToMissionControl(data.restaurant_id, notification);

    // Optional: Send push notification for urgent requests
    if (data.priority === 'urgent') {
        await sendPushNotification(data.restaurant_id, {
            title: 'Urgent AR Service Request',
            body: `${data.service_type} needed at ${data.table_number}`,
            data: notification
        });
    }
}

/**
 * Track AR service analytics
 */
async function trackARServiceRequest(data) {
    const query = `
        INSERT INTO analytics_interactions (
            restaurant_id,
            table_number,
            interaction_type,
            service_type,
            timing,
            timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    const values = [
        data.restaurant_id,
        data.table_number,
        'ar_service_request',
        data.service_type,
        data.timing,
        data.timestamp
    ];

    await pool.query(query, values);
}

/**
 * Calculate estimated delivery time
 */
function calculateEstimatedTime(timing, priority) {
    const baseMinutes = {
        'now': 5,
        '15min': 15,
        '30min': 30,
        'custom': null
    };

    const minutes = baseMinutes[timing];
    if (!minutes) return null;

    // Adjust for priority
    const adjustment = priority === 'urgent' ? -2 : 0;
    return Math.max(3, minutes + adjustment);
}

/**
 * GET endpoint for Mission Control to fetch pending AR requests
 */
router.get('/api/service/ar-requests', async (req, res) => {
    try {
        const { restaurant_id, status } = req.query;

        const query = `
            SELECT 
                id,
                table_number,
                service_type,
                timing,
                scheduled_time,
                location_lat,
                location_lng,
                photo_data,
                priority,
                status,
                created_at
            FROM ar_service_requests
            WHERE restaurant_id = $1
            ${status ? 'AND status = $2' : ''}
            ORDER BY 
                CASE priority
                    WHEN 'urgent' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    WHEN 'low' THEN 4
                END,
                scheduled_time ASC
        `;

        const values = status ? [restaurant_id, status] : [restaurant_id];
        const result = await pool.query(query, values);

        res.status(200).json({
            success: true,
            requests: result.rows
        });

    } catch (error) {
        console.error('Error fetching AR requests:', error);
        res.status(500).json({ error: 'Failed to fetch AR requests' });
    }
});

/**
 * PATCH endpoint to update request status
 */
router.patch('/api/service/ar-requests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, completed_by, notes } = req.body;

        const query = `
            UPDATE ar_service_requests
            SET 
                status = $1,
                completed_by = $2,
                notes = $3,
                completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END
            WHERE id = $4
            RETURNING *
        `;

        const result = await pool.query(query, [status, completed_by, notes, id]);

        // Track completion for Service Recovery metrics
        if (status === 'completed') {
            await trackServiceCompletion(result.rows[0]);
        }

        res.status(200).json({
            success: true,
            request: result.rows[0]
        });

    } catch (error) {
        console.error('Error updating AR request:', error);
        res.status(500).json({ error: 'Failed to update AR request' });
    }
});

module.exports = router;

/*
═══════════════════════════════════════════════════════════════
DATABASE SCHEMA
═══════════════════════════════════════════════════════════════

Run this SQL to create the necessary table:

CREATE TABLE ar_service_requests (
    id SERIAL PRIMARY KEY,
    restaurant_id VARCHAR(100) NOT NULL,
    table_number VARCHAR(50) NOT NULL,
    service_type VARCHAR(50) NOT NULL,
    timing VARCHAR(20) NOT NULL,
    scheduled_time TIMESTAMP NOT NULL,
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    location_accuracy DECIMAL(10, 2),
    photo_data TEXT,
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    notes TEXT,
    completed_by VARCHAR(100),
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_restaurant_status (restaurant_id, status),
    INDEX idx_scheduled_time (scheduled_time),
    INDEX idx_priority (priority)
);

═══════════════════════════════════════════════════════════════
*/
