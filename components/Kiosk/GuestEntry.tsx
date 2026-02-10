
import React, { useState, useRef, useEffect } from 'react';
import { Customer } from '../../types';
import { createCustomer, lookupCustomer, updateCustomer, getBlockedWords, isNameBlocked } from '../../services/kioskApi';
import TouchKeyboard from './TouchKeyboard';

interface GuestEntryProps {
  onComplete: (data: Partial<Customer>) => void;
}

interface ScannedDLData {
  firstName: string;
  lastName: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  dateOfBirth?: string;
  gender?: 'M' | 'F' | 'X';
}

type Step = 'NAME' | 'LOYALTY_PROMPT' | 'DL_SCAN_OPTION' | 'DL_SCANNING' | 'PHONE_ENTRY' | 'EMAIL_ENTRY' | 'CREATING';

// Parse driver's license barcode (simplified version)
const parseDriversLicense = (scanData: string): ScannedDLData | null => {
  try {
    const fields: Record<string, string> = {};
    const allFieldCodes = [
      'DAA', 'DAB', 'DAC', 'DAD', 'DAE', 'DAF', 'DAG', 'DAH', 'DAI', 'DAJ', 'DAK', 'DAL', 'DAM', 'DAN', 'DAO', 'DAP', 'DAQ', 'DAR', 'DAS', 'DAT', 'DAU', 'DAV', 'DAW', 'DAX', 'DAY', 'DAZ',
      'DBA', 'DBB', 'DBC', 'DBD', 'DBE', 'DBF', 'DBG', 'DBH', 'DBI', 'DBJ', 'DBK', 'DBL', 'DBM', 'DBN', 'DBO', 'DBP', 'DBQ', 'DBR', 'DBS',
      'DCA', 'DCB', 'DCC', 'DCD', 'DCE', 'DCF', 'DCG', 'DCH', 'DCI', 'DCJ', 'DCK', 'DCL', 'DCM', 'DCN', 'DCO', 'DCP', 'DCQ', 'DCR', 'DCS', 'DCT', 'DCU',
      'DDA', 'DDB', 'DDC', 'DDD', 'DDE', 'DDF', 'DDG', 'DDH', 'DDI', 'DDJ', 'DDK', 'DDL',
      'DFN', 'DLN', 'DEN'
    ];

    const fieldCodeRegex = new RegExp(`(${allFieldCodes.join('|')})`, 'g');
    const matches: { code: string; index: number }[] = [];
    let match;
    while ((match = fieldCodeRegex.exec(scanData)) !== null) {
      matches.push({ code: match[1], index: match.index });
    }

    for (let i = 0; i < matches.length; i++) {
      const { code, index } = matches[i];
      const startPos = index + 3;
      const endPos = i < matches.length - 1 ? matches[i + 1].index : scanData.length;
      let value = scanData.substring(startPos, endPos);
      value = value.replace(/[\x00-\x1F]/g, '').trim();
      if (value && !fields[code]) {
        fields[code] = value;
      }
    }

    let firstName = fields['DAC'] || fields['DCT'] || fields['DFN'] || '';
    let lastName = fields['DCS'] || fields['DLN'] || '';
    const dateOfBirth = fields['DBB'] || '';
    let address = fields['DAG'] || '';
    let city = fields['DAI'] || '';
    let state = fields['DAJ'] || '';
    let zipCode = fields['DAK'] || '';

    if (state.length > 2) state = state.substring(0, 2);
    zipCode = zipCode.replace(/[^0-9]/g, '').substring(0, 5);

    const genderCode = fields['DBC'] || '';
    let gender: 'M' | 'F' | 'X' | undefined;
    if (genderCode === '1') gender = 'M';
    else if (genderCode === '2') gender = 'F';
    else if (genderCode) gender = 'X';

    firstName = firstName.replace(/[^A-Za-z\-' ]/g, '').trim();
    lastName = lastName.replace(/[^A-Za-z\-' ]/g, '').trim();
    if (firstName.includes(' ')) firstName = firstName.split(/\s+/)[0];
    if (lastName.includes(' ')) lastName = lastName.split(/\s+/)[0];

    if (!firstName) return null;

    const properCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

    return {
      firstName: properCase(firstName),
      lastName: lastName ? properCase(lastName) : '',
      address: address || undefined,
      city: city ? properCase(city) : undefined,
      state: state?.toUpperCase() || undefined,
      zipCode: zipCode || undefined,
      dateOfBirth: dateOfBirth || undefined,
      gender,
    };
  } catch (e) {
    return null;
  }
};

const GuestEntry: React.FC<GuestEntryProps> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>('NAME');
  const [name, setName] = useState('');
  const [initial, setInitial] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dlData, setDlData] = useState<ScannedDLData | null>(null);
  const [existingCustomerId, setExistingCustomerId] = useState<number | null>(null);
  const [scanBuffer, setScanBuffer] = useState('');
  const [blockedWords, setBlockedWords] = useState<string[]>([]);
  const [nameBlocked, setNameBlocked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load blocked words on mount
  useEffect(() => {
    getBlockedWords().then(setBlockedWords).catch(() => {});
  }, []);

  // Validate name against blocked words whenever name changes
  useEffect(() => {
    setNameBlocked(name.trim() ? isNameBlocked(name, blockedWords) : false);
  }, [name, blockedWords]);

  // Keep input focused for scanner when in DL_SCANNING step
  useEffect(() => {
    if (step === 'DL_SCANNING') {
      inputRef.current?.focus();
      const keepFocus = setInterval(() => {
        if (document.activeElement !== inputRef.current) {
          inputRef.current?.focus();
        }
      }, 500);
      return () => clearInterval(keepFocus);
    }
  }, [step]);

  const formatPhoneDisplay = (val: string) => {
    if (!val) return '';
    const cleaned = val.replace(/\D/g, '').slice(0, 10);
    let formatted = '';
    if (cleaned.length > 0) formatted = '(' + cleaned.substring(0, 3);
    if (cleaned.length > 3) formatted += ') ' + cleaned.substring(3, 6);
    if (cleaned.length > 6) formatted += '-' + cleaned.substring(6, 10);
    return formatted;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(cleaned);
  };

  // Submit as guest (no loyalty)
  const submitAsGuest = () => {
    onComplete({
      name,
      lastNameInitial: initial || '',
      method: 'GUEST',
      loyaltyStatus: 'Guest',
    });
  };

  // Show loyalty prompt after entering name
  const proceedToLoyaltyPrompt = () => {
    if (!name) return;
    setStep('LOYALTY_PROMPT');
  };

  // User wants to sign up for loyalty - show DL scan option
  const wantsLoyalty = () => {
    setStep('DL_SCAN_OPTION');
  };

  // User doesn't want loyalty, just check in
  const skipLoyalty = () => {
    submitAsGuest();
  };

  // User wants to scan DL for demographics
  const startDLScan = () => {
    setScanBuffer('');
    setStep('DL_SCANNING');
  };

  // User skips DL scan
  const skipDLScan = () => {
    setStep('PHONE_ENTRY');
  };

  // Handle DL scan input
  const handleScanInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setScanBuffer(value);

    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
    }

    bufferTimeoutRef.current = setTimeout(() => {
      if (value.length > 50) {
        processDLScan(value);
      }
    }, 100);
  };

  // Process the DL scan
  const processDLScan = (scanData: string) => {
    const parsed = parseDriversLicense(scanData);

    if (parsed) {
      setDlData(parsed);
      // Update name from DL
      setName(parsed.firstName);
      setInitial(parsed.lastName?.[0]?.toUpperCase() || '');
    }

    // Move to phone entry regardless
    setScanBuffer('');
    if (inputRef.current) inputRef.current.value = '';
    setStep('PHONE_ENTRY');
  };

  // Move to email entry after phone - but check for existing customer first
  const proceedToEmailEntry = async () => {
    if (phone.length !== 10) return;
    setLoading(true);
    setError(null);

    try {
      const result = await lookupCustomer(phone);
      if (result.found && result.customer) {
        // Customer already exists - update them with loyalty + email instead of creating duplicate
        setStep('EMAIL_ENTRY');
        // Store existing customer id so submitWithLoyalty can update instead of create
        setExistingCustomerId(result.customer.id);
      } else {
        setStep('EMAIL_ENTRY');
        setExistingCustomerId(null);
      }
    } catch (err) {
      console.error('Phone lookup failed:', err);
      setStep('EMAIL_ENTRY');
      setExistingCustomerId(null);
    } finally {
      setLoading(false);
    }
  };

  // Submit with loyalty signup (after email entry)
  const submitWithLoyalty = async () => {
    if (phone.length !== 10 || !email) return;

    setStep('CREATING');
    setLoading(true);
    setError(null);

    try {
      let customerId: number;

      if (existingCustomerId) {
        // Customer already exists - update with loyalty + email instead of creating duplicate
        await updateCustomer(existingCustomerId, {
          loyaltyMember: true,
          marketingOptIn: true,
          email: email,
          address1: dlData?.address,
          city: dlData?.city,
          state: dlData?.state,
          zipCode: dlData?.zipCode,
          dateOfBirth: dlData?.dateOfBirth,
          gender: dlData?.gender,
        });
        customerId = existingCustomerId;
      } else {
        // New customer - create in POSaBIT with loyalty enabled
        const newCustomer = await createCustomer({
          firstName: name,
          lastName: initial || undefined,
          telephone: phone,
          email: email,
          loyaltyOptIn: true,
          address1: dlData?.address,
          city: dlData?.city,
          state: dlData?.state,
          zipCode: dlData?.zipCode,
          dateOfBirth: dlData?.dateOfBirth,
          gender: dlData?.gender,
        });
        customerId = newCustomer.id;
      }

      // Capture data before resetting state
      const completionData = {
        name,
        lastNameInitial: initial || '',
        method: 'GUEST' as const,
        phone: phone,
        loyaltyStatus: 'Member' as const,
        customerId,
      };

      // Reset GuestEntry state BEFORE calling onComplete to prevent hang
      setStep('NAME');
      setName('');
      setInitial('');
      setPhone('');
      setEmail('');
      setError(null);
      setDlData(null);
      setExistingCustomerId(null);
      setLoading(false);

      onComplete(completionData);
      return; // Skip the finally block's setLoading since we already did it
    } catch (err) {
      console.error('Failed to create/update customer:', err);
      setError('Failed to sign up for loyalty. Please try again or continue as guest.');
      setStep('EMAIL_ENTRY');
      setLoading(false);
    }
  };

  // Step 1: Enter Name
  if (step === 'NAME') {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">Guest Check-In</h2>
        <p className="text-zinc-400 mb-8">Enter your name to get started</p>

        <div className="space-y-6 mb-8 text-left">
          {/* First Name */}
          <div>
            <label className="text-zinc-500 font-craft text-xs uppercase ml-4">
              First Name *
            </label>
            <input
              type="text"
              placeholder="Ex: David"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z\s'-]/g, ''))}
              className={`w-full bg-black/40 border-2 rounded-2xl p-5 text-xl text-white placeholder:text-zinc-700 outline-none transition-all ${
                nameBlocked ? 'border-red-500 focus:border-red-500' : 'border-zinc-800 focus:border-gold'
              }`}
              autoFocus
            />
            {nameBlocked && (
              <p className="text-red-400 text-sm mt-2 ml-4">Please use your real name</p>
            )}
          </div>

          {/* Last Initial */}
          <div>
            <label className="text-zinc-500 font-craft text-xs uppercase ml-4">
              Last Initial <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="Ex: S"
              maxLength={1}
              value={initial}
              onChange={(e) => setInitial(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())}
              className="w-24 bg-black/40 border-2 border-zinc-800 rounded-2xl p-5 text-xl text-white placeholder:text-zinc-700 focus:border-gold outline-none text-center transition-all"
            />
          </div>
        </div>

        <button
          onClick={proceedToLoyaltyPrompt}
          disabled={!name || nameBlocked}
          className={`
            w-full p-7 rounded-2xl text-2xl font-craft font-bold transition-all active:scale-95
            ${name && !nameBlocked ? 'bg-gold text-black hover:bg-[#d8c19d]' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}
          `}
        >
          Continue
        </button>
      </div>
    );
  }

  // Step 2: Loyalty Prompt
  if (step === 'LOYALTY_PROMPT') {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <h2 className="text-3xl font-craft font-bold mb-2 text-gold uppercase tracking-wider">
          Hi {name}!
        </h2>
        <p className="text-xl text-white mb-6">
          Join <span className="text-gold font-bold">Craft Rewards</span> — it's free
        </p>

        <div className="text-left space-y-3 mb-8 px-4">
          <div className="flex items-center gap-3">
            <span className="text-gold text-lg">%</span>
            <span className="text-white">Member-only discounts</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gold text-lg">★</span>
            <span className="text-white">Early access to new products</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gold text-lg">+</span>
            <span className="text-white">Earn points on every purchase</span>
          </div>
        </div>

        <div className="flex gap-4 mb-4">
          <button
            onClick={skipLoyalty}
            className="flex-1 p-6 rounded-xl text-xl font-craft bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
          >
            No Thanks
          </button>
          <button
            onClick={wantsLoyalty}
            className="flex-1 p-6 rounded-xl text-xl font-craft font-bold bg-gold text-black hover:bg-[#d8c19d] transition-all"
          >
            Sign Me Up
          </button>
        </div>

        <button
          onClick={() => setStep('NAME')}
          className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          ← Back to name entry
        </button>
      </div>
    );
  }

  // Step 2.5: DL Scan Option (for easier signup)
  if (step === 'DL_SCAN_OPTION') {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Quick Signup
        </h2>
        <p className="text-zinc-400 mb-8">
          Scan your ID to auto-fill your information, or enter manually
        </p>

        <div className="flex flex-col gap-4 mb-6">
          <button
            onClick={startDLScan}
            className="w-full p-6 rounded-xl text-xl font-craft font-bold bg-gold text-black hover:bg-[#d8c19d] transition-all flex items-center justify-center gap-3"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            Scan ID (Recommended)
          </button>
          <button
            onClick={skipDLScan}
            className="w-full p-6 rounded-xl text-xl font-craft bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
          >
            Enter Manually
          </button>
        </div>

        <button
          onClick={() => setStep('LOYALTY_PROMPT')}
          className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          ← Back
        </button>
      </div>
    );
  }

  // Step 2.6: DL Scanning
  if (step === 'DL_SCANNING') {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <div className="mb-8">
          <div className="w-48 h-64 border-4 border-dashed border-gold/60 rounded-2xl flex flex-col items-center justify-center mx-auto bg-zinc-800/50 animate-pulse">
            <svg className="w-20 h-20 text-gold mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <div className="h-1 bg-gold w-32 animate-bounce opacity-80"></div>
          </div>
        </div>

        <h2 className="text-3xl font-craft font-bold mb-4 text-white uppercase tracking-wider">
          Scan Your ID
        </h2>
        <p className="text-zinc-400 mb-8">
          Place the barcode on the back of your ID under the scanner
        </p>

        {/* Hidden input for scanner */}
        <input
          ref={inputRef}
          type="text"
          className="opacity-0 absolute -left-[9999px]"
          onChange={handleScanInput}
          onBlur={() => inputRef.current?.focus()}
          onKeyDown={(e) => { if (e.altKey || (e.ctrlKey && e.key === 'm')) e.preventDefault(); }}
          autoComplete="off"
          autoFocus
        />

        <button
          onClick={skipDLScan}
          className="text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-4"
        >
          Skip - Enter Manually Instead
        </button>
      </div>
    );
  }

  // Step 3: Phone Entry (for loyalty signup)
  if (step === 'PHONE_ENTRY') {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Step 1 of 2
        </h2>
        <p className="text-zinc-400 mb-2">
          Enter your phone number
        </p>
        {dlData && (
          <p className="text-green-400 text-sm mb-6">
            ✓ ID scanned - {dlData.firstName} {dlData.lastName?.[0] || ''}.
          </p>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="mb-8">
          <input
            type="tel"
            placeholder="(555) 555-5555"
            value={formatPhoneDisplay(phone)}
            onChange={handlePhoneChange}
            className="w-full bg-black/40 border-2 border-zinc-800 rounded-2xl p-6 text-2xl text-white placeholder:text-zinc-700 focus:border-gold outline-none transition-all text-center tracking-wider"
            autoFocus
          />
          <p className="text-zinc-500 text-sm mt-2">
            We'll use this to look you up on future visits
          </p>
        </div>

        <div className="flex gap-4 mb-4">
          <button
            onClick={skipLoyalty}
            className="flex-1 p-6 rounded-xl text-xl font-craft bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
          >
            Skip
          </button>
          <button
            onClick={proceedToEmailEntry}
            disabled={phone.length !== 10}
            className={`flex-1 p-6 rounded-xl text-xl font-craft font-bold transition-all ${
              phone.length === 10
                ? 'bg-gold text-black hover:bg-[#d8c19d]'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            }`}
          >
            Next →
          </button>
        </div>

        <button
          onClick={() => { setStep('DL_SCAN_OPTION'); setDlData(null); }}
          className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          ← Back
        </button>
      </div>
    );
  }

  // Step 4: Email Entry (for loyalty signup)
  if (step === 'EMAIL_ENTRY') {
    return (
      <div className="w-full max-w-2xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <h2 className="text-3xl font-craft font-bold mb-2 text-gold uppercase tracking-wider">
          Almost Done
        </h2>
        <p className="text-zinc-400 mb-1">
          Enter your email to complete signup
        </p>
        <p className="text-gold text-sm mb-6">
          This is where we'll send your discounts and rewards
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}

        <TouchKeyboard
          value={email}
          onChange={setEmail}
          onSubmit={submitWithLoyalty}
          placeholder="your@email.com"
          type="email"
        />

        <button
          onClick={() => { setStep('PHONE_ENTRY'); setError(null); }}
          className="mt-6 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          ← Back to phone
        </button>
      </div>
    );
  }

  // Step 5: Creating customer
  if (step === 'CREATING') {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <div className="animate-spin w-16 h-16 border-4 border-gold border-t-transparent rounded-full mx-auto mb-6"></div>
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Signing You Up...
        </h2>
        <p className="text-zinc-400">Creating your loyalty account!</p>
      </div>
    );
  }

  return null;
};

export default GuestEntry;
