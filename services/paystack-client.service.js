const DEFAULT_BASE_URL = 'https://api.paystack.co';

class PaystackClient {
  constructor({
    secretKey = process.env.PAYSTACK_SECRET_KEY,
    baseUrl = process.env.PAYSTACK_BASE_URL || DEFAULT_BASE_URL,
    fetchImpl = global.fetch
  } = {}) {
    this.secretKey = secretKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  ensureReady() {
    if (!this.secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY is required');
    }

    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Fetch API is not available in this Node runtime');
    }
  }

  async request(method, path, body = null) {
    this.ensureReady();

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      payload = {
        status: false,
        message: `Paystack returned non-JSON response with status ${response.status}`
      };
    }

    if (!response.ok || payload?.status === false) {
      const message = payload?.message || `Paystack request failed with status ${response.status}`;
      const requestError = new Error(message);
      requestError.statusCode = response.status;
      requestError.payload = payload;
      throw requestError;
    }

    return payload;
  }

  async initializeTransaction({ email, amount, metadata = {} }) {
    return this.request('POST', '/transaction/initialize', {
      email,
      amount,
      metadata
    });
  }

  async verifyTransaction(reference) {
    return this.request('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
  }

  async listTransactions(params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, value);
      }
    }

    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request('GET', `/transaction${suffix}`);
  }

  async getCustomer(emailOrCode) {
    return this.request('GET', `/customer/${encodeURIComponent(emailOrCode)}`);
  }
}

module.exports = {
  PaystackClient,
  createPaystackClient: (options = {}) => new PaystackClient(options)
};
