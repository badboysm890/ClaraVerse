import React, { memo, useState, useRef } from 'react';
import { NodeProps } from 'reactflow';
import { FileText, Upload, File, CheckCircle, AlertCircle } from 'lucide-react';
import BaseNode from './BaseNode';

const PDFInputNode = memo<NodeProps>((props) => {
  const { data } = props;
  const [pdfFile, setPdfFile] = useState(data.pdfFile || '');
  const [maxPages, setMaxPages] = useState(data.maxPages || 50);
  const [preserveFormatting, setPreserveFormatting] = useState(data.preserveFormatting || false);
  const [fileName, setFileName] = useState(data.fileName || '');
  const [uploading, setUploading] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [metadata, setMetadata] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfFileChange = (value: string, name?: string) => {
    setPdfFile(value);
    if (name) setFileName(name);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, pdfFile: value, fileName: name || fileName } });
    }
  };

  const handleMaxPagesChange = (value: number) => {
    setMaxPages(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, maxPages: value } });
    }
  };

  const handlePreserveFormattingChange = (value: boolean) => {
    setPreserveFormatting(value);
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, preserveFormatting: value } });
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Please select a PDF file');
      return;
    }

    setUploading(true);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      setFileName(file.name);
      handlePdfFileChange(base64, file.name);
      
      // Simulate text extraction for preview
      try {
        const simulatedText = `PDF loaded: ${file.name}\n\nReal text extraction will happen during flow execution using PDF.js.\n\nFile info:\n- Size: ${(file.size / 1024).toFixed(1)} KB\n- Estimated pages: ${Math.ceil(file.size / 50000)}\n- Ready for processing`;
        setExtractedText(simulatedText);
        setMetadata({
          fileSize: file.size,
          fileName: file.name,
          estimatedPages: Math.ceil(file.size / 50000)
        });
      } catch (error) {
        console.error('Error processing PDF:', error);
      }
      
      setUploading(false);
    };
    
    reader.onerror = () => {
      setUploading(false);
      alert('Error reading PDF file');
    };
    
    reader.readAsArrayBuffer(file);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const clearPDF = () => {
    setPdfFile('');
    setFileName('');
    setExtractedText('');
    setMetadata(null);
    handlePdfFileChange('', '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileSizeDisplay = () => {
    if (!pdfFile) return '0 KB';
    // Rough estimate: base64 is about 1.33x larger than binary
    const bytes = (pdfFile.length * 0.75);
    if (bytes < 1024) return `${bytes.toFixed(0)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <BaseNode
      {...props}
      title="Load PDF"
      category="input"
      icon={<FileText className="w-4 h-4" />}
      inputs={data.inputs}
      outputs={data.outputs}
    >
      <div className="space-y-3">
        {/* PDF Upload Area */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            PDF Upload
          </label>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
          
          <div 
            onClick={handleUploadClick}
            className="w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors bg-gray-50 dark:bg-gray-700/50"
          >
            {uploading ? (
              <div className="text-center">
                <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-1"></div>
                <span className="text-xs text-gray-600 dark:text-gray-400">Processing PDF...</span>
              </div>
            ) : pdfFile ? (
              <div className="text-center w-full px-2">
                <File className="w-8 h-8 text-blue-500 mx-auto mb-1" />
                <div className="text-xs text-green-600 dark:text-green-400 font-medium truncate">
                  {fileName || 'PDF Loaded'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {getFileSizeDisplay()}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                <span className="text-xs text-gray-600 dark:text-gray-400">Click to upload PDF</span>
                <span className="text-xs text-gray-500 dark:text-gray-500 block">Supports PDF files only</span>
              </div>
            )}
          </div>
          
          {pdfFile && (
            <button
              onClick={clearPDF}
              className="w-full mt-2 px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded transition-colors"
            >
              Clear PDF
            </button>
          )}
        </div>

        {/* Processing Options */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            Processing Options
          </label>
          
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Max Pages to Process
            </label>
            <input
              type="number"
              min="1"
              max="200"
              value={maxPages}
              onChange={(e) => handleMaxPagesChange(parseInt(e.target.value) || 50)}
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="preserveFormatting"
              checked={preserveFormatting}
              onChange={(e) => handlePreserveFormattingChange(e.target.checked)}
              className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="preserveFormatting" className="text-xs text-gray-600 dark:text-gray-400">
              Preserve formatting
            </label>
          </div>
        </div>

        {/* Preview Section */}
        {extractedText && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Preview
            </label>
            <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded border text-xs">
              <div className="text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-500" />
                PDF Loaded Successfully
              </div>
              {metadata && (
                <div className="text-gray-500 dark:text-gray-500 text-xs space-y-0.5">
                  <div>File: {metadata.fileName}</div>
                  <div>Size: {(metadata.fileSize / 1024).toFixed(1)} KB</div>
                  <div>Est. Pages: {metadata.estimatedPages}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Feature Information */}
        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-2">
            <FileText className="w-3 h-3 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                PDF Text Extraction
              </h4>
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                Uses PDF.js to extract real text content from PDF documents. Supports both simple and formatted text extraction.
              </p>
            </div>
          </div>
        </div>

        {/* Input/Output Display */}
        <div className="space-y-2">
          {/* Outputs */}
          {data.outputs && data.outputs.length > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
              <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                Outputs
              </h5>
              {data.outputs.map((output: any, index: number) => (
                <div
                  key={output.id}
                  className="text-xs text-gray-600 dark:text-gray-400 mb-1 text-right"
                  style={{ marginTop: index === 0 ? 0 : '4px' }}
                >
                  <span className="font-medium">{output.name}</span>
                  <span className="text-gray-400 ml-1">({output.dataType})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
});

PDFInputNode.displayName = 'PDFInputNode';

export default PDFInputNode; 
