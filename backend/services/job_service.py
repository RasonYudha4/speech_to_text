import os
from datetime import datetime
from models.job_status import job_manager, STATUS_COMPLETED, STATUS_QUEUED, STATUS_ERROR
from utils.cleanup_utils import cleanup_service
from services.queue_service import queue_service
from config import Config

class JobService:
    def get_job_status(self, job_id):
        """Get status of a specific job"""
        job = job_manager.get_job(job_id)
        if not job:
            return None
        
        return job.to_dict()
    
    def get_all_jobs_status(self):
        """Get status of all jobs with additional metadata"""
        all_jobs = job_manager.get_all_jobs()
        current_time = datetime.now()
        
        all_status = {}
        for job_id, job in all_jobs.items():
            status_data = job.to_dict()
            
            if job.status == STATUS_COMPLETED and job.output_path:
                self._add_file_availability_info(status_data, job.output_path)
            
            if job.status == STATUS_COMPLETED and job.completed_at:
                self._add_expiry_info(status_data, job.completed_at, current_time)
            
            all_status[job_id] = status_data
        
        return all_status
    
    def _add_file_availability_info(self, status_data, output_path):
        """Add file availability information to status data"""
        if os.path.exists(output_path):
            output_filename = os.path.basename(output_path)
            status_data['srt_url'] = f"/outputs/{output_filename}"
            status_data['file_available'] = True
        else:
            status_data['file_available'] = False
            status_data['expired'] = True
    
    def _add_expiry_info(self, status_data, completed_at, current_time):
        """Add expiry information to status data"""
        time_since_completion = (current_time - completed_at).total_seconds()
        download_expires_in = max(0, Config.DOWNLOAD_EXPIRES_TIME - time_since_completion)
        status_data['download_expires_in'] = int(download_expires_in)
        status_data['download_expired'] = download_expires_in <= 0
    
    def get_output_file_path(self, filename):
        """Get the full path for an output file if it exists"""
        file_path = os.path.join(Config.OUTPUT_FOLDER, filename)
        return file_path if os.path.exists(file_path) else None
    
    def get_queue_info(self):
        """Get comprehensive queue information"""
        counts = job_manager.get_job_counts()
        
        return {
            "queue_size": queue_service.get_queue_size(),
            "queued": counts.get(STATUS_QUEUED, 0),
            "processing": counts.get('processing', 0),
            "merging": counts.get('merging', 0),
            "completed": counts.get(STATUS_COMPLETED, 0),
            "error": counts.get(STATUS_ERROR, 0)
        }
    
    def cleanup_old_files(self, max_age_minutes):
        """Cleanup files older than specified minutes"""
        cleaned_files, cleaned_jobs = cleanup_service.cleanup_old_files(max_age_minutes)
        
        return {
            "message": "Cleanup completed",
            "cleaned_files": cleaned_files,
            "cleaned_jobs": cleaned_jobs
        }
    
job_service = JobService()