/**
 * Batch Audio Transcription App
 * Handles file uploads, queue monitoring, and download management
 */

// Global state
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
const DOWNLOAD_TIMER_DURATION = 30; // 30 seconds

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
     * Validate individual file
     */
    validate(file) {
        if (file.size > MAX_FILE_SIZE) {
            return "File size exceeds 100MB limit";
        }
        
        const isValidType = ALLOWED_TYPES.some(type => 
            file.type.includes(type.split('/')[1]) || 
            file.name.toLowerCase().includes(type.split('/')[1])
        );
        
        if (!isValidType) {
            return "Invalid file format. Please use: MP3, WAV, FLAC, AAC, OGG, M4A, or WMA";
        }
        
        return null;
    },

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
        
        // Validate each file
        for (const file of newFiles) {
            const error = FileValidator.validate(file);
            if (error) {
                Utils.showError(`${file.name}: ${error}`);
                return;
            }
        }
        
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
        document.getElementById('uploadText').textContent = 'Drop your audio files here';
        document.getElementById('uploadSubtext').textContent = `or click to browse (max ${MAX_FILES} files)`;
    },

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
 * Download Manager
 */
const DownloadManager = {
    /**
     * Start download countdown timer
     */
    startTimer(jobId) {
        let timeLeft = DOWNLOAD_TIMER_DURATION;
        downloadTimers[jobId] = timeLeft;
        
        const timerInterval = setInterval(() => {
            timeLeft--;
            downloadTimers[jobId] = timeLeft;
            
            const timerText = document.getElementById(`timer-text-${jobId}`);
            const downloadBtn = document.getElementById(`download-${jobId}`);
            const actionsDiv = document.getElementById(`actions-${jobId}`);
            
            if (!timerText || !downloadBtn || !actionsDiv) {
                clearInterval(timerInterval);
                return;
            }
            
            if (timeLeft > 0) {
                this._updateTimerDisplay(timeLeft, timerText, downloadBtn);
            } else {
                this._handleTimerExpiry(timerInterval, jobId, actionsDiv);
            }
        }, 1000);
    },

    _updateTimerDisplay(timeLeft, timerText, downloadBtn) {
        timerText.textContent = `Auto-expires in ${timeLeft}s`;
        timerText.style.color = timeLeft <= 10 ? '#e53e3e' : '#718096';
        
        // Change button color when time is running low
        if (timeLeft <= 10) {
            downloadBtn.style.background = 'linear-gradient(135deg, #f56565, #e53e3e)';
            downloadBtn.innerHTML = `⚠️ Download SRT (${timeLeft}s)`;
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
        // Check if timer has expired
        if (!downloadTimers[jobId] || downloadTimers[jobId] <= 0) {
            Utils.showError('Download link has expired. File has been deleted from server.');
            return;
        }
        
        // Extract the actual filename from the URL or use custom name
        const urlFilename = srtUrl.split('/').pop();
        const downloadName = customFilename || urlFilename;
        
        const link = document.createElement("a");
        link.href = API_BASE_URL + srtUrl;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Show download initiated message
        const timerText = document.getElementById(`timer-text-${jobId}`);
        if (timerText) {
            timerText.textContent = 'Download initiated - file will expire soon';
            timerText.style.color = '#38a169';
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