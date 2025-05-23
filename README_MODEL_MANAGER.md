# Model Manager

## Overview

The Model Manager is a new feature in Clara's Settings that allows users to browse, download, and manage GGUF models directly from Hugging Face. This provides an easy way to expand your local model collection without manually downloading files.

## Features

### 🔍 **Search Hugging Face Models**
- Search through thousands of GGUF models on Hugging Face
- Filter by downloads, likes, and tags
- View model details including author, description, and available files
- Real-time search with instant results

### ⬇️ **Download Models**
- One-click download of GGUF model files
- Real-time progress indicators with percentage and file size
- Automatic placement in `~/.clara/llama-models/` directory
- Automatic integration with llama-swap service

### 📁 **Local Model Management**
- View all locally available models
- See model details including file size, source, and modification date
- Delete unwanted models to free up disk space
- Automatic config regeneration after model changes

## How to Use

### Accessing the Model Manager

1. Open Clara application
2. Navigate to **Settings** (gear icon in sidebar)
3. Click on the **Model Manager** tab

### Searching for Models

1. In the "Search Hugging Face Models" section
2. Enter search terms like:
   - `llama` - for Llama models
   - `mistral` - for Mistral models
   - `qwen` - for Qwen models
   - `tinyllama` - for smaller models
3. Click **Search** or press Enter
4. Browse through the results

### Downloading Models

1. Find a model you want to download
2. Look at the "Available Files" section
3. Click **Download** next to the file you want
4. Monitor progress with the progress indicator
5. The model will automatically be available in llama-swap

### Managing Local Models

1. Scroll to the "Local Models" section
2. View all your downloaded models
3. See details like file size and last modified date
4. Click **Delete** to remove unwanted models

## Model Recommendations

### For Beginners (Fast, Lower Quality)
- **TinyLlama-1.1B** - Very fast, good for testing
- **Qwen2-1.5B** - Small but capable
- **Phi-3-mini** - Microsoft's efficient small model

### For Balanced Performance
- **Llama-3.1-8B** - Good balance of speed and quality
- **Mistral-7B** - Excellent instruction following
- **CodeLlama-7B** - Great for coding tasks

### For High Quality (Slower)
- **Llama-3.1-70B** - Top-tier performance (requires lots of RAM)
- **Mixtral-8x7B** - Mixture of experts model
- **Yi-34B** - High-quality Chinese/English model

## Technical Details

### Storage Location
Downloaded models are stored in:
```
~/.clara/llama-models/
```

### Integration
- Models are automatically detected by llama-swap service
- Configuration is regenerated after downloads/deletions
- Models become available immediately in the llama-swap API

### Supported Formats
- **GGUF** format only (optimized for llama.cpp)
- Various quantization levels (Q4, Q5, Q8, F16, etc.)
- Models from any Hugging Face repository

### API Integration
Uses the official Hugging Face API:
- **Search**: `https://huggingface.co/api/models`
- **Download**: Direct file downloads from HF repositories
- **Filtering**: Automatic GGUF format detection

## Troubleshooting

### Search Not Working
- Check internet connection
- Ensure Hugging Face is accessible
- Try simpler search terms

### Download Fails
- Check available disk space
- Ensure network stability
- Verify the model file exists

### Model Not Appearing in llama-swap
- Check if the file downloaded completely
- Restart llama-swap service
- Manually regenerate config in Servers page

### Permission Issues
- Ensure write access to `~/.clara/` directory
- Check if antivirus is blocking file downloads
- Run Clara with appropriate permissions

## File Size Considerations

GGUF models can be large:
- **1B parameter models**: 1-2 GB
- **7B parameter models**: 4-8 GB  
- **13B parameter models**: 8-15 GB
- **70B parameter models**: 40-80 GB

Ensure you have sufficient disk space before downloading.

## Security Notes

- Downloads are direct from Hugging Face repositories
- Files are verified for GGUF format
- No executable code is downloaded
- All downloads go to sandboxed model directory

## Future Enhancements

- [ ] Model quantization options
- [ ] Batch downloads
- [ ] Model update notifications
- [ ] Custom repository support
- [ ] Model performance benchmarks
- [ ] Automatic model recommendations

---

The Model Manager makes it incredibly easy to discover and use new AI models in Clara, expanding your capabilities without the complexity of manual model management! 