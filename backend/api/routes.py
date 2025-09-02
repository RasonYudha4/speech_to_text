import os
from flask import Blueprint, request, jsonify, send_from_directory
from services.upload_service import UploadService
from services.job_service import JobService
from services.queue_service import queue_service
from services.file_service import FileService
from utils.cleanup_utils import cleanup_service
from config import Config

# Create blueprint
api = Blueprint('api', __name__)

# Initialize services
upload_service = UploadService()
job_service = JobService()
file_service = FileService()

@api.route('/upload', methods=['POST'])
def upload_files():
    """Upload and queue audio files for processing"""
    try:
        # Validate request
        validation_error = upload_service.validate_upload_request(request)
        if validation_error:
            return jsonify({"error": validation_error}), 400
        
        file = request.files.getlist('files')[0]
        custom_name = upload_service.get_custom_filename(request.form)
        
        # Process upload
        result = upload_service.process_upload(file, custom_name)
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({"error": f"Failed to process upload: {str(e)}"}), 500

@api.route('/status/<job_id>')
def get_job_status(job_id):
    """Get status of a specific job"""
    job_status = job_service.get_job_status(job_id)
    if not job_status:
        return jsonify({"error": "Job not found"}), 404
    
    return jsonify(job_status)

@api.route('/status')
def get_all_status():
    """Get status of all jobs"""
    all_status = job_service.get_all_jobs_status()
    return jsonify(all_status)

@api.route('/outputs/<path:filename>')
def serve_srt(filename):
    """Serve SRT files and schedule cleanup"""
    try:
        file_path = job_service.get_output_file_path(filename)
        if not file_path:
            return jsonify({"error": "File not found"}), 404
        
        # Schedule cleanup after serving
        cleanup_service.schedule_file_deletion(file_path)
        return send_from_directory(Config.OUTPUT_FOLDER, filename, as_attachment=True)
        
    except Exception as e:
        return jsonify({"error": "File not found"}), 404

@api.route('/queue/info')
def queue_info():
    """Get queue information"""
    queue_info = job_service.get_queue_info()
    return jsonify(queue_info)

@api.route('/cleanup/old-files', methods=['POST'])
def cleanup_old_files():
    """Cleanup files older than specified minutes"""
    max_age_minutes = request.json.get('max_age_minutes', 60) if request.json else 60
    
    result = job_service.cleanup_old_files(max_age_minutes)
    return jsonify(result)