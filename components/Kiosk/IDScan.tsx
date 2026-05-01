
import React, { useState, useEffect, useRef } from 'react';
import { Customer } from '../../types';
import { lookupCustomerByName, lookupCustomerByLicense, lookupCustomerByDobLastname, lookupCustomer, fetchCustomerById, updateCustomer, createCustomer, getQueue, logFailedScan, KioskCustomer } from '../../services/kioskApi';
import TouchKeyboard from './TouchKeyboard';

interface IDScanProps {
  onComplete: (data: Partial<Customer>) => void;
  onGoHome?: () => void;
  pendingScanData?: string | null;
  onPendingScanConsumed?: () => void;
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

    // Find field codes by scanning for each code independently to avoid
    // regex overlap issues (e.g., "BEAMGUARDDAC" → regex sees "DDA" before "DAC")
    const allMatches: { code: string; index: number }[] = [];
    for (const code of allFieldCodes) {
      let pos = 0;
      while ((pos = scanData.indexOf(code, pos)) !== -1) {
        allMatches.push({ code, index: pos });
        pos += 3;
      }
    }

    // Sort by position, then prefer priority codes when two overlap
    allMatches.sort((a, b) => a.index - b.index || 0);

    // Deduplicate: when two codes overlap at adjacent positions, keep the priority one
    const priorityCodes = new Set(['DCS', 'DAC', 'DAD', 'DAQ', 'DBB', 'DAG', 'DAI', 'DAJ', 'DAK', 'DBA', 'DBC', 'DAY', 'DAU', 'DBD', 'DCA', 'DCB', 'DCD', 'DCF', 'DCG']);
    const matches: { code: string; index: number }[] = [];
    for (let i = 0; i < allMatches.length; i++) {
      const curr = allMatches[i];
      // Skip if this overlaps with the previous accepted match
      if (matches.length > 0) {
        const prev = matches[matches.length - 1];
        if (curr.index < prev.index + 3) {
          // Overlapping — keep the priority one
          if (priorityCodes.has(curr.code) && !priorityCodes.has(prev.code)) {
            matches.pop(); // Replace previous with current
          } else {
            continue; // Skip current
          }
        }
      }
      matches.push(curr);
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

    // Calculate age from DOB
    const ageInfo = calculateAge(dateOfBirth);

    if (!firstName) {
      return null;
    }

    // Proper case the names (handles multi-word names like "Van Houten")
    const properCase = (s: string) => s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

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

const IDScan: React.FC<IDScanProps> = ({ onComplete, onGoHome, pendingScanData, onPendingScanConsumed }) => {
  const [status, setStatus] = useState<'READY' | 'SCANNING' | 'FOUND' | 'LOYALTY_PROMPT' | 'EMAIL_ENTRY' | 'UPDATING_LOYALTY' | 'SUCCESS' | 'UNDERAGE' | 'INVALID_SCAN' | 'NEW_CUSTOMER_PHONE' | 'NEW_CUSTOMER_LOYALTY_PROMPT' | 'NEW_CUSTOMER_EMAIL' | 'LINK_ACCOUNT_PHONE' | 'LINK_ACCOUNT_SEARCHING' | 'LINK_ACCOUNT_VERIFYING' | 'LINK_ACCOUNT_FOUND' | 'LINK_ACCOUNT_NOT_FOUND' | 'LINK_ACCOUNT_MISMATCH' | 'AUTO_CHECKIN' | 'ALREADY_IN_QUEUE'>('READY');
  const [scanBuffer, setScanBuffer] = useState('');
  const [scannedInfo, setScannedInfo] = useState<ParsedLicense | null>(null);
  const [foundCustomer, setFoundCustomer] = useState<KioskCustomer | null>(null);
  const [foundByDL, setFoundByDL] = useState(false);
  const [email, setEmail] = useState('');
  const [linkPhone, setLinkPhone] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [pinError, setPinError] = useState(false);
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

  // Process pending scan data from home screen auto-scan
  useEffect(() => {
    if (pendingScanData && status === 'READY') {
      onPendingScanConsumed?.();
      processScan(pendingScanData);
    }
  }, [pendingScanData]);

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
      logFailedScan(scanData, 'not_aamva_marker').catch(() => {});
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
      logFailedScan(scanData, 'parse_returned_null').catch(() => {});
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
      const missing = [
        !parsed.firstName ? 'firstName' : null,
        !parsed.lastName ? 'lastName' : null,
        !parsed.dateOfBirth ? 'dateOfBirth' : null,
      ].filter(Boolean).join(',');
      logFailedScan(scanData, `missing_required_fields:${missing}`).catch(() => {});
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

    // Age verified - look up customer by DL number first (most reliable), then fall back to name
    try {
      // Strategy 1: Search by driver's license number (unique identifier)
      if (parsed.licenseNumber) {
        console.log('Looking up customer by DL number:', parsed.licenseNumber);
        const dlResult = await lookupCustomerByLicense(parsed.licenseNumber);
        if (dlResult.found && dlResult.customer) {
          console.log('Customer found by DL number:', dlResult.customer.first_name, dlResult.customer.last_name);
          setFoundCustomer(dlResult.customer);
          setFoundByDL(true);

          // DL match = high confidence → check queue and auto check-in
          const alreadyQueued = await isCustomerInQueue(dlResult.customer.id);
          if (alreadyQueued) {
            setStatus('ALREADY_IN_QUEUE');
            setTimeout(() => {
              setScannedInfo(null);
              setFoundCustomer(null);
              setFoundByDL(false);
              resetScan();
              onGoHome?.();
            }, 4000);
          } else {
            setStatus('AUTO_CHECKIN');
            // Auto check-in after 6 second confirmation display
            setTimeout(() => {
              autoCheckIn(dlResult.customer, parsed);
            }, 6000);
          }
          return;
        }
      }

      // Strategy 2: DOB + last name (catches renewed DLs, nickname vs legal name)
      if (parsed.dateOfBirth && lastName) {
        const dob = parsed.dateOfBirth;
        if (dob.length === 8) {
          const birthday = `${dob.substring(4, 8)}-${dob.substring(0, 2)}-${dob.substring(2, 4)}`;
          console.log('DL lookup miss — trying DOB+lastname:', birthday, lastName);
          const dobResult = await lookupCustomerByDobLastname(birthday, lastName);
          if (dobResult.found && dobResult.customer) {
            console.log('Customer found by DOB+lastname:', dobResult.customer.first_name, dobResult.customer.last_name);
            setFoundCustomer(dobResult.customer);
            setFoundByDL(false);

            const alreadyQueued = await isCustomerInQueue(dobResult.customer.id);
            if (alreadyQueued) {
              setStatus('ALREADY_IN_QUEUE');
              setTimeout(() => {
                setScannedInfo(null);
                setFoundCustomer(null);
                setFoundByDL(false);
                resetScan();
                onGoHome?.();
              }, 4000);
            } else {
              setStatus('AUTO_CHECKIN');
              setTimeout(() => {
                autoCheckIn(dobResult.customer, parsed);
              }, 6000);
            }
            return;
          }
        }
      }

      // Strategy 3: Fall back to name search — still auto check-in if found
      console.log('DL+DOB lookup miss — trying name search:', firstName, lastName);
      setFoundByDL(false);
      const result = await lookupCustomerByName(firstName, lastName);
      if (result.found && result.customer) {
        setFoundCustomer(result.customer);

        // Check if already in queue
        const alreadyQueued = await isCustomerInQueue(result.customer.id);
        if (alreadyQueued) {
          setStatus('ALREADY_IN_QUEUE');
          setTimeout(() => {
            setScannedInfo(null);
            setFoundCustomer(null);
            setFoundByDL(false);
            setStatus('READY');
            resetScan();
          }, 4000);
        } else {
          setStatus('AUTO_CHECKIN');
          // Auto check-in after brief confirmation display (6 seconds)
          setTimeout(() => {
            autoCheckIn(result.customer, parsed);
          }, 6000);
        }
        return;
      }
    } catch (error) {
      console.error('Customer lookup failed:', error);
    }

    // Customer not found - capture phone first (preserves the data for createCustomer + lets us short-circuit if the phone matches an existing account)
    setFoundCustomer(null);
    setFoundByDL(false);
    setNewCustomerPhone('');
    setStatus('NEW_CUSTOMER_PHONE');
  };

  // Check if customer is already in the queue (by customer_id)
  const isCustomerInQueue = async (customerId: number): Promise<boolean> => {
    try {
      const response = await getQueue();
      if (!response?.customer_queues) return false;
      return response.customer_queues.some(
        q => q.customer_id === customerId && (q.aasm_state === 'open' || q.aasm_state === 'processing')
      );
    } catch (error) {
      console.error('Queue check failed:', error);
      return false;
    }
  };

  // Auto check-in for found customers (no buttons)
  // Called immediately when AUTO_CHECKIN is set — adds to queue right away
  const autoCheckIn = (customer: KioskCustomer, scan: ParsedLicense) => {
    const customerData = {
      name: customer.first_name,
      lastNameInitial: customer.last_name?.[0]?.toUpperCase() || '',
      method: 'ID_SCAN' as const,
      loyaltyStatus: customer.loyalty_member ? 'Member' as const : 'Guest' as const,
      customerId: customer.id,
      driversLicense: scan.licenseNumber,
      dateOfBirth: scan.dateOfBirth,
      age: scan.age,
    };

    // Auto-link DL to account if not already on file (fire-and-forget)
    if (scan.licenseNumber && !customer.drivers_license) {
      updateCustomer(customer.id, {
        driversLicense: scan.licenseNumber,
        address1: scan.address,
        city: scan.city,
        state: scan.state,
        zipCode: scan.zipCode,
        dateOfBirth: scan.dateOfBirth,
        gender: scan.gender,
      }).then(() => {
        console.log('Auto-linked DL + demographics to customer', customer.id);
      }).catch((err) => {
        console.error('Failed to auto-link DL (non-blocking):', err);
      });
    }

    // Reset state — don't set READY (KioskHome confirmation takes over)
    setScannedInfo(null);
    setFoundCustomer(null);
    setFoundByDL(false);
    resetScan();

    onComplete(customerData);
  };

  // New customer declines loyalty — create with DL demographics only
  const newCustomerSkipLoyalty = async () => {
    if (!scannedInfo) return;

    const firstName = scannedInfo.firstName || 'Guest';
    const lastName = scannedInfo.lastName || '';
    const lastInitial = lastName ? lastName[0].toUpperCase() : '';

    setStatus('SUCCESS');

    let newCustomerId: number | undefined;
    try {
      const newCustomer = await createCustomer({
        firstName,
        lastName: lastName || undefined,
        telephone: newCustomerPhone,
        loyaltyOptIn: false,
        driversLicense: scannedInfo.licenseNumber,
        address1: scannedInfo.address,
        city: scannedInfo.city,
        state: scannedInfo.state,
        zipCode: scannedInfo.zipCode,
        dateOfBirth: scannedInfo.dateOfBirth,
        gender: scannedInfo.gender,
      });
      newCustomerId = newCustomer.id;
    } catch (error) {
      console.error('Failed to create customer from DL:', error);
    }

    setTimeout(() => {
      onComplete({
        name: firstName,
        lastNameInitial: lastInitial,
        method: 'ID_SCAN',
        loyaltyStatus: 'Guest',
        customerId: newCustomerId,
        driversLicense: scannedInfo.licenseNumber,
        dateOfBirth: scannedInfo.dateOfBirth,
        age: scannedInfo.age,
      });
      setScannedInfo(null);
      setFoundCustomer(null);
      setNewCustomerPhone('');
      setStatus('READY');
    }, 1500);
  };

  // New customer wants loyalty — go to email entry
  const newCustomerLoyaltySignup = () => {
    if (!scannedInfo) return;
    setEmail('');
    setStatus('NEW_CUSTOMER_EMAIL');
  };

  // New customer submits email for loyalty — create customer with DL + email + loyalty
  const newCustomerSubmitEmail = async () => {
    if (!scannedInfo || !email) return;

    const firstName = scannedInfo.firstName || 'Guest';
    const lastName = scannedInfo.lastName || '';
    const lastInitial = lastName ? lastName[0].toUpperCase() : '';

    setStatus('UPDATING_LOYALTY');

    try {
      const newCustomer = await createCustomer({
        firstName,
        lastName: lastName || undefined,
        telephone: newCustomerPhone,
        email,
        loyaltyOptIn: true,
        driversLicense: scannedInfo.licenseNumber,
        address1: scannedInfo.address,
        city: scannedInfo.city,
        state: scannedInfo.state,
        zipCode: scannedInfo.zipCode,
        dateOfBirth: scannedInfo.dateOfBirth,
        gender: scannedInfo.gender,
      });

      setScannedInfo(null);
      setFoundCustomer(null);
      setEmail('');
      setNewCustomerPhone('');
      setStatus('READY');
      resetScan();

      onComplete({
        name: firstName,
        lastNameInitial: lastInitial,
        method: 'ID_SCAN',
        loyaltyStatus: 'Member',
        customerId: newCustomer.id,
        driversLicense: scannedInfo.licenseNumber,
        dateOfBirth: scannedInfo.dateOfBirth,
        age: scannedInfo.age,
      });
    } catch (error) {
      console.error('Failed to create loyalty customer:', error);
      // Fallback: create without loyalty
      setEmail('');
      setStatus('READY');
      resetScan();
      newCustomerSkipLoyalty();
    }
  };

  // Link Account - show phone entry
  const startLinkAccount = () => {
    setLinkPhone('');
    setStatus('LINK_ACCOUNT_PHONE');
  };

  // Link Account - phone number helpers
  const linkPhoneAppend = (digit: string) => {
    if (linkPhone.length < 10) setLinkPhone(prev => prev + digit);
  };
  const linkPhoneClear = () => setLinkPhone('');
  const linkPhoneBackspace = () => setLinkPhone(prev => prev.slice(0, -1));

  const formatPhone = (val: string) => {
    if (!val) return '(___) ___-____';
    const cleaned = val.replace(/\D/g, '');
    let formatted = '(' + cleaned.substring(0, 3);
    if (cleaned.length > 3) formatted += ') ' + cleaned.substring(3, 6);
    if (cleaned.length > 6) formatted += '-' + cleaned.substring(6, 10);
    return formatted;
  };

  // Compare DL scan data with account data to determine if auto-link is safe
  const shouldAutoLink = (scan: ParsedLicense, customer: KioskCustomer): boolean => {
    // Rule 1: If DL number matches the one on file → auto-link
    if (scan.licenseNumber && customer.drivers_license) {
      if (scan.licenseNumber.trim().toUpperCase() === customer.drivers_license.trim().toUpperCase()) {
        console.log('Auto-link: DL number match');
        return true;
      }
    }

    // Convert MMDDYYYY to YYYY-MM-DD for comparison with API birthday format
    const scanDobIso = scan.dateOfBirth && scan.dateOfBirth.length === 8
      ? `${scan.dateOfBirth.substring(4, 8)}-${scan.dateOfBirth.substring(0, 2)}-${scan.dateOfBirth.substring(2, 4)}`
      : null;

    // Fuzzy name comparison (handles 1-2 char differences, prefix/nickname matching)
    const namesClose = (a: string, b: string): boolean => {
      const na = (a || '').trim().toUpperCase();
      const nb = (b || '').trim().toUpperCase();
      if (!na || !nb) return false;
      if (na === nb) return true;
      // One is prefix of other (Cam→Cameron, Rob→Robert)
      if (na.length >= 3 && nb.length >= 3) {
        if (na.startsWith(nb) || nb.startsWith(na)) return true;
      }
      // Simple edit distance check (off by 1-2 chars)
      if (Math.abs(na.length - nb.length) <= 2) {
        let mismatches = 0;
        const maxLen = Math.max(na.length, nb.length);
        for (let i = 0; i < maxLen; i++) {
          if ((na[i] || '') !== (nb[i] || '')) mismatches++;
          if (mismatches > 2) return false;
        }
        return true;
      }
      return false;
    };

    const lastNameClose = namesClose(scan.lastName, customer.last_name || '');
    const firstNameClose = namesClose(scan.firstName, customer.first_name || '');

    // Rule 2: DOB matches + last name close → auto-link (handles Cameron/Bruce Crowe)
    if (scanDobIso && customer.birthday && scanDobIso === customer.birthday && lastNameClose) {
      console.log('Auto-link: DOB match + last name close');
      return true;
    }

    // Rule 3: Both first and last names are close → auto-link
    if (firstNameClose && lastNameClose) {
      console.log('Auto-link: Names close match');
      return true;
    }

    console.log('Mismatch detected — requiring manager PIN.',
      'Scan:', scan.firstName, scan.lastName,
      'Account:', customer.first_name, customer.last_name,
      'DOB match:', scanDobIso === customer.birthday);
    return false;
  };

  // New Customer phone helpers (mirrors linkPhone helpers but for the create-account flow)
  const newCustomerPhoneAppend = (digit: string) => {
    if (newCustomerPhone.length < 10) setNewCustomerPhone(prev => prev + digit);
  };
  const newCustomerPhoneClear = () => setNewCustomerPhone('');
  const newCustomerPhoneBackspace = () => setNewCustomerPhone(prev => prev.slice(0, -1));

  // Submit phone for a new-customer flow:
  //   - If phone matches an existing customer, hand off to the existing link-account flow
  //     (auto-link if shouldAutoLink, else manager-PIN). Prevents duplicate accounts.
  //   - If no match, advance to the loyalty prompt with the captured phone in state.
  const submitNewCustomerPhone = async () => {
    if (newCustomerPhone.length < 10) return;

    setStatus('LINK_ACCOUNT_SEARCHING');

    try {
      const result = await lookupCustomer(newCustomerPhone);

      if (result.found && result.customer) {
        setLinkPhone(newCustomerPhone); // mirror so existing link-account UI has the phone
        setFoundCustomer(result.customer);
        setStatus('LINK_ACCOUNT_VERIFYING');

        let fullCustomer = result.customer;
        try {
          const fullResult = await fetchCustomerById(result.customer.id);
          if (fullResult.found && fullResult.customer) {
            fullCustomer = fullResult.customer;
            setFoundCustomer(fullCustomer);
          }
        } catch (err) {
          console.error('Failed to fetch full customer record:', err);
        }

        if (scannedInfo && shouldAutoLink(scannedInfo, fullCustomer)) {
          setStatus('LINK_ACCOUNT_FOUND');
        } else {
          setManagerPin('');
          setPinError(false);
          setStatus('LINK_ACCOUNT_MISMATCH');
        }
      } else {
        // No existing customer with this phone — proceed to loyalty prompt with phone preserved
        setStatus('NEW_CUSTOMER_LOYALTY_PROMPT');
      }
    } catch (error) {
      console.error('Phone lookup for new customer failed:', error);
      // Fail-open: don't block check-in if lookup errors
      setStatus('NEW_CUSTOMER_LOYALTY_PROMPT');
    }
  };

  // Skip phone capture — proceed to loyalty prompt without a phone number
  const skipNewCustomerPhone = () => {
    setNewCustomerPhone('');
    setStatus('NEW_CUSTOMER_LOYALTY_PROMPT');
  };

  // Link Account - submit phone and search
  const linkAccountSubmitPhone = async () => {
    if (linkPhone.length < 10) return;

    setStatus('LINK_ACCOUNT_SEARCHING');

    try {
      const result = await lookupCustomer(linkPhone);

      if (result.found && result.customer) {
        setFoundCustomer(result.customer);

        // Fetch full record from API to get birthday and drivers_license
        setStatus('LINK_ACCOUNT_VERIFYING');
        let fullCustomer = result.customer;

        try {
          const fullResult = await fetchCustomerById(result.customer.id);
          if (fullResult.found && fullResult.customer) {
            fullCustomer = fullResult.customer;
            setFoundCustomer(fullCustomer);
          }
        } catch (err) {
          console.error('Failed to fetch full customer record:', err);
        }

        // Compare DL scan data with account data
        if (scannedInfo && shouldAutoLink(scannedInfo, fullCustomer)) {
          setStatus('LINK_ACCOUNT_FOUND');
        } else {
          setManagerPin('');
          setPinError(false);
          setStatus('LINK_ACCOUNT_MISMATCH');
        }
      } else {
        setStatus('LINK_ACCOUNT_NOT_FOUND');
      }
    } catch (error) {
      console.error('Phone lookup for link failed:', error);
      setStatus('LINK_ACCOUNT_NOT_FOUND');
    }
  };

  // Manager PIN entry for account linking mismatch
  const managerPinAppend = (digit: string) => {
    if (managerPin.length < 4) {
      const newPin = managerPin + digit;
      setManagerPin(newPin);
      setPinError(false);
      // Auto-submit when 4 digits entered
      if (newPin.length === 4) {
        if (newPin === '0420') {
          setStatus('LINK_ACCOUNT_FOUND');
          setManagerPin('');
        } else {
          setPinError(true);
          setTimeout(() => {
            setManagerPin('');
            setPinError(false);
          }, 1000);
        }
      }
    }
  };
  const managerPinClear = () => { setManagerPin(''); setPinError(false); };

  // Link Account - confirm and update demographics from DL
  const confirmLinkAccount = async () => {
    if (!foundCustomer || !scannedInfo) return;

    const customerData = {
      name: foundCustomer.first_name,
      lastNameInitial: foundCustomer.last_name?.[0]?.toUpperCase() || '',
      method: 'ID_SCAN' as const,
      loyaltyStatus: foundCustomer.loyalty_member ? 'Member' as const : 'Guest' as const,
      customerId: foundCustomer.id,
      driversLicense: scannedInfo.licenseNumber,
      dateOfBirth: scannedInfo.dateOfBirth,
      age: scannedInfo.age,
    };

    // Update customer with DL number + demographics
    try {
      await updateCustomer(foundCustomer.id, {
        driversLicense: scannedInfo.licenseNumber,
        address1: scannedInfo.address,
        city: scannedInfo.city,
        state: scannedInfo.state,
        zipCode: scannedInfo.zipCode,
        dateOfBirth: scannedInfo.dateOfBirth,
        gender: scannedInfo.gender,
      });
      console.log('Linked account: updated DL + demographics for customer', foundCustomer.id);
    } catch (error) {
      console.error('Failed to update demographics during link:', error);
    }

    // Reset and complete
    setScannedInfo(null);
    setFoundCustomer(null);
    setLinkPhone('');
    setStatus('READY');
    resetScan();
    onComplete(customerData);
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

    // Auto-link DL to account if not already on file (fire-and-forget)
    if (scannedInfo.licenseNumber && !foundCustomer.drivers_license) {
      updateCustomer(foundCustomer.id, {
        driversLicense: scannedInfo.licenseNumber,
      }).then(() => {
        console.log('Auto-linked DL to customer', foundCustomer.id);
      }).catch((err) => {
        console.error('Failed to auto-link DL (non-blocking):', err);
      });
    }

    // Reset state FIRST to prevent double submissions
    setScannedInfo(null);
    setFoundCustomer(null);
    setStatus('READY');
    resetScan();

    // Then call onComplete
    onComplete(customerData);
  };

  // Continue as guest (when "Not Me" is clicked) — go back to home, don't add to queue
  const continueAsGuest = () => {
    setScannedInfo(null);
    setFoundCustomer(null);
    setFoundByDL(false);
    resetScan();
    onGoHome?.();
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
        driversLicense: scannedInfo.licenseNumber,
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
        driversLicense: scannedInfo.licenseNumber,
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

  // AUTO_CHECKIN state - Found customer, auto checking in
  if (status === 'AUTO_CHECKIN' && foundCustomer && scannedInfo) {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
        <div className="text-8xl mb-6">✅</div>
        <h2 className="text-4xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Welcome Back, {foundCustomer.first_name}!
        </h2>
        <p className="text-2xl text-white mb-4">You're all checked in!</p>

        {/* Age info */}
        <div className="mb-6 p-4 rounded-xl bg-green-900/30 border border-green-700">
          <div className="grid grid-cols-2 gap-2 text-left text-lg">
            <span className="text-zinc-400">DOB:</span>
            <span className="text-white">{formatDOB(scannedInfo.dateOfBirth || '')}</span>
            <span className="text-zinc-400">21+:</span>
            <span className="text-green-400 font-bold">Verified ✓</span>
          </div>
        </div>

        {foundCustomer.loyalty_member && (
          <p className="text-gold text-lg">Loyalty Member</p>
        )}

        <p className="text-zinc-500 text-sm mt-6">Your name will appear on the screen in a moment.</p>

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

  // ALREADY_IN_QUEUE state - Customer scanned but already waiting
  if (status === 'ALREADY_IN_QUEUE' && foundCustomer) {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
        <div className="text-8xl mb-6">🙋</div>
        <h2 className="text-4xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          You're Already In Line!
        </h2>
        <p className="text-3xl text-white mb-4">
          {foundCustomer.first_name} {foundCustomer.last_name?.[0] || ''}.
        </p>
        <p className="text-zinc-400 text-lg">Your name will appear on the screen in a moment.</p>

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
            <span className="text-zinc-400">21+:</span>
            <span className="text-green-400 font-bold">Verified ✓</span>
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
            <span className="text-zinc-400">21+:</span>
            <span className="text-green-400 font-bold">Verified ✓</span>
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

  // NEW_CUSTOMER_LOYALTY_PROMPT state - New customer from ID scan, ask about loyalty
  if (status === 'NEW_CUSTOMER_LOYALTY_PROMPT' && scannedInfo) {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
        <div className="text-7xl mb-6">👋</div>
        <h2 className="text-4xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Welcome, {scannedInfo.firstName}!
        </h2>
        <p className="text-xl text-white mb-6">
          What would you like to do?
        </p>

        {/* Show scanned info */}
        <div className="mb-8 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
          <div className="grid grid-cols-2 gap-2 text-left text-lg">
            <span className="text-zinc-400">DOB:</span>
            <span className="text-white">{formatDOB(scannedInfo.dateOfBirth || '')}</span>
            <span className="text-zinc-400">21+:</span>
            <span className="text-green-400 font-bold">Verified ✓</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={newCustomerSkipLoyalty}
            className="flex-1 p-5 rounded-xl text-lg font-craft bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
          >
            <div className="text-2xl mb-1">✓</div>
            Just Check In
          </button>
          <button
            onClick={startLinkAccount}
            className="flex-1 p-5 rounded-xl text-lg font-craft bg-blue-700 text-white hover:bg-blue-600 transition-all"
          >
            <div className="text-2xl mb-1">📱</div>
            Already Have an Account?
          </button>
          <button
            onClick={newCustomerLoyaltySignup}
            className="flex-1 p-5 rounded-xl text-lg font-craft font-bold bg-gold text-black hover:bg-[#d8c19d] transition-all"
          >
            <div className="text-2xl mb-1">⭐</div>
            Sign Up for Loyalty
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

  // NEW_CUSTOMER_PHONE state - Capture phone before creating new account (also prevents duplicates)
  if (status === 'NEW_CUSTOMER_PHONE' && scannedInfo) {
    return (
      <div className="text-center w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl">
        <h2 className="text-3xl font-craft font-bold mb-2 text-gold uppercase tracking-wider">
          Welcome, {scannedInfo.firstName}!
        </h2>
        <p className="text-zinc-400 mb-6">
          What's the best phone number for your account?
        </p>

        <div className="text-4xl font-mono text-gold mb-6 tracking-wider">
          {formatPhone(newCustomerPhone)}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, '←'].map((key, i) => (
            key === null ? <div key={i} /> : (
              <button
                key={i}
                onClick={() => {
                  if (key === '←') newCustomerPhoneBackspace();
                  else newCustomerPhoneAppend(key.toString());
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

        <div className="flex gap-3">
          <button
            onClick={newCustomerPhoneClear}
            className="flex-1 p-4 rounded-xl text-lg font-craft bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-all"
          >
            Clear
          </button>
          <button
            onClick={submitNewCustomerPhone}
            disabled={newCustomerPhone.length < 10}
            className={`flex-1 p-4 rounded-xl text-lg font-craft font-bold transition-all ${
              newCustomerPhone.length >= 10
                ? 'bg-gold text-black hover:bg-[#d8c19d]'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            }`}
          >
            Continue
          </button>
        </div>

        <button
          onClick={skipNewCustomerPhone}
          className="mt-6 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          Skip — continue without a phone number
        </button>
      </div>
    );
  }

  // NEW_CUSTOMER_EMAIL state - New customer entering email for loyalty signup
  if (status === 'NEW_CUSTOMER_EMAIL' && scannedInfo) {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl">
        <h2 className="text-3xl font-craft font-bold mb-2 text-gold uppercase tracking-wider">
          Almost Done, {scannedInfo.firstName}!
        </h2>
        <p className="text-zinc-400 mb-6">
          Enter your email to complete your loyalty signup
        </p>

        <TouchKeyboard
          value={email}
          onChange={setEmail}
          onSubmit={newCustomerSubmitEmail}
          placeholder="your@email.com"
          type="email"
        />

        <button
          onClick={() => setStatus('NEW_CUSTOMER_LOYALTY_PROMPT')}
          className="mt-6 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          ← Back
        </button>
      </div>
    );
  }

  // LINK_ACCOUNT_PHONE state - Enter phone to find existing account
  if (status === 'LINK_ACCOUNT_PHONE' && scannedInfo) {
    return (
      <div className="text-center w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl">
        <h2 className="text-3xl font-craft font-bold mb-2 text-gold uppercase tracking-wider">
          Link Your Account
        </h2>
        <p className="text-zinc-400 mb-6">
          Enter the phone number on your account
        </p>

        <div className="text-4xl font-mono text-gold mb-6 tracking-wider">
          {formatPhone(linkPhone)}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, '←'].map((key, i) => (
            key === null ? <div key={i} /> : (
              <button
                key={i}
                onClick={() => {
                  if (key === '←') linkPhoneBackspace();
                  else linkPhoneAppend(key.toString());
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

        <div className="flex gap-3">
          <button
            onClick={linkPhoneClear}
            className="flex-1 p-4 rounded-xl text-lg font-craft bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-all"
          >
            Clear
          </button>
          <button
            onClick={linkAccountSubmitPhone}
            disabled={linkPhone.length < 10}
            className={`flex-1 p-4 rounded-xl text-lg font-craft font-bold transition-all ${
              linkPhone.length >= 10
                ? 'bg-gold text-black hover:bg-[#d8c19d]'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            }`}
          >
            Search
          </button>
        </div>

        <button
          onClick={() => setStatus('NEW_CUSTOMER_LOYALTY_PROMPT')}
          className="mt-6 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          ← Back
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

  // LINK_ACCOUNT_SEARCHING state
  if (status === 'LINK_ACCOUNT_SEARCHING') {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
        <div className="animate-spin w-16 h-16 border-4 border-gold border-t-transparent rounded-full mx-auto mb-6"></div>
        <h2 className="text-4xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Searching...
        </h2>
        <p className="text-zinc-400">Looking up {formatPhone(linkPhone)}</p>
      </div>
    );
  }

  // LINK_ACCOUNT_VERIFYING state - Fetching full customer record
  if (status === 'LINK_ACCOUNT_VERIFYING') {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
        <div className="animate-spin w-16 h-16 border-4 border-gold border-t-transparent rounded-full mx-auto mb-6"></div>
        <h2 className="text-4xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Verifying...
        </h2>
        <p className="text-zinc-400">Checking account details</p>
      </div>
    );
  }

  // LINK_ACCOUNT_MISMATCH state - Info doesn't match, require manager PIN
  if (status === 'LINK_ACCOUNT_MISMATCH' && foundCustomer && scannedInfo) {
    return (
      <div className="text-center w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-3xl font-craft font-bold mb-3 text-orange-400 uppercase tracking-wider">
          Verification Needed
        </h2>
        <p className="text-zinc-400 mb-4 text-sm">
          The information on your ID doesn't match this account.
          Please ask a team member to verify and enter their code.
        </p>

        {/* Comparison info */}
        <div className="mb-5 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700 text-sm">
          <div className="grid grid-cols-3 gap-1 text-left">
            <span className="text-zinc-500"></span>
            <span className="text-zinc-400 text-center text-xs">ID Scan</span>
            <span className="text-zinc-400 text-center text-xs">Account</span>
            <span className="text-zinc-500">Name:</span>
            <span className="text-white text-center">{scannedInfo.firstName} {scannedInfo.lastName?.[0] || ''}.</span>
            <span className="text-white text-center">{foundCustomer.first_name} {foundCustomer.last_name?.[0] || ''}.</span>
          </div>
        </div>

        <p className="text-zinc-500 text-xs mb-3">
          Team member: enter PIN to approve
        </p>

        {/* PIN display */}
        <div className={`text-4xl font-mono mb-3 tracking-[0.5em] ${pinError ? 'text-red-400' : 'text-gold'}`}>
          {'●'.repeat(managerPin.length) + '○'.repeat(4 - managerPin.length)}
        </div>

        {pinError && (
          <p className="text-red-400 text-sm mb-2">Incorrect PIN</p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto mb-5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, '←'].map((key, i) => (
            key === null ? <div key={i} /> : (
              <button
                key={i}
                onClick={() => {
                  if (key === '←') managerPinClear();
                  else managerPinAppend(key.toString());
                }}
                className={`h-14 text-xl font-craft flex items-center justify-center rounded-xl transition-all active:scale-95 ${
                  key === '←' ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'bg-zinc-800 text-white hover:bg-zinc-700'
                }`}
              >
                {key}
              </button>
            )
          ))}
        </div>

        <button
          onClick={() => {
            setFoundCustomer(null);
            setManagerPin('');
            setPinError(false);
            setLinkPhone('');
            setStatus('LINK_ACCOUNT_PHONE');
          }}
          className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          ← Back
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

  // LINK_ACCOUNT_FOUND state - Account found, confirm linking
  if (status === 'LINK_ACCOUNT_FOUND' && foundCustomer && scannedInfo) {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
        <div className="text-8xl mb-6">✅</div>
        <h2 className="text-4xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Account Found!
        </h2>
        <p className="text-2xl text-white mb-2">
          {foundCustomer.first_name} {foundCustomer.last_name?.[0] || ''}.
        </p>
        {foundCustomer.loyalty_member && (
          <p className="text-gold text-lg mb-4">Loyalty Member</p>
        )}

        <div className="mb-8 p-4 rounded-xl bg-green-900/30 border border-green-700">
          <p className="text-green-400 text-sm">
            Your ID will be linked to this account
          </p>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => {
              setFoundCustomer(null);
              setLinkPhone('');
              setStatus('LINK_ACCOUNT_PHONE');
            }}
            className="flex-1 p-6 rounded-xl text-xl font-craft bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
          >
            Not Me
          </button>
          <button
            onClick={confirmLinkAccount}
            className="flex-1 p-6 rounded-xl text-xl font-craft font-bold bg-gold text-black hover:bg-[#d8c19d] transition-all"
          >
            That's Me — Check In
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

  // LINK_ACCOUNT_NOT_FOUND state
  if (status === 'LINK_ACCOUNT_NOT_FOUND' && scannedInfo) {
    return (
      <div className="text-center w-full max-w-2xl bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 shadow-xl">
        <div className="text-8xl mb-6">🔍</div>
        <h2 className="text-3xl font-craft font-bold mb-4 text-orange-400 uppercase tracking-wider">
          No Account Found
        </h2>
        <p className="text-zinc-400 mb-2">
          No account found for {formatPhone(linkPhone)}
        </p>
        <p className="text-zinc-500 text-sm mb-8">
          Try a different number or continue as a new customer
        </p>

        <div className="flex gap-4">
          <button
            onClick={() => {
              setLinkPhone('');
              setStatus('LINK_ACCOUNT_PHONE');
            }}
            className="flex-1 p-6 rounded-xl text-xl font-craft bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
          >
            Try Again
          </button>
          <button
            onClick={() => setStatus('NEW_CUSTOMER_LOYALTY_PROMPT')}
            className="flex-1 p-6 rounded-xl text-xl font-craft font-bold bg-gold text-black hover:bg-[#d8c19d] transition-all"
          >
            Continue
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
      <div className="mb-10 flex flex-col items-center justify-center min-h-[14rem]">
        {status === 'SUCCESS' ? (
          <svg className="w-32 h-32 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        ) : status === 'UNDERAGE' || status === 'INVALID_SCAN' ? (
          <svg className="w-32 h-32 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ) : status === 'SCANNING' ? (
          <div className="w-20 h-20 border-4 border-gold border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <>
            {/* Animated downward arrow directing to physical scanner */}
            <svg className="w-28 h-28 text-gold animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </>
        )}
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
            <span className="text-zinc-400">21+:</span>
            <span className={`font-bold ${scannedInfo.isOver21 ? 'text-green-400' : 'text-red-400'}`}>
              {scannedInfo.isOver21 ? 'Verified ✓' : 'Under 21 ✗'}
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
        {status === 'READY' && 'Hold the barcode on the back of your ID under the scanner below.'}
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
