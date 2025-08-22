import * as React from 'react';

interface TourModalProps {
  open: boolean;
  onClose: () => void;
  tourUrl: string;
  title?: string;
}

const TourModal = ({ open, onClose, tourUrl, title }: TourModalProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border border-white/30 dark:border-gray-700/40 shadow-2xl rounded-2xl p-6 max-w-3xl w-full relative glassmorphic-modal"
        style={{ boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)' }}
      >
        <button
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-900 dark:hover:text-white bg-white/40 dark:bg-gray-800/40 rounded-full p-1"
          onClick={onClose}
        >
          ✕
        </button>
        {title && <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white drop-shadow">{title}</h2>}
        <div style={{ position: 'relative', boxSizing: 'content-box', maxHeight: '80vh', width: '100%', aspectRatio: '1.6', padding: '40px 0' }}>
          <iframe
            src={tourUrl}
            loading="lazy"
            title={title || "angela Tour"}
            allow="clipboard-write"
            frameBorder="0"
            webkitallowfullscreen="true"
            mozallowfullscreen="true"
            allowFullScreen
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '1rem', background: 'rgba(255,255,255,0.1)' }}
          />
        </div>
      </div>
    </div>
  );
};

export default TourModal; 
