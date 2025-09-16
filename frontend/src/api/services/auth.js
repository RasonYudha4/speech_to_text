import { apiClient } from '../client';
import { ENDPOINTS } from '../endpoints';

export const authService = {
  login: async (credentials) => {
    const response = await apiClient.post(ENDPOINTS.AUTH.LOGIN, credentials);
    return response.data;
  },
  
  register: async (userData) => {
    const response = await apiClient.post(ENDPOINTS.AUTH.REGISTER, userData);
    return response.data;
  },
  
  verify: async () => {
    const response = await apiClient.get(ENDPOINTS.AUTH.VERIFY);
    return response.data;
  }
};