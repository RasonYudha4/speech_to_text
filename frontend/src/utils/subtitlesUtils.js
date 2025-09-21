import { timeToSeconds } from "./timeUtils";

/**
 * Get min/max constraints for a subtitle’s time range
 */
export const getTimeConstraints = (subtitleIndex, subtitles, videoDuration = 0) => {
  let minTime = 0;
  let maxTime = videoDuration;

  // Previous subtitle end → min
  for (let i = 0; i < subtitles.length; i++) {
    if (i < subtitleIndex) {
      const endTime = timeToSeconds(subtitles[i].end);
      minTime = Math.max(minTime, endTime + 0.1); // 100ms gap
    }
  }

  // Next subtitle start → max
  for (let i = 0; i < subtitles.length; i++) {
    if (i > subtitleIndex) {
      const startTime = timeToSeconds(subtitles[i].start);
      maxTime = Math.min(maxTime, startTime - 0.1); // 100ms gap
    }
  }

  return { minTime, maxTime };
};

/**
 * Detect if mouse is hovering near subtitle region edges
 */
export const getRegionEdgeHover = ({
  mouseX,
  canvasWidth,
  videoDuration,
  waveformData,
  zoomLevel,
  zoomCenter,
  subtitles,
}) => {
  if (!videoDuration || subtitles.length === 0) {
    return { subtitleIndex: -1, edge: null };
  }

  const totalSamples = waveformData.length;
  const visibleSamples = Math.floor(totalSamples / zoomLevel);
  const startSample = Math.floor(
    (totalSamples - visibleSamples) * zoomCenter
  );
  const endSample = Math.min(startSample + visibleSamples, totalSamples);

  const visibleStartTime = (startSample / totalSamples) * videoDuration;
  const visibleEndTime = (endSample / totalSamples) * videoDuration;
  const visibleDuration = visibleEndTime - visibleStartTime;

  const mouseTime =
    visibleStartTime + (mouseX / canvasWidth) * visibleDuration;
  const edgeThreshold = (visibleDuration / canvasWidth) * 8;

  for (let i = 0; i < subtitles.length; i++) {
    const subtitle = subtitles[i];
    const startTime = timeToSeconds(subtitle.start);
    const endTime = timeToSeconds(subtitle.end);

    // Only check visible subs
    if (endTime >= visibleStartTime && startTime <= visibleEndTime) {
      if (Math.abs(mouseTime - startTime) <= edgeThreshold) {
        return { subtitleIndex: i, edge: "start" };
      }
      if (Math.abs(mouseTime - endTime) <= edgeThreshold) {
        return { subtitleIndex: i, edge: "end" };
      }
    }
  }

  return { subtitleIndex: -1, edge: null };
};
