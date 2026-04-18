
import React, { useState, useEffect, useRef } from 'react';
import { Logo, GoldButton } from '../Branding';
import { Customer, CheckInMethod } from '../../types';
import { getShowHomeInfoPanel, isElectron } from '../../services/kioskApi';
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
  const [pendingScanData, setPendingScanData] = useState<string | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const prevLastCheckIn = useRef<Customer | null>(null);
  const homeScanRef = useRef<HTMLInputElement>(null);
  const homeScanBuffer = useRef('');
  const homeScanTimeout = useRef<NodeJS.Timeout | null>(null);

  // Load showHomeInfoPanel setting + live-update on admin toggle
  useEffect(() => {
    if (!isElectron()) return;
    getShowHomeInfoPanel().then(setShowInfoPanel);
    const off = window.kiosk.onShowHomeInfoPanelChanged?.(setShowInfoPanel);
    return off;
  }, []);

  // Auto-return to home screen after check-in confirmation clears
  useEffect(() => {
    if (prevLastCheckIn.current && !lastCheckIn) {
      setActiveScreen('HOME');
    }
    prevLastCheckIn.current = lastCheckIn;
  }, [lastCheckIn]);

  // Keep home screen scanner input focused when on HOME screen
  useEffect(() => {
    if (activeScreen === 'HOME' && !lastCheckIn) {
      homeScanRef.current?.focus();
      const keepFocus = setInterval(() => {
        if (activeScreen === 'HOME' && document.activeElement !== homeScanRef.current) {
          // Don't steal focus from form elements (admin panel dropdowns, inputs, etc.)
          const tag = document.activeElement?.tagName;
          if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
          // Don't steal focus when PIN overlay is open — it needs keyboard input
          if (document.querySelector('[data-pin-overlay]')) return;
          homeScanRef.current?.focus();
        }
      }, 500);
      return () => clearInterval(keepFocus);
    }
  }, [activeScreen, lastCheckIn]);

  // Handle barcode scan on home screen
  const handleHomeScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeScreen !== 'HOME' || lastCheckIn) {
      e.target.value = '';
      return;
    }

    const value = e.target.value;
    homeScanBuffer.current = value;

    if (homeScanTimeout.current) {
      clearTimeout(homeScanTimeout.current);
    }

    // Wait for scanner to finish typing (100ms debounce)
    homeScanTimeout.current = setTimeout(() => {
      if (value.length > 100) {
        // Looks like a DL barcode — switch to ID scan with this data
        setPendingScanData(value);
        setActiveScreen('ID_SCAN');
        // Clear the buffer
        homeScanBuffer.current = '';
        if (homeScanRef.current) homeScanRef.current.value = '';
      } else {
        // Too short — not a DL barcode, clear it
        homeScanBuffer.current = '';
        if (homeScanRef.current) homeScanRef.current.value = '';
      }
    }, 100);
  };

  // Clear pending scan data after IDScan picks it up
  const clearPendingScan = () => setPendingScanData(null);

  const handleBack = () => setActiveScreen('HOME');

  if (lastCheckIn) {
    // Special confirmation for online orders
    if (lastCheckIn.isOnlineOrder) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#1a1a1a] animate-in fade-in zoom-in duration-500">
          <div className="bg-zinc-800 p-12 rounded-3xl border-2 border-green-500 text-center max-w-xl shadow-2xl">
            <div className="text-6xl mb-6">📦</div>
            <h1 className="text-4xl font-craft font-bold text-green-400 mb-4">Online Order Found!</h1>
            <p className="text-2xl text-zinc-300 mb-4">
              Welcome, <span className="font-bold text-white">{lastCheckIn.name}</span>.
            </p>
            <p className="text-xl text-gold font-bold mb-4">Your online order is ready.</p>
            <p className="text-lg text-zinc-400">Please proceed to the counter — a budtender will assist you shortly.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#1a1a1a] animate-in fade-in zoom-in duration-500">
        <div className="bg-zinc-800 p-12 rounded-3xl border-2 border-gold text-center max-w-xl shadow-2xl">
          <div className="text-6xl mb-6">✅</div>
          <h1 className="text-4xl font-craft font-bold text-gold mb-4">You're All Checked In!</h1>
          <p className="text-2xl text-zinc-300 mb-4">
            Thank you, <span className="font-bold text-white">{lastCheckIn.name}</span>!
          </p>
          <p className="text-lg text-zinc-400">Your name will appear on the screen in a moment.</p>
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
            <div className="pt-16 pb-8 text-center">
              <Logo size="lg" />
              <h2 className="mt-6 text-3xl font-craft text-gold tracking-widest">Select Check-In Method</h2>
              <p className="text-zinc-400 mt-2 font-light">Fast & easy entry to our dispensary</p>
            </div>

            <div className="flex-1 px-10 pb-10 flex flex-col gap-8 max-w-[1800px] mx-auto w-full">
              {/* Check-in buttons */}
              <div className="flex-1 grid grid-cols-2 gap-6">
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

              {/* Info panel — portrait only; replaces paper signs. Hidden in landscape and when admin toggle is off. */}
              {showInfoPanel && (
                <div className="grid grid-cols-2 gap-6 h-[320px] landscape:hidden">
                  {/* Group check-in (left in portrait) */}
                  <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800 p-8 flex flex-col items-center justify-center text-center">
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <svg className="w-8 h-8 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <h3 className="text-xl font-craft text-gold uppercase tracking-wider">In a Group?</h3>
                    </div>
                    <p className="text-zinc-300">
                      Only <span className="text-white font-bold">one person</span> needs to check in.
                    </p>
                    <p className="text-zinc-400 text-sm mt-1">
                      Everyone shows ID at checkout.
                    </p>
                  </div>

                  {/* Scanner instructions (right in portrait, arrow points down to physical scanner) */}
                  <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800 p-8 flex flex-col items-center justify-center text-center">
                    <h3 className="text-xl font-craft text-gold uppercase tracking-wider mb-4">Barcode Scanner Below</h3>
                    <svg className="w-20 h-20 text-gold mb-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    <p className="text-zinc-300 text-lg leading-relaxed">
                      Have your ID ready with the <span className="text-white font-bold">barcode facing up</span>.
                    </p>
                    <p className="text-zinc-400 mt-2">
                      Scanner is below the screen.
                    </p>
                  </div>
                </div>
              )}
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
              {activeScreen === 'ID_SCAN' && <IDScan onComplete={onCheckIn} onGoHome={() => setActiveScreen('HOME')} pendingScanData={pendingScanData} onPendingScanConsumed={clearPendingScan} />}
              {activeScreen === 'PHONE' && <PhoneEntry onComplete={onCheckIn} />}
              {activeScreen === 'GUEST' && <GuestEntry onComplete={onCheckIn} />}
              {activeScreen === 'QR' && <QREntry onComplete={onCheckIn} />}
            </div>
          </div>
        )}
      </div>

      {/* Hidden scanner input for home screen auto-scan */}
      {activeScreen === 'HOME' && !lastCheckIn && (
        <input
          ref={homeScanRef}
          type="text"
          className="opacity-0 absolute -left-[9999px]"
          onChange={handleHomeScan}
          onKeyDown={(e) => { if (e.altKey || (e.ctrlKey && e.key === 'm')) e.preventDefault(); }}
          autoComplete="off"
        />
      )}

      <footer className="p-6 text-center text-zinc-600 text-xs font-craft tracking-widest bg-black/30">
        &copy; {new Date().getFullYear()} Craft Cannabis • Elevate Your Experience
      </footer>
    </div>
  );
};

export default KioskHome;
