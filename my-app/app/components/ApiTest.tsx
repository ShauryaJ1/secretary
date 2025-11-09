'use client';

import { useState } from 'react';
import { api, Email } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Mail, CheckCircle2, XCircle, Loader2, MailOpen } from 'lucide-react';

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

  const getEmailField = (email: Email, field: string): string => {
    if (email[field]) return String(email[field]);
    
    if (email.payload?.headers) {
      const header = email.payload.headers.find((h: any) => 
        h.name?.toLowerCase() === field.toLowerCase()
      );
      if (header) return header.value || '';
    }
    
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
      if (response.redirect_url) {
        window.open(response.redirect_url, '_blank');
      }
      setConnectionExists(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Gmail Email Viewer</h1>
        <p className="text-muted-foreground">
          Connect your Gmail account and view your emails
        </p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Get Started</CardTitle>
          <CardDescription>
            Create a user account to begin accessing your Gmail
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <Button
            onClick={handleCreateUser}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Create User
              </>
            )}
          </Button>

          {userId && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>User Created</AlertTitle>
              <AlertDescription>
                <strong>User ID:</strong> {userId}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {userId && (
        <Card>
          <CardHeader>
            <CardTitle>Connection Management</CardTitle>
            <CardDescription>
              Manage your Gmail connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={handleCheckConnection}
                disabled={loading}
                variant="outline"
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Check Connection
              </Button>

              <Button
                onClick={handleCreateConnection}
                disabled={loading}
                variant="outline"
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Create Connection
              </Button>
            </div>

            {connectionExists === true && (
              <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-100">
                    <MailOpen className="h-5 w-5" />
                    Fetch Your Emails
                  </CardTitle>
                  <CardDescription className="text-green-700 dark:text-green-300">
                    Your Gmail account is connected. You can now fetch your emails.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="emailLimit">Number of emails to fetch</Label>
                    <Input
                      id="emailLimit"
                      type="number"
                      min="1"
                      max="50"
                      value={emailLimit}
                      onChange={(e) => setEmailLimit(parseInt(e.target.value) || 5)}
                      disabled={loading}
                    />
                  </div>
                  <Button
                    onClick={handleFetchEmails}
                    disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Fetching emails...
                      </>
                    ) : (
                      <>
                        <MailOpen className="mr-2 h-4 w-4" />
                        Fetch Emails
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      )}

      {message && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {emails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailOpen className="h-5 w-5" />
              Your Emails ({emails.length})
            </CardTitle>
            <CardDescription>
              Emails fetched from your Gmail account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {emails.map((email, index) => {
              console.log(`Email ${index}:`, email);
              
              const subject = getEmailField(email, 'subject') || email.subject || email.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || 'No Subject';
              const from = getEmailField(email, 'from') || email.from || email.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'from')?.value || 'Unknown sender';
              const to = getEmailField(email, 'to') || email.to || email.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'to')?.value;
              const date = getEmailField(email, 'date') || email.date || email.internalDate || email.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'date')?.value;
              const snippet = email.snippet || '';
              const body = email.body || email.payload?.body?.data || '';
              
              return (
                <Card key={email.id || email.threadId || email.messageId || index} className="border">
                  <CardHeader>
                    <CardTitle className="text-lg">{subject}</CardTitle>
                    <CardDescription className="space-y-1">
                      <div><strong>From:</strong> {from}</div>
                      {to && <div><strong>To:</strong> {to}</div>}
                      {date && <div><strong>Date:</strong> {formatDate(date)}</div>}
                      {email.id && (
                        <div className="text-xs text-muted-foreground">
                          <strong>ID:</strong> {email.id}
                        </div>
                      )}
                    </CardDescription>
                  </CardHeader>
                  {snippet && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {snippet}
                      </p>
                    </CardContent>
                  )}
                  {body && (
                    <CardContent>
                      <details className="group">
                        <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
                          View full email
                        </summary>
                        <div className="mt-2 p-3 bg-muted rounded-md text-sm overflow-y-auto max-h-96">
                          <pre className="whitespace-pre-wrap font-sans">
                            {typeof body === 'string' ? body : JSON.stringify(body, null, 2)}
                          </pre>
                        </div>
                      </details>
                    </CardContent>
                  )}
                  {!snippet && !body && (
                    <CardContent>
                      <details className="group">
                        <summary className="cursor-pointer text-sm text-muted-foreground hover:underline">
                          View raw email data (debug)
                        </summary>
                        <div className="mt-2 p-3 bg-muted rounded-md text-xs overflow-x-auto">
                          <pre>{JSON.stringify(email, null, 2)}</pre>
                        </div>
                      </details>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Backend URL:</strong> {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}</p>
            <p>Make sure the backend server is running on port 3001 and CORS is enabled.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
