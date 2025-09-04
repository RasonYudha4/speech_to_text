from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from faster_whisper import WhisperModel
import os
import tempfile
import logging
from werkzeug.utils import secure_filename
from datetime import timedelta
import io

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
UPLOAD_FOLDER = 'temp_uploads'
MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB max file size
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'mp4', 'm4a', 'flac', 'ogg', 'webm', 'aac'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Initialize Whisper model (you can change the model size)
# Options: "tiny", "base", "small", "medium", "large-v2", "large-v3"
try:
    model = WhisperModel("base", device="cpu", compute_type="int8")
    logger.info("Whisper model loaded successfully")
except Exception as e:
    logger.error(f"Failed to load Whisper model: {e}")
    model = None

def allowed_file(filename):
    """Check if the file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def format_timestamp(seconds):
    """Convert seconds to SRT timestamp format (HH:MM:SS,mmm)"""
    td = timedelta(seconds=seconds)
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    milliseconds = int((seconds - total_seconds) * 1000)
    
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"

def transcribe_to_srt(audio_file_path):
    """Transcribe audio file and return SRT content"""
    if model is None:
        raise Exception("Whisper model not loaded")
    
    try:
        # Transcribe the audio file
        segments, info = model.transcribe(
            audio_file_path, 
            beam_size=5,
            language=None,  # Auto-detect language
            task="transcribe"
        )
        
        logger.info(f"Detected language: {info.language} (probability: {info.language_probability:.2f})")
        
        # Convert segments to SRT format
        srt_content = []
        
        for i, segment in enumerate(segments, 1):
            start_time = format_timestamp(segment.start)
            end_time = format_timestamp(segment.end)
            text = segment.text.strip()
            
            # SRT format: sequence number, timestamps, text, blank line
            srt_entry = f"{i}\n{start_time} --> {end_time}\n{text}\n"
            srt_content.append(srt_entry)
        
        return "\n".join(srt_content)
    
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise

@app.route('/', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'Audio Transcription API is running',
        'model_loaded': model is not None
    })

@app.route('/upload', methods=['POST'])
def upload_audio():
    """Handle audio file upload and transcription"""
    try:
        # Check if file is present in request
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        file = request.files['audio']
        
        # Check if file is selected
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Check if file type is allowed
        if not allowed_file(file.filename):
            return jsonify({
                'error': 'Invalid file type. Supported formats: ' + ', '.join(ALLOWED_EXTENSIONS)
            }), 400
        
        # Check if model is loaded
        if model is None:
            return jsonify({'error': 'Transcription model not available'}), 500
        
        # Secure the filename
        filename = secure_filename(file.filename)
        
        # Create temporary file to save the uploaded audio
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp_file:
            file.save(tmp_file.name)
            temp_file_path = tmp_file.name
        
        logger.info(f"Processing file: {filename}")
        
        try:
            # Transcribe the audio file to SRT
            srt_content = transcribe_to_srt(temp_file_path)
            
            # Create SRT filename
            base_filename = os.path.splitext(filename)[0]
            srt_filename = f"{base_filename}_transcription.srt"
            
            # Create a BytesIO object with the SRT content
            srt_bytes = io.BytesIO(srt_content.encode('utf-8'))
            
            logger.info(f"Transcription completed for: {filename}")
            
            # Return the SRT file as download
            return send_file(
                srt_bytes,
                mimetype='text/plain',
                as_attachment=True,
                download_name=srt_filename
            )
            
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_file_path)
            except OSError:
                pass
    
    except Exception as e:
        logger.error(f"Upload error: {e}")
        return jsonify({'error': f'An error occurred during processing: {str(e)}'}), 500

@app.route('/transcribe', methods=['POST'])
def transcribe_only():
    """Alternative endpoint that returns JSON with transcription text"""
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        file = request.files['audio']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({
                'error': 'Invalid file type. Supported formats: ' + ', '.join(ALLOWED_EXTENSIONS)
            }), 400
        
        if model is None:
            return jsonify({'error': 'Transcription model not available'}), 500
        
        filename = secure_filename(file.filename)
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp_file:
            file.save(tmp_file.name)
            temp_file_path = tmp_file.name
        
        try:
            segments, info = model.transcribe(temp_file_path, beam_size=5)
            
            # Extract just the text
            transcription_text = " ".join([segment.text.strip() for segment in segments])
            
            return jsonify({
                'transcription': transcription_text,
                'language': info.language,
                'language_probability': info.language_probability,
                'filename': filename
            })
            
        finally:
            try:
                os.unlink(temp_file_path)
            except OSError:
                pass
    
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500

@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File too large. Maximum size is 100MB'}), 413

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    print("Starting Audio Transcription API...")
    print(f"Model loaded: {model is not None}")
    print("API endpoints:")
    print("  GET  /          - Health check")
    print("  POST /upload    - Upload audio and get SRT file")
    print("  POST /transcribe - Upload audio and get JSON response")
    print("\nSupported formats:", ', '.join(ALLOWED_EXTENSIONS))
    print("Max file size: 100MB")
    
    app.run(debug=True, host='0.0.0.0', port=5000)