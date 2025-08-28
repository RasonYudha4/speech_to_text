import os
import mimetypes
import time
from google import genai
from google.genai import types
from config import Config

class TranscriptionService:
    """Service for handling audio transcription using Gemini API"""
    
    def __init__(self):
        self.client = genai.Client(api_key=Config.GOOGLE_API_KEY2)  # Use pro client
        self.max_retries = Config.MAX_RETRIES
        self.retry_wait_base = Config.RETRY_WAIT_BASE
    
    def transcribe_audio(self, audio_path: str, job_id: str) -> str:
        """Transcribe audio file to SRT format using Gemini API"""
        # Check if upload file exists
        if not os.path.exists(audio_path):
            raise Exception(f"Upload file not found: {audio_path}")
        
        # Check file size
        file_size = os.path.getsize(audio_path)
        print(f"Processing file size: {file_size} bytes")
        
        if file_size == 0:
            raise Exception("Upload file is empty")
        
        # Detect MIME type
        mime_type, _ = mimetypes.guess_type(audio_path)
        if mime_type is None:
            mime_type = "audio/mpeg"
        print(f"Detected MIME type: {mime_type}")
        
        # Read audio
        try:
            with open(audio_path, 'rb') as f:
                audio_bytes = f.read()
            print(f"Successfully read {len(audio_bytes)} bytes from {audio_path}")
        except Exception as e:
            raise Exception(f"Failed to read audio file: {str(e)}")
        
        if len(audio_bytes) == 0:
            raise Exception("Audio file contains no data")
        
        # Call Gemini for transcription with retry logic
        for attempt in range(self.max_retries):
            try:
                print(f"Gemini API attempt {attempt + 1}/{self.max_retries} for job {job_id}")
                response = self.client.models.generate_content(
                    model=Config.TRANSCRIPTION_MODEL,
                    config=types.GenerateContentConfig(
                        system_instruction=self._get_transcription_system_prompt(),
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
                if attempt == self.max_retries - 1:  # Last attempt
                    raise Exception(f"Gemini API call failed after {self.max_retries} attempts: {str(api_error)}")
                else:
                    # Wait before retry (exponential backoff)
                    wait_time = (2 ** attempt) * self.retry_wait_base
                    print(f"Waiting {wait_time} seconds before retry...")
                    time.sleep(wait_time)
        
        raw_transcript = response.text if response and response.text else None
        if not raw_transcript or not raw_transcript.strip():
            raise Exception("No transcript text returned from Gemini")
        
        print(f"Received transcript for job {job_id}, length: {len(raw_transcript)} characters")
        return raw_transcript.strip()
    
    def _get_transcription_system_prompt(self) -> str:
        """Get the system prompt for transcription"""
        return '''
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

        Once again, timecodes should be in the format of HH:MM:SS,mmm where mmm is milliseconds and please be accurate about the text.
        '''