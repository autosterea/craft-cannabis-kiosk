
import React, { useState, useEffect, useRef } from 'react';
import { Customer } from '../../types';
import { lookupCustomerByName, updateCustomer, KioskCustomer } from '../../services/kioskApi';

interface IDScanProps {
  onComplete: (data: Partial<Customer>) => void;
}

interface ParsedLicense {
  firstName: string;
  lastName: string;
  licenseNumber?: string;
  dateOfBirth?: string;  // MMDDYYYY format
  age?: number;
  isOver21?: boolean;
}

// Calculate age from DOB string (MMDDYYYY format)
const calculateAge = (dob: string): { age: number; isOver21: boolean } | null => {
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

  return { age, isOver21: age >= 21 };
};

// Format DOB for display (MMDDYYYY -> MM/DD/YYYY)
const formatDOB = (dob: string): string => {
  if (!dob || dob.length !== 8) return dob;
  return `${dob.substring(0, 2)}/${dob.substring(2, 4)}/${dob.substring(4, 8)}`;
};

// Parse driver's license barcode data (AAMVA PDF417 format)
// AAMVA uses control characters as delimiters: \x1E (Record Sep), \x1D (Group Sep), \x0A (LF)
// Common Field codes:
//   DCS = Last Name (Family Name)
//   DAC = First Name
//   DCT = First Name (alt in some states)
//   DAD = Middle Name
//   DAQ = License Number
//   DBB = Date of Birth (MMDDYYYY)
//   DBA = Expiration Date
const parseDriversLicense = (scanData: string): ParsedLicense | null => {
  try {
    const fields: Record<string, string> = {};

    // Log raw data for debugging
    console.log('=== ID SCAN DEBUG ===');
    console.log('Scan data length:', scanData.length);
    console.log('Raw scan (first 500 chars):', scanData.substring(0, 500));
    console.log('Raw scan (ALL):', scanData);
    console.log('Raw scan hex (first 100):', [...scanData.substring(0, 100)].map(c =>
      c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '));

    // AAMVA field codes (3 letters starting with D) - comprehensive list
    const knownCodes = ['DCS', 'DAC', 'DCT', 'DAD', 'DAQ', 'DBB', 'DBA', 'DBC', 'DBD', 'DCI', 'DCJ', 'DCK', 'DCL', 'DCM', 'DCN', 'DCO', 'DCP', 'DCQ', 'DCR', 'DCS', 'DCU', 'DDA', 'DDB', 'DDC', 'DDD', 'DDE', 'DDF', 'DDG', 'DDH', 'DDI', 'DDJ', 'DDK', 'DDL', 'DAW', 'DAZ', 'DEN', 'DCG', 'DAN', 'DFN', 'DLN', 'DCF', 'DDE', 'DDF', 'DDG', 'DAU', 'DAY', 'DAS', 'DAT', 'DBN', 'DBS'];

    // Build regex that stops at next field code
    // Match field code followed by value, stopping at next D[A-Z][A-Z] pattern
    const fieldCodePattern = knownCodes.join('|');

    // Extract each field by finding code and capturing until next code
    for (const code of ['DCS', 'DAC', 'DCT', 'DAD', 'DAQ', 'DBB']) {
      // Pattern: CODE followed by content until next known code or end
      const pattern = new RegExp(`${code}([A-Z0-9\\-' ]+?)(?=${fieldCodePattern}|$)`, 'i');
      const match = scanData.match(pattern);
      if (match && match[1]) {
        fields[code] = match[1].trim();
        console.log(`Found ${code}:`, fields[code]);
      }
    }

    // Method 2: Split by control characters AND common delimiters
    const segments = scanData.split(/[\x1D\x1E\x0A\x0D\n\r@]+/);
    console.log('Segments found:', segments.length);

    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed) continue;

      // Match 3-letter field codes followed by value
      const match3 = trimmed.match(/^([A-Z]{3})(.+)$/i);
      if (match3) {
        const [, code, value] = match3;
        const upperCode = code.toUpperCase();
        const cleanValue = value.replace(/[\x00-\x1F]/g, '').trim();
        if (cleanValue && !fields[upperCode]) {
          fields[upperCode] = cleanValue;
          console.log(`Segment found ${upperCode}:`, cleanValue);
        }
      }
    }

    console.log('All parsed fields:', fields);

    // Extract name fields with fallbacks
    let firstName = fields['DAC'] || fields['DCT'] || fields['DFN'] || '';
    let lastName = fields['DCS'] || fields['DLN'] || '';
    const licenseNumber = fields['DAQ'] || fields['DAN'] || '';
    const dateOfBirth = fields['DBB'] || '';

    // Clean up names - remove trailing non-alpha chars but keep the name
    firstName = firstName.replace(/[^A-Za-z\-' ]/g, '').trim();
    lastName = lastName.replace(/[^A-Za-z\-' ]/g, '').trim();

    // Take only first word if multiple
    if (firstName.includes(' ')) firstName = firstName.split(/\s+/)[0];
    if (lastName.includes(' ')) lastName = lastName.split(/\s+/)[0];

    // Method 3: If standard parsing fails, try alternative patterns
    if (!firstName) {
      // Look for "DAC" followed by uppercase letters
      const altFirstMatch = scanData.match(/DAC\s*([A-Z]{2,})/i);
      if (altFirstMatch) {
        firstName = altFirstMatch[1];
        console.log('Alt pattern found firstName:', firstName);
      }
    }

    if (!lastName) {
      // Look for "DCS" followed by uppercase letters
      const altLastMatch = scanData.match(/DCS\s*([A-Z]{2,})/i);
      if (altLastMatch) {
        lastName = altLastMatch[1];
        console.log('Alt pattern found lastName:', lastName);
      }
    }

    // Method 4: California-specific - look for pattern after "DAA" header
    if (!firstName || !lastName) {
      // California format: DAA followed by data, names appear after specific markers
      const daaMatch = scanData.match(/DAA([^@\n\r]+)/);
      if (daaMatch) {
        console.log('DAA content:', daaMatch[1]);
      }
    }

    // Method 5: Last resort - extract name-like words (3+ chars, alpha only)
    if (!firstName) {
      // Find ALL CAPS words that look like names (3-15 chars)
      const allCapsWords = scanData.match(/\b[A-Z]{3,15}\b/g);
      if (allCapsWords) {
        console.log('All caps words found:', allCapsWords);
        // Filter out known field codes and common non-name words
        const nonNames = ['ANSI', 'AAMVA', 'DCS', 'DAC', 'DAQ', 'DBB', 'DBA', 'DCT', 'DAD', 'DDF', 'DDG'];
        const nameWords = allCapsWords.filter(w => !nonNames.includes(w) && w.length >= 3);
        if (nameWords.length >= 2) {
          // AAMVA typically: LAST FIRST MIDDLE
          lastName = nameWords[0];
          firstName = nameWords[1];
          console.log('Extracted from caps words:', { firstName, lastName });
        } else if (nameWords.length === 1) {
          firstName = nameWords[0];
        }
      }
    }

    // Calculate age from DOB
    const ageInfo = calculateAge(dateOfBirth);
    console.log('Age calculation:', ageInfo);

    console.log('Final extracted:', { firstName, lastName, licenseNumber, dateOfBirth, ...ageInfo });
    console.log('=== END DEBUG ===');

    if (!firstName) {
      console.warn('Could not parse first name from license data');
      return null;
    }

    // Proper case the names
    const properCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

    return {
      firstName: properCase(firstName),
      lastName: lastName ? properCase(lastName) : '',
      licenseNumber,
      dateOfBirth,
      age: ageInfo?.age,
      isOver21: ageInfo?.isOver21,
    };
  } catch (e) {
    console.error('Failed to parse license:', e);
    return null;
  }
};

const IDScan: React.FC<IDScanProps> = ({ onComplete }) => {
  const [status, setStatus] = useState<'READY' | 'SCANNING' | 'FOUND' | 'LOYALTY_PROMPT' | 'UPDATING_LOYALTY' | 'SUCCESS' | 'UNDERAGE'>('READY');
  const [scanBuffer, setScanBuffer] = useState('');
  const [scannedInfo, setScannedInfo] = useState<ParsedLicense | null>(null);
  const [foundCustomer, setFoundCustomer] = useState<KioskCustomer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep input focused for scanner
  useEffect(() => {
    inputRef.current?.focus();

    const keepFocus = setInterval(() => {
      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
    }, 500);

    return () => clearInterval(keepFocus);
  }, []);

  const handleScanInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only accept input in READY state to prevent duplicate scans
    if (status !== 'READY') {
      e.target.value = '';
      return;
    }

    const value = e.target.value;
    setScanBuffer(value);

    // Clear existing timeout
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
    }

    // Wait for scanner to finish (scanners type fast, humans don't)
    // If no new input for 100ms, consider scan complete
    bufferTimeoutRef.current = setTimeout(() => {
      if (value.length > 5 && status === 'READY') {
        processScan(value);
      }
    }, 100);
  };

  const processScan = async (scanData: string) => {
    // Immediately clear the input to prevent re-triggering
    resetScan();

    setStatus('SCANNING');
    console.log('Processing scan data length:', scanData.length);
    console.log('Raw scan data (first 200 chars):', scanData.substring(0, 200));

    // Parse the scanned data
    const parsed = parseDriversLicense(scanData);

    if (!parsed) {
      console.warn('License parsing failed, using fallback');
      setStatus('SUCCESS');
      setTimeout(() => {
        onComplete({
          name: 'Guest',
          lastNameInitial: '',
          method: 'ID_SCAN',
          loyaltyStatus: 'Guest'
        });
        // Reset state for next scan
        setScannedInfo(null);
        setFoundCustomer(null);
        setStatus('READY');
      }, 800);
      return;
    }

    const firstName = parsed.firstName || 'Guest';
    const lastName = parsed.lastName || '';
    const lastInitial = lastName ? lastName[0].toUpperCase() : '';

    console.log('Parsed from DL:', {
      firstName,
      lastName,
      lastInitial,
      licenseNumber: parsed.licenseNumber,
      dob: parsed.dateOfBirth,
      age: parsed.age,
      isOver21: parsed.isOver21
    });

    // Store scanned info for display
    setScannedInfo(parsed);

    // Check if underage
    if (parsed.isOver21 === false) {
      setStatus('UNDERAGE');
      // Auto-reset after 5 seconds
      setTimeout(() => {
        resetScan();
        setStatus('READY');
        setScannedInfo(null);
      }, 5000);
      return;
    }

    // Age verified - look up customer by name
    try {
      const result = await lookupCustomerByName(firstName, lastName);
      console.log('Customer lookup result:', result);

      if (result.found && result.customer) {
        // Customer found in database!
        setFoundCustomer(result.customer);
        setStatus('FOUND');
        // Don't auto-proceed - wait for user confirmation
        return;
      }
    } catch (error) {
      console.error('Customer lookup failed:', error);
    }

    // Customer not found - proceed as guest
    setStatus('SUCCESS');
    setTimeout(() => {
      onComplete({
        name: firstName,
        lastNameInitial: lastInitial,
        method: 'ID_SCAN',
        loyaltyStatus: 'Guest',
        driversLicense: parsed.licenseNumber,
        dateOfBirth: parsed.dateOfBirth,
        age: parsed.age,
      });
      // Reset state for next scan
      setScannedInfo(null);
      setFoundCustomer(null);
      setStatus('READY');
    }, 1500);
  };

  // Confirm found customer (called when user clicks "That's Me!" or "Check In")
  const confirmFoundCustomer = () => {
    if (!foundCustomer || !scannedInfo) return;

    // Prevent double-click
    const customerData = {
      name: foundCustomer.first_name,
      lastNameInitial: foundCustomer.last_name?.[0]?.toUpperCase() || '',
      method: 'ID_SCAN',
      loyaltyStatus: foundCustomer.loyalty_member ? 'Member' : 'Guest',
      customerId: foundCustomer.id,
      driversLicense: scannedInfo.licenseNumber,
      dateOfBirth: scannedInfo.dateOfBirth,
      age: scannedInfo.age,
    };

    // Reset state FIRST to prevent double submissions
    setScannedInfo(null);
    setFoundCustomer(null);
    setStatus('READY');
    resetScan();

    // Then call onComplete
    onComplete(customerData);
  };

  // Continue as guest (when "Not Me" is clicked)
  const continueAsGuest = () => {
    if (!scannedInfo) return;

    // Prevent double-click
    const guestData = {
      name: scannedInfo.firstName,
      lastNameInitial: scannedInfo.lastName?.[0]?.toUpperCase() || '',
      method: 'ID_SCAN',
      loyaltyStatus: 'Guest',
      driversLicense: scannedInfo.licenseNumber,
      dateOfBirth: scannedInfo.dateOfBirth,
      age: scannedInfo.age,
    };

    // Reset state FIRST to prevent double submissions
    setScannedInfo(null);
    setFoundCustomer(null);
    setStatus('READY');
    resetScan();

    // Then call onComplete
    onComplete(guestData);
  };

  const resetScan = () => {
    setScanBuffer('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  // Manual trigger for testing
  const handleManualScan = () => {
    processScan('SAMPLE_SCAN_DATA_JOHN_DOE');
  };

  // Handle loyalty signup
  const handleLoyaltySignup = async () => {
    if (!foundCustomer || !scannedInfo) return;

    // Store data before changing state
    const customerData = {
      name: foundCustomer.first_name,
      lastNameInitial: foundCustomer.last_name?.[0]?.toUpperCase() || '',
      method: 'ID_SCAN',
      loyaltyStatus: 'Member',
      customerId: foundCustomer.id,
      driversLicense: scannedInfo.licenseNumber,
      dateOfBirth: scannedInfo.dateOfBirth,
      age: scannedInfo.age,
    };

    setStatus('UPDATING_LOYALTY');

    try {
      // Update customer in POSaBIT to enable loyalty
      await updateCustomer(foundCustomer.id, {
        loyaltyMember: true,
        marketingOptIn: true,
      });

      // Reset state FIRST
      setScannedInfo(null);
      setFoundCustomer(null);
      setStatus('READY');
      resetScan();

      // Complete check-in with loyalty status
      onComplete(customerData);
    } catch (error) {
      console.error('Failed to update loyalty status:', error);
      // Still check them in (but as their current status)
      setScannedInfo(null);
      setFoundCustomer(null);
      setStatus('READY');
      resetScan();
      onComplete({ ...customerData, loyaltyStatus: 'Guest' });
    }
  };

  // Skip loyalty and check in
  const skipLoyalty = () => {
    confirmFoundCustomer();
  };

  // FOUND state - Customer is LOYALTY MEMBER, show Welcome Back!
  if (status === 'FOUND' && foundCustomer && scannedInfo && foundCustomer.loyalty_member) {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
        <div className="text-8xl mb-8">👋</div>
        <h2 className="text-4xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Welcome Back!
        </h2>
        <p className="text-3xl text-white mb-2">
          {foundCustomer.first_name} {foundCustomer.last_name?.[0] || ''}.
        </p>
        <p className="text-gold text-xl mb-4">Loyalty Member</p>

        {/* Show scanned info */}
        <div className="mb-8 p-4 rounded-xl bg-green-900/30 border border-green-700">
          <div className="grid grid-cols-2 gap-2 text-left text-lg">
            <span className="text-zinc-400">DOB:</span>
            <span className="text-white">{formatDOB(scannedInfo.dateOfBirth || '')}</span>
            <span className="text-zinc-400">Age:</span>
            <span className="text-green-400 font-bold">{scannedInfo.age} years old ✓</span>
            {scannedInfo.licenseNumber && (
              <>
                <span className="text-zinc-400">DL #:</span>
                <span className="text-white font-mono text-sm">{scannedInfo.licenseNumber}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={continueAsGuest}
            className="flex-1 p-6 rounded-xl text-xl font-craft bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
          >
            Not Me
          </button>
          <button
            onClick={confirmFoundCustomer}
            className="flex-1 p-6 rounded-xl text-xl font-craft font-bold bg-gold text-black hover:bg-[#d8c19d] transition-all"
          >
            Check In
          </button>
        </div>

        {/* Hidden input to maintain scanner focus */}
        <input
          ref={inputRef}
          type="text"
          className="opacity-0 absolute -left-[9999px]"
          onChange={handleScanInput}
          autoComplete="off"
        />
      </div>
    );
  }

  // FOUND state - Customer is NOT a loyalty member, show loyalty prompt
  if (status === 'FOUND' && foundCustomer && scannedInfo && !foundCustomer.loyalty_member) {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
        <div className="text-8xl mb-6">🎁</div>
        <h2 className="text-4xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Welcome Back, {foundCustomer.first_name}!
        </h2>
        <p className="text-xl text-white mb-2">
          Would you like to join our <span className="text-gold font-bold">Loyalty Program</span>?
        </p>
        <p className="text-zinc-400 mb-6 text-sm">
          Earn points on every purchase and get exclusive rewards!
        </p>

        {/* Show scanned info */}
        <div className="mb-8 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
          <div className="grid grid-cols-2 gap-2 text-left text-lg">
            <span className="text-zinc-400">DOB:</span>
            <span className="text-white">{formatDOB(scannedInfo.dateOfBirth || '')}</span>
            <span className="text-zinc-400">Age:</span>
            <span className="text-green-400 font-bold">{scannedInfo.age} years old ✓</span>
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
            onClick={handleLoyaltySignup}
            className="flex-1 p-6 rounded-xl text-xl font-craft font-bold bg-gold text-black hover:bg-[#d8c19d] transition-all"
          >
            Yes, Sign Me Up!
          </button>
        </div>

        <button
          onClick={continueAsGuest}
          className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          Not {foundCustomer.first_name}? Click here
        </button>

        {/* Hidden input to maintain scanner focus */}
        <input
          ref={inputRef}
          type="text"
          className="opacity-0 absolute -left-[9999px]"
          onChange={handleScanInput}
          autoComplete="off"
        />
      </div>
    );
  }

  // UPDATING_LOYALTY state - Signing up for loyalty
  if (status === 'UPDATING_LOYALTY') {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
        <div className="animate-spin w-16 h-16 border-4 border-gold border-t-transparent rounded-full mx-auto mb-6"></div>
        <h2 className="text-4xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Signing You Up...
        </h2>
        <p className="text-zinc-400">Adding you to our loyalty program!</p>
      </div>
    );
  }

  return (
    <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
      <div className="mb-12 relative inline-block">
        <div className={`w-64 h-80 border-4 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all duration-300 ${
          status === 'SCANNING' ? 'border-gold bg-gold/20' :
          status === 'SUCCESS' || status === 'FOUND' ? 'border-green-500 bg-green-500/20' :
          status === 'UNDERAGE' ? 'border-red-500 bg-red-500/20' :
          'border-gold/40 bg-zinc-800 animate-pulse'
        }`}>
          {status === 'SUCCESS' ? (
            <svg className="w-24 h-24 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          ) : status === 'UNDERAGE' ? (
            <svg className="w-24 h-24 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : (
            <>
              <svg className="w-24 h-24 text-gold mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <div className="h-1 bg-gold absolute w-48 top-1/2 left-1/2 -translate-x-1/2 animate-bounce opacity-80"></div>
            </>
          )}
        </div>
      </div>

      <h2 className={`text-4xl font-craft font-bold mb-6 uppercase tracking-tighter ${
        status === 'UNDERAGE' ? 'text-red-500' : 'text-white'
      }`}>
        {status === 'SCANNING' ? 'Reading ID...' :
         status === 'SUCCESS' ? 'ID Verified!' :
         status === 'UNDERAGE' ? 'MUST BE 21+' :
         'Scan Your ID Now'}
      </h2>

      {/* Show scanned info when available */}
      {scannedInfo && (status === 'SUCCESS' || status === 'UNDERAGE') && (
        <div className={`mb-6 p-4 rounded-xl ${
          status === 'UNDERAGE' ? 'bg-red-900/30 border border-red-700' : 'bg-green-900/30 border border-green-700'
        }`}>
          <div className="grid grid-cols-2 gap-2 text-left text-lg">
            <span className="text-zinc-400">Name:</span>
            <span className="text-white font-bold">{scannedInfo.firstName} {scannedInfo.lastName}</span>
            <span className="text-zinc-400">DOB:</span>
            <span className="text-white">{formatDOB(scannedInfo.dateOfBirth || '')}</span>
            <span className="text-zinc-400">Age:</span>
            <span className={`font-bold ${scannedInfo.isOver21 ? 'text-green-400' : 'text-red-400'}`}>
              {scannedInfo.age} years old {scannedInfo.isOver21 ? '✓' : '✗'}
            </span>
            {scannedInfo.licenseNumber && (
              <>
                <span className="text-zinc-400">DL #:</span>
                <span className="text-white font-mono text-sm">{scannedInfo.licenseNumber}</span>
              </>
            )}
          </div>
        </div>
      )}

      <p className={`text-xl mb-12 ${status === 'UNDERAGE' ? 'text-red-400' : 'text-zinc-400'}`}>
        {status === 'READY' && 'Place the barcode on the back of your ID under the scanner.'}
        {status === 'SCANNING' && 'Please wait while we verify your information...'}
        {status === 'SUCCESS' && 'Welcome! Adding you to the queue...'}
        {status === 'UNDERAGE' && 'Sorry, you must be 21 or older to enter. Please see a staff member.'}
      </p>

      {/* Hidden input for scanner - scanners act as keyboards */}
      <input
        ref={inputRef}
        type="text"
        className="opacity-0 absolute -left-[9999px]"
        onChange={handleScanInput}
        onBlur={() => inputRef.current?.focus()}
        autoComplete="off"
        autoFocus
      />

      {/* Debug info */}
      {scanBuffer && (
        <div className="mb-4 text-xs text-zinc-600 font-mono break-all max-w-md mx-auto">
          Scan buffer: {scanBuffer.substring(0, 50)}...
        </div>
      )}

      {/* Manual trigger for testing */}
      <button
        onClick={handleManualScan}
        className="text-zinc-500 hover:text-gold transition-colors underline underline-offset-4 text-sm font-craft"
      >
        [ Test: Simulate Scan ]
      </button>
    </div>
  );
};

export default IDScan;
