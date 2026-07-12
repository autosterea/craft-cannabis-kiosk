
import React, { useState, useRef, useEffect } from 'react';
import { Customer } from '../../types';
import { fetchCustomerById } from '../../services/kioskApi';

interface QREntryProps {
  // handleCheckIn resolves to false when POSaBIT did NOT actually queue the customer (v2.1.13 guard).
  onComplete: (data: Partial<Customer>) => void | Promise<boolean>;
}

// The Dope App loyalty QR decodes to a short, all-numeric POSaBIT customer id (e.g. "1234567").
// We capture the scan, look the customer up by id (works across all venues — records are shared
// org-wide), and check them in. No fake success: if the queue add fails we say "see a budtender".
const QREntry: React.FC<QREntryProps> = ({ onComplete }) => {
  const [status, setStatus] = useState<'READY' | 'LOOKING' | 'FOUND' | 'NOT_FOUND' | 'FAILED'>('READY');
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);

  // Keep the hidden scanner input focused while we're waiting for a scan.
  useEffect(() => {
    if (status !== 'READY') return;
    inputRef.current?.focus();
    const keep = setInterval(() => {
      if (document.activeElement !== inputRef.current) {
        const tag = document.activeElement?.tagName;
        if (tag !== 'SELECT' && tag !== 'TEXTAREA') inputRef.current?.focus();
      }
    }, 500);
    return () => clearInterval(keep);
  }, [status]);

  const handleScanInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (bufferTimeout.current) clearTimeout(bufferTimeout.current);
    // Scanners type fast; wait 100ms for the full code, then process.
    bufferTimeout.current = setTimeout(() => {
      const code = value.trim();
      if (inputRef.current) inputRef.current.value = '';
      if (status === 'READY' && /^\d{4,12}$/.test(code)) {
        lookupAndCheckIn(code);
      }
    }, 100);
  };

  const lookupAndCheckIn = async (customerId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus('LOOKING');
    try {
      const result = await fetchCustomerById(Number(customerId));
      if (result.found && result.customer) {
        const c = result.customer;
        setName(c.first_name || 'there');
        setStatus('FOUND');
        const ok = await onComplete({
          name: c.first_name,
          lastNameInitial: c.last_name?.[0]?.toUpperCase() || '',
          method: 'QR',
          loyaltyStatus: c.loyalty_member ? 'Member' : 'Guest',
          customerId: c.id,
        });
        if (ok === false) {
          setStatus('FAILED');
          setTimeout(() => { busyRef.current = false; setStatus('READY'); }, 6000);
        }
        // On success the parent shows the confirmation card and returns home.
      } else {
        setStatus('NOT_FOUND');
        setTimeout(() => { busyRef.current = false; setStatus('READY'); }, 4000);
      }
    } catch (err) {
      console.error('QR lookup failed:', err);
      setStatus('FAILED');
      setTimeout(() => { busyRef.current = false; setStatus('READY'); }, 4000);
    }
  };

  const box = 'w-full max-w-xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl text-center';

  if (status === 'LOOKING' || status === 'FOUND') {
    return (
      <div className={box}>
        <div className="w-16 h-16 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
        <h2 className="text-3xl font-craft font-bold text-gold uppercase tracking-wider">
          {status === 'FOUND' ? `Welcome, ${name}!` : 'Looking you up...'}
        </h2>
        {status === 'FOUND' && <p className="text-zinc-400 mt-3">Checking you in.</p>}
      </div>
    );
  }

  if (status === 'NOT_FOUND') {
    return (
      <div className={box}>
        <div className="text-6xl mb-6">🤔</div>
        <h2 className="text-2xl font-craft font-bold text-white mb-2">We couldn't find that account</h2>
        <p className="text-zinc-400">Please see a budtender for help, or check in with your ID or phone.</p>
      </div>
    );
  }

  if (status === 'FAILED') {
    return (
      <div className={box}>
        <div className="text-6xl mb-6">🙋</div>
        <h2 className="text-2xl font-craft font-bold text-white mb-2">Almost there</h2>
        <p className="text-zinc-400">We couldn't finish your check-in. Please see a budtender for help.</p>
      </div>
    );
  }

  // READY — waiting for a scan
  return (
    <div className={box}>
      <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">Scan QR Code</h2>
      <p className="text-zinc-400 mb-12">Scan your loyalty QR code from the Dope App or your email.</p>

      <div className="relative mb-6 aspect-square max-w-[300px] mx-auto bg-black rounded-3xl border-4 border-gold overflow-hidden">
        <div className="w-full h-full p-8 opacity-20 bg-zinc-800 flex items-center justify-center">
          <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v2h-3v-2zm-3 0h2v3h-2v-3zm3 3h3v5h-2v-3h-1v3h-2v-5zm-3 4h2v1h-2v-1zm1 1h1v1h-1v-1z" /></svg>
        </div>
        <div className="absolute top-0 left-0 w-full h-1 bg-gold shadow-[0_0_15px_#ceb185] animate-[scan_2s_ease-in-out_infinite]"></div>
      </div>

      <style>{`
        @keyframes scan {
          0%, 100% { top: 0; }
          50% { top: 100%; }
        }
      `}</style>

      {/* Hidden input that captures the barcode scanner (scanner acts as a keyboard). */}
      <input
        ref={inputRef}
        type="text"
        className="opacity-0 absolute -left-[9999px]"
        onChange={handleScanInput}
        autoComplete="off"
      />
    </div>
  );
};

export default QREntry;
