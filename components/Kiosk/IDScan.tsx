
import React, { useState, useEffect, useRef } from 'react';
import { Customer } from '../../types';
import { lookupCustomerByName, updateCustomer, createCustomer, KioskCustomer } from '../../services/kioskApi';
import TouchKeyboard from './TouchKeyboard';

interface IDScanProps {
  onComplete: (data: Partial<Customer>) => void;
}

interface ParsedLicense {
  firstName: string;
  lastName: string;
  middleName?: string;
  licenseNumber?: string;
  dateOfBirth?: string;  // MMDDYYYY format
  age?: number;
  isOver21?: boolean;
  // Address fields
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  // Demographics
  gender?: 'M' | 'F' | 'X';  // M=Male, F=Female, X=Non-binary/Other
  eyeColor?: string;
  height?: string;
  expirationDate?: string;
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
//   DAG = Street Address
//   DAI = City
//   DAJ = State
//   DAK = Zip Code
//   DBC = Sex (1=Male, 2=Female, 9=Not specified)
//   DAY = Eye Color
//   DAU = Height
const parseDriversLicense = (scanData: string): ParsedLicense | null => {
  try {
    const fields: Record<string, string> = {};

    // All known AAMVA 3-letter field codes
    const allFieldCodes = [
      'DAA', 'DAB', 'DAC', 'DAD', 'DAE', 'DAF', 'DAG', 'DAH', 'DAI', 'DAJ', 'DAK', 'DAL', 'DAM', 'DAN', 'DAO', 'DAP', 'DAQ', 'DAR', 'DAS', 'DAT', 'DAU', 'DAV', 'DAW', 'DAX', 'DAY', 'DAZ',
      'DBA', 'DBB', 'DBC', 'DBD', 'DBE', 'DBF', 'DBG', 'DBH', 'DBI', 'DBJ', 'DBK', 'DBL', 'DBM', 'DBN', 'DBO', 'DBP', 'DBQ', 'DBR', 'DBS',
      'DCA', 'DCB', 'DCC', 'DCD', 'DCE', 'DCF', 'DCG', 'DCH', 'DCI', 'DCJ', 'DCK', 'DCL', 'DCM', 'DCN', 'DCO', 'DCP', 'DCQ', 'DCR', 'DCS', 'DCT', 'DCU',
      'DDA', 'DDB', 'DDC', 'DDD', 'DDE', 'DDF', 'DDG', 'DDH', 'DDI', 'DDJ', 'DDK', 'DDL',
      'DFN', 'DLN', 'DEN'
    ];

    // Create a regex pattern to find all field codes and their positions
    const fieldCodeRegex = new RegExp(`(${allFieldCodes.join('|')})`, 'g');

    // Find all field code positions
    const matches: { code: string; index: number }[] = [];
    let match;
    while ((match = fieldCodeRegex.exec(scanData)) !== null) {
      matches.push({ code: match[1], index: match.index });
    }

    // Extract value for each field code (from after code to next code)
    for (let i = 0; i < matches.length; i++) {
      const { code, index } = matches[i];
      const startPos = index + 3; // After the 3-letter code
      const endPos = i < matches.length - 1 ? matches[i + 1].index : scanData.length;

      let value = scanData.substring(startPos, endPos);
      // Clean control characters
      value = value.replace(/[\x00-\x1F]/g, '').trim();

      if (value && !fields[code]) {
        fields[code] = value;
      }
    }

    // Also try splitting by control characters as backup
    const segments = scanData.split(/[\x1D\x1E\x0A\x0D\n\r]+/);
    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed || trimmed.length < 4) continue;

      // Match 3-letter field codes at start
      const segMatch = trimmed.match(/^([A-Z]{3})(.+)$/);
      if (segMatch && allFieldCodes.includes(segMatch[1])) {
        const [, code, value] = segMatch;
        const cleanValue = value.replace(/[\x00-\x1F]/g, '').trim();
        if (cleanValue && !fields[code]) {
          fields[code] = cleanValue;
        }
      }
    }

    // Extract name fields with fallbacks
    let firstName = fields['DAC'] || fields['DCT'] || fields['DFN'] || '';
    let lastName = fields['DCS'] || fields['DLN'] || '';
    const middleName = fields['DAD'] || '';
    const licenseNumber = fields['DAQ'] || fields['DAN'] || '';
    const dateOfBirth = fields['DBB'] || '';
    const expirationDate = fields['DBA'] || '';

    // Address fields - clean them properly
    let address = fields['DAG'] || '';
    let city = fields['DAI'] || '';
    let state = fields['DAJ'] || '';
    let zipCode = fields['DAK'] || '';

    // State should be exactly 2 letters
    if (state.length > 2) {
      state = state.substring(0, 2);
    }

    // Clean zip code - first 5 digits only
    zipCode = zipCode.replace(/[^0-9]/g, '').substring(0, 5);

    // Demographics
    const genderCode = fields['DBC'] || '';
    let gender: 'M' | 'F' | 'X' | undefined;
    if (genderCode === '1') gender = 'M';
    else if (genderCode === '2') gender = 'F';
    else if (genderCode) gender = 'X';

    let eyeColor = fields['DAY'] || '';
    let height = fields['DAU'] || '';

    // Clean height - should be like "068 in" or "5-09"
    if (height.length > 10) {
      // Likely captured too much, extract just the height portion
      const heightMatch = height.match(/^(\d{3}\s*in|\d-\d{2})/);
      if (heightMatch) {
        height = heightMatch[1];
      } else {
        height = height.substring(0, 6).trim();
      }
    }

    // Clean up names - remove trailing non-alpha chars but keep the name
    firstName = firstName.replace(/[^A-Za-z\-' ]/g, '').trim();
    lastName = lastName.replace(/[^A-Za-z\-' ]/g, '').trim();

    // If middle name is "NONE", clear it
    const cleanMiddle = middleName.replace(/[^A-Za-z\-' ]/g, '').trim();

    // Take only first word if multiple
    if (firstName.includes(' ')) firstName = firstName.split(/\s+/)[0];
    if (lastName.includes(' ')) lastName = lastName.split(/\s+/)[0];

    // Calculate age from DOB
    const ageInfo = calculateAge(dateOfBirth);

    if (!firstName) {
      return null;
    }

    // Proper case the names
    const properCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

    return {
      firstName: properCase(firstName),
      lastName: lastName ? properCase(lastName) : '',
      middleName: cleanMiddle && cleanMiddle.toUpperCase() !== 'NONE' ? properCase(cleanMiddle) : undefined,
      licenseNumber,
      dateOfBirth,
      age: ageInfo?.age,
      isOver21: ageInfo?.isOver21,
      // Address
      address: address || undefined,
      city: city ? properCase(city) : undefined,
      state: state?.toUpperCase() || undefined,
      zipCode: zipCode || undefined,
      // Demographics
      gender,
      eyeColor: eyeColor || undefined,
      height: height || undefined,
      expirationDate: expirationDate || undefined,
    };
  } catch (e) {
    console.error('Failed to parse license:', e);
    return null;
  }
};

const IDScan: React.FC<IDScanProps> = ({ onComplete }) => {
  const [status, setStatus] = useState<'READY' | 'SCANNING' | 'FOUND' | 'LOYALTY_PROMPT' | 'EMAIL_ENTRY' | 'UPDATING_LOYALTY' | 'SUCCESS' | 'UNDERAGE' | 'INVALID_SCAN'>('READY');
  const [scanBuffer, setScanBuffer] = useState('');
  const [scannedInfo, setScannedInfo] = useState<ParsedLicense | null>(null);
  const [foundCustomer, setFoundCustomer] = useState<KioskCustomer | null>(null);
  const [email, setEmail] = useState('');
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

    // Validate scan data before parsing
    // Real AAMVA PDF417 barcodes are typically 200+ characters
    // Small 1D barcodes or invalid scans are usually much shorter
    const isLikelyValidBarcode = (data: string): boolean => {
      // Check minimum length - AAMVA barcodes are typically 200-700 chars
      if (data.length < 100) {
        return false;
      }

      // Check for AAMVA header markers (ANSI, AAMVA, or starts with @)
      const hasAAMVAMarker = data.includes('ANSI') ||
                             data.includes('AAMVA') ||
                             data.startsWith('@') ||
                             data.includes('DL') ||
                             data.includes('ID');

      // Check for at least some known field codes
      const fieldCodesFound = ['DCS', 'DAC', 'DAQ', 'DBB', 'DAG'].filter(code =>
        data.includes(code)
      ).length;

      // Need marker or at least 2 field codes
      return hasAAMVAMarker || fieldCodesFound >= 2;
    };

    // Check if this looks like a valid DL barcode
    if (!isLikelyValidBarcode(scanData)) {
      setStatus('INVALID_SCAN');
      // Auto-reset after 4 seconds
      setTimeout(() => {
        resetScan();
        setStatus('READY');
      }, 4000);
      return;
    }

    // Parse the scanned data
    const parsed = parseDriversLicense(scanData);

    if (!parsed) {
      setStatus('INVALID_SCAN');
      // Auto-reset after 4 seconds
      setTimeout(() => {
        resetScan();
        setStatus('READY');
      }, 4000);
      return;
    }

    // Additional validation: must have at least first name AND (last name OR DOB)
    if (!parsed.firstName || (!parsed.lastName && !parsed.dateOfBirth)) {
      setStatus('INVALID_SCAN');
      setTimeout(() => {
        resetScan();
        setStatus('READY');
      }, 4000);
      return;
    }

    const firstName = parsed.firstName || 'Guest';
    const lastName = parsed.lastName || '';
    const lastInitial = lastName ? lastName[0].toUpperCase() : '';

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

    // Customer not found - create customer record with DL demographics (no loyalty)
    setStatus('SUCCESS');

    let newCustomerId: number | undefined;
    try {
      const newCustomer = await createCustomer({
        firstName: firstName,
        lastName: lastName || undefined,
        telephone: '', // No phone from DL
        loyaltyOptIn: false,
        // Demographics from DL
        address1: parsed.address,
        city: parsed.city,
        state: parsed.state,
        zipCode: parsed.zipCode,
        dateOfBirth: parsed.dateOfBirth,
        gender: parsed.gender,
      });
      newCustomerId = newCustomer.id;
    } catch (error) {
      // Silently fail - still check them in as guest
      console.error('Failed to create customer from DL:', error);
    }

    setTimeout(() => {
      onComplete({
        name: firstName,
        lastNameInitial: lastInitial,
        method: 'ID_SCAN',
        loyaltyStatus: 'Guest',
        customerId: newCustomerId,
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

  // Handle loyalty signup - go to email entry first
  const handleLoyaltySignup = () => {
    if (!foundCustomer || !scannedInfo) return;
    setEmail(''); // Clear any previous email
    setStatus('EMAIL_ENTRY');
  };

  // Submit email and complete loyalty signup
  const submitEmailAndSignup = async () => {
    if (!foundCustomer || !scannedInfo || !email) return;

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
      // Update customer in POSaBIT with email, loyalty, and demographics
      await updateCustomer(foundCustomer.id, {
        loyaltyMember: true,
        marketingOptIn: true,
        email: email,
        // Include demographics from DL
        address1: scannedInfo.address,
        city: scannedInfo.city,
        state: scannedInfo.state,
        zipCode: scannedInfo.zipCode,
        dateOfBirth: scannedInfo.dateOfBirth,
        gender: scannedInfo.gender,
      });

      // Reset state FIRST
      setScannedInfo(null);
      setFoundCustomer(null);
      setEmail('');
      setStatus('READY');
      resetScan();

      // Complete check-in with loyalty status
      onComplete(customerData);
    } catch (error) {
      console.error('Failed to update loyalty status:', error);
      // Still check them in (but as their current status)
      setScannedInfo(null);
      setFoundCustomer(null);
      setEmail('');
      setStatus('READY');
      resetScan();
      onComplete({ ...customerData, loyaltyStatus: 'Guest' });
    }
  };

  // Skip loyalty but still update demographics from DL
  const skipLoyalty = async () => {
    if (!foundCustomer || !scannedInfo) return;

    // Store customer data before any state changes
    const customerData = {
      name: foundCustomer.first_name,
      lastNameInitial: foundCustomer.last_name?.[0]?.toUpperCase() || '',
      method: 'ID_SCAN',
      loyaltyStatus: 'Guest' as const,
      customerId: foundCustomer.id,
      driversLicense: scannedInfo.licenseNumber,
      dateOfBirth: scannedInfo.dateOfBirth,
      age: scannedInfo.age,
    };

    // Update customer with demographics from DL (even without loyalty signup)
    try {
      await updateCustomer(foundCustomer.id, {
        address1: scannedInfo.address,
        city: scannedInfo.city,
        state: scannedInfo.state,
        zipCode: scannedInfo.zipCode,
        dateOfBirth: scannedInfo.dateOfBirth,
        gender: scannedInfo.gender,
      });
    } catch (error) {
      // Silently fail - still check them in
      console.error('Failed to update demographics:', error);
    }

    // Reset state and complete check-in
    setScannedInfo(null);
    setFoundCustomer(null);
    setStatus('READY');
    resetScan();
    onComplete(customerData);
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
          onKeyDown={(e) => { if (e.altKey || (e.ctrlKey && e.key === 'm')) e.preventDefault(); }}
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
          onKeyDown={(e) => { if (e.altKey || (e.ctrlKey && e.key === 'm')) e.preventDefault(); }}
          autoComplete="off"
        />
      </div>
    );
  }

  // EMAIL_ENTRY state - Collect email for loyalty signup
  if (status === 'EMAIL_ENTRY' && foundCustomer && scannedInfo) {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl">
        <h2 className="text-3xl font-craft font-bold mb-2 text-gold uppercase tracking-wider">
          Almost Done, {foundCustomer.first_name}!
        </h2>
        <p className="text-zinc-400 mb-6">
          Enter your email to complete your loyalty signup
        </p>

        <TouchKeyboard
          value={email}
          onChange={setEmail}
          onSubmit={submitEmailAndSignup}
          placeholder="your@email.com"
          type="email"
        />

        <button
          onClick={() => setStatus('FOUND')}
          className="mt-6 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          ← Back
        </button>
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

  // INVALID_SCAN state - Wrong barcode scanned
  if (status === 'INVALID_SCAN') {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
        <div className="mb-8">
          <div className="w-64 h-80 border-4 border-dashed rounded-2xl flex flex-col items-center justify-center mx-auto border-orange-500 bg-orange-500/20">
            <svg className="w-24 h-24 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>

        <h2 className="text-4xl font-craft font-bold mb-4 text-orange-500 uppercase tracking-tighter">
          Wrong Barcode
        </h2>
        <p className="text-xl text-zinc-300 mb-4">
          Please scan the <span className="text-gold font-bold">large 2D barcode</span>
        </p>
        <p className="text-lg text-zinc-400 mb-8">
          on the <span className="text-white">back of your ID</span>
        </p>

        {/* Visual guide */}
        <div className="mb-8 p-6 bg-zinc-800/50 rounded-xl border border-zinc-700 inline-block">
          <div className="flex items-center gap-6">
            {/* Wrong barcode */}
            <div className="text-center">
              <div className="w-20 h-8 bg-zinc-700 rounded mb-2 flex items-center justify-center">
                <div className="flex gap-px">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="w-1 h-5 bg-zinc-500" style={{ width: Math.random() > 0.5 ? '2px' : '1px' }}></div>
                  ))}
                </div>
              </div>
              <span className="text-red-400 text-sm">✗ Not this</span>
            </div>

            {/* Arrow */}
            <div className="text-2xl text-zinc-500">→</div>

            {/* Correct barcode */}
            <div className="text-center">
              <div className="w-20 h-20 bg-zinc-700 rounded mb-2 flex items-center justify-center p-2">
                <div className="w-full h-full bg-gradient-to-br from-zinc-600 to-zinc-800 rounded grid grid-cols-4 gap-px p-1">
                  {[...Array(16)].map((_, i) => (
                    <div key={i} className={`${Math.random() > 0.5 ? 'bg-zinc-400' : 'bg-zinc-700'}`}></div>
                  ))}
                </div>
              </div>
              <span className="text-green-400 text-sm">✓ Scan this</span>
            </div>
          </div>
        </div>

        <p className="text-zinc-500 text-sm">
          Resetting in a moment...
        </p>

        {/* Hidden input to maintain scanner focus */}
        <input
          ref={inputRef}
          type="text"
          className="opacity-0 absolute -left-[9999px]"
          onChange={handleScanInput}
          onKeyDown={(e) => { if (e.altKey || (e.ctrlKey && e.key === 'm')) e.preventDefault(); }}
          autoComplete="off"
        />
      </div>
    );
  }

  return (
    <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
      <div className="mb-12 relative inline-block">
        <div className={`w-64 h-80 border-4 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all duration-300 ${
          status === 'SCANNING' ? 'border-gold bg-gold/20' :
          status === 'SUCCESS' || status === 'FOUND' ? 'border-green-500 bg-green-500/20' :
          status === 'UNDERAGE' || status === 'INVALID_SCAN' ? 'border-red-500 bg-red-500/20' :
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
        onKeyDown={(e) => { if (e.altKey || (e.ctrlKey && e.key === 'm')) e.preventDefault(); }}
        autoComplete="off"
        autoFocus
      />
    </div>
  );
};

export default IDScan;
