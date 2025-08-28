import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # API Keys
    GOOGLE_API_KEY1 = os.getenv("GOOGLE_API_KEY1")
    GOOGLE_API_KEY2 = os.getenv("GOOGLE_API_KEY2")
    
    # Directory settings
    UPLOAD_FOLDER = "uploads"
    OUTPUT_FOLDER = "outputs"
    
    # File processing settings
    CHUNK_SIZE = 200 * 1024 * 1024  # 25MB
    ALLOWED_EXTENSIONS = {'.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg', '.wma'}
    
    # Processing settings
    MAX_RETRIES = 3
    RETRY_WAIT_BASE = 5  # Base wait time for exponential backoff
    
    # Cleanup settings
    CLEANUP_INTERVAL = 3600  # 1 hour
    FILE_CLEANUP_AGE = 2 * 60 * 60  # 2 hours
    STATUS_CLEANUP_AGE = 4 * 60 * 60  # 4 hours
    DOWNLOAD_EXPIRES_TIME = 3600  # 1 hour
    DOWNLOAD_CLEANUP_DELAY = 30  # 30 seconds
    
    # Gemini models
    TRANSCRIPTION_MODEL = 'gemini-2.5-flash'
    CORRECTION_MODEL = 'gemini-2.5-flash'
    
    @classmethod
    def ensure_directories(cls):
        """Ensure required directories exist"""
        os.makedirs(cls.UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(cls.OUTPUT_FOLDER, exist_ok=True)