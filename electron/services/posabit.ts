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
      // Convert MMDDYYYY to YYYY-MM-DD for API
      const dob = data.dateOfBirth;
      if (dob.length === 8) {
        customerData.date_of_birth = `${dob.substring(4, 8)}-${dob.substring(0, 2)}-${dob.substring(2, 4)}`;
      }
    }
    if (data.gender) {
      // POSaBIT may use different values - adjust as needed
      customerData.gender = data.gender === 'M' ? 'male' : data.gender === 'F' ? 'female' : 'other';
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
      throw new Error(`Failed to create customer: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as { customer?: PosabitCustomer } & PosabitCustomer;
    return result.customer || result;
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
}
