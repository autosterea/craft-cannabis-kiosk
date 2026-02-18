
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
}

export interface LoyaltyProfile {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  points: number;
  tier: 'Member' | 'Gold' | 'Platinum';
}

export type AppView = 'KIOSK' | 'TV' | 'ADMIN';
