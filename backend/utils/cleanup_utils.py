import os
import time
import threading
from datetime import datetime
from typing import List
from config import Config
from models.job_status import job_manager

class CleanupService:
    """Service for handling file and status cleanup"""
    
    def __init__(self):
        self._cleanup_thread = None
        self._shutdown = False
    
    def start_scheduled_cleanup(self):
        """Start the background cleanup thread"""
        if self._cleanup_thread and self._cleanup_thread.is_alive():
            return
        
        self._cleanup_thread = threading.Thread(
            target=self._scheduled_cleanup_worker, 
            daemon=True,
            name="CleanupWorker"
        )
        self._cleanup_thread.start()
        print("Started scheduled cleanup thread")
    
    def cleanup_old_files(self, max_age_minutes: int = None) -> List[str]:
        """Cleanup files older than specified minutes"""
        if max_age_minutes is None:
            max_age_minutes = Config.FILE_CLEANUP_AGE / 60  # Convert seconds to minutes
        
        cleaned_files = []
        current_time = datetime.now()
        
        # Clean output files
        try:
            for filename in os.listdir(Config.OUTPUT_FOLDER):
                file_path = os.path.join(Config.OUTPUT_FOLDER, filename)
                if os.path.isfile(file_path):
                    file_age = current_time - datetime.fromtimestamp(os.path.getmtime(file_path))
                    if file_age.total_seconds() > (max_age_minutes * 60):
                        os.remove(file_path)
                        cleaned_files.append(f"outputs/{filename}")
        except Exception as e:
            print(f"Error cleaning output folder: {e}")
        
        # Clean upload files (should be rare since they're deleted after processing)
        try:
            for filename in os.listdir(Config.UPLOAD_FOLDER):
                file_path = os.path.join(Config.UPLOAD_FOLDER, filename)
                if os.path.isfile(file_path):
                    file_age = current_time - datetime.fromtimestamp(os.path.getmtime(file_path))
                    if file_age.total_seconds() > (max_age_minutes * 60):
                        os.remove(file_path)
                        cleaned_files.append(f"uploads/{filename}")
        except Exception as e:
            print(f"Error cleaning upload folder: {e}")
        
        # Clean old job statuses
        cleaned_jobs = job_manager.cleanup_old_jobs(Config.STATUS_CLEANUP_AGE)
        
        return cleaned_files, cleaned_jobs
    
    def schedule_file_deletion(self, file_path: str, delay_seconds: int = None):
        """Schedule a file for deletion after a delay"""
        if delay_seconds is None:
            delay_seconds = Config.DOWNLOAD_CLEANUP_DELAY
        
        def cleanup_after_delay():
            time.sleep(delay_seconds)
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"Auto-deleted file: {file_path}")
                    
                    # Also remove from processing status
                    job_to_remove = None
                    all_jobs = job_manager.get_all_jobs()
                    for job_id, status in all_jobs.items():
                        if status.output_path == file_path:
                            job_to_remove = job_id
                            break
                    
                    if job_to_remove:
                        job_manager.remove_job(job_to_remove)
                        print(f"Removed job {job_to_remove} from status tracking")
                        
            except Exception as e:
                print(f"Error cleaning up file {file_path}: {e}")
        
        # Start cleanup thread
        cleanup_thread = threading.Thread(target=cleanup_after_delay, daemon=True)
        cleanup_thread.start()
    
    def _scheduled_cleanup_worker(self):
        """Background cleanup that runs periodically"""
        while not self._shutdown:
            try:
                time.sleep(Config.CLEANUP_INTERVAL)
                current_time = datetime.now()
                cleaned_count = 0
                
                # Auto-clean files older than configured time
                for folder in [Config.OUTPUT_FOLDER, Config.UPLOAD_FOLDER]:
                    try:
                        for filename in os.listdir(folder):
                            file_path = os.path.join(folder, filename)
                            if os.path.isfile(file_path):
                                file_age = current_time - datetime.fromtimestamp(os.path.getmtime(file_path))
                                if file_age.total_seconds() > Config.FILE_CLEANUP_AGE:
                                    os.remove(file_path)
                                    cleaned_count += 1
                                    print(f"Auto-cleaned old file: {file_path}")
                    except Exception as e:
                        print(f"Error in scheduled cleanup for {folder}: {e}")
                
                # Clean old job statuses
                cleaned_jobs = job_manager.cleanup_old_jobs(Config.STATUS_CLEANUP_AGE)
                
                if cleaned_count > 0 or cleaned_jobs > 0:
                    print(f"Scheduled cleanup: {cleaned_count} files, {cleaned_jobs} job statuses")
                    
            except Exception as e:
                print(f"Error in scheduled cleanup: {e}")
    
    def shutdown(self):
        """Shutdown the cleanup service"""
        self._shutdown = True

# Global instance
cleanup_service = CleanupService()