package main

import (
	"encoding/binary"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// GGUF constants for Python-style reading
const GGUF_MAGIC = 0x46554747

var GGUF_VALUE_TYPE = map[uint32]string{
	0: "UINT8", 1: "INT8", 2: "UINT16", 3: "INT16", 4: "UINT32",
	5: "INT32", 6: "FLOAT32", 7: "BOOL", 8: "STRING", 9: "ARRAY",
}

// Config structures for YAML parsing
type Config struct {
	HealthCheckTimeout int              `yaml:"healthCheckTimeout"`
	LogLevel           string           `yaml:"logLevel"`
	Models             map[string]Model `yaml:"models"`
	Groups             map[string]Group `yaml:"groups"`
}

type Model struct {
	Proxy string `yaml:"proxy"`
	Cmd   string `yaml:"cmd"`
	TTL   int    `yaml:"ttl"`
}

type Group struct {
	Swap       bool     `yaml:"swap"`
	Exclusive  bool     `yaml:"exclusive"`
	Persistent bool     `yaml:"persistent"`
	Members    []string `yaml:"members"`
}

// System specifications
type SystemSpecs struct {
	GPUMemoryMB    int
	SystemMemoryMB int
	CPUCores       int
	GPUName        string
	GPUCompute     float64
	HasCUDA        bool
	HasROCm        bool
	HasMetal       bool
	HasVulkan      bool
	OS             string
}

// Model metadata from llama-server
type ModelMetadata struct {
	Name              string
	TotalParams       int64
	Architecture      string
	ContextLength     int
	EmbeddingSize     int
	NumLayers         int
	NumHeads          int
	NumKVHeads        int
	KeyLength         int
	ValueLength       int
	SlidingWindowSize int
	NumExperts        int
	NumActiveExperts  int
	IsMoE             bool
	Quantization      string
	FileSize          int64
	RopeScaling       float64
	VocabSize         int
}

// Optimization presets
type Preset string

const (
	PresetHighSpeed   Preset = "high_speed"
	PresetMoreContext Preset = "more_context"
	PresetBalanced    Preset = "balanced"
	PresetSystemSafe  Preset = "system_safe"
	PresetUltra       Preset = "ultra_performance"
	PresetMoE         Preset = "moe_optimized"
)

// OptimizedParams holds the optimized parameters for a model
type OptimizedParams struct {
	NGPULayers      int
	Threads         int
	ContextSize     int
	BatchSize       int
	UBatchSize      int
	Keep            int
	DefragThreshold float64
	Parallel        int
	FlashAttn       bool
	ContBatching    bool
	MLock           bool
	MMProj          string
	TensorSplit     string
	MainGPU         int
	F16KV           bool
	LogitsAll       bool
	UseMMAP         bool
	NumaDistribute  bool
	OffloadKQV      bool // --no-kv-offload (keeps KV on CPU)
	SplitMode       string
	RopeScaling     float64
	RopeFreqBase    float64
	YarnExtFactor   float64
	YarnAttnFactor  float64
	NoKVOffload     bool
	CacheTypeK      string // KV cache quantization for K
	CacheTypeV      string // KV cache quantization for V
	PoolingType     string
	// MoE-specific optimizations
	OverrideTensors []string // For expert offloading
}

// Optimizer is the main optimization engine
type Optimizer struct {
	specs     *SystemSpecs
	config    *Config
	metadata  map[string]*ModelMetadata
	llamaPath string
	backend   string // cuda, vulkan, metal, rocm, cpu
}

// NewOptimizer creates a new optimizer instance
func NewOptimizer(configPath string) (*Optimizer, error) {
	// Read config
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config: %w", err)
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	// Detect system specs
	specs := detectSystemSpecs()

	// Extract llama-server path and detect backend
	llamaPath := extractLlamaPath(config)
	backend := detectBackend(llamaPath)

	fmt.Printf("Detected backend: %s\n", strings.ToUpper(backend))

	return &Optimizer{
		specs:     specs,
		config:    &config,
		metadata:  make(map[string]*ModelMetadata),
		llamaPath: llamaPath,
		backend:   backend,
	}, nil
}

// detectBackend detects the backend from the llama-server path
func detectBackend(llamaPath string) string {
	llamaPath = strings.ToLower(llamaPath)
	switch {
	case strings.Contains(llamaPath, "cuda"):
		return "cuda"
	case strings.Contains(llamaPath, "vulkan"):
		return "vulkan"
	case strings.Contains(llamaPath, "metal"):
		return "metal"
	case strings.Contains(llamaPath, "rocm"):
		return "rocm"
	case strings.Contains(llamaPath, "cpu"):
		return "cpu"
	default:
		// Try to detect from system
		if runtime.GOOS == "darwin" {
			return "metal"
		}
		// Default to CPU if unknown
		return "cpu"
	}
}

// detectSystemSpecs auto-detects system specifications
func detectSystemSpecs() *SystemSpecs {
	specs := &SystemSpecs{
		CPUCores: runtime.NumCPU(),
		OS:       runtime.GOOS,
	}

	// Detect GPU and memory
	switch runtime.GOOS {
	case "windows":
		specs.detectWindowsGPU()
	case "linux":
		specs.detectLinuxGPU()
	case "darwin":
		specs.detectMacGPU()
	}

	// Detect system memory
	specs.detectSystemMemory()

	return specs
}

func (s *SystemSpecs) detectWindowsGPU() {
	// Try nvidia-smi first
	cmd := exec.Command("nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits")
	output, err := cmd.Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(output)), "\n")
		if len(lines) > 0 {
			parts := strings.Split(lines[0], ",")
			if len(parts) >= 2 {
				s.GPUName = strings.TrimSpace(parts[0])
				if memMB, err := strconv.Atoi(strings.TrimSpace(parts[1])); err == nil {
					s.GPUMemoryMB = memMB
				}
				s.HasCUDA = true
				s.GPUCompute = getGPUComputeCapability(s.GPUName)
			}
		}
	}

	// Fallback to WMIC for system memory
	if s.SystemMemoryMB == 0 {
		cmd = exec.Command("wmic", "computersystem", "get", "TotalPhysicalMemory", "/value")
		output, err = cmd.Output()
		if err == nil {
			re := regexp.MustCompile(`TotalPhysicalMemory=(\d+)`)
			matches := re.FindStringSubmatch(string(output))
			if len(matches) > 1 {
				if bytes, err := strconv.ParseInt(matches[1], 10, 64); err == nil {
					s.SystemMemoryMB = int(bytes / 1024 / 1024)
				}
			}
		}
	}
}

func (s *SystemSpecs) detectLinuxGPU() {
	// Similar implementation for Linux using nvidia-smi or rocm-smi
	cmd := exec.Command("nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits")
	output, err := cmd.Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(output)), "\n")
		if len(lines) > 0 {
			parts := strings.Split(lines[0], ",")
			if len(parts) >= 2 {
				s.GPUName = strings.TrimSpace(parts[0])
				if memMB, err := strconv.Atoi(strings.TrimSpace(parts[1])); err == nil {
					s.GPUMemoryMB = memMB
				}
				s.HasCUDA = true
				s.GPUCompute = getGPUComputeCapability(s.GPUName)
			}
		}
	}
}

func (s *SystemSpecs) detectMacGPU() {
	// For Apple Silicon
	s.HasMetal = true
	s.GPUName = "Apple Silicon"
	// Estimate based on system memory (unified memory)
	s.detectSystemMemory()
	s.GPUMemoryMB = s.SystemMemoryMB // Unified memory
}

func (s *SystemSpecs) detectSystemMemory() {
	switch runtime.GOOS {
	case "linux":
		data, _ := os.ReadFile("/proc/meminfo")
		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			if strings.HasPrefix(line, "MemTotal:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					if kb, err := strconv.Atoi(fields[1]); err == nil {
						s.SystemMemoryMB = kb / 1024
						break
					}
				}
			}
		}
	case "darwin":
		cmd := exec.Command("sysctl", "-n", "hw.memsize")
		output, err := cmd.Output()
		if err == nil {
			if bytes, err := strconv.ParseInt(strings.TrimSpace(string(output)), 10, 64); err == nil {
				s.SystemMemoryMB = int(bytes / 1024 / 1024)
			}
		}
	case "windows":
		// Already handled in detectWindowsGPU
	}
}

func getGPUComputeCapability(gpuName string) float64 {
	gpuName = strings.ToLower(gpuName)
	switch {
	case strings.Contains(gpuName, "4090"), strings.Contains(gpuName, "4080"), strings.Contains(gpuName, "4070"):
		return 8.9
	case strings.Contains(gpuName, "3090"), strings.Contains(gpuName, "3080"), strings.Contains(gpuName, "3070"):
		return 8.6
	case strings.Contains(gpuName, "a100"):
		return 8.0
	case strings.Contains(gpuName, "a6000"):
		return 8.6
	case strings.Contains(gpuName, "h100"):
		return 9.0
	default:
		return 7.5
	}
}

func extractLlamaPath(config Config) string {
	for _, model := range config.Models {
		if match := regexp.MustCompile(`"([^"]*llama-server[^"]*)"`).FindStringSubmatch(model.Cmd); len(match) > 1 {
			return match[1]
		}
	}
	return ""
}

// FetchModelMetadata extracts model metadata from GGUF file and estimates properties
func (o *Optimizer) FetchModelMetadata(modelPath string) (*ModelMetadata, error) {
	metadata := &ModelMetadata{}

	// Try to read actual GGUF metadata first
	if err := o.readGGUFMetadata(modelPath, metadata); err != nil {
		fmt.Printf("  ⚠️ Could not read GGUF metadata: %v\n", err)
		fmt.Printf("  📝 Falling back to filename detection...\n")

		// Fallback to filename detection only if GGUF reading fails
		metadata.detectFromFilename(modelPath)
	}

	// Set default values based on model size if not detected
	if metadata.NumLayers == 0 {
		// Estimate layers based on architecture and parameter count from filename
		filename := strings.ToLower(filepath.Base(modelPath))

		if strings.Contains(filename, "qwen") {
			// Qwen architecture layer counts
			if strings.Contains(filename, "30b") {
				metadata.NumLayers = 60 // Qwen-30B: 60 layers
			} else if strings.Contains(filename, "13b") || strings.Contains(filename, "14b") {
				metadata.NumLayers = 40 // Qwen-13B: 40 layers
			} else if strings.Contains(filename, "7b") || strings.Contains(filename, "8b") {
				metadata.NumLayers = 32 // Qwen-7B: 32 layers
			} else if strings.Contains(filename, "4b") {
				metadata.NumLayers = 32 // Qwen-4B: 32 layers
			} else if strings.Contains(filename, "1b") || strings.Contains(filename, "nano") {
				metadata.NumLayers = 22 // Qwen-1B: 22 layers
			} else {
				metadata.NumLayers = 32 // Default Qwen
			}
		} else if strings.Contains(filename, "gemma") {
			// Gemma architecture layer counts
			if strings.Contains(filename, "27b") {
				metadata.NumLayers = 46 // Gemma-27B: 46 layers
			} else if strings.Contains(filename, "9b") {
				metadata.NumLayers = 42 // Gemma-9B: 42 layers
			} else if strings.Contains(filename, "7b") {
				metadata.NumLayers = 28 // Gemma-7B: 28 layers
			} else if strings.Contains(filename, "4b") {
				metadata.NumLayers = 26 // Gemma-4B: 26 layers
			} else if strings.Contains(filename, "2b") {
				metadata.NumLayers = 18 // Gemma-2B: 18 layers
			} else {
				metadata.NumLayers = 28 // Default Gemma
			}
		} else if strings.Contains(filename, "llama") {
			// Llama architecture layer counts
			if strings.Contains(filename, "70b") {
				metadata.NumLayers = 80 // Llama-70B: 80 layers
			} else if strings.Contains(filename, "30b") {
				metadata.NumLayers = 60 // Llama-30B: 60 layers
			} else if strings.Contains(filename, "13b") {
				metadata.NumLayers = 40 // Llama-13B: 40 layers
			} else if strings.Contains(filename, "7b") || strings.Contains(filename, "8b") {
				metadata.NumLayers = 32 // Llama-7B: 32 layers
			} else if strings.Contains(filename, "3b") {
				metadata.NumLayers = 26 // Llama-3B: 26 layers
			} else {
				metadata.NumLayers = 32 // Default Llama
			}
		} else {
			// Generic parameter count based estimation (fallback)
			if metadata.TotalParams > 0 {
				switch {
				case metadata.TotalParams < 2_000_000_000:
					metadata.NumLayers = 18
				case metadata.TotalParams < 5_000_000_000:
					metadata.NumLayers = 24
				case metadata.TotalParams < 8_000_000_000:
					metadata.NumLayers = 32
				case metadata.TotalParams < 15_000_000_000:
					metadata.NumLayers = 40
				case metadata.TotalParams < 35_000_000_000:
					metadata.NumLayers = 48
				case metadata.TotalParams < 70_000_000_000:
					metadata.NumLayers = 80
				default:
					metadata.NumLayers = 96
				}
			} else {
				// Final fallback based on filename patterns
				if strings.Contains(filename, "30b") || strings.Contains(filename, "27b") {
					metadata.NumLayers = 60
				} else if strings.Contains(filename, "13b") || strings.Contains(filename, "14b") {
					metadata.NumLayers = 40
				} else if strings.Contains(filename, "7b") || strings.Contains(filename, "8b") {
					metadata.NumLayers = 32
				} else if strings.Contains(filename, "3b") || strings.Contains(filename, "4b") {
					metadata.NumLayers = 26
				} else if strings.Contains(filename, "1b") || strings.Contains(filename, "nano") {
					metadata.NumLayers = 22
				} else {
					metadata.NumLayers = 32 // Default
				}
			}
		}

		fmt.Printf("  🔧 ESTIMATED LAYERS: %d (arch: %s)\n", metadata.NumLayers, detectArchitecture(filename))
	}

	// Only use filename fallback for context if GGUF reading completely failed
	if metadata.ContextLength == 0 {
		fmt.Printf("  ⚠️ Context length not found in metadata, using filename fallback\n")
		filename := strings.ToLower(filepath.Base(modelPath))
		fmt.Printf("  🔍 CONTEXT DETECTION DEBUG:\n")
		fmt.Printf("    - Filename: %s\n", filename)
		fmt.Printf("    - Full path: %s\n", strings.ToLower(modelPath))

		switch {
		case strings.Contains(filename, "128k"):
			metadata.ContextLength = 131072
			fmt.Printf("    - Found '128k' → Setting to 128K context\n")
		case strings.Contains(filename, "64k"):
			metadata.ContextLength = 65536
			fmt.Printf("    - Found '64k' → Setting to 64K context\n")
		case strings.Contains(filename, "32k"):
			metadata.ContextLength = 32768
			fmt.Printf("    - Found '32k' → Setting to 32K context\n")
		case strings.Contains(filename, "16k"):
			metadata.ContextLength = 16384
			fmt.Printf("    - Found '16k' → Setting to 16K context\n")
		case strings.Contains(filename, "8k"):
			metadata.ContextLength = 8192
			fmt.Printf("    - Found '8k' → Setting to 8K context\n")
		case strings.Contains(filename, "1m"):
			metadata.ContextLength = 1048576
			fmt.Printf("    - Found '1m' → Setting to 1M context\n")
		default:
			// Default context based on model generation
			if strings.Contains(filename, "qwen3") || strings.Contains(filename, "gemma-3") {
				metadata.ContextLength = 131072 // Modern models typically support 128K+
				fmt.Printf("    - Qwen3/Gemma-3 default → Setting to 128K context\n")
			} else {
				metadata.ContextLength = 32768 // More reasonable default
				fmt.Printf("    - Generic default → Setting to 32K context\n")
			}
		}
		fmt.Printf("    - ✅ FINAL CONTEXT LENGTH: %d\n", metadata.ContextLength)
	} else {
		fmt.Printf("  ✅ CONTEXT FROM METADATA: %d\n", metadata.ContextLength)
	}

	// Set embedding size based on model size
	if metadata.EmbeddingSize == 0 {
		if metadata.TotalParams > 0 {
			switch {
			case metadata.TotalParams < 2_000_000_000:
				metadata.EmbeddingSize = 2048
			case metadata.TotalParams < 8_000_000_000:
				metadata.EmbeddingSize = 4096
			case metadata.TotalParams < 35_000_000_000:
				metadata.EmbeddingSize = 5120
			default:
				metadata.EmbeddingSize = 8192
			}
		} else {
			metadata.EmbeddingSize = 4096
		}
	}

	return metadata, nil
}

// readGGUFMetadata reads metadata directly from GGUF file using Python-style simple approach
func (o *Optimizer) readGGUFMetadata(modelPath string, metadata *ModelMetadata) error {
	file, err := os.Open(modelPath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	// Read header: magic(4) + version(4) + tensor_count(8) + metadata_kv_count(8)
	header := make([]byte, 24)
	if _, err := file.Read(header); err != nil {
		return fmt.Errorf("failed to read header: %w", err)
	}

	magic := binary.LittleEndian.Uint32(header[0:4])
	if magic != GGUF_MAGIC {
		return fmt.Errorf("invalid GGUF magic number: 0x%x", magic)
	}

	metadataKVCount := binary.LittleEndian.Uint64(header[16:24])
	fmt.Printf("  📋 GGUF INFO: metadata_entries=%d\n", metadataKVCount)

	return o.readMetadataEntries(file, int(metadataKVCount), metadata)
}

// readMetadataEntries reads metadata entries using simplified approach
func (o *Optimizer) readMetadataEntries(file *os.File, count int, metadata *ModelMetadata) error {
	keysToRead := map[string]bool{
		"general.architecture": true,
		"general.name":         true,
	}

	archSpecificKeysAdded := false
	successCount := 0

	for i := 0; i < count; i++ {
		key, err := o.readString(file)
		if err != nil {
			continue // Skip on error
		}

		valueTypeBytes := make([]byte, 4)
		if _, err := file.Read(valueTypeBytes); err != nil {
			continue
		}
		valueTypeIdx := binary.LittleEndian.Uint32(valueTypeBytes)

		// Add architecture-specific keys once we know the architecture
		if !archSpecificKeysAdded && metadata.Architecture != "" {
			arch := metadata.Architecture
			keysToRead[arch+".block_count"] = true
			keysToRead[arch+".context_length"] = true
			keysToRead[arch+".attention.head_count_kv"] = true
			keysToRead[arch+".attention.key_length"] = true
			keysToRead[arch+".attention.value_length"] = true
			keysToRead[arch+".attention.sliding_window_size"] = true
			keysToRead[arch+".embedding_length"] = true
			archSpecificKeysAdded = true
		}

		if keysToRead[key] {
			if value, err := o.readValue(file, valueTypeIdx); err == nil {
				o.parseMetadataValue(key, value, metadata)
				successCount++
			} else {
				o.skipValue(file, valueTypeIdx)
			}
		} else {
			o.skipValue(file, valueTypeIdx)
		}
	}

	fmt.Printf("  ✅ Successfully parsed %d/%d metadata entries\n", successCount, count)
	return nil
}

// readString reads a string from the file
func (o *Optimizer) readString(file *os.File) (string, error) {
	lengthBytes := make([]byte, 8)
	if _, err := file.Read(lengthBytes); err != nil {
		return "", err
	}
	length := binary.LittleEndian.Uint64(lengthBytes)

	if length > 1024 { // Reasonable limit
		return "", fmt.Errorf("string length too large: %d", length)
	}

	strBytes := make([]byte, length)
	if _, err := file.Read(strBytes); err != nil {
		return "", err
	}
	return string(strBytes), nil
}

// readValue reads a value based on its type
func (o *Optimizer) readValue(file *os.File, valueTypeIdx uint32) (interface{}, error) {
	valueType, ok := GGUF_VALUE_TYPE[valueTypeIdx]
	if !ok {
		return nil, fmt.Errorf("unknown GGUF value type: %d", valueTypeIdx)
	}

	switch valueType {
	case "STRING":
		return o.readString(file)
	case "UINT32":
		bytes := make([]byte, 4)
		if _, err := file.Read(bytes); err != nil {
			return nil, err
		}
		return binary.LittleEndian.Uint32(bytes), nil
	case "INT32":
		bytes := make([]byte, 4)
		if _, err := file.Read(bytes); err != nil {
			return nil, err
		}
		return int32(binary.LittleEndian.Uint32(bytes)), nil
	default:
		return nil, o.skipValue(file, valueTypeIdx)
	}
}

// skipValue skips a value based on its type
func (o *Optimizer) skipValue(file *os.File, valueTypeIdx uint32) error {
	valueType, ok := GGUF_VALUE_TYPE[valueTypeIdx]
	if !ok {
		return nil
	}

	switch valueType {
	case "UINT8", "INT8", "BOOL":
		_, err := file.Seek(1, 1)
		return err
	case "UINT16", "INT16":
		_, err := file.Seek(2, 1)
		return err
	case "UINT32", "INT32", "FLOAT32":
		_, err := file.Seek(4, 1)
		return err
	case "STRING":
		lengthBytes := make([]byte, 8)
		if _, err := file.Read(lengthBytes); err != nil {
			return err
		}
		length := binary.LittleEndian.Uint64(lengthBytes)
		_, err := file.Seek(int64(length), 1)
		return err
	case "ARRAY":
		// Read array type and count
		arrayHeader := make([]byte, 12)
		if _, err := file.Read(arrayHeader); err != nil {
			return err
		}
		arrayTypeIdx := binary.LittleEndian.Uint32(arrayHeader[0:4])
		count := binary.LittleEndian.Uint64(arrayHeader[4:12])

		// Skip array elements
		typeMap := map[uint32]int64{
			0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8,
		}

		if elementSize, ok := typeMap[arrayTypeIdx]; ok {
			_, err := file.Seek(int64(count)*elementSize, 1)
			return err
		} else {
			// Skip string arrays element by element
			for i := uint64(0); i < count; i++ {
				if err := o.skipValue(file, 8); err != nil { // STRING type
					return err
				}
			}
		}
	}
	return nil
}

// parseMetadataValue parses a metadata value and stores it in the ModelMetadata
func (o *Optimizer) parseMetadataValue(key string, value interface{}, metadata *ModelMetadata) {
	switch key {
	case "general.architecture":
		if archStr, ok := value.(string); ok {
			metadata.Architecture = archStr
			fmt.Printf("  🎯 FOUND ARCHITECTURE: %s\n", metadata.Architecture)

			// Detect MoE based on architecture
			if strings.Contains(archStr, "moe") {
				metadata.IsMoE = true
				fmt.Printf("  🧩 DETECTED MoE ARCHITECTURE\n")
			}
		}
	case "general.name":
		if nameStr, ok := value.(string); ok {
			metadata.Name = nameStr
			fmt.Printf("  🎯 FOUND MODEL NAME: %s\n", metadata.Name)
		}
	default:
		// Handle architecture-specific keys
		if strings.HasSuffix(key, ".context_length") {
			if ctxLen := getIntFromValue(value); ctxLen > 0 {
				metadata.ContextLength = ctxLen
				fmt.Printf("  🎯 FOUND CONTEXT LENGTH: %d\n", metadata.ContextLength)
			}
		} else if strings.HasSuffix(key, ".embedding_length") {
			if embLen := getIntFromValue(value); embLen > 0 {
				metadata.EmbeddingSize = embLen
				fmt.Printf("  🎯 FOUND EMBEDDING SIZE: %d\n", metadata.EmbeddingSize)
			}
		} else if strings.HasSuffix(key, ".block_count") {
			if blockCount := getIntFromValue(value); blockCount > 0 {
				metadata.NumLayers = blockCount
				fmt.Printf("  🎯 FOUND LAYER COUNT: %d\n", metadata.NumLayers)
			}
		} else if strings.HasSuffix(key, ".attention.head_count_kv") {
			if headCount := getIntFromValue(value); headCount > 0 {
				metadata.NumKVHeads = headCount
				fmt.Printf("  🎯 FOUND KV HEAD COUNT: %d\n", metadata.NumKVHeads)
			}
		} else if strings.HasSuffix(key, ".attention.key_length") {
			if keyLen := getIntFromValue(value); keyLen > 0 {
				metadata.KeyLength = keyLen
				fmt.Printf("  🎯 FOUND KEY LENGTH: %d\n", metadata.KeyLength)
			}
		} else if strings.HasSuffix(key, ".attention.value_length") {
			if valueLen := getIntFromValue(value); valueLen > 0 {
				metadata.ValueLength = valueLen
				fmt.Printf("  🎯 FOUND VALUE LENGTH: %d\n", metadata.ValueLength)
			}
		} else if strings.HasSuffix(key, ".attention.sliding_window_size") {
			if windowSize := getIntFromValue(value); windowSize > 0 {
				metadata.SlidingWindowSize = windowSize
				fmt.Printf("  🎯 FOUND SLIDING WINDOW SIZE: %d\n", metadata.SlidingWindowSize)
			}
		}
	}
}

// getIntFromValue extracts an integer from various value types
func getIntFromValue(value interface{}) int {
	switch v := value.(type) {
	case uint32:
		return int(v)
	case int32:
		return int(v)
	case uint64:
		return int(v)
	case int64:
		return int(v)
	case int:
		return v
	}
	return 0
}

func (m *ModelMetadata) detectFromFilename(path string) {
	// Use both basename and full path for detection
	filename := strings.ToLower(filepath.Base(path))
	fullpath := strings.ToLower(path)

	// Detect quantization - check both filename and full path
	quantPatterns := []string{
		`Q\d+_K_M`, `Q\d+_K_S`, `Q\d+_K`,
		`Q\d+_M`, `Q\d+_0`,
		`IQ\d+_XS`, `IQ\d+_XXS`, `IQ\d+_S`,
		`F16`, `F32`,
	}

	for _, pattern := range quantPatterns {
		re := regexp.MustCompile(`(?i)` + pattern)
		if match := re.FindString(fullpath); match != "" {
			m.Quantization = strings.ToUpper(match)
			break
		}
	}

	// Detect MoE architectures
	if strings.Contains(filename, "mixtral") || strings.Contains(filename, "moe") {
		m.IsMoE = true
		if m.NumExperts == 0 {
			m.NumExperts = 8
		}
	}
	if strings.Contains(fullpath, "a3b") {
		m.IsMoE = true
		m.NumExperts = 3
		m.NumActiveExperts = 2
	}

	// Estimate parameters from filename - check multiple patterns
	patterns := []struct {
		regex      *regexp.Regexp
		multiplier int64
	}{
		{regexp.MustCompile(`(\d+)b[-_\.]`), 1_000_000_000},     // 30b-
		{regexp.MustCompile(`[-_](\d+)b[-_\.]`), 1_000_000_000}, // -30b-
		{regexp.MustCompile(`(\d+\.\d+)b`), 1_000_000_000},      // 3.5b
		{regexp.MustCompile(`(\d+)m[-_\.]`), 1_000_000},         // 350m
	}

	for _, p := range patterns {
		if match := p.regex.FindStringSubmatch(filename); len(match) > 1 {
			if val, err := strconv.ParseFloat(match[1], 64); err == nil {
				m.TotalParams = int64(val * float64(p.multiplier))
				break
			}
		}
	}

	// Special cases for known models
	if strings.Contains(filename, "nano") && m.TotalParams == 0 {
		m.TotalParams = 1_000_000_000 // 1B for nano models
	}
	if strings.Contains(filename, "mxbai") && strings.Contains(filename, "large") {
		m.TotalParams = 335_000_000 // 335M for mxbai-large
	}
}

// Optimize generates optimized parameters for a model based on preset
func (o *Optimizer) Optimize(modelName string, preset Preset) (*OptimizedParams, error) {
	model, exists := o.config.Models[modelName]
	if !exists {
		return nil, fmt.Errorf("model %s not found", modelName)
	}

	// Extract model path from command
	modelPath := extractModelPath(model.Cmd)

	fmt.Printf("\n=== Optimizing %s ===\n", modelName)
	fmt.Printf("Model file: %s\n", filepath.Base(modelPath))

	// Get or fetch metadata
	metadata, exists := o.metadata[modelName]
	if !exists {
		var err error
		metadata, err = o.FetchModelMetadata(modelPath)
		if err != nil {
			// Log the error but continue with fallback
			fmt.Printf("Warning: Could not fetch metadata from server: %v\n", err)
			fmt.Println("Falling back to filename-based detection...")

			// Fallback to parsing from filename
			metadata = &ModelMetadata{}
			metadata.detectFromFilename(modelPath)
		}
		o.metadata[modelName] = metadata

		// Log detected metadata
		fmt.Printf("Model metadata:\n")
		fmt.Printf("  Parameters: %.1fB\n", float64(metadata.TotalParams)/1_000_000_000)
		fmt.Printf("  Layers: %d\n", metadata.NumLayers)
		fmt.Printf("  Context: %d\n", metadata.ContextLength)
		fmt.Printf("  Quantization: %s\n", metadata.Quantization)
		if metadata.Quantization == "" {
			fmt.Printf("  (Warning: Could not detect quantization from: %s)\n", filepath.Base(modelPath))
		}
		fmt.Printf("  MoE: %v (Experts: %d, Active: %d)\n", metadata.IsMoE, metadata.NumExperts, metadata.NumActiveExperts)
	}

	// Run Python-style GPU memory estimation
	fmt.Printf("\n=== Running GPU Memory Estimation ===\n")
	if err := o.runGPUEstimator(modelPath, metadata, 2.0); err != nil {
		fmt.Printf("Warning: GPU estimation failed: %v\n", err)
	}

	// Generate optimized parameters based on preset
	params := o.generateParams(metadata, preset, modelPath)

	return params, nil
}

func extractModelPath(cmd string) string {
	re := regexp.MustCompile(`-m\s+"([^"]+)"`)
	if match := re.FindStringSubmatch(cmd); len(match) > 1 {
		return match[1]
	}
	return ""
}

func (o *Optimizer) generateParams(metadata *ModelMetadata, preset Preset, modelPath string) *OptimizedParams {
	params := &OptimizedParams{
		ContBatching: true,
		UseMMAP:      true,
		F16KV:        false,
	}

	// Backend-specific feature detection
	switch o.backend {
	case "cuda":
		params.FlashAttn = o.specs.GPUCompute >= 8.0
		params.MLock = o.specs.SystemMemoryMB > 32000
	case "vulkan":
		params.FlashAttn = false // Vulkan doesn't support flash attention yet
		params.MLock = o.specs.SystemMemoryMB > 32000
	case "metal":
		params.FlashAttn = true // Metal supports flash attention
		params.MLock = false    // macOS handles memory differently
	case "rocm":
		params.FlashAttn = o.specs.GPUCompute >= 8.0
		params.MLock = o.specs.SystemMemoryMB > 32000
	case "cpu":
		params.FlashAttn = false
		params.MLock = o.specs.SystemMemoryMB > 16000
	}

	// Calculate memory requirements
	quantMultiplier := getQuantMultiplier(metadata.Quantization)

	// Get ACTUAL model file size from filesystem
	actualModelSizeGB := getActualModelSize(modelPath)

	// Also calculate estimated size for comparison
	estimatedModelSizeGB := estimateModelSize(metadata, quantMultiplier)

	// Compare actual vs estimated
	fmt.Printf("  📊 SIZE COMPARISON:\n")
	fmt.Printf("    - Estimated: %.2f GB\n", estimatedModelSizeGB)
	fmt.Printf("    - Actual:    %.2f GB\n", actualModelSizeGB)
	if actualModelSizeGB > 0 {
		diff := ((actualModelSizeGB - estimatedModelSizeGB) / estimatedModelSizeGB) * 100
		fmt.Printf("    - Difference: %.1f%%\n", diff)
	}

	// Use actual size if available, fallback to estimated
	var modelSizeGB float64
	if actualModelSizeGB > 0 {
		modelSizeGB = actualModelSizeGB
		fmt.Printf("  ✅ Using ACTUAL file size: %.2f GB\n", modelSizeGB)
	} else {
		modelSizeGB = estimatedModelSizeGB
		fmt.Printf("  ⚠️ Using ESTIMATED size: %.2f GB\n", modelSizeGB)
	}

	// Determine if we're in CPU-only mode or have GPU
	var availableMemoryMB float64
	var isGPUMode bool

	if o.backend == "cpu" || o.specs.GPUMemoryMB == 0 {
		// CPU-only mode
		isGPUMode = false
		availableMemoryMB = float64(o.specs.SystemMemoryMB)
	} else {
		// GPU mode - check if model fits in GPU with 80% rule
		gpuVRAMGB := float64(o.specs.GPUMemoryMB) / 1024
		if modelSizeGB <= gpuVRAMGB*0.8 {
			isGPUMode = true
			availableMemoryMB = float64(o.specs.GPUMemoryMB)

			// Check if model is very small (less than 50% of VRAM) - use simple optimization
			if modelSizeGB <= gpuVRAMGB*0.5 {
				fmt.Printf("  🎯 SMALL MODEL: %.1fGB fits easily in %.1fGB VRAM (%.1f%% usage)\n",
					modelSizeGB, gpuVRAMGB, (modelSizeGB/gpuVRAMGB)*100)
				fmt.Printf("  ✅ Using SIMPLE OPTIMIZATION - no complex tuning needed\n")

				// Apply simple, optimal settings for small models
				params.NGPULayers = 9999                                           // All layers on GPU
				params.ContextSize = max(8192, min(metadata.ContextLength, 32768)) // Good context
				params.BatchSize = 512                                             // Standard batch size
				params.UBatchSize = 256
				params.Keep = 2048
				params.Parallel = min(8, o.specs.CPUCores/2)
				params.Threads = o.specs.CPUCores * 2 / 3
				params.DefragThreshold = 0.1
				params.CacheTypeK = "q8_0" // Balanced KV cache
				params.CacheTypeV = "q8_0"
				params.ContBatching = true
				params.FlashAttn = o.backend == "cuda" && o.specs.GPUCompute >= 8.0
				params.MLock = o.specs.SystemMemoryMB > 32000

				fmt.Printf("  🚀 SIMPLE: All layers on GPU, Context=%dK, Batch=%d, Threads=%d\n",
					params.ContextSize/1024, params.BatchSize, params.Threads)

				// Skip complex optimization and go straight to backend adjustments
				o.adjustForBackend(params, metadata)
				return params
			}
		} else {
			// Model exceeds 80% of GPU VRAM but we can still use hybrid GPU+CPU mode
			isGPUMode = true // Keep GPU mode for hybrid approach
			availableMemoryMB = float64(o.specs.GPUMemoryMB)
			fmt.Printf("Model size %.1fGB exceeds 80%% of GPU VRAM (%.1fGB), using hybrid GPU+CPU mode\n",
				modelSizeGB, gpuVRAMGB*0.8)
		}
	}

	// Apply preset optimizations with new aggressive strategy
	switch preset {
	case PresetHighSpeed:
		o.optimizeForSpeed(params, metadata, modelSizeGB, availableMemoryMB, isGPUMode)
	case PresetMoreContext:
		o.optimizeForContext(params, metadata, modelSizeGB, availableMemoryMB, isGPUMode)
	case PresetBalanced:
		o.optimizeBalanced(params, metadata, modelSizeGB, availableMemoryMB, isGPUMode, modelPath)
	case PresetSystemSafe:
		o.optimizeSystemSafe(params, metadata, modelSizeGB, availableMemoryMB, isGPUMode)
	case PresetUltra:
		o.optimizeUltra(params, metadata, modelSizeGB, availableMemoryMB, isGPUMode)
	case PresetMoE:
		o.optimizeMoESpecific(params, metadata, modelSizeGB, availableMemoryMB, isGPUMode)
	default:
		// Fallback to balanced if somehow we get here
		fmt.Printf("  ⚠️ Unknown preset %s, falling back to balanced\n", preset)
		o.optimizeBalanced(params, metadata, modelSizeGB, availableMemoryMB, isGPUMode, modelPath)
	}

	// Backend-specific adjustments
	o.adjustForBackend(params, metadata)

	// MoE specific optimizations (always apply for MoE models)
	if metadata.IsMoE {
		o.optimizeMoE(params, metadata, availableMemoryMB)
	}

	// Thread optimization
	params.Threads = o.optimizeThreads(metadata, preset)

	return params
}

// adjustForBackend makes backend-specific adjustments
func (o *Optimizer) adjustForBackend(params *OptimizedParams, metadata *ModelMetadata) {
	switch o.backend {
	case "vulkan":
		// Vulkan specific limitations - CRITICAL for avoiding OOM
		params.FlashAttn = false      // Not supported
		params.NumaDistribute = false // Not applicable
		params.F16KV = false          // May cause issues

		// Conservative batch sizes for Vulkan
		if params.BatchSize > 1024 {
			params.BatchSize = 1024
		}
		if params.UBatchSize > 512 {
			params.UBatchSize = 512
		}

		// Reduce parallel processing for Vulkan
		if params.Parallel > 4 {
			params.Parallel = 4
		}

		// Don't use aggressive KV cache quantization on Vulkan
		if params.CacheTypeK == "q2_k" {
			params.CacheTypeK = "q8_0"
			params.CacheTypeV = "q8_0"
		}

	case "metal":
		// Metal specific optimizations
		params.NumaDistribute = false // Not applicable for macOS
		params.MLock = false          // macOS handles memory differently
		// Metal handles unified memory well
		if o.specs.OS == "darwin" {
			params.NoKVOffload = true // Keep KV cache in unified memory
		}

	case "rocm":
		// ROCm specific adjustments
		if params.BatchSize > 2048 {
			params.BatchSize = 2048 // ROCm may have different limits
		}

	case "cpu":
		// CPU-only adjustments
		params.NGPULayers = 0 // No GPU offloading
		params.FlashAttn = false
		params.OffloadKQV = false
		params.NoKVOffload = true
		params.SplitMode = "" // Not applicable
		params.NumaDistribute = false
		// Don't use KV cache quantization on CPU
		params.CacheTypeK = ""
		params.CacheTypeV = ""
	}
}

// New aggressive memory calculation function
func (o *Optimizer) calculateMemoryBudget(modelSizeGB float64, availableMemoryMB float64, isGPUMode bool, preset Preset, metadata *ModelMetadata) (int, int, float64) {
	var targetUtilization float64
	var overheadMB float64

	// Set target memory utilization by preset
	switch preset {
	case PresetSystemSafe:
		targetUtilization = 0.95
	case PresetBalanced:
		targetUtilization = 0.90 // Only mode that "wastes" memory
	case PresetHighSpeed:
		targetUtilization = 0.97
	case PresetMoreContext:
		targetUtilization = 0.98
	case PresetUltra:
		targetUtilization = 0.98
	case PresetMoE:
		targetUtilization = 0.97
	default:
		targetUtilization = 0.95
	}

	// Adjust overhead based on backend
	if isGPUMode {
		switch o.backend {
		case "cuda":
			overheadMB = 200
		case "vulkan":
			overheadMB = 500 // Vulkan needs more overhead
		case "metal":
			overheadMB = 300
		case "rocm":
			overheadMB = 400
		}
	} else {
		// CPU mode - need more overhead for OS
		overheadMB = 1024 // 1GB for OS and other processes
	}

	// Calculate GPU layers strategy
	var gpuLayers int
	availableVRAMGB := availableMemoryMB / 1024

	if isGPUMode && modelSizeGB <= availableVRAMGB*0.8 {
		// Model fits 80% rule - use all layers
		gpuLayers = -1 // Special value meaning "all layers"
		fmt.Printf("  ✅ MODEL FITS 80%% RULE: %.1fGB <= %.1fGB (80%% of %.1fGB)\n",
			modelSizeGB, availableVRAMGB*0.8, availableVRAMGB)
	} else if isGPUMode {
		// Model exceeds 80% - calculate maximum layers that FIT
		fmt.Printf("  ⚡ MODEL EXCEEDS 80%% RULE: %.1fGB > %.1fGB - calculating partial GPU layers\n",
			modelSizeGB, availableVRAMGB*0.8)

		// Use the calculateMaxGPULayers function for accurate calculation
		totalLayers := metadata.NumLayers
		if totalLayers == 0 {
			totalLayers = 32 // Fallback
		}

		// Use aggressive context for high-performance modes
		aggressiveContext := (preset == PresetHighSpeed || preset == PresetUltra || preset == PresetMoreContext)

		gpuLayers = calculateMaxGPULayers(modelSizeGB, availableMemoryMB, totalLayers, metadata.IsMoE, aggressiveContext)
		fmt.Printf("  🎯 CALCULATED GPU LAYERS: %d out of %d total layers\n", gpuLayers, totalLayers)

		// Ensure we use at least SOME GPU layers if we have VRAM
		if gpuLayers == 0 && availableVRAMGB > 4 {
			gpuLayers = max(1, totalLayers/4) // Use at least 25% of layers
			fmt.Printf("  🔧 EMERGENCY FALLBACK: Using %d GPU layers (25%% minimum)\n", gpuLayers)
		}
	} else {
		gpuLayers = 0 // CPU only
		fmt.Printf("  🖥️ CPU ONLY MODE: No GPU layers\n")
	}

	totalBudgetMB := availableMemoryMB * targetUtilization
	modelBudgetMB := modelSizeGB * 1024
	usableBudgetMB := totalBudgetMB - modelBudgetMB - overheadMB

	// Ensure minimum 8K context
	minContextMemoryMB := estimateContextMemory(8192, 4096, "f16") * 1024
	if usableBudgetMB < minContextMemoryMB {
		// Emergency fallback - reduce model layers or use more aggressive quantization
		fmt.Printf("Warning: Insufficient memory for 8K context, attempting aggressive optimization\n")
		usableBudgetMB = minContextMemoryMB
	}

	return gpuLayers, int(usableBudgetMB), usableBudgetMB
}

func (o *Optimizer) optimizeForSpeed(params *OptimizedParams, metadata *ModelMetadata, modelSizeGB float64, availableMemoryMB float64, isGPUMode bool) {
	gpuLayers, _, usableBudgetFloat := o.calculateMemoryBudget(modelSizeGB, availableMemoryMB, isGPUMode, PresetHighSpeed, metadata)

	// GPU layers - use 9999 if fits 80% rule (let llama.cpp decide)
	if gpuLayers == -1 {
		params.NGPULayers = 9999 // Let llama.cpp load all layers
		fmt.Printf("  🚀 HIGH SPEED: All layers on GPU (fits 80%% rule, using 9999)\n")
	} else {
		params.NGPULayers = gpuLayers
	}

	// Context: Minimum 8K, use aggressive KV quantization to save memory for speed optimizations
	params.ContextSize = max(8192, min(16384, metadata.ContextLength))
	params.CacheTypeK = "q4_0" // Aggressive quantization for speed
	params.CacheTypeV = "q4_0"

	contextMemoryMB := estimateContextMemory(params.ContextSize, metadata.EmbeddingSize, params.CacheTypeK) * 1024
	remainingBudgetMB := usableBudgetFloat - contextMemoryMB

	// Use remaining memory for SPEED optimizations - but cap batch size for stability
	if remainingBudgetMB > 1000 { // If we have > 1GB remaining
		// Cap batch size at 512 for stability
		params.BatchSize = min(512, int(remainingBudgetMB/8))
		params.UBatchSize = params.BatchSize / 2
		// High parallelism for speed
		params.Parallel = min(16, o.specs.CPUCores)
		// Generous keep cache
		params.Keep = min(4096, params.ContextSize/2)
	} else {
		// Conservative settings if tight on memory
		params.BatchSize = 256
		params.UBatchSize = 128
		params.Parallel = min(8, o.specs.CPUCores/2)
		params.Keep = 1024
	}

	params.DefragThreshold = 0.05 // Aggressive defrag for speed
	params.NoKVOffload = false

	fmt.Printf("  ⚡ HIGH SPEED: Context=%dK, Batch=%d, Parallel=%d, VRAM=%.1f%%\n",
		params.ContextSize/1024, params.BatchSize, params.Parallel,
		(availableMemoryMB*0.97)/availableMemoryMB*100)

	// CRITICAL: Validate context memory safety
	o.validateContextMemory(params, metadata, modelSizeGB, availableMemoryMB)
}

func (o *Optimizer) optimizeForContext(params *OptimizedParams, metadata *ModelMetadata, modelSizeGB float64, availableMemoryMB float64, isGPUMode bool) {
	gpuLayers, _, usableBudgetFloat := o.calculateMemoryBudget(modelSizeGB, availableMemoryMB, isGPUMode, PresetMoreContext, metadata)

	// GPU layers - use 9999 if fits 80% rule (let llama.cpp decide)
	if gpuLayers == -1 {
		params.NGPULayers = 9999 // Let llama.cpp load all layers
		fmt.Printf("  🧠 MORE CONTEXT: All layers on GPU (fits 80%% rule, using 9999)\n")
	} else {
		params.NGPULayers = gpuLayers
	}

	// Context: Use remaining memory for maximum context, but KV cache minimum is q4_0
	params.CacheTypeK = "q4_0" // Minimum safe quantization for KV cache
	params.CacheTypeV = "q4_0" // Never go below q4_0

	// Calculate maximum possible context with remaining budget
	maxPossibleContext := int(usableBudgetFloat / (estimateContextMemory(1024, metadata.EmbeddingSize, params.CacheTypeK) * 1024) * 1024)
	params.ContextSize = min(maxPossibleContext, metadata.ContextLength)
	params.ContextSize = max(8192, params.ContextSize) // Ensure minimum 8K

	// Minimal settings for everything else to maximize context
	params.BatchSize = min(256, 512) // Cap at 512, but prefer smaller for context
	params.UBatchSize = min(128, params.BatchSize/2)
	params.Keep = min(params.ContextSize/8, 2048) // Conservative keep
	params.Parallel = min(2, o.specs.CPUCores/4)  // Low parallel to save memory
	params.DefragThreshold = 0.05
	params.OffloadKQV = true

	fmt.Printf("  🧠 MORE CONTEXT: Context=%dK, Batch=%d, KV Cache=q4_0 (minimum safe), VRAM=%.1f%%\n",
		params.ContextSize/1024, params.BatchSize,
		(availableMemoryMB*0.98)/availableMemoryMB*100)

	// CRITICAL: Validate context memory safety
	o.validateContextMemory(params, metadata, modelSizeGB, availableMemoryMB)
}

func (o *Optimizer) optimizeBalanced(params *OptimizedParams, metadata *ModelMetadata, modelSizeGB float64, availableMemoryMB float64, isGPUMode bool, modelPath string) {
	gpuLayers, _, _ := o.calculateMemoryBudget(modelSizeGB, availableMemoryMB, isGPUMode, PresetBalanced, metadata)

	// GPU layers - use 9999 if fits 80% rule (let llama.cpp decide)
	if gpuLayers == -1 {
		params.NGPULayers = 9999 // Let llama.cpp load all layers
		fmt.Printf("  ⚖️ BALANCED: All layers on GPU (fits 80%% rule, using 9999)\n")
	} else {
		params.NGPULayers = gpuLayers
	}

	// Context: PROPERLY calculate based on actual remaining memory after model loading
	params.CacheTypeK = "q8_0" // Balanced quantization
	params.CacheTypeV = "q8_0"

	// Calculate ACTUAL remaining memory in MB after loading the model
	availableVRAMGB := availableMemoryMB / 1024
	actualRemainingGB := availableVRAMGB - modelSizeGB - 0.5 // 0.5GB overhead

	fmt.Printf("  🧮 MEMORY BREAKDOWN:\n")
	fmt.Printf("    - Total VRAM: %.1f GB\n", availableVRAMGB)
	fmt.Printf("    - Model size: %.1f GB\n", modelSizeGB)
	fmt.Printf("    - Overhead: 0.5 GB\n")
	fmt.Printf("    - Available for context: %.1f GB\n", actualRemainingGB)

	if actualRemainingGB <= 0 {
		// Not enough memory - force minimal context
		params.ContextSize = 8192
		fmt.Printf("    - ❌ INSUFFICIENT MEMORY: Using minimum 8K context\n")
	} else {
		// Calculate maximum context from available memory
		// First calculate memory needed for 8K as reference
		contextMemoryGB := estimateContextMemoryCorrect(8192, modelSizeGB, metadata.NumLayers, params.NGPULayers, params.CacheTypeK, metadata.EmbeddingSize)
		fmt.Printf("    - 8K context needs: %.3f GB\n", contextMemoryGB)

		// Calculate maximum possible context tokens from available memory (use 80% of available)
		usableMemoryGB := actualRemainingGB * 0.8

		// Calculate max context by solving: usableMemoryGB = estimateContextMemoryCorrect(maxContext, ...)
		// Since memory scales linearly with context size, we can use ratio
		maxPossibleTokens := int((usableMemoryGB / contextMemoryGB) * 8192)

		// Apply model limits and reasonable caps
		maxReasonableContext := min(maxPossibleTokens, metadata.ContextLength)

		// Apply intelligent caps - but don't artificially limit based on total memory
		// Instead, use calculated capacity with reasonable maximums
		if maxReasonableContext >= 65536 {
			// Can handle very large context
			params.ContextSize = 65536
		} else if maxReasonableContext >= 32768 {
			// Can handle large context
			params.ContextSize = 32768
		} else if maxReasonableContext >= 16384 {
			// Can handle medium context
			params.ContextSize = 16384
		} else if maxReasonableContext >= 8192 {
			// Can handle at least standard context
			params.ContextSize = min(16384, maxReasonableContext) // Allow up to 16K if possible
		} else {
			// Very constrained - use whatever is possible
			params.ContextSize = max(8192, maxReasonableContext)
		}

		// Verify the final context size fits in memory using correct calculation
		finalContextMemoryGB := estimateContextMemoryCorrect(params.ContextSize, modelSizeGB, metadata.NumLayers, params.NGPULayers, params.CacheTypeK, metadata.EmbeddingSize)
		fmt.Printf("    - 💡 MAX POSSIBLE: %dK tokens (%.1f GB usable)\n", maxPossibleTokens/1024, usableMemoryGB)
		fmt.Printf("    - ✅ CALCULATED CONTEXT: %dK (%.3f GB needed, %.1f GB available)\n",
			params.ContextSize/1024, finalContextMemoryGB, actualRemainingGB)
	}

	params.ContextSize = max(8192, params.ContextSize) // Ensure minimum 8K

	// Balanced settings - cap batch size at 512
	params.BatchSize = 512
	params.UBatchSize = 256
	params.Keep = min(2048, params.ContextSize/4)
	params.Parallel = min(6, o.specs.CPUCores*2/3)
	params.DefragThreshold = 0.1

	fmt.Printf("  ⚖️ BALANCED: Context=%dK, Batch=%d, Parallel=%d, Available=%.1fGB\n",
		params.ContextSize/1024, params.BatchSize, params.Parallel, actualRemainingGB)
}

func (o *Optimizer) optimizeSystemSafe(params *OptimizedParams, metadata *ModelMetadata, modelSizeGB float64, availableMemoryMB float64, isGPUMode bool) {
	gpuLayers, _, _ := o.calculateMemoryBudget(modelSizeGB, availableMemoryMB, isGPUMode, PresetSystemSafe, metadata)

	// GPU layers - be more conservative for system safe
	if gpuLayers == -1 {
		if o.backend == "vulkan" || metadata.TotalParams > 20_000_000_000 {
			// More conservative for Vulkan or large models - use exact layer count minus some
			params.NGPULayers = max(1, metadata.NumLayers-2)
		} else {
			// Still use 9999 but mention it's conservative
			params.NGPULayers = 9999
		}
		fmt.Printf("  🛡️ SYSTEM SAFE: GPU layers optimized for stability\n")
	} else {
		params.NGPULayers = max(0, gpuLayers-1) // Leave one layer on CPU for safety
	}

	// Context: Minimum 8K, but don't go crazy
	params.ContextSize = max(8192, min(16384, metadata.ContextLength))

	// Conservative KV cache settings
	if params.FlashAttn && o.backend == "cuda" {
		params.CacheTypeK = "q4_0"
		params.CacheTypeV = "q4_0"
	} else {
		params.CacheTypeK = "" // Use default f16 for safety
		params.CacheTypeV = ""
	}

	// Conservative settings - cap batch size at 512
	params.BatchSize = 256
	params.UBatchSize = 128
	params.Keep = min(2048, params.ContextSize/4)
	params.Parallel = min(4, o.specs.CPUCores/2)
	params.DefragThreshold = 0.2 // Less aggressive defrag
	params.MLock = false         // Don't lock memory for system safety

	fmt.Printf("  🛡️ SYSTEM SAFE: Context=%dK, Batch=%d, VRAM=%.1f%% (stable)\n",
		params.ContextSize/1024, params.BatchSize,
		(availableMemoryMB*0.95)/availableMemoryMB*100)

	// CRITICAL: Validate context memory safety
	o.validateContextMemory(params, metadata, modelSizeGB, availableMemoryMB)
}

func (o *Optimizer) optimizeUltra(params *OptimizedParams, metadata *ModelMetadata, modelSizeGB float64, availableMemoryMB float64, isGPUMode bool) {
	gpuLayers, _, usableBudgetFloat := o.calculateMemoryBudget(modelSizeGB, availableMemoryMB, isGPUMode, PresetUltra, metadata)

	// GPU layers - use 9999 if fits 80% rule (let llama.cpp decide)
	if gpuLayers == -1 {
		params.NGPULayers = 9999 // Let llama.cpp load all layers
		fmt.Printf("  🚀 ULTRA: All layers on GPU (fits 80%% rule, using 9999)\n")
	} else {
		params.NGPULayers = gpuLayers
	}

	// Context: Balanced approach for ultra performance
	params.CacheTypeK = "q8_0" // Good balance of speed and quality
	params.CacheTypeV = "q8_0"

	// Distribute remaining memory: 40% context, 60% for performance
	contextBudgetMB := usableBudgetFloat * 0.4
	maxContextFromBudget := int(contextBudgetMB / (estimateContextMemory(1024, metadata.EmbeddingSize, params.CacheTypeK) * 1024) * 1024)

	if modelSizeGB <= (availableMemoryMB/1024)*0.5 {
		// Model is small, can afford larger context
		params.ContextSize = min(65536, min(maxContextFromBudget, metadata.ContextLength))
	} else {
		// Model is larger, balance context with performance
		params.ContextSize = min(32768, min(maxContextFromBudget, metadata.ContextLength))
	}
	params.ContextSize = max(8192, params.ContextSize) // Ensure minimum 8K

	// Ultra performance settings - but cap batch size at 512 for stability
	params.BatchSize = 512 // Cap at 512 for stability
	params.UBatchSize = 256

	// Maximum parallelism
	params.Parallel = min(32, o.specs.CPUCores)
	params.Keep = min(8192, params.ContextSize/4)
	params.DefragThreshold = 0.05 // Aggressive defrag
	// Remove NUMA - not needed for most users
	params.NumaDistribute = false
	params.LogitsAll = false
	params.F16KV = false
	params.SplitMode = "layer"

	fmt.Printf("  🚀 ULTRA: Context=%dK, Batch=%d, Parallel=%d, VRAM=%.1f%% (MAXIMUM POWER!)\n",
		params.ContextSize/1024, params.BatchSize, params.Parallel,
		(availableMemoryMB*0.98)/availableMemoryMB*100)

	// CRITICAL: Validate context memory safety
	o.validateContextMemory(params, metadata, modelSizeGB, availableMemoryMB)
}

func (o *Optimizer) optimizeMoESpecific(params *OptimizedParams, metadata *ModelMetadata, modelSizeGB float64, availableMemoryMB float64, isGPUMode bool) {
	gpuLayers, _, _ := o.calculateMemoryBudget(modelSizeGB, availableMemoryMB, isGPUMode, PresetMoE, metadata)

	// GPU layers - use 9999 if fits 80% rule (let llama.cpp decide)
	if gpuLayers == -1 {
		params.NGPULayers = 9999 // Let llama.cpp load all layers
		fmt.Printf("  🧩 MoE: All layers on GPU with expert optimization (using 9999)\n")
	} else {
		params.NGPULayers = gpuLayers
	}

	// Context: Moderate for MoE complexity
	params.ContextSize = max(8192, min(32768, metadata.ContextLength))
	params.CacheTypeK = "q8_0"
	params.CacheTypeV = "q8_0"

	// MoE-specific settings - cap batch size at 512
	params.BatchSize = 512
	params.UBatchSize = 256 // Reasonable for expert routing
	params.Keep = 2048
	params.Parallel = min(4, max(2, metadata.NumActiveExperts)) // Based on active experts
	params.DefragThreshold = 0.1
	params.SplitMode = "row" // Better for MoE

	fmt.Printf("  🧩 MoE: Context=%dK, Batch=%d, Experts=%d, VRAM=%.1f%%\n",
		params.ContextSize/1024, params.BatchSize, metadata.NumExperts,
		(availableMemoryMB*0.97)/availableMemoryMB*100)

	// CRITICAL: Validate context memory safety
	o.validateContextMemory(params, metadata, modelSizeGB, availableMemoryMB)
}

func (o *Optimizer) optimizeMoE(params *OptimizedParams, metadata *ModelMetadata, availableMemoryMB float64) {
	if metadata.NumExperts > 0 {
		// For MoE models, use row split mode for better expert distribution
		params.SplitMode = "row"

		// IMPORTANT: DO NOT override params.NGPULayers here!
		// It was carefully calculated by calculateMaxGPULayers based on actual memory constraints
		// We should only use tensor overrides for fine-grained expert offloading

		// Calculate actual model size with quantization
		quantMultiplier := getQuantMultiplier(metadata.Quantization)
		actualModelSizeGB := float64(metadata.TotalParams) / 1_000_000_000 * quantMultiplier * 1.1

		// Calculate how much memory we actually have vs need
		memoryGB := availableMemoryMB / 1024

		// With KV cache quantization, we need much less reserved space
		kvReserveGB := 0.5
		if params.CacheTypeK == "q4_0" {
			kvReserveGB = 0.3 // q4_0 is the minimum safe quantization
		} else if params.CacheTypeK == "q8_0" {
			kvReserveGB = 0.4 // q8_0 needs slightly more space
		}

		usableMemoryForModel := memoryGB - kvReserveGB - 0.3 // 0.3GB overhead

		// Only use tensor overrides for expert offloading if we have calculated GPU layers but still need more memory
		// This is additional fine-tuning on top of layer-level offloading
		if actualModelSizeGB > usableMemoryForModel*2.0 { // Only for extremely tight memory situations
			// Calculate how much we need to offload via expert tensors
			excessGB := actualModelSizeGB - usableMemoryForModel
			percentToOffload := excessGB / actualModelSizeGB

			if percentToOffload > 0.4 { // Only if we need to offload more than 40% via experts
				// Use targeted expert offloading - only specific layers
				// This works in addition to the calculated NGPULayers limit
				lastLayers := int(float64(metadata.NumLayers) * (percentToOffload - 0.3)) // Conservative
				if lastLayers > 0 {
					for i := metadata.NumLayers - lastLayers; i < metadata.NumLayers; i++ {
						params.OverrideTensors = append(params.OverrideTensors,
							fmt.Sprintf(`blk\.%d\.ffn_.*_exps\.weight=CPU`, i))
					}
					fmt.Printf("  🧩 MoE EXPERT OFFLOAD: Offloading expert tensors from last %d layers to CPU\n", lastLayers)
				}
			}
		}

		// Optimize batching for MoE - smaller ubatch for expert routing
		if params.UBatchSize > 128 {
			params.UBatchSize = 128
		}

		// Limit parallel based on active experts
		if metadata.NumActiveExperts > 0 {
			params.Parallel = min(params.Parallel, metadata.NumActiveExperts)
		} else {
			params.Parallel = min(params.Parallel, 2)
		}

		// Use KV cache quantization for MoE to save memory
		// IMPORTANT: Must use matching K and V types for standard builds
		if params.CacheTypeK == "" {
			params.CacheTypeK = "q8_0"
			params.CacheTypeV = "q8_0" // Must match K type
		}

		fmt.Printf("  🧩 MoE OPTIMIZATION: Using %d GPU layers (calculated), Split=row, Parallel=%d\n",
			params.NGPULayers, params.Parallel)
	}
}

func (o *Optimizer) optimizeThreads(metadata *ModelMetadata, preset Preset) int {
	threads := o.specs.CPUCores

	switch preset {
	case PresetHighSpeed:
		threads = o.specs.CPUCores / 2 // Leave room for system
	case PresetSystemSafe:
		threads = min(4, o.specs.CPUCores/2)
	case PresetUltra:
		threads = o.specs.CPUCores - 1 // Use almost all
	case PresetMoE:
		threads = o.specs.CPUCores / 3 // Conservative for MoE
	default:
		threads = o.specs.CPUCores * 2 / 3
	}

	// Adjust for MoE models
	if metadata.IsMoE && metadata.NumActiveExperts > 0 {
		threads = max(threads, metadata.NumActiveExperts*2)
	}

	return threads
}

// Helper functions
func getQuantMultiplier(quantization string) float64 {
	quantMap := map[string]float64{
		"F32":     4.0,
		"F16":     2.0,
		"Q8_0":    1.0,
		"Q6_K":    0.75,
		"Q5_K_M":  0.625,
		"Q5_K_S":  0.625,
		"Q4_K_M":  0.5,
		"Q4_K_S":  0.5,
		"Q4_0":    0.5,
		"Q3_K_M":  0.375,
		"Q3_K_S":  0.375,
		"Q2_K":    0.25,
		"IQ4_XS":  0.45,
		"IQ3_XXS": 0.3125,
		"IQ2_XXS": 0.25,
		"IQ1_S":   0.125,
	}

	if mult, exists := quantMap[quantization]; exists {
		return mult
	}
	return 0.5 // Default
}

// Get actual model file size from filesystem, handling multi-part models
func getActualModelSize(modelPath string) float64 {
	if modelPath == "" {
		fmt.Printf("  ⚠️ WARNING: Empty model path\n")
		return 0.0
	}

	// Check if this is a multi-part model (contains pattern like 00001-of-00002)
	multiPartPattern := regexp.MustCompile(`-(\d+)-of-(\d+)\.gguf$`)
	matches := multiPartPattern.FindStringSubmatch(modelPath)

	if len(matches) > 0 {
		// This is a multi-part model
		currentPart := matches[1]
		totalParts := matches[2]
		fmt.Printf("  🧩 MULTI-PART MODEL DETECTED: Part %s of %s\n", currentPart, totalParts)

		// Get base path without the part number
		basePath := multiPartPattern.ReplaceAllString(modelPath, "")

		var totalSize float64
		partsFound := 0

		// Try to find all parts
		for i := 1; i <= 10; i++ { // Reasonable limit
			partPath := fmt.Sprintf("%s-%05d-of-%s.gguf", basePath, i, totalParts)

			if fileInfo, err := os.Stat(partPath); err == nil {
				partSizeGB := float64(fileInfo.Size()) / (1024 * 1024 * 1024)
				totalSize += partSizeGB
				partsFound++
				fmt.Printf("    - Part %d: %.2f GB (%s)\n", i, partSizeGB, filepath.Base(partPath))
			} else {
				// No more parts found
				break
			}
		}

		if partsFound > 0 {
			fmt.Printf("  📁 TOTAL SIZE (ALL %d PARTS): %.2f GB\n", partsFound, totalSize)
			return totalSize
		} else {
			fmt.Printf("  ⚠️ WARNING: Could not find any parts for multi-part model\n")
			return 0.0
		}
	} else {
		// Single file model
		fileInfo, err := os.Stat(modelPath)
		if err != nil {
			fmt.Printf("  ⚠️ WARNING: Cannot get file size for %s: %v\n", modelPath, err)
			return 0.0
		}

		sizeGB := float64(fileInfo.Size()) / (1024 * 1024 * 1024)
		fmt.Printf("  📁 ACTUAL FILE SIZE: %.2f GB (%s)\n", sizeGB, filepath.Base(modelPath))
		return sizeGB
	}
}

func estimateModelSize(metadata *ModelMetadata, quantMultiplier float64) float64 {
	fmt.Printf("  🧮 ESTIMATED SIZE CALCULATION:\n")

	if metadata.TotalParams > 0 {
		// Estimate based on parameters
		// Base calculation: params in billions × quantization multiplier
		baseSize := float64(metadata.TotalParams) / 1_000_000_000 * quantMultiplier
		fmt.Printf("    - Base size (%.1fB * %.2f): %.2f GB\n",
			float64(metadata.TotalParams)/1_000_000_000, quantMultiplier, baseSize)

		if metadata.IsMoE {
			// MoE models are larger due to expert layers
			baseSize *= 1.3
			fmt.Printf("    - MoE multiplier (1.3x): %.2f GB\n", baseSize)
		}

		// Add overhead for model structure
		finalSize := baseSize * 1.1
		fmt.Printf("    - With overhead (1.1x): %.2f GB\n", finalSize)
		return finalSize
	}

	// Fallback estimation
	if metadata.NumLayers > 0 && metadata.EmbeddingSize > 0 {
		layerSize := float64(metadata.EmbeddingSize*metadata.EmbeddingSize*4) / 1_000_000_000
		finalSize := float64(metadata.NumLayers) * layerSize * quantMultiplier
		fmt.Printf("    - Fallback calculation: %.2f GB\n", finalSize)
		return finalSize
	}

	fmt.Printf("    - Using default: 10.0 GB\n")
	return 10.0 // Default 10GB
}

func estimateContextMemory(contextSize int, embeddingSize int, kvCacheType string) float64 {
	// This function is now DEPRECATED - use estimateContextMemoryCorrect instead
	if embeddingSize == 0 {
		embeddingSize = 4096 // Default
	}

	// Base calculation: context * embedding * 2 (K+V) * precision bytes
	bytesPerElement := 2.0 // f16 default

	// Adjust for KV cache quantization - q4_0 is minimum safe level
	switch kvCacheType {
	case "q8_0":
		bytesPerElement = 1.0 // 8-bit
	case "q4_0", "q4_1":
		bytesPerElement = 0.5 // 4-bit (minimum safe quantization)
		// Note: q2_k and below removed - not safe for stable operation
	}

	return float64(contextSize*embeddingSize*2) * bytesPerElement / 1_000_000_000
}

// estimateContextMemoryCorrect uses the proper KV cache calculation formula
func estimateContextMemoryCorrect(contextSize int, modelSizeGB float64, numLayers int, gpuLayers int, kvCacheType string, embeddingSize int) float64 {
	if numLayers == 0 {
		numLayers = 32 // Default fallback
	}

	// Use the provided embedding size directly
	var hiddenSize int
	if embeddingSize > 0 {
		hiddenSize = embeddingSize
		fmt.Printf("    - Hidden size from metadata: %d\n", hiddenSize)
	} else {
		// Fallback to estimation only if embedding size is not available
		if modelSizeGB >= 25 {
			hiddenSize = 6656 // Large models default
		} else if modelSizeGB >= 12 {
			hiddenSize = 5120 // Medium-large models
		} else if modelSizeGB >= 6 {
			hiddenSize = 4096 // Medium models
		} else if modelSizeGB >= 2 {
			hiddenSize = 2560 // Small-medium models
		} else {
			hiddenSize = 2048 // Small models
		}
		fmt.Printf("    - Hidden size from heuristics: %d\n", hiddenSize)
	}

	// Bytes per element based on KV cache quantization
	var bytesPerElement float64 = 2.0 // f16 default
	switch kvCacheType {
	case "q8_0":
		bytesPerElement = 1.0 // 8-bit
	case "q4_0", "q4_1":
		bytesPerElement = 0.5 // 4-bit (minimum safe quantization)
	}

	// Calculate KV cache size per layer (in bytes)
	// Formula: context_size * hidden_size * 2 (K+V) * bytes_per_element
	kvCachePerLayer := float64(contextSize*hiddenSize*2) * bytesPerElement

	// Only GPU layers contribute to GPU memory usage
	gpuLayerRatio := float64(gpuLayers) / float64(numLayers)
	if gpuLayers == 9999 { // Special case for "all layers"
		gpuLayerRatio = 1.0
	}

	// Total KV cache memory in GB
	kvCacheGB := (kvCachePerLayer * float64(numLayers) * gpuLayerRatio) / (1024 * 1024 * 1024)

	fmt.Printf("  🧮 KV CACHE CALCULATION:\n")
	fmt.Printf("    - Context size: %d\n", contextSize)
	fmt.Printf("    - Hidden size: %d\n", hiddenSize)
	fmt.Printf("    - Total layers: %d\n", numLayers)
	fmt.Printf("    - GPU layers: %d (%.1f%% ratio)\n", gpuLayers, gpuLayerRatio*100)
	fmt.Printf("    - Bytes per element: %.1f (%s)\n", bytesPerElement, kvCacheType)
	fmt.Printf("    - Per-layer KV cache: %.3f MB\n", kvCachePerLayer/(1024*1024))
	fmt.Printf("    - Total KV cache: %.3f GB\n", kvCacheGB)

	return kvCacheGB
}

// Helper function to detect model architecture
func detectArchitecture(filename string) string {
	if strings.Contains(filename, "qwen") {
		return "Qwen"
	} else if strings.Contains(filename, "gemma") {
		return "Gemma"
	} else if strings.Contains(filename, "llama") {
		return "Llama"
	}
	return "Generic"
}

func calculateMaxGPULayers(modelSizeGB float64, availableVRAM float64, totalLayers int, isMoE bool, aggressiveContext bool) int {
	if totalLayers == 0 {
		totalLayers = 32 // Default
	}

	vramGB := availableVRAM / 1024
	if modelSizeGB <= 0 || vramGB <= 0 {
		return 0
	}

	// Calculate realistic KV cache reserve based on typical context sizes
	// Use a reasonable estimate for context memory requirements
	var kvCacheReserveGB float64
	if aggressiveContext {
		// For aggressive context modes, reserve more for larger contexts
		kvCacheReserveGB = 2.0 // Enough for ~8K context with q8_0 on medium models
	} else {
		// Conservative mode - reserve enough for basic context
		kvCacheReserveGB = 1.0 // Enough for ~4K context or 8K with q4_0
	}

	overheadGB := 0.3 // Minimal overhead for operations

	// MoE models need slightly more overhead for routing
	if isMoE {
		overheadGB = 0.5
		kvCacheReserveGB += 0.5 // MoE models typically need more context memory
	}

	usableVRAMForModel := vramGB - kvCacheReserveGB - overheadGB
	if usableVRAMForModel <= 0 {
		return 0 // Not enough VRAM
	}

	// Calculate how many layers fit in remaining VRAM
	layerRatio := usableVRAMForModel / modelSizeGB

	// For MoE models, we can fit more layers because not all experts are active
	if isMoE {
		layerRatio *= 1.2 // MoE models can fit more due to sparse activation
	}

	gpuLayers := int(float64(totalLayers) * layerRatio)

	// Try to maximize GPU usage - only reserve CPU layers if absolutely necessary
	if gpuLayers > totalLayers {
		gpuLayers = totalLayers
	} else if gpuLayers > totalLayers-2 && totalLayers > 20 {
		// Only keep 1-2 layers on CPU for very large models
		gpuLayers = totalLayers - 1
	}

	// Ensure at least some layers on GPU
	if gpuLayers < 1 && totalLayers > 0 {
		gpuLayers = 1
	}

	fmt.Printf("  🧮 GPU LAYER CALCULATION:\n")
	fmt.Printf("    - Total VRAM: %.1f GB\n", vramGB)
	fmt.Printf("    - Model size: %.1f GB\n", modelSizeGB)
	fmt.Printf("    - KV cache reserve: %.1f GB\n", kvCacheReserveGB)
	fmt.Printf("    - Overhead: %.1f GB\n", overheadGB)
	fmt.Printf("    - Usable for model: %.1f GB\n", usableVRAMForModel)
	fmt.Printf("    - Layer ratio: %.3f\n", layerRatio)
	fmt.Printf("    - Result: %d layers on GPU\n", gpuLayers)

	return gpuLayers
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// GenerateCommand creates the optimized llama-server command
func (o *Optimizer) GenerateCommand(modelName string, params *OptimizedParams) string {
	model := o.config.Models[modelName]
	modelPath := extractModelPath(model.Cmd)

	var cmd strings.Builder
	cmd.WriteString(fmt.Sprintf(`"%s"`, o.llamaPath))
	cmd.WriteString(fmt.Sprintf(` -m "%s"`, modelPath))

	// Extract port from original command
	port := "9999"
	if match := regexp.MustCompile(`--port\s+(\d+)`).FindStringSubmatch(model.Cmd); len(match) > 1 {
		port = match[1]
	}
	cmd.WriteString(fmt.Sprintf(" --port %s", port))

	// Core parameters
	cmd.WriteString(fmt.Sprintf(" --n-gpu-layers %d", params.NGPULayers))
	cmd.WriteString(fmt.Sprintf(" --threads %d", params.Threads))
	cmd.WriteString(fmt.Sprintf(" --ctx-size %d", params.ContextSize))
	cmd.WriteString(fmt.Sprintf(" --batch-size %d", params.BatchSize))
	cmd.WriteString(fmt.Sprintf(" --ubatch-size %d", params.UBatchSize))
	cmd.WriteString(fmt.Sprintf(" --keep %d", params.Keep))
	cmd.WriteString(fmt.Sprintf(" --defrag-thold %.2f", params.DefragThreshold))
	cmd.WriteString(fmt.Sprintf(" --parallel %d", params.Parallel))

	// KV cache quantization (critical for memory optimization)
	if params.CacheTypeK != "" && params.CacheTypeK != "f16" {
		cmd.WriteString(fmt.Sprintf(" --cache-type-k %s", params.CacheTypeK))
	}
	if params.CacheTypeV != "" && params.CacheTypeV != "f16" {
		cmd.WriteString(fmt.Sprintf(" --cache-type-v %s", params.CacheTypeV))
	}

	// Check for embedding model
	if strings.Contains(strings.ToLower(modelName), "embed") || strings.Contains(model.Cmd, "--embeddings") {
		cmd.WriteString(" --embeddings")
		if params.PoolingType != "" {
			cmd.WriteString(fmt.Sprintf(" --pooling %s", params.PoolingType))
		} else {
			cmd.WriteString(" --pooling mean")
		}
	}

	// Conditional flags
	if params.FlashAttn {
		cmd.WriteString(" --flash-attn")
	}
	if params.ContBatching {
		cmd.WriteString(" --cont-batching")
	}
	if params.MLock {
		cmd.WriteString(" --mlock")
	}
	if !params.UseMMAP {
		cmd.WriteString(" --no-mmap")
	}
	if params.NumaDistribute {
		cmd.WriteString(" --numa distribute")
	}
	if params.OffloadKQV {
		cmd.WriteString(" --no-kv-offload") // Note: this keeps KV on CPU
	}
	if params.NoKVOffload {
		cmd.WriteString(" --no-kv-offload")
	}
	if params.LogitsAll {
		cmd.WriteString(" --logits-all")
	}
	if params.F16KV {
		cmd.WriteString(" --memory-f16")
	}

	// Advanced parameters
	if params.SplitMode != "" {
		cmd.WriteString(fmt.Sprintf(" --split-mode %s", params.SplitMode))
	}
	if params.TensorSplit != "" {
		cmd.WriteString(fmt.Sprintf(" --tensor-split %s", params.TensorSplit))
	}
	if params.MainGPU > 0 {
		cmd.WriteString(fmt.Sprintf(" --main-gpu %d", params.MainGPU))
	}
	if params.RopeScaling > 0 && params.RopeScaling != 1.0 {
		cmd.WriteString(fmt.Sprintf(" --rope-scaling %.2f", params.RopeScaling))
	}
	if params.RopeFreqBase > 0 {
		cmd.WriteString(fmt.Sprintf(" --rope-freq-base %.0f", params.RopeFreqBase))
	}

	// MoE-specific: Expert tensor offloading
	for _, override := range params.OverrideTensors {
		cmd.WriteString(fmt.Sprintf(` --override-tensor "%s"`, override))
	}

	// Always include jinja for compatibility
	cmd.WriteString(" --jinja")

	return cmd.String()
}

// OptimizeAll optimizes all models in the config
func (o *Optimizer) OptimizeAll(preset Preset) (map[string]string, error) {
	optimized := make(map[string]string)

	fmt.Println("\n=== Starting Optimization Process ===")
	fmt.Printf("Preset: %s\n", preset)
	fmt.Printf("Models to optimize: %d\n\n", len(o.config.Models))

	for modelName := range o.config.Models {
		params, err := o.Optimize(modelName, preset)
		if err != nil {
			log.Printf("Warning: Failed to optimize %s: %v", modelName, err)
			continue
		}

		optimized[modelName] = o.GenerateCommand(modelName, params)
	}

	return optimized, nil
}

// ExportConfig exports the optimized configuration
func (o *Optimizer) ExportConfig(optimized map[string]string, outputPath string) error {
	// Create new config with optimized commands
	newConfig := *o.config
	for modelName, cmd := range optimized {
		if model, exists := newConfig.Models[modelName]; exists {
			// Just use the command directly, YAML marshaller will handle formatting
			model.Cmd = cmd
			newConfig.Models[modelName] = model
		}
	}

	// Marshal to YAML
	data, err := yaml.Marshal(&newConfig)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// Write to file
	if err := os.WriteFile(outputPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	return nil
}

// validateContextMemory ensures the allocated context size is safe given available memory
func (o *Optimizer) validateContextMemory(params *OptimizedParams, metadata *ModelMetadata, modelSizeGB float64, availableMemoryMB float64) {
	availableVRAMGB := availableMemoryMB / 1024
	actualRemainingGB := availableVRAMGB - modelSizeGB - 0.5 // 0.5GB overhead

	// Calculate memory needed for the proposed context
	contextMemoryGB := estimateContextMemoryCorrect(params.ContextSize, modelSizeGB, metadata.NumLayers, params.NGPULayers, params.CacheTypeK, metadata.EmbeddingSize)

	fmt.Printf("  🔍 CONTEXT MEMORY VALIDATION:\n")
	fmt.Printf("    - Proposed context: %dK\n", params.ContextSize/1024)
	fmt.Printf("    - Context memory needed: %.3f GB\n", contextMemoryGB)
	fmt.Printf("    - Available for context: %.1f GB\n", actualRemainingGB)

	// If we don't have enough memory, force safe context sizes
	if actualRemainingGB <= 0 || contextMemoryGB > actualRemainingGB {
		fmt.Printf("    - ❌ INSUFFICIENT MEMORY: Forcing safe context size\n")

		// Try progressively smaller context sizes until we find one that fits
		safeSizes := []int{8192, 4096, 2048, 1024}
		for _, safeSize := range safeSizes {
			testMemoryGB := estimateContextMemoryCorrect(safeSize, modelSizeGB, metadata.NumLayers, params.NGPULayers, params.CacheTypeK, metadata.EmbeddingSize)
			if actualRemainingGB > 0 && testMemoryGB <= actualRemainingGB*0.8 { // Use 80% of available as safety margin
				params.ContextSize = safeSize
				fmt.Printf("    - ✅ SAFE CONTEXT: %dK (%.3f GB needed, %.1f GB available)\n", safeSize/1024, testMemoryGB, actualRemainingGB)
				return
			}
		}

		// Emergency fallback - absolute minimum
		params.ContextSize = 1024
		fmt.Printf("    - 🚨 EMERGENCY FALLBACK: 1K context (insufficient memory for larger)\n")
	} else {
		fmt.Printf("    - ✅ CONTEXT MEMORY OK: %.3f GB needed, %.1f GB available\n", contextMemoryGB, actualRemainingGB)
	}
}

// getTotalModelSizeFromDisk calculates the total model size by finding all parts on disk (Python-style)
func getTotalModelSizeFromDisk(ggufFilePath string) (int64, error) {
	// Check for multi-part pattern: -00001-of-00002.gguf
	re := regexp.MustCompile(`-(\d{5})-of-(\d{5})\.gguf$`)
	match := re.FindStringSubmatch(ggufFilePath)

	if match == nil {
		// Single file
		info, err := os.Stat(ggufFilePath)
		if err != nil {
			return 0, err
		}
		return info.Size(), nil
	}

	// Multi-part file
	basePath := ggufFilePath[:strings.LastIndex(ggufFilePath, match[0])]
	totalPartsStr := match[2]
	totalParts, _ := strconv.Atoi(totalPartsStr)

	var totalSize int64
	foundParts := 0

	for i := 1; i <= totalParts; i++ {
		partFileName := fmt.Sprintf("%s-%05d-of-%s.gguf", basePath, i, totalPartsStr)
		if info, err := os.Stat(partFileName); err == nil {
			totalSize += info.Size()
			foundParts++
		}
	}

	if foundParts != totalParts {
		fmt.Printf("WARNING: Expected %d parts, found %d. Size calculation may be incomplete.\n", totalParts, foundParts)
	}

	return totalSize, nil
}

// formatMem formats memory size in human readable format (Python-style)
func formatMem(sizeBytes int64) string {
	mib := float64(sizeBytes) / (1024 * 1024)
	if mib < 1024 {
		return fmt.Sprintf("%8.2f MiB", mib)
	}
	return fmt.Sprintf("%8.2f GiB", mib/1024)
}

// formatNumber formats numbers with commas (Python-style)
func formatNumber(n int) string {
	str := strconv.Itoa(n)
	if len(str) <= 3 {
		return str
	}

	// Add commas
	result := ""
	for i, digit := range str {
		if i > 0 && (len(str)-i)%3 == 0 {
			result += ","
		}
		result += string(digit)
	}
	return result
}

// runGPUEstimator runs Python-style memory estimation and prints results
func (o *Optimizer) runGPUEstimator(modelPath string, metadata *ModelMetadata, overheadGiB float64) error {
	prefix := metadata.Architecture
	if prefix == "" {
		return fmt.Errorf("could not read 'general.architecture' from model metadata")
	}

	modelSizeBytes, err := getTotalModelSizeFromDisk(modelPath)
	if err != nil {
		return fmt.Errorf("failed to get model size: %v", err)
	}

	overheadBytes := int64(overheadGiB * 1024 * 1024 * 1024)

	// Extract required metadata
	nLayers := metadata.NumLayers
	nHeadKV := metadata.NumKVHeads
	trainingContext := metadata.ContextLength
	nEmbdHeadK := metadata.KeyLength
	nEmbdHeadV := metadata.ValueLength
	swaWindowSize := metadata.SlidingWindowSize

	modelName := metadata.Name
	isScoutModel := strings.Contains(strings.ToLower(modelName), "scout")

	var nLayersSwa, nLayersFull int
	if isScoutModel && swaWindowSize == 0 {
		nLayersSwa, nLayersFull, swaWindowSize = 36, 12, 8192
	} else if swaWindowSize > 0 {
		nLayersSwa, nLayersFull = nLayers, 0
	} else {
		nLayersSwa, nLayersFull = 0, nLayers
	}

	// Print model information
	fmt.Printf("\n--- Model '%s' ---\n", modelName)
	if trainingContext > 0 {
		fmt.Printf("Max Context: %s tokens\n", formatNumber(trainingContext))
	}
	fmt.Printf("Model Size: %s (from file size)\n", strings.TrimSpace(formatMem(modelSizeBytes)))
	fmt.Printf("Incl. Overhead: %.2f GiB (for compute buffer, etc.)\n", overheadGiB)

	// Default context sizes for estimation
	contextSizes := []int{4096, 8192, 16384, 32768, 65536, 131072}

	// Filter context sizes based on training context
	if trainingContext > 0 {
		filteredSizes := make([]int, 0)
		sizeSet := make(map[int]bool)

		// Add sizes that are <= training context
		for _, size := range contextSizes {
			if size <= trainingContext {
				filteredSizes = append(filteredSizes, size)
				sizeSet[size] = true
			}
		}

		// Add training context if not already included
		if !sizeSet[trainingContext] {
			filteredSizes = append(filteredSizes, trainingContext)
		}

		contextSizes = filteredSizes
	}

	if nEmbdHeadK == 0 || nEmbdHeadV == 0 || nHeadKV == 0 {
		fmt.Printf("WARNING: Missing key/value head information. Using fallback calculations.\n")
		// Use embedding size as fallback
		if metadata.EmbeddingSize > 0 {
			nEmbdHeadK = metadata.EmbeddingSize / max(nHeadKV, 1)
			nEmbdHeadV = nEmbdHeadK
		} else {
			nEmbdHeadK = 128 // Default fallback
			nEmbdHeadV = 128
		}
	}

	bytesPerTokenPerLayer := int64(nHeadKV * (nEmbdHeadK + nEmbdHeadV) * 2)

	// Print memory estimation table
	fmt.Println("\n--- Memory Footprint Estimation ---")
	fmt.Printf("%15s | %15s | %15s\n", "Context Size", "Context Memory", "Est. Total VRAM")
	fmt.Println(strings.Repeat("-", 51))

	for _, nCtx := range contextSizes {
		memFull := int64(nCtx*nLayersFull) * bytesPerTokenPerLayer
		memSwa := int64(min(nCtx, swaWindowSize)*nLayersSwa) * bytesPerTokenPerLayer
		kvCacheBytes := memFull + memSwa
		totalBytes := modelSizeBytes + kvCacheBytes + overheadBytes

		fmt.Printf("%15s | %15s | %15s\n",
			formatNumber(nCtx),
			strings.TrimSpace(formatMem(kvCacheBytes)),
			strings.TrimSpace(formatMem(totalBytes)))
	}

	return nil
}

func main() {
	var (
		configPath = flag.String("config", "llama-swap.yaml", "Path to YAML config file")
		preset     = flag.String("preset", "balanced", "Optimization preset: high_speed, more_context, balanced, system_safe, ultra_performance, moe_optimized")
		output     = flag.String("output", "", "Output path for optimized config (default: overwrites input file)")
		modelName  = flag.String("model", "", "Optimize specific model only")
		showSpecs  = flag.Bool("specs", false, "Show detected system specifications")
		verbose    = flag.Bool("verbose", false, "Show detailed optimization process")
		backup     = flag.Bool("backup", true, "Create backup of original config before overwriting")
	)
	flag.Parse()

	// Create optimizer
	fmt.Println("Creating optimizer...")
	optimizer, err := NewOptimizer(*configPath)
	if err != nil {
		log.Fatalf("Failed to create optimizer: %v", err)
	}

	fmt.Printf("Found llama-server at: %s\n", optimizer.llamaPath)
	fmt.Printf("Detected backend: %s\n", strings.ToUpper(optimizer.backend))

	// Show system specs if requested or in verbose mode
	if *showSpecs || *verbose {
		fmt.Println("\n=== System Specifications ===")
		fmt.Printf("OS: %s\n", optimizer.specs.OS)
		fmt.Printf("Backend: %s\n", strings.ToUpper(optimizer.backend))
		fmt.Printf("CPU Cores: %d\n", optimizer.specs.CPUCores)
		fmt.Printf("System Memory: %d MB (%.1f GB)\n", optimizer.specs.SystemMemoryMB, float64(optimizer.specs.SystemMemoryMB)/1024)
		fmt.Printf("GPU: %s\n", optimizer.specs.GPUName)
		fmt.Printf("GPU Memory: %d MB (%.1f GB)\n", optimizer.specs.GPUMemoryMB, float64(optimizer.specs.GPUMemoryMB)/1024)
		fmt.Printf("GPU Compute: %.1f\n", optimizer.specs.GPUCompute)
		fmt.Printf("CUDA: %v\n", optimizer.specs.HasCUDA)
		fmt.Printf("ROCm: %v\n", optimizer.specs.HasROCm)
		fmt.Printf("Metal: %v\n", optimizer.specs.HasMetal)
		fmt.Println()
	}

	// Parse preset
	presetEnum := Preset(*preset)

	// Handle preset aliases and validation
	switch *preset {
	case "performance":
		presetEnum = PresetUltra
		fmt.Printf("  📝 Using 'ultra_performance' for 'performance' preset\n")
	case "speed":
		presetEnum = PresetHighSpeed
		fmt.Printf("  📝 Using 'high_speed' for 'speed' preset\n")
	case "context":
		presetEnum = PresetMoreContext
		fmt.Printf("  📝 Using 'more_context' for 'context' preset\n")
	case "safe":
		presetEnum = PresetSystemSafe
		fmt.Printf("  📝 Using 'system_safe' for 'safe' preset\n")
	case "moe":
		presetEnum = PresetMoE
		fmt.Printf("  📝 Using 'moe_optimized' for 'moe' preset\n")
	default:
		// Validate preset
		validPresets := []string{"high_speed", "more_context", "balanced", "system_safe", "ultra_performance", "moe_optimized"}
		isValid := false
		for _, valid := range validPresets {
			if *preset == valid {
				isValid = true
				break
			}
		}
		if !isValid {
			fmt.Printf("⚠️  Invalid preset '%s'. Using 'balanced' instead.\n", *preset)
			fmt.Printf("Valid presets: %s\n", strings.Join(validPresets, ", "))
			presetEnum = PresetBalanced
		}
	}

	// Optimize
	if *modelName != "" {
		// Single model optimization
		params, err := optimizer.Optimize(*modelName, presetEnum)
		if err != nil {
			log.Fatalf("Failed to optimize %s: %v", *modelName, err)
		}

		cmd := optimizer.GenerateCommand(*modelName, params)
		fmt.Printf("\n=== Optimized Command for %s ===\n", *modelName)
		fmt.Println(cmd)

		// Show KV cache settings
		if params.CacheTypeK != "" || params.CacheTypeV != "" {
			fmt.Println("\n=== KV Cache Optimization ===")
			fmt.Printf("K Cache: %s\n", params.CacheTypeK)
			fmt.Printf("V Cache: %s\n", params.CacheTypeV)
		}
	} else {
		// Optimize all models
		optimized, err := optimizer.OptimizeAll(presetEnum)
		if err != nil {
			log.Fatalf("Failed to optimize models: %v", err)
		}

		// Determine output path
		outputPath := *output
		if outputPath == "" {
			// Default: overwrite the input file
			outputPath = *configPath

			// Create backup if requested
			if *backup {
				backupPath := fmt.Sprintf("%s.backup_%s", *configPath, time.Now().Format("20060102_150405"))

				// Read original file
				originalData, err := os.ReadFile(*configPath)
				if err != nil {
					log.Printf("Warning: Could not create backup: %v", err)
				} else {
					// Write backup
					if err := os.WriteFile(backupPath, originalData, 0644); err != nil {
						log.Printf("Warning: Could not write backup to %s: %v", backupPath, err)
					} else {
						fmt.Printf("📁 Backup created: %s\n", backupPath)
					}
				}
			}
		}

		// Export config
		if err := optimizer.ExportConfig(optimized, outputPath); err != nil {
			log.Fatalf("Failed to export config: %v", err)
		}

		if outputPath == *configPath {
			fmt.Printf("\n✅ Configuration optimized and updated in place: %s\n", outputPath)
		} else {
			fmt.Printf("\n✅ Optimized configuration saved to: %s\n", outputPath)
		}
		fmt.Printf("📊 Preset: %s\n", *preset)
		fmt.Printf("🚀 Models optimized: %d\n", len(optimized))

		// Show summary
		fmt.Println("\n=== Optimization Summary ===")
		for modelName, cmd := range optimized {
			fmt.Printf("\n📦 %s:\n", modelName)

			// Extract key params from command
			if match := regexp.MustCompile(`--n-gpu-layers\s+(\d+)`).FindStringSubmatch(cmd); len(match) > 1 {
				fmt.Printf("  GPU Layers: %s\n", match[1])
			}
			if match := regexp.MustCompile(`--ctx-size\s+(\d+)`).FindStringSubmatch(cmd); len(match) > 1 {
				fmt.Printf("  Context: %s\n", match[1])
			}
			if match := regexp.MustCompile(`--batch-size\s+(\d+)`).FindStringSubmatch(cmd); len(match) > 1 {
				fmt.Printf("  Batch: %s\n", match[1])
			}
			if match := regexp.MustCompile(`--threads\s+(\d+)`).FindStringSubmatch(cmd); len(match) > 1 {
				fmt.Printf("  Threads: %s\n", match[1])
			}
			if match := regexp.MustCompile(`--cache-type-k\s+(\w+)`).FindStringSubmatch(cmd); len(match) > 1 {
				fmt.Printf("  KV Cache K: %s\n", match[1])
			}
			if match := regexp.MustCompile(`--cache-type-v\s+(\w+)`).FindStringSubmatch(cmd); len(match) > 1 {
				fmt.Printf("  KV Cache V: %s\n", match[1])
			}
		}

		// Add note about backup
		if outputPath == *configPath && *backup {
			fmt.Println("\n💡 Tip: Original config backed up with timestamp. Use -backup=false to skip backup creation.")
		}

		// Add note about MoE optimization
		fmt.Println("\n🎯 MoE Optimization Note:")
		fmt.Println("For MoE models, try the 'moe_optimized' preset for best results.")
		fmt.Println("KV cache quantization is automatically applied to save memory.")
	}
}
