import React, { useState, useEffect } from 'react';
import { Logo } from './Branding';

interface Venue {
  id: string;
  name: string;
}

interface VenueSelectorProps {
  onVenueSelected: (venue: Venue) => void;
}

const VenueSelector: React.FC<VenueSelectorProps> = ({ onVenueSelected }) => {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    // Load venues from Electron
    const loadVenues = async () => {
      if (window.kiosk) {
        const venueList = await window.kiosk.getVenues();
        setVenues(venueList);

        // Check if venue was already selected
        const current = await window.kiosk.getCurrentVenue();
        if (current) {
          setSelectedVenue(current.id);
          onVenueSelected(current);
        }
      }
      setLoading(false);
    };

    loadVenues();

    // Listen for sync progress
    if (window.kiosk) {
      const unsubProgress = window.kiosk.onSyncProgress((progress) => {
        setSyncProgress(progress);
      });

      const unsubComplete = window.kiosk.onSyncComplete(() => {
        setSyncing(false);
        setSyncProgress(null);
      });

      return () => {
        unsubProgress();
        unsubComplete();
      };
    }
  }, [onVenueSelected]);

  const handleSelectVenue = async (venueId: string) => {
    if (!window.kiosk) return;

    setSelectedVenue(venueId);
    setSyncing(true);

    try {
      const venue = await window.kiosk.setVenue(venueId);
      // Wait a moment for sync to start showing progress
      setTimeout(() => {
        if (!syncProgress) {
          // If no progress after 2 seconds, assume it's done
          setSyncing(false);
          onVenueSelected(venue);
        }
      }, 2000);
    } catch (error) {
      console.error('Failed to set venue:', error);
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a]">
        <div className="animate-spin w-12 h-12 border-4 border-gold border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#1a1a1a] p-8">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-12">
          <Logo size="lg" />
          <h1 className="text-4xl font-craft font-bold text-gold mt-8 uppercase tracking-wider">
            Select Your Location
          </h1>
          <p className="text-zinc-400 mt-4">Choose the venue for this kiosk</p>
        </div>

        {syncing ? (
          <div className="bg-zinc-900/50 p-12 rounded-3xl border border-zinc-800 text-center">
            <div className="animate-spin w-16 h-16 border-4 border-gold border-t-transparent rounded-full mx-auto mb-6"></div>
            <h2 className="text-2xl font-craft text-gold mb-4">Setting Up...</h2>
            {syncProgress ? (
              <>
                <p className="text-zinc-400 mb-4">
                  Syncing customers: {syncProgress.current.toLocaleString()} / {syncProgress.total.toLocaleString()}
                </p>
                <div className="w-full bg-zinc-800 rounded-full h-3">
                  <div
                    className="bg-gold h-3 rounded-full transition-all duration-300"
                    style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-zinc-400">Connecting to POSaBIT...</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {venues.map((venue) => (
              <button
                key={venue.id}
                onClick={() => handleSelectVenue(venue.id)}
                className={`
                  p-8 rounded-2xl border-2 transition-all text-left
                  ${selectedVenue === venue.id
                    ? 'bg-gold/20 border-gold text-gold'
                    : 'bg-zinc-900/50 border-zinc-800 text-white hover:border-gold/50 hover:bg-zinc-800/50'
                  }
                `}
              >
                <h3 className="text-xl font-craft font-bold">{venue.name}</h3>
                <p className="text-zinc-500 text-sm mt-2">Click to select</p>
              </button>
            ))}
          </div>
        )}

        <p className="text-center text-zinc-600 text-sm mt-12">
          This setting is saved and can be changed in the admin menu.
        </p>
      </div>
    </div>
  );
};

export default VenueSelector;
