import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, Check, Share2, Download } from 'lucide-react';
import { useState } from 'react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
}

export default function ShareModal({ isOpen, onClose, url }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQRCode = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = 'educonnect-qr.png';
      downloadLink.href = `${pngFile}`;
      downloadLink.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-[32px] p-8 max-w-sm w-full relative shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-600 to-blue-400" />
            
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Share2 size={32} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Share EduConnect</h3>
              <p className="text-slate-500 text-sm mt-1">Invite your students or colleagues to join the platform.</p>
            </div>

            <div className="bg-slate-50 p-6 rounded-3xl flex justify-center mb-6">
              <QRCodeSVG 
                id="qr-code-svg"
                value={url} 
                size={200} 
                level="H"
                includeMargin={true}
                className="rounded-xl shadow-inner border-4 border-white"
              />
            </div>

            <div className="space-y-4">
              <div className="flex gap-2 p-2 bg-slate-50 border border-slate-100 rounded-2xl">
                <input 
                  type="text" 
                  readOnly 
                  value={url}
                  className="bg-transparent border-none focus:ring-0 text-xs font-medium text-slate-500 flex-1 px-2 truncate"
                />
                <button 
                  onClick={handleCopy}
                  className="p-2 bg-white border border-slate-200 text-indigo-600 rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center min-w-[40px]"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>

              <button 
                onClick={downloadQRCode}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                <Download size={18} />
                Download QR Code
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
