import queue
import threading
from typing import Dict, Any
from datetime import datetime

class QueueService:
    """Service for managing processing queue and worker threads"""
    
    def __init__(self):
        self.processing_queue = queue.Queue()
        self.worker_threads = []
        self._shutdown = False
        
    def start_workers(self, worker_count: int = 1, worker_function=None):
        """Start background worker threads"""
        if worker_function is None:
            raise ValueError("Worker function must be provided")
            
        for i in range(worker_count):
            worker_thread = threading.Thread(
                target=self._queue_worker, 
                args=(worker_function,), 
                daemon=True,
                name=f"QueueWorker-{i+1}"
            )
            worker_thread.start()
            self.worker_threads.append(worker_thread)
        
        print(f"Started {worker_count} queue worker threads")
    
    def add_job(self, job_data: Dict[str, Any]):
        """Add a job to the processing queue"""
        self.processing_queue.put(job_data)
    
    def get_queue_size(self) -> int:
        """Get current queue size"""
        return self.processing_queue.qsize()
    
    def shutdown(self):
        """Shutdown all worker threads"""
        self._shutdown = True
        # Send shutdown signals
        for _ in self.worker_threads:
            self.processing_queue.put(None)
    
    def _queue_worker(self, worker_function):
        """Background worker to process queued files"""
        while True:
            try:
                job_data = self.processing_queue.get(timeout=1)
                if job_data is None:  # Shutdown signal
                    break
                    
                # Call the worker function with job data
                worker_function(job_data)
                self.processing_queue.task_done()
                
            except queue.Empty:
                if self._shutdown:
                    break
                continue
            except Exception as e:
                print(f"Queue worker error: {e}")
                self.processing_queue.task_done()

# Global instance
queue_service = QueueService()