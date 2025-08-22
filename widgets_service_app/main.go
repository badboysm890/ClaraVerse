package main

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/ledongthuc/pdf"
	"github.com/rs/cors"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

// SystemStats represents overall system statistics
type SystemStats struct {
	CPU       CPUStats       `json:"cpu"`
	Memory    MemoryStats    `json:"memory"`
	Disk      []DiskStats    `json:"disk"`
	Network   NetworkStats   `json:"network"`
	GPU       []GPUStats     `json:"gpu"`
	Processes []ProcessStats `json:"processes"`
	Uptime    int64          `json:"uptime"`
	Timestamp time.Time      `json:"timestamp"`
}

// CPUStats represents CPU statistics
type CPUStats struct {
	Usage     float64 `json:"usage"`
	Cores     int     `json:"cores"`
	Frequency float64 `json:"frequency"`
	Temp      float64 `json:"temperature"`
}

// MemoryStats represents memory statistics
type MemoryStats struct {
	Total       uint64  `json:"total"`
	Available   uint64  `json:"available"`
	Used        uint64  `json:"used"`
	UsedPercent float64 `json:"usedPercent"`
	Swap        struct {
		Total       uint64  `json:"total"`
		Used        uint64  `json:"used"`
		UsedPercent float64 `json:"usedPercent"`
	} `json:"swap"`
}

// DiskStats represents disk statistics
type DiskStats struct {
	Device      string  `json:"device"`
	Mountpoint  string  `json:"mountpoint"`
	Fstype      string  `json:"fstype"`
	Total       uint64  `json:"total"`
	Free        uint64  `json:"free"`
	Used        uint64  `json:"used"`
	UsedPercent float64 `json:"usedPercent"`
}

// NetworkStats represents network statistics
type NetworkStats struct {
	BytesSent   uint64 `json:"bytesSent"`
	BytesRecv   uint64 `json:"bytesRecv"`
	PacketsSent uint64 `json:"packetsSent"`
	PacketsRecv uint64 `json:"packetsRecv"`
}

// GPUStats represents GPU statistics
type GPUStats struct {
	Name          string  `json:"name"`
	Usage         float64 `json:"usage"`
	MemoryTotal   uint64  `json:"memoryTotal"`
	MemoryUsed    uint64  `json:"memoryUsed"`
	MemoryFree    uint64  `json:"memoryFree"`
	MemoryPercent float64 `json:"memoryPercent"`
	Temperature   float64 `json:"temperature"`
	FanSpeed      int     `json:"fanSpeed"`
	PowerDraw     float64 `json:"powerDraw"`
	ClockCore     int     `json:"clockCore"`
	ClockMemory   int     `json:"clockMemory"`
}

// ProcessStats represents process statistics
type ProcessStats struct {
	PID    int32   `json:"pid"`
	Name   string  `json:"name"`
	CPU    float64 `json:"cpu"`
	Memory float64 `json:"memory"`
	Status string  `json:"status"`
}

// FileParseResult represents the result of file parsing
type FileParseResult struct {
	Filename    string            `json:"filename"`
	FileType    string            `json:"fileType"`
	Text        string            `json:"text"`
	Pages       int               `json:"pages,omitempty"`
	WordCount   int               `json:"wordCount"`
	Metadata    map[string]string `json:"metadata,omitempty"`
	Success     bool              `json:"success"`
	Error       string            `json:"error,omitempty"`
	ProcessTime string            `json:"processTime"`
}

// FileProcessor handles different file types
type FileProcessor struct{}

// NewFileProcessor creates a new file processor
func NewFileProcessor() *FileProcessor {
	return &FileProcessor{}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// Global variables to track active connections
var activeConnections = make(map[*websocket.Conn]bool)
var statsInterval = 2 * time.Second
var fileProcessor = NewFileProcessor()
var enhancedPDFProcessor = NewEnhancedPDFProcessor()

func main() {
	port := "8765"
	if len(os.Args) > 1 {
		port = os.Args[1]
	}

	router := mux.NewRouter()

	// REST API endpoints
	router.HandleFunc("/api/stats", getSystemStats).Methods("GET")
	router.HandleFunc("/api/stats/cpu", getCPUStats).Methods("GET")
	router.HandleFunc("/api/stats/memory", getMemoryStats).Methods("GET")
	router.HandleFunc("/api/stats/gpu", getGPUStats).Methods("GET")
	router.HandleFunc("/api/stats/disk", getDiskStats).Methods("GET")
	router.HandleFunc("/api/stats/network", getNetworkStats).Methods("GET")
	router.HandleFunc("/api/stats/processes", getProcessStats).Methods("GET")
	router.HandleFunc("/api/health", healthCheck).Methods("GET")

	// File processing endpoints
	router.HandleFunc("/api/file/upload", handleFileUpload).Methods("POST")
	router.HandleFunc("/api/file/supported-formats", getSupportedFormats).Methods("GET")

	// Serve static files for testing
	router.PathPrefix("/test/").Handler(http.StripPrefix("/test/", http.FileServer(http.Dir("."))))

	// WebSocket endpoint for real-time updates
	router.HandleFunc("/ws/stats", handleWebSocket)

	// CORS middleware
	c := cors.New(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"*"},
	})

	handler := c.Handler(router)

	fmt.Printf("Widget Service starting on port %s\n", port)
	fmt.Printf("Health check: http://localhost:%s/api/health\n", port)
	fmt.Printf("System stats: http://localhost:%s/api/stats\n", port)
	fmt.Printf("File upload: http://localhost:%s/api/file/upload\n", port)
	fmt.Printf("Supported formats: http://localhost:%s/api/file/supported-formats\n", port)
	fmt.Printf("Test page: http://localhost:%s/test/file_upload_test.html\n", port)
	fmt.Printf("WebSocket: ws://localhost:%s/ws/stats\n", port)

	log.Fatal(http.ListenAndServe(":"+port, handler))
}

func healthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":            "healthy",
		"service":           "widgets-service",
		"timestamp":         time.Now(),
		"activeConnections": len(activeConnections),
	})
}

func getSystemStats(w http.ResponseWriter, r *http.Request) {
	stats := collectSystemStats()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func getCPUStats(w http.ResponseWriter, r *http.Request) {
	cpuStats := collectCPUStats()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cpuStats)
}

func getMemoryStats(w http.ResponseWriter, r *http.Request) {
	memStats := collectMemoryStats()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(memStats)
}

func getGPUStats(w http.ResponseWriter, r *http.Request) {
	gpuStats := collectGPUStats()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gpuStats)
}

func getDiskStats(w http.ResponseWriter, r *http.Request) {
	diskStats := collectDiskStats()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(diskStats)
}

func getNetworkStats(w http.ResponseWriter, r *http.Request) {
	netStats := collectNetworkStats()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(netStats)
}

func getProcessStats(w http.ResponseWriter, r *http.Request) {
	procStats := collectProcessStats()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(procStats)
}

func handleFileUpload(w http.ResponseWriter, r *http.Request) {
	// Set max upload size (10MB)
	r.ParseMultipartForm(10 << 20)

	// Get file from form
	file, handler, err := r.FormFile("file")
	if err != nil {
		http.Error(w, fmt.Sprintf("Error retrieving file: %v", err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Read file data
	fileData, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error reading file: %v", err), http.StatusInternalServerError)
		return
	}

	// Validate file size (10MB limit)
	if len(fileData) > 10<<20 {
		http.Error(w, "File too large. Maximum size is 10MB", http.StatusRequestEntityTooLarge)
		return
	}

	// Check if it's a PDF file and use enhanced processor
	if strings.ToLower(filepath.Ext(handler.Filename)) == ".pdf" {
		// Use enhanced PDF processor
		enhancedResult, err := enhancedPDFProcessor.ProcessPDF(handler, fileData)
		if err != nil {
			log.Printf("Error processing PDF %s: %v", handler.Filename, err)
		}
		
		// Convert enhanced result to standard result format
		result := &FileParseResult{
			Filename:    enhancedResult.Filename,
			FileType:    enhancedResult.FileType,
			Text:        enhancedResult.Text,
			Pages:       enhancedResult.Pages,
			WordCount:   enhancedResult.WordCount,
			Success:     enhancedResult.Success,
			Error:       enhancedResult.Error,
			ProcessTime: enhancedResult.ProcessTime,
			Metadata:    make(map[string]string),
		}
		
		// Add enhanced metadata
		result.Metadata["title"] = enhancedResult.Metadata.Title
		result.Metadata["author"] = enhancedResult.Metadata.Author
		result.Metadata["subject"] = enhancedResult.Metadata.Subject
		result.Metadata["creator"] = enhancedResult.Metadata.Creator
		result.Metadata["producer"] = enhancedResult.Metadata.Producer
		result.Metadata["keywords"] = enhancedResult.Metadata.Keywords
		result.Metadata["pdfVersion"] = enhancedResult.Metadata.PDFVersion
		result.Metadata["fileSize"] = fmt.Sprintf("%d", enhancedResult.Metadata.FileSize)
		result.Metadata["overallQualityScore"] = fmt.Sprintf("%.2f", enhancedResult.Quality.OverallScore)
		result.Metadata["textQuality"] = fmt.Sprintf("%.2f", enhancedResult.Quality.TextQuality)
		result.Metadata["structureQuality"] = fmt.Sprintf("%.2f", enhancedResult.Quality.StructureQuality)
		result.Metadata["tablesDetected"] = fmt.Sprintf("%d", len(enhancedResult.Tables))
		result.Metadata["securityEncrypted"] = fmt.Sprintf("%t", enhancedResult.Security.IsEncrypted)
		result.Metadata["hasBookmarks"] = fmt.Sprintf("%t", enhancedResult.Structure.HasBookmarks)
		result.Metadata["isTaggedPDF"] = fmt.Sprintf("%t", enhancedResult.Structure.IsTaggedPDF)
		
		// Add custom metadata
		for key, value := range enhancedResult.Metadata.Custom {
			result.Metadata["custom_"+key] = value
		}
		
		// Add quality recommendations
		if len(enhancedResult.Quality.Recommendations) > 0 {
			result.Metadata["recommendations"] = strings.Join(enhancedResult.Quality.Recommendations, "; ")
		}
		
		// Log the enhanced upload
		log.Printf("Enhanced PDF processed: %s (%s) - Success: %v, Quality: %.2f, Tables: %d",
			result.Filename, result.FileType, result.Success, enhancedResult.Quality.OverallScore, len(enhancedResult.Tables))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
		return
	}

	// Process the file using standard processor for non-PDF files
	result, err := fileProcessor.ProcessFile(handler, fileData)
	if err != nil {
		log.Printf("Error processing file %s: %v", handler.Filename, err)
		// Still return the result with error information
	}

	// Log the upload
	log.Printf("File uploaded and processed: %s (%s) - Success: %v",
		result.Filename, result.FileType, result.Success)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func getSupportedFormats(w http.ResponseWriter, r *http.Request) {
	formats := fileProcessor.GetSupportedFormats()

	response := map[string]interface{}{
		"supportedFormats":  formats,
		"description":       "Supported file formats for text extraction",
		"maxFileSize":       "10MB",
		"basicSupport":      []string{"txt", "md", "csv", "json", "xml", "log", "html", "htm", "rtf"},
		"requiresLibraries": []string{"pdf", "docx"},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	// Add connection to active connections
	activeConnections[conn] = true
	defer delete(activeConnections, conn)

	log.Printf("WebSocket connection established. Active connections: %d", len(activeConnections))

	// Send initial stats
	stats := collectSystemStats()
	if err := conn.WriteJSON(stats); err != nil {
		log.Printf("Error sending initial stats: %v", err)
		return
	}

	// Start sending periodic updates
	ticker := time.NewTicker(statsInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			stats := collectSystemStats()
			if err := conn.WriteJSON(stats); err != nil {
				log.Printf("Error sending stats update: %v", err)
				return
			}
		}
	}
}

func collectSystemStats() SystemStats {
	hostInfo, _ := host.Info()

	return SystemStats{
		CPU:       collectCPUStats(),
		Memory:    collectMemoryStats(),
		Disk:      collectDiskStats(),
		Network:   collectNetworkStats(),
		GPU:       collectGPUStats(),
		Processes: collectProcessStats(),
		Uptime:    int64(hostInfo.Uptime),
		Timestamp: time.Now(),
	}
}

func collectCPUStats() CPUStats {
	// Get CPU usage percentage
	usage, _ := cpu.Percent(time.Second, false)
	cpuUsage := 0.0
	if len(usage) > 0 {
		cpuUsage = usage[0]
	}

	// Get CPU info
	cpuInfo, _ := cpu.Info()
	cores := runtime.NumCPU()
	frequency := 0.0
	if len(cpuInfo) > 0 {
		frequency = cpuInfo[0].Mhz
	}

	return CPUStats{
		Usage:     cpuUsage,
		Cores:     cores,
		Frequency: frequency,
		Temp:      getCPUTemperature(),
	}
}

func collectMemoryStats() MemoryStats {
	vmem, _ := mem.VirtualMemory()
	swap, _ := mem.SwapMemory()

	memStats := MemoryStats{
		Total:       vmem.Total,
		Available:   vmem.Available,
		Used:        vmem.Used,
		UsedPercent: vmem.UsedPercent,
	}

	memStats.Swap.Total = swap.Total
	memStats.Swap.Used = swap.Used
	memStats.Swap.UsedPercent = swap.UsedPercent

	return memStats
}

func collectDiskStats() []DiskStats {
	var diskStats []DiskStats

	partitions, _ := disk.Partitions(false)
	for _, partition := range partitions {
		usage, err := disk.Usage(partition.Mountpoint)
		if err != nil {
			continue
		}

		diskStats = append(diskStats, DiskStats{
			Device:      partition.Device,
			Mountpoint:  partition.Mountpoint,
			Fstype:      partition.Fstype,
			Total:       usage.Total,
			Free:        usage.Free,
			Used:        usage.Used,
			UsedPercent: usage.UsedPercent,
		})
	}

	return diskStats
}

func collectNetworkStats() NetworkStats {
	netIO, _ := net.IOCounters(false)

	if len(netIO) > 0 {
		return NetworkStats{
			BytesSent:   netIO[0].BytesSent,
			BytesRecv:   netIO[0].BytesRecv,
			PacketsSent: netIO[0].PacketsSent,
			PacketsRecv: netIO[0].PacketsRecv,
		}
	}

	return NetworkStats{}
}

func collectGPUStats() []GPUStats {
	var gpuStats []GPUStats

	// Try NVIDIA first
	nvidiaGPUs := getNvidiaGPUStats()
	gpuStats = append(gpuStats, nvidiaGPUs...)

	// Try AMD
	amdGPUs := getAMDGPUStats()
	gpuStats = append(gpuStats, amdGPUs...)

	// If no dedicated GPUs found, try to get integrated GPU info
	if len(gpuStats) == 0 {
		integratedGPU := getIntegratedGPUStats()
		if integratedGPU.Name != "" {
			gpuStats = append(gpuStats, integratedGPU)
		}
	}

	return gpuStats
}

func collectProcessStats() []ProcessStats {
	var procStats []ProcessStats

	procs, _ := process.Processes()
	for _, proc := range procs {
		name, err := proc.Name()
		if err != nil {
			continue
		}

		// Filter for relevant processes (AI/ML related)
		if !isRelevantProcess(name) {
			continue
		}

		cpuPercent, _ := proc.CPUPercent()
		memInfo, _ := proc.MemoryInfo()
		status, _ := proc.Status()

		memPercent := 0.0
		if memInfo != nil {
			vmem, _ := mem.VirtualMemory()
			if vmem.Total > 0 {
				memPercent = float64(memInfo.RSS) / float64(vmem.Total) * 100
			}
		}

		procStats = append(procStats, ProcessStats{
			PID:    proc.Pid,
			Name:   name,
			CPU:    cpuPercent,
			Memory: memPercent,
			Status: status[0],
		})
	}

	return procStats
}

func isRelevantProcess(name string) bool {
	relevantProcesses := []string{
		"python", "python3", "ollama", "comfyui", "pytorch", "tensorflow",
		"node", "electron", "angela", "nvidia-smi", "nvtop", "htop",
	}

	nameLower := strings.ToLower(name)
	for _, relevant := range relevantProcesses {
		if strings.Contains(nameLower, relevant) {
			return true
		}
	}
	return false
}

func getNvidiaGPUStats() []GPUStats {
	var gpuStats []GPUStats

	// Check if nvidia-smi is available
	cmd := exec.Command("nvidia-smi", "--query-gpu=name,utilization.gpu,memory.total,memory.used,memory.free,temperature.gpu,fan.speed,power.draw,clocks.current.graphics,clocks.current.memory", "--format=csv,noheader,nounits")
	output, err := cmd.Output()
	if err != nil {
		return gpuStats
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		parts := strings.Split(line, ", ")
		if len(parts) >= 10 {
			name := strings.TrimSpace(parts[0])
			usage, _ := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
			memTotal, _ := strconv.ParseUint(strings.TrimSpace(parts[2]), 10, 64)
			memUsed, _ := strconv.ParseUint(strings.TrimSpace(parts[3]), 10, 64)
			memFree, _ := strconv.ParseUint(strings.TrimSpace(parts[4]), 10, 64)
			temp, _ := strconv.ParseFloat(strings.TrimSpace(parts[5]), 64)
			fanSpeed, _ := strconv.Atoi(strings.TrimSpace(parts[6]))
			powerDraw, _ := strconv.ParseFloat(strings.TrimSpace(parts[7]), 64)
			clockCore, _ := strconv.Atoi(strings.TrimSpace(parts[8]))
			clockMemory, _ := strconv.Atoi(strings.TrimSpace(parts[9]))

			// Convert MB to bytes
			memTotalBytes := memTotal * 1024 * 1024
			memUsedBytes := memUsed * 1024 * 1024
			memFreeBytes := memFree * 1024 * 1024

			usedPercent := 0.0
			if memTotalBytes > 0 {
				usedPercent = float64(memUsedBytes) / float64(memTotalBytes) * 100
			}

			gpu := GPUStats{
				Name:          name,
				Usage:         usage,
				MemoryTotal:   memTotalBytes,
				MemoryUsed:    memUsedBytes,
				MemoryFree:    memFreeBytes,
				MemoryPercent: usedPercent,
				Temperature:   temp,
				FanSpeed:      fanSpeed,
				PowerDraw:     powerDraw,
				ClockCore:     clockCore,
				ClockMemory:   clockMemory,
			}

			gpuStats = append(gpuStats, gpu)
		}
	}

	return gpuStats
}

func getAMDGPUStats() []GPUStats {
	var gpuStats []GPUStats

	// Try to get AMD GPU info via rocm-smi or other AMD tools
	cmd := exec.Command("rocm-smi", "--showuse", "--showmemuse", "--showtemp")
	output, err := cmd.Output()
	if err != nil {
		return gpuStats // rocm-smi not available
	}

	// Parse rocm-smi output (this is a simplified version)
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if strings.Contains(line, "GPU") && !strings.Contains(line, "=") {
			// This is a basic implementation - actual parsing would be more complex
			gpu := GPUStats{
				Name:        "AMD GPU",
				Usage:       0.0,
				Temperature: 0.0,
			}
			gpuStats = append(gpuStats, gpu)
		}
	}

	return gpuStats
}

func getIntegratedGPUStats() GPUStats {
	// Basic integrated GPU detection
	gpu := GPUStats{
		Name:        "Integrated GPU",
		Usage:       0.0,
		Temperature: 0.0,
	}

	// Try to detect Intel integrated graphics
	if runtime.GOOS == "windows" {
		// On Windows, we could use WMI queries or other methods
		gpu.Name = "Intel Integrated Graphics"
	} else if runtime.GOOS == "linux" {
		// On Linux, check for intel_gpu_top or other tools
		cmd := exec.Command("intel_gpu_top", "-s", "1000", "-n", "1")
		if cmd.Run() == nil {
			gpu.Name = "Intel Integrated Graphics"
		}
	}

	return gpu
}

func getCPUTemperature() float64 {
	// Try to get CPU temperature (Linux/macOS)
	if runtime.GOOS == "linux" {
		// Try reading from thermal zones
		cmd := exec.Command("cat", "/sys/class/thermal/thermal_zone0/temp")
		output, err := cmd.Output()
		if err == nil {
			temp, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
			if err == nil {
				return temp / 1000.0 // Convert from millidegrees
			}
		}
	} else if runtime.GOOS == "darwin" {
		// Try using powermetrics on macOS
		cmd := exec.Command("powermetrics", "--samplers", "smc", "-n", "1", "--show-process-cpu")
		output, err := cmd.Output()
		if err == nil {
			// Parse powermetrics output for CPU temperature
			lines := strings.Split(string(output), "\n")
			for _, line := range lines {
				if strings.Contains(line, "CPU die temperature") {
					// Extract temperature value
					parts := strings.Fields(line)
					for i, part := range parts {
						if strings.Contains(part, "°C") && i > 0 {
							tempStr := strings.Replace(parts[i-1], "°C", "", -1)
							temp, err := strconv.ParseFloat(tempStr, 64)
							if err == nil {
								return temp
							}
						}
					}
				}
			}
		}
	}

	return 0.0 // Unable to get temperature
}

// ProcessFile processes an uploaded file and extracts text
func (fp *FileProcessor) ProcessFile(fileHeader *multipart.FileHeader, fileData []byte) (*FileParseResult, error) {
	startTime := time.Now()
	filename := fileHeader.Filename
	ext := strings.ToLower(filepath.Ext(filename))

	result := &FileParseResult{
		Filename: filename,
		FileType: ext,
		Metadata: make(map[string]string),
	}

	var text string
	var err error
	var pages int

	switch ext {
	case ".txt", ".log":
		text = string(fileData)
	case ".md":
		text = string(fileData)
		result.FileType = "markdown"
	case ".csv":
		text, err = fp.parseCSV(fileData)
		result.FileType = "csv"
	case ".json":
		text, err = fp.parseJSON(fileData)
		result.FileType = "json"
	case ".xml":
		text, err = fp.parseXML(fileData)
		result.FileType = "xml"
	case ".html", ".htm":
		text, err = fp.parseHTML(fileData)
		result.FileType = "html"
	case ".rtf":
		text, err = fp.parseRTF(fileData)
		result.FileType = "rtf"
	case ".pdf":
		text, pages, err = fp.parsePDF(fileData)
		result.Pages = pages
		result.FileType = "pdf"
	case ".docx":
		text, err = fp.parseDOCX(fileData)
		result.FileType = "docx"
	default:
		// Try to read as plain text for unknown extensions
		text = string(fileData)
		result.FileType = "unknown"
	}

	processingTime := time.Since(startTime)

	if err != nil {
		result.Success = false
		result.Error = err.Error()
		// Still populate text if we have partial results
	} else {
		result.Success = true
	}

	result.Text = text
	result.WordCount = len(strings.Fields(text))
	result.ProcessTime = processingTime.String()

	// Add basic metadata
	result.Metadata["size"] = fmt.Sprintf("%d bytes", len(fileData))
	result.Metadata["extension"] = ext
	result.Metadata["originalFilename"] = filename

	return result, nil
}

// GetSupportedFormats returns a list of supported file formats
func (fp *FileProcessor) GetSupportedFormats() []string {
	return []string{
		"txt", "md", "csv", "json", "xml", "html", "htm", "rtf", "log", "pdf", "docx",
	}
}

// ValidateFile checks if the file type is supported
func (fp *FileProcessor) ValidateFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	ext = strings.TrimPrefix(ext, ".")

	supported := fp.GetSupportedFormats()
	for _, format := range supported {
		if ext == format {
			return true
		}
	}

	return false
}

// parseCSV extracts and formats CSV data
func (fp *FileProcessor) parseCSV(data []byte) (string, error) {
	reader := csv.NewReader(bytes.NewReader(data))
	records, err := reader.ReadAll()
	if err != nil {
		return "", fmt.Errorf("failed to parse CSV: %v", err)
	}

	var textBuilder strings.Builder
	for i, record := range records {
		if i == 0 {
			textBuilder.WriteString("Headers: ")
		} else {
			textBuilder.WriteString(fmt.Sprintf("Row %d: ", i))
		}
		textBuilder.WriteString(strings.Join(record, " | "))
		textBuilder.WriteString("\n")
	}

	return textBuilder.String(), nil
}

// parseJSON extracts and formats JSON data
func (fp *FileProcessor) parseJSON(data []byte) (string, error) {
	var jsonData interface{}
	err := json.Unmarshal(data, &jsonData)
	if err != nil {
		// If not valid JSON, return as plain text
		return string(data), nil
	}

	// Pretty print the JSON
	prettyJSON, err := json.MarshalIndent(jsonData, "", "  ")
	if err != nil {
		return string(data), nil
	}

	return string(prettyJSON), nil
}

// parseXML extracts text from XML files
func (fp *FileProcessor) parseXML(data []byte) (string, error) {
	// Remove XML tags and extract text content
	content := string(data)

	// Use regex to remove XML tags but keep the content
	re := regexp.MustCompile(`<[^>]*>`)
	textOnly := re.ReplaceAllString(content, " ")

	// Clean up whitespace
	lines := strings.Split(textOnly, "\n")
	var textBuilder strings.Builder

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			textBuilder.WriteString(trimmed)
			textBuilder.WriteString("\n")
		}
	}

	return textBuilder.String(), nil
}

// parseRTF extracts text from RTF files (basic implementation)
func (fp *FileProcessor) parseRTF(data []byte) (string, error) {
	// This is a basic RTF parser - for production use, consider a proper RTF library
	content := string(data)

	// Remove RTF control words (very basic approach)
	lines := strings.Split(content, "\n")
	var textBuilder strings.Builder

	for _, line := range lines {
		// Skip lines that start with RTF control sequences
		if strings.HasPrefix(strings.TrimSpace(line), "{\\") ||
			strings.HasPrefix(strings.TrimSpace(line), "\\") {
			continue
		}

		// Clean up remaining text
		cleaned := strings.ReplaceAll(line, "}", "")
		cleaned = strings.ReplaceAll(cleaned, "{", "")

		if strings.TrimSpace(cleaned) != "" {
			textBuilder.WriteString(cleaned)
			textBuilder.WriteString("\n")
		}
	}

	return textBuilder.String(), nil
}

// parseHTML extracts text from HTML files (basic implementation)
func (fp *FileProcessor) parseHTML(data []byte) (string, error) {
	content := string(data)

	// Very basic HTML tag removal - for production, use a proper HTML parser
	content = strings.ReplaceAll(content, "<script", "<SCRIPT")
	content = strings.ReplaceAll(content, "</script>", "</SCRIPT>")
	content = strings.ReplaceAll(content, "<style", "<STYLE")
	content = strings.ReplaceAll(content, "</style>", "</STYLE>")

	// Remove script and style content
	for {
		start := strings.Index(content, "<SCRIPT")
		if start == -1 {
			break
		}
		end := strings.Index(content[start:], "</SCRIPT>")
		if end == -1 {
			break
		}
		content = content[:start] + content[start+end+9:]
	}

	for {
		start := strings.Index(content, "<STYLE")
		if start == -1 {
			break
		}
		end := strings.Index(content[start:], "</STYLE>")
		if end == -1 {
			break
		}
		content = content[:start] + content[start+end+8:]
	}

	// Remove HTML tags
	var textBuilder strings.Builder
	inTag := false

	for _, char := range content {
		if char == '<' {
			inTag = true
		} else if char == '>' {
			inTag = false
		} else if !inTag {
			textBuilder.WriteRune(char)
		}
	}

	return textBuilder.String(), nil
}

// parsePDF extracts text from PDF files using github.com/ledongthuc/pdf
func (fp *FileProcessor) parsePDF(data []byte) (string, int, error) {
	reader := bytes.NewReader(data)

	pdfReader, err := pdf.NewReader(reader, int64(len(data)))
	if err != nil {
		// Fallback to helpful message if PDF is corrupted or encrypted
		text := fmt.Sprintf(`PDF File Detected (%d bytes) - Error Reading

This PDF file could not be parsed. Possible reasons:
- File is corrupted
- File is password protected/encrypted
- File uses unsupported PDF features

Error: %v

You can manually copy and paste the text content if needed.`, len(data), err)
		return text, 0, err
	}

	var textBuilder strings.Builder
	pageCount := pdfReader.NumPage()

	// Track successful page extractions
	successfulPages := 0
	totalAttemptedPages := 0
	var extractionErrors []string

	for i := 1; i <= pageCount; i++ {
		totalAttemptedPages++
		page := pdfReader.Page(i)
		if page.V.IsNull() {
			extractionErrors = append(extractionErrors, fmt.Sprintf("Page %d: Null page object", i))
			continue
		}

		// Try with font map first
		fonts := make(map[string]*pdf.Font)
		pageText, err := page.GetPlainText(fonts)
		if err != nil {
			// Try without font map as fallback
			pageText, err = page.GetPlainText(nil)
			if err != nil {
				extractionErrors = append(extractionErrors, fmt.Sprintf("Page %d: %v", i, err))
				continue
			}
		}

		cleanText := strings.TrimSpace(pageText)
		if cleanText != "" {
			textBuilder.WriteString(fmt.Sprintf("=== Page %d ===\n", i))
			textBuilder.WriteString(cleanText)
			textBuilder.WriteString("\n\n")
			successfulPages++
		} else {
			// Try to get content in other ways - check if page has content streams
			extractionErrors = append(extractionErrors, fmt.Sprintf("Page %d: No extractable text (might contain images/graphics)", i))
		}
	}

	extractedText := textBuilder.String()

	// If no text was extracted, provide a detailed diagnostic message
	if extractedText == "" {
		var diagnostics strings.Builder
		diagnostics.WriteString(fmt.Sprintf("PDF File Analysis (%d bytes, %d pages)\n\n", len(data), pageCount))
		diagnostics.WriteString("✅ PDF file was successfully opened and parsed\n")
		diagnostics.WriteString("❌ No extractable text content found\n\n")

		diagnostics.WriteString("Possible reasons:\n")
		diagnostics.WriteString("• PDF contains only scanned images (requires OCR)\n")
		diagnostics.WriteString("• Text is embedded as graphics/vectors\n")
		diagnostics.WriteString("• Complex formatting not supported by parser\n")
		diagnostics.WriteString("• Text uses non-standard encoding\n\n")

		diagnostics.WriteString(fmt.Sprintf("Extraction Details:\n"))
		diagnostics.WriteString(fmt.Sprintf("• Total pages processed: %d/%d\n", totalAttemptedPages, pageCount))
		diagnostics.WriteString(fmt.Sprintf("• Pages with extractable text: %d\n", successfulPages))

		if len(extractionErrors) > 0 {
			diagnostics.WriteString("\nPage-by-page analysis:\n")
			for _, errMsg := range extractionErrors {
				diagnostics.WriteString(fmt.Sprintf("• %s\n", errMsg))
			}
		}

		diagnostics.WriteString("\n💡 Suggestions:\n")
		diagnostics.WriteString("• Try copying text directly from PDF viewer\n")
		diagnostics.WriteString("• Use OCR software for scanned documents\n")
		diagnostics.WriteString("• Convert PDF to Word/text format first\n")

		return diagnostics.String(), pageCount, nil
	}

	// Add summary header
	summaryText := fmt.Sprintf(`PDF Successfully Extracted (%d bytes, %d pages, %d pages with text)

%s`, len(data), pageCount, successfulPages, extractedText)

	return summaryText, pageCount, nil
}

// parseDOCX extracts text from DOCX files (basic implementation)
func (fp *FileProcessor) parseDOCX(data []byte) (string, error) {
	// DOCX files are ZIP archives containing XML files
	reader := bytes.NewReader(data)
	zipReader, err := zip.NewReader(reader, int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("failed to open DOCX file: %v", err)
	}

	var textBuilder strings.Builder

	// Look for document.xml which contains the main text
	for _, file := range zipReader.File {
		if file.Name == "word/document.xml" {
			rc, err := file.Open()
			if err != nil {
				continue
			}
			defer rc.Close()

			content, err := io.ReadAll(rc)
			if err != nil {
				continue
			}

			// Extract text from XML content
			xmlText, err := fp.parseXML(content)
			if err == nil {
				textBuilder.WriteString(xmlText)
			}
			break
		}
	}

	text := textBuilder.String()
	if text == "" {
		return fmt.Sprintf(`DOCX File Detected (%d bytes)

This appears to be a Microsoft Word document. Basic text extraction from the XML structure was attempted.
For better DOCX parsing, consider using a proper library like:

go get github.com/unidoc/unioffice

The file structure was analyzed but no readable text content was found in the standard location.`, len(data)), nil
	}

	return text, nil
}
