
import React, { useState } from 'react';
import { Customer } from '../../types';
import { lookupCustomer, updateCustomer, KioskCustomer } from '../../services/kioskApi';
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

  const append = (digit: string) => {
    if (phone.length < 10) setPhone(prev => prev + digit);
  };

  const clear = () => setPhone('');

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

  // Found customer state - loyalty member
  if (step === 'FOUND' && foundCustomer && foundCustomer.loyalty_member) {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <div className="text-6xl mb-6">👋</div>
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Welcome Back!
        </h2>
        <p className="text-2xl text-white mb-2">
          {foundCustomer.first_name} {foundCustomer.last_name?.[0] || ''}.
        </p>
        <p className="text-gold mb-8">Loyalty Member</p>

        <div className="flex gap-4">
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

  // Found customer state - NOT a loyalty member (show loyalty prompt)
  if (step === 'FOUND' && foundCustomer && !foundCustomer.loyalty_member) {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <div className="text-6xl mb-6">🎁</div>
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Welcome Back, {foundCustomer.first_name}!
        </h2>
        <p className="text-xl text-white mb-2">
          Would you like to join our <span className="text-gold font-bold">Loyalty Program</span>?
        </p>
        <p className="text-zinc-400 mb-8 text-sm">
          Earn points on every purchase and get exclusive rewards!
        </p>

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
          onClick={() => { setStep('NAME'); setFoundCustomer(null); }}
          className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          Not {foundCustomer.first_name}? Click here
        </button>
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

  // Name entry state (customer not found)
  if (step === 'NAME') {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">Almost There!</h2>
        <p className="text-zinc-400 mb-2">We didn't find your phone number in our system.</p>
        <p className="text-zinc-500 text-sm mb-8">Phone: {formatPhone(phone)}</p>

        <input
          type="text"
          placeholder="First Last"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-black/50 border-2 border-zinc-800 rounded-2xl p-6 text-2xl text-white placeholder:text-zinc-700 focus:border-gold outline-none mb-8 text-center"
          autoFocus
        />

        <div className="flex gap-4">
          <button
            onClick={() => { setStep('PHONE'); setPhone(''); }}
            className="flex-1 p-6 rounded-xl text-xl font-craft bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
          >
            Back
          </button>
          <button
            onClick={submitName}
            disabled={!name.trim() || loading}
            className={`flex-1 p-6 rounded-xl text-xl font-craft font-bold transition-all ${
              name.trim() && !loading ? 'bg-gold text-black hover:bg-[#d8c19d]' : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            }`}
          >
            {loading ? 'Adding...' : 'Join Queue'}
          </button>
        </div>
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
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'Clear', 0, 'Go'].map((key) => (
          <button
            key={key}
            onClick={() => {
              if (key === 'Clear') clear();
              else if (key === 'Go') submitPhone();
              else append(key.toString());
            }}
            disabled={loading}
            className={`
              h-20 text-3xl font-craft flex items-center justify-center rounded-xl transition-all active:scale-95
              ${key === 'Go' ? 'bg-gold text-black col-span-1 font-bold' : 'bg-zinc-800 text-white hover:bg-zinc-700'}
              ${key === 'Clear' ? 'bg-zinc-700 text-zinc-300' : ''}
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
