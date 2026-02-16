
import React, { useState, useEffect } from 'react';
import { Customer } from '../../types';
import { lookupCustomer, updateCustomer, KioskCustomer, getBlockedWords, isNameBlocked } from '../../services/kioskApi';
import TouchKeyboard from './TouchKeyboard';

interface PhoneEntryProps {
  onComplete: (data: Partial<Customer>) => void;
}

type Step = 'PHONE' | 'SEARCHING' | 'FOUND' | 'LOYALTY_PROMPT' | 'EMAIL_ENTRY' | 'UPDATING_LOYALTY' | 'NAME';

const PhoneEntry: React.FC<PhoneEntryProps> = ({ onComplete }) => {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>('PHONE');
  const [foundCustomer, setFoundCustomer] = useState<KioskCustomer | null>(null);
  const [loading, setLoading] = useState(false);
  const [blockedWords, setBlockedWords] = useState<string[]>([]);
  const [nameBlocked, setNameBlocked] = useState(false);

  // Load blocked words on mount
  useEffect(() => {
    getBlockedWords().then(setBlockedWords).catch(() => {});
  }, []);

  // Validate name against blocked words
  useEffect(() => {
    setNameBlocked(name.trim() ? isNameBlocked(name, blockedWords) : false);
  }, [name, blockedWords]);

  const append = (digit: string) => {
    if (phone.length < 10) setPhone(prev => prev + digit);
  };

  const clear = () => setPhone('');
  const backspace = () => setPhone(prev => prev.slice(0, -1));

  const submitPhone = async () => {
    if (phone.length < 10) return;

    setStep('SEARCHING');
    setLoading(true);

    try {
      const result = await lookupCustomer(phone);

      if (result.found && result.customer) {
        setFoundCustomer(result.customer);
        setStep('FOUND');
      } else {
        // Customer not found - ask for name
        setStep('NAME');
      }
    } catch (error) {
      console.error('Phone lookup failed:', error);
      setStep('NAME'); // Fallback to name entry
    } finally {
      setLoading(false);
    }
  };

  const confirmFoundCustomer = () => {
    if (!foundCustomer) return;

    onComplete({
      name: foundCustomer.first_name,
      lastNameInitial: foundCustomer.last_name?.[0]?.toUpperCase() || '',
      method: 'PHONE',
      phone: phone,
      loyaltyStatus: foundCustomer.loyalty_member ? 'Member' : 'Guest',
      customerId: foundCustomer.id,
    });
  };

  const submitName = async () => {
    if (!name.trim()) return;
    setLoading(true);

    const nameParts = name.trim().split(' ');
    onComplete({
      name: nameParts[0],
      lastNameInitial: nameParts[1]?.[0]?.toUpperCase() || '',
      method: 'PHONE',
      phone: phone,
      loyaltyStatus: 'Guest', // New customer, not in loyalty yet
    });

    setLoading(false);
  };

  const formatPhone = (val: string) => {
    if (!val) return '(___) ___-____';
    const cleaned = val.replace(/\D/g, '');
    let formatted = '(' + cleaned.substring(0, 3);
    if (cleaned.length > 3) formatted += ') ' + cleaned.substring(3, 6);
    if (cleaned.length > 6) formatted += '-' + cleaned.substring(6, 10);
    return formatted;
  };

  // Searching state
  if (step === 'SEARCHING') {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <div className="animate-spin w-16 h-16 border-4 border-gold border-t-transparent rounded-full mx-auto mb-6"></div>
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Looking You Up...
        </h2>
        <p className="text-zinc-400">Checking phone: {formatPhone(phone)}</p>
      </div>
    );
  }

  // Handle loyalty signup - go to email entry first
  const handleLoyaltySignup = () => {
    if (!foundCustomer) return;
    setEmail(''); // Clear any previous email
    setStep('EMAIL_ENTRY');
  };

  // Submit email and complete loyalty signup
  const submitEmailAndSignup = async () => {
    if (!foundCustomer || !email) return;

    setStep('UPDATING_LOYALTY');

    try {
      // Update customer in POSaBIT with email and loyalty
      await updateCustomer(foundCustomer.id, {
        loyaltyMember: true,
        marketingOptIn: true,
        email: email,
      });

      // Update local state with new loyalty status
      setFoundCustomer({ ...foundCustomer, loyalty_member: true });

      // Complete check-in with loyalty status
      onComplete({
        name: foundCustomer.first_name,
        lastNameInitial: foundCustomer.last_name?.[0]?.toUpperCase() || '',
        method: 'PHONE',
        phone: phone,
        loyaltyStatus: 'Member',
        customerId: foundCustomer.id,
      });
    } catch (error) {
      console.error('Failed to update loyalty status:', error);
      // Still check them in as guest if update fails
      confirmFoundCustomer();
    }
  };

  // Skip loyalty and check in as guest
  const skipLoyalty = () => {
    confirmFoundCustomer();
  };

  // Found customer state - any existing customer (just check them in, no loyalty prompt)
  if (step === 'FOUND' && foundCustomer) {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <div className="text-6xl mb-6">👋</div>
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Welcome Back!
        </h2>
        <p className="text-2xl text-white mb-2">
          {foundCustomer.first_name} {foundCustomer.last_name?.[0] || ''}.
        </p>
        {foundCustomer.loyalty_member && (
          <p className="text-gold mb-4">Loyalty Member</p>
        )}

        <div className="flex gap-4 mt-8">
          <button
            onClick={() => { setStep('NAME'); setFoundCustomer(null); }}
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
      </div>
    );
  }

  // Email entry for loyalty signup
  if (step === 'EMAIL_ENTRY' && foundCustomer) {
    return (
      <div className="w-full max-w-2xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
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
          onClick={() => setStep('FOUND')}
          className="mt-6 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          ← Back
        </button>
      </div>
    );
  }

  // Updating loyalty status
  if (step === 'UPDATING_LOYALTY') {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <div className="animate-spin w-16 h-16 border-4 border-gold border-t-transparent rounded-full mx-auto mb-6"></div>
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Signing You Up...
        </h2>
        <p className="text-zinc-400">Adding you to our loyalty program!</p>
      </div>
    );
  }

  // Handle name keyboard input
  const handleNameChange = (val: string) => {
    setName(val.replace(/[^a-zA-Z '-]/g, ''));
  };

  // Name entry state (customer not found)
  if (step === 'NAME') {
    return (
      <div className="w-full max-w-2xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">Almost There!</h2>
        <p className="text-zinc-400 mb-2">We didn't find your phone number in our system.</p>
        <p className="text-zinc-500 text-sm mb-6">Phone: {formatPhone(phone)}</p>

        {nameBlocked && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-xl text-red-300 text-sm">
            Please use your real name
          </div>
        )}

        <TouchKeyboard
          value={name}
          onChange={handleNameChange}
          onSubmit={() => { if (name.trim() && !nameBlocked) submitName(); }}
          placeholder="First Last"
          type="text"
          submitLabel="Join Queue"
          maxLength={30}
        />

        <button
          onClick={() => { setStep('PHONE'); setPhone(''); setName(''); }}
          className="mt-4 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          ← Back to phone entry
        </button>
      </div>
    );
  }

  // Phone entry state (default)
  return (
    <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
      <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">Welcome Back</h2>
      <p className="text-zinc-400 mb-8">Enter your phone number</p>

      <div className="bg-black/50 p-6 rounded-2xl mb-10 text-4xl font-mono text-gold tracking-widest border border-zinc-800 h-24 flex items-center justify-center">
        {formatPhone(phone)}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, '←', 0, 'Go'].map((key) => (
          <button
            key={key}
            onClick={() => {
              if (key === '←') backspace();
              else if (key === 'Go') submitPhone();
              else append(key.toString());
            }}
            onDoubleClick={() => {
              if (key === '←') clear();
            }}
            disabled={loading}
            className={`
              h-20 text-3xl font-craft flex items-center justify-center rounded-xl transition-all active:scale-95
              ${key === 'Go' ? 'bg-gold text-black col-span-1 font-bold' : 'bg-zinc-800 text-white hover:bg-zinc-700'}
              ${key === '←' ? 'bg-zinc-700 text-zinc-300' : ''}
              ${loading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PhoneEntry;
