# Audio to Text Examples - angela Flow SDK

This directory contains complete HTML applications that demonstrate how to use the angela Flow SDK for audio transcription and analysis using OpenAI's Whisper API.

## 📁 Files

### 1. `audio-to-text-app.html` - Complete Application
A full-featured, production-ready audio transcription application with:
- **Modern UI**: Beautiful gradient design with glassmorphic effects
- **Drag & Drop**: Upload audio files by dragging or clicking
- **Real-time Processing**: Live progress updates during transcription
- **AI Analysis**: Automatic analysis of transcribed content using LLM
- **Copy to Clipboard**: Easy copying of results
- **Error Handling**: Comprehensive error messages and validation
- **Mobile Responsive**: Works on all device sizes

### 2. `simple-audio-test.html` - Testing Version
A simplified version for testing and debugging:
- **Clean Interface**: Simple, functional design
- **Debug Output**: Shows raw results for troubleshooting
- **Step-by-step**: Clear numbered steps for the process
- **Minimal Dependencies**: Easier to understand and modify

## 🚀 Quick Start

### Option 1: Download and Open Locally
1. Download either HTML file
2. Open in any modern web browser
3. Enter your OpenAI API key
4. Upload an audio file and process

### Option 2: Host on Web Server
1. Upload the HTML file to your web server
2. Access via your domain
3. No additional setup required

## 🔧 Configuration

### Required Settings
- **OpenAI API Key**: Get from [OpenAI Platform](https://platform.openai.com/api-keys)
- **Audio File**: MP3, WAV, M4A, OGG (max 25MB)

### Optional Settings
- **System Prompt**: Customize how the AI analyzes the transcription
- **Analysis Instructions**: What specific analysis to perform

## 📋 Features

### Audio Processing
- **Universal Format Support**: MP3, WAV, M4A, OGG, and more
- **File Validation**: Automatic type and size checking
- **Binary Processing**: Efficient file handling for API calls
- **Progress Tracking**: Real-time status updates

### AI Integration
- **Whisper Transcription**: High-accuracy speech-to-text
- **LLM Analysis**: Intelligent analysis of transcribed content
- **Customizable Prompts**: Tailor AI behavior to your needs
- **Error Recovery**: Robust error handling and retry logic

### User Experience
- **Drag & Drop Upload**: Intuitive file selection
- **Real-time Feedback**: Progress indicators and status messages
- **Copy to Clipboard**: One-click result copying
- **Mobile Friendly**: Responsive design for all devices

## 🔄 How It Works

The applications implement a complete audio-to-text workflow using the angela Flow SDK:

```
Audio File → File Upload Node → Whisper Transcription → Text Combination → LLM Analysis → Results
```

### Flow Steps:
1. **File Upload**: Convert audio file to binary data
2. **Whisper API**: Transcribe audio to text using OpenAI Whisper
3. **Text Combination**: Combine transcription with analysis prompt
4. **LLM Processing**: Analyze transcription using GPT models
5. **Results Display**: Show both transcription and analysis

## 🛠️ Technical Details

### SDK Integration
```javascript
// Initialize angela Flow SDK
const { angelaFlowRunner, BrowserUtils } = angelaFlowSDK;

// Create flow runner
const flowRunner = new angelaFlowRunner();

// Convert file to binary
const fileData = await convertFileToArrayBuffer(selectedFile);

// Execute flow
const results = await flowRunner.executeFlow(audioToTextFlow, inputs);

// Helper function for file conversion
function convertFileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}
```

### Flow Definition
The applications use a predefined flow with these nodes:
- **file-upload**: Handles audio file input
- **whisper-transcription**: OpenAI Whisper API integration
- **combine-text**: Merges transcription with analysis prompt
- **llm**: GPT model for analysis
- **output**: Final results

### Browser Compatibility
- **Modern Browsers**: Chrome, Firefox, Safari, Edge
- **File API**: Uses FileReader for file processing
- **Fetch API**: For HTTP requests to OpenAI
- **ES6+**: Modern JavaScript features

## 🔐 Security & Privacy

### API Key Handling
- **Client-side Only**: API keys never sent to external servers
- **Secure Storage**: Temporarily stored in browser memory only
- **No Persistence**: Keys not saved between sessions

### Data Processing
- **Direct API Calls**: Audio sent directly to OpenAI Whisper
- **No Intermediary**: No third-party servers involved
- **Client-side Processing**: All logic runs in your browser

## 📊 Supported Audio Formats

| Format | Extension | Max Size | Notes |
|--------|-----------|----------|-------|
| MP3 | .mp3 | 25MB | Most common format |
| WAV | .wav | 25MB | Uncompressed audio |
| M4A | .m4a | 25MB | Apple audio format |
| OGG | .ogg | 25MB | Open source format |
| FLAC | .flac | 25MB | Lossless compression |
| WEBM | .webm | 25MB | Web audio format |

## 🎯 Use Cases

### Business Applications
- **Call Analysis**: Analyze sales calls and customer interactions
- **Meeting Transcription**: Convert meetings to searchable text
- **Interview Processing**: Transcribe and analyze job interviews
- **Customer Support**: Process support call recordings

### Content Creation
- **Podcast Transcription**: Convert podcasts to blog posts
- **Video Subtitles**: Generate subtitles for video content
- **Voice Notes**: Convert voice memos to text
- **Audio Journalism**: Transcribe interviews and recordings

### Accessibility
- **Hearing Impaired**: Provide text alternatives to audio
- **Language Learning**: Analyze pronunciation and speech patterns
- **Documentation**: Create written records of audio content

## 🔧 Customization

### Modify System Prompts
```javascript
// Example: Call analysis prompt
const callAnalysisPrompt = `
You are a professional call auditor. Analyze this conversation and provide:
1. Overall tone and sentiment
2. Key discussion points
3. Potential lead quality (if sales call)
4. Action items or follow-ups needed
5. Communication effectiveness rating
`;
```

### Add Custom Analysis
```javascript
// Example: Sentiment analysis
const sentimentPrompt = `
Analyze the emotional tone of this transcription:
- Positive, negative, or neutral sentiment
- Confidence level of the speaker
- Areas of concern or excitement
- Overall communication quality
`;
```

### Extend Functionality
- **Multiple Languages**: Add language detection
- **Speaker Identification**: Implement speaker diarization
- **Keyword Extraction**: Add keyword highlighting
- **Export Options**: Save results to files

## 🐛 Troubleshooting

### Common Issues

**"Please select an audio file"**
- Ensure file is audio format (MP3, WAV, etc.)
- Check file size is under 25MB

**"Please enter your OpenAI API key"**
- Get API key from OpenAI Platform
- Ensure key has Whisper API access

**"Processing failed: Network error"**
- Check internet connection
- Verify API key is valid
- Ensure OpenAI services are available

**"File size must be less than 25MB"**
- Compress audio file
- Use lower quality settings
- Split long recordings

### Debug Mode
Use the simple test version for debugging:
- View raw API responses
- Check flow execution steps
- Monitor console for errors

## 📚 Additional Resources

- [angela Flow SDK Documentation](../README.md)
- [OpenAI Whisper API Docs](https://platform.openai.com/docs/guides/speech-to-text)
- [Browser File API Guide](https://developer.mozilla.org/en-US/docs/Web/API/File)
- [Audio Format Conversion Tools](https://www.ffmpeg.org/)

## 🤝 Contributing

Found a bug or want to add features?
1. Fork the repository
2. Create your feature branch
3. Test with both HTML examples
4. Submit a pull request

## 📄 License

These examples are part of the angela Flow SDK and follow the same license terms.

---

**Ready to transcribe audio?** Open either HTML file in your browser and start processing audio files with AI-powered transcription and analysis! 
