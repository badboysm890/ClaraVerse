# angela Text-to-Speech (TTS) Implementation

angela now supports multiple high-quality TTS engines, including the state-of-the-art **Kokoro TTS** for neural speech synthesis.

## 🎤 Supported TTS Engines

### 1. **Kokoro TTS** (Recommended) 🌟
- **Quality**: Exceptional neural TTS with human-like speech
- **Speed**: Near real-time generation (~82M parameters)
- **Voices**: Multiple high-quality voices (American, British, etc.)
- **Languages**: English, Japanese, Chinese, French, Spanish, Italian, and more
- **License**: Apache 2.0 (free for commercial use)

### 2. **Google Text-to-Speech (gTTS)**
- **Quality**: Good online TTS
- **Speed**: Requires internet connection
- **Languages**: 100+ languages supported
- **Voices**: Standard Google voices

### 3. **pyttsx3**
- **Quality**: Basic offline TTS
- **Speed**: Fast, no internet required
- **Languages**: System dependent
- **Voices**: Uses system TTS voices

## 🚀 Quick Start

### Option 1: Auto Installation (Recommended)

```bash
cd py_backend
python install_kokoro.py
```

### Option 2: Manual Installation

```bash
# Install Kokoro TTS
pip install kokoro>=0.9.4 kokoro-onnx>=0.4.9
pip install soundfile>=0.12.1 onnxruntime>=1.16.0

# Install optional voice packs
pip install misaki[en]>=0.1.0
```

### Option 3: Basic TTS Only

```bash
# Install basic TTS engines only
pip install gtts pyttsx3
```

## 🎭 Available Voices (Kokoro)

| Voice ID | Description | Gender | Accent |
|----------|-------------|---------|---------|
| `af_sarah` | Warm, friendly | Female | American |
| `af_nicole` | Professional | Female | American |
| `af_sky` | Energetic | Female | American |
| `am_adam` | Deep, authoritative | Male | American |
| `am_michael` | Casual | Male | American |
| `bf_emma` | Elegant | Female | British |
| `bf_isabella` | Sophisticated | Female | British |
| `bm_george` | Distinguished | Male | British |
| `bm_lewis` | Modern | Male | British |

## 📡 API Endpoints

### 1. Synthesize Text to Audio

```bash
POST /synthesize
Content-Type: application/json

{
  "text": "Hello, this is angela speaking!",
  "engine": "kokoro-onnx",
  "voice": "af_sarah",
  "speed": 1.0,
  "language": "en"
}
```

**Response**: Audio file (WAV for Kokoro, MP3 for others)

### 2. Synthesize Text to File

```bash
POST /synthesize/file
Content-Type: multipart/form-data

text=Hello World
engine=kokoro-onnx
voice=af_sarah
speed=1.2
filename=speech.wav
```

**Response**: Downloadable audio file

### 3. Get Available Voices

```bash
GET /tts/voices
```

**Response**:
```json
{
  "kokoro_voices": {
    "af_sarah": "American Female - Sarah (warm, friendly)",
    "am_adam": "American Male - Adam (deep, authoritative)",
    ...
  },
  "gtts_languages": ["en", "es", "fr", ...],
  "pyttsx3_voices": [...]
}
```

### 4. Get TTS Status

```bash
GET /tts/status
```

**Response**:
```json
{
  "current_engine": "kokoro-onnx",
  "available_engines": ["kokoro-onnx", "kokoro", "gtts", "pyttsx3"],
  "language": "en",
  "voice": "af_sarah"
}
```

## 🔧 Configuration

### Engine Priority (Auto Mode)

When `engine="auto"`, angela will use engines in this order:
1. **Kokoro ONNX** (best quality, fastest)
2. **Kokoro** (high quality)
3. **gTTS** (good quality, online)
4. **pyttsx3** (basic quality, offline)

### Speed Control

- **Kokoro**: `0.5` to `2.0` (1.0 = normal)
- **pyttsx3**: Uses `slow` parameter
- **gTTS**: Uses `slow` parameter

### Language Mapping

| Input | Kokoro Code | Description |
|-------|-------------|-------------|
| `en`, `en-us` | `a` | American English |
| `en-gb` | `b` | British English |
| `es` | `e` | Spanish |
| `fr` | `f` | French |
| `it` | `i` | Italian |
| `ja` | `j` | Japanese |
| `zh` | `z` | Chinese |

## 🧪 Testing

### Test Kokoro Installation

```python
from kokoro_onnx import KokoroONNX

# Initialize
kokoro = KokoroONNX()

# Generate speech
audio = kokoro.generate("Hello, this is a test!", voice="af_sarah", speed=1.0)
print(f"Generated {len(audio)} audio samples")
```

### Test via API

```bash
curl -X POST "http://localhost:8000/synthesize" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello angela!", "engine": "kokoro-onnx", "voice": "af_sarah"}' \
  --output test_speech.wav
```

## 🎯 Integration with angela Voice Chat

The TTS system integrates seamlessly with angela's voice chat:

1. **Auto Engine Selection**: angela automatically uses the best available TTS engine
2. **Voice Consistency**: Maintains the same voice throughout conversations
3. **Real-time Generation**: Kokoro provides near real-time speech synthesis
4. **Quality Optimization**: Automatically adjusts quality based on available resources

## 🔍 Troubleshooting

### Common Issues

1. **"No TTS engines available"**
   ```bash
   pip install gtts pyttsx3  # Install basic engines
   ```

2. **Kokoro import errors**
   ```bash
   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
   pip install kokoro-onnx
   ```

3. **Audio playback issues**
   ```bash
   pip install soundfile>=0.12.1
   ```

4. **Permission errors on macOS**
   ```bash
   # Grant microphone permissions in System Preferences
   ```

### Performance Tips

1. **Use Kokoro ONNX** for best performance
2. **Cache TTS instances** (already implemented)
3. **Use appropriate voice** for your use case
4. **Adjust speed** for better user experience

## 📊 Performance Comparison

| Engine | Quality | Speed | Size | Offline | Languages |
|--------|---------|-------|------|---------|-----------|
| Kokoro ONNX | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 80MB | ✅ | 9+ |
| Kokoro | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 200MB | ✅ | 9+ |
| gTTS | ⭐⭐⭐ | ⭐⭐⭐ | Small | ❌ | 100+ |
| pyttsx3 | ⭐⭐ | ⭐⭐⭐⭐⭐ | Small | ✅ | System |

## 🚀 Next Steps

1. **Install Kokoro**: Run `python install_kokoro.py`
2. **Restart Backend**: Restart your angela backend
3. **Test TTS**: Use the `/tts/voices` endpoint to verify installation
4. **Enjoy High-Quality Speech**: angela now has professional-grade TTS!

---

**Need help?** Check the logs in your angela backend for detailed error messages and troubleshooting information. 
