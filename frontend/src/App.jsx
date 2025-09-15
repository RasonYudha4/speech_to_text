import { useState, useRef, useEffect } from "react";
import axios from "axios";


function App() {
  // =============================================================================
  // MEDIA FILES STATE
  // =============================================================================
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [audioFile, setAudioFile] = useState(null);

  // =============================================================================
  // SUBTITLE DATA STATE
  // =============================================================================
  const [srtData, setSrtData] = useState([]);
  const [generatedTranscription, setGeneratedTranscription] = useState("");

  // =============================================================================
  // VIDEO PLAYBACK STATE
  // =============================================================================
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // =============================================================================
  // SUBTITLE INTERACTION STATE
  // =============================================================================
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState(-1);
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState(-1);
  const [editForm, setEditForm] = useState({
    start: "",
    end: "",
    text: "",
  });

  // =============================================================================
  // WAVEFORM VISUALIZATION STATE
  // =============================================================================
  const [waveformData, setWaveformData] = useState([]);
  const [waveformLoaded, setWaveformLoaded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCenter, setZoomCenter] = useState(0.5);

  // =============================================================================
  // DRAG & DROP STATE
  // =============================================================================
  const [isDragging, setIsDragging] = useState(false);
  const [dragInfo, setDragInfo] = useState({
    subtitleIndex: -1,
    edge: null,
    initialTime: 0,
    initialMouseX: 0,
  });
  const [hoveredRegion, setHoveredRegion] = useState({
    subtitleIndex: -1,
    edge: null,
  });

  // =============================================================================
  // UPLOAD STATE
  // =============================================================================
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // =============================================================================
  // PAGINATION STATE
  // =============================================================================
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  // =============================================================================
  // REFS
  // =============================================================================
  const videoRef = useRef(null);
  const audioInputRef = useRef(null);
  const canvasRef = useRef(null);

  // ============================================================================
  // 🎵 WAVEFORM VISUALIZATION & RENDERING
  // ============================================================================

  const generateMockWaveform = (duration) => {
    const samples = Math.floor(duration * 10);
    const data = [];
    for (let i = 0; i < samples; i++) {
      data.push(Math.random() * 0.8 + 0.1);
    }
    setWaveformData(data);
    setWaveformLoaded(true);
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData.length) return;

    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;

    // Clear canvas with background
    ctx.fillStyle = "#14203C";
    ctx.fillRect(0, 0, width, height);

    // Calculate visible range
    const totalSamples = waveformData.length;
    const visibleSamples = Math.floor(totalSamples / zoomLevel);
    const startSample = Math.floor(
      (totalSamples - visibleSamples) * zoomCenter
    );
    const endSample = Math.min(startSample + visibleSamples, totalSamples);

    const visibleData = waveformData.slice(startSample, endSample);
    const barWidth = width / visibleData.length;

    // Draw waveform bars
    visibleData.forEach((amplitude, index) => {
      const actualIndex = startSample + index;
      const barHeight = amplitude * height * 0.8;
      const x = index * barWidth;
      const y = (height - barHeight) / 2;

      const currentSample = Math.floor(
        (currentTime / (videoRef.current?.duration || 1)) * waveformData.length
      );

      ctx.fillStyle = actualIndex <= currentSample ? "#4c6397" : "#2a3a5c";
      ctx.fillRect(x, y, Math.max(barWidth - 1, 1), barHeight);
    });

    // Draw subtitle regions
    drawSubtitleRegions(
      ctx,
      width,
      height,
      startSample,
      endSample,
      totalSamples
    );

    // Draw playhead cursor
    drawPlayheadCursor(
      ctx,
      width,
      height,
      startSample,
      endSample,
      totalSamples
    );
  };

  const drawSubtitleRegions = (
    ctx,
    width,
    height,
    startSample,
    endSample,
    totalSamples
  ) => {
    if (srtData.length === 0 || !videoRef.current?.duration) return;

    const videoDuration = videoRef.current.duration;
    const visibleStartTime = (startSample / totalSamples) * videoDuration;
    const visibleEndTime = (endSample / totalSamples) * videoDuration;
    const visibleDuration = visibleEndTime - visibleStartTime;

    srtData.forEach((subtitle, index) => {
      const startTime = timeToSeconds(subtitle.start);
      const endTime = timeToSeconds(subtitle.end);

      if (endTime >= visibleStartTime && startTime <= visibleEndTime) {
        const startX = Math.max(
          0,
          ((startTime - visibleStartTime) / visibleDuration) * width
        );
        const endX = Math.min(
          width,
          ((endTime - visibleStartTime) / visibleDuration) * width
        );

        // Region background
        if (selectedSubtitleIndex === index) {
          ctx.fillStyle = "rgba(255, 215, 0, 0.4)";
        } else if (activeSubtitleIndex === index) {
          ctx.fillStyle = "rgba(0, 255, 0, 0.4)";
        } else {
          ctx.fillStyle = "rgba(54, 162, 235, 0.3)";
        }
        ctx.fillRect(startX, 0, endX - startX, height);

        // Edge handles
        drawSubtitleEdges(ctx, startX, endX, height, index);
      }
    });
  };

  const drawSubtitleEdges = (ctx, startX, endX, height, index) => {
    if (
      selectedSubtitleIndex === index ||
      hoveredRegion.subtitleIndex === index
    ) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.fillRect(startX - 2, 0, 4, height);
      ctx.fillRect(endX - 2, 0, 4, height);

      // Highlight dragged edges
      if (
        (hoveredRegion.subtitleIndex === index &&
          hoveredRegion.edge === "start") ||
        (dragInfo.subtitleIndex === index && dragInfo.edge === "start")
      ) {
        ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
        ctx.fillRect(startX - 3, 0, 6, height);
      }
      if (
        (hoveredRegion.subtitleIndex === index &&
          hoveredRegion.edge === "end") ||
        (dragInfo.subtitleIndex === index && dragInfo.edge === "end")
      ) {
        ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
        ctx.fillRect(endX - 3, 0, 6, height);
      }
    }
  };

  const drawPlayheadCursor = (
    ctx,
    width,
    height,
    startSample,
    endSample,
    totalSamples
  ) => {
    if (!videoRef.current?.duration) return;

    const videoDuration = videoRef.current.duration;
    const visibleStartTime = (startSample / totalSamples) * videoDuration;
    const visibleEndTime = (endSample / totalSamples) * videoDuration;

    if (currentTime >= visibleStartTime && currentTime <= visibleEndTime) {
      const visibleDuration = visibleEndTime - visibleStartTime;
      const cursorX =
        ((currentTime - visibleStartTime) / visibleDuration) * width;

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, height);
      ctx.stroke();
    }
  };

  const getCursorStyle = () => {
    if (isDragging) return "ew-resize";
    if (hoveredRegion.subtitleIndex !== -1) return "ew-resize";
    return "pointer";
  };

  // ============================================================================
  // 🖱️ MOUSE & CANVAS INTERACTION
  // ============================================================================

  const handleCanvasMouseMove = (e) => {
    if (!videoRef.current?.duration) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    if (isDragging && dragInfo.subtitleIndex !== -1) {
      handleSubtitleDrag(mouseX, rect.width);
    } else {
      const hoverInfo = getRegionEdgeHover(mouseX, rect.width);
      setHoveredRegion(hoverInfo);
    }
  };

  const handleSubtitleDrag = (mouseX, canvasWidth) => {
    const currentMouseTime = calculateMouseTime(mouseX, canvasWidth);
    const constraints = getTimeConstraints(dragInfo.subtitleIndex);
    const updatedSrtData = [...srtData];
    const subtitle = updatedSrtData[dragInfo.subtitleIndex];

    if (dragInfo.edge === "start") {
      const currentEndTime = timeToSeconds(subtitle.end);
      const newStartTime = Math.max(
        constraints.minTime,
        Math.min(currentMouseTime, currentEndTime - 0.1)
      );
      subtitle.start = secondsToSRTTime(newStartTime);
    } else if (dragInfo.edge === "end") {
      const currentStartTime = timeToSeconds(subtitle.start);
      const newEndTime = Math.min(
        constraints.maxTime,
        Math.max(currentMouseTime, currentStartTime + 0.1)
      );
      subtitle.end = secondsToSRTTime(newEndTime);
    }

    setSrtData(updatedSrtData);

    if (selectedSubtitleIndex === dragInfo.subtitleIndex) {
      setEditForm({
        start: subtitle.start,
        end: subtitle.end,
        text: subtitle.text,
      });
    }
  };

  const calculateMouseTime = (mouseX, canvasWidth) => {
    const totalSamples = waveformData.length;
    const visibleSamples = Math.floor(totalSamples / zoomLevel);
    const startSample = Math.floor(
      (totalSamples - visibleSamples) * zoomCenter
    );
    const endSample = Math.min(startSample + visibleSamples, totalSamples);

    const videoDuration = videoRef.current.duration;
    const visibleStartTime = (startSample / totalSamples) * videoDuration;
    const visibleEndTime = (endSample / totalSamples) * videoDuration;
    const visibleDuration = visibleEndTime - visibleStartTime;

    return visibleStartTime + (mouseX / canvasWidth) * visibleDuration;
  };

  const handleCanvasMouseDown = (e) => {
    if (!videoRef.current?.duration) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const hoverInfo = getRegionEdgeHover(mouseX, rect.width);

    if (hoverInfo.subtitleIndex !== -1) {
      setIsDragging(true);
      setDragInfo({
        subtitleIndex: hoverInfo.subtitleIndex,
        edge: hoverInfo.edge,
        initialMouseX: mouseX,
      });
      selectSubtitleForEdit(
        srtData[hoverInfo.subtitleIndex],
        hoverInfo.subtitleIndex
      );
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    setDragInfo({
      subtitleIndex: -1,
      edge: null,
      initialTime: 0,
      initialMouseX: 0,
    });
  };

  const handleCanvasClick = (e) => {
    if (isDragging || !videoRef.current?.duration) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Don't seek if clicking on an edge
    const hoverInfo = getRegionEdgeHover(x, rect.width);
    if (hoverInfo.subtitleIndex !== -1) return;

    const seekTime = calculateSeekTime(x, rect.width);
    videoRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);

    // Check for subtitle selection
    checkSubtitleSelection(seekTime);
  };

  const calculateSeekTime = (clickX, canvasWidth) => {
    const clickRatio = clickX / canvasWidth;
    const totalSamples = waveformData.length;
    const visibleSamples = Math.floor(totalSamples / zoomLevel);
    const startSample = Math.floor(
      (totalSamples - visibleSamples) * zoomCenter
    );
    const endSample = Math.min(startSample + visibleSamples, totalSamples);

    const visibleStartTime =
      (startSample / totalSamples) * videoRef.current.duration;
    const visibleEndTime =
      (endSample / totalSamples) * videoRef.current.duration;
    const visibleDuration = visibleEndTime - visibleStartTime;

    return visibleStartTime + clickRatio * visibleDuration;
  };

  const checkSubtitleSelection = (seekTime) => {
    srtData.forEach((subtitle, index) => {
      const startTime = timeToSeconds(subtitle.start);
      const endTime = timeToSeconds(subtitle.end);

      if (seekTime >= startTime && seekTime <= endTime) {
        selectSubtitleForEdit(subtitle, index);
      }
    });
  };

  // File drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };
  // ============================================================================
  // 🔍 ZOOM & NAVIGATION CONTROLS
  // ============================================================================

  const handleWaveformWheel = (e) => {
    if (!e.ctrlKey) return;

    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseRatio = mouseX / rect.width;

    const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoomLevel = Math.max(1, Math.min(10000, zoomLevel * zoomDelta));

    if (newZoomLevel !== zoomLevel) {
      const newZoomCenter = calculateZoomCenter(mouseRatio, newZoomLevel);
      setZoomLevel(newZoomLevel);
      setZoomCenter(newZoomCenter);
    }
  };

  const calculateZoomCenter = (mouseRatio, newZoomLevel) => {
    const totalSamples = waveformData.length;
    const visibleSamples = Math.floor(totalSamples / zoomLevel);
    const startSample = Math.floor(
      (totalSamples - visibleSamples) * zoomCenter
    );
    const currentMouseSample = startSample + mouseRatio * visibleSamples;

    const newVisibleSamples = Math.floor(totalSamples / newZoomLevel);
    return Math.max(
      0,
      Math.min(
        1,
        (currentMouseSample - mouseRatio * newVisibleSamples) /
          (totalSamples - newVisibleSamples)
      )
    );
  };

  const handleSliderChange = (e) => {
    const value = parseFloat(e.target.value);
    setZoomCenter(value);
  };

  const getScrollbarProps = () => {
    const visibleRatio = 1 / zoomLevel;
    const thumbWidth = Math.max(visibleRatio * 100, 5);
    const isScrollable = zoomLevel > 1;

    return { isScrollable, thumbWidth, visibleRatio };
  };

  const renderScrollControls = () => {
    const { isScrollable, thumbWidth } = getScrollbarProps();
    if (!isScrollable) return null;

    return (
      <div className="mt-2 w-full space-y-2">
        <div className="flex items-center space-x-2">
          <span className="text-xs text-black opacity-60">Start</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={zoomCenter}
            onChange={handleSliderChange}
            className="flex-1 h-2 bg-black bg-opacity-30 rounded-lg appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-300 [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
                   [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full 
                   [&::-moz-range-thumb]:bg-amber-300 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none"
          />
          <span className="text-xs text-black opacity-60">End</span>
        </div>
      </div>
    );
  };

  // ============================================================================
  // ⏱️ TIME & SUBTITLE UTILITIES
  // ============================================================================

  const timeToSeconds = (timeStr) => {
    const [time, ms] = timeStr.split(/[,\.]/);
    const [hours, minutes, seconds] = time.split(":").map(Number);
    return hours * 3600 + minutes * 60 + seconds + parseInt(ms) / 1000;
  };

  const secondsToSRTTime = (seconds) => {
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

  const formatTimeForDisplay = (timeStr) => {
    if (!timeStr) return "";
    const seconds = timeToSeconds(timeStr);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const getTimeConstraints = (subtitleIndex) => {
    let minTime = 0;
    let maxTime = videoRef.current?.duration || 0;

    // Find previous subtitle end time as minimum constraint
    for (let i = 0; i < srtData.length; i++) {
      if (i < subtitleIndex) {
        const endTime = timeToSeconds(srtData[i].end);
        minTime = Math.max(minTime, endTime + 0.1); // 100ms minimum gap
      }
    }

    // Find next subtitle start time as maximum constraint
    for (let i = 0; i < srtData.length; i++) {
      if (i > subtitleIndex) {
        const startTime = timeToSeconds(srtData[i].start);
        maxTime = Math.min(maxTime, startTime - 0.1); // 100ms minimum gap
      }
    }

    return { minTime, maxTime };
  };

  const getRegionEdgeHover = (mouseX, canvasWidth) => {
    if (!videoRef.current?.duration || srtData.length === 0) {
      return { subtitleIndex: -1, edge: null };
    }

    const totalSamples = waveformData.length;
    const visibleSamples = Math.floor(totalSamples / zoomLevel);
    const startSample = Math.floor(
      (totalSamples - visibleSamples) * zoomCenter
    );
    const endSample = Math.min(startSample + visibleSamples, totalSamples);

    const videoDuration = videoRef.current.duration;
    const visibleStartTime = (startSample / totalSamples) * videoDuration;
    const visibleEndTime = (endSample / totalSamples) * videoDuration;
    const visibleDuration = visibleEndTime - visibleStartTime;

    const mouseTime =
      visibleStartTime + (mouseX / canvasWidth) * visibleDuration;
    const edgeThreshold = (visibleDuration / canvasWidth) * 8; // 8 pixels threshold

    for (let i = 0; i < srtData.length; i++) {
      const subtitle = srtData[i];
      const startTime = timeToSeconds(subtitle.start);
      const endTime = timeToSeconds(subtitle.end);

      // Check if subtitle is visible
      if (endTime >= visibleStartTime && startTime <= visibleEndTime) {
        // Check start edge
        if (Math.abs(mouseTime - startTime) <= edgeThreshold) {
          return { subtitleIndex: i, edge: "start" };
        }
        // Check end edge
        if (Math.abs(mouseTime - endTime) <= edgeThreshold) {
          return { subtitleIndex: i, edge: "end" };
        }
      }
    }

    return { subtitleIndex: -1, edge: null };
  };

  // ============================================================================
  // 📝 SUBTITLE DATA MANAGEMENT
  // ============================================================================

  const selectSubtitleForEdit = (subtitle, index) => {
    setSelectedSubtitleIndex(index);
    setEditForm({
      start: subtitle.start,
      end: subtitle.end,
      text: subtitle.text,
    });
    jumpToSubtitle(subtitle);
  };

  const jumpToSubtitle = (subtitle) => {
    if (videoRef.current) {
      const startTime = timeToSeconds(subtitle.start);
      videoRef.current.currentTime = startTime;
      setCurrentTime(startTime);
    }
  };

  const handleFormChange = (field, value) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveChanges = () => {
    if (selectedSubtitleIndex === -1) {
      alert("Please select a subtitle to edit");
      return;
    }

    if (!validateSubtitleForm()) return;

    const updatedSrtData = [...srtData];
    updatedSrtData[selectedSubtitleIndex] = {
      ...updatedSrtData[selectedSubtitleIndex],
      start: editForm.start,
      end: editForm.end,
      text: editForm.text.trim(),
    };

    setSrtData(updatedSrtData);
    alert("Subtitle updated successfully!");
  };

  const validateSubtitleForm = () => {
    if (!editForm.start || !editForm.end || !editForm.text.trim()) {
      alert("Please fill in all fields");
      return false;
    }

    const timeRegex = /^\d{2}:\d{2}:\d{2}[,\.]\d{3}$/;
    if (!timeRegex.test(editForm.start) || !timeRegex.test(editForm.end)) {
      alert("Please use correct timestamp format: HH:MM:SS,mmm");
      return false;
    }

    return true;
  };

  // ============================================================================
  // 📁 FILE PROCESSING & I/O
  // ============================================================================

  const parseSRT = (content) => {
    const normalizedContent = content
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();

    const blocks = normalizedContent.split(/\n\s*\n/);
    const parsed = [];

    blocks.forEach((block, blockIndex) => {
      if (!block.trim()) return;

      const lines = block.trim().split("\n");
      if (lines.length >= 3) {
        const subtitle = parseSubtitleBlock(lines, blockIndex);
        if (subtitle) parsed.push(subtitle);
      }
    });

    return parsed;
  };

  const parseSubtitleBlock = (lines, blockIndex) => {
    const sequenceLine = lines[0].trim();
    const id = parseInt(sequenceLine) || blockIndex + 1;
    const timeLine = lines[1].trim();
    const textLines = lines.slice(2);
    const text = textLines.join(" ").trim();

    const timeRegex =
      /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/;
    const timeMatch = timeLine.match(timeRegex);

    if (timeMatch && text) {
      return {
        id: id,
        start: timeMatch[1].replace(".", ","),
        end: timeMatch[2].replace(".", ","),
        text: text,
      };
    }

    return null;
  };

  const generateSRTContent = () => {
    return srtData
      .map((subtitle) => {
        return `${subtitle.id}\n${subtitle.start} --> ${subtitle.end}\n${subtitle.text}\n`;
      })
      .join("\n");
  };

  const downloadSRT = (filename = "subtitles.srt") => {
    if (srtData.length === 0) {
      alert("No subtitle data to download. Please upload an SRT file first.");
      return;
    }

    const srtContent = generateSRTContent();
    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const handleSRTFileInput = (e) => {
    const file = e.target.files[0];
    if (file && file.name.toLowerCase().endsWith(".srt")) {
      processSRTFile(file);
    }
  };

  const handleSRTDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const srtFile = files.find((file) =>
      file.name.toLowerCase().endsWith(".srt")
    );

    if (srtFile) {
      processSRTFile(srtFile);
    } else {
      alert("Please upload a valid .srt file");
    }
  };

  const processSRTFile = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      const parsed = parseSRT(content);
      setSrtData(parsed);
    };
    reader.readAsText(file);
  };

  // ============================================================================
  // 🎬 VIDEO MANAGEMENT
  // ============================================================================

  const handleVideoUpload = (file) => {
    if (file && file.type.startsWith("video/")) {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }

      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
    } else {
      alert("Please select a valid video file");
    }
  };

  const handleVideoDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const videoFile = files.find((file) => file.type.startsWith("video/"));

    if (videoFile) {
      handleVideoUpload(videoFile);
    }
  };

  const handleVideoFileInput = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleVideoUpload(file);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  // ============================================================================
  // 🎤 AUDIO PROCESSING & TRANSCRIPTION
  // ============================================================================

  const handleAudioUpload = async (file) => {
    if (!file) return;

    const validationResult = validateAudioFile(file);
    if (!validationResult.isValid) {
      setUploadError(validationResult.error);
      return;
    }

    setIsUploading(true);
    setUploadError("");
    setUploadSuccess(false);
    setUploadProgress(0);

    // simulateTranscription();

    const formData = new FormData();
    formData.append("audio", file);

    try {
      const response = await axios.post(
        "http://localhost:5000/upload",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          responseType: "blob",
          timeout: 0,
          onUploadProgress: (progressEvent) => {
            const progress = Math.round(
              (progressEvent.loaded * 70) / progressEvent.total
            );
            setUploadProgress(progress);
          },
        }
      );

      setUploadProgress(85);

      const srtBlob = new Blob([response.data], {
        type: "text/plain;charset=utf-8",
      });

      setUploadProgress(95);

      const url = URL.createObjectURL(srtBlob);

      const link = document.createElement("a");
      link.href = url;
      link.download = file.name.replace(/\.[^/.]+$/, "") + "_transcription.srt";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);

      const srtText = await srtBlob.text();
      const parsedSRT = parseSRT(srtText);
      setSrtData(parsedSRT);

      const transcriptionText = parsedSRT.map((s) => s.text).join(" ");
      setGeneratedTranscription(transcriptionText);
      setUploadProgress(100);
      setIsUploading(false);
      setUploadSuccess(true);
      console.log('Response received:', response);
    } catch (error) {
      setIsUploading(false);
      if (error.code === "ECONNABORTED") {
        setUploadError("Transcription timed out. Please try again.");
      } else {
        setUploadError(
          error.response?.data?.message ||
            "An error occurred during transcription. Please try again."
        );
      }
    }
  };

  const validateAudioFile = (file) => {
    const allowedTypes = [
      "audio/wav",
      "audio/mp3",
      "audio/mpeg",
      "audio/m4a",
      "audio/flac",
      "audio/ogg",
      "audio/webm",
      "audio/aac",
    ];
    const allowedExtensions = [
      "wav",
      "mp3",
      "mp4",
      "m4a",
      "flac",
      "ogg",
      "webm",
      "aac",
    ];
    const fileExtension = file.name.split(".").pop().toLowerCase();

    if (
      !allowedTypes.includes(file.type) &&
      !allowedExtensions.includes(fileExtension)
    ) {
      return {
        isValid: false,
        error:
          "Please upload a valid audio file (WAV, MP3, M4A, FLAC, OGG, WEBM, AAC)",
      };
    }

    if (file.size > 1000 * 1024 * 1024) {
      return {
        isValid: false,
        error: "File size must be less than 1GB",
      };
    }

    return { isValid: true };
  };

  const handleAudioFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAudioFile(file);
      handleAudioUpload(file);
    }
  };

  const handleAudioDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const audioFile = files.find(
      (file) =>
        file.type.startsWith("audio/") ||
        ["wav", "mp3", "mp4", "m4a", "flac", "ogg", "webm", "aac"].includes(
          file.name.split(".").pop().toLowerCase()
        )
    );

    if (audioFile) {
      setAudioFile(audioFile);
      handleAudioUpload(audioFile);
    } else {
      setUploadError("Please drop a valid audio file");
    }
  };

  // ============================================================================
  // 📊 DATA & STATE MANAGEMENT (useEffect hooks)
  // ============================================================================

  useEffect(() => {
    if (videoRef.current && videoUrl) {
      const video = videoRef.current;

      const handleLoadedMetadata = () => {
        generateMockWaveform(video.duration);
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata);

      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      };
    }
  }, [videoUrl]);

  useEffect(() => {
    if (waveformLoaded) {
      drawWaveform();
    }
  }, [
    waveformLoaded,
    waveformData,
    currentTime,
    srtData,
    activeSubtitleIndex,
    selectedSubtitleIndex,
    zoomLevel,
    zoomCenter,
    hoveredRegion,
    isDragging,
    dragInfo,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheelEvent = (e) => {
      e.preventDefault(); // This will work now
      e.stopPropagation();

      // Your existing zoom logic here
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const relativeX = mouseX / rect.width;

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoomLevel = Math.max(1, zoomLevel * zoomFactor);

      if (newZoomLevel !== zoomLevel) {
        const newVisibleRatio = 1 / newZoomLevel;
        const oldVisibleRatio = 1 / zoomLevel;

        let newZoomCenter = zoomCenter;
        if (newZoomLevel > 1) {
          const zoomPoint = zoomCenter + (relativeX - 0.5) * oldVisibleRatio;
          newZoomCenter = Math.max(
            0,
            Math.min(1 - newVisibleRatio, zoomPoint - newVisibleRatio * 0.5)
          );
        } else {
          newZoomCenter = 0.5;
        }

        setZoomLevel(newZoomLevel);
        setZoomCenter(newZoomCenter);
      }
    };

    // Add event listener with passive: false
    canvas.addEventListener("wheel", handleWheelEvent, { passive: false });

    // Cleanup
    return () => {
      canvas.removeEventListener("wheel", handleWheelEvent);
    };
  }, [zoomLevel, zoomCenter]);

  useEffect(() => {
    if (srtData.length === 0) return;

    const activeIndex = srtData.findIndex((subtitle) => {
      const startTime = timeToSeconds(subtitle.start);
      const endTime = timeToSeconds(subtitle.end);
      return currentTime >= startTime && currentTime <= endTime;
    });

    setActiveSubtitleIndex(activeIndex);
  }, [currentTime, srtData]);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const data = Array.from({ length: 23 }, (_, i) => ({
    id: i + 1,
    filename: `subtitle_file_${i + 1}.srt`,
    editedBy: `editor_${(i % 5) + 1}`,
    createdAt: new Date(Date.now() - i * 86400000).toLocaleDateString("en-US"),
  }));

  const totalPages = Math.ceil(data.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentData = data.slice(startIndex, startIndex + rowsPerPage);

  return (
    <div className="bg-[#14203C] min-h-screen p-8">
      <div className="bg-[#09091e] rounded-md p-5 text-center">
        <div className="text-[#b5b3b3] text-5xl font-bold pb-4">
          Video Transcriber
        </div>
        <div className="text-[#b5b3b3] text-xl font-semibold pb-4">
          Select the video and srt file that you want to evaluate and adjust it
          as you wish
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            {videoUrl ? (
              <div className="bg-black rounded-xl overflow-hidden relative h-96">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  controls
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={handlePlay}
                  onPause={handlePause}
                />

                {activeSubtitleIndex >= 0 && srtData[activeSubtitleIndex] && (
                  <div className="absolute bottom-16 left-0 right-0 text-center px-4">
                    <div className="inline-block bg-black bg-opacity-75 text-white px-4 py-2 rounded text-lg font-medium max-w-4xl">
                      {srtData[activeSubtitleIndex].text}
                    </div>
                  </div>
                )}

                <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-3 py-2 rounded text-sm">
                  <div className="font-medium">{videoFile.name}</div>
                  <div className="text-xs text-gray-300">
                    {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>

                <div className="absolute top-4 right-4">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleVideoFileInput}
                      className="hidden"
                    />
                    <span className="inline-flex items-center px-3 py-2 bg-blue-600 bg-opacity-90 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors">
                      Change Video
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div
                className="group border-2 border-dashed border-[#b5b3b3] rounded-xl h-96 hover:border-[#ffffff] hover:cursor-pointer transition-colors duration-[500ms] flex flex-col items-center justify-center text-center relative"
                onDrop={handleVideoDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <div className="text-[#b5b3b3] group-hover:text-[#ffffff] mb-4 transition-colors duration-[500ms]">
                  <svg
                    className="w-16 h-16 mx-auto"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-[#b5b3b3] group-hover:text-[#ffffff] text-lg font-semibold transition-colors duration-[500ms] mb-2">
                  Upload Video
                </h3>
                <p className="text-[#b5b3b3] group-hover:text-[#ffffff] transition-colors duration-[500ms] mb-4">
                  Click to select the video or drag and drop it from your local
                </p>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoFileInput}
                    className="hidden"
                  />
                  <span className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors">
                    Browse Videos
                  </span>
                </label>
              </div>
            )}

            <div className="bg-gradient-to-r from-amber-400 to-amber-500 h-36 rounded-xl mt-4 flex items-center relative overflow-hidden">
              {videoUrl ? (
                <>
                  <div className="absolute inset-0 bg-black bg-opacity-20"></div>
                  <div className="relative z-10 w-full p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-black font-semibold text-sm">
                        Audio Waveform with Subtitle Regions
                      </h3>
                      <div className="text-xs text-black opacity-80">
                        Zoom: {zoomLevel.toFixed(1)}x
                      </div>
                    </div>

                    <div className="w-full bg-black bg-opacity-30 rounded h-16 relative">
                      <canvas
                        ref={canvasRef}
                        width={800}
                        height={64}
                        className="w-full h-full"
                        style={{
                          display: waveformLoaded ? "block" : "none",
                          cursor: getCursorStyle(),
                        }}
                        onClick={handleCanvasClick}
                        onMouseDown={handleCanvasMouseDown}
                        onMouseUp={handleCanvasMouseUp}
                        onMouseMove={handleCanvasMouseMove}
                        onMouseLeave={() => {
                          setHoveredRegion({ subtitleIndex: -1, edge: null });
                          setIsDragging(false);
                        }}
                        onWheel={handleWaveformWheel}
                      />
                      {!waveformLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-white text-sm">
                            Loading waveform...
                          </div>
                        </div>
                      )}
                    </div>

                    {renderScrollControls()}
                  </div>
                </>
              ) : (
                <div className="w-full flex items-center justify-center">
                  <div className="text-center">
                    <svg
                      className="w-8 h-8 mx-auto mb-2 text-black opacity-60"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                      />
                    </svg>
                    <p className="text-black opacity-80 text-sm font-medium">
                      Audio waveform will appear here once video is loaded
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="">
            <div
              className={`h-[500px] border-2 border-dashed rounded-lg overflow-hidden flex flex-col shadow-sm transition-all duration-300 ${
                isDragging
                  ? "border-blue-400 bg-blue-50"
                  : srtData.length > 0
                  ? "border-gray-300 bg-white"
                  : "border-gray-400 bg-gray-50"
              }`}
              onDrop={handleSRTDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white grid grid-cols-4 border-b border-gray-300 flex-shrink-0">
                <div className="p-2 text-xs font-semibold border-r border-blue-500 flex items-center justify-center">
                  No
                </div>
                <div className="p-2 text-xs font-semibold border-r border-blue-500 flex items-center justify-center">
                  Start
                </div>
                <div className="p-2 text-xs font-semibold border-r border-blue-500 flex items-center justify-center">
                  End
                </div>
                <div className="p-2 text-xs font-semibold flex items-center justify-center">
                  Text
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-white">
                {srtData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <div className="text-gray-400 mb-4">
                      <svg
                        className="w-12 h-12 mx-auto mb-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-gray-600 mb-1">
                      No SRT file uploaded
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Drag and drop your .srt file here
                    </p>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".srt"
                        onChange={handleSRTFileInput}
                        className="hidden"
                      />
                      <span className="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors">
                        Browse Files
                      </span>
                    </label>
                  </div>
                ) : (
                  <>
                    {srtData.map((item, index) => (
                      <div
                        key={`${item.id}-${index}`}
                        className={`grid grid-cols-4 border-b border-gray-100 hover:bg-blue-50 transition-colors duration-150 cursor-pointer ${
                          index % 2 === 0 ? "bg-white" : "bg-gray-50"
                        } ${
                          activeSubtitleIndex === index
                            ? "bg-blue-100 border-blue-300"
                            : ""
                        } ${
                          selectedSubtitleIndex === index
                            ? "bg-green-100 border-green-300 ring-2 ring-green-200"
                            : ""
                        }`}
                        onClick={() => selectSubtitleForEdit(item, index)}
                        title="Click to select and edit this subtitle"
                      >
                        <div className="p-2 text-xs text-gray-600 border-r border-gray-200 flex items-center justify-center font-mono">
                          {String(item.id).padStart(2, "0")}
                        </div>
                        <div className="p-2 text-xs text-gray-800 border-r border-gray-200 flex items-center justify-center font-mono">
                          {item.start}
                        </div>
                        <div className="p-2 text-xs text-gray-800 border-r border-gray-200 flex items-center justify-center font-mono">
                          {item.end}
                        </div>
                        <div className="p-2 text-xs text-gray-800 flex items-start">
                          <span className="line-clamp-3 text-left">
                            {item.text}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {srtData.length > 0 && (
              <div className="mt-2 text-xs text-gray-400 text-center">
                {srtData.length} subtitle entries loaded
                {activeSubtitleIndex >= 0 && (
                  <span className="ml-2 text-blue-400">
                    • Active: #{activeSubtitleIndex + 1}
                  </span>
                )}
                {selectedSubtitleIndex >= 0 && (
                  <span className="ml-2 text-green-400">
                    • Editing: #{selectedSubtitleIndex + 1}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="col-span-2">
            <h2 className="text-lg text-white font-bold mb-4">Text Detail</h2>
            {selectedSubtitleIndex >= 0 ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <div className="text-white mb-2 flex items-center">
                      <span className="w-16">Starts:</span>
                      <span className="text-gray-300 text-sm ml-2">
                        ({formatTimeForDisplay(editForm.start)})
                      </span>
                    </div>
                    <input
                      type="text"
                      value={editForm.start}
                      onChange={(e) =>
                        handleFormChange("start", e.target.value)
                      }
                      className="w-full p-2 border-2 border-white bg-transparent text-white rounded focus:border-blue-400 focus:outline-none"
                      placeholder="00:02:30,000"
                    />
                  </div>

                  <div>
                    <div className="text-white mb-2 flex items-center">
                      <span className="w-16">Ends:</span>
                      <span className="text-gray-300 text-sm ml-2">
                        ({formatTimeForDisplay(editForm.end)})
                      </span>
                    </div>
                    <input
                      type="text"
                      value={editForm.end}
                      onChange={(e) => handleFormChange("end", e.target.value)}
                      className="w-full p-2 border-2 border-white bg-transparent text-white rounded focus:border-blue-400 focus:outline-none"
                      placeholder="00:02:35,000"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-white mb-2">Text:</div>
                  <textarea
                    value={editForm.text}
                    onChange={(e) => handleFormChange("text", e.target.value)}
                    className="w-full h-32 p-2 border-2 border-white bg-transparent text-white rounded focus:border-blue-400 focus:outline-none resize-none"
                    placeholder="Enter subtitle text here..."
                  />
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400 py-8">
                <div className="text-4xl mb-4">📝</div>
                <p className="text-lg">No subtitle selected</p>
                <p className="text-sm">
                  Click on any subtitle row above to start editing
                </p>
              </div>
            )}

            {selectedSubtitleIndex >= 0 && (
              <div className="mt-4 flex justify-center gap-3 p-3">
                <button
                  onClick={handleSaveChanges}
                  className="px-6 py-2 bg-[#14203C] hover:bg-[#0d245c] hover:cursor-pointer text-white font-semibold rounded transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => {
                    setSelectedSubtitleIndex(-1);
                    setEditForm({ start: "", end: "", text: "" });
                  }}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-700 hover:cursor-pointer text-white font-semibold rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
            <button
              onClick={() => downloadSRT()}
              disabled={srtData.length === 0}
              className={`px-8 py-3 font-semibold rounded-lg transition-all duration-200 ${
                srtData.length === 0
                  ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                  : "bg-[#1848b8] hover:bg-[#0d245c] hover:cursor-pointer text-white hover:scale-105 shadow-lg hover:shadow-xl"
              }`}
            >
              {srtData.length === 0
                ? "No SRT to Download"
                : "Download Updated SRT"}
            </button>
          </div>
          <div>
            <h3 className=" text-lg text-white font-bold mb-4">
              Editted Transcription Log
            </h3>
            <div className="bg-[#5f719b] rounded-xl">
              <div className="rounded-xl shadow overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#253456] text-white">
                    <tr>
                      <th className="p-3 border-b text-center w-12">No</th>
                      <th className="p-3 border-b">Details</th>
                      <th className="p-3 border-b text-right">Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentData.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-[#7686ad] hover:cursor-pointer"
                      >
                        <td className="p-3 border-b text-center">{item.id}</td>

                        <td className="p-3 border-b">
                          <div className="flex flex-col">
                            <span className="font-semibold">
                              {item.filename}
                            </span>
                            <span className="text-sm text-gray-200">
                              Edited by: {item.editedBy}
                            </span>
                          </div>
                        </td>

                        <td className="p-3 border-b text-right">
                          {item.createdAt}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-center my-4 space-x-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 rounded-lg bg-[#14203C] text-white disabled:opacity-50"
                  >
                    Prev
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i + 1)}
                      className={`px-3 py-1 rounded-lg ${
                        currentPage === i + 1
                          ? "bg-[#14203C] text-white"
                          : "bg-[#7686ad] text-[#14203C]"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}

                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(p + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 rounded-lg bg-[#14203C] text-white disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-[#b5b3b3] my-20"></div>
        <div className="max-w-4xl mx-auto p-8">
          <div className="text-center mb-12">
            <h1 className="bg-gradient-to-r from-[#14203C] via-[#19195e] to-[#1848b8] bg-clip-text text-transparent text-6xl font-black mb-6 tracking-tight">
              Generate Transcribe
            </h1>
            <p className="text-gray-300 text-xl font-medium leading-relaxed max-w-2xl mx-auto">
              Let AI automatically generate you the transcript file in SRT
              format by uploading the audio that you desired
            </p>
          </div>

          <div className="relative">
            <div
              className={`group relative p-12 border-2 border-dashed rounded-2xl backdrop-blur-sm transition-all duration-300 ease-out cursor-pointer overflow-hidden ${
                isUploading
                  ? "border-blue-500 bg-gradient-to-br from-blue-900/30 to-blue-800/20 pointer-events-none"
                  : uploadSuccess
                  ? "border-green-500 bg-gradient-to-br from-green-900/30 to-green-800/20"
                  : uploadError
                  ? "border-red-500 bg-gradient-to-br from-red-900/30 to-red-800/20"
                  : "border-gray-600 bg-gradient-to-br from-gray-900/50 to-gray-800/30 hover:border-purple-400 hover:bg-gradient-to-br hover:from-[#14203C] hover:to-[#061946]"
              }`}
              onDrop={handleAudioDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !isUploading && audioInputRef.current?.click()}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>

              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.webm,.aac"
                onChange={handleAudioFileSelect}
                className="hidden"
                disabled={isUploading}
              />

              <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-6">
                {isUploading ? (
                  <>
                    <div className="w-20 h-20 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center animate-pulse">
                      <svg
                        className="w-10 h-10 text-white animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-blue-400">
                      Processing Audio...
                    </h3>
                    <div className="w-full max-w-md">
                      <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-300 ease-out"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-gray-400 text-sm mt-2">
                        {uploadProgress}% complete
                      </p>
                    </div>
                    {audioFile && (
                      <p className="text-gray-400 text-sm">
                        Processing: {audioFile.name}
                      </p>
                    )}
                  </>
                ) : uploadSuccess ? (
                  <>
                    <div className="w-20 h-20 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center">
                      <svg
                        className="w-10 h-10 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-green-400">
                      Transcription Complete!
                    </h3>
                    <p className="text-gray-300">
                      Your SRT file has been generated and downloaded
                      automatically.
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadSuccess(false);
                        setAudioFile(null);
                        setGeneratedTranscription("");
                      }}
                      className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold rounded-full hover:from-green-600 hover:to-green-700 transition-all duration-200"
                    >
                      Upload Another File
                    </button>
                  </>
                ) : uploadError ? (
                  <>
                    <div className="w-20 h-20 rounded-full bg-gradient-to-r from-red-500 to-red-600 flex items-center justify-center">
                      <svg
                        className="w-10 h-10 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-red-400">
                      Upload Failed
                    </h3>
                    <p className="text-gray-300 max-w-md">{uploadError}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadError("");
                        setAudioFile(null);
                      }}
                      className="px-6 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-full hover:from-red-600 hover:to-red-700 transition-all duration-200"
                    >
                      Try Again
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#14203C] to-[#061946] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <svg
                        className="w-10 h-10 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                    </div>

                    <h3 className="text-2xl font-bold text-white group-hover:text-purple-300 transition-colors duration-300">
                      Upload Audio File
                    </h3>

                    <div className="space-y-2">
                      <p className="text-gray-400 text-lg font-medium">
                        Select the audio that will be transcribed by clicking to
                        upload or drag the audio file
                      </p>
                      <p className="text-sm text-gray-500 bg-gray-800/50 rounded-full px-4 py-2 inline-block">
                        Supported formats: MP3, WAV, M4A, FLAC, OGG, WEBM, AAC
                      </p>
                    </div>

                    <button className="mt-6 px-8 py-3 bg-gradient-to-r from-[#14203C] to-[#061946] text-white font-semibold rounded-full hover:from-[#14203C] hover:to-[#061946] transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-blue-500/25">
                      Choose File
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-gray-500 text-sm">
              Maximum file size: 1GB • Processing time: varies by file size
            </p>
            <p className="text-xs text-gray-600 mt-2">
              This demo uses simulated waveform visualization
            </p>
          </div>

          {generatedTranscription && (
            <div className="mt-8 p-6 bg-gray-800/50 rounded-xl border border-gray-600">
              <h3 className="text-white text-lg font-semibold mb-4">
                Generated Transcription:
              </h3>
              <div className="bg-gray-900/50 rounded-lg p-4 max-h-40 overflow-y-auto">
                <p className="text-gray-300 text-sm leading-relaxed">
                  {generatedTranscription}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
