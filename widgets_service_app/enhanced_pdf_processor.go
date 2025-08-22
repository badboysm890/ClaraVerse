package main

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/ledongthuc/pdf"
)

// EnhancedFileParseResult represents the comprehensive result of PDF processing
type EnhancedFileParseResult struct {
	// Basic Info
	Filename     string            `json:"filename"`
	FileType     string            `json:"fileType"`
	Success      bool              `json:"success"`
	Error        string            `json:"error,omitempty"`
	ProcessTime  string            `json:"processTime"`
	
	// Content
	Text         string            `json:"text"`
	Pages        int               `json:"pages"`
	WordCount    int               `json:"wordCount"`
	
	// Enhanced PDF Features
	Metadata     PDFMetadata       `json:"metadata"`
	Images       []ExtractedImage  `json:"images,omitempty"`
	Forms        []FormField       `json:"forms,omitempty"`
	Tables       []ExtractedTable  `json:"tables,omitempty"`
	Annotations  []Annotation      `json:"annotations,omitempty"`
	Security     SecurityInfo      `json:"security"`
	Structure    DocumentStructure `json:"structure"`
	Quality      QualityAnalysis   `json:"quality"`
}

// PDFMetadata represents comprehensive PDF metadata
type PDFMetadata struct {
	Title        string            `json:"title"`
	Author       string            `json:"author"`
	Subject      string            `json:"subject"`
	Keywords     string            `json:"keywords"`
	Creator      string            `json:"creator"`
	Producer     string            `json:"producer"`
	CreationDate time.Time         `json:"creationDate"`
	ModDate      time.Time         `json:"modificationDate"`
	PDFVersion   string            `json:"pdfVersion"`
	PageCount    int               `json:"pageCount"`
	FileSize     int64             `json:"fileSize"`
	Custom       map[string]string `json:"customProperties"`
}

// ExtractedImage represents an image extracted from PDF
type ExtractedImage struct {
	ID           string  `json:"id"`
	Page         int     `json:"page"`
	Width        int     `json:"width"`
	Height       int     `json:"height"`
	Format       string  `json:"format"`
	Size         int64   `json:"size"`
	DPI          float64 `json:"dpi"`
	ColorSpace   string  `json:"colorSpace"`
	Base64Data   string  `json:"base64Data,omitempty"`
	Position     Position `json:"position"`
	IsInline     bool    `json:"isInline"`
}

// FormField represents a form field in the PDF
type FormField struct {
	Name         string      `json:"name"`
	Type         string      `json:"type"`
	Value        interface{} `json:"value"`
	Page         int         `json:"page"`
	Required     bool        `json:"required"`
	ReadOnly     bool        `json:"readOnly"`
	Options      []string    `json:"options,omitempty"`
	Position     Position    `json:"position"`
}

// ExtractedTable represents a table structure found in the PDF
type ExtractedTable struct {
	Page         int           `json:"page"`
	Rows         int           `json:"rows"`
	Columns      int           `json:"columns"`
	Headers      []string      `json:"headers,omitempty"`
	Data         [][]string    `json:"data"`
	Position     Position      `json:"position"`
	Confidence   float64       `json:"confidence"`
}

// Annotation represents annotations in the PDF
type Annotation struct {
	Type         string    `json:"type"`
	Page         int       `json:"page"`
	Content      string    `json:"content"`
	Author       string    `json:"author"`
	CreationDate time.Time `json:"creationDate"`
	Position     Position  `json:"position"`
	Color        string    `json:"color,omitempty"`
}

// SecurityInfo represents PDF security settings
type SecurityInfo struct {
	IsEncrypted       bool     `json:"isEncrypted"`
	HasUserPassword   bool     `json:"hasUserPassword"`
	HasOwnerPassword  bool     `json:"hasOwnerPassword"`
	Permissions       []string `json:"permissions"`
	EncryptionLevel   string   `json:"encryptionLevel"`
	IsPasswordNeeded  bool     `json:"isPasswordNeeded"`
}

// DocumentStructure represents the logical structure of the document
type DocumentStructure struct {
	HasBookmarks     bool            `json:"hasBookmarks"`
	BookmarkCount    int             `json:"bookmarkCount"`
	Bookmarks        []Bookmark      `json:"bookmarks,omitempty"`
	HasOutline       bool            `json:"hasOutline"`
	PageSizes        []PageSize      `json:"pageSizes"`
	FontsUsed        []FontInfo      `json:"fontsUsed"`
	IsTaggedPDF      bool            `json:"isTaggedPDF"`
	AccessibilityInfo AccessibilityInfo `json:"accessibility"`
}

// QualityAnalysis represents analysis of PDF quality
type QualityAnalysis struct {
	OverallScore     float64         `json:"overallScore"`
	TextQuality      float64         `json:"textQuality"`
	ImageQuality     float64         `json:"imageQuality"`
	StructureQuality float64         `json:"structureQuality"`
	Issues           []QualityIssue  `json:"issues,omitempty"`
	Recommendations  []string        `json:"recommendations,omitempty"`
}

// Supporting types
type Position struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type Bookmark struct {
	Title    string     `json:"title"`
	Page     int        `json:"page"`
	Level    int        `json:"level"`
	Children []Bookmark `json:"children,omitempty"`
}

type PageSize struct {
	Page   int     `json:"page"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	Units  string  `json:"units"`
}

type FontInfo struct {
	Name       string  `json:"name"`
	Type       string  `json:"type"`
	Embedded   bool    `json:"embedded"`
	Subset     bool    `json:"subset"`
	Pages      []int   `json:"pages"`
}

type AccessibilityInfo struct {
	IsAccessible     bool     `json:"isAccessible"`
	HasStructureTags bool     `json:"hasStructureTags"`
	HasAltText       bool     `json:"hasAltText"`
	Issues           []string `json:"issues,omitempty"`
}

type QualityIssue struct {
	Type        string  `json:"type"`
	Severity    string  `json:"severity"`
	Description string  `json:"description"`
	Page        int     `json:"page,omitempty"`
	Impact      float64 `json:"impact"`
}

// EnhancedPDFProcessor handles comprehensive PDF processing
type EnhancedPDFProcessor struct {
	config ProcessorConfig
}

type ProcessorConfig struct {
	ExtractImages     bool
	AnalyzeTables     bool
	ExtractForms      bool
	ExtractText       bool
	PerformOCR        bool
	AnalyzeQuality    bool
	MaxImageSize      int64
	ImageFormats      []string
}

// NewEnhancedPDFProcessor creates a new enhanced PDF processor
func NewEnhancedPDFProcessor() *EnhancedPDFProcessor {
	return &EnhancedPDFProcessor{
		config: ProcessorConfig{
			ExtractImages:  true,
			AnalyzeTables:  true,
			ExtractForms:   true,
			ExtractText:    true,
			PerformOCR:     false,
			AnalyzeQuality: true,
			MaxImageSize:   5 << 20, // 5MB
			ImageFormats:   []string{"jpeg", "png", "tiff"},
		},
	}
}

// ProcessPDF processes a PDF file comprehensively
func (ep *EnhancedPDFProcessor) ProcessPDF(fileHeader *multipart.FileHeader, fileData []byte) (*EnhancedFileParseResult, error) {
	startTime := time.Now()
	filename := fileHeader.Filename

	result := &EnhancedFileParseResult{
		Filename: filename,
		FileType: "pdf",
		Metadata: PDFMetadata{
			FileSize: int64(len(fileData)),
			Custom:   make(map[string]string),
		},
		Images:      []ExtractedImage{},
		Forms:       []FormField{},
		Tables:      []ExtractedTable{},
		Annotations: []Annotation{},
		Security:    SecurityInfo{},
		Structure:   DocumentStructure{},
		Quality:     QualityAnalysis{},
	}

	// Validate PDF
	if !ep.isValidPDF(fileData) {
		result.Success = false
		result.Error = "Invalid PDF file format"
		result.ProcessTime = time.Since(startTime).String()
		return result, fmt.Errorf("invalid PDF file format")
	}

	reader := bytes.NewReader(fileData)

	// Step 1: Extract comprehensive text and metadata
	if err := ep.extractTextAndMetadata(reader, result); err != nil {
		log.Printf("Text extraction error: %v", err)
		result.Error = err.Error()
	}

	// Step 2: Analyze security
	ep.analyzeSecurity(fileData, result)

	// Step 3: Analyze document structure
	ep.analyzeDocumentStructure(result)

	// Step 4: Detect tables (basic pattern recognition)
	if ep.config.AnalyzeTables {
		ep.detectTables(result)
	}

	// Step 5: Perform quality analysis
	if ep.config.AnalyzeQuality {
		ep.performQualityAnalysis(result)
	}

	// Calculate final metrics
	result.WordCount = len(strings.Fields(result.Text))
	result.ProcessTime = time.Since(startTime).String()
	result.Success = result.Error == ""

	return result, nil
}

// isValidPDF checks if the data represents a valid PDF file
func (ep *EnhancedPDFProcessor) isValidPDF(data []byte) bool {
	if len(data) < 4 {
		return false
	}
	return string(data[:4]) == "%PDF"
}

// extractTextAndMetadata extracts text and metadata comprehensively
func (ep *EnhancedPDFProcessor) extractTextAndMetadata(reader io.ReadSeeker, result *EnhancedFileParseResult) error {
	reader.Seek(0, io.SeekStart)
	
	// Read all data for metadata extraction
	data, err := io.ReadAll(reader)
	if err != nil {
		return fmt.Errorf("failed to read PDF data: %v", err)
	}
	
	// Create new bytes reader for PDF parsing
	bytesReader := bytes.NewReader(data)
	pdfReader, err := pdf.NewReader(bytesReader, int64(len(data)))
	if err != nil {
		return fmt.Errorf("failed to open PDF: %v", err)
	}

	result.Pages = pdfReader.NumPage()
	result.Metadata.PageCount = pdfReader.NumPage()

	// Extract basic metadata from PDF structure
	contentStr := string(data)
	result.Metadata.Title = ep.extractStringFromPDF(contentStr, "Title")
	result.Metadata.Author = ep.extractStringFromPDF(contentStr, "Author")
	result.Metadata.Subject = ep.extractStringFromPDF(contentStr, "Subject")
	result.Metadata.Creator = ep.extractStringFromPDF(contentStr, "Creator")
	result.Metadata.Producer = ep.extractStringFromPDF(contentStr, "Producer")
	result.Metadata.Keywords = ep.extractStringFromPDF(contentStr, "Keywords")

	var textBuilder strings.Builder
	pageSizes := []PageSize{}
	successfulPages := 0
	totalAttemptedPages := 0
	var extractionErrors []string

	// Enhanced text extraction with better error handling
	for i := 1; i <= pdfReader.NumPage(); i++ {
		totalAttemptedPages++
		page := pdfReader.Page(i)
		if page.V.IsNull() {
			extractionErrors = append(extractionErrors, fmt.Sprintf("Page %d: Null page object", i))
			continue
		}

		// Default page size (would need more parsing for actual dimensions)
		pageSizes = append(pageSizes, PageSize{
			Page:   i,
			Width:  612.0,
			Height: 792.0,
			Units:  "points",
		})

		// Enhanced text extraction with multiple attempts
		fonts := make(map[string]*pdf.Font)
		pageText, err := page.GetPlainText(fonts)
		if err != nil {
			// Fallback without font map
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
		}
	}

	result.Text = textBuilder.String()
	result.Structure.PageSizes = pageSizes

	// Add extraction diagnostics to metadata
	result.Metadata.Custom["pagesExtracted"] = fmt.Sprintf("%d/%d", successfulPages, totalAttemptedPages)
	result.Metadata.Custom["extractionErrors"] = fmt.Sprintf("%d", len(extractionErrors))

	if len(extractionErrors) > 0 && len(extractionErrors) < 5 {
		for i, errMsg := range extractionErrors {
			result.Metadata.Custom[fmt.Sprintf("error_%d", i+1)] = errMsg
		}
	}

	return nil
}

// extractStringFromPDF extracts metadata strings from PDF raw content
func (ep *EnhancedPDFProcessor) extractStringFromPDF(content, field string) string {
	// Simple regex-based extraction for basic metadata
	pattern := fmt.Sprintf(`/%s\s*\(([^)]+)\)`, field)
	re := regexp.MustCompile(pattern)
	matches := re.FindStringSubmatch(content)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}
	
	// Try alternative pattern
	pattern = fmt.Sprintf(`/%s\s*<([^>]+)>`, field)
	re = regexp.MustCompile(pattern)
	matches = re.FindStringSubmatch(content)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}
	
	return "Unknown"
}

// analyzeSecurity performs basic security analysis
func (ep *EnhancedPDFProcessor) analyzeSecurity(data []byte, result *EnhancedFileParseResult) {
	content := string(data)
	
	// Check for encryption markers
	result.Security.IsEncrypted = strings.Contains(content, "/Encrypt")
	result.Security.IsPasswordNeeded = false // We were able to read it
	
	// Check for security handlers
	if strings.Contains(content, "/Filter/Standard") {
		result.Security.EncryptionLevel = "Standard"
	}
	
	// Default permissions if not encrypted
	result.Security.Permissions = []string{"print", "modify", "copy", "annotate"}
	
	if result.Security.IsEncrypted {
		result.Security.Permissions = []string{"limited"}
	}
}

// analyzeDocumentStructure analyzes document structure
func (ep *EnhancedPDFProcessor) analyzeDocumentStructure(result *EnhancedFileParseResult) {
	// Basic structure analysis
	result.Structure.HasBookmarks = false
	result.Structure.BookmarkCount = 0
	result.Structure.HasOutline = false
	result.Structure.IsTaggedPDF = false
	result.Structure.FontsUsed = []FontInfo{}
	
	// Accessibility analysis
	result.Structure.AccessibilityInfo = AccessibilityInfo{
		IsAccessible:     false,
		HasStructureTags: false,
		HasAltText:       false,
		Issues:           []string{},
	}
	
	if !result.Structure.IsTaggedPDF {
		result.Structure.AccessibilityInfo.Issues = append(result.Structure.AccessibilityInfo.Issues, "Document is not tagged for accessibility")
	}
}

// detectTables performs basic table detection using text patterns
func (ep *EnhancedPDFProcessor) detectTables(result *EnhancedFileParseResult) {
	tables := []ExtractedTable{}
	
	// Simple table detection based on text patterns
	lines := strings.Split(result.Text, "\n")
	currentTable := ExtractedTable{}
	inTable := false
	
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			if inTable {
				// End of table
				if len(currentTable.Data) > 1 {
					currentTable.Rows = len(currentTable.Data)
					currentTable.Confidence = 0.7 // Basic confidence
					tables = append(tables, currentTable)
				}
				currentTable = ExtractedTable{}
				inTable = false
			}
			continue
		}
		
		// Detect potential table rows (multiple words/numbers separated by spaces)
		parts := strings.Fields(line)
		if len(parts) >= 3 && !strings.HasPrefix(line, "===") {
			if !inTable {
				inTable = true
				currentTable.Page = ep.getPageFromLine(i, lines)
				currentTable.Columns = len(parts)
				currentTable.Headers = parts
			} else {
				currentTable.Data = append(currentTable.Data, parts)
			}
		} else {
			if inTable {
				// End of table
				if len(currentTable.Data) > 1 {
					currentTable.Rows = len(currentTable.Data)
					currentTable.Confidence = 0.7
					tables = append(tables, currentTable)
				}
				currentTable = ExtractedTable{}
				inTable = false
			}
		}
	}
	
	result.Tables = tables
}

// getPageFromLine estimates page number from line position
func (ep *EnhancedPDFProcessor) getPageFromLine(lineIndex int, lines []string) int {
	page := 1
	for i := 0; i < lineIndex && i < len(lines); i++ {
		if strings.HasPrefix(lines[i], "=== Page ") {
			page++
		}
	}
	return page
}

// performQualityAnalysis performs comprehensive quality analysis
func (ep *EnhancedPDFProcessor) performQualityAnalysis(result *EnhancedFileParseResult) {
	quality := &result.Quality
	issues := []QualityIssue{}
	recommendations := []string{}

	// Text quality analysis
	textQuality := 1.0
	if result.Text == "" {
		textQuality = 0.0
		issues = append(issues, QualityIssue{
			Type:        "no_text",
			Severity:    "high",
			Description: "No extractable text found in PDF",
			Impact:      0.8,
		})
		recommendations = append(recommendations, "Consider using OCR for scanned documents")
	} else {
		wordCount := len(strings.Fields(result.Text))
		if wordCount < 10 {
			textQuality = 0.3
			issues = append(issues, QualityIssue{
				Type:        "minimal_text",
				Severity:    "medium",
				Description: "Very little text content detected",
				Impact:      0.4,
			})
		} else if wordCount < 100 {
			textQuality = 0.7
		}
		
		// Check for encoding issues
		if strings.Contains(result.Text, "?") && strings.Count(result.Text, "?") > wordCount/10 {
			textQuality *= 0.8
			issues = append(issues, QualityIssue{
				Type:        "encoding_issues",
				Severity:    "medium",
				Description: "Possible text encoding issues detected",
				Impact:      0.2,
			})
		}
	}

	// Structure quality analysis
	structureQuality := 1.0
	if !result.Structure.HasBookmarks && result.Pages > 10 {
		structureQuality -= 0.2
		recommendations = append(recommendations, "Consider adding bookmarks for better navigation")
	}
	
	if !result.Structure.IsTaggedPDF {
		structureQuality -= 0.3
		issues = append(issues, QualityIssue{
			Type:        "accessibility",
			Severity:    "medium",
			Description: "PDF is not tagged for accessibility",
			Impact:      0.3,
		})
		recommendations = append(recommendations, "Consider creating tagged PDF for accessibility")
	}

	// Image quality analysis
	imageQuality := 0.8 // Default assuming no images or good quality

	// Security analysis
	if result.Security.IsEncrypted {
		issues = append(issues, QualityIssue{
			Type:        "password_protected",
			Severity:    "info",
			Description: "PDF is password protected",
			Impact:      0.0,
		})
	}

	// Page analysis
	if result.Pages > 100 {
		recommendations = append(recommendations, "Consider splitting large document for better performance")
	}

	// Table analysis
	if len(result.Tables) > 0 {
		structureQuality += 0.1
		result.Metadata.Custom["tablesDetected"] = fmt.Sprintf("%d", len(result.Tables))
	}

	// Calculate overall score
	overallScore := (textQuality*0.5 + structureQuality*0.3 + imageQuality*0.2)

	quality.OverallScore = overallScore
	quality.TextQuality = textQuality
	quality.ImageQuality = imageQuality
	quality.StructureQuality = structureQuality
	quality.Issues = issues
	quality.Recommendations = recommendations
}

// GetSupportedFormats returns supported formats
func (ep *EnhancedPDFProcessor) GetSupportedFormats() []string {
	return []string{"pdf"}
}

// ValidateFile validates if the file can be processed
func (ep *EnhancedPDFProcessor) ValidateFile(filename string) bool {
	return strings.ToLower(filepath.Ext(filename)) == ".pdf"
}
