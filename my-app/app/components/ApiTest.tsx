'use client';

import { useState } from 'react';
import { api, Email } from '@/lib/api';

export default function ApiTest() {
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [emails, setEmails] = useState<Email[]>([]);
  const [emailLimit, setEmailLimit] = useState(5);
  const [connectionExists, setConnectionExists] = useState<boolean | null>(null);

  const handleCreateUser = async () => {
    if (!email) {
      setError('Please enter an email address');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await api.createUser({ email });
      setUserId(response.user_id);
      setMessage(`User created successfully! User ID: ${response.user_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckConnection = async () => {
    if (!userId) {
      setError('Please create a user first');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await api.checkConnectionExists({ user_id: userId });
      setConnectionExists(response.exists);
      setMessage(`Connection exists: ${response.exists ? 'Yes' : 'No'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check connection');
      setConnectionExists(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchEmails = async () => {
    if (!userId) {
      setError('Please create a user first');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    setEmails([]);

    try {
      const response = await api.fetchEmails({ 
        user_id: userId, 
        limit: emailLimit 
      });
      
      console.log('Email fetch response:', response);
      console.log('Emails data:', response.emails);
      
      const emailsList = response.emails || [];
      setEmails(emailsList);
      
      if (emailsList.length === 0) {
        setMessage('No emails found. This could mean your inbox is empty or there was an issue retrieving emails.');
      } else {
        setMessage(`Successfully fetched ${emailsList.length} email(s)`);
      }
    } catch (err: any) {
      console.error('Error fetching emails:', err);
      
      // Extract error message from different error formats
      let errorMessage = 'Failed to fetch emails. ';
      
      if (err instanceof Error) {
        errorMessage += err.message;
      } else if (err?.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (typeof detail === 'string') {
          errorMessage += detail;
        } else if (detail?.error) {
          errorMessage += detail.error;
        } else {
          errorMessage += JSON.stringify(detail);
        }
      } else if (err?.message) {
        errorMessage += err.message;
      } else {
        errorMessage += 'Make sure you have established a Gmail connection first by clicking "Create Connection" and completing the OAuth flow.';
      }
      
      setError(errorMessage);
      setEmails([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown date';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  // Helper function to safely extract email properties (handles different data structures)
  const getEmailField = (email: Email, field: string): string => {
    // Try direct property access first
    if (email[field]) return String(email[field]);
    
    // Try nested structures (some APIs return data in payload or headers)
    if (email.payload?.headers) {
      const header = email.payload.headers.find((h: any) => 
        h.name?.toLowerCase() === field.toLowerCase()
      );
      if (header) return header.value || '';
    }
    
    // Try alternative field names
    const alternatives: { [key: string]: string[] } = {
      subject: ['Subject', 'subject'],
      from: ['From', 'from', 'sender'],
      to: ['To', 'to', 'recipient'],
      date: ['Date', 'date', 'internalDate'],
    };
    
    if (alternatives[field]) {
      for (const alt of alternatives[field]) {
        if (email[alt]) return String(email[alt]);
      }
    }
    
    return '';
  };

  const handleCreateConnection = async () => {
    if (!userId) {
      setError('Please create a user first');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await api.createConnection({ user_id: userId });
      setMessage(`Connection created! Please complete the OAuth flow in the popup window, then check your connection status.`);
      // Open the redirect URL in a new window for OAuth
      if (response.redirect_url) {
        window.open(response.redirect_url, '_blank');
      }
      // Reset connection status - user needs to check again after OAuth
      setConnectionExists(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-4">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-black dark:text-zinc-50 mb-2">
          Gmail Email Viewer
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Connect your Gmail account and view your emails
        </p>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-zinc-800 dark:border-zinc-700 dark:text-white"
            disabled={loading}
          />
        </div>

        <button
          onClick={handleCreateUser}
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading...' : 'Create User'}
        </button>

        {userId && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-sm text-green-800 dark:text-green-200">
              <strong>User ID:</strong> {userId}
            </p>
          </div>
        )}

        {userId && (
          <div className="space-y-2">
            <button
              onClick={handleCheckConnection}
              disabled={loading}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Check Connection Status
            </button>

            <button
              onClick={handleCreateConnection}
              disabled={loading}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Create Connection
            </button>

            {connectionExists === true && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-3">
                  📧 Fetch Your Emails
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                      Number of emails to fetch
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={emailLimit}
                      onChange={(e) => setEmailLimit(parseInt(e.target.value) || 5)}
                      className="w-full px-4 py-2 border border-green-300 dark:border-green-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-zinc-800 dark:text-white"
                      disabled={loading}
                    />
                  </div>
                  <button
                    onClick={handleFetchEmails}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    {loading ? 'Fetching emails...' : 'Fetch Emails'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {message && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">{message}</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {emails.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-xl font-bold text-black dark:text-zinc-50">
              Your Emails ({emails.length})
            </h3>
            <div className="space-y-4">
              {emails.map((email, index) => {
                // Log each email to console for debugging
                console.log(`Email ${index}:`, email);
                
                const subject = getEmailField(email, 'subject') || email.subject || email.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || 'No Subject';
                const from = getEmailField(email, 'from') || email.from || email.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'from')?.value || 'Unknown sender';
                const to = getEmailField(email, 'to') || email.to || email.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'to')?.value;
                const date = getEmailField(email, 'date') || email.date || email.internalDate || email.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'date')?.value;
                const snippet = email.snippet || '';
                const body = email.body || email.payload?.body?.data || '';
                
                return (
                  <div
                    key={email.id || email.threadId || email.messageId || index}
                    className="p-4 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-semibold text-black dark:text-zinc-50 mb-1">
                          {subject}
                        </h4>
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                          <p>
                            <strong>From:</strong> {from}
                          </p>
                          {to && (
                            <p>
                              <strong>To:</strong> {to}
                            </p>
                          )}
                          {date && (
                            <p>
                              <strong>Date:</strong> {formatDate(date)}
                            </p>
                          )}
                          {email.id && (
                            <p className="text-xs text-gray-400">
                              <strong>ID:</strong> {email.id}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    {snippet && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-zinc-700">
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                          {snippet}
                        </p>
                      </div>
                    )}
                    {body && (
                      <details className="mt-3">
                        <summary className="text-sm text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">
                          View full email
                        </summary>
                        <div className="mt-2 p-3 bg-gray-50 dark:bg-zinc-900 rounded text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-96 overflow-y-auto">
                          {typeof body === 'string' ? body : JSON.stringify(body, null, 2)}
                        </div>
                      </details>
                    )}
                    {!snippet && !body && (
                      <details className="mt-3">
                        <summary className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:underline">
                          View raw email data (debug)
                        </summary>
                        <div className="mt-2 p-3 bg-gray-50 dark:bg-zinc-900 rounded text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
                          <pre>{JSON.stringify(email, null, 2)}</pre>
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <strong>Backend URL:</strong> {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
          Make sure the backend server is running on port 3001 and CORS is enabled.
        </p>
      </div>
    </div>
  );
}

