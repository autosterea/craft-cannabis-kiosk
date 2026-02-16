// POSaBIT API v3 Service (Web fallback - dev mode only)
// Tokens loaded from .env.local (gitignored) via Vite env vars

const BASE_URL = '/api/posabit';
const INTEGRATOR_TOKEN = import.meta.env.VITE_POSABIT_INTEGRATOR_TOKEN || '';
const VENUE_TOKEN = import.meta.env.VITE_POSABIT_VENUE_TOKEN || '';

// Create Basic Auth header
const getAuthHeader = (): string => {
  const credentials = btoa(`${INTEGRATOR_TOKEN}:${VENUE_TOKEN}`);
  return `Basic ${credentials}`;
};

export interface PosabitQueueItem {
  queue: number;
  customer_queue_id: number;
  customer_id: number | null;
  user_id: number | null;
  user_name?: string;
  name: string;
  telephone: string | null;
  birth_year: number | null;
  sms_opt_out: boolean | null;
  sms_opt_in: boolean | null;
  email: string | null;
  source: 'walk_in' | 'order_ahead';
  pickup: boolean;
  created_on: string;
  aasm_state: 'open' | 'processing' | 'completed';
  customer_notes: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  saved_order: string;
  saved_order_data: string;
  saved_order_total: string;
}

export interface PosabitQueueResponse {
  total_records: number;
  current_page: number;
  total_pages: number;
  per_page: number;
  customer_queues: PosabitQueueItem[];
}

export interface AddToQueueRequest {
  customer_queue: {
    source: 'walk_in' | 'order_ahead';
    name: string;
    telephone?: string;
    customer_id?: number;
    drivers_license?: string;
  };
}

// Customer types
export interface PosabitCustomer {
  id: number;
  first_name: string;
  last_name: string;
  telephone?: string;
  email?: string;
  loyalty_member: boolean;
  marketing_opt_in: boolean;
  created_at: string;
  updated_at: string;
}

export interface PosabitCustomerResponse {
  total_records: number;
  current_page: number;
  total_pages: number;
  per_page: number;
  customers: PosabitCustomer[];
}

interface CustomerCache {
  customers: PosabitCustomer[];
  lastUpdated: Date;
  phoneIndex: Map<string, PosabitCustomer>;
}

// Customer cache singleton
let customerCache: CustomerCache | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Normalize phone number for indexing
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

// Fetch customer queue
export async function getQueue(): Promise<PosabitQueueResponse> {
  const response = await fetch(`${BASE_URL}/venue/customer_queues`, {
    method: 'GET',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch queue: ${response.status}`);
  }

  return response.json();
}

// Add customer to queue
export async function addToQueue(
  name: string,
  source: 'walk_in' | 'order_ahead' = 'walk_in',
  telephone?: string
): Promise<PosabitQueueItem> {
  const body: AddToQueueRequest = {
    customer_queue: {
      source,
      name,
    },
  };

  if (telephone) {
    body.customer_queue.telephone = telephone;
  }

  const response = await fetch(`${BASE_URL}/venue/customer_queues`, {
    method: 'POST',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to add to queue: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Fetch all customers with pagination
export async function fetchAllCustomers(): Promise<PosabitCustomer[]> {
  const allCustomers: PosabitCustomer[] = [];
  let page = 1;
  let totalPages = 1;

  // Use date range from 2 years ago to capture most customers
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  do {
    const response = await fetch(
      `${BASE_URL}/venue/customers?start_date=${startDate}&end_date=${endDate}&page=${page}&per_page=100`,
      {
        method: 'GET',
        headers: {
          'Authorization': getAuthHeader(),
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch customers: ${response.status}`);
    }

    const data: PosabitCustomerResponse = await response.json();
    allCustomers.push(...data.customers);
    totalPages = data.total_pages;
    page++;
  } while (page <= totalPages);

  return allCustomers;
}

// Initialize or refresh customer cache
export async function initializeCustomerCache(): Promise<CustomerCache> {
  const customers = await fetchAllCustomers();

  const phoneIndex = new Map<string, PosabitCustomer>();
  for (const customer of customers) {
    if (customer.telephone) {
      const normalizedPhone = normalizePhone(customer.telephone);
      if (normalizedPhone.length === 10) {
        phoneIndex.set(normalizedPhone, customer);
      }
    }
  }

  customerCache = {
    customers,
    lastUpdated: new Date(),
    phoneIndex,
  };

  console.log(`Customer cache initialized: ${customers.length} customers, ${phoneIndex.size} with phone numbers`);
  return customerCache;
}

// Get cached customers, refresh if stale
export async function getCustomerCache(): Promise<CustomerCache> {
  if (!customerCache || Date.now() - customerCache.lastUpdated.getTime() > CACHE_TTL_MS) {
    return initializeCustomerCache();
  }
  return customerCache;
}

// Lookup customer by phone number
export async function lookupCustomerByPhone(phone: string): Promise<{
  found: boolean;
  customer?: PosabitCustomer;
}> {
  try {
    const cache = await getCustomerCache();
    const normalizedPhone = normalizePhone(phone);
    const customer = cache.phoneIndex.get(normalizedPhone);

    return customer ? { found: true, customer } : { found: false };
  } catch (error) {
    console.error('Customer lookup failed:', error);
    return { found: false };
  }
}

// Create new customer (for loyalty signup)
export async function createCustomer(data: {
  firstName: string;
  lastName?: string;
  telephone: string;
  loyaltyOptIn: boolean;
}): Promise<PosabitCustomer> {
  const response = await fetch(`${BASE_URL}/venue/customers`, {
    method: 'POST',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer: {
        first_name: data.firstName,
        last_name: data.lastName || '',
        telephone: data.telephone,
        loyalty_member: data.loyaltyOptIn,
        marketing_opt_in: data.loyaltyOptIn,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create customer: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  // Invalidate cache to include new customer
  customerCache = null;

  return result.customer || result;
}
