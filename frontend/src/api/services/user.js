import { apiClient } from "../client";
import { ENDPOINTS } from "../endpoints";

export const userService = {
    getUser: async (userId) => {
        const response = await apiClient.get(
            ENDPOINTS.USER.GET_USER_BY_ID(userId)
        );
        return response.data;
    }
}