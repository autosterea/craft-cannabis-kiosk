
import React, { useState, useRef, useEffect } from 'react';
import { Customer } from '../../types';
import { createCustomer, lookupCustomer, lookupCustomerByDobLastname, updateCustomer, getBlockedWords, isNameBlocked, saveLoyaltyConsent } from '../../services/kioskApi';
import TouchKeyboard from './TouchKeyboard';
import ConsentStep from './ConsentStep';

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

type Step = 'NAME' | 'NAME_INITIAL' | 'LOYALTY_PROMPT' | 'DL_SCAN_OPTION' | 'DL_SCANNING' | 'PHONE_ENTRY' | 'EMAIL_ENTRY' | 'CONSENT' | 'CREATING' | 'UNDERAGE';

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

    if (!firstName) return null;

    const properCase = (s: string) => s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

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

// Calculate age from DOB string (MMDDYYYY format). Returns null if unparseable.
const calculateAge = (dob?: string): number | null => {
  if (!dob || dob.length !== 8) return null;
  const month = parseInt(dob.substring(0, 2), 10);
  const day = parseInt(dob.substring(2, 4), 10);
  const year = parseInt(dob.substring(4, 8), 10);
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
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

  // Clear any pending DL-scan debounce timer on unmount
  useEffect(() => {
    return () => {
      if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
    };
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

  // Guard against a double-submit (e.g. the Bug-1 auto-timeout firing at the same instant as a tap)
  const submittedRef = useRef(false);

  // Submit as guest (no loyalty)
  const submitAsGuest = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    onComplete({
      name,
      lastNameInitial: initial || '',
      method: 'WALK_IN',
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

  // Bug 1 fix: the loyalty prompt has no exit if a guest ignores it, leaving the kiosk stuck and
  // blocking the next customer. Auto-dismiss after 5s by treating it as "No Thanks" — they already
  // entered their name, so we still add them to the queue. Any button tap cancels the timer.
  useEffect(() => {
    if (step !== 'LOYALTY_PROMPT') return;
    const t = setTimeout(() => { submitAsGuest(); }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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
        processDLScan(value).catch(err => console.error('DL scan processing error:', err));
      }
    }, 100);
  };

  // Process the DL scan
  const processDLScan = async (scanData: string) => {
    const parsed = parseDriversLicense(scanData);
    setScanBuffer('');
    if (inputRef.current) inputRef.current.value = '';

    if (parsed) {
      setDlData(parsed);
      // Update name from DL
      setName(parsed.firstName);
      setInitial(parsed.lastName?.[0]?.toUpperCase() || '');

      // Age gate: under-21 may only continue if they already have a loyalty account (medical patients).
      const age = calculateAge(parsed.dateOfBirth);
      if (age !== null && age < 21) {
        let loyaltyOk = false;
        try {
          if (parsed.dateOfBirth && parsed.lastName) {
            const dob = parsed.dateOfBirth; // MMDDYYYY
            const birthday = `${dob.substring(4, 8)}-${dob.substring(0, 2)}-${dob.substring(2, 4)}`;
            const res = await lookupCustomerByDobLastname(birthday, parsed.lastName);
            if (res.found && res.customer?.loyalty_member) {
              loyaltyOk = true;
              setExistingCustomerId(res.customer.id); // update existing account, don't duplicate
            }
          }
        } catch (e) {
          console.error('Under-21 loyalty lookup failed:', e);
        }
        if (!loyaltyOk) {
          setStep('UNDERAGE');
          return;
        }
      }
    }

    // Move to phone entry (of-age, unparseable DOB, or under-21 loyalty member)
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
        // Preserve a DL/DOB-matched existingCustomerId (set during the under-21 gate); only adopt
        // the phone-lookup match if we don't already have a confirmed identity from the DL scan.
        if (!existingCustomerId) setExistingCustomerId(result.customer.id);
      } else {
        setStep('EMAIL_ENTRY');
        // Preserve an existingCustomerId already set by the under-21 DOB+lastname match; only clear if none.
        if (!existingCustomerId) setExistingCustomerId(null);
      }
    } catch (err) {
      console.error('Phone lookup failed:', err);
      setStep('EMAIL_ENTRY');
      if (!existingCustomerId) setExistingCustomerId(null);
    } finally {
      setLoading(false);
    }
  };

  // Submit email — proceed to consent + signature before enrolling
  const submitWithLoyalty = () => {
    if (phone.length !== 10 || !email) return;
    setStep('CONSENT');
  };

  // Customer signs consent — create/update loyalty account with terms_agreed, store signature
  const consentAgree = async (signaturePng: string) => {
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
          termsAgreed: true,
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
          termsAgreed: true,
          address1: dlData?.address,
          city: dlData?.city,
          state: dlData?.state,
          zipCode: dlData?.zipCode,
          dateOfBirth: dlData?.dateOfBirth,
          gender: dlData?.gender,
        });
        customerId = newCustomer.id;
      }

      // Persist the signature as compliance proof (fire-and-forget)
      saveLoyaltyConsent({ customerId, customerName: `${name} ${initial || ''}`.trim(), signaturePng }).catch(() => {});

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

  // Handle name keyboard input - filter to only allow letters, hyphens, apostrophes
  const handleNameChange = (val: string) => {
    setName(val.replace(/[^a-zA-Z'-]/g, ''));
  };

  // Step 1: Enter First Name via on-screen keyboard
  if (step === 'NAME') {
    return (
      <div className="w-full max-w-2xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <h2 className="text-3xl font-craft font-bold mb-2 text-gold uppercase tracking-wider">Guest Check-In</h2>
        <p className="text-zinc-400 mb-6">Enter your first name</p>

        {nameBlocked && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-xl text-red-300 text-sm">
            Please use your real name
          </div>
        )}

        <TouchKeyboard
          value={name}
          onChange={handleNameChange}
          onSubmit={() => { if (name.trim() && !nameBlocked) setStep('NAME_INITIAL'); }}
          placeholder="First Name"
          type="text"
          submitLabel="Next →"
          maxLength={20}
        />
      </div>
    );
  }

  // Step 1b: Enter Last Initial
  if (step === 'NAME_INITIAL') {
    return (
      <div className="w-full max-w-2xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <h2 className="text-3xl font-craft font-bold mb-2 text-gold uppercase tracking-wider">Hi {name}!</h2>
        <p className="text-zinc-400 mb-6">Enter your last initial <span className="text-zinc-600">(optional)</span></p>

        <TouchKeyboard
          value={initial}
          onChange={(val) => setInitial(val.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 1))}
          onSubmit={proceedToLoyaltyPrompt}
          placeholder="Last Initial (e.g. S)"
          type="text"
          submitLabel="Continue →"
          maxLength={1}
        />

        <button
          onClick={() => { setName(''); setInitial(''); setStep('NAME'); }}
          className="mt-4 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          ← Back to name
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
          onClick={() => setStep('NAME_INITIAL')}
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

        {/* Formatted display — read-only, driven by the numpad below.
            Bug fix v2.1.8: previously this was an <input type="tel"> which relied on the OS keyboard.
            Touch kiosks have no OS keyboard, so customers couldn't enter their phone. Mirrors the
            numpad pattern used in PhoneEntry.tsx and IDScan.tsx NEW_CUSTOMER_PHONE. */}
        <div className="bg-black/40 border-2 border-zinc-800 rounded-2xl p-5 mb-4 text-3xl font-mono text-gold tracking-wider text-center h-20 flex items-center justify-center">
          {formatPhoneDisplay(phone) || <span className="text-zinc-700">(555) 555-5555</span>}
        </div>
        <p className="text-zinc-500 text-sm mb-6">
          We'll use this to look you up on future visits
        </p>

        <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, '←'].map((key, i) => (
            key === null ? <div key={i} /> : (
              <button
                key={i}
                onClick={() => {
                  if (key === '←') setPhone(prev => prev.slice(0, -1));
                  else if (phone.length < 10) setPhone(prev => prev + key.toString());
                }}
                className={`h-16 text-2xl font-craft flex items-center justify-center rounded-xl transition-all active:scale-95 ${
                  key === '←' ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'bg-zinc-800 text-white hover:bg-zinc-700'
                }`}
              >
                {key}
              </button>
            )
          ))}
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

  // Step 4b: Consent + signature (loyalty enrollment)
  if (step === 'CONSENT' && phone.length === 10 && email) {
    return (
      <ConsentStep
        firstName={name}
        onBack={() => { setStep('EMAIL_ENTRY'); setError(null); }}
        onAgree={(sig) => consentAgree(sig)}
      />
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

  // Under-21 with no loyalty account — cannot check in here
  if (step === 'UNDERAGE') {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-red-700 shadow-xl text-center">
        <div className="flex justify-center mb-6">
          <svg className="w-24 h-24 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-3xl font-craft font-bold mb-4 text-red-500 uppercase tracking-wider">
          Must Be 21+
        </h2>
        <p className="text-red-300 text-lg mb-2">
          You must be 21 or older to check in.
        </p>
        <p className="text-zinc-400 text-sm mb-8">
          Medical patients: please see a staff member for assistance.
        </p>
        <button
          onClick={() => {
            setStep('NAME');
            setName('');
            setInitial('');
            setPhone('');
            setEmail('');
            setDlData(null);
            setExistingCustomerId(null);
            setError(null);
          }}
          className="p-4 px-10 rounded-xl text-lg font-craft bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
        >
          Done
        </button>
      </div>
    );
  }

  return null;
};

export default GuestEntry;
