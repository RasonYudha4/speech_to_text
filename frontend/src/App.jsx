import { useState, useRef, useEffect } from "react";
import axios from "axios";

function App() {
  const [count, setCount] = useState(0);
  const [srtData, setSrtData] = useState([]);
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState(-1);
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState(-1);
  const [editForm, setEditForm] = useState({
    start: "",
    end: "",
    text: "",
  });

  // Audio upload states
  const [audioFile, setAudioFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [generatedTranscription, setGeneratedTranscription] = useState("");

  const videoRef = useRef(null);
  const audioInputRef = useRef(null);

  // Convert timestamp to seconds
  const timeToSeconds = (timeStr) => {
    const [time, ms] = timeStr.split(/[,\.]/);
    const [hours, minutes, seconds] = time.split(":").map(Number);
    return hours * 3600 + minutes * 60 + seconds + parseInt(ms) / 1000;
  };

  // Generate SRT file content
  const generateSRTContent = () => {
    return srtData
      .map((subtitle, index) => {
        return `${subtitle.id}\n${subtitle.start} --> ${subtitle.end}\n${subtitle.text}\n`;
      })
      .join("\n");
  };

  // Download SRT file
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

  // Handle audio file upload
  const handleAudioUpload = async (file) => {
    if (!file) return;

    // Validate file type
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
      setUploadError(
        "Please upload a valid audio file (WAV, MP3, M4A, FLAC, OGG, WEBM, AAC)"
      );
      return;
    }

    if (file.size > 1000 * 1024 * 1024) {
      setUploadError("File size must be less than 1GB");
      return;
    }

    setIsUploading(true);
    setUploadError("");
    setUploadSuccess(false);
    setUploadProgress(0);

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

      const transcriptionText = parsedSRT
        .map((segment) => segment.text)
        .join(" ");
      setGeneratedTranscription(transcriptionText);

      setUploadProgress(100);
      setIsUploading(false);
      setUploadSuccess(true);
    } catch (error) {
      setIsUploading(false);

      if (error.code === "ECONNABORTED") {
        setUploadError("Upload timed out. Please try again.");
      } else if (error.response) {
        if (error.response.data instanceof Blob) {
          try {
            const errorText = await error.response.data.text();
            try {
              const errorData = JSON.parse(errorText);
              setUploadError(
                errorData.error || `Server error: ${error.response.status}`
              );
            } catch {
              setUploadError(
                errorText || `Server error: ${error.response.status}`
              );
            }
          } catch {
            setUploadError(`Server error: ${error.response.status}`);
          }
        } else {
          setUploadError(
            error.response.data?.error ||
              `Server error: ${error.response.status}`
          );
        }
      } else if (error.request) {
        setUploadError("Network error - make sure the server is running");
      } else {
        setUploadError("An unexpected error occurred: " + error.message);
      }
    }
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

  useEffect(() => {
    if (srtData.length === 0) return;

    const activeIndex = srtData.findIndex((subtitle) => {
      const startTime = timeToSeconds(subtitle.start);
      const endTime = timeToSeconds(subtitle.end);
      return currentTime >= startTime && currentTime <= endTime;
    });

    setActiveSubtitleIndex(activeIndex);
  }, [currentTime, srtData]);

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
        const sequenceLine = lines[0].trim();
        const id = parseInt(sequenceLine) || blockIndex + 1;

        const timeLine = lines[1].trim();

        const textLines = lines.slice(2);
        const text = textLines.join(" ").trim();

        const timeRegex =
          /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/;
        const timeMatch = timeLine.match(timeRegex);

        if (timeMatch && text) {
          const startTime = timeMatch[1].replace(".", ",");
          const endTime = timeMatch[2].replace(".", ",");

          parsed.push({
            id: id,
            start: startTime,
            end: endTime,
            text: text,
          });
        }
      }
    });

    return parsed;
  };

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

  const handleSRTDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const srtFile = files.find((file) =>
      file.name.toLowerCase().endsWith(".srt")
    );

    if (srtFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        const parsed = parseSRT(content);
        setSrtData(parsed);
      };
      reader.readAsText(srtFile);
    } else {
      alert("Please upload a valid .srt file");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleSRTFileInput = (e) => {
    const file = e.target.files[0];
    if (file && file.name.toLowerCase().endsWith(".srt")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        const parsed = parseSRT(content);
        setSrtData(parsed);
      };
      reader.readAsText(file);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  const jumpToSubtitle = (subtitle) => {
    if (videoRef.current) {
      const startTime = timeToSeconds(subtitle.start);
      videoRef.current.currentTime = startTime;
      setCurrentTime(startTime);
    }
  };

  const selectSubtitleForEdit = (subtitle, index) => {
    setSelectedSubtitleIndex(index);
    setEditForm({
      start: subtitle.start,
      end: subtitle.end,
      text: subtitle.text,
    });
    jumpToSubtitle(subtitle);
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

    if (!editForm.start || !editForm.end || !editForm.text.trim()) {
      alert("Please fill in all fields");
      return;
    }

    const timeRegex = /^\d{2}:\d{2}:\d{2}[,\.]\d{3}$/;
    if (!timeRegex.test(editForm.start) || !timeRegex.test(editForm.end)) {
      alert("Please use correct timestamp format: HH:MM:SS,mmm");
      return;
    }

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

  const formatTimeForDisplay = (timeStr) => {
    if (!timeStr) return "";
    const seconds = timeToSeconds(timeStr);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  return (
    <>
      <div className="bg-[#14203C] min-h-screen p-8">
        <div className="bg-[#09091e] rounded-md p-5 text-center">
          <div className="text-[#b5b3b3] text-5xl font-bold pb-4">
            Video Transcriber
          </div>
          <div className="text-[#b5b3b3] text-xl font-semibold pb-4">
            Select the video and srt file that you want to evaluate and adjust
            it as you wish
          </div>

          <div className="grid grid-cols-3 ">
            <div className="col-span-2 p-3">
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
                    Click to select the video or drag and drop it from your
                    local
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
            </div>

            <div className="p-3">
              <div
                className={`h-96 border-2 border-dashed rounded-lg overflow-hidden flex flex-col shadow-sm transition-all duration-300 ${
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

            <div className="col-span-3 p-3">
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
                        onChange={(e) =>
                          handleFormChange("end", e.target.value)
                        }
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
                <div className="mt-4 flex justify-center gap-3">
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
            </div>

            <div className="col-span-3 p-3 flex justify-center">
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
                          Select the audio that will be transcribed by clicking
                          to upload or drag the audio file
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
                Make sure your Flask server is running on http://localhost:5000
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
    </>
  );
}

export default App;
