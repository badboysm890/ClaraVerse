import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker with static path
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export async function readPdfContent(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }
  
  return fullText;
} 
