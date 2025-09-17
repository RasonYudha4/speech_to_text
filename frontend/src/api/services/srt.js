import { apiClient } from '../client';
import { ENDPOINTS } from '../endpoints';

export const srtService = {
  // Save/Update entire SRT file with subtitles
  saveSubtitles: async (srtData) => {
    const response = await apiClient.post(ENDPOINTS.SRT.SUBTITLES, srtData);
    return response.data;
  },

  // Get SRT file with all subtitles by filename
  getSubtitles: async (filename) => {
    const response = await apiClient.get(ENDPOINTS.SRT.SUBTITLE_BY_FILENAME(filename));
    return response.data;
  },

  // Edit a single subtitle
  editSubtitle: async (sequenceNumber, updateData) => {
    const response = await apiClient.put(
      ENDPOINTS.SRT.SUBTITLE_BY_SEQUENCE(sequenceNumber),
      updateData
    );
    return response.data;
  },

  // Delete a single subtitle
  deleteSubtitle: async (sequenceNumber, editedBy) => {
    const response = await apiClient.delete(
      ENDPOINTS.SRT.SUBTITLE_BY_SEQUENCE(sequenceNumber),
      { data: { edited_by: editedBy } }
    );
    return response.data;
  }
};