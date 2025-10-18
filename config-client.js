const CONFIG = {
  getApiBaseUrl() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8080'; // Update to match your local backend port
    }
    return '/api'; // Proxy to https://qr-tracking-backend-production.up.railway.app
  },

  generateRestaurantId(restaurantName) {
    if (!restaurantName) return null;
    return restaurantName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '')
      .substring(0, 20);
  },

  validateRestaurantId(restaurantId) {
    if (!restaurantId) return null;
    if (restaurantId.length > 4) {
      const half = Math.floor(restaurantId.length / 2);
      const firstHalf = restaurantId.substring(0, half);
      const secondHalf = restaurantId.substring(half);
      if (firstHalf === secondHalf) {
        console.warn(`Fixed duplicated restaurant ID: ${restaurantId} → ${firstHalf}`);
        return firstHalf;
      }
    }
    return restaurantId;
  },

  getAuthenticatedUser() {
    const restaurantName = localStorage.getItem('user_restaurant_name');
    const rawRestaurantId = localStorage.getItem('user_restaurant_id');
    if (!restaurantName || !rawRestaurantId) {
      console.warn('[AUTH] No user data found, using fallback');
      return {
        restaurantName: 'Demo Restaurant',
        restaurantId: 'demo',
        userType: 'restaurant'
      };
    }
    const restaurantId = this.validateRestaurantId(rawRestaurantId);
    if (!restaurantId) {
      console.warn('[AUTH] Invalid restaurant ID, using fallback');
      return {
        restaurantName: restaurantName || 'Demo Restaurant',
        restaurantId: 'demo',
        userType: 'restaurant'
      };
    }
    return {
      restaurantName,
      restaurantId,
      userType: localStorage.getItem('user_type') || 'restaurant'
    };
  },

  async makeApiCall(endpoint, options = {}) {
    const url = `${this.getApiBaseUrl()}${endpoint}`;
    console.log(`[API] Calling: ${url}`);
    const token = localStorage.getItem('auth_token');

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(token && !endpoint.includes('/service-alerts') && !endpoint.includes('/qr-scans') ? { 'Authorization': `Bearer ${token}` } : {}),
          ...options.headers
        },
        ...options
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error(`[API] Invalid JSON response from ${url}:`, text);
        data = {};
      }

      if (!response.ok) {
        console.warn(`[API] Error ${response.status} for ${url}:`, data);
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('auth_token');
          window.location.href = '/login.html';
        }
        return this.getEmptyDataStructure(endpoint);
      }

      console.log(`[API] Success for ${url}:`, data);
      return data;
    } catch (error) {
      console.error(`[API] Failed for ${url}:`, error.message);
      return this.getEmptyDataStructure(endpoint);
    }
  },

  getEmptyDataStructure(endpoint) {
    if (endpoint.includes('/analytics/')) {
      return {
        totalScans: 0,
        todayScans: 0,
        weeklyScans: 0,
        monthlyScans: 0,
        scansByType: {},
        recentScans: [],
        hourlyData: [],
        tableData: [],
        conversionRate: 0,
        avgSessionTime: 0
      };
    } else if (endpoint.includes('/alerts') || endpoint.includes('/status') || endpoint.includes('/activity') || endpoint.includes('/staffing')) {
      return [];
    }
    return {};
  },

  async loadRestaurantAnalytics(restaurantId) {
    if (!restaurantId) {
      console.warn('[ANALYTICS] No restaurant ID provided');
      return this.getEmptyDataStructure('/analytics');
    }

    try {
      const data = await this.makeApiCall(`/analytics/${restaurantId}`);
      return data.success ? data : this.getEmptyDataStructure('/analytics');
    } catch (error) {
      console.error(`[ANALYTICS] Failed to load for ${restaurantId}:`, error.message);
      return this.getEmptyDataStructure('/analytics');
    }
  },

  async loadTableAlerts(restaurantId) {
    if (!restaurantId) {
      console.warn('[ALERTS] No restaurant ID provided');
      return [];
    }
    try {
      const data = await this.makeApiCall(`/tables/${restaurantId}/alerts`);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(`[ALERTS] Failed to load for ${restaurantId}:`, error.message);
      return [];
    }
  },

  async loadTableStatus(restaurantId) {
    if (!restaurantId) {
      console.warn('[TABLES] No restaurant ID provided');
      return [];
    }
    try {
      const data = await this.makeApiCall(`/tables/${restaurantId}/status`);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(`[TABLES] Failed to load for ${restaurantId}:`, error.message);
      return [];
    }
  },

  async loadTableActivities(restaurantId) {
    if (!restaurantId) {
      console.warn('[ACTIVITIES] No restaurant ID provided');
      return [];
    }
    try {
      const data = await this.makeApiCall(`/tables/${restaurantId}/activity`);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(`[ACTIVITIES] Failed to load for ${restaurantId}:`, error.message);
      return [];
    }
  },

  async loadStaffingRecommendations(restaurantId) {
    if (!restaurantId) {
      console.warn('[STAFFING] No restaurant ID provided');
      return [];
    }
    try {
      const data = await this.makeApiCall(`/staffing/${restaurantId}`);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(`[STAFFING] Failed to load for ${restaurantId}:`, error.message);
      return [];
    }
  },

  async generateQRCode(restaurantId, qr_type, destination_url, table_number) {
    if (!restaurantId || !qr_type || !destination_url) {
      console.warn('[QR] Missing required parameters');
      return { success: false };
    }
    try {
      const data = await this.makeApiCall(`/qr-codes/${restaurantId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ qr_type, destination_url, table_number })
      });
      return data;
    } catch (error) {
      console.error(`[QR] Failed to generate for ${restaurantId}:`, error.message);
      return { success: false };
    }
  },

  async logQRScan(qr_id, restaurant_id, table_number) {
    if (!qr_id || !restaurant_id) {
      console.warn('[QRSCAN] Missing required parameters');
      return { success: false };
    }
    try {
      const data = await this.makeApiCall(`/qr-scans`, {
        method: 'POST',
        body: JSON.stringify({ qr_id, restaurant_id, table_number })
      });
      return data;
    } catch (error) {
      console.error(`[QRSCAN] Failed to log for ${restaurant_id}:`, error.message);
      return { success: false };
    }
  },

  showError(elementId, message, canRetry = false) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.innerHTML = `
      <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 20px; text-align: center; color: #dc2626;">
        <div style="font-size: 24px; margin-bottom: 12px;">⚠️</div>
        <h3 style="margin-bottom: 8px; color: #dc2626;">Data Loading Error</h3>
        <p style="margin-bottom: 16px;">${message}</p>
        ${canRetry ? `
          <button onclick="location.reload()" 
                  style="background: #dc2626; color: white; padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer;">
            Retry
          </button>
        ` : ''}
        <div style="margin-top: 12px; font-size: 12px; color: #6b7280;">
          If this problem persists, contact support.
        </div>
      </div>
    `;
  },

  showLoading(elementId, message = 'Loading data...') {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #6b7280;">
        <div class="spinner" style="margin: 0 auto 16px;"></div>
        <p>${message}</p>
      </div>
    `;
  },

  showEmptyState(elementId, title, message) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #6b7280;">
        <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
        <h3 style="margin-bottom: 8px; color: #374151;">${title}</h3>
        <p>${message}</p>
      </div>
    `;
  },

  async checkServerHealth() {
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/health`, {
        method: 'GET',
        timeout: 5000
      });
      return response.ok;
    } catch (error) {
      console.error('[HEALTH] Server check failed:', error.message);
      return false;
    }
  }
};

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid #e5e7eb;
      border-top: 3px solid #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}