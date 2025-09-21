// Convert "00:01:23,456" or "00:01:23.456" → seconds
export const timeToSeconds = (timeStr) => {
  if (!timeStr || typeof timeStr !== "string") {
    console.warn("Invalid time passed to timeToSeconds:", timeStr);
    return null;
  }

  const [timePart, ms] = timeStr.split(/[,\.]/);
  const [hours, minutes, seconds] = timePart.split(":").map(Number);

  return (
    hours * 3600 +
    minutes * 60 +
    seconds +
    (ms ? parseInt(ms, 10) / 1000 : 0)
  );
};

// Convert seconds → "00:01:23,456"
export const secondsToSRTTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms
    .toString()
    .padStart(3, "0")}`;
};

// For quick UI display (e.g., "1:05")
export const formatTimeForDisplay = (timeStr) => {
  if (!timeStr) return "";
  const seconds = timeToSeconds(timeStr);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};
