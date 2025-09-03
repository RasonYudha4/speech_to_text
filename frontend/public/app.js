let selectedFiles = [];
let jobIds = [];
let statusInterval = null;
let downloadTimers = {};

// Constants
const API_BASE_URL = "http://127.0.0.1:5000";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_FILES = 5;
const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/ogg', 'audio/mp4', 'audio/x-ms-wma'];
const STATUS_UPDATE_INTERVAL = 2000; // 2 seconds
const DOWNLOAD_TIMER_DURATION = 60 * 60; // 1 hour (3600 seconds) - matches backend cleanup timing

/**
 * DOM Elements Cache
 */
const DOM = {
    fileInput: null,
    uploadArea: null,
    fileList: null,
    customNames: null,
    submitBtn: null,
    errorMessage: null,
    queueStatus: null,
    
    // Initialize DOM element references
    init() {
        this.fileInput = document.getElementById("fileInput");
        this.uploadArea = document.getElementById("uploadArea");
        this.fileList = document.getElementById("fileList");
        this.customNames = document.getElementById("customNames");
        this.submitBtn = document.getElementById("submitBtn");
        this.errorMessage = document.getElementById("errorMessage");
        this.queueStatus = document.getElementById("queueStatus");
    }
};

/**
 * File Validation Utilities
 */
const FileValidator = {

    /**
     * Check for duplicate files
     */
    isDuplicate(newFile, existingFiles) {
        return existingFiles.some(existing => 
            existing.name === newFile.name && existing.size === newFile.size
        );
    }
};

/**
 * Utility Functions
 */
const Utils = {
    /**
     * Format file size in human readable format
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Format time duration in human readable format
     */
    formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const remainingMinutes = Math.floor((seconds % 3600) / 60);
            const remainingSeconds = seconds % 60;
            
            let timeStr = `${hours}h`;
            if (remainingMinutes > 0) timeStr += ` ${remainingMinutes}m`;
            if (remainingSeconds > 0 && hours === 0) timeStr += ` ${remainingSeconds}s`;
            
            return timeStr;
        }
    },

    /**
     * Show error message with auto-hide
     */
    showError(message) {
        DOM.errorMessage.textContent = message;
        DOM.errorMessage.classList.add('show');
        setTimeout(() => {
            DOM.errorMessage.classList.remove('show');
        }, 5000);
    }
};

/**
 * File Management
 */
const FileManager = {
    /**
     * Handle file selection from input or drag-drop
     */
    handleFileSelect(files) {
        const newFiles = Array.from(files);
        
        // Check total count
        if (selectedFiles.length + newFiles.length > MAX_FILES) {
            Utils.showError(`Maximum ${MAX_FILES} files allowed. Please remove some files first.`);
            return;
        }
        
        // Add new files (avoid duplicates)
        for (const newFile of newFiles) {
            if (!FileValidator.isDuplicate(newFile, selectedFiles)) {
                selectedFiles.push(newFile);
            }
        }
        
        this.updateFileList();
    },

    /**
     * Remove file from selection
     */
    removeFile(index) {
        selectedFiles.splice(index, 1);
        this.updateFileList();
    },

    /**
     * Update the file list display
     */
    updateFileList() {
        if (selectedFiles.length === 0) {
            this._showEmptyState();
            return;
        }

        this._showFilesState();
        this._updateFileCount();
        this._renderFileItems();
        this._renderCustomNameInputs();
        
        DOM.fileList.classList.add('show');
        DOM.customNames.classList.add('show');
        DOM.submitBtn.disabled = false;
    },

    _showEmptyState() {
        DOM.fileList.classList.remove('show');
        DOM.customNames.classList.remove('show');
        DOM.submitBtn.disabled = true;
        
        DOM.uploadArea.classList.remove('has-files');
        document.getElementById('uploadIcon').textContent = '🎵';
        document.getElementById('uploadText').textContent = 'Drop your audio files here';    },

    _showFilesState() {
        DOM.uploadArea.classList.add('has-files');
        document.getElementById('uploadIcon').textContent = '✓';
        document.getElementById('uploadText').textContent = `${selectedFiles.length} files selected`;
        document.getElementById('uploadSubtext').textContent = 'Click to add more or change files';
    },

    _updateFileCount() {
        document.getElementById('fileCount').textContent = 
            `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`;
    },

    _renderFileItems() {
        const fileItems = document.getElementById('fileItems');
        fileItems.innerHTML = '';
        
        selectedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-name">📎 ${file.name}</div>
                    <div class="file-details">${Utils.formatFileSize(file.size)}</div>
                </div>
                <button type="button" class="remove-btn" onclick="FileManager.removeFile(${index})">Remove</button>
            `;
            fileItems.appendChild(fileItem);
        });
    },

    _renderCustomNameInputs() {
        const nameInputs = document.getElementById('nameInputs');
        nameInputs.innerHTML = '';
        
        selectedFiles.forEach((file, index) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'name-input';
            input.placeholder = `Custom name for ${file.name} (optional)`;
            input.id = `customName${index}`;
            nameInputs.appendChild(input);
        });
    }
};

/**
 * Upload Handler
 */
const UploadHandler = {
    /**
     * Handle form submission
     */
    async handleSubmit(e) {
        e.preventDefault();

        if (selectedFiles.length === 0) {
            Utils.showError("Please select at least one file!");
            return;
        }

        const formData = this._prepareFormData();
        this._setLoadingState(true);

        try {
            const res = await axios.post(`${API_BASE_URL}/upload`, formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });

            jobIds = res.data.job_ids;
            
            // Show queue status and start monitoring
            DOM.queueStatus.classList.add('show');
            StatusMonitor.start();
            
            // Reset form
            this._resetForm();

        } catch (err) {
            console.error(err);
            Utils.showError("Error: " + (err.response?.data?.error || err.message));
        } finally {
            this._setLoadingState(false);
        }
    },

    _prepareFormData() {
        const formData = new FormData();
        
        // Add files
        selectedFiles.forEach((file) => {
            formData.append('files', file);
        });
        
        // Add custom names
        selectedFiles.forEach((file, index) => {
            const customNameInput = document.getElementById(`customName${index}`);
            const customName = customNameInput ? customNameInput.value.trim() : '';
            formData.append('filenames', customName);
        });

        return formData;
    },

    _setLoadingState(isLoading) {
        DOM.submitBtn.disabled = isLoading;
        DOM.submitBtn.textContent = isLoading ? 'Uploading...' : 'Start Batch Processing';
    },

    _resetForm() {
        selectedFiles = [];
        DOM.fileInput.value = '';
        FileManager.updateFileList();
    }
};

/**
 * Status Monitor
 */
const StatusMonitor = {
    /**
     * Start status monitoring
     */
    start() {
        if (statusInterval) {
            clearInterval(statusInterval);
        }
        
        this.update(); // Initial update
        statusInterval = setInterval(() => this.update(), STATUS_UPDATE_INTERVAL);
    },

    /**
     * Stop status monitoring
     */
    stop() {
        if (statusInterval) {
            clearInterval(statusInterval);
            statusInterval = null;
        }
    },

    /**
     * Update status information
     */
    async update() {
        try {
            // Get queue info
            const queueInfo = await axios.get(`${API_BASE_URL}/queue/info`);
            const { queued, processing, completed, error } = queueInfo.data;
            
            // Update stats
            this._updateStats(queued, processing, completed, error);
            
            // Get all job statuses
            const statusResponse = await axios.get(`${API_BASE_URL}/status`);
            const allStatuses = statusResponse.data;
            
            JobList.update(allStatuses);
            
            // Stop monitoring if all jobs are done
            const totalJobs = Object.keys(allStatuses).length;
            const finishedJobs = completed + error;
            
            if (totalJobs > 0 && finishedJobs === totalJobs) {
                this.stop();
            }
            
        } catch (error) {
            console.error('Error updating status:', error);
        }
    },

    _updateStats(queued, processing, completed, error) {
        document.getElementById('queuedCount').textContent = queued;
        document.getElementById('processingCount').textContent = processing;
        document.getElementById('completedCount').textContent = completed;
        document.getElementById('errorCount').textContent = error;
    }
};

/**
 * Job List Manager
 */
const JobList = {
    /**
     * Update job list display
     */
    update(statuses) {
        const jobList = document.getElementById('jobList');
        jobList.innerHTML = '';
        
        // Sort jobs by queued time
        const sortedJobs = Object.entries(statuses).sort((a, b) => 
            new Date(a[1].queued_at) - new Date(b[1].queued_at)
        );
        
        sortedJobs.forEach(([jobId, status]) => {
            const jobItem = this._createJobItem(jobId, status);
            jobList.appendChild(jobItem);
            
            // Start countdown timer for completed jobs (if not already started)
            if (status.status === 'completed' && status.srt_url && !downloadTimers[jobId]) {
                DownloadManager.startTimer(jobId);
            }
        });
    },

    _createJobItem(jobId, status) {
        const jobItem = document.createElement('div');
        jobItem.className = 'job-item';
        jobItem.id = `job-${jobId}`;
        
        const statusClass = `status-${status.status}`;
        const displayName = status.custom_name || status.safe_name || status.filename;
        
        // Calculate processing time if applicable
        let processingTime = '';
        if (status.started_at && status.completed_at) {
            const start = new Date(status.started_at);
            const end = new Date(status.completed_at);
            processingTime = `${((end - start) / 1000).toFixed(1)}s`;
        }
        
        jobItem.innerHTML = `
            <div class="job-header">
                <div class="job-name">📎 ${displayName}</div>
                <div class="status-badge ${statusClass}">${status.status}</div>
            </div>
            <div class="job-details">
                <div>Size: ${Utils.formatFileSize(status.file_size)}</div>
                <div>Queued: ${new Date(status.queued_at).toLocaleTimeString()}</div>
                ${processingTime ? `<div>Time: ${processingTime}</div>` : ''}
                ${status.error ? `<div style="color: #c53030;">Error: ${status.error}</div>` : ''}
            </div>
            ${status.status === 'completed' && status.srt_url ? `
                <div class="job-actions" id="actions-${jobId}">
                    <button class="download-btn" id="download-${jobId}" onclick="DownloadManager.download('${status.srt_url}', '${displayName}.srt', '${jobId}')">
                        📄 Download SRT
                    </button>
                    <div class="download-timer" id="timer-${jobId}" style="font-size: 11px; color: #718096; margin-top: 8px;">
                        <span id="timer-text-${jobId}">Available for download</span>
                    </div>
                </div>
            ` : ''}
        `;
        
        return jobItem;
    }
};

/**
 * Video Player Management
 */
const VideoPlayer = {
    // DOM elements
    videoUploadArea: null,
    videoFileInput: null,
    videoContainer: null,
    videoPlayer: null,
    videoInfo: null,
    changeVideoBtn: null,

    /**
     * Initialize video player
     */
    init() {
        this.videoUploadArea = document.getElementById("videoUploadArea");
        this.videoFileInput = document.getElementById("videoFileInput");
        this.videoContainer = document.getElementById("videoContainer");
        this.videoPlayer = document.getElementById("videoPlayer");
        this.videoInfo = document.getElementById("videoInfo");
        this.changeVideoBtn = document.getElementById("changeVideoBtn");

        this._setupEventListeners();
    },

    /**
     * Setup event listeners
     */
    _setupEventListeners() {
        // File input change
        this.videoFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleVideoSelect(e.target.files[0]);
            }
        });

        // Upload area click
        this.videoUploadArea.addEventListener('click', () => {
            this.videoFileInput.click();
        });

        // Drag and drop
        this.videoUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.videoUploadArea.classList.add('dragover');
        });

        this.videoUploadArea.addEventListener('dragleave', () => {
            this.videoUploadArea.classList.remove('dragover');
        });

        this.videoUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.videoUploadArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleVideoSelect(files[0]);
            }
        });

        // Change video button
        this.changeVideoBtn.addEventListener('click', () => {
            this.videoFileInput.click();
        });

        // Video loaded metadata
        this.videoPlayer.addEventListener('loadedmetadata', () => {
            this._updateVideoInfo();
        });
    },

    /**
     * Handle video file selection
     */
    handleVideoSelect(file) {
        // Validate file type
        if (!file.type.startsWith('video/')) {
            Utils.showError('Please select a valid video file.');
            return;
        }

        // Create blob URL for the video
        const videoUrl = URL.createObjectURL(file);
        
        // Set video source
        this.videoPlayer.src = videoUrl;
        
        // Store file info
        this.currentFile = file;
        
        // Update UI
        this._updateUploadAreaState();
        this._showVideoPlayer();
        this._updateBasicInfo();

        // Clean up previous blob URL
        this.videoPlayer.addEventListener('loadstart', () => {
            if (this.previousUrl) {
                URL.revokeObjectURL(this.previousUrl);
            }
            this.previousUrl = videoUrl;
        });
    },

    /**
     * Update upload area state
     */
    _updateUploadAreaState() {
        this.videoUploadArea.classList.add('has-video');
        document.getElementById('videoUploadIcon').textContent = '✓';
        document.getElementById('videoUploadText').textContent = 'Video loaded successfully';
        document.getElementById('videoUploadSubtext').textContent = 'Click to select a different video';
    },

    /**
     * Show video player
     */
    _showVideoPlayer() {
        this.videoContainer.classList.add('show');
    },

    /**
     * Update basic video info
     */
    _updateBasicInfo() {
        document.getElementById('videoFileName').textContent = this.currentFile.name;
        document.getElementById('videoFileSize').textContent = Utils.formatFileSize(this.currentFile.size);
        document.getElementById('videoDuration').textContent = 'Loading...';
        document.getElementById('videoResolution').textContent = 'Loading...';
    },

    /**
     * Update video info when metadata is loaded
     */
    _updateVideoInfo() {
        // Duration
        const duration = this.videoPlayer.duration;
        const formattedDuration = this._formatDuration(duration);
        document.getElementById('videoDuration').textContent = formattedDuration;

        // Resolution
        const width = this.videoPlayer.videoWidth;
        const height = this.videoPlayer.videoHeight;
        document.getElementById('videoResolution').textContent = `${width} × ${height}`;
    },

    /**
     * Format duration in MM:SS or HH:MM:SS format
     */
    _formatDuration(seconds) {
        if (isNaN(seconds)) return 'Unknown';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }
};

/**
 * Download Manager
 */
const DownloadManager = {
    /**
     * Start download countdown timer
     */
    startTimer(jobId) {
        let timeLeft = DOWNLOAD_TIMER_DURATION; // Start with 1 hour (3600 seconds)
        downloadTimers[jobId] = { timeLeft: timeLeft, hasBeenDownloaded: false, interval: null };
        
        const timerInterval = setInterval(() => {
            const timerData = downloadTimers[jobId];
            if (!timerData) {
                clearInterval(timerInterval);
                return;
            }
            
            timerData.timeLeft--;
            
            const timerText = document.getElementById(`timer-text-${jobId}`);
            const downloadBtn = document.getElementById(`download-${jobId}`);
            const actionsDiv = document.getElementById(`actions-${jobId}`);
            
            if (!timerText || !downloadBtn || !actionsDiv) {
                clearInterval(timerInterval);
                return;
            }
            
            if (timerData.timeLeft > 0) {
                this._updateTimerDisplay(timerData.timeLeft, timerText, downloadBtn, timerData.hasBeenDownloaded);
            } else {
                this._handleTimerExpiry(timerInterval, jobId, actionsDiv);
            }
        }, 1000);
        
        // Store the interval reference so we can clear it later if needed
        downloadTimers[jobId].interval = timerInterval;
    },

    _updateTimerDisplay(timeLeft, timerText, downloadBtn, hasBeenDownloaded) {
        const formattedTime = Utils.formatTime(timeLeft);
        
        if (hasBeenDownloaded) {
            // After download - show 30 second countdown
            timerText.textContent = `Download expires in ${formattedTime}`;
            timerText.style.color = '#e53e3e';
            downloadBtn.style.background = 'linear-gradient(135deg, #f56565, #e53e3e)';
            downloadBtn.innerHTML = `⚠️ Download SRT (${formattedTime})`;
        } else {
            // Before download - show normal countdown
            timerText.textContent = `Available for ${formattedTime}`;
            
            // Change colors based on time remaining
            if (timeLeft <= 300) { // 5 minutes or less - red warning
                timerText.style.color = '#e53e3e';
                downloadBtn.style.background = 'linear-gradient(135deg, #f56565, #e53e3e)';
                downloadBtn.innerHTML = `⚠️ Download SRT (${formattedTime})`;
            } else if (timeLeft <= 600) { // 10 minutes or less - orange warning
                timerText.style.color = '#d69e2e';
                downloadBtn.style.background = 'linear-gradient(135deg, #ed8936, #d69e2e)';
                downloadBtn.innerHTML = `⏰ Download SRT (${formattedTime})`;
            } else if (timeLeft <= 1800) { // 30 minutes or less - yellow caution
                timerText.style.color = '#b7791f';
                timerText.textContent = `Expires in ${formattedTime}`;
            } else {
                // More than 30 minutes - normal state
                timerText.style.color = '#718096';
                timerText.textContent = `Available for ${formattedTime}`;
            }
        }
    },

    _handleTimerExpiry(timerInterval, jobId, actionsDiv) {
        clearInterval(timerInterval);
        delete downloadTimers[jobId];
        
        actionsDiv.innerHTML = `
            <div style="padding: 12px; background: #fed7d7; border: 1px solid #feb2b2; border-radius: 8px; text-align: center;">
                <div style="color: #c53030; font-weight: 600; font-size: 14px; margin-bottom: 4px;">
                    🕒 Download Expired
                </div>
                <div style="color: #9c4221; font-size: 12px;">
                    File has been automatically deleted from server
                </div>
            </div>
        `;
        
        // Add fade-out animation
        actionsDiv.style.transition = 'opacity 0.5s ease';
        actionsDiv.style.opacity = '0.7';
    },

    /**
     * Download SRT file
     */
    download(srtUrl, customFilename, jobId) {
        const timerData = downloadTimers[jobId];
        
        // Check if timer expired or doesn't exist
        if (!timerData || timerData.timeLeft <= 0) {
            Utils.showError('Download link has expired. File has been deleted from server.');
            return;
        }

        // Perform the actual download
        const urlFilename = srtUrl.split('/').pop();
        const downloadName = customFilename || urlFilename;
        const link = document.createElement("a");
        link.href = API_BASE_URL + srtUrl;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // After first download - reset timer to 30 seconds and mark as downloaded
        timerData.timeLeft = 30;
        timerData.hasBeenDownloaded = true;

        const timerText = document.getElementById(`timer-text-${jobId}`);
        const downloadBtn = document.getElementById(`download-${jobId}`);
        
        if (timerText && downloadBtn) {
            timerText.textContent = "Download started - expires in 30s";
            timerText.style.color = '#e53e3e';
            downloadBtn.style.background = 'linear-gradient(135deg, #f56565, #e53e3e)';
            downloadBtn.innerHTML = '⚠️ Download SRT (30s)';
        }
    }
};

/**
 * Event Handlers
 */
const EventHandlers = {
    /**
     * Initialize all event listeners
     */
    init() {
        this._initDragAndDrop();
        this._initFileInput();
        this._initFormSubmit();
        this._initRefreshButton();
        this._initVisibilityChange();
    },

    _initDragAndDrop() {
        DOM.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            DOM.uploadArea.classList.add('dragover');
        });

        DOM.uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            DOM.uploadArea.classList.remove('dragover');
        });

        DOM.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            DOM.uploadArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                FileManager.handleFileSelect(files);
            }
        });

        // Click to browse
        DOM.uploadArea.addEventListener('click', () => {
            DOM.fileInput.click();
        });
    },

    _initFileInput() {
        DOM.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                FileManager.handleFileSelect(e.target.files);
            }
        });
    },

    _initFormSubmit() {
        document.getElementById("uploadForm").addEventListener("submit", (e) => {
            UploadHandler.handleSubmit(e);
        });
    },

    _initRefreshButton() {
        document.getElementById('refreshBtn').addEventListener('click', () => {
            if (statusInterval) {
                StatusMonitor.update();
            }
        });
    },

    _initVisibilityChange() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && statusInterval) {
                StatusMonitor.update();
            }
        });
    }
};

/**
 * Application Initialization
 */
const App = {
    /**
     * Initialize the application
     */
    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this._initialize());
        } else {
            this._initialize();
        }
    },

    _initialize() {
        // Initialize DOM references
        DOM.init();
        
        // Initialize event handlers
        EventHandlers.init();

        VideoPlayer.init();
        
        console.log('Batch Audio Transcription App initialized');
    }
};

// Global functions for onclick handlers (maintain backward compatibility)
window.removeFile = (index) => FileManager.removeFile(index);
window.downloadSRT = (srtUrl, customFilename, jobId) => DownloadManager.download(srtUrl, customFilename, jobId);
window.clearCompleted = function() {
    if (confirm('Clear all completed jobs? This will refresh the page.')) {
        location.reload();
    }
};

// Start the application
App.init();