let selectedFiles = [];
let jobIds = [];
let statusInterval = null;
let downloadTimers = {};
let allJobs = {};

// Constants
const API_BASE_URL = "http://127.0.0.1:5000";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_FILES = 10; // Increased since we process one by one
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
    },

    /**
     * Show success message
     */
    showSuccess(message) {
        // Create or update success message element
        let successMessage = document.getElementById('successMessage');
        if (!successMessage) {
            successMessage = document.createElement('div');
            successMessage.id = 'successMessage';
            successMessage.className = 'success-message';
            DOM.errorMessage.parentNode.insertBefore(successMessage, DOM.errorMessage.nextSibling);
        }
        
        successMessage.textContent = message;
        successMessage.classList.add('show');
        setTimeout(() => {
            successMessage.classList.remove('show');
        }, 3000);
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
 * Upload Handler - Updated for single file processing
 */
const UploadHandler = {
    /**
     * Handle form submission - process files one by one
     */
    async handleSubmit(e) {
        e.preventDefault();

        if (selectedFiles.length === 0) {
            Utils.showError("Please select at least one file!");
            return;
        }

        this._setLoadingState(true);
        
        // Show queue status
        DOM.queueStatus.classList.add('show');
        StatusMonitor.start();

        try {
            // Process each file individually
            for (let i = 0; i < selectedFiles.length; i++) {
                await this._processFile(i);
            }
            
            Utils.showSuccess(`Successfully started processing ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`);
            
            // Reset form but keep job list visible
            this._resetForm();

        } catch (err) {
            console.error(err);
            Utils.showError("Error: " + (err.message || "Upload failed"));
        } finally {
            this._setLoadingState(false);
        }
    },

    /**
     * Process a single file
     */
    async _processFile(fileIndex) {
        const file = selectedFiles[fileIndex];
        const customNameInput = document.getElementById(`customName${fileIndex}`);
        const customName = customNameInput ? customNameInput.value.trim() : '';

        const formData = new FormData();
        formData.append('file', file);
        if (customName) {
            formData.append('filename', customName);
        }

        try {
            const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 300000 // 5 minutes timeout for processing
            });

            // Add job ID to our tracking list
            jobIds.push(response.data.job_id);
            
            // Add initial status to allJobs
            allJobs[response.data.job_id] = {
                status: 'processing',
                filename: file.name,
                custom_name: customName,
                safe_name: customName || file.name.split('.')[0],
                file_size: file.size,
                started_at: new Date().toISOString()
            };

        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            
            // Create error job entry
            const errorJobId = `error_${Date.now()}_${fileIndex}`;
            allJobs[errorJobId] = {
                status: 'error',
                filename: file.name,
                custom_name: customName,
                safe_name: customName || file.name.split('.')[0],
                file_size: file.size,
                error: error.response?.data?.error || error.message || 'Upload failed',
                started_at: new Date().toISOString(),
                completed_at: new Date().toISOString()
            };
            
            // Still add to jobIds for tracking
            jobIds.push(errorJobId);
        }
    },

    _setLoadingState(isLoading) {
        DOM.submitBtn.disabled = isLoading;
        DOM.submitBtn.textContent = isLoading ? 'Processing Files...' : 'Start Processing';
    },

    _resetForm() {
        selectedFiles = [];
        DOM.fileInput.value = '';
        FileManager.updateFileList();
    }
};

/**
 * Status Monitor - Updated for Flask API
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
            // Get all job statuses from Flask API
            const statusResponse = await axios.get(`${API_BASE_URL}/status`);
            const serverStatuses = statusResponse.data;
            
            // Update our local job statuses
            this._updateJobStatuses(serverStatuses);
            
            // Update queue statistics
            this._updateQueueStats(serverStatuses);
            
            // Update job list display
            JobList.update(allJobs);
            
            // Check if we should stop monitoring
            const hasActiveJobs = Object.values(allJobs).some(job => 
                job.status === 'processing' || job.status === 'correcting'
            );
            
            if (!hasActiveJobs && Object.keys(allJobs).length > 0) {
                // Still have jobs but none are active - keep monitoring but less frequently
                if (statusInterval && STATUS_UPDATE_INTERVAL < 5000) {
                    clearInterval(statusInterval);
                    statusInterval = setInterval(() => this.update(), 5000); // Check every 5 seconds instead
                }
            }
            
        } catch (error) {
            console.error('Error updating status:', error);
        }
    },

    /**
     * Update job statuses from server response
     */
    _updateJobStatuses(serverStatuses) {
        // Update existing jobs with server data
        Object.entries(serverStatuses).forEach(([jobId, serverStatus]) => {
            if (allJobs[jobId]) {
                // Merge server status with local status
                allJobs[jobId] = {
                    ...allJobs[jobId],
                    ...serverStatus
                };
            } else if (jobIds.includes(jobId)) {
                // New job from server that we're tracking
                allJobs[jobId] = serverStatus;
            }
        });

        // Mark jobs as expired if they're not in server response but were previously completed
        Object.entries(allJobs).forEach(([jobId, job]) => {
            if (!serverStatuses[jobId] && job.status === 'completed') {
                // Job not found on server - probably expired
                allJobs[jobId] = {
                    ...job,
                    expired: true,
                    file_available: false
                };
            }
        });
    },

    /**
     * Calculate and update queue statistics
     */
    _updateQueueStats(serverStatuses) {
        const stats = {
            queued: 0,
            processing: 0,
            correcting: 0,
            completed: 0,
            error: 0
        };

        Object.values(serverStatuses).forEach(job => {
            if (job.status === 'processing') {
                stats.processing++;
            } else if (job.status === 'correcting') {
                stats.correcting++;
            } else if (job.status === 'completed') {
                stats.completed++;
            } else if (job.status === 'error') {
                stats.error++;
            }
        });

        // Update DOM
        document.getElementById('queuedCount').textContent = stats.queued;
        document.getElementById('processingCount').textContent = stats.processing + stats.correcting;
        document.getElementById('completedCount').textContent = stats.completed;
        document.getElementById('errorCount').textContent = stats.error;
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
        
        // Clear and rebuild job list to maintain proper order
        jobList.innerHTML = '';
        
        // Sort jobs by started_at time
        const sortedJobs = Object.entries(statuses).sort(([, a], [, b]) => {
            const timeA = new Date(a.started_at || 0);
            const timeB = new Date(b.started_at || 0);
            return timeA - timeB;
        });

        // Add each job to the list
        sortedJobs.forEach(([jobId, status]) => {
            const jobItem = this._createJobItem(jobId, status);
            jobList.appendChild(jobItem);
        });
        
        // Start timers for newly completed jobs
        Object.entries(statuses).forEach(([jobId, status]) => {
            if (status.status === 'completed' && status.srt_url && !downloadTimers[jobId] && !status.expired) {
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
        
        // Format status for display
        let statusText = status.status;
        if (status.status === 'correcting') {
            statusText = 'correcting transcript';
        }
        
        jobItem.innerHTML = `
            <div class="job-header">
                <div class="job-name">📎 ${displayName}</div>
                <div class="status-badge ${statusClass}">${statusText}</div>
            </div>
            <div class="job-details">
                <div>Size: ${Utils.formatFileSize(status.file_size)}</div>
                <div>Started: ${new Date(status.started_at).toLocaleTimeString()}</div>
                ${processingTime ? `<div>Time: ${processingTime}</div>` : ''}
                ${status.error ? `<div style="color: #c53030;">Error: ${status.error}</div>` : ''}
                ${status.expired ? `<div style="color: #c53030;">⚠️ File expired</div>` : ''}
            </div>
            ${this._renderJobActions(jobId, status, displayName)}
        `;
        
        return jobItem;
    },

    _renderJobActions(jobId, status, displayName) {
        if (status.status !== 'completed') {
            return '';
        }

        if (status.expired || !status.srt_url) {
            return `
                <div class="job-actions">
                    <div style="padding: 12px; background: #fed7d7; border: 1px solid #feb2b2; border-radius: 8px; text-align: center;">
                        <div style="color: #c53030; font-weight: 600; font-size: 14px; margin-bottom: 4px;">
                            🕒 Download Expired
                        </div>
                        <div style="color: #9c4221; font-size: 12px;">
                            File has been automatically deleted from server
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="job-actions" id="actions-${jobId}">
                <button class="download-btn" id="download-${jobId}" onclick="DownloadManager.download('${status.srt_url}', '${displayName}.srt', '${jobId}')">
                    📄 Download SRT
                </button>
                <div class="download-timer" id="timer-${jobId}" style="font-size: 11px; color: #718096; margin-top: 8px;">
                    <span id="timer-text-${jobId}">Available for download</span>
                </div>
            </div>
        `;
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
        // Get the download expiry time from server status if available
        const jobStatus = allJobs[jobId];
        let timeLeft = DOWNLOAD_TIMER_DURATION; // Default to 1 hour
        
        if (jobStatus && jobStatus.download_expires_in !== undefined) {
            timeLeft = Math.max(0, jobStatus.download_expires_in);
        }
        
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
        
        downloadTimers[jobId].interval = timerInterval;
    },

    _updateTimerDisplay(timeLeft, timerText, downloadBtn, hasBeenDownloaded) {
        const formattedTime = Utils.formatTime(timeLeft);
        
        if (hasBeenDownloaded) {
            timerText.textContent = `Download expires in ${formattedTime}`;
            timerText.style.color = '#e53e3e';
            downloadBtn.style.background = 'linear-gradient(135deg, #f56565, #e53e3e)';
            downloadBtn.innerHTML = `⚠️ Download SRT (${formattedTime})`;
        } else {
            timerText.textContent = `Available for ${formattedTime}`;
            
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
                timerText.style.color = '#718096';
                timerText.textContent = `Available for ${formattedTime}`;
            }
        }
    },

    _handleTimerExpiry(timerInterval, jobId, actionsDiv) {
        clearInterval(timerInterval);
        delete downloadTimers[jobId];
        
        // Mark job as expired in allJobs
        if (allJobs[jobId]) {
            allJobs[jobId].expired = true;
            allJobs[jobId].file_available = false;
        }
        
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
        const downloadName = customFilename || srtUrl.split('/').pop();
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

        Utils.showSuccess(`Download started: ${downloadName}`);
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
            StatusMonitor.update();
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
        
        // Load existing jobs on startup
        StatusMonitor.update();
        
        console.log('Audio Transcription App initialized');
    }
};

// Global functions for onclick handlers (maintain backward compatibility)
window.removeFile = (index) => FileManager.removeFile(index);
window.downloadSRT = (srtUrl, customFilename, jobId) => DownloadManager.download(srtUrl, customFilename, jobId);
window.clearCompleted = function() {
    if (confirm('Clear all completed jobs? This will remove them from the display.')) {
        // Remove completed jobs from allJobs
        Object.keys(allJobs).forEach(jobId => {
            if (allJobs[jobId].status === 'completed' || allJobs[jobId].status === 'error') {
                delete allJobs[jobId];
                // Clear timers for removed jobs
                if (downloadTimers[jobId]) {
                    if (downloadTimers[jobId].interval) {
                        clearInterval(downloadTimers[jobId].interval);
                    }
                    delete downloadTimers[jobId];
                }
            }
        });
        
        // Update the display
        JobList.update(allJobs);
        
        // If no jobs left, hide the queue status
        if (Object.keys(allJobs).length === 0) {
            DOM.queueStatus.classList.remove('show');
        }
    }
};

// Start the application
App.init();