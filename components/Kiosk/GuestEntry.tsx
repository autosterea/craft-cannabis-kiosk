
import React, { useState } from 'react';
import { Customer } from '../../types';
import { createCustomer, isElectron } from '../../services/kioskApi';

interface GuestEntryProps {
  onComplete: (data: Partial<Customer>) => void;
}

type Step = 'NAME' | 'LOYALTY_PROMPT' | 'PHONE_ENTRY' | 'CREATING';

const GuestEntry: React.FC<GuestEntryProps> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>('NAME');
  const [name, setName] = useState('');
  const [initial, setInitial] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // User wants to sign up for loyalty
  const wantsLoyalty = () => {
    setStep('PHONE_ENTRY');
  };

  // User doesn't want loyalty, just check in
  const skipLoyalty = () => {
    submitAsGuest();
  };

  // Submit with loyalty signup
  const submitWithLoyalty = async () => {
    if (phone.length !== 10) return;

    setStep('CREATING');
    setLoading(true);
    setError(null);

    try {
      // Create customer in POSaBIT with loyalty enabled
      const newCustomer = await createCustomer({
        firstName: name,
        lastName: initial || undefined,
        telephone: phone,
        loyaltyOptIn: true,
      });

      console.log('Created new loyalty customer:', newCustomer);

      onComplete({
        name,
        lastNameInitial: initial || '',
        method: 'GUEST',
        phone: phone,
        loyaltyStatus: 'Member',
        customerId: newCustomer.id,
      });
    } catch (err) {
      console.error('Failed to create customer:', err);
      setError('Failed to sign up for loyalty. Please try again or continue as guest.');
      setStep('PHONE_ENTRY');
    } finally {
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
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/40 border-2 border-zinc-800 rounded-2xl p-5 text-xl text-white placeholder:text-zinc-700 focus:border-gold outline-none transition-all"
              autoFocus
            />
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
              onChange={(e) => setInitial(e.target.value.toUpperCase())}
              className="w-24 bg-black/40 border-2 border-zinc-800 rounded-2xl p-5 text-xl text-white placeholder:text-zinc-700 focus:border-gold outline-none text-center transition-all"
            />
          </div>
        </div>

        <button
          onClick={proceedToLoyaltyPrompt}
          disabled={!name}
          className={`
            w-full p-7 rounded-2xl text-2xl font-craft font-bold transition-all active:scale-95
            ${name ? 'bg-gold text-black hover:bg-[#d8c19d]' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}
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
        <div className="text-6xl mb-6">🎁</div>
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Hi {name}!
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
            onClick={wantsLoyalty}
            className="flex-1 p-6 rounded-xl text-xl font-craft font-bold bg-gold text-black hover:bg-[#d8c19d] transition-all"
          >
            Yes, Sign Me Up!
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

  // Step 3: Phone Entry (for loyalty signup)
  if (step === 'PHONE_ENTRY') {
    return (
      <div className="w-full max-w-xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
        <h2 className="text-3xl font-craft font-bold mb-4 text-gold uppercase tracking-wider">
          Almost Done!
        </h2>
        <p className="text-zinc-400 mb-8">
          Enter your phone number to complete your loyalty signup
        </p>

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
            onClick={submitWithLoyalty}
            disabled={phone.length !== 10 || loading}
            className={`flex-1 p-6 rounded-xl text-xl font-craft font-bold transition-all ${
              phone.length === 10 && !loading
                ? 'bg-gold text-black hover:bg-[#d8c19d]'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            }`}
          >
            {loading ? 'Signing Up...' : 'Complete Signup'}
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

  // Step 4: Creating customer
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
