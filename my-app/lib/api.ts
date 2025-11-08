/**
 * API Client for connecting to the backend server
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface CreateUserRequest {
  email: string;
}

export interface CreateUserResponse {
  user_id: string;
  email: string;
}

export interface CreateConnectionRequest {
  user_id: string;
  auth_config_id?: string;
}

export interface CreateConnectionResponse {
  connection_id: string;
  redirect_url: string;
}

export interface ConnectionStatusRequest {
  user_id: string;
  connection_id: string;
}

export interface ConnectionStatusResponse {
  status: string;
}

export interface ConnectionExistsRequest {
  user_id: string;
}

export interface ConnectionExistsResponse {
  exists: boolean;
}

export interface RunGmailAgentRequest {
  user_id: string;
  prompt: string;
}

export interface FetchEmailsRequest {
  user_id: string;
  limit?: number;
}

export interface EmailHeader {
  name: string;
  value: string;
}

export interface EmailPayload {
  headers?: EmailHeader[];
  body?: {
    data?: string;
    size?: number;
  };
  parts?: any[];
}

export interface Email {
  id?: string;
  threadId?: string;
  snippet?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  body?: string;
  payload?: EmailPayload;
  [key: string]: any;
}

export interface FetchEmailsResponse {
  emails: Email[];
}

/**
 * Generic API request function
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { detail: response.statusText };
    }
    
    // Create an error object that preserves the full response
    const error: any = new Error(errorData.detail?.error || errorData.detail || `API request failed: ${response.statusText}`);
    error.response = {
      status: response.status,
      data: errorData,
    };
    throw error;
  }

  return response.json();
}

/**
 * API Client functions
 */
export const api = {
  /**
   * Create a new user
   */
  createUser: (request: CreateUserRequest): Promise<CreateUserResponse> => {
    return apiRequest<CreateUserResponse>('/user/create', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * Check if a connection exists for a user
   */
  checkConnectionExists: (request: ConnectionExistsRequest): Promise<ConnectionExistsResponse> => {
    return apiRequest<ConnectionExistsResponse>('/connection/exists', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * Create a new connection for a user
   */
  createConnection: (request: CreateConnectionRequest): Promise<CreateConnectionResponse> => {
    return apiRequest<CreateConnectionResponse>('/connection/create', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * Check the status of a connection
   */
  checkConnectionStatus: (request: ConnectionStatusRequest): Promise<ConnectionStatusResponse> => {
    return apiRequest<ConnectionStatusResponse>('/connection/status', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * Run the Gmail agent
   */
  runGmailAgent: (request: RunGmailAgentRequest): Promise<any> => {
    return apiRequest<any>('/agent', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * Fetch emails for a user
   */
  fetchEmails: (request: FetchEmailsRequest): Promise<FetchEmailsResponse> => {
    return apiRequest<FetchEmailsResponse>('/actions/fetch_emails', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },
};

