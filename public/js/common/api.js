/**
 * Food Order Bridge - API Client Utility Wrapper
 */
export const API = {
  async get(endpoint) {
    try {
      const response = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await response.json();
      if (!response.ok) {
        const err = new Error(data.message || `API Error: ${response.status}`);
        err.status = response.status;
        throw err;
      }
      return data;
    } catch (error) {
      console.error(`[API GET Error] ${endpoint}:`, error);
      throw error;
    }
  },

  async post(endpoint, payload) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok && response.status !== 202) {
        const err = new Error(data.message || `API Error: ${response.status}`);
        err.status = response.status;
        err.code = data.code;
        err.pendingCount = data.pendingCount;
        err.limit = data.limit;
        throw err;
      }
      return { status: response.status, data };
    } catch (error) {
      console.error(`[API POST Error] ${endpoint}:`, error);
      throw error;
    }
  },

  async put(endpoint, payload) {
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        const err = new Error(data.message || `API Error: ${response.status}`);
        err.status = response.status;
        err.code = data.code;
        err.pendingCount = data.pendingCount;
        err.limit = data.limit;
        throw err;
      }
      return data;
    } catch (error) {
      console.error(`[API PUT Error] ${endpoint}:`, error);
      throw error;
    }
  },

  async patch(endpoint, payload) {
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        const err = new Error(data.message || `API Error: ${response.status}`);
        err.status = response.status;
        err.code = data.code;
        err.pendingCount = data.pendingCount;
        err.limit = data.limit;
        throw err;
      }
      return data;
    } catch (error) {
      console.error(`[API PATCH Error] ${endpoint}:`, error);
      throw error;
    }
  },

  async delete(endpoint) {
    try {
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' }
      });
      const data = await response.json();
      if (!response.ok) {
        const err = new Error(data.message || `API Error: ${response.status}`);
        err.status = response.status;
        err.code = data.code;
        throw err;
      }
      return data;
    } catch (error) {
      console.error(`[API DELETE Error] ${endpoint}:`, error);
      throw error;
    }
  }
};
