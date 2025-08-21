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

api_key1 = os.getenv("GOOGLE_API_KEY1")
api_key2 = os.getenv("GOOGLE_API_KEY2")
# Initialize Gemini client
client = genai.Client(api_key=api_key1)
corrector = genai.Client(api_key=api_key2)

# Queue system
processing_queue = queue.Queue()
processing_status = {}  # job_id -> status info
processing_lock = threading.Lock()

# Status constants
STATUS_QUEUED = "queued"
STATUS_PROCESSING = "processing"
STATUS_COMPLETED = "completed"
STATUS_ERROR = "error"
STATUS_CORRECTING = "correcting"

def correct_transcript(raw_transcript):
    """Use the corrector client to fix transcription issues"""
    try:
        correction_response = client.models.generate_content(
            model='gemini-2.5-flash',
            config=types.GenerateContentConfig(
                system_instruction='''
                You are a transcript correction specialist. Your job is to fix SRT format issues in transcriptions.
                
                Common issues to fix:
                1. Timecode format errors (ensure HH:MM:SS,mmm format with 3-digit milliseconds)
                2. Impossible time jumps (like 00:06:57 jumping to 07:07:27 instead of 00:07:27)
                3. Overlapping or backwards timecodes
                4. Missing sequence numbers
                5. Improper formatting
                
                Rules for correction:
                - Keep all original text content unchanged
                - Fix only the timecodes and formatting
                - Ensure logical time progression (no huge jumps or backwards movement)
                - Maintain proper SRT format with sequence numbers
                - Timecodes should be HH:MM:SS,mmm (with 3-digit milliseconds)
                - Each subtitle should have reasonable duration (typically 1-10 seconds)
                
                Examples of fixes needed:
                WRONG: 00:06:57,284 --> 07:07:27,510 (impossible jump)
                RIGHT: 00:06:57,284 --> 00:07:27,510
                
                WRONG: 00:09:59,260 --> 01:00:01,290 
                RIGHT: 00:09:59,260 --> 00:10:21,290

                WRONG: 01:14,848 --> 01:16,078 (no hours in SRT)
                RIGHT: 00:01:14,848 --> 00:01:16,078
                
                Return only the corrected SRT content, nothing else.

                Only start with the srt content, please delete this if you see any of it 
                ```srt
                1
                00:00:03,137 --> 00:00:19,267
                [music]
                ''',
                thinking_config=types.ThinkingConfig(thinking_budget=-1)
            ),
            contents=[f"Please correct the following SRT transcript:\n\n{raw_transcript}"]
        )
        
        return correction_response.text.strip() if correction_response and correction_response.text else raw_transcript
    
    except Exception as e:
        print(f"Correction failed: {e}")
        return raw_transcript

def process_audio_file(job_id, upload_path, output_path, filename):
    """Process a single audio file with correction"""
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
        response = corrector.models.generate_content(
            model='gemini-2.5-pro',
            config=types.GenerateContentConfig(
                system_instruction='''
                Please transcribe the provided audio into proper SRT format. Don't start with : ```srt and just directly return the SRT content.
                You may use this example as a guide:
                1
                00:00:01,000 --> 00:00:05,000
                Hello, this is an example of SRT format.


                or just like this : 
                1
                00:00:20,534 --> 00:00:24,244
                Assalamualaikum warahmatullahi wabarakatuh.

                2
                00:00:24,714 --> 00:00:28,324
                Waalaikumsalam warahmatullahi wabarakatuh.

                3
                00:00:44,064 --> 00:00:45,694
                By the way, abis ini kalian mau lanjut ke mana?

                4
                00:00:46,244 --> 00:00:48,344
                Kalau gue sih mau lanjutin ke UI ya, rencananya.

                5
                00:00:48,824 --> 00:00:51,194
                Wow. Uh. Kalau gue mau ke ITB.

                6
                00:00:52,994 --> 00:00:54,084
                Kalau lu, lanjut ke mana?

                7
                00:00:54,344 --> 00:00:58,684
                Gue sih belum tahu ya mau ke mana, tapi gue pengen ngambil bisnis manajemen supaya gue bisa ngelanjutin usaha bokap.

                8
                00:00:58,954 --> 00:01:00,774
                Keren keren. Keren ya. Keren.

                9
                00:01:02,174 --> 00:01:04,264
                Ton. Lu mau lanjut kuliah ke mana?

                Don't make this kind of mistake, always ensure that the timecodes are correct and the text is properly formatted.
                8
                00:00:58,954 --> 01:00:44,084
                Keren-keren ya? Keren-keren ya?
                There's no way that from 58 seconds to 1 hour and 44 seconds, there is no way that the text is still the same.
                You need to break it down into smaller segments. Please always remember that the miliseconds should contain 3 digits.

                and this one:
                110
                00:09:59,260 --> 01:00:21,290
                Alhamdulillah ya, Bu, ya. Laki-laki bayinya ya.

                So, the timecode is wrong, it should be 00:09:59,260 --> 00:10:21,290

                Ensure that there's no timecode mistake like this:
                98
                00:06:57,284 --> 00:06:57,844
                Apapun.

                99
                07:07:27,510 --> 07:07:31,810
                Bapak, Bapak, Nak.
                
                There's no way that from 6 minutes and 57 seconds jump to 7 hours and 7 minutes. it should be 00:07:27,510 --> 00:07:31,810
                And this one : 
                119
                00:08:58,450 --> 00:08:59,000
                Bapak janji.

                120
                01:00:19,260 --> 01:00:21,290
                Alhamdulillah ya, Bu, ya. Laki-laki bayinya ya.
                There's no way that from 8 minutes and 58 seconds jump to 1 hour and 0 minutes, it should be 00:08:58,450 --> 00:08:59,000

                Once again, timecodes should be in the format of HH:MM:SS,mmm where mmm is milliseconds.
                ''',
                thinking_config=types.ThinkingConfig(thinking_budget=-1)
            ),
            contents=[
                types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
            ]
        )
        
        raw_transcript = response.text if response and response.text else None
        if not raw_transcript or not raw_transcript.strip():
            raise Exception("No transcript text returned")
        
        # Update status to correcting
        with processing_lock:
            processing_status[job_id]['status'] = STATUS_CORRECTING
            processing_status[job_id]['correction_started_at'] = datetime.now()
        
        # Use corrector to fix transcription issues
        print(f"Starting correction for job {job_id}")
        corrected_transcript = correct_transcript(raw_transcript.strip())
        
        # Save corrected transcript
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(corrected_transcript)
        
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
            processing_status[job_id]['correction_completed'] = True
            
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
    """Get status of all jobs - FIXED to maintain completed jobs"""
    with processing_lock:
        all_status = {}
        current_time = datetime.now()
        
        for job_id, status in processing_status.items():
            status_copy = status.copy()
            
            # Convert datetime objects to strings
            for key in ['queued_at', 'started_at', 'completed_at', 'correction_started_at']:
                if key in status_copy and status_copy[key]:
                    status_copy[key] = status_copy[key].isoformat()
            
            # For completed jobs, ensure SRT URL is available
            if status_copy.get('status') == STATUS_COMPLETED and status_copy.get('output_path'):
                output_path = status['output_path']  # Use original status for file check
                if os.path.exists(output_path):
                    # File still exists, keep the job in status
                    output_filename = os.path.basename(output_path)
                    status_copy['srt_url'] = f"/outputs/{output_filename}"
                    status_copy['file_available'] = True
                else:
                    # File was deleted, mark as expired but keep in status briefly
                    status_copy['file_available'] = False
                    status_copy['expired'] = True
            
            # Add download expiry information for completed jobs
            if status_copy.get('status') == STATUS_COMPLETED and status_copy.get('completed_at'):
                completed_time = datetime.fromisoformat(status_copy['completed_at'].replace('Z', '+00:00').replace('+00:00', ''))
                time_since_completion = (current_time - completed_time).total_seconds()
                download_expires_in = max(0, 3600 - time_since_completion)  # 1 hour = 3600 seconds
                status_copy['download_expires_in'] = int(download_expires_in)
                status_copy['download_expired'] = download_expires_in <= 0
            
            all_status[job_id] = status_copy
    
    return jsonify(all_status)

@app.route('/outputs/<path:filename>')
def serve_srt(filename):
    """Serve SRT file with improved cleanup handling"""
    file_path = os.path.join(OUTPUT_FOLDER, filename)
    
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found or has expired"}), 404
    
    # Schedule cleanup of the SRT file after serving
    def cleanup_after_delay():
        time.sleep(3600)  # Wait 1 hour before cleanup
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"Auto-deleted SRT file after 1 hour: {file_path}")
                
                # Mark job as expired in processing status (don't remove completely yet)
                with processing_lock:
                    for job_id, status in processing_status.items():
                        if status.get('output_path') == file_path:
                            status['file_expired'] = True
                            status['expired_at'] = datetime.now()
                            break
                        
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