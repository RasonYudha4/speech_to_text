import { apiClient } from "../client";
import { ENDPOINTS } from "../endpoints";

export const srtService = {
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
    console.log("=== SERVICE EDIT SUBTITLE DEBUG ===");
    console.log("sequenceNumber:", sequenceNumber);
    console.log("srtId:", srtId);
    console.log("updateData:", updateData);
    console.log("User ID : ", userId)

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
