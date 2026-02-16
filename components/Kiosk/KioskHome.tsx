
import React, { useState, useEffect, useRef } from 'react';
import { Logo, GoldButton } from '../Branding';
import { Customer, CheckInMethod } from '../../types';
import IDScan from './IDScan';
import PhoneEntry from './PhoneEntry';
import GuestEntry from './GuestEntry';
import QREntry from './QREntry';

interface KioskHomeProps {
  onCheckIn: (data: Partial<Customer>) => void;
  lastCheckIn: Customer | null;
}

const KioskHome: React.FC<KioskHomeProps> = ({ onCheckIn, lastCheckIn }) => {
  const [activeScreen, setActiveScreen] = useState<'HOME' | CheckInMethod>('HOME');
  const prevLastCheckIn = useRef<Customer | null>(null);

  // Auto-return to home screen after check-in confirmation clears
  useEffect(() => {
    if (prevLastCheckIn.current && !lastCheckIn) {
      setActiveScreen('HOME');
    }
    prevLastCheckIn.current = lastCheckIn;
  }, [lastCheckIn]);

  const handleBack = () => setActiveScreen('HOME');

  if (lastCheckIn) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#1a1a1a] animate-in fade-in zoom-in duration-500">
        <div className="bg-zinc-800 p-12 rounded-3xl border-2 border-gold text-center max-w-xl shadow-2xl">
          <div className="text-6xl mb-6">✅</div>
          <h1 className="text-4xl font-craft font-bold text-gold mb-4">Checked In!</h1>
          <p className="text-2xl text-zinc-300 mb-8">
            Welcome, <span className="font-bold text-white">{lastCheckIn.name}</span>.
          </p>
          <p className="text-lg text-zinc-400">Please watch the screen in the lounge. We'll be with you shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative h-full">
      {/* Background Decor */}
      <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center overflow-hidden">
        <Logo size="xl" />
      </div>

      <div className="z-10 flex flex-col h-full">
        {activeScreen === 'HOME' ? (
          <>
            <div className="pt-20 pb-12 text-center">
              <Logo size="lg" />
              <h2 className="mt-8 text-3xl font-craft text-gold tracking-widest">Select Check-In Method</h2>
              <p className="text-zinc-400 mt-2 font-light">Fast & easy entry to our dispensary</p>
            </div>

            <div className="flex-1 px-10 pb-20 grid grid-cols-2 gap-8 max-w-5xl mx-auto w-full">
              <GoldButton 
                label="Quick ID Scan" 
                onClick={() => setActiveScreen('ID_SCAN')}
                icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" /></svg>}
              />
              <GoldButton 
                label="Loyalty Members" 
                onClick={() => setActiveScreen('PHONE')}
                secondary
                icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
              />
              <GoldButton 
                label="QR Code Entry" 
                onClick={() => setActiveScreen('QR')}
                secondary
                icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>}
              />
              <GoldButton 
                label="Guest Check-In" 
                onClick={() => setActiveScreen('GUEST')}
                secondary
                icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col p-10 animate-in slide-in-from-right-10 duration-300">
            <button 
              onClick={handleBack}
              className="mb-8 flex items-center gap-2 text-gold font-craft text-xl hover:text-white transition-colors"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              Go Back
            </button>
            
            <div className="flex-1 flex items-center justify-center">
              {activeScreen === 'ID_SCAN' && <IDScan onComplete={onCheckIn} />}
              {activeScreen === 'PHONE' && <PhoneEntry onComplete={onCheckIn} />}
              {activeScreen === 'GUEST' && <GuestEntry onComplete={onCheckIn} />}
              {activeScreen === 'QR' && <QREntry onComplete={onCheckIn} />}
            </div>
          </div>
        )}
      </div>

      <footer className="p-6 text-center text-zinc-600 text-xs font-craft tracking-widest bg-black/30">
        &copy; {new Date().getFullYear()} Craft Cannabis • Elevate Your Experience
      </footer>
    </div>
  );
};

export default KioskHome;
