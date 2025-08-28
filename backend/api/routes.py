import os
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, send_from_directory

from config import Config
from models.job_status import (
    job_manager, JobStatus, ChunkGroup, ChunkInfo,
    STATUS_QUEUED, STATUS_COMPLETED, STATUS_ERROR
)
from services.queue_service import queue_service
from services.file_service import FileService
from utils.cleanup_utils import cleanup_service

# Create blueprint
api = Blueprint('api', __name__)
file_service = FileService()

@api.route('/upload', methods=['POST'])
def upload_files():
    """Upload and queue audio files for processing"""
    if 'files' not in request.files:
        return jsonify({"error": "No files part"}), 400
    
    files = request.files.getlist('files')
    
    if not files or len(files) == 0:
        return jsonify({"error": "No file provided"}), 400
    
    if len(files) > 1:
        return jsonify({"error": "Only one file upload is allowed"}), 400
    
    file = files[0]
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    # Validate file type
    if not file_service.validate_file_type(file.filename):
        file_ext = os.path.splitext(file.filename)[1].lower()
        return jsonify({
            "error": f"File type {file_ext} not supported. Allowed types: {', '.join(Config.ALLOWED_EXTENSIONS)}"
        }), 400
    
    # Get custom filename if provided
    custom_names = request.form.getlist('filenames')
    custom_name = custom_names[0] if custom_names and custom_names[0] else None
    
    job_id = str(uuid.uuid4())
    safe_name = file_service.generate_safe_filename(file.filename, custom_name)
    
    # Save uploaded file
    file_ext = os.path.splitext(file.filename)[1]
    upload_filename = f"{job_id}_{safe_name}{file_ext}"
    upload_path = os.path.join(Config.UPLOAD_FOLDER, upload_filename)
    
    file.save(upload_path)
    file_size = os.path.getsize(upload_path)
    
    try:
        # Split file into chunks if necessary
        chunk_paths = file_service.split_audio_file(upload_path)
        
        if len(chunk_paths) > 1:
            # Handle multiple chunks
            return _handle_chunked_upload(
                job_id, chunk_paths, file, custom_name, safe_name, file_size
            )
        else:
            # Handle single file
            return _handle_single_upload(
                job_id, chunk_paths[0], file, custom_name, safe_name, file_size
            )
            
    except Exception as e:
        # Clean up uploaded file if chunking fails
        file_service.cleanup_file(upload_path)
        return jsonify({"error": f"Failed to process file: {str(e)}"}), 500

def _handle_chunked_upload(job_id, chunk_paths, file, custom_name, safe_name, file_size):
    """Handle upload of file that was split into chunks"""
    # Store chunk group information
    chunk_group = ChunkGroup(
        total_chunks=len(chunk_paths),
        filename=file.filename,
        custom_name=custom_name,
        safe_name=safe_name,
        original_file_size=file_size
    )
    job_manager.add_chunk_group(job_id, chunk_group)
    
    # Initialize original job status
    original_job = JobStatus(
        status=STATUS_QUEUED,
        filename=file.filename,
        custom_name=custom_name,
        safe_name=safe_name,
        queued_at=datetime.now(),
        file_size=file_size,
        original_job=True,
        total_chunks=len(chunk_paths),
        chunks_processing=True
    )
    job_manager.add_job(job_id, original_job)
    
    job_ids = []
    
    # Queue individual chunks
    for i, chunk_path in enumerate(chunk_paths):
        chunk_job_id = f"{job_id}_chunk_{i+1}"
        output_filename = f"{safe_name}_chunk_{i+1}.srt"
        output_path = os.path.join(Config.OUTPUT_FOLDER, output_filename)
        
        # Create chunk job status
        chunk_info = ChunkInfo(
            is_chunk=True,
            chunk_number=i + 1,
            total_chunks=len(chunk_paths),
            original_file_size=file_size,
            original_job_id=job_id
        )
        
        chunk_job = JobStatus(
            status=STATUS_QUEUED,
            filename=file.filename,
            custom_name=custom_name,
            safe_name=safe_name,
            queued_at=datetime.now(),
            file_size=os.path.getsize(chunk_path),
            chunk_info=chunk_info
        )
        job_manager.add_job(chunk_job_id, chunk_job)
        
        # Queue for processing
        queue_service.add_job({
            'job_id': chunk_job_id,
            'upload_path': chunk_path,
            'output_path': output_path,
            'filename': os.path.basename(chunk_path)
        })
        
        job_ids.append(chunk_job_id)
    
    return jsonify({
        "message": f"File split into {len(chunk_paths)} chunks and queued for processing",
        "job_id": job_id,
        "chunk_job_ids": job_ids,
        "original_file_size": file_size,
        "chunk_count": len(chunk_paths),
        "chunk_size_mb": Config.CHUNK_SIZE / (1024 * 1024),
        "note": "Track progress using the main job_id. Chunks will be automatically merged when complete."
    })

def _handle_single_upload(job_id, file_path, file, custom_name, safe_name, file_size):
    """Handle upload of single file (no chunking needed)"""
    output_filename = f"{safe_name}.srt"
    output_path = os.path.join(Config.OUTPUT_FOLDER, output_filename)
    
    # Create job status
    job = JobStatus(
        status=STATUS_QUEUED,
        filename=file.filename,
        custom_name=custom_name,
        safe_name=safe_name,
        queued_at=datetime.now(),
        file_size=file_size
    )
    job_manager.add_job(job_id, job)
    
    # Queue for processing
    queue_service.add_job({
        'job_id': job_id,
        'upload_path': file_path,
        'output_path': output_path,
        'filename': os.path.basename(file_path)
    })
    
    return jsonify({
        "message": "File queued for processing",
        "job_id": job_id,
        "file_size": file_size
    })

@api.route('/status/<job_id>')
def get_job_status(job_id):
    """Get status of a specific job"""
    job = job_manager.get_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    
    return jsonify(job.to_dict())

@api.route('/status')
def get_all_status():
    """Get status of all jobs"""
    all_jobs = job_manager.get_all_jobs()
    current_time = datetime.now()
    
    all_status = {}
    for job_id, job in all_jobs.items():
        status_data = job.to_dict()
        
        # For completed jobs, ensure SRT URL is available
        if job.status == STATUS_COMPLETED and job.output_path:
            if os.path.exists(job.output_path):
                # File still exists
                output_filename = os.path.basename(job.output_path)
                status_data['srt_url'] = f"/outputs/{output_filename}"
                status_data['file_available'] = True
            else:
                # File was deleted
                status_data['file_available'] = False
                status_data['expired'] = True
        
        # Add download expiry information for completed jobs
        if job.status == STATUS_COMPLETED and job.completed_at:
            time_since_completion = (current_time - job.completed_at).total_seconds()
            download_expires_in = max(0, Config.DOWNLOAD_EXPIRES_TIME - time_since_completion)
            status_data['download_expires_in'] = int(download_expires_in)
            status_data['download_expired'] = download_expires_in <= 0
        
        all_status[job_id] = status_data
    
    return jsonify(all_status)

@api.route('/outputs/<path:filename>')
def serve_srt(filename):
    """Serve SRT files and schedule cleanup"""
    file_path = os.path.join(Config.OUTPUT_FOLDER, filename)
    
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404
    
    # Schedule cleanup of the SRT file after serving
    cleanup_service.schedule_file_deletion(file_path)
    
    return send_from_directory(Config.OUTPUT_FOLDER, filename, as_attachment=True)

@api.route('/queue/info')
def queue_info():
    """Get queue information"""
    counts = job_manager.get_job_counts()
    
    return jsonify({
        "queue_size": queue_service.get_queue_size(),
        "queued": counts.get(STATUS_QUEUED, 0),
        "processing": counts.get('processing', 0),
        "merging": counts.get('merging', 0),
        "completed": counts.get(STATUS_COMPLETED, 0),
        "error": counts.get(STATUS_ERROR, 0)
    })

@api.route('/cleanup/old-files', methods=['POST'])
def cleanup_old_files():
    """Cleanup files older than specified minutes"""
    max_age_minutes = request.json.get('max_age_minutes', 60) if request.json else 60
    
    cleaned_files, cleaned_jobs = cleanup_service.cleanup_old_files(max_age_minutes)
    
    return jsonify({
        "message": f"Cleanup completed",
        "cleaned_files": cleaned_files,
        "cleaned_jobs": cleaned_jobs
    })