const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken() {
    return this.token || localStorage.getItem('auth_token');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Auth
  async register(email: string, password: string, fullName?: string) {
    const data = await this.request<{ user: { id: string; email: string }; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    });
    this.setToken(data.token);
    return data;
  }

  async login(email: string, password: string) {
    const data = await this.request<{ user: { id: string; email: string }; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async logout() {
    this.setToken(null);
  }

  async getMe() {
    return this.request<{ user: { id: string; email: string }; profile: { fullName: string; email: string }; role: string }>('/api/auth/me');
  }

  async updateProfile(fullName: string) {
    return this.request('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ fullName }) });
  }

  // Studios
  async getStudios() {
    return this.request<any[]>('/api/studios');
  }

  async createStudio(data: { name: string; description?: string }) {
    return this.request('/api/studios', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateStudio(id: string, data: { name: string; description?: string }) {
    return this.request(`/api/studios/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteStudio(id: string) {
    return this.request(`/api/studios/${id}`, { method: 'DELETE' });
  }

  // Accounts
  async getAccounts(studioId?: string) {
    const query = studioId ? `?studioId=${studioId}` : '';
    return this.request<any[]>(`/api/accounts${query}`);
  }

  async createAccount(data: { name: string; studioId: string; shopUrl?: string }) {
    return this.request('/api/accounts', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateAccount(id: string, data: { name: string; studioId: string; shopUrl?: string }) {
    return this.request(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteAccount(id: string) {
    return this.request(`/api/accounts/${id}`, { method: 'DELETE' });
  }

  // Products
  async getProducts(accountId?: string) {
    const query = accountId ? `?accountId=${accountId}` : '';
    return this.request<any[]>(`/api/products${query}`);
  }

  async createProduct(data: { productName: string; accountId?: string; affiliateLink?: string; category?: string }) {
    return this.request('/api/products', { method: 'POST', body: JSON.stringify(data) });
  }

  async bulkCreateProducts(accountId: string, products: { productName: string; affiliateLink?: string; category?: string }[]) {
    return this.request('/api/products/bulk', { method: 'POST', body: JSON.stringify({ accountId, products }) });
  }

  async deleteProduct(id: string) {
    return this.request(`/api/products/${id}`, { method: 'DELETE' });
  }

  // Statistics
  async getStatistics(filters: { studioId?: string; accountId?: string; startDate?: string; endDate?: string }) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.append(k, v));
    return this.request<any[]>(`/api/statistics?${params}`);
  }

  async bulkCreateStatistics(studioId: string, accountId: string, statistics: any[]) {
    return this.request('/api/statistics/bulk', { method: 'POST', body: JSON.stringify({ studioId, accountId, statistics }) });
  }

  // Optimize
  async getRotation(studioId?: string, accountId?: string) {
    const params = new URLSearchParams();
    if (studioId) params.append('studioId', studioId);
    if (accountId) params.append('accountId', accountId);
    return this.request<any[]>(`/api/optimize/rotation?${params}`);
  }

  async setRotation(studioId: string, accountId: string, products: Array<string | { product_uid?: string; product_name: string }>) {
    return this.request('/api/optimize/rotation', { method: 'POST', body: JSON.stringify({ studioId, accountId, products }) });
  }

  async runOptimization(data: { studioId: string; accountId: string; productsToAdd?: any[]; productsToRemove?: any[] }) {
    return this.request('/api/optimize/run', { method: 'POST', body: JSON.stringify(data) });
  }

  async analyzeDead(data: { studioId: string; accountId: string; daysThreshold?: number; minClicks?: number }) {
    return this.request<{
      summary: { total_active: number; dead: number; underperforming: number; performing: number; locked: number };
      deadProducts: any[];
      underperforming: any[];
      activeProducts: any[];
      lockedProducts: any[];
      suggestedReplacements: any[];
    }>('/api/optimize/analyze-dead', { method: 'POST', body: JSON.stringify(data) });
  }

  async autoOptimize(data: { studioId: string; accountId: string; deadProductIds: string[]; replacementProducts: any[] }) {
    return this.request<{ success: boolean; removed: number; added: number; details: any }>('/api/optimize/auto-optimize', { method: 'POST', body: JSON.stringify(data) });
  }

  async getOptimizationHistory(studioId?: string, accountId?: string, limit?: number) {
    const params = new URLSearchParams();
    if (studioId) params.append('studioId', studioId);
    if (accountId) params.append('accountId', accountId);
    if (limit) params.append('limit', limit.toString());
    return this.request<any[]>(`/api/optimize/history?${params}`);
  }

  // Admin
  async getAdminUsers() {
    return this.request<any[]>('/api/admin/users');
  }

  async getAdminStats() {
    return this.request<{ users: number; studios: number; accounts: number; products: number }>('/api/admin/stats');
  }

  async updateUserRole(userId: string, role: string) {
    return this.request(`/api/admin/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
  }

  async deleteUser(userId: string) {
    return this.request(`/api/admin/users/${userId}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
export default api;
