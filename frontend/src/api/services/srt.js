import { apiClient } from "../client";
import { ENDPOINTS } from "../endpoints";

export const srtService = {
  // Get all SRTs
  getAllSrts: async (params = {}) => {
    const { page, limit, search, sortBy, sortOrder } = params;
    
    // Build query string
    const queryParams = new URLSearchParams();
    if (page) queryParams.append('page', page);
    if (limit) queryParams.append('limit', limit);
    if (search) queryParams.append('search', search);
    if (sortBy) queryParams.append('sortBy', sortBy);
    if (sortOrder) queryParams.append('sortOrder', sortOrder);
    
    const queryString = queryParams.toString();
    const url = queryString ? `${ENDPOINTS.SRT.SRTS}?${queryString}` : ENDPOINTS.SRT.SRTS;
    
    const response = await apiClient.get(url);
    return response.data;
  },

  // Save/Update entire SRT file with subtitles
  saveSubtitles: async (srtData) => {
    const response = await apiClient.post(ENDPOINTS.SRT.SUBTITLES, srtData);
    return response.data;
  },

  // Get SRT file with all subtitles by filename
  getSubtitles: async (filename) => {
    const response = await apiClient.get(
      ENDPOINTS.SRT.SUBTITLE_BY_FILENAME(filename)
    );
    return response.data;
  },

  // Edit single subtitle
  editSubtitle: async (sequenceNumber, srtId, updateData, userId) => {
    const url = ENDPOINTS.SRT.SUBTITLE_BY_SEQUENCE(sequenceNumber);
    console.log("Request URL:", url);

    const requestBody = {
      ...updateData,
      srt_id: srtId,
      sequence_number: sequenceNumber,
      userId: userId,
    };
    console.log("Request body:", requestBody);

    try {
      const response = await apiClient.put(url, requestBody);
      console.log("Service response:", response);
      return response.data;
    } catch (error) {
      console.error("Service error:", error);
      console.error("Service error response:", error.response?.data);
      throw error;
    }
  },

  // Delete a single subtitle
  deleteSubtitle: async (sequenceNumber, editedBy) => {
    const response = await apiClient.delete(
      ENDPOINTS.SRT.SUBTITLE_BY_SEQUENCE(sequenceNumber),
      { data: { edited_by: editedBy } }
    );
    return response.data;
  },
};
