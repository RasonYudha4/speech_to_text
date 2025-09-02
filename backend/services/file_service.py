import os
import math
import mimetypes
from typing import List, Optional, Tuple
from werkzeug.utils import secure_filename
from pydub import AudioSegment
from config import Config

class FileService:
    """Service for handling file operations including chunking, validation, format conversion, and file I/O"""
    
    def validate_file_type(self, filename: str) -> bool:
        """Validate if file type is allowed"""
        file_ext = os.path.splitext(filename)[1].lower()
        return file_ext in Config.ALLOWED_EXTENSIONS
    
    def generate_safe_filename(self, filename: str, custom_name: str = None) -> str:
        """Generate safe filename for storage"""
        if custom_name:
            base_name = os.path.splitext(custom_name)[0]
        else:
            base_name = os.path.splitext(filename)[0]
        
        return secure_filename(base_name.replace(" ", "_"))
    
    def file_exists(self, file_path: str) -> bool:
        """Check if file exists"""
        return os.path.exists(file_path)
    
    def get_file_size(self, file_path: str) -> int:
        """Get file size in bytes"""
        try:
            return os.path.getsize(file_path)
        except:
            return 0
    
    def validate_file_exists_and_not_empty(self, file_path: str) -> None:
        """
        Validate that file exists and is not empty.
        Raises Exception if file doesn't exist or is empty.
        """
        if not FileService.file_exists(file_path):
            raise Exception(f"File not found: {file_path}")
        
        file_size = FileService.get_file_size(file_path)
        if file_size == 0:
            raise Exception(f"File is empty: {file_path}")
        
        print(f"File validation passed: {file_path} ({file_size} bytes)")
    
    def detect_mime_type(self, file_path: str, default_mime: str = "audio/mpeg") -> str:
        """
        Detect MIME type of file, with fallback to default.
        
        Args:
            file_path: Path to the file
            default_mime: Default MIME type if detection fails
            
        Returns:
            Detected or default MIME type
        """
        mime_type, _ = mimetypes.guess_type(file_path)
        if mime_type is None:
            mime_type = default_mime
        print(f"Detected MIME type for {file_path}: {mime_type}")
        return mime_type
    
    def read_file_bytes(self, file_path: str) -> bytes:
        """
        Read file as bytes with proper error handling.
        
        Args:
            file_path: Path to the file to read
            
        Returns:
            File content as bytes
            
        Raises:
            Exception if file cannot be read or is empty
        """
        try:
            with open(file_path, 'rb') as f:
                file_bytes = f.read()
            
            if len(file_bytes) == 0:
                raise Exception(f"File contains no data: {file_path}")
            
            print(f"Successfully read {len(file_bytes)} bytes from {file_path}")
            return file_bytes
            
        except Exception as e:
            raise Exception(f"Failed to read file {file_path}: {str(e)}")
    
    def read_audio_for_processing(self, file_path: str) -> Tuple[bytes, str]:
        """
        Complete audio file reading workflow for processing.
        Validates file, detects MIME type, and reads bytes.
        
        Args:
            file_path: Path to the audio file
            
        Returns:
            Tuple of (file_bytes, mime_type)
            
        Raises:
            Exception if any validation or reading step fails
        """
        # Validate file exists and is not empty
        FileService.validate_file_exists_and_not_empty(file_path)
        
        # Detect MIME type
        mime_type = FileService.detect_mime_type(file_path)
        
        # Read file bytes
        file_bytes = FileService.read_file_bytes(file_path)
        
        return file_bytes, mime_type
    
    def convert_to_mp3(self, input_path: str, output_path: str = None, bitrate: str = "192k") -> Optional[str]:
        """
        Convert any supported audio file to MP3 format.
        
        Args:
            input_path: Path to the input audio file
            output_path: Optional output path. If not provided, replaces extension with .mp3
            bitrate: MP3 bitrate (default: 192k)
            
        Returns:
            Path to the converted MP3 file, or None if conversion failed
        """
        try:
            # Check if input file exists
            if not FileService.file_exists(input_path):
                print(f"Input file does not exist: {input_path}")
                return None
            
            # Validate file type
            input_filename = os.path.basename(input_path)
            if not FileService.validate_file_type(input_filename):
                print(f"Unsupported file type: {input_filename}")
                return None
            
            # Generate output path if not provided
            if output_path is None:
                base_name = os.path.splitext(input_path)[0]
                output_path = f"{base_name}.mp3"
            
            # If already MP3, just copy/return the original path
            input_ext = os.path.splitext(input_path)[1].lower()
            if input_ext == '.mp3':
                if input_path != output_path:
                    # Copy to new location if different
                    import shutil
                    shutil.copy2(input_path, output_path)
                print(f"File already in MP3 format: {input_path}")
                return output_path
            
            print(f"Converting {input_path} to MP3...")
            
            # Load audio file using pydub
            audio = AudioSegment.from_file(input_path)
            
            # Export as MP3
            audio.export(
                output_path,
                format="mp3",
                bitrate=bitrate,
                tags={
                    'title': os.path.splitext(os.path.basename(input_path))[0],
                    'converted_from': input_ext.upper()
                }
            )
            
            print(f"Successfully converted to MP3: {output_path}")
            return output_path
            
        except Exception as e:
            print(f"Error converting {input_path} to MP3: {str(e)}")
            return None
    
    def convert_and_replace(self, file_path: str, bitrate: str = "192k") -> Optional[str]:
        """
        Convert audio file to MP3 and replace the original file.
        
        Args:
            file_path: Path to the audio file to convert
            bitrate: MP3 bitrate (default: 192k)
            
        Returns:
            Path to the converted MP3 file, or original path if already MP3, or None if failed
        """
        try:
            input_ext = os.path.splitext(file_path)[1].lower()
            
            # If already MP3, return as-is
            if input_ext == '.mp3':
                return file_path
            
            # Generate MP3 path
            base_name = os.path.splitext(file_path)[0]
            mp3_path = f"{base_name}.mp3"
            
            # Convert to MP3
            converted_path = FileService.convert_to_mp3(file_path, mp3_path, bitrate)
            
            if converted_path:
                # Clean up original file
                FileService.cleanup_file(file_path)
                return converted_path
            else:
                return None
                
        except Exception as e:
            print(f"Error in convert_and_replace for {file_path}: {str(e)}")
            return None
    
    def ensure_mp3_format(self, file_path: str, keep_original: bool = False) -> Tuple[Optional[str], bool]:
        """
        Ensure the audio file is in MP3 format. Convert if necessary.
        
        Args:
            file_path: Path to the audio file
            keep_original: Whether to keep the original file after conversion
            
        Returns:
            Tuple of (mp3_file_path, was_converted)
        """
        try:
            input_ext = os.path.splitext(file_path)[1].lower()
            
            if input_ext == '.mp3':
                return file_path, False
            
            base_name = os.path.splitext(file_path)[0]
            mp3_path = f"{base_name}.mp3"
            
            converted_path = FileService.convert_to_mp3(file_path, mp3_path)
            
            if converted_path:
                if not keep_original:
                    FileService.cleanup_file(file_path)
                return converted_path, True
            else:
                return None, False
                
        except Exception as e:
            print(f"Error ensuring MP3 format for {file_path}: {str(e)}")
            return None, False
    
    def split_audio_file(self, file_path: str, chunk_size: int = None) -> List[str]:
        """
        Split an audio file into a specified number of equal chunks.
        Returns a list of chunk file paths.
        """
        audio = AudioSegment.from_file(file_path)
        
        if chunk_size is None:
            chunk_size = Config.CHUNK_SIZE
        
        total_size = FileService.get_file_size(file_path)
        duration_ms = len(audio)
        bytes_per_ms = total_size / duration_ms

        max_chunk_duration_ms = int(chunk_size / bytes_per_ms)

        chunks = []
        base_name, file_ext = os.path.splitext(file_path)

        for i in range(0, duration_ms, max_chunk_duration_ms):
            chunk = audio[i:i + max_chunk_duration_ms]
            chunk_filename = f"{base_name}chunk{len(chunks)+1}{file_ext}"
            chunk.export(chunk_filename, format=file_ext.replace(".", ""))
            chunks.append(chunk_filename)

        return chunks
        
    def cleanup_file(self, file_path: str) -> bool:
        """Safely remove a file"""
        try:
            if FileService.file_exists(file_path):
                os.remove(file_path)
                print(f"Cleaned up file: {file_path}")
                return True
            return False
        except Exception as e:
            print(f"Warning: Could not clean up file {file_path}: {e}")
            return False
    
    def save_transcript(self, content: str, output_path: str) -> bool:
        """Save transcript content to file"""
        try:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Written output file: {output_path}")
            return True
        except Exception as e:
            print(f"Failed to write output file {output_path}: {str(e)}")
            return False
    
    def get_audio_info(self, file_path: str) -> dict:
        """
        Get audio file information including duration, format, etc.
        
        Returns:
            Dictionary with audio file information
        """
        try:
            audio = AudioSegment.from_file(file_path)
            file_size = FileService.get_file_size(file_path)
            
            return {
                'duration_ms': len(audio),
                'duration_seconds': len(audio) / 1000.0,
                'channels': audio.channels,
                'frame_rate': audio.frame_rate,
                'sample_width': audio.sample_width,
                'file_size_bytes': file_size,
                'format': os.path.splitext(file_path)[1].lower().replace('.', '')
            }
        except Exception as e:
            print(f"Error getting audio info for {file_path}: {str(e)}")
            return {}

file_service = FileService()