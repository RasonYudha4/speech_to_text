import os
import threading
import queue
from datetime import datetime
from typing import List

from models.job_status import job_manager, STATUS_PROCESSING, STATUS_COMPLETED, STATUS_ERROR, STATUS_CORRECTING
from services.transcription_service import TranscriptionService
from services.correction_service import CorrectionService
from services.file_service import FileService
from utils.srt_utils import merge_srt_chunks
from config import Config

class AudioProcessor:
    """Main audio processing orchestration service"""
    
    def __init__(self):
        self.transcription_service = TranscriptionService()
        self.correction_service = CorrectionService()
        self.file_service = FileService()
    
    def process_audio_file(self, job_data):
        """Process a single audio file with correction and MP3 conversion"""
        job_id = job_data['job_id']
        upload_path = job_data['upload_path']
        output_path = job_data['output_path']
        filename = job_data['filename']
        
        try:
            # Update status to processing
            if not job_manager.update_job(job_id, status=STATUS_PROCESSING, started_at=datetime.now()):
                raise Exception(f"Job {job_id} not found in processing status")
            
            print(f"Processing job {job_id}: {filename}")
            print(f"Upload path: {upload_path}")
            print(f"Output path: {output_path}")
            
            # Convert to MP3 if necessary
            mp3_path, was_converted = self.file_service.ensure_mp3_format(upload_path, keep_original=False)
            
            if mp3_path is None:
                raise Exception(f"Failed to convert audio file to MP3 format")
            
            if was_converted:
                print(f"Converted audio file to MP3: {mp3_path}")
                # Update the upload_path to point to the MP3 file
                upload_path = mp3_path
            
            # Transcribe audio (now guaranteed to be MP3)
            raw_transcript = self.transcription_service.transcribe_audio(upload_path, job_id)
            
            # Update status to correcting
            job_manager.update_job(job_id, status=STATUS_CORRECTING, correction_started_at=datetime.now())
            
            print(f"Starting correction for job {job_id}")
            corrected_transcript = self.correction_service.correct_transcript(raw_transcript)
            print(f"Correction completed for job {job_id}")
            
            # Save transcript
            if not self.file_service.save_transcript(corrected_transcript, output_path):
                raise Exception("Failed to save transcript")
            
            # Clean up upload file (MP3 version)
            self.file_service.cleanup_file(upload_path)
            
            output_filename = os.path.basename(output_path)
            
            # Update status to completed
            job_manager.update_job(
                job_id,
                status=STATUS_COMPLETED,
                completed_at=datetime.now(),
                srt_url=f"/outputs/{output_filename}",
                output_path=output_path,
                correction_completed=True
            )
            
            print(f"Job {job_id} completed successfully")
            
            # Check if this is a chunk and if we need to merge
            if '_chunk_' in job_id:
                original_job_id = job_id.rsplit('_chunk_', 1)[0]
                print(f"Chunk {job_id} completed, checking for merge with original job {original_job_id}")
                # Run merge check in a separate thread to avoid blocking the worker
                merge_thread = threading.Thread(
                    target=self.check_and_merge_chunks, 
                    args=(original_job_id,), 
                    daemon=True
                )
                merge_thread.start()
                
        except Exception as e:
            error_msg = f"Error processing job {job_id}: {str(e)}"
            print(error_msg)
            print(f"Full error details: {repr(e)}")
            
            # Clean up upload file on error
            self.file_service.cleanup_file(upload_path)
                
            # Update job status to error
            job_manager.update_job(
                job_id,
                status=STATUS_ERROR,
                error=str(e),
                completed_at=datetime.now()
            )
            
            # If this is a chunk that failed, handle the original job too
            if '_chunk_' in job_id:
                original_job_id = job_id.rsplit('_chunk_', 1)[0]
                print(f"Chunk {job_id} failed, will check original job {original_job_id}")
                self.check_and_merge_chunks(original_job_id)
    
    def process_audio_file_with_chunking(self, job_data):
        """Process an audio file by splitting it into chunks first, then converting each to MP3"""
        job_id = job_data['job_id']
        upload_path = job_data['upload_path']
        filename = job_data['filename']
        
        try:
            # Update status to processing
            if not job_manager.update_job(job_id, status=STATUS_PROCESSING, started_at=datetime.now()):
                raise Exception(f"Job {job_id} not found in processing status")
            
            print(f"Processing job with chunking {job_id}: {filename}")
            print(f"Upload path: {upload_path}")
            
            # Get audio info before processing
            audio_info = self.file_service.get_audio_info(upload_path)
            print(f"Audio info: {audio_info}")
            
            # Convert to MP3 first if necessary
            mp3_path, was_converted = self.file_service.ensure_mp3_format(upload_path, keep_original=False)
            
            if mp3_path is None:
                raise Exception(f"Failed to convert audio file to MP3 format")
            
            if was_converted:
                print(f"Converted audio file to MP3: {mp3_path}")
                upload_path = mp3_path
            
            # Split the MP3 file into chunks
            print(f"Splitting audio file into chunks...")
            chunk_paths = self.file_service.split_audio_file(upload_path)
            
            if not chunk_paths:
                raise Exception("Failed to split audio file into chunks")
            
            print(f"Split into {len(chunk_paths)} chunks")
            
            # Register chunk group
            job_manager.add_chunk_group(job_id, len(chunk_paths), filename)
            
            # Queue each chunk for processing
            for i, chunk_path in enumerate(chunk_paths, 1):
                chunk_job_id = f"{job_id}_chunk_{i}"
                chunk_output_path = os.path.join(Config.OUTPUT_FOLDER, f"{job_id}_chunk_{i}.srt")
                
                chunk_job_data = {
                    'job_id': chunk_job_id,
                    'upload_path': chunk_path,
                    'output_path': chunk_output_path,
                    'filename': f"{filename}_chunk_{i}"
                }
                
                # Add chunk job to status tracking
                job_manager.add_job(
                    chunk_job_id,
                    f"{filename}_chunk_{i}",
                    chunk_path,
                    chunk_output_path
                )
                
                # Process chunk immediately (or add to queue if using a queue system)
                self.process_audio_file(chunk_job_data)
            
            # Clean up the original MP3 file after chunking
            self.file_service.cleanup_file(upload_path)
            
        except Exception as e:
            error_msg = f"Error processing chunked job {job_id}: {str(e)}"
            print(error_msg)
            print(f"Full error details: {repr(e)}")
            
            # Clean up upload file on error
            self.file_service.cleanup_file(upload_path)
            
            # Update job status to error
            job_manager.update_job(
                job_id,
                status=STATUS_ERROR,
                error=str(e),
                completed_at=datetime.now()
            )
    
    def check_and_merge_chunks(self, original_job_id: str) -> bool:
        """Check if all chunks for a job are completed and merge them"""
        try:
            chunk_group = job_manager.get_chunk_group(original_job_id)
            if not chunk_group:
                print(f"Original job {original_job_id} not found in chunk_groups")
                return False
            
            total_chunks = chunk_group.total_chunks
            completed_chunks = []
            failed_chunks = []
            processing_chunks = []
            
            print(f"Checking merge status for job {original_job_id}: need {total_chunks} chunks")
            
            # Check status of all chunks
            for i in range(1, total_chunks + 1):
                chunk_job_id = f"{original_job_id}_chunk_{i}"
                chunk_status = job_manager.get_job(chunk_job_id)
                
                if chunk_status:
                    status = chunk_status.status
                    
                    if status == STATUS_COMPLETED:
                        completed_chunks.append(chunk_status.output_path)
                        print(f"Chunk {i} completed: {chunk_status.output_path}")
                    elif status == STATUS_ERROR:
                        failed_chunks.append(i)
                        print(f"Chunk {i} failed: {chunk_status.error or 'Unknown error'}")
                    else:
                        processing_chunks.append(i)
                        print(f"Chunk {i} still {status}")
                else:
                    processing_chunks.append(i)
                    print(f"Chunk {i} not found in processing status")
            
            print(f"Status summary - Completed: {len(completed_chunks)}/{total_chunks}, Failed: {len(failed_chunks)}, Processing: {len(processing_chunks)}")
            
            # If any chunks failed, mark the whole job as failed
            if failed_chunks:
                job_manager.update_job(
                    original_job_id,
                    status=STATUS_ERROR,
                    error=f"Chunks {failed_chunks} failed processing",
                    completed_at=datetime.now()
                )
                print(f"Job {original_job_id} failed due to failed chunks: {failed_chunks}")
                return False
            
            # If not all chunks are completed yet, wait
            if len(completed_chunks) < total_chunks:
                print(f"Not ready to merge - only {len(completed_chunks)}/{total_chunks} chunks completed")
                return False
            
            # All chunks completed, proceed with merging
            print(f"All {total_chunks} chunks completed for job {original_job_id}, starting merge...")
            
            # Update status to merging
            job_manager.update_job(original_job_id, status='merging')
            
            # Merge chunks
            merged_output_path = os.path.join(Config.OUTPUT_FOLDER, f"{chunk_group.safe_name}.srt")
            print(f"Merging {len(completed_chunks)} chunks into {merged_output_path}")
            
            if merge_srt_chunks(completed_chunks, merged_output_path):
                # Update original job status
                job_manager.update_job(
                    original_job_id,
                    status=STATUS_COMPLETED,
                    completed_at=datetime.now(),
                    srt_url=f"/outputs/{chunk_group.safe_name}.srt",
                    output_path=merged_output_path,
                    merged_from_chunks=True
                )
                
                # Remove individual chunk statuses
                for i in range(1, total_chunks + 1):
                    chunk_job_id = f"{original_job_id}_chunk_{i}"
                    job_manager.remove_job(chunk_job_id)
                    print(f"Removed chunk status: {chunk_job_id}")
                
                # Clean up chunk group
                job_manager.remove_chunk_group(original_job_id)
                print(f"Cleaned up chunk group: {original_job_id}")
                
                print(f"Successfully merged all chunks for job {original_job_id}")
                return True
            else:
                job_manager.update_job(
                    original_job_id,
                    status=STATUS_ERROR,
                    error='Failed to merge chunks',
                    completed_at=datetime.now()
                )
                print(f"Failed to merge chunks for job {original_job_id}")
                return False
                
        except Exception as e:
            print(f"Error in check_and_merge_chunks for {original_job_id}: {e}")
            print(f"Full merge error details: {repr(e)}")
            job_manager.update_job(
                original_job_id,
                status=STATUS_ERROR,
                error=f'Merge process failed: {str(e)}',
                completed_at=datetime.now()
            )
            return False
    
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
                try:
                    self.processing_queue.task_done()
                except:
                    pass