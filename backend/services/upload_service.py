import os
import uuid
from datetime import datetime
from flask import request
from config import Config
from models.job_status import job_manager, JobStatus, ChunkGroup, ChunkInfo, STATUS_QUEUED
from services.file_service import FileService
from services.queue_service import queue_service

class UploadService:
    def __init__(self):
        self.file_service = FileService()
    
    def validate_upload_request(self, request):
        """Validate the upload request"""
        if 'files' not in request.files:
            return "No files part"
        
        files = request.files.getlist('files')
        
        if not files or len(files) == 0:
            return "No file provided"
        
        if len(files) > 1:
            return "Only one file upload is allowed"
        
        file = files[0]
        
        if file.filename == '':
            return "No file selected"
        
        # Validate file type
        if not self.file_service.validate_file_type(file.filename):
            file_ext = os.path.splitext(file.filename)[1].lower()
            return f"File type {file_ext} not supported. Allowed types: {', '.join(Config.ALLOWED_EXTENSIONS)}"
        
        return None
    
    def get_custom_filename(self, form_data):
        """Extract custom filename from form data"""
        custom_names = form_data.getlist('filenames')
        return custom_names[0] if custom_names and custom_names[0] else None
    
    def process_upload(self, file, custom_name):
        """Process the file upload and create appropriate jobs"""
        job_id = str(uuid.uuid4())
        safe_name = self.file_service.generate_safe_filename(file.filename, custom_name)
        
        file_ext = os.path.splitext(file.filename)[1]
        upload_filename = f"{job_id}_{safe_name}{file_ext}"
        upload_path = os.path.join(Config.UPLOAD_FOLDER, upload_filename)
        
        file.save(upload_path)
        file_size = os.path.getsize(upload_path)
        
        try:
            chunk_paths = self.file_service.split_audio_file(upload_path)
            
            if len(chunk_paths) > 1:
                return self._create_chunked_job(
                    job_id, chunk_paths, file, custom_name, safe_name, file_size
                )
            else:
                return self._create_single_job(
                    job_id, chunk_paths[0], file, custom_name, safe_name, file_size
                )
                
        except Exception as e:
            self.file_service.cleanup_file(upload_path)
            raise e
    
    def _create_chunked_job(self, job_id, chunk_paths, file, custom_name, safe_name, file_size):
        """Create job for file that was split into chunks"""
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
        
        # Create and queue chunk jobs
        chunk_job_ids = self._create_chunk_jobs(job_id, chunk_paths, file, custom_name, safe_name, file_size)
        
        return {
            "message": f"File split into {len(chunk_paths)} chunks and queued for processing",
            "job_id": job_id,
            "chunk_job_ids": chunk_job_ids,
            "original_file_size": file_size,
            "chunk_count": len(chunk_paths),
            "chunk_size_mb": Config.CHUNK_SIZE / (1024 * 1024),
            "note": "Track progress using the main job_id. Chunks will be automatically merged when complete."
        }
    
    def _create_chunk_jobs(self, parent_job_id, chunk_paths, file, custom_name, safe_name, file_size):
        """Create individual chunk jobs"""
        job_ids = []
        
        for i, chunk_path in enumerate(chunk_paths):
            chunk_job_id = f"{parent_job_id}_chunk_{i+1}"

            job_manager.update_job(
            parent_job_id,
            chunk_statuses={**(job_manager.get_job(parent_job_id).chunk_statuses or {}), 
                            chunk_job_id: {
                                "status": STATUS_QUEUED,
                                "chunk_number": i+1,
                                "total_chunks": len(chunk_paths),
                                "file_size": os.path.getsize(chunk_path),
                                "upload_path": chunk_path
                            }}
            )
            
            queue_service.add_job({
                'job_id': chunk_job_id,
                'upload_path': chunk_path,
                'output_path': os.path.join(Config.OUTPUT_FOLDER, f"{safe_name}_chunk_{i+1}.srt"),
                'filename': os.path.basename(chunk_path)
            })

            job_ids.append(chunk_job_id)
        
        return job_ids
    
    def _create_single_job(self, job_id, file_path, file, custom_name, safe_name, file_size):
        """Create job for single file (no chunking needed)"""
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
        
        return {
            "message": "File queued for processing",
            "job_id": job_id,
            "file_size": file_size
        }
    
upload_service = UploadService()