
import React, { useState } from 'react';
import { Customer } from '../../types';

interface QREntryProps {
  onComplete: (data: Partial<Customer>) => void;
}

const QREntry: React.FC<QREntryProps> = ({ onComplete }) => {
  const [isScanning, setIsScanning] = useState(false);

  const simulateScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      onComplete({
        name: 'Mobile User',
        lastNameInitial: 'QR',
        method: 'QR',
        loyaltyStatus: 'Member'
      });
    }, 2000);
  };

  return (
    <div className="w-full max-w-xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl text-center">
      <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">Scan QR Code</h2>
      <p className="text-zinc-400 mb-12">Scan your loyalty QR code from the Dope App or your email.</p>

      <div className="relative mb-12 aspect-square max-w-[300px] mx-auto bg-black rounded-3xl border-4 border-gold overflow-hidden">
        {isScanning ? (
           <div className="w-full h-full flex items-center justify-center">
             <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin"></div>
           </div>
        ) : (
          <div className="w-full h-full p-8 opacity-20 bg-zinc-800 flex items-center justify-center">
            <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v2h-3v-2zm-3 0h2v3h-2v-3zm3 3h3v5h-2v-3h-1v3h-2v-5zm-3 4h2v1h-2v-1zm1 1h1v1h-1v-1z" /></svg>
          </div>
        )}
        <div className="absolute top-0 left-0 w-full h-1 bg-gold shadow-[0_0_15px_#ceb185] animate-[scan_2s_ease-in-out_infinite]"></div>
      </div>

      <style>{`
        @keyframes scan {
          0%, 100% { top: 0; }
          50% { top: 100%; }
        }
      `}</style>

      <button
        onClick={simulateScan}
        className="bg-zinc-800 text-zinc-400 px-6 py-3 rounded-full hover:bg-zinc-700 transition-colors"
      >
        [ Simulator: Detected QR ]
      </button>
    </div>
  );
};

export default QREntry;
