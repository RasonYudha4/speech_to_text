import os
from dotenv import load_dotenv
import mimetypes
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from google import genai
from google.genai import types
import threading
import queue
import time
from datetime import datetime
import uuid

load_dotenv()

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "outputs"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

api_key = os.getenv("GOOGLE_API_KEY")
# Initialize Gemini client
client = genai.Client(api_key=api_key)

# Queue system
processing_queue = queue.Queue()
processing_status = {}  # job_id -> status info
processing_lock = threading.Lock()

# Status constants
STATUS_QUEUED = "queued"
STATUS_PROCESSING = "processing"
STATUS_COMPLETED = "completed"
STATUS_ERROR = "error"

def process_audio_file(job_id, upload_path, output_path, filename):
    """Process a single audio file"""
    with processing_lock:
        processing_status[job_id]['status'] = STATUS_PROCESSING
        processing_status[job_id]['started_at'] = datetime.now()
    
    try:
        # Detect MIME type
        mime_type, _ = mimetypes.guess_type(upload_path)
        if mime_type is None:
            mime_type = "audio/mpeg"
        
        # Read audio
        with open(upload_path, 'rb') as f:
            audio_bytes = f.read()
        
        # Call Gemini for transcription
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            config=types.GenerateContentConfig(
                system_instruction='''
                Transcribe the provided audio into SRT format with proper timestamps.
                Ensure the output is in valid SRT format with correct numbering and timestamps.
                Do not include any additional text or explanations.
                ''',
                thinking_config=types.ThinkingConfig(thinking_budget=-1)
            ),
            contents=[
                "Transcribe this dialogue into proper SRT format with timestamps.",
                types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
            ]
        )
        
        transcript_text = response.text if response and response.text else None
        if not transcript_text or not transcript_text.strip():
            raise Exception("No transcript text returned")
        
        # Save transcript
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(transcript_text.strip())
        
        # Delete uploaded file after processing
        try:
            os.remove(upload_path)
            print(f"Cleaned up uploaded file: {upload_path}")
        except Exception as e:
            print(f"Warning: Could not clean up uploaded file {upload_path}: {e}")
        
        # Get the output filename for the URL
        output_filename = os.path.basename(output_path)
        
        # Update status
        with processing_lock:
            processing_status[job_id]['status'] = STATUS_COMPLETED
            processing_status[job_id]['completed_at'] = datetime.now()
            processing_status[job_id]['srt_url'] = f"/outputs/{output_filename}"
            processing_status[job_id]['output_path'] = output_path  # Store for cleanup
            
    except Exception as e:
        # Clean up upload file on error
        try:
            if os.path.exists(upload_path):
                os.remove(upload_path)
        except:
            pass
            
        with processing_lock:
            processing_status[job_id]['status'] = STATUS_ERROR
            processing_status[job_id]['error'] = str(e)
            processing_status[job_id]['completed_at'] = datetime.now()

def queue_worker():
    """Background worker to process queued files"""
    while True:
        try:
            job_data = processing_queue.get(timeout=1)
            if job_data is None:  # Shutdown signal
                break
                
            job_id = job_data['job_id']
            upload_path = job_data['upload_path']
            output_path = job_data['output_path']
            filename = job_data['filename']
            
            process_audio_file(job_id, upload_path, output_path, filename)
            processing_queue.task_done()
            
        except queue.Empty:
            continue
        except Exception as e:
            print(f"Queue worker error: {e}")

# Start background worker thread
worker_thread = threading.Thread(target=queue_worker, daemon=True)
worker_thread.start()

@app.route('/upload', methods=['POST'])
def upload_files():
    if 'files' not in request.files:
        return jsonify({"error": "No files part"}), 400
    
    files = request.files.getlist('files')
    custom_names = request.form.getlist('filenames')  # Array of custom names
    
    if not files or len(files) == 0:
        return jsonify({"error": "No files provided"}), 400
    
    if len(files) > 5:
        return jsonify({"error": "Maximum 5 files allowed"}), 400
    
    job_ids = []
    
    for i, file in enumerate(files):
        if file.filename == '':
            continue
            
        # Generate unique job ID
        job_id = str(uuid.uuid4())
        
        # Use custom filename if provided
        custom_name = custom_names[i] if i < len(custom_names) and custom_names[i] else None
        if custom_name:
            base_name = os.path.splitext(custom_name)[0]
        else:
            base_name = os.path.splitext(file.filename)[0]
        
        # Ensure safe filename
        safe_name = base_name.replace(" ", "_")
        file_ext = os.path.splitext(file.filename)[1]
        upload_filename = f"{job_id}_{safe_name}{file_ext}"
        upload_path = os.path.join(UPLOAD_FOLDER, upload_filename)
        
        # Save uploaded file
        file.save(upload_path)
        
        # Prepare output path - use the safe_name which is either custom or original
        output_filename = f"{safe_name}.srt"
        output_path = os.path.join(OUTPUT_FOLDER, output_filename)
        
        # Initialize job status
        with processing_lock:
            processing_status[job_id] = {
                'status': STATUS_QUEUED,
                'filename': file.filename,
                'custom_name': custom_name,
                'safe_name': safe_name,
                'queued_at': datetime.now(),
                'file_size': os.path.getsize(upload_path)
            }
        
        # Add to processing queue
        processing_queue.put({
            'job_id': job_id,
            'upload_path': upload_path,
            'output_path': output_path,
            'filename': file.filename
        })
        
        job_ids.append(job_id)
    
    return jsonify({
        "message": f"Successfully queued {len(job_ids)} files for processing",
        "job_ids": job_ids
    })

@app.route('/status/<job_id>')
def get_job_status(job_id):
    """Get status of a specific job"""
    with processing_lock:
        if job_id not in processing_status:
            return jsonify({"error": "Job not found"}), 404
        
        status_data = processing_status[job_id].copy()
    
    # Convert datetime objects to strings
    for key in ['queued_at', 'started_at', 'completed_at']:
        if key in status_data and status_data[key]:
            status_data[key] = status_data[key].isoformat()
    
    return jsonify(status_data)

@app.route('/status')
def get_all_status():
    """Get status of all jobs"""
    with processing_lock:
        all_status = {}
        for job_id, status in processing_status.items():
            status_copy = status.copy()
            # Convert datetime objects to strings
            for key in ['queued_at', 'started_at', 'completed_at']:
                if key in status_copy and status_copy[key]:
                    status_copy[key] = status_copy[key].isoformat()
            all_status[job_id] = status_copy
    
    return jsonify(all_status)

@app.route('/outputs/<path:filename>')
def serve_srt(filename):
    file_path = os.path.join(OUTPUT_FOLDER, filename)
    
    # Schedule cleanup of the SRT file after serving
    def cleanup_after_delay():
        time.sleep(30)  # Wait 30 seconds to ensure download completes
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"Auto-deleted SRT file: {file_path}")
                
                # Also remove from processing status
                with processing_lock:
                    job_to_remove = None
                    for job_id, status in processing_status.items():
                        if status.get('output_path') == file_path:
                            job_to_remove = job_id
                            break
                    
                    if job_to_remove:
                        del processing_status[job_to_remove]
                        print(f"Removed job {job_to_remove} from status tracking")
                        
        except Exception as e:
            print(f"Error cleaning up SRT file {file_path}: {e}")
    
    # Start cleanup thread
    cleanup_thread = threading.Thread(target=cleanup_after_delay, daemon=True)
    cleanup_thread.start()
    
    return send_from_directory(OUTPUT_FOLDER, filename, as_attachment=True)

@app.route('/queue/info')
def queue_info():
    """Get queue information"""
    with processing_lock:
        queued_count = sum(1 for status in processing_status.values() if status['status'] == STATUS_QUEUED)
        processing_count = sum(1 for status in processing_status.values() if status['status'] == STATUS_PROCESSING)
        completed_count = sum(1 for status in processing_status.values() if status['status'] == STATUS_COMPLETED)
        error_count = sum(1 for status in processing_status.values() if status['status'] == STATUS_ERROR)
    
    return jsonify({
        "queue_size": processing_queue.qsize(),
        "queued": queued_count,
        "processing": processing_count,
        "completed": completed_count,
        "error": error_count
    })

@app.route('/cleanup/old-files', methods=['POST'])
def cleanup_old_files():
    """Cleanup files older than specified minutes"""
    max_age_minutes = request.json.get('max_age_minutes', 60)  # Default 1 hour
    cleaned_files = []
    current_time = datetime.now()
    
    # Clean output files
    try:
        for filename in os.listdir(OUTPUT_FOLDER):
            file_path = os.path.join(OUTPUT_FOLDER, filename)
            if os.path.isfile(file_path):
                file_age = current_time - datetime.fromtimestamp(os.path.getmtime(file_path))
                if file_age.total_seconds() > (max_age_minutes * 60):
                    os.remove(file_path)
                    cleaned_files.append(f"outputs/{filename}")
    except Exception as e:
        print(f"Error cleaning output folder: {e}")
    
    # Clean upload files (should be rare since they're deleted after processing)
    try:
        for filename in os.listdir(UPLOAD_FOLDER):
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            if os.path.isfile(file_path):
                file_age = current_time - datetime.fromtimestamp(os.path.getmtime(file_path))
                if file_age.total_seconds() > (max_age_minutes * 60):
                    os.remove(file_path)
                    cleaned_files.append(f"uploads/{filename}")
    except Exception as e:
        print(f"Error cleaning upload folder: {e}")
    
    # Clean old job statuses (older than 2 hours)
    with processing_lock:
        jobs_to_remove = []
        for job_id, status in processing_status.items():
            if 'completed_at' in status and status['completed_at']:
                job_age = current_time - status['completed_at']
                if job_age.total_seconds() > (2 * 60 * 60):  # 2 hours
                    jobs_to_remove.append(job_id)
        
        for job_id in jobs_to_remove:
            del processing_status[job_id]
    
    return jsonify({
        "message": f"Cleanup completed",
        "cleaned_files": cleaned_files,
        "cleaned_jobs": len(jobs_to_remove) if 'jobs_to_remove' in locals() else 0
    })

# Auto cleanup scheduler (runs every hour)
def scheduled_cleanup():
    """Background cleanup that runs periodically"""
    while True:
        try:
            time.sleep(3600)  # Wait 1 hour
            current_time = datetime.now()
            cleaned_count = 0
            
            # Auto-clean files older than 2 hours
            for folder in [OUTPUT_FOLDER, UPLOAD_FOLDER]:
                try:
                    for filename in os.listdir(folder):
                        file_path = os.path.join(folder, filename)
                        if os.path.isfile(file_path):
                            file_age = current_time - datetime.fromtimestamp(os.path.getmtime(file_path))
                            if file_age.total_seconds() > (2 * 60 * 60):  # 2 hours
                                os.remove(file_path)
                                cleaned_count += 1
                                print(f"Auto-cleaned old file: {file_path}")
                except Exception as e:
                    print(f"Error in scheduled cleanup for {folder}: {e}")
            
            # Clean old job statuses
            with processing_lock:
                jobs_to_remove = []
                for job_id, status in processing_status.items():
                    if 'completed_at' in status and status['completed_at']:
                        job_age = current_time - status['completed_at']
                        if job_age.total_seconds() > (4 * 60 * 60):  # 4 hours for status
                            jobs_to_remove.append(job_id)
                
                for job_id in jobs_to_remove:
                    del processing_status[job_id]
            
            if cleaned_count > 0 or jobs_to_remove:
                print(f"Scheduled cleanup: {cleaned_count} files, {len(jobs_to_remove)} job statuses")
                
        except Exception as e:
            print(f"Error in scheduled cleanup: {e}")

# Start scheduled cleanup thread
cleanup_thread = threading.Thread(target=scheduled_cleanup, daemon=True)
cleanup_thread.start()

if __name__ == '__main__':
    app.run(debug=True)