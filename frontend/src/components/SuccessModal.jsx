import { useEffect } from 'react';

const SuccessModal = ({ isOpen, onClose, title, message, autoClose = true }) => {
  useEffect(() => {
    if (isOpen && autoClose) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000); 
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose, autoClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-[#09091e] border border-[#b5b3b3]/20 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full">
          <svg 
            className="w-8 h-8 text-green-400" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M5 13l4 4L19 7" 
            />
          </svg>
        </div>
        
        <div className="text-center">
          <h3 className="text-xl font-semibold text-[#b5b3b3] mb-2">
            {title}
          </h3>
          <p className="text-[#b5b3b3] opacity-80 mb-6">
            {message}
          </p>
          
          <div className="flex items-center justify-center space-x-2 text-sm text-[#b5b3b3] opacity-60">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle 
                className="opacity-25" 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="4"
              />
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading dashboard...</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuccessModal;