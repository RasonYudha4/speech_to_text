import { useState, useEffect, useCallback } from "react";
import { srtService } from "../api/services/srt";

// Main hook for SRT operations
export const useSrt = (filename) => {
  const [subtitles, setSubtitles] = useState([]); // Initialize as empty array
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchSubtitles = useCallback(async () => {
    if (!filename) return [];

    try {
      setLoading(true);
      setError(null);
      const response = await srtService.getSubtitles(filename);
      // Extract the subtitles array from the nested response
      let subtitlesArray = [];

      if (
        response &&
        response.success &&
        response.data &&
        response.data.subtitles
      ) {
        const rawSubtitles = response.data.subtitles;

        subtitlesArray = rawSubtitles.map((subtitle) => ({
          sequence_number: subtitle.sequence_number,
          srt_id: subtitle.srt_id,
          start: subtitle.start_time,
          end: subtitle.end_time,
          text: subtitle.text,
        }));
      } else if (Array.isArray(response)) {
        subtitlesArray = response;
      }
      setSubtitles(subtitlesArray);
      return subtitlesArray;
    } catch (err) {
      setError(err.message || "Failed to fetch subtitles");
      setSubtitles([]);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [filename]);

  // Updated saveSubtitles function
  const saveSubtitles = useCallback(async (srtData) => {
    try {
      setSaving(true);
      setError(null);
      const response = await srtService.saveSubtitles(srtData);

      console.log("response : ", response);

      // Extract subtitles from response (handle same nested structure)
      let subtitlesArray = [];
      if (
        response &&
        response.success &&
        response.data &&
        response.data.subtitles
      ) {
        subtitlesArray = Array.isArray(response.data.subtitles)
          ? response.data.subtitles
          : [];
      } else if (Array.isArray(response)) {
        subtitlesArray = response;
      }

      setSubtitles(subtitlesArray);
      return subtitlesArray;
    } catch (err) {
      setError(err.message || "Failed to save subtitles");
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  // Edit a single subtitle with optimistic updates
  const editSubtitle = useCallback(
    async (sequenceNumber, srtId, updateData, userId) => {
      try {
        setError(null);

        // Optimistic update using sequence_number
        setSubtitles((prev) => {
          const prevArray = Array.isArray(prev) ? prev : [];

          const updatedArray = prevArray.map((subtitle) => {
            const isMatch = subtitle.sequence_number === sequenceNumber;

            if (isMatch) {
              console.log(`Found matching subtitle:`, {
                sequence_number: subtitle.sequence_number,
                sequenceNumber,
                originalSubtitle: subtitle,
                updateData,
              });
            }

            return isMatch ? { ...subtitle, ...updateData } : subtitle;
          });

          return updatedArray;
        });

        // Call API with sequenceNumber and srtId
        const response = await srtService.editSubtitle(
          sequenceNumber,
          srtId,
          updateData,
          userId
        );
        console.log("Server response:", response);

        // Update with server response using sequence_number
        setSubtitles((prev) => {
          const prevArray = Array.isArray(prev) ? prev : [];
          return prevArray.map((subtitle) =>
            subtitle.sequence_number === sequenceNumber
              ? {
                  ...response.data,
                  // Map backend properties to frontend properties
                  start: response.data.start_time,
                  end: response.data.end_time,
                  text: response.data.text,
                }
              : subtitle
          );
        });

        return response.data;
      } catch (err) {

        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to edit subtitle"
        );
        await fetchSubtitles();
        throw err;
      }
    },
    [fetchSubtitles]
  );
  // Delete a single subtitle with optimistic updates
  const deleteSubtitle = useCallback(
    async (sequenceNumber, editedBy) => {
      try {
        setError(null);

        // Store original state for rollback
        const originalSubtitles = Array.isArray(subtitles) ? subtitles : [];

        // Optimistic update - remove from UI immediately
        setSubtitles((prev) => {
          const prevArray = Array.isArray(prev) ? prev : [];
          return prevArray.filter(
            (subtitle) => subtitle.sequence !== sequenceNumber
          );
        });

        await srtService.deleteSubtitle(sequenceNumber, editedBy);

        // Success - keep the optimistic update
        return true;
      } catch (err) {
        setError(err.message || "Failed to delete subtitle");

        // Revert optimistic update on error
        setSubtitles(originalSubtitles);
        throw err;
      }
    },
    [subtitles]
  );

  // Auto-fetch when filename changes
  useEffect(() => {
    fetchSubtitles();
  }, [fetchSubtitles]);

  return {
    // State
    subtitles: Array.isArray(subtitles) ? subtitles : [],
    loading,
    saving,
    error,

    // Actions
    saveSubtitles,
    editSubtitle,
    deleteSubtitle,
    refetch: fetchSubtitles,

    // Computed values
    subtitleCount: Array.isArray(subtitles) ? subtitles.length : 0,
    isEmpty: !Array.isArray(subtitles) || subtitles.length === 0,
    hasError: !!error,
  };
};
