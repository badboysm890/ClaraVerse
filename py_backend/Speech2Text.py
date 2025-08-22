import os
import logging
from faster_whisper import WhisperModel
import tempfile

logger = logging.getLogger("angela-speech2text")

class Speech2Text:
    def __init__(self, model_size="tiny", device="cpu", compute_type="int8"):
        """
        Initialize the Speech2Text processor with a tiny model on CPU for maximum compatibility.
        
        Args:
            model_size: Size of the Whisper model (tiny, base, small, medium, large)
            device: Device to run the model on (cpu or cuda)
            compute_type: Computation type (int8, float16, etc.)
        """
        logger.info(f"Initializing Speech2Text with model_size={model_size}, device={device}, compute_type={compute_type}")
        try:
            self.model = WhisperModel(model_size, device=device, compute_type=compute_type, download_root=os.path.join(os.path.expanduser("~"), ".angela", "models"))
            logger.info(f"Successfully loaded Whisper model: {model_size}")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise

    def transcribe_file(self, audio_file_path, language="en", beam_size=5, initial_prompt=None):
        """
        Transcribe an audio file.
        
        Args:
            audio_file_path: Path to the audio file
            language: Language code (optional)
            beam_size: Beam size for the decoding algorithm
            initial_prompt: Optional prompt to guide the transcription
            
        Returns:
            A dictionary containing the transcription text, language, segments, etc.
        """
        try:
            logger.info(f"Transcribing file: {audio_file_path}")
            
            # Transcribe the audio
            segments, info = self.model.transcribe(
                audio_file_path,
                beam_size=beam_size,
                language="en",
                initial_prompt=initial_prompt
            )
            
            # Convert generator to list to avoid serialization issues
            segments_list = []
            full_text = ""
            
            for segment in segments:
                segment_dict = {
                    "id": segment.id,
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text.strip(),
                    "words": [{"start": word.start, "end": word.end, "word": word.word, "probability": word.probability} 
                             for word in (segment.words or [])],
                }
                segments_list.append(segment_dict)
                full_text += segment.text + " "
            
            result = {
                "text": full_text.strip(),
                "segments": segments_list,
                "language": info.language,
                "language_probability": info.language_probability
            }
            
            logger.info(f"Transcription completed. Detected language: {info.language}")
            return result
            
        except Exception as e:
            logger.error(f"Error transcribing audio: {e}")
            raise
    
    def transcribe_bytes(self, audio_bytes, language=None, beam_size=5, initial_prompt=None):
        """
        Transcribe audio from bytes (useful for API endpoints).
        
        Args:
            audio_bytes: Audio data as bytes
            language: Language code (optional)
            beam_size: Beam size for the decoding algorithm
            initial_prompt: Optional prompt to guide the transcription
            
        Returns:
            A dictionary containing the transcription text, language, segments, etc.
        """
        # Create a temporary file to store the audio bytes
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
            try:
                temp_audio.write(audio_bytes)
                temp_audio.flush()
                temp_audio_path = temp_audio.name
                
                # Use the file-based transcription method
                result = self.transcribe_file(
                    temp_audio_path,
                    language=language,
                    beam_size=beam_size,
                    initial_prompt=initial_prompt
                )
                
                return result
            finally:
                # Make sure we clean up the temporary file
                try:
                    os.unlink(temp_audio_path)
                except:
                    pass
