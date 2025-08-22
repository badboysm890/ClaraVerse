package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

// SearXNG and Web Content constants
const (
	SearXNGImage    = "searxng/searxng:latest"
	ContainerName   = "angela-searxng"
	SearXNGPort     = "8080"
	SearXNGURL      = "http://localhost:8080"
	HealthCheckPath = "/healthz"
	SearchPath      = "/search"
	ConfigPath      = "./searxng-config"
)

// Web content and search types
type SearchResult struct {
	URL         string `json:"url"`
	Title       string `json:"title"`
	Content     string `json:"content"`
	PublishedAt string `json:"publishedDate,omitempty"`
	Engine      string `json:"engine"`
}

type SearchResponse struct {
	Query           string         `json:"query"`
	NumberOfResults int            `json:"number_of_results"`
	Results         []SearchResult `json:"results"`
	Infoboxes       []interface{}  `json:"infoboxes"`
	Suggestions     []string       `json:"suggestions"`
	AnswerBox       interface{}    `json:"answer"`
}

type WebContent struct {
	URL         string `json:"url"`
	Title       string `json:"title"`
	Content     string `json:"content"`
	Description string `json:"description"`
	StatusCode  int    `json:"status_code"`
	Error       string `json:"error,omitempty"`
}

type SearXNGManager struct {
	containerID string
	isRunning   bool
}

type WebContentFetcher struct {
	client *http.Client
}

// Core types
type MCPRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	ID      interface{}     `json:"id"`
	Params  json.RawMessage `json:"params"`
}

type MCPResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Result  interface{} `json:"result,omitempty"`
	Error   *MCPError   `json:"error,omitempty"`
}

type MCPError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

// PythonMCPServer with virtual environment support
type PythonMCPServer struct {
	systemPython string // System Python for creating venv
	venvPath     string // Path to virtual environment
	pythonPath   string // Python executable in venv
	pipPath      string // Pip executable in venv
	workspaceDir string // Workspace directory
	mu           sync.RWMutex
}

// NewPythonMCPServer creates server with dedicated workspace and venv
func NewPythonMCPServer() *PythonMCPServer {
	// Create workspace directory with absolute path
	cwd, err := os.Getwd()
	if err != nil {
		cwd = "."
	}

	workspace := filepath.Join(cwd, "mcp_workspace")
	if err := os.MkdirAll(workspace, 0755); err != nil {
		log.Printf("Warning: Failed to create workspace: %v", err)
		workspace = cwd
	}

	server := &PythonMCPServer{
		workspaceDir: workspace,
		venvPath:     filepath.Join(workspace, ".venv"),
	}

	// Find system Python first
	server.systemPython = server.findSystemPython()
	log.Printf("Found system Python: %s", server.systemPython)

	// Initialize virtual environment
	if err := server.initVirtualEnv(); err != nil {
		log.Printf("WARNING: Failed to create virtual environment: %v", err)
		log.Printf("Falling back to system Python")
		server.pythonPath = server.systemPython
		server.pipPath = server.systemPython
	}

	log.Printf("Python MCP Server started")
	log.Printf("System Python: %s", server.systemPython)
	log.Printf("Virtual env: %s", server.venvPath)
	log.Printf("Active Python: %s", server.pythonPath)
	log.Printf("Workspace: %s", server.workspaceDir)

	// Create README file
	server.createReadme()

	return server
}

// findSystemPython finds the system Python 3
func (s *PythonMCPServer) findSystemPython() string {
	// Try common commands
	for _, cmd := range []string{"python3", "python", "py"} {
		if path, err := exec.LookPath(cmd); err == nil {
			// Verify it's Python 3
			out, err := exec.Command(path, "--version").Output()
			if err == nil && strings.Contains(string(out), "Python 3") {
				return path
			}
		}
	}
	return "python" // fallback
}

// initVirtualEnv creates and activates a virtual environment
func (s *PythonMCPServer) initVirtualEnv() error {
	// Set paths based on OS
	if runtime.GOOS == "windows" {
		s.pythonPath = filepath.Join(s.venvPath, "Scripts", "python.exe")
		s.pipPath = filepath.Join(s.venvPath, "Scripts", "pip.exe")
	} else {
		s.pythonPath = filepath.Join(s.venvPath, "bin", "python")
		s.pipPath = filepath.Join(s.venvPath, "bin", "pip")
	}

	// Check if venv already exists
	if _, err := os.Stat(s.pythonPath); err == nil {
		log.Printf("Virtual environment already exists")
		return nil
	}

	// Create virtual environment
	log.Printf("Creating virtual environment...")
	cmd := exec.Command(s.systemPython, "-m", "venv", s.venvPath)
	cmd.Dir = s.workspaceDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to create venv: %v\nOutput: %s", err, output)
	}

	// Verify venv was created
	if _, err := os.Stat(s.pythonPath); err != nil {
		return fmt.Errorf("venv created but Python not found at %s", s.pythonPath)
	}

	// Upgrade pip in the venv
	log.Printf("Upgrading pip in virtual environment...")
	upgradeCmd := exec.Command(s.pythonPath, "-m", "pip", "install", "--upgrade", "pip")
	upgradeCmd.Dir = s.workspaceDir
	if output, err := upgradeCmd.CombinedOutput(); err != nil {
		log.Printf("Warning: Failed to upgrade pip: %v\nOutput: %s", err, output)
	}

	log.Printf("Virtual environment created successfully")
	return nil
}

// createReadme creates a comprehensive README file in workspace
func (s *PythonMCPServer) createReadme() {
	readmePath := filepath.Join(s.workspaceDir, "README.txt")
	if _, err := os.Stat(readmePath); os.IsNotExist(err) {
		shellInfo := "Shell: Unix/Linux (/bin/sh)"
		if runtime.GOOS == "windows" {
			shellInfo = "Shell: Windows PowerShell"
		}

		readme := `MCP Workspace Directory - Python Execution Environment
======================================================

Welcome to your isolated MCP (Model Context Protocol) workspace!

OVERVIEW:
This workspace provides a completely isolated Python environment where you can:
- Execute Python code safely without affecting your system
- Install packages that won't interfere with system Python
- Save and load files in a dedicated workspace
- Run shell commands with automatic Python/pip routing

WORKSPACE FEATURES:
✓ Isolated Python Virtual Environment (.venv/)
✓ Clean workspace for file operations
✓ Cross-platform shell command support
✓ Automatic dependency management
✓ Safe package installation

AVAILABLE TOOLS:

1. py(code="...")
   - Execute Python code in isolated environment
   - Auto-prints last line expressions
   - Supports multi-line code, imports, functions
   - Examples:
     py(code="import math; math.sqrt(16)")
     py(code="[x**2 for x in range(5)]")
     py(code="def greet(name): return f'Hello {name}!'")

2. ` + shellInfo + `
   - powershell(cmd="...") on Windows / sh(cmd="...") on Unix
   - Execute system commands
   - Auto-routes python/pip to virtual environment
   - Examples:
     powershell(cmd="Get-Process python")
     sh(cmd="ps aux | grep python")

3. pip(pkg="...")
   - Install Python packages safely
   - Only affects this workspace environment
   - Examples:
     pip(pkg="requests")
     pip(pkg="numpy pandas matplotlib")
     pip(pkg="beautifulsoup4==4.9.3")

4. save(name="...", text="...")
   - Save content to workspace files
   - Persistent across MCP session
   - Examples:
     save(name="script.py", text="print('Hello World')")
     save(name="data.json", text='{"key": "value"}')

5. load(name="...")
   - Read file content from workspace
   - Access previously saved files
   - Examples:
     load(name="script.py")
     load(name="data.json")

6. ls()
   - List all workspace files and directories
   - Shows file sizes and types
   - Excludes .venv for clarity

7. open()
   - Open workspace in system file manager
   - Direct access to workspace folder
   - Platform-specific file manager

GETTING STARTED:
1. Check Python version: py(code="import sys; print(sys.version)")
2. Install a package: pip(pkg="requests")
3. Test the package: py(code="import requests; print('Requests installed!')")
4. Save a script: save(name="test.py", text="print('Hello from saved file')")
5. List files: ls()
6. Load and run: py(code=load(name="test.py"))

WORKSPACE STRUCTURE:
├── README.txt          (this file)
├── .venv/             (Python virtual environment - hidden from ls())
├── your_files.py      (files you save)
├── data_files.json    (data you create)
└── any_other_files    (content you work with)

TIPS FOR AI MODELS:
- Use py() for Python calculations, data processing, API calls
- Use pip() to install libraries before using them in py()
- Use save()/load() to persist code and data between operations
- Use ls() to see what files are available
- All operations are isolated and safe to experiment with
- Files persist within the same MCP session

VIRTUAL ENVIRONMENT DETAILS:
- Location: .venv/
- Python: Isolated Python 3.x installation
- Packages: Separated from system Python
- Activation: Automatic for all py() and python commands

This workspace is your sandbox - experiment freely!
`
		ioutil.WriteFile(readmePath, []byte(readme), 0644)
	}
}

// getTools returns detailed tool definitions with comprehensive descriptions
func (s *PythonMCPServer) getTools() []Tool {
	// Dynamic shell description based on OS
	shellName := "sh"
	shellDesc := "Execute shell commands in Unix/Linux environment. Runs commands using /bin/sh with full access to system utilities, file operations, and process management. Automatically routes 'python' and 'pip' commands to the isolated virtual environment."
	cmdDesc := "Shell command to execute (e.g., 'ls -la', 'grep pattern file.txt', 'curl https://api.example.com')"

	if runtime.GOOS == "windows" {
		shellName = "powershell"
		shellDesc = "Execute PowerShell commands in Windows environment. Runs commands using PowerShell with full access to Windows utilities, file system operations, registry access, and .NET framework. Automatically routes 'python' and 'pip' commands to the isolated virtual environment. Supports both PowerShell cmdlets and traditional Windows commands."
		cmdDesc = "PowerShell command to execute (e.g., 'Get-ChildItem', 'Test-Path C:\\file.txt', 'Invoke-WebRequest https://api.example.com')"
	}

	return []Tool{
		{
			Name:        "py",
			Description: "Execute Python code in an isolated virtual environment. Runs Python 3.x code with automatic output handling - expressions on the last line are automatically printed for convenience. All code executes in a dedicated workspace directory with an isolated virtual environment, so system Python and packages remain untouched. Perfect for data analysis, calculations, file processing, API calls, and any Python scripting needs. Supports multi-line code blocks, imports, function definitions, and complex operations.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"code": map[string]interface{}{
						"type":        "string",
						"description": "Python code to execute. Can be single expressions (e.g., '2+2'), multi-line scripts, import statements, function definitions, or complex programs. Last line expressions are automatically printed. Examples: 'import requests; requests.get(\"https://api.github.com\").json()', 'def factorial(n): return 1 if n <= 1 else n * factorial(n-1); factorial(5)', '[x**2 for x in range(10)]'",
					},
				},
				"required": []string{"code"},
			},
		},
		{
			Name:        shellName,
			Description: shellDesc,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"cmd": map[string]interface{}{
						"type":        "string",
						"description": cmdDesc,
					},
				},
				"required": []string{"cmd"},
			},
		},
		{
			Name:        "pip",
			Description: "Install Python packages into the isolated virtual environment. Safely installs Python packages using pip without affecting the system Python installation. All packages are installed only in the dedicated virtual environment created for this MCP session. Supports installing from PyPI, Git repositories, local files, and specific versions. Use this to add any Python libraries you need for your code execution.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"pkg": map[string]interface{}{
						"type":        "string",
						"description": "Package name or specification to install. Examples: 'requests' (latest version), 'numpy==1.21.0' (specific version), 'git+https://github.com/user/repo.git' (from Git), 'package>=1.0,<2.0' (version range), 'requests beautifulsoup4 pandas' (multiple packages)",
					},
				},
				"required": []string{"pkg"},
			},
		},
		{
			Name:        "save",
			Description: "Save text content to a file in the MCP workspace directory. Creates or overwrites files with the specified content. All files are saved to the isolated workspace directory and can be accessed later with the 'load' tool or referenced in Python/shell commands. Perfect for saving code, data, configuration files, logs, or any text-based content. Files persist across tool calls within the same MCP session.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"name": map[string]interface{}{
						"type":        "string",
						"description": "Filename to save (e.g., 'script.py', 'data.json', 'config.txt', 'analysis.csv'). Extension determines file type. File will be saved in the MCP workspace directory.",
					},
					"text": map[string]interface{}{
						"type":        "string",
						"description": "Complete file content to save. Can be Python code, JSON data, CSV content, configuration text, or any text-based format. Use proper formatting and newlines as needed.",
					},
				},
				"required": []string{"name", "text"},
			},
		},
		{
			Name:        "load",
			Description: "Read and return the complete content of a file from the MCP workspace directory. Retrieves text content from files previously saved with the 'save' tool or placed in the workspace directory. Returns the entire file content as text, which can then be processed, analyzed, or modified. Use this to access saved scripts, data files, configuration files, or any text-based content.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"name": map[string]interface{}{
						"type":        "string",
						"description": "Filename to read from the workspace directory (e.g., 'script.py', 'data.json', 'results.txt'). Must be an existing file in the MCP workspace.",
					},
				},
				"required": []string{"name"},
			},
		},
		{
			Name:        "ls",
			Description: "List all files and directories in the MCP workspace directory. Shows file names, sizes (in bytes, KB, or MB), and indicates directories with [DIR] prefix. Excludes the .venv virtual environment directory from the listing for clarity. Use this to see what files are available for loading, understand the workspace structure, or verify that files were saved correctly. Helps you navigate and manage workspace contents.",
			InputSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			Name:        "open",
			Description: "Open the MCP workspace directory in the system file manager for direct access. Launches the default file manager (Windows Explorer on Windows, Finder on macOS, or available file manager on Linux) showing the workspace folder. This allows you to manually inspect files, add external files to the workspace, or perform file operations outside the MCP tools. The workspace contains all saved files and the Python virtual environment.",
			InputSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			Name:        "search",
			Description: "Search the web using SearXNG private search engine. Performs privacy-focused web searches using a local SearXNG Docker container. Automatically starts the SearXNG service if needed, searches for the specified query, and returns structured results with titles, URLs, content snippets, and source engines. Perfect for research, fact-checking, finding documentation, or gathering information while maintaining privacy. Results include suggestions and can be filtered by various search engines.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{
						"type":        "string",
						"description": "Search query to execute (e.g., 'golang web scraping', 'machine learning tutorials', 'docker best practices'). Use natural language or specific keywords.",
					},
					"num_results": map[string]interface{}{
						"type":        "integer",
						"description": "Maximum number of search results to return (default: 10, max: 20). More results provide broader coverage but take longer to process.",
						"default":     10,
						"minimum":     1,
						"maximum":     20,
					},
				},
				"required": []string{"query"},
			},
		},
		{
			Name:        "fetch_content",
			Description: "Fetch and extract content from web pages. Downloads HTML content from specified URLs and intelligently extracts the main text content, title, and meta description. Handles redirects, validates content types, and cleans extracted text. Perfect for reading articles, documentation, blog posts, or any web content for analysis or summarization. Respects web standards and includes proper browser headers.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"url": map[string]interface{}{
						"type":        "string",
						"description": "URL to fetch content from (e.g., 'https://example.com/article', 'https://docs.python.org/3/'). Must be a valid HTTP/HTTPS URL pointing to HTML content.",
					},
				},
				"required": []string{"url"},
			},
		},
	}
}

// Tool implementations

func (s *PythonMCPServer) py(params map[string]interface{}) string {
	code, ok := params["code"].(string)
	if !ok {
		return "ERROR: Need 'code'"
	}

	// Auto-print last expression if it looks like one
	lines := strings.Split(strings.TrimSpace(code), "\n")
	if len(lines) > 0 {
		last := strings.TrimSpace(lines[len(lines)-1])
		// Simple heuristic: if it doesn't look like a statement, print it
		if last != "" && !strings.Contains(last, "=") && !strings.HasPrefix(last, "print") &&
			!strings.HasPrefix(last, "if") && !strings.HasPrefix(last, "for") &&
			!strings.HasPrefix(last, "while") && !strings.HasPrefix(last, "def") &&
			!strings.HasPrefix(last, "class") && !strings.HasPrefix(last, "import") &&
			!strings.HasPrefix(last, "from") && !strings.HasPrefix(last, "return") &&
			!strings.HasPrefix(last, "try") && !strings.HasPrefix(last, "except") {
			lines[len(lines)-1] = fmt.Sprintf("print(%s)", last)
			code = strings.Join(lines, "\n")
		}
	}

	// Execute Python directly with -c flag using venv Python
	cmd := exec.Command(s.pythonPath, "-c", code)
	cmd.Dir = s.workspaceDir

	// Set environment to ensure venv is active
	cmd.Env = os.Environ()
	if runtime.GOOS == "windows" {
		cmd.Env = append(cmd.Env, fmt.Sprintf("VIRTUAL_ENV=%s", s.venvPath))
	}

	output, err := cmd.CombinedOutput()

	result := strings.TrimSpace(string(output))
	if err != nil {
		if result == "" {
			result = err.Error()
		}
		// Clean up common Python error formats
		if strings.Contains(result, "Traceback") {
			lines := strings.Split(result, "\n")
			if len(lines) > 0 {
				lastLine := lines[len(lines)-1]
				if strings.Contains(lastLine, "Error:") {
					result = lastLine
				}
			}
		}
		return fmt.Sprintf("ERROR: %s", result)
	}

	if result == "" {
		result = "OK (no output)"
	}
	return result
}

func (s *PythonMCPServer) sh(params map[string]interface{}) string {
	command, ok := params["cmd"].(string)
	if !ok {
		return "ERROR: Need 'cmd'"
	}

	var cmd *exec.Cmd

	// Special handling for Python/pip commands to use venv
	lowerCmd := strings.ToLower(command)
	if strings.HasPrefix(lowerCmd, "python ") || lowerCmd == "python" {
		// Replace python with venv python
		args := strings.Split(command, " ")[1:]
		cmd = exec.Command(s.pythonPath, args...)
	} else if strings.HasPrefix(lowerCmd, "pip ") || lowerCmd == "pip" {
		// Replace pip with venv pip
		args := strings.Split(command, " ")[1:]
		cmd = exec.Command(s.pipPath, args...)
	} else {
		// Regular shell command
		switch runtime.GOOS {
		case "windows":
			cmd = exec.Command("powershell", "-Command", command)
		default:
			cmd = exec.Command("sh", "-c", command)
		}
	}

	cmd.Dir = s.workspaceDir

	// Set environment to include venv
	cmd.Env = os.Environ()
	if runtime.GOOS == "windows" {
		cmd.Env = append(cmd.Env, fmt.Sprintf("VIRTUAL_ENV=%s", s.venvPath))
		// Update PATH to include venv Scripts
		for i, env := range cmd.Env {
			if strings.HasPrefix(env, "PATH=") || strings.HasPrefix(env, "Path=") {
				cmd.Env[i] = fmt.Sprintf("%s;%s", env, filepath.Join(s.venvPath, "Scripts"))
				break
			}
		}
	} else {
		cmd.Env = append(cmd.Env, fmt.Sprintf("VIRTUAL_ENV=%s", s.venvPath))
		// Update PATH to include venv bin
		for i, env := range cmd.Env {
			if strings.HasPrefix(env, "PATH=") {
				cmd.Env[i] = fmt.Sprintf("PATH=%s:%s", filepath.Join(s.venvPath, "bin"), strings.TrimPrefix(env, "PATH="))
				break
			}
		}
	}

	output, err := cmd.CombinedOutput()

	result := strings.TrimSpace(string(output))
	if err != nil {
		if result == "" {
			result = err.Error()
		}
		return fmt.Sprintf("ERROR: %s", result)
	}

	if result == "" {
		result = "OK"
	}
	return result
}

func (s *PythonMCPServer) pip(params map[string]interface{}) string {
	pkg, ok := params["pkg"].(string)
	if !ok {
		return "ERROR: Need 'pkg'"
	}

	// Use venv pip
	cmd := exec.Command(s.pipPath, "install", pkg)
	cmd.Dir = s.workspaceDir
	output, err := cmd.CombinedOutput()

	if err != nil {
		return fmt.Sprintf("ERROR: %s", strings.TrimSpace(string(output)))
	}

	return fmt.Sprintf("Installed %s in virtual environment", pkg)
}

func (s *PythonMCPServer) save(params map[string]interface{}) string {
	name, ok := params["name"].(string)
	if !ok {
		return "ERROR: Need 'name'"
	}

	text, ok := params["text"].(string)
	if !ok {
		return "ERROR: Need 'text'"
	}

	// Force save to workspace
	fullPath := filepath.Join(s.workspaceDir, filepath.Base(name))

	if err := ioutil.WriteFile(fullPath, []byte(text), 0644); err != nil {
		return fmt.Sprintf("ERROR: %v", err)
	}

	return fmt.Sprintf("Saved %s (%d bytes)", filepath.Base(name), len(text))
}

func (s *PythonMCPServer) load(params map[string]interface{}) string {
	name, ok := params["name"].(string)
	if !ok {
		return "ERROR: Need 'name'"
	}

	// Look in workspace
	fullPath := filepath.Join(s.workspaceDir, filepath.Base(name))

	content, err := ioutil.ReadFile(fullPath)
	if err != nil {
		return fmt.Sprintf("ERROR: %v", err)
	}

	return string(content)
}

func (s *PythonMCPServer) ls(params map[string]interface{}) string {
	files, err := ioutil.ReadDir(s.workspaceDir)
	if err != nil {
		return fmt.Sprintf("ERROR: %v", err)
	}

	if len(files) == 0 {
		return "No files in workspace"
	}

	var items []string
	for _, f := range files {
		// Skip .venv directory in listing
		if f.Name() == ".venv" {
			continue
		}

		if f.IsDir() {
			items = append(items, fmt.Sprintf("[DIR] %s", f.Name()))
		} else {
			size := f.Size()
			unit := "B"
			if size > 1024*1024 {
				size = size / (1024 * 1024)
				unit = "MB"
			} else if size > 1024 {
				size = size / 1024
				unit = "KB"
			}
			items = append(items, fmt.Sprintf("%s (%d%s)", f.Name(), size, unit))
		}
	}

	if len(items) == 0 {
		return "No files in workspace (excluding .venv)"
	}

	return strings.Join(items, "\n")
}

func (s *PythonMCPServer) open(params map[string]interface{}) string {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", s.workspaceDir)
	case "darwin":
		cmd = exec.Command("open", s.workspaceDir)
	case "linux":
		if _, err := exec.LookPath("xdg-open"); err == nil {
			cmd = exec.Command("xdg-open", s.workspaceDir)
		} else if _, err := exec.LookPath("nautilus"); err == nil {
			cmd = exec.Command("nautilus", s.workspaceDir)
		} else if _, err := exec.LookPath("dolphin"); err == nil {
			cmd = exec.Command("dolphin", s.workspaceDir)
		} else if _, err := exec.LookPath("thunar"); err == nil {
			cmd = exec.Command("thunar", s.workspaceDir)
		} else {
			return "ERROR: No file manager found. Workspace at: " + s.workspaceDir
		}
	default:
		return "ERROR: Unsupported OS. Workspace at: " + s.workspaceDir
	}

	if err := cmd.Start(); err != nil {
		return fmt.Sprintf("ERROR: Failed to open folder: %v\nWorkspace at: %s", err, s.workspaceDir)
	}

	go func() {
		cmd.Wait()
	}()

	return fmt.Sprintf("Opened workspace folder: %s", s.workspaceDir)
}

// Embedded SearXNG and Web Content functionality

// NewSearXNGManager creates a new SearXNG manager
func NewSearXNGManager() *SearXNGManager {
	return &SearXNGManager{}
}

// NewWebContentFetcher creates a new web content fetcher
func NewWebContentFetcher() *WebContentFetcher {
	return &WebContentFetcher{
		client: &http.Client{
			Timeout: 30 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 10 {
					return fmt.Errorf("too many redirects")
				}
				return nil
			},
		},
	}
}

// CheckDockerInstalled checks if Docker is available
func (sm *SearXNGManager) CheckDockerInstalled() error {
	cmd := exec.Command("docker", "--version")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("Docker is not installed or not running. Please install Docker Desktop and ensure it's running")
	}
	return nil
}

// CheckContainerExists checks if the SearXNG container exists
func (sm *SearXNGManager) CheckContainerExists() bool {
	cmd := exec.Command("docker", "ps", "-a", "--filter", fmt.Sprintf("name=%s", ContainerName), "--format", "{{.Names}}")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(output)) == ContainerName
}

// CheckContainerRunning checks if the SearXNG container is running
func (sm *SearXNGManager) CheckContainerRunning() bool {
	cmd := exec.Command("docker", "ps", "--filter", fmt.Sprintf("name=%s", ContainerName), "--format", "{{.Names}}")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(output)) == ContainerName
}

// CreateSearXNGConfig creates a proper SearXNG configuration
func (sm *SearXNGManager) CreateSearXNGConfig() error {
	configDir := "searxng-config"
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %v", err)
	}

	settingsContent := `# SearXNG settings for angela MCP
use_default_settings: true

general:
  debug: false
  instance_name: "angela SearXNG"
  contact_url: false
  enable_metrics: false

search:
  safe_search: 0
  autocomplete: ""
  default_lang: "en"
  ban_time_on_fail: 5
  max_ban_time_on_fail: 120
  formats:
    - html
    - json

server:
  port: 8080
  bind_address: "0.0.0.0"
  secret_key: "angela-secret-key-for-searxng"
  base_url: false
  image_proxy: true
  static_use_hash: false

ui:
  static_use_hash: false
  default_locale: "en"
  query_in_title: false
  infinite_scroll: false
  center_alignment: false
  cache_url: "https://web.archive.org/web/"
  search_on_category_select: true
  hotkeys: default

# Disable bot detection for local use
botdetection:
  ip_limit:
    filter_link_local: false
    link_token: false
  ip_lists:
    pass_searx_org: false
    pass_ip: []
    block_ip: []

# Enable all default engines
engines:
  - name: google
    engine: google
    use_mobile_ui: false

  - name: bing
    engine: bing

  - name: duckduckgo
    engine: duckduckgo
    
  - name: wikipedia
    engine: wikipedia

  - name: github
    engine: github

enabled_plugins:
  - 'Hash plugin'
  - 'Search on category select'
  - 'Self Information'
  - 'Tracker URL remover'
  - 'Ahmia blacklist'
`

	settingsPath := filepath.Join(configDir, "settings.yml")
	if err := ioutil.WriteFile(settingsPath, []byte(settingsContent), 0644); err != nil {
		return fmt.Errorf("failed to write settings.yml: %v", err)
	}

	// Create limiter.toml to avoid warnings
	limiterContent := `# SearXNG limiter configuration
[botdetection.ip_limit]
# Disable aggressive bot detection for local use
filter_link_local = false

[botdetection.ip_lists]
pass_ip = ["127.0.0.1", "::1", "192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12"]
`

	limiterPath := filepath.Join(configDir, "limiter.toml")
	if err := ioutil.WriteFile(limiterPath, []byte(limiterContent), 0644); err != nil {
		return fmt.Errorf("failed to write limiter.toml: %v", err)
	}

	fmt.Printf("✅ Created SearXNG configuration in %s\n", configDir)
	return nil
}

// StartContainer starts the SearXNG container
func (sm *SearXNGManager) StartContainer() error {
	if err := sm.CheckDockerInstalled(); err != nil {
		return err
	}

	// Check if container is already running
	if sm.CheckContainerRunning() {
		fmt.Println("✅ SearXNG container is already running")
		sm.isRunning = true
		return nil
	}

	// Create configuration first
	if err := sm.CreateSearXNGConfig(); err != nil {
		return fmt.Errorf("failed to create SearXNG config: %v", err)
	}

	// Pull image if not exists
	fmt.Println("🐳 Pulling SearXNG Docker image...")
	pullCmd := exec.Command("docker", "pull", SearXNGImage)
	if err := pullCmd.Run(); err != nil {
		return fmt.Errorf("failed to pull SearXNG image: %v", err)
	}

	// Get absolute path to config
	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get working directory: %v", err)
	}
	configAbsPath := filepath.Join(cwd, "searxng-config")

	// Check if container exists but is stopped
	if sm.CheckContainerExists() {
		fmt.Println("🚀 Starting existing SearXNG container...")
		cmd := exec.Command("docker", "start", ContainerName)
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("failed to start existing container: %v", err)
		}
	} else {
		// Create and start new container with proper configuration and volume mount
		fmt.Println("🚀 Creating and starting SearXNG container...")
		cmd := exec.Command("docker", "run", "-d",
			"--name", ContainerName,
			"-p", fmt.Sprintf("%s:8080", SearXNGPort),
			"-v", fmt.Sprintf("%s:/etc/searxng", configAbsPath),
			"-e", "SEARXNG_BASE_URL=http://localhost:8080/",
			"-e", "SEARXNG_SECRET=angela-secret-key-for-searxng",
			"--add-host=host.docker.internal:host-gateway", // For localhost access
			SearXNGImage)

		output, err := cmd.Output()
		if err != nil {
			return fmt.Errorf("failed to create container: %v", err)
		}
		sm.containerID = strings.TrimSpace(string(output))
	}

	// Wait for container to be healthy
	return sm.WaitForHealthy()
}

// WaitForHealthy waits for the SearXNG container to be ready
func (sm *SearXNGManager) WaitForHealthy() error {
	fmt.Println("⏳ Waiting for SearXNG to be ready...")

	timeout := 60 * time.Second
	start := time.Now()

	for time.Since(start) < timeout {
		if !sm.CheckContainerRunning() {
			time.Sleep(2 * time.Second)
			continue
		}

		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Get(SearXNGURL + "/")
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			fmt.Println("✅ SearXNG is ready!")
			sm.isRunning = true
			return nil
		}
		if resp != nil {
			resp.Body.Close()
		}

		time.Sleep(2 * time.Second)
	}

	return fmt.Errorf("timeout waiting for SearXNG to be ready")
}

// SearchSearXNG performs a search using SearXNG
func (sm *SearXNGManager) SearchSearXNG(query string, numResults int) (*SearchResponse, error) {
	if !sm.isRunning && !sm.CheckContainerRunning() {
		return nil, fmt.Errorf("SearXNG container is not running")
	}

	if numResults <= 0 {
		numResults = 10
	}

	// Build search URL
	searchURL := fmt.Sprintf("%s%s?q=%s&format=json&pageno=1",
		SearXNGURL, SearchPath,
		strings.ReplaceAll(query, " ", "+"))

	fmt.Printf("🔍 Searching for: %s\n", query)

	// Perform HTTP request with proper headers for SearXNG
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create search request: %v", err)
	}

	// Add headers to satisfy SearXNG bot detection
	req.Header.Set("User-Agent", "angela-MCP-Client/1.0")
	req.Header.Set("Accept", "application/json, text/html")
	req.Header.Set("X-Forwarded-For", "127.0.0.1")
	req.Header.Set("X-Real-IP", "127.0.0.1")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("search request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("search failed with status %d: %s", resp.StatusCode, string(body))
	}

	// Parse JSON response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %v", err)
	}

	var searchResp SearchResponse
	if err := json.Unmarshal(body, &searchResp); err != nil {
		return nil, fmt.Errorf("failed to parse search response: %v", err)
	}

	// Limit results
	if len(searchResp.Results) > numResults {
		searchResp.Results = searchResp.Results[:numResults]
	}
	searchResp.NumberOfResults = len(searchResp.Results)

	fmt.Printf("✅ Found %d results\n", searchResp.NumberOfResults)
	return &searchResp, nil
}

// FetchContent fetches and extracts content from a URL
func (wf *WebContentFetcher) FetchContent(targetURL string) *WebContent {
	result := &WebContent{
		URL: targetURL,
	}

	// Validate URL
	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		result.Error = fmt.Sprintf("Invalid URL: %v", err)
		return result
	}

	// Ensure URL has scheme
	if parsedURL.Scheme == "" {
		targetURL = "https://" + targetURL
		result.URL = targetURL
	}

	// Create request with proper headers
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to create request: %v", err)
		return result
	}

	// Set realistic browser headers
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")
	req.Header.Set("Connection", "keep-alive")

	// Perform request
	resp, err := wf.client.Do(req)
	if err != nil {
		result.Error = fmt.Sprintf("Request failed: %v", err)
		return result
	}
	defer resp.Body.Close()

	result.StatusCode = resp.StatusCode

	// Check if response is successful
	if resp.StatusCode >= 400 {
		result.Error = fmt.Sprintf("HTTP error: %d %s", resp.StatusCode, resp.Status)
		return result
	}

	// Check content type
	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(strings.ToLower(contentType), "text/html") {
		result.Error = fmt.Sprintf("Content type not supported: %s", contentType)
		return result
	}

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to read response: %v", err)
		return result
	}

	html := string(body)

	// Extract content
	result.Title = wf.extractTitle(html)
	result.Description = wf.extractDescription(html)
	result.Content = wf.extractTextContent(html)

	return result
}

// extractTitle extracts the page title
func (wf *WebContentFetcher) extractTitle(html string) string {
	titleRegex := regexp.MustCompile(`(?i)<title[^>]*>([^<]*)</title>`)
	matches := titleRegex.FindStringSubmatch(html)
	if len(matches) > 1 {
		return strings.TrimSpace(wf.cleanText(matches[1]))
	}
	return ""
}

// extractDescription extracts meta description
func (wf *WebContentFetcher) extractDescription(html string) string {
	// Try meta description
	descRegex := regexp.MustCompile(`(?i)<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\']`)
	matches := descRegex.FindStringSubmatch(html)
	if len(matches) > 1 {
		return strings.TrimSpace(wf.cleanText(matches[1]))
	}

	// Try og:description
	ogDescRegex := regexp.MustCompile(`(?i)<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']*)["\']`)
	matches = ogDescRegex.FindStringSubmatch(html)
	if len(matches) > 1 {
		return strings.TrimSpace(wf.cleanText(matches[1]))
	}

	return ""
}

// extractTextContent extracts main text content
func (wf *WebContentFetcher) extractTextContent(html string) string {
	// Remove script and style tags
	scriptRegex := regexp.MustCompile(`(?i)<script[^>]*>.*?</script>`)
	html = scriptRegex.ReplaceAllString(html, "")

	styleRegex := regexp.MustCompile(`(?i)<style[^>]*>.*?</style>`)
	html = styleRegex.ReplaceAllString(html, "")

	// Try to extract content from common content containers
	contentSelectors := []string{
		`(?i)<article[^>]*>(.*?)</article>`,
		`(?i)<main[^>]*>(.*?)</main>`,
		`(?i)<div[^>]*class=["\'][^"\']*content[^"\']*["\'][^>]*>(.*?)</div>`,
		`(?i)<p[^>]*>(.*?)</p>`,
	}

	var extractedText []string

	for _, selector := range contentSelectors {
		regex := regexp.MustCompile(selector)
		matches := regex.FindAllStringSubmatch(html, -1)
		for _, match := range matches {
			if len(match) > 1 {
				text := wf.cleanText(match[1])
				if len(text) > 50 {
					extractedText = append(extractedText, text)
				}
			}
		}
		if len(extractedText) > 0 {
			break
		}
	}

	// Fallback: extract all text content
	if len(extractedText) == 0 {
		tagRegex := regexp.MustCompile(`<[^>]*>`)
		text := tagRegex.ReplaceAllString(html, " ")
		extractedText = append(extractedText, wf.cleanText(text))
	}

	// Join and limit content
	content := strings.Join(extractedText, "\n\n")
	if len(content) > 2000 {
		content = content[:2000] + "..."
	}

	return content
}

// cleanText cleans extracted text
func (wf *WebContentFetcher) cleanText(text string) string {
	// Decode HTML entities
	text = strings.ReplaceAll(text, "&amp;", "&")
	text = strings.ReplaceAll(text, "&lt;", "<")
	text = strings.ReplaceAll(text, "&gt;", ">")
	text = strings.ReplaceAll(text, "&quot;", "\"")
	text = strings.ReplaceAll(text, "&#39;", "'")
	text = strings.ReplaceAll(text, "&nbsp;", " ")

	// Remove excessive whitespace
	spaceRegex := regexp.MustCompile(`\s+`)
	text = spaceRegex.ReplaceAllString(text, " ")

	return strings.TrimSpace(text)
}

// search performs web search using embedded SearXNG functionality
func (s *PythonMCPServer) search(params map[string]interface{}) string {
	query, ok := params["query"].(string)
	if !ok {
		return "ERROR: Need 'query' parameter"
	}

	// Get optional num_results parameter
	numResults := 10
	if nr, ok := params["num_results"].(float64); ok {
		numResults = int(nr)
		if numResults < 1 {
			numResults = 1
		} else if numResults > 20 {
			numResults = 20
		}
	}

	// Create SearXNG manager
	manager := NewSearXNGManager()

	// Start SearXNG container if not running
	wasRunning := manager.CheckContainerRunning()
	if !wasRunning {
		if err := manager.StartContainer(); err != nil {
			return fmt.Sprintf("ERROR: Failed to start SearXNG: %v", err)
		}
	}

	// Perform search
	results, err := manager.SearchSearXNG(query, numResults)
	if err != nil {
		return fmt.Sprintf("ERROR: Search failed: %v", err)
	}

	// Format results
	var output strings.Builder
	output.WriteString(fmt.Sprintf("🔍 SEARCH RESULTS for: %s\n", query))
	output.WriteString(fmt.Sprintf("📊 Found %d results\n", results.NumberOfResults))
	output.WriteString("⚡ Privacy-focused search via SearXNG\n\n")

	for i, result := range results.Results {
		output.WriteString(fmt.Sprintf("%d. %s\n", i+1, result.Title))
		output.WriteString(fmt.Sprintf("   🔗 %s\n", result.URL))
		if result.Content != "" {
			content := strings.TrimSpace(result.Content)
			if len(content) > 150 {
				content = content[:150] + "..."
			}
			output.WriteString(fmt.Sprintf("   📝 %s\n", content))
		}
		if result.Engine != "" {
			output.WriteString(fmt.Sprintf("   🔍 Source: %s\n", result.Engine))
		}
		output.WriteString("\n")
	}

	if len(results.Suggestions) > 0 {
		output.WriteString(fmt.Sprintf("� Suggestions: %s\n", strings.Join(results.Suggestions, ", ")))
	}

	return output.String()
}

// fetchContent fetches and extracts content from a web page
// fetchContent fetches and extracts content from a web page using embedded functionality
func (s *PythonMCPServer) fetchContent(params map[string]interface{}) string {
	url, ok := params["url"].(string)
	if !ok {
		return "ERROR: Need 'url' parameter"
	}

	// Create web content fetcher
	fetcher := NewWebContentFetcher()

	// Fetch content
	result := fetcher.FetchContent(url)

	if result.Error != "" {
		return fmt.Sprintf("ERROR: %s", result.Error)
	}

	// Format output
	var output strings.Builder
	output.WriteString(fmt.Sprintf("🌐 WEB CONTENT EXTRACTED from: %s\n", result.URL))
	output.WriteString(fmt.Sprintf("✅ Successfully fetched content (Status: %d)\n", result.StatusCode))
	output.WriteString("📄 Smart content extraction with title, description, and main text\n\n")

	if result.Title != "" {
		output.WriteString(fmt.Sprintf("📰 Title: %s\n\n", result.Title))
	}

	if result.Description != "" {
		output.WriteString(fmt.Sprintf("📝 Description: %s\n\n", result.Description))
	}

	if result.Content != "" {
		output.WriteString(fmt.Sprintf("📄 Content:\n%s\n", result.Content))
	}

	return output.String()
}

// handleRequest processes requests
func (s *PythonMCPServer) handleRequest(req MCPRequest) MCPResponse {
	resp := MCPResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
	}

	switch req.Method {
	case "initialize":
		resp.Result = map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"serverInfo": map[string]interface{}{
				"name":    "python-mcp",
				"version": "5.1.0",
			},
			"capabilities": map[string]interface{}{
				"tools": map[string]interface{}{},
			},
		}

	case "tools/list":
		resp.Result = map[string]interface{}{
			"tools": s.getTools(),
		}

	case "tools/call":
		var params struct {
			Name      string                 `json:"name"`
			Arguments map[string]interface{} `json:"arguments"`
		}

		if err := json.Unmarshal(req.Params, &params); err != nil {
			resp.Error = &MCPError{Code: -32602, Message: "Invalid params"}
			return resp
		}

		var result string
		switch params.Name {
		case "py":
			result = s.py(params.Arguments)
		case "sh", "powershell": // Support both for compatibility
			result = s.sh(params.Arguments)
		case "pip":
			result = s.pip(params.Arguments)
		case "save":
			result = s.save(params.Arguments)
		case "load":
			result = s.load(params.Arguments)
		case "ls":
			result = s.ls(params.Arguments)
		case "open":
			result = s.open(params.Arguments)
		case "search":
			result = s.search(params.Arguments)
		case "fetch_content":
			result = s.fetchContent(params.Arguments)
		default:
			resp.Error = &MCPError{Code: -32603, Message: "Unknown tool"}
			return resp
		}

		resp.Result = map[string]interface{}{
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": result,
				},
			},
		}

	default:
		resp.Error = &MCPError{Code: -32601, Message: "Method not found"}
	}

	return resp
}

// runServer main loop
func (s *PythonMCPServer) runServer() {
	scanner := bufio.NewScanner(os.Stdin)
	encoder := json.NewEncoder(os.Stdout)

	for scanner.Scan() {
		var req MCPRequest
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			log.Printf("Parse error: %v", err)
			continue
		}

		resp := s.handleRequest(req)
		if err := encoder.Encode(resp); err != nil {
			log.Printf("Encode error: %v", err)
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		log.Printf("Scanner error: %v", err)
	}
}

func main() {
	log.SetOutput(os.Stderr)
	server := NewPythonMCPServer()
	server.runServer()
}
