import React, { useState } from 'react';
import SignaturePad from './SignaturePad';

interface ConsentStepProps {
  firstName?: string;
  onAgree: (signaturePng: string) => void;
  onBack?: () => void;
  submitting?: boolean;
}

// Shared loyalty consent + signature step. Customer accepts T&C / privacy / marketing and signs.
const ConsentStep: React.FC<ConsentStepProps> = ({ firstName, onAgree, onBack, submitting }) => {
  const [signature, setSignature] = useState<string | null>(null);

  return (
    <div className="w-full max-w-2xl bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 shadow-xl text-center">
      <h2 className="text-3xl font-craft font-bold mb-2 text-gold uppercase tracking-wider">
        Almost Done{firstName ? `, ${firstName}` : ''}!
      </h2>
      <p className="text-zinc-400 mb-4">
        Please review and sign to join <span className="text-gold font-bold">Craft Rewards</span>.
      </p>

      <div className="text-left text-sm text-zinc-400 bg-black/30 border border-zinc-800 rounded-2xl p-4 mb-5 max-h-32 overflow-y-auto leading-relaxed">
        By signing below, I agree to join the Craft Cannabis loyalty program and to receive marketing
        messages from Craft Cannabis. I acknowledge that I have read and accept the Terms &amp; Conditions
        and Privacy Policy, and I understand I can opt out at any time.
      </div>

      <SignaturePad onChange={setSignature} height={200} />

      <div className="flex gap-4 mt-6">
        {onBack && (
          <button
            onClick={onBack}
            disabled={submitting}
            className="flex-1 p-5 rounded-xl text-lg font-craft bg-zinc-800 text-white hover:bg-zinc-700 transition-all disabled:opacity-50"
          >
            ← Back
          </button>
        )}
        <button
          onClick={() => signature && onAgree(signature)}
          disabled={!signature || submitting}
          className={`flex-1 p-5 rounded-xl text-lg font-craft font-bold transition-all ${
            signature && !submitting
              ? 'bg-gold text-black hover:bg-[#d8c19d]'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          {submitting ? 'Saving…' : 'I Agree & Sign'}
        </button>
      </div>
    </div>
  );
};

export default ConsentStep;
