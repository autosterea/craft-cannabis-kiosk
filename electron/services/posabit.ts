// POSaBIT API Service - Runs in main process (secure)

const BASE_URL = 'https://app.posabit.com/api/v3';

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
  // Extended fields returned by API (for account linking verification)
  birthday?: string;          // "1990-07-23" format
  drivers_license?: string;
  birth_year?: number;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
}

export interface PosabitQueueItem {
  queue: number;
  customer_queue_id: number;
  customer_id: number | null;
  name: string;
  telephone: string | null;
  source: 'walk_in' | 'order_ahead';
  aasm_state: 'open' | 'processing' | 'completed';
  created_at: string;
}

export interface CustomerResponse {
  total_records: number;
  current_page: number;
  total_pages: number;
  per_page: number;
  customers: PosabitCustomer[];
}

export interface QueueResponse {
  total_records: number;
  customer_queues: PosabitQueueItem[];
}

export class PosabitService {
  private integratorToken: string;
  private venueToken: string;
  private authHeader: string;

  constructor(integratorToken: string, venueToken: string) {
    this.integratorToken = integratorToken;
    this.venueToken = venueToken;
    this.authHeader = `Basic ${Buffer.from(`${integratorToken}:${venueToken}`).toString('base64')}`;
  }

  // Fetch customers with optional updated_since filter
  async fetchCustomers(options: {
    page?: number;
    perPage?: number;
    updatedSince?: string;
  } = {}): Promise<CustomerResponse> {
    const { page = 1, perPage = 100, updatedSince } = options;

    // Build URL with query parameters
    let url = `${BASE_URL}/venue/customers?page=${page}&per_page=${perPage}`;

    // Add date range (POSaBIT requires start_date and end_date)
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = updatedSince
      ? updatedSince.split('T')[0]
      : new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 2 years ago

    url += `&start_date=${startDate}&end_date=${endDate}`;

    // Add updated_at filter for incremental sync
    if (updatedSince) {
      url += `&q[updated_at_gt]=${encodeURIComponent(updatedSince)}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch customers: ${response.status}`);
    }

    return response.json() as Promise<CustomerResponse>;
  }

  // Fetch all customers with pagination (for initial sync)
  async fetchAllCustomers(
    onProgress?: (current: number, total: number) => void
  ): Promise<PosabitCustomer[]> {
    const allCustomers: PosabitCustomer[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await this.fetchCustomers({ page, perPage: 100 });
      // POSaBIT wraps each customer in a { customer: {...} } object - unwrap it
      const unwrappedCustomers = response.customers.map((item: any) =>
        item.customer ? item.customer : item
      );
      allCustomers.push(...unwrappedCustomers);
      totalPages = response.total_pages;

      if (onProgress) {
        onProgress(allCustomers.length, response.total_records);
      }

      page++;

      // Small delay to avoid rate limiting
      if (page <= totalPages) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } while (page <= totalPages);

    return allCustomers;
  }

  // Get customer queue
  async getQueue(): Promise<QueueResponse> {
    const response = await fetch(`${BASE_URL}/venue/customer_queues`, {
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch queue: ${response.status}`);
    }

    return response.json() as Promise<QueueResponse>;
  }

  // Add customer to queue
  async addToQueue(data: {
    name: string;
    telephone?: string;
    customerId?: number;
    source?: 'walk_in' | 'order_ahead';
  }): Promise<PosabitQueueItem> {
    const body = {
      customer_queue: {
        source: data.source || 'walk_in',
        name: data.name,
        telephone: data.telephone,
        customer_id: data.customerId,
      },
    };

    const response = await fetch(`${BASE_URL}/venue/customer_queues`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to add to queue: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<PosabitQueueItem>;
  }

  // Create new customer
  async createCustomer(data: {
    firstName: string;
    lastName?: string;
    telephone: string;
    email?: string;
    loyaltyOptIn: boolean;
    // Demographics
    address1?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    dateOfBirth?: string;
    gender?: 'M' | 'F' | 'X';
    driversLicense?: string;
  }): Promise<PosabitCustomer> {
    const customerData: any = {
      first_name: data.firstName,
      last_name: data.lastName || '',
      telephone: data.telephone,
      loyalty_member: data.loyaltyOptIn,
      marketing_opt_in: data.loyaltyOptIn,
    };

    // Add optional fields if provided
    if (data.email) customerData.email = data.email;
    if (data.address1) customerData.address_1 = data.address1;
    if (data.city) customerData.city = data.city;
    if (data.state) customerData.state = data.state;
    if (data.zipCode) customerData.zip_code = data.zipCode;
    if (data.dateOfBirth) {
      // Convert MMDDYYYY to YYYY-MM-DD for API (POSaBIT field is "birthday", not "date_of_birth")
      const dob = data.dateOfBirth;
      if (dob.length === 8) {
        customerData.birthday = `${dob.substring(4, 8)}-${dob.substring(0, 2)}-${dob.substring(2, 4)}`;
      }
    }
    if (data.gender) {
      // POSaBIT may use different values - adjust as needed
      customerData.gender = data.gender === 'M' ? 'male' : data.gender === 'F' ? 'female' : 'other';
    }
    if (data.driversLicense) {
      customerData.drivers_license = data.driversLicense.trim().toUpperCase();
    }

    const body = { customer: customerData };

    const response = await fetch(`${BASE_URL}/venue/customers`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Duplicate DL — POSaBIT rejects because this license already belongs to an existing record
      // (e.g., budtender created the customer at the till before the kiosk POST landed).
      // Recover by linking to the existing customer instead of erroring out at the kiosk.
      const lower = errorText.toLowerCase();
      const looksDuplicate =
        response.status === 422 &&
        (lower.includes('already') || lower.includes('taken') || lower.includes('drivers_license') || lower.includes('duplicate'));

      if (looksDuplicate && data.driversLicense) {
        console.log('createCustomer got duplicate DL — looking up existing record:', data.driversLicense);
        const existing = await this.searchCustomerByLicense(data.driversLicense);
        if (existing) {
          console.log('Linked to existing customer:', existing.id);
          return existing;
        }
      }

      throw new Error(`Failed to create customer: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as { customer?: PosabitCustomer } & PosabitCustomer;
    return result.customer || result;
  }

  // Search for a customer by driver's license number via the API
  async searchCustomerByLicense(licenseNumber: string): Promise<PosabitCustomer | null> {
    try {
      const params = new URLSearchParams({
        per_page: '5',
        'q[drivers_license_eq]': licenseNumber.trim().toUpperCase(),
      });

      const url = `${BASE_URL}/venue/customers?${params.toString()}`;
      console.log('API DL search URL:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.log('API DL search failed:', response.status);
        return null;
      }

      const data = await response.json() as CustomerResponse;
      if (!data.customers || data.customers.length === 0) {
        console.log('API DL search: no results');
        return null;
      }

      // Unwrap if wrapped
      const unwrapped = data.customers.map((item: any) =>
        item.customer ? item.customer : item
      );

      const match = unwrapped[0];
      console.log('API DL search: found -', match.first_name, match.last_name, 'ID:', match.id);
      return match;
    } catch (err) {
      console.error('API DL search error:', err);
      return null;
    }
  }

  // Search for a customer by name via the API (for when local DB doesn't have them)
  async searchCustomerByName(firstName: string, lastName: string): Promise<PosabitCustomer | null> {
    try {
      // Use ransack query parameters (POSaBIT uses Rails/Ransack)
      const params = new URLSearchParams({
        per_page: '5',
        'q[first_name_cont]': firstName,
        'q[last_name_cont]': lastName,
      });

      const url = `${BASE_URL}/venue/customers?${params.toString()}`;
      console.log('API name search URL:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.log('API name search failed:', response.status);
        return null;
      }

      const data = await response.json() as CustomerResponse;
      if (!data.customers || data.customers.length === 0) {
        console.log('API name search: no results');
        return null;
      }

      // Unwrap if wrapped in { customer: {...} }
      const unwrapped = data.customers.map((item: any) =>
        item.customer ? item.customer : item
      );

      // Find best match (case-insensitive exact match on both names)
      const normalizedFirst = firstName.trim().toUpperCase();
      const normalizedLast = lastName.trim().toUpperCase();

      const exactMatch = unwrapped.find((c: PosabitCustomer) =>
        c.first_name?.toUpperCase() === normalizedFirst &&
        c.last_name?.toUpperCase() === normalizedLast
      );

      if (exactMatch) {
        console.log('API name search: exact match found -', exactMatch.first_name, exactMatch.last_name, 'ID:', exactMatch.id);
        return exactMatch;
      }

      // Fallback: first result if names are close enough
      const firstResult = unwrapped[0];
      if (firstResult) {
        console.log('API name search: using first result -', firstResult.first_name, firstResult.last_name, 'ID:', firstResult.id);
        return firstResult;
      }

      return null;
    } catch (err) {
      console.error('API name search error:', err);
      return null;
    }
  }

  // Search by birthday + last name (catches renewed DLs, nickname mismatches)
  async searchCustomerByDobAndLastName(birthday: string, lastName: string): Promise<PosabitCustomer | null> {
    try {
      const params = new URLSearchParams({
        per_page: '10',
        'q[birthday_eq]': birthday,
        'q[last_name_cont]': lastName,
      });

      const url = `${BASE_URL}/venue/customers?${params.toString()}`;
      console.log('API DOB+lastname search:', birthday, lastName);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return null;

      const data = await response.json() as CustomerResponse;
      if (!data.customers || data.customers.length === 0) return null;

      const unwrapped = data.customers.map((item: any) =>
        item.customer ? item.customer : item
      );

      // Return first match that has a phone (prefer established accounts over other kiosk records)
      const withPhone = unwrapped.find((c: PosabitCustomer) => c.telephone);
      if (withPhone) {
        console.log('DOB+lastname match (with phone):', withPhone.first_name, withPhone.last_name, 'ID:', withPhone.id);
        return withPhone;
      }

      // If no phone match, return first result
      console.log('DOB+lastname match:', unwrapped[0].first_name, unwrapped[0].last_name, 'ID:', unwrapped[0].id);
      return unwrapped[0];
    } catch (err) {
      console.error('DOB+lastname search error:', err);
      return null;
    }
  }

  // Update existing customer (e.g., to enable loyalty)
  async updateCustomer(customerId: number, data: {
    loyaltyMember?: boolean;
    marketingOptIn?: boolean;
    firstName?: string;
    lastName?: string;
    telephone?: string;
    email?: string;
    // Demographics
    address1?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    dateOfBirth?: string;
    gender?: 'M' | 'F' | 'X';
    driversLicense?: string;
  }): Promise<PosabitCustomer> {
    const customerUpdate: any = {};

    if (data.loyaltyMember !== undefined) {
      customerUpdate.loyalty_member = data.loyaltyMember;
    }
    if (data.marketingOptIn !== undefined) {
      customerUpdate.marketing_opt_in = data.marketingOptIn;
    }
    if (data.firstName !== undefined) {
      customerUpdate.first_name = data.firstName;
    }
    if (data.lastName !== undefined) {
      customerUpdate.last_name = data.lastName;
    }
    if (data.telephone !== undefined) {
      customerUpdate.telephone = data.telephone;
    }
    if (data.email !== undefined) {
      customerUpdate.email = data.email;
    }
    // Demographics from DL scan
    if (data.address1) {
      customerUpdate.address_1 = data.address1;
    }
    if (data.city) {
      customerUpdate.city = data.city;
    }
    if (data.state) {
      customerUpdate.state = data.state;
    }
    if (data.zipCode) {
      customerUpdate.zip_code = data.zipCode;
    }
    if (data.dateOfBirth) {
      // Convert MMDDYYYY to YYYY-MM-DD for API
      const dob = data.dateOfBirth;
      if (dob.length === 8) {
        customerUpdate.date_of_birth = `${dob.substring(4, 8)}-${dob.substring(0, 2)}-${dob.substring(2, 4)}`;
      }
    }
    if (data.gender) {
      customerUpdate.gender = data.gender === 'M' ? 'male' : data.gender === 'F' ? 'female' : 'other';
    }
    if (data.driversLicense) {
      customerUpdate.drivers_license = data.driversLicense.trim().toUpperCase();
    }

    const body = { customer: customerUpdate };

    const response = await fetch(`${BASE_URL}/venue/customers/${customerId}`, {
      method: 'PUT',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update customer: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as { customer?: PosabitCustomer } & PosabitCustomer;
    return result.customer || result;
  }

  // Fetch a single customer by ID (returns full record with birthday, drivers_license)
  async fetchCustomerById(customerId: number): Promise<PosabitCustomer | null> {
    try {
      const response = await fetch(`${BASE_URL}/venue/customers/${customerId}`, {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.log('Fetch customer by ID failed:', response.status);
        return null;
      }

      const data = await response.json() as { customer?: PosabitCustomer } & PosabitCustomer;
      const customer = data.customer || data;
      console.log('Fetched customer by ID:', customer.id, customer.first_name, customer.last_name,
        'birthday:', customer.birthday, 'DL:', customer.drivers_license ? 'yes' : 'no');
      return customer;
    } catch (err) {
      console.error('Fetch customer by ID error:', err);
      return null;
    }
  }
}
