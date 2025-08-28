import re
import os
from typing import List, Tuple

def parse_srt_time(time_str: str) -> float:
    """Parse SRT time format (HH:MM:SS,mmm) to seconds"""
    try:
        time_part, ms_part = time_str.split(',')
        h, m, s = map(int, time_part.split(':'))
        ms = int(ms_part)
        return h * 3600 + m * 60 + s + ms / 1000
    except:
        return 0

def format_srt_time(seconds: float) -> str:
    """Format seconds to SRT time format (HH:MM:SS,mmm)"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def merge_srt_chunks(chunk_files: List[str], output_path: str) -> bool:
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
            subtitles = re.findall(
                r'(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n(.*?)(?=\n\d+\n|\Z)', 
                chunk_content, 
                re.DOTALL
            )
            
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

def validate_srt_format(content: str) -> bool:
    """Validate if content is in proper SRT format"""
    srt_pattern = r'^\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n.+?(?=\n\d+\n|\Z)'
    matches = re.findall(srt_pattern, content, re.MULTILINE | re.DOTALL)
    return len(matches) > 0