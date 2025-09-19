import { useState, useEffect,useCallback } from "react";
import { srtService } from "../api/services/srt";

export const useAllSrts = () => {
  const [srts, setSrts] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 10,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [srtsLoading, setSrtsLoading] = useState(false);
  const [srtsError, setSrtsError] = useState(null);

  const fetchAllSrts = useCallback(async (params = {}) => {
    try {
      setSrtsLoading(true);
      setSrtsError(null);
      
      const response = await srtService.getAllSrts(params);
      
      if (response && response.success && response.data) {
        // Extract SRTs array and pagination info
        const srtsArray = response.data.srts || [];
        const paginationInfo = response.data.pagination || {};
        
        setSrts(srtsArray);
        setPagination(paginationInfo);
        
        return {
          srts: srtsArray,
          pagination: paginationInfo
        };
      } else {
        setSrts([]);
        setPagination({
          currentPage: 1,
          totalPages: 1,
          totalItems: 0,
          itemsPerPage: 10,
          hasNextPage: false,
          hasPrevPage: false
        });
      }
    } catch (err) {
      setSrtsError(err.message || "Failed to fetch SRTs");
      setSrts([]);
      throw err;
    } finally {
      setSrtsLoading(false);
    }
  }, []);

  // Convenience methods for pagination
  const goToPage = useCallback((page) => {
    return fetchAllSrts({ page });
  }, [fetchAllSrts]);

  const nextPage = useCallback(() => {
    if (pagination.hasNextPage) {
      return fetchAllSrts({ page: pagination.currentPage + 1 });
    }
  }, [pagination.hasNextPage, pagination.currentPage, fetchAllSrts]);

  const prevPage = useCallback(() => {
    if (pagination.hasPrevPage) {
      return fetchAllSrts({ page: pagination.currentPage - 1 });
    }
  }, [pagination.hasPrevPage, pagination.currentPage, fetchAllSrts]);

  const searchSrts = useCallback((searchTerm, additionalParams = {}) => {
    return fetchAllSrts({
      search: searchTerm,
      page: 1, 
      ...additionalParams
    });
  }, [fetchAllSrts]);

  return {
    srts,
    pagination,
    srtsLoading,
    srtsError,
    fetchAllSrts,
    goToPage,
    nextPage,
    prevPage,
    searchSrts,
  };
};