from google import genai
from google.genai import types
from config import Config

class CorrectionService:
    """Service for correcting SRT transcript issues using Gemini API"""
    
    def __init__(self):
        self.client = genai.Client(api_key=Config.GOOGLE_API_KEY1)  # Use free client
    
    def correct_transcript(self, raw_transcript: str) -> str:
        """Use the corrector client to fix transcription issues"""
        try:
            correction_response = self.client.models.generate_content(
                model=Config.CORRECTION_MODEL,
                config=types.GenerateContentConfig(
                    system_instruction=self._get_correction_system_prompt(),
                    thinking_config=types.ThinkingConfig(thinking_budget=-1)
                ),
                contents=[f"Please correct the following SRT transcript:\n\n{raw_transcript}"]
            )
            
            corrected_text = correction_response.text.strip() if correction_response and correction_response.text else raw_transcript
            
            # Clean up any potential markdown formatting
            if corrected_text.startswith('```srt'):
                lines = corrected_text.split('\n')
                # Remove first line if it's ```srt and last line if it's ```
                if lines[0].strip() == '```srt':
                    lines = lines[1:]
                if lines and lines[-1].strip() == '```':
                    lines = lines[:-1]
                corrected_text = '\n'.join(lines)
            
            return corrected_text
        
        except Exception as e:
            print(f"Correction failed: {e}")
            return raw_transcript
    
    def _get_correction_system_prompt(self) -> str:
        """Get the system prompt for SRT correction"""
        return '''
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
        '''