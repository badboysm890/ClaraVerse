import React, { useState } from 'react';
import { ImageIcon, Download, Trash2, Eye } from 'lucide-react';
import ImageViewModal from './ImageViewModal';

interface GeneratedGalleryProps {
  generatedImages: string[];
  isGenerating: boolean;
  handleDownload: (imageDataUrl: string, index: number) => void;
  handleDelete: (index: number) => void;
}

const GeneratedGallery: React.FC<GeneratedGalleryProps> = ({
  generatedImages,
  isGenerating,
  handleDownload,
  handleDelete
}) => {
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  if (generatedImages.length === 0 && !isGenerating) {
    return (
      <div className="text-center py-16 border border-dashed rounded-lg border-gray-300 dark:border-gray-700">
        <div className="inline-flex items-center justify-center p-6 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
          <ImageIcon className="w-8 h-8 text-sakura-500" />
        </div>
        <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
          No images generated yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          Enter a description above and click Generate to create your first AI-powered image.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Generated Images</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[...generatedImages].reverse().map((image, index) => (
          <div key={index} className="glassmorphic rounded-xl overflow-hidden group relative">
            <img src={image} alt={`Generated ${generatedImages.length - index}`} className="w-full h-64 object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
              <button
                onClick={() => setViewingImage(image)}
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                title="View"
              >
                <Eye className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleDownload(image, generatedImages.length - 1 - index)}
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                title="Download"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleDelete(generatedImages.length - 1 - index)}
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                title="Delete"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <ImageViewModal
        imageUrl={viewingImage}
        onClose={() => setViewingImage(null)}
      />
    </div>
  );
};

export default GeneratedGallery;
