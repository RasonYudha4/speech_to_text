
import { useState, useEffect, useCallback, useMemo } from "react";
import { userService } from "../api/services/user";

export const useMultipleUsers = (userIds) => {
  const [users, setUsers] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const uniqueUserIds = useMemo(() => {
    if (!Array.isArray(userIds)) return [];
    return [...new Set(userIds.filter(id => id))];
  }, [userIds]);

  const fetchUsers = useCallback(async () => {
    if (uniqueUserIds.length === 0) {
      setUsers({});
      setErrors({});
      return;
    }

    setIsLoading(true);
    const newUsers = {};
    const newErrors = {};

    try {
      const userPromises = uniqueUserIds.map(async (userId) => {
        try {
          const response = await userService.getUser(userId);
          const userData = response.user || response.data || response;
          return { userId, userData, error: null };
        } catch (err) {
          const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch user';
          return { userId, userData: null, error: errorMessage };
        }
      });

      const results = await Promise.all(userPromises);
      
      results.forEach(({ userId, userData, error }) => {
        if (userData) {
          newUsers[userId] = userData;
        } else {
          newErrors[userId] = error;
        }
      });

      setUsers(newUsers);
      setErrors(newErrors);
    } catch (err) {
      console.error('Error in batch user fetch:', err);
    } finally {
      setIsLoading(false);
    }
  }, [uniqueUserIds]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const getUserName = useCallback((userId) => {
    if (!userId) return 'Unknown User';
    
    const user = users[userId];
    if (user) {
      return user.name || user.username || user.displayName || `User ${userId}`;
    }
    
    if (errors[userId]) {
      return `User ${userId}`;
    }
    
    return 'Loading...';
  }, [users, errors]);

  const refetch = useCallback(() => {
    return fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    errors,
    isLoading,
    getUserName,
    refetch
  };
};