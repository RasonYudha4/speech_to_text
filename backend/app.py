from flask import Flask
from flask_cors import CORS

from config import Config
from api.routes import api
from services.queue_service import queue_service
from services.audio_processor import AudioProcessor
from utils.cleanup_utils import cleanup_service

def create_app():
    """Application factory"""
    app = Flask(__name__)
    CORS(app)
    
    # Ensure directories exist
    Config.ensure_directories()
    
    # Register blueprints
    app.register_blueprint(api)
    
    # Initialize services
    audio_processor = AudioProcessor()
    
    # Start queue workers
    queue_service.start_workers(
        worker_count=1, 
        worker_function=audio_processor.process_audio_file
    )
    
    # Start scheduled cleanup
    cleanup_service.start_scheduled_cleanup()
    
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)