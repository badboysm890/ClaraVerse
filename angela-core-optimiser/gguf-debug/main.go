package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// GGUF value types from the official specification
const (
	GGUF_TYPE_UINT8   = 0
	GGUF_TYPE_INT8    = 1
	GGUF_TYPE_UINT16  = 2
	GGUF_TYPE_INT16   = 3
	GGUF_TYPE_UINT32  = 4
	GGUF_TYPE_INT32   = 5
	GGUF_TYPE_FLOAT32 = 6
	GGUF_TYPE_BOOL    = 7
	GGUF_TYPE_STRING  = 8
	GGUF_TYPE_ARRAY   = 9
	GGUF_TYPE_UINT64  = 10
	GGUF_TYPE_INT64   = 11
	GGUF_TYPE_FLOAT64 = 12
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("🔍 GGUF Parser Investigation Tool")
		fmt.Println("Usage: go run main.go <path_to_gguf_file>")
		fmt.Println("Example: go run main.go \"C:\\Users\\Admin\\.angela\\llama-modelsss\\Qwen\\Qwen_Qwen3-30B-A3B-Instruct-2507-Q5_K_M.gguf\"")
		return
	}

	modelPath := os.Args[1]
	fmt.Printf("🔍 GGUF Parser Investigation for: %s\n", filepath.Base(modelPath))
	fmt.Printf("Full path: %s\n\n", modelPath)

	err := investigateGGUF(modelPath)
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		return
	}
}

func investigateGGUF(modelPath string) error {
	file, err := os.Open(modelPath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	// Read GGUF header
	fmt.Println("📋 STEP 1: Reading GGUF Header")
	var magic [4]byte
	if _, err := file.Read(magic[:]); err != nil {
		return fmt.Errorf("failed to read magic: %w", err)
	}

	fmt.Printf("  Magic: %s\n", string(magic[:]))
	if string(magic[:]) != "GGUF" {
		return fmt.Errorf("not a GGUF file")
	}

	// Read version
	var version uint32
	if err := binary.Read(file, binary.LittleEndian, &version); err != nil {
		return fmt.Errorf("failed to read version: %w", err)
	}
	fmt.Printf("  Version: %d\n", version)

	// Read tensor count
	var tensorCount uint64
	if err := binary.Read(file, binary.LittleEndian, &tensorCount); err != nil {
		return fmt.Errorf("failed to read tensor count: %w", err)
	}
	fmt.Printf("  Tensor count: %d\n", tensorCount)

	// Read metadata count
	var metadataCount uint64
	if err := binary.Read(file, binary.LittleEndian, &metadataCount); err != nil {
		return fmt.Errorf("failed to read metadata count: %w", err)
	}
	fmt.Printf("  Metadata entries: %d\n\n", metadataCount)

	// Read metadata entries with detailed debugging
	fmt.Println("📋 STEP 2: Reading Metadata Entries")
	successCount := 0
	failedEntries := []int{}
	importantData := make(map[string]interface{})

	for i := uint64(0); i < metadataCount && i < 15; i++ { // Limit to first 15 entries
		fmt.Printf("  Entry %d: ", i)

		// Get current file position for debugging
		pos, _ := file.Seek(0, 1)

		key, value, err := readGGUFMetadataEntryDebug(file, i)
		if err != nil {
			fmt.Printf("❌ FAILED - %v (at position %d)\n", err, pos)
			failedEntries = append(failedEntries, int(i))

			// Try to recover by seeking ahead
			if strings.Contains(err.Error(), "key length too large") {
				file.Seek(pos+16, 0)
			} else {
				file.Seek(pos+8, 0)
			}
			continue
		}

		fmt.Printf("✅ SUCCESS - %s = %s\n", key, formatValue(value))
		successCount++

		// Store important metadata
		if isImportantKey(key) {
			fmt.Printf("    ⭐ IMPORTANT: %s = %v\n", key, value)
			importantData[key] = value
		}
	}

	fmt.Printf("\n📊 SUMMARY:\n")
	fmt.Printf("  Successful entries: %d/%d\n", successCount, minInt(15, int(metadataCount)))
	fmt.Printf("  Failed entries: %v\n", failedEntries)

	fmt.Println("\n🎯 IMPORTANT DATA FOUND:")
	for key, value := range importantData {
		fmt.Printf("  %s: %v\n", key, value)
	}

	if successCount == 0 {
		fmt.Println("\n🔥 CRITICAL: No metadata entries parsed successfully!")
		return investigateRawBytes(file)
	}

	return nil
}

func readGGUFMetadataEntryDebug(file *os.File, entryIndex uint64) (string, interface{}, error) {
	// Read key length
	var keyLen uint64
	if err := binary.Read(file, binary.LittleEndian, &keyLen); err != nil {
		return "", nil, fmt.Errorf("failed to read key length: %w", err)
	}

	// Debug output for problematic entries
	if keyLen > 1024 {
		pos, _ := file.Seek(0, 1)
		fmt.Printf("\n    🔍 DEBUG: keyLen=%d at pos=%d\n", keyLen, pos-8)

		// Let's try reading as different types to see what's actually there
		file.Seek(-8, 1) // Go back
		var keyLenUint32 uint32
		binary.Read(file, binary.LittleEndian, &keyLenUint32)
		fmt.Printf("    As uint32: %d\n", keyLenUint32)

		file.Seek(-4, 1) // Go back again
		var keyLenUint16 uint16
		binary.Read(file, binary.LittleEndian, &keyLenUint16)
		fmt.Printf("    As uint16: %d\n", keyLenUint16)

		return "", nil, fmt.Errorf("key length too large: %d", keyLen)
	}

	if keyLen == 0 {
		return "", nil, fmt.Errorf("key length is 0")
	}

	// Read key string
	keyBytes := make([]byte, keyLen)
	if _, err := file.Read(keyBytes); err != nil {
		return "", nil, fmt.Errorf("failed to read key: %w", err)
	}
	key := string(keyBytes)

	// Validate key string
	if !isValidKey(key) {
		return "", nil, fmt.Errorf("invalid key format: %q", key)
	}

	// Read value type
	var valueType uint32
	if err := binary.Read(file, binary.LittleEndian, &valueType); err != nil {
		return "", nil, fmt.Errorf("failed to read value type: %w", err)
	}

	// Parse value based on type
	value, err := readValueByType(file, valueType)
	if err != nil {
		return "", nil, fmt.Errorf("failed to read value (type %d): %w", valueType, err)
	}

	return key, value, nil
}

func readValueByType(file *os.File, valueType uint32) (interface{}, error) {
	switch valueType {
	case GGUF_TYPE_UINT8:
		var val uint8
		err := binary.Read(file, binary.LittleEndian, &val)
		return uint64(val), err
	case GGUF_TYPE_INT8:
		var val int8
		err := binary.Read(file, binary.LittleEndian, &val)
		return int64(val), err
	case GGUF_TYPE_UINT16:
		var val uint16
		err := binary.Read(file, binary.LittleEndian, &val)
		return uint64(val), err
	case GGUF_TYPE_INT16:
		var val int16
		err := binary.Read(file, binary.LittleEndian, &val)
		return int64(val), err
	case GGUF_TYPE_UINT32:
		var val uint32
		err := binary.Read(file, binary.LittleEndian, &val)
		return uint64(val), err
	case GGUF_TYPE_INT32:
		var val int32
		err := binary.Read(file, binary.LittleEndian, &val)
		return int64(val), err
	case GGUF_TYPE_FLOAT32:
		var val float32
		err := binary.Read(file, binary.LittleEndian, &val)
		return float64(val), err
	case GGUF_TYPE_BOOL:
		var val uint8
		err := binary.Read(file, binary.LittleEndian, &val)
		return val != 0, err
	case GGUF_TYPE_STRING:
		return readStringValue(file)
	case GGUF_TYPE_ARRAY:
		return readArrayValue(file)
	case GGUF_TYPE_UINT64:
		var val uint64
		err := binary.Read(file, binary.LittleEndian, &val)
		return val, err
	case GGUF_TYPE_INT64:
		var val int64
		err := binary.Read(file, binary.LittleEndian, &val)
		return val, err
	case GGUF_TYPE_FLOAT64:
		var val float64
		err := binary.Read(file, binary.LittleEndian, &val)
		return val, err
	default:
		return nil, fmt.Errorf("unsupported value type: %d", valueType)
	}
}

func readStringValue(file *os.File) (string, error) {
	var strLen uint64
	if err := binary.Read(file, binary.LittleEndian, &strLen); err != nil {
		return "", err
	}

	if strLen > 10240 { // 10KB limit
		return "", fmt.Errorf("string too large: %d", strLen)
	}

	strBytes := make([]byte, strLen)
	if _, err := file.Read(strBytes); err != nil {
		return "", err
	}

	return string(strBytes), nil
}

func readArrayValue(file *os.File) (interface{}, error) {
	// Read array type
	var arrayType uint32
	if err := binary.Read(file, binary.LittleEndian, &arrayType); err != nil {
		return nil, err
	}

	// Read array length
	var arrayLen uint64
	if err := binary.Read(file, binary.LittleEndian, &arrayLen); err != nil {
		return nil, err
	}

	if arrayLen > 1000000 { // 1M elements limit
		return nil, fmt.Errorf("array too large: %d elements", arrayLen)
	}

	// For now, just skip the array data
	err := skipArrayData(file, arrayType, arrayLen)
	if err != nil {
		return nil, err
	}

	return fmt.Sprintf("array[%d] of type %d", arrayLen, arrayType), nil
}

func skipArrayData(file *os.File, arrayType uint32, arrayLen uint64) error {
	switch arrayType {
	case GGUF_TYPE_UINT8, GGUF_TYPE_INT8, GGUF_TYPE_BOOL:
		_, err := file.Seek(int64(arrayLen), 1)
		return err
	case GGUF_TYPE_UINT16, GGUF_TYPE_INT16:
		_, err := file.Seek(int64(arrayLen)*2, 1)
		return err
	case GGUF_TYPE_UINT32, GGUF_TYPE_INT32, GGUF_TYPE_FLOAT32:
		_, err := file.Seek(int64(arrayLen)*4, 1)
		return err
	case GGUF_TYPE_UINT64, GGUF_TYPE_INT64, GGUF_TYPE_FLOAT64:
		_, err := file.Seek(int64(arrayLen)*8, 1)
		return err
	case GGUF_TYPE_STRING:
		// String arrays - read each string length and skip
		for i := uint64(0); i < arrayLen; i++ {
			var strLen uint64
			if err := binary.Read(file, binary.LittleEndian, &strLen); err != nil {
				return err
			}
			if strLen > 10240 {
				return fmt.Errorf("string in array too large: %d", strLen)
			}
			_, err := file.Seek(int64(strLen), 1)
			if err != nil {
				return err
			}
		}
		return nil
	default:
		return fmt.Errorf("unsupported array type for skipping: %d", arrayType)
	}
}

func isValidKey(key string) bool {
	if len(key) == 0 || len(key) > 200 {
		return false
	}

	// Check for valid UTF-8 and printable characters
	for _, r := range key {
		if r < 32 || r > 126 {
			return false
		}
	}

	// Check for common GGUF key patterns
	return strings.Contains(key, ".") ||
		strings.HasPrefix(key, "general") ||
		strings.HasPrefix(key, "llama") ||
		strings.HasPrefix(key, "tokenizer") ||
		len(key) < 50
}

func isImportantKey(key string) bool {
	importantKeys := []string{
		"general.parameter_count",
		"llama.context_length",
		"llama.embedding_length",
		"llama.block_count",
		"general.quantization_version",
		"general.architecture",
		"llama.attention.head_count",
		"llama.attention.head_count_kv",
		"general.file_type",
		"general.name",
	}

	for _, important := range importantKeys {
		if key == important {
			return true
		}
	}
	return false
}

func formatValue(value interface{}) string {
	switch v := value.(type) {
	case string:
		if len(v) > 50 {
			return fmt.Sprintf("\"%.50s...\"", v)
		}
		return fmt.Sprintf("\"%s\"", v)
	case uint64:
		return fmt.Sprintf("%d", v)
	case int64:
		return fmt.Sprintf("%d", v)
	case float64:
		return fmt.Sprintf("%.6f", v)
	case bool:
		return fmt.Sprintf("%t", v)
	default:
		return fmt.Sprintf("%v", v)
	}
}

func investigateRawBytes(file *os.File) error {
	fmt.Println("\n🔬 STEP 3: Raw Byte Investigation")

	// Seek to beginning of metadata
	file.Seek(16, 0) // Skip magic(4) + version(4) + tensor_count(8)

	var metadataCount uint64
	binary.Read(file, binary.LittleEndian, &metadataCount)

	fmt.Printf("Starting metadata analysis at file position: %d\n", 24)

	// Read first 128 bytes to see the pattern
	pos, _ := file.Seek(0, 1)
	fmt.Printf("Current position: %d\n", pos)

	bytes := make([]byte, 128)
	n, err := file.Read(bytes)
	if err != nil {
		return err
	}

	fmt.Printf("First %d bytes of metadata (hex):\n", n)
	for i := 0; i < n; i += 16 {
		end := i + 16
		if end > n {
			end = n
		}
		fmt.Printf("  %04x: ", i)
		for j := i; j < end; j++ {
			fmt.Printf("%02x ", bytes[j])
		}
		fmt.Printf(" | ")
		for j := i; j < end; j++ {
			if bytes[j] >= 32 && bytes[j] <= 126 {
				fmt.Printf("%c", bytes[j])
			} else {
				fmt.Printf(".")
			}
		}
		fmt.Println()
	}

	return nil
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
