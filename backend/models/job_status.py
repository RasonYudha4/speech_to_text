from datetime import datetime
from typing import Dict, Optional, Any
from dataclasses import dataclass, asdict
import threading

# Status constants
STATUS_QUEUED = "queued"
STATUS_PROCESSING = "processing" 
STATUS_COMPLETED = "completed"
STATUS_ERROR = "error"
STATUS_CORRECTING = "correcting"
STATUS_MERGING = "merging"

@dataclass
class ChunkInfo:
    """Information about a chunk in a chunked job"""
    is_chunk: bool
    chunk_number: int
    total_chunks: int
    original_file_size: int
    original_job_id: str

@dataclass
class JobStatus:
    """Job status data model"""
    status: str
    filename: str
    safe_name: str
    queued_at: datetime
    file_size: int
    custom_name: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    correction_started_at: Optional[datetime] = None
    error: Optional[str] = None
    srt_url: Optional[str] = None
    output_path: Optional[str] = None
    correction_completed: Optional[bool] = None
    merged_from_chunks: Optional[bool] = None
    original_job: Optional[bool] = None
    total_chunks: Optional[int] = None
    chunks_processing: Optional[bool] = None
    chunk_info: Optional[ChunkInfo] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary with datetime serialization"""
        data = asdict(self)
        # Convert datetime objects to ISO strings
        for key in ['queued_at', 'started_at', 'completed_at', 'correction_started_at']:
            if data.get(key):
                data[key] = data[key].isoformat()
        return data

@dataclass 
class ChunkGroup:
    """Information about a group of chunks"""
    total_chunks: int
    filename: str
    custom_name: Optional[str]
    safe_name: str
    original_file_size: int

class JobStatusManager:
    """Thread-safe job status manager"""
    
    def __init__(self):
        self._processing_status: Dict[str, JobStatus] = {}
        self._chunk_groups: Dict[str, ChunkGroup] = {}
        self._lock = threading.Lock()
    
    def add_job(self, job_id: str, status: JobStatus) -> None:
        """Add a new job"""
        with self._lock:
            self._processing_status[job_id] = status
    
    def update_job(self, job_id: str, **updates) -> bool:
        """Update job status fields"""
        with self._lock:
            if job_id not in self._processing_status:
                return False
            
            job = self._processing_status[job_id]
            for key, value in updates.items():
                if hasattr(job, key):
                    setattr(job, key, value)
            return True
    
    def get_job(self, job_id: str) -> Optional[JobStatus]:
        """Get job status"""
        with self._lock:
            return self._processing_status.get(job_id)
    
    def remove_job(self, job_id: str) -> bool:
        """Remove job from status tracking"""
        with self._lock:
            if job_id in self._processing_status:
                del self._processing_status[job_id]
                return True
            return False
    
    def get_all_jobs(self) -> Dict[str, JobStatus]:
        """Get all job statuses"""
        with self._lock:
            return self._processing_status.copy()
    
    def add_chunk_group(self, group_id: str, chunk_group: ChunkGroup) -> None:
        """Add chunk group information"""
        with self._lock:
            self._chunk_groups[group_id] = chunk_group
    
    def get_chunk_group(self, group_id: str) -> Optional[ChunkGroup]:
        """Get chunk group information"""
        with self._lock:
            return self._chunk_groups.get(group_id)
    
    def remove_chunk_group(self, group_id: str) -> bool:
        """Remove chunk group"""
        with self._lock:
            if group_id in self._chunk_groups:
                del self._chunk_groups[group_id]
                return True
            return False
    
    def get_job_counts(self) -> Dict[str, int]:
        """Get counts of jobs by status"""
        with self._lock:
            counts = {}
            for status_obj in self._processing_status.values():
                status = status_obj.status
                counts[status] = counts.get(status, 0) + 1
            return counts
    
    def cleanup_old_jobs(self, max_age_seconds: int) -> int:
        """Remove jobs older than max_age_seconds"""
        current_time = datetime.now()
        jobs_to_remove = []
        
        with self._lock:
            for job_id, status in self._processing_status.items():
                if status.completed_at:
                    age = (current_time - status.completed_at).total_seconds()
                    if age > max_age_seconds:
                        jobs_to_remove.append(job_id)
            
            for job_id in jobs_to_remove:
                del self._processing_status[job_id]
            
            # Clean orphaned chunk groups
            chunk_groups_to_remove = []
            for group_id in self._chunk_groups.keys():
                if group_id not in self._processing_status:
                    chunk_groups_to_remove.append(group_id)
            
            for group_id in chunk_groups_to_remove:
                del self._chunk_groups[group_id]
        
        return len(jobs_to_remove)

# Global instance
job_manager = JobStatusManager()