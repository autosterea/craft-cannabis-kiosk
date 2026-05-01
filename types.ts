
export type CheckInMethod = 'ID_SCAN' | 'PHONE' | 'QR' | 'GUEST' | 'APP' | 'WALK_IN';

export interface Customer {
  id: string;
  name: string;
  lastNameInitial?: string;
  checkInTime: Date;
  method: CheckInMethod;
  loyaltyStatus?: 'Member' | 'Gold' | 'Platinum' | 'Guest';
  points?: number;
  phone?: string;
  status: 'Waiting' | 'Being Served' | 'Completed';
  customerId?: number;       // POSaBIT customer ID
  driversLicense?: string;   // For ID scan method
  dateOfBirth?: string;      // MMDDYYYY format from ID scan
  age?: number;              // Calculated age from DOB
  isOnlineOrder?: boolean;   // True if customer has pending online order
  incognito?: boolean;       // Incogweedo mode — show display number instead of name on queue TV
  displayNumber?: string;    // 3-digit number assigned for this check-in when incognito is on
}

export interface LoyaltyProfile {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  points: number;
  tier: 'Member' | 'Gold' | 'Platinum';
}

export type AppView = 'KIOSK' | 'TV' | 'ADMIN';
