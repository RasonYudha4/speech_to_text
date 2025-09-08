from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from faster_whisper import WhisperModel
import os
import tempfile
import logging
from werkzeug.utils import secure_filename
from datetime import timedelta
import io
import torch

app = Flask(__name__)
CORS(app) 

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOAD_FOLDER = 'temp_uploads'
MAX_CONTENT_LENGTH = 1000 * 1024 * 1024  
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'mp4', 'm4a', 'flac', 'ogg', 'webm', 'aac'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def check_cuda_availability():
    """Check if CUDA is available and return appropriate device and compute type"""
    try:
        if torch.cuda.is_available():
            logger.info(f"CUDA is available. GPU count: {torch.cuda.device_count()}")
            logger.info(f"GPU name: {torch.cuda.get_device_name(0)}")
            return "cuda", "float16"
        else:
            logger.info("CUDA not available, falling back to CPU")
            return "cpu", "int8"
    except Exception as e:
        logger.warning(f"Error checking CUDA availability: {e}. Falling back to CPU")
        return "cpu", "int8"

def initialize_model():
    """Initialize Whisper model with best available device"""
    try:
        device, compute_type = check_cuda_availability()
        
        logger.info(f"Initializing Whisper model with device: {device}, compute_type: {compute_type}")
        model = WhisperModel("base", device=device, compute_type=compute_type)
        
        logger.info("Whisper model loaded successfully")
        return model, device, compute_type
    except Exception as e:
        logger.error(f"Failed to load Whisper model: {e}")
        return None, None, None

# Initialize model
model, device_used, compute_type_used = initialize_model()

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
        segments, info = model.transcribe(
            audio_file_path, 
            beam_size=5,
            language=None,  
            task="transcribe"
        )
        
        logger.info(f"Detected language: {info.language} (probability: {info.language_probability:.2f})")
        
        srt_content = []
        
        for i, segment in enumerate(segments, 1):
            start_time = format_timestamp(segment.start)
            end_time = format_timestamp(segment.end)
            text = segment.text.strip()
            
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
        'model_loaded': model is not None,
        'device': device_used,
        'compute_type': compute_type_used,
        'cuda_available': torch.cuda.is_available(),
        'gpu_count': torch.cuda.device_count() if torch.cuda.is_available() else 0,
        'gpu_name': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    })

@app.route('/upload', methods=['POST'])
def upload_audio():
    """Handle audio file upload and transcription"""
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
        
        logger.info(f"Processing file: {filename} on {device_used}")
        
        try:
            srt_content = transcribe_to_srt(temp_file_path)
            
            base_filename = os.path.splitext(filename)[0]
            srt_filename = f"{base_filename}_transcription.srt"
            
            # Create a BytesIO object with the SRT content
            srt_bytes = io.BytesIO(srt_content.encode('utf-8'))
            
            logger.info(f"Transcription completed for: {filename}")
            
            return send_file(
                srt_bytes,
                mimetype='text/plain',
                as_attachment=True,
                download_name=srt_filename
            )
            
        finally:
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
        
        logger.info(f"Processing file: {filename} on {device_used}")
        
        try:
            segments, info = model.transcribe(temp_file_path, beam_size=5)
            
            transcription_text = " ".join([segment.text.strip() for segment in segments])
            
            return jsonify({
                'transcription': transcription_text,
                'language': info.language,
                'language_probability': info.language_probability,
                'filename': filename,
                'device_used': device_used,
                'compute_type_used': compute_type_used
            })
            
        finally:
            try:
                os.unlink(temp_file_path)
            except OSError:
                pass
    
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500

@app.route('/system-info', methods=['GET'])
def system_info():
    """Get detailed system information"""
    cuda_info = {}
    if torch.cuda.is_available():
        cuda_info = {
            'cuda_version': torch.version.cuda,
            'cudnn_version': torch.backends.cudnn.version() if torch.backends.cudnn.is_available() else None,
            'gpu_count': torch.cuda.device_count(),
            'current_device': torch.cuda.current_device(),
            'device_name': torch.cuda.get_device_name(0),
            'memory_allocated': torch.cuda.memory_allocated(0) / 1024**3,  # GB
            'memory_reserved': torch.cuda.memory_reserved(0) / 1024**3,    # GB
            'max_memory_allocated': torch.cuda.max_memory_allocated(0) / 1024**3  # GB
        }
    
    return jsonify({
        'pytorch_version': torch.__version__,
        'cuda_available': torch.cuda.is_available(),
        'cuda_info': cuda_info,
        'model_device': device_used,
        'compute_type': compute_type_used,
        'model_loaded': model is not None
    })

@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File too large. Maximum size is 1GB'}), 413

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    print("Starting Audio Transcription API...")
    print(f"PyTorch version: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"CUDA version: {torch.version.cuda}")
        print(f"GPU count: {torch.cuda.device_count()}")
        print(f"GPU name: {torch.cuda.get_device_name(0)}")
    print(f"Model loaded: {model is not None}")
    print(f"Using device: {device_used}")
    print(f"Compute type: {compute_type_used}")
    print("\nAPI endpoints:")
    print("  GET  /           - Health check")
    print("  GET  /system-info - Detailed system information")
    print("  POST /upload     - Upload audio and get SRT file")
    print("  POST /transcribe - Upload audio and get JSON response")
    print(f"\nSupported formats: {', '.join(ALLOWED_EXTENSIONS)}")
    print("Max file size: 1GB")
    
    app.run(debug=True, host='0.0.0.0', port=5000)