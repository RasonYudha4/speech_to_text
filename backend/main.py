from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from google import genai
from google.genai import types
from datetime import datetime
from werkzeug.utils import secure_filename
import os
import mimetypes
import threading
import queue
import time
import uuid
import whisper
import math
import re

load_dotenv()

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "outputs"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

api_key1 = os.getenv("GOOGLE_API_KEY1")
api_key2 = os.getenv("GOOGLE_API_KEY2")
# Initialize models
free = genai.Client(api_key=api_key1)
pro = genai.Client(api_key=api_key2)
translator = whisper.load_model("turbo")  

# Queue system
processing_queue = queue.Queue()
processing_status = {}  
processing_lock = threading.Lock()
chunk_groups = {}  # Track chunks belonging to the same original file

# Status constants
STATUS_QUEUED = "queued"
STATUS_PROCESSING = "processing"
STATUS_COMPLETED = "completed"
STATUS_ERROR = "error"
STATUS_CORRECTING = "correcting"
STATUS_MERGING = "merging"

CHUNK_SIZE = 25 * 1024 * 1024

def correct_transcript(raw_transcript):
    """Use the corrector client to fix transcription issues"""
    try:
        correction_response = free.models.generate_content(
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
                - Make sure there are no impossible jumps in timecodes
                - Max sentence length should be reasonable (around 40-50 characters per line)
                
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

def parse_srt_time(time_str):
    """Parse SRT time format to seconds"""
    try:
        time_part, ms_part = time_str.split(',')
        h, m, s = map(int, time_part.split(':'))
        ms = int(ms_part)
        return h * 3600 + m * 60 + s + ms / 1000
    except:
        return 0

def format_srt_time(seconds):
    """Format seconds to SRT time format"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def merge_srt_chunks(chunk_files, output_path):
    """Merge multiple SRT chunk files into one continuous SRT file"""
    try:
        merged_content = []
        current_subtitle_number = 1
        time_offset = 0
        
        # Sort chunk files by chunk number
        chunk_files.sort(key=lambda x: int(re.search(r'chunk_(\d+)', x).group(1)) if re.search(r'chunk_(\d+)', x) else 0)
        
        for i, chunk_file in enumerate(chunk_files):
            if not os.path.exists(chunk_file):
                print(f"Warning: Chunk file {chunk_file} not found")
                continue
                
            with open(chunk_file, 'r', encoding='utf-8') as f:
                chunk_content = f.read().strip()
            
            if not chunk_content:
                continue
            
            # Parse SRT content
            subtitles = re.findall(r'(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n(.*?)(?=\n\d+\n|\Z)', chunk_content, re.DOTALL)
            
            chunk_max_time = 0
            
            for subtitle in subtitles:
                seq_num, start_time, end_time, text = subtitle
                
                # Parse times and apply offset
                start_seconds = parse_srt_time(start_time) + time_offset
                end_seconds = parse_srt_time(end_time) + time_offset
                
                # Track the maximum time for this chunk
                chunk_max_time = max(chunk_max_time, end_seconds)
                
                # Format the merged subtitle
                merged_subtitle = f"{current_subtitle_number}\n{format_srt_time(start_seconds)} --> {format_srt_time(end_seconds)}\n{text.strip()}\n"
                merged_content.append(merged_subtitle)
                current_subtitle_number += 1
            
            # Update time offset for next chunk (add small gap between chunks)
            time_offset = chunk_max_time + 0.1  # 100ms gap between chunks
            
            # Clean up chunk file
            try:
                os.remove(chunk_file)
                print(f"Cleaned up chunk file: {chunk_file}")
            except Exception as e:
                print(f"Warning: Could not clean up chunk file {chunk_file}: {e}")
        
        # Write merged content
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(merged_content))
        
        print(f"Successfully merged {len(chunk_files)} chunks into {output_path}")
        return True
        
    except Exception as e:
        print(f"Error merging SRT chunks: {e}")
        return False

def check_and_merge_chunks(original_job_id):
    """Check if all chunks for a job are completed and merge them"""
    try:
        with processing_lock:
            if original_job_id not in chunk_groups:
                print(f"Original job {original_job_id} not found in chunk_groups")
                return False
            
            chunk_info = chunk_groups[original_job_id]
            total_chunks = chunk_info['total_chunks']
            completed_chunks = []
            failed_chunks = []
            processing_chunks = []
            
            print(f"Checking merge status for job {original_job_id}: need {total_chunks} chunks")
            
            # Check status of all chunks
            for i in range(1, total_chunks + 1):
                chunk_job_id = f"{original_job_id}_chunk_{i}"
                if chunk_job_id in processing_status:
                    chunk_status = processing_status[chunk_job_id]
                    status = chunk_status['status']
                    
                    if status == STATUS_COMPLETED:
                        completed_chunks.append(chunk_status.get('output_path'))
                        print(f"Chunk {i} completed: {chunk_status.get('output_path')}")
                    elif status == STATUS_ERROR:
                        failed_chunks.append(i)
                        print(f"Chunk {i} failed: {chunk_status.get('error', 'Unknown error')}")
                    else:
                        processing_chunks.append(i)
                        print(f"Chunk {i} still {status}")
                else:
                    processing_chunks.append(i)
                    print(f"Chunk {i} not found in processing status")
            
            print(f"Status summary - Completed: {len(completed_chunks)}/{total_chunks}, Failed: {len(failed_chunks)}, Processing: {len(processing_chunks)}")
            
            # If any chunks failed, mark the whole job as failed
            if failed_chunks:
                if original_job_id in processing_status:
                    processing_status[original_job_id].update({
                        'status': STATUS_ERROR,
                        'error': f"Chunks {failed_chunks} failed processing",
                        'completed_at': datetime.now()
                    })
                print(f"Job {original_job_id} failed due to failed chunks: {failed_chunks}")
                return False
            
            # If not all chunks are completed yet, wait
            if len(completed_chunks) < total_chunks:
                print(f"Not ready to merge - only {len(completed_chunks)}/{total_chunks} chunks completed")
                return False
            
            # All chunks completed, proceed with merging
            print(f"All {total_chunks} chunks completed for job {original_job_id}, starting merge...")
            
            # Update status to merging
            if original_job_id in processing_status:
                processing_status[original_job_id].update({
                    'status': STATUS_MERGING,
                    'started_at': datetime.now() if 'started_at' not in processing_status[original_job_id] else processing_status[original_job_id]['started_at']
                })
        
        # Merge chunks outside the lock
        merged_output_path = os.path.join(OUTPUT_FOLDER, f"{chunk_info['safe_name']}.srt")
        print(f"Merging {len(completed_chunks)} chunks into {merged_output_path}")
        
        if merge_srt_chunks(completed_chunks, merged_output_path):
            with processing_lock:
                # Update original job status
                if original_job_id in processing_status:
                    processing_status[original_job_id].update({
                        'status': STATUS_COMPLETED,
                        'completed_at': datetime.now(),
                        'srt_url': f"/outputs/{chunk_info['safe_name']}.srt",
                        'output_path': merged_output_path,
                        'merged_from_chunks': True
                    })
                
                # Remove individual chunk statuses
                chunk_jobs_to_remove = []
                for i in range(1, total_chunks + 1):
                    chunk_job_id = f"{original_job_id}_chunk_{i}"
                    if chunk_job_id in processing_status:
                        chunk_jobs_to_remove.append(chunk_job_id)
                
                for chunk_job_id in chunk_jobs_to_remove:
                    del processing_status[chunk_job_id]
                    print(f"Removed chunk status: {chunk_job_id}")
                
                # Clean up chunk group
                del chunk_groups[original_job_id]
                print(f"Cleaned up chunk group: {original_job_id}")
            
            print(f"Successfully merged all chunks for job {original_job_id}")
            return True
        else:
            with processing_lock:
                if original_job_id in processing_status:
                    processing_status[original_job_id].update({
                        'status': STATUS_ERROR,
                        'error': 'Failed to merge chunks',
                        'completed_at': datetime.now()
                    })
            print(f"Failed to merge chunks for job {original_job_id}")
            return False
            
    except Exception as e:
        print(f"Error in check_and_merge_chunks for {original_job_id}: {e}")
        print(f"Full merge error details: {repr(e)}")
        with processing_lock:
            if original_job_id in processing_status:
                processing_status[original_job_id].update({
                    'status': STATUS_ERROR,
                    'error': f'Merge process failed: {str(e)}',
                    'completed_at': datetime.now()
                })
        return False

def process_audio_file(job_id, upload_path, output_path, filename):
    """Process a single audio file with correction"""
    try:
        with processing_lock:
            if job_id not in processing_status:
                raise Exception(f"Job {job_id} not found in processing status")
            processing_status[job_id]['status'] = STATUS_PROCESSING
            processing_status[job_id]['started_at'] = datetime.now()
        
        print(f"Processing job {job_id}: {filename}")
        print(f"Upload path: {upload_path}")
        print(f"Output path: {output_path}")
        
        # Check if upload file exists
        if not os.path.exists(upload_path):
            raise Exception(f"Upload file not found: {upload_path}")
        
        # Check file size
        file_size = os.path.getsize(upload_path)
        print(f"Processing file size: {file_size} bytes")
        
        if file_size == 0:
            raise Exception("Upload file is empty")
        
        # Detect MIME type
        mime_type, _ = mimetypes.guess_type(upload_path)
        if mime_type is None:
            mime_type = "audio/mpeg"
        print(f"Detected MIME type: {mime_type}")
        
        # Read audio
        try:
            with open(upload_path, 'rb') as f:
                audio_bytes = f.read()
            print(f"Successfully read {len(audio_bytes)} bytes from {upload_path}")
        except Exception as e:
            raise Exception(f"Failed to read audio file: {str(e)}")
        
        if len(audio_bytes) == 0:
            raise Exception("Audio file contains no data")
        
        # Call Gemini for transcription with retry logic
        max_retries = 3
        for attempt in range(max_retries):
            try:
                print(f"Gemini API attempt {attempt + 1}/{max_retries} for job {job_id}")
                response = pro.models.generate_content(
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
                print(f"Gemini API call successful for job {job_id} on attempt {attempt + 1}")
                break  # Success, exit retry loop
                
            except Exception as api_error:
                print(f"Gemini API attempt {attempt + 1} failed for job {job_id}: {str(api_error)}")
                if attempt == max_retries - 1:  # Last attempt
                    raise Exception(f"Gemini API call failed after {max_retries} attempts: {str(api_error)}")
                else:
                    # Wait before retry (exponential backoff)
                    wait_time = (2 ** attempt) * 5  # 5, 10, 20 seconds
                    print(f"Waiting {wait_time} seconds before retry...")
                    time.sleep(wait_time)
        
        raw_transcript = response.text if response and response.text else None
        if not raw_transcript or not raw_transcript.strip():
            raise Exception("No transcript text returned from Gemini")
        
        print(f"Received transcript for job {job_id}, length: {len(raw_transcript)} characters")
        
        with processing_lock:
            processing_status[job_id]['status'] = STATUS_CORRECTING
            processing_status[job_id]['correction_started_at'] = datetime.now()
        
        print(f"Starting correction for job {job_id}")
        try:
            corrected_transcript = correct_transcript(raw_transcript.strip())
            print(f"Correction completed for job {job_id}")
        except Exception as e:
            raise Exception(f"Transcript correction failed: {str(e)}")
        
        # Write to output file
        try:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(corrected_transcript)
            print(f"Written output file: {output_path}")
        except Exception as e:
            raise Exception(f"Failed to write output file: {str(e)}")
        
        # Clean up upload file
        try:
            os.remove(upload_path)
            print(f"Cleaned up uploaded file: {upload_path}")
        except Exception as e:
            print(f"Warning: Could not clean up uploaded file {upload_path}: {e}")
        
        output_filename = os.path.basename(output_path)
        
        with processing_lock:
            processing_status[job_id]['status'] = STATUS_COMPLETED
            processing_status[job_id]['completed_at'] = datetime.now()
            processing_status[job_id]['srt_url'] = f"/outputs/{output_filename}"
            processing_status[job_id]['output_path'] = output_path
            processing_status[job_id]['correction_completed'] = True
        
        print(f"Job {job_id} completed successfully")
        
        # Check if this is a chunk and if we need to merge
        if '_chunk_' in job_id:
            original_job_id = job_id.rsplit('_chunk_', 1)[0]
            print(f"Chunk {job_id} completed, checking for merge with original job {original_job_id}")
            # Run merge check in a separate thread to avoid blocking the worker
            merge_thread = threading.Thread(target=check_and_merge_chunks, args=(original_job_id,), daemon=True)
            merge_thread.start()
            
    except Exception as e:
        error_msg = f"Error processing job {job_id}: {str(e)}"
        print(error_msg)
        print(f"Full error details: {repr(e)}")
        
        try:
            if os.path.exists(upload_path):
                os.remove(upload_path)
                print(f"Cleaned up failed upload file: {upload_path}")
        except:
            pass
            
        with processing_lock:
            if job_id in processing_status:
                processing_status[job_id]['status'] = STATUS_ERROR
                processing_status[job_id]['error'] = str(e)
                processing_status[job_id]['completed_at'] = datetime.now()
        
        # If this is a chunk that failed, we should handle the original job too
        if '_chunk_' in job_id:
            original_job_id = job_id.rsplit('_chunk_', 1)[0]
            print(f"Chunk {job_id} failed, will check original job {original_job_id}")
            check_and_merge_chunks(original_job_id)  # This will handle the error case

def split_audio_file(file_path, chunk_size=CHUNK_SIZE):
    """
    Split an audio file into chunks of specified size.
    Returns a list of chunk file paths.
    """
    file_size = os.path.getsize(file_path)
    
    if file_size <= chunk_size:
        return [file_path]  
    
    chunks = []
    chunk_count = math.ceil(file_size / chunk_size)
    
    base_name = os.path.splitext(file_path)[0]
    file_ext = os.path.splitext(file_path)[1]
    
    with open(file_path, 'rb') as source_file:
        for i in range(chunk_count):
            chunk_filename = f"{base_name}_chunk_{i+1}{file_ext}"
            
            with open(chunk_filename, 'wb') as chunk_file:
                remaining_bytes = min(chunk_size, file_size - (i * chunk_size))
                chunk_data = source_file.read(remaining_bytes)
                chunk_file.write(chunk_data)
            
            chunks.append(chunk_filename)
    
    os.remove(file_path)
    
    return chunks

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
    
    if not files or len(files) == 0:
        return jsonify({"error": "No file provided"}), 400
    
    if len(files) > 1:
        return jsonify({"error": "Only one file upload is allowed"}), 400
    
    file = files[0]  
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    allowed_extensions = {'.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg', '.wma'}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        return jsonify({"error": f"File type {file_ext} not supported. Allowed types: {', '.join(allowed_extensions)}"}), 400
    
    custom_names = request.form.getlist('filenames')
    custom_name = custom_names[0] if custom_names and custom_names[0] else None
    
    job_id = str(uuid.uuid4())
    
    if custom_name:
        base_name = os.path.splitext(custom_name)[0]
    else:
        base_name = os.path.splitext(file.filename)[0]
    
    safe_name = secure_filename(base_name.replace(" ", "_"))
    upload_filename = f"{job_id}_{safe_name}{file_ext}"
    upload_path = os.path.join(UPLOAD_FOLDER, upload_filename)
    
    file.save(upload_path)
    
    # Get file size
    file_size = os.path.getsize(upload_path)
    
    try:
        chunk_paths = split_audio_file(upload_path)
        
        if len(chunk_paths) > 1:
            # Store chunk group information for merging later
            with processing_lock:
                chunk_groups[job_id] = {
                    'total_chunks': len(chunk_paths),
                    'filename': file.filename,
                    'custom_name': custom_name,
                    'safe_name': safe_name,
                    'original_file_size': file_size
                }
                
                # Initialize original job status
                processing_status[job_id] = {
                    'status': STATUS_QUEUED,
                    'filename': file.filename,
                    'custom_name': custom_name,
                    'safe_name': safe_name,
                    'queued_at': datetime.now(),
                    'file_size': file_size,
                    'original_job': True,
                    'total_chunks': len(chunk_paths),
                    'chunks_processing': True
                }
        
        job_ids = []
        
        for i, chunk_path in enumerate(chunk_paths):
            if len(chunk_paths) > 1:
                chunk_job_id = f"{job_id}_chunk_{i+1}"
                output_filename = f"{safe_name}_chunk_{i+1}.srt"
            else:
                chunk_job_id = job_id
                output_filename = f"{safe_name}.srt"
            
            output_path = os.path.join(OUTPUT_FOLDER, output_filename)
            
            # Only add individual chunk status if there are multiple chunks
            if len(chunk_paths) > 1:
                with processing_lock:
                    processing_status[chunk_job_id] = {
                        'status': STATUS_QUEUED,
                        'filename': file.filename,
                        'custom_name': custom_name,
                        'safe_name': safe_name,
                        'queued_at': datetime.now(),
                        'file_size': os.path.getsize(chunk_path),
                        'chunk_info': {
                            'is_chunk': True,
                            'chunk_number': i + 1,
                            'total_chunks': len(chunk_paths),
                            'original_file_size': file_size,
                            'original_job_id': job_id
                        }
                    }
            else:
                # Single file, no chunking
                with processing_lock:
                    processing_status[job_id] = {
                        'status': STATUS_QUEUED,
                        'filename': file.filename,
                        'custom_name': custom_name,
                        'safe_name': safe_name,
                        'queued_at': datetime.now(),
                        'file_size': file_size
                    }
            
            processing_queue.put({
                'job_id': chunk_job_id,
                'upload_path': chunk_path,
                'output_path': output_path,
                'filename': os.path.basename(chunk_path)
            })
            
            job_ids.append(chunk_job_id)
        
        if len(chunk_paths) > 1:
            return jsonify({
                "message": f"File split into {len(chunk_paths)} chunks and queued for processing",
                "job_id": job_id,  # Return the original job ID for tracking
                "chunk_job_ids": job_ids,  # Individual chunk IDs for detailed tracking
                "original_file_size": file_size,
                "chunk_count": len(chunk_paths),
                "chunk_size_mb": CHUNK_SIZE / (1024 * 1024),
                "note": "Track progress using the main job_id. Chunks will be automatically merged when complete."
            })
        else:
            return jsonify({
                "message": "File queued for processing",
                "job_id": job_id,
                "file_size": file_size
            })
            
    except Exception as e:
        # Clean up uploaded file if chunking fails
        if os.path.exists(upload_path):
            os.remove(upload_path)
        
        return jsonify({"error": f"Failed to process file: {str(e)}"}), 500

@app.route('/status/<job_id>')
def get_job_status(job_id):
    """Get status of a specific job"""
    with processing_lock:
        if job_id not in processing_status:
            return jsonify({"error": "Job not found"}), 404
        
        status_data = processing_status[job_id].copy()
    
    # Convert datetime objects to strings
    for key in ['queued_at', 'started_at', 'completed_at', 'correction_started_at']:
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
        merging_count = sum(1 for status in processing_status.values() if status['status'] == STATUS_MERGING)
    
    return jsonify({
        "queue_size": processing_queue.qsize(),
        "queued": queued_count,
        "processing": processing_count,
        "merging": merging_count,
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
        
        # Also clean old chunk groups
        chunk_groups_to_remove = []
        for group_id in chunk_groups.keys():
            if group_id not in processing_status:
                chunk_groups_to_remove.append(group_id)
        
        for group_id in chunk_groups_to_remove:
            del chunk_groups[group_id]
    
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
                
                # Clean old chunk groups
                chunk_groups_to_remove = []
                for group_id in chunk_groups.keys():
                    if group_id not in processing_status:
                        chunk_groups_to_remove.append(group_id)
                
                for group_id in chunk_groups_to_remove:
                    del chunk_groups[group_id]
            
            if cleaned_count > 0 or jobs_to_remove:
                print(f"Scheduled cleanup: {cleaned_count} files, {len(jobs_to_remove)} job statuses")
                
        except Exception as e:
            print(f"Error in scheduled cleanup: {e}")

# Start scheduled cleanup thread
cleanup_thread = threading.Thread(target=scheduled_cleanup, daemon=True)
cleanup_thread.start()

if __name__ == '__main__':
    app.run(debug=True)