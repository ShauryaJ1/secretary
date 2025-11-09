'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/lib/trpc/client';
import { Loader2, Mail, CheckCircle2, AlertCircle } from 'lucide-react';

export function UserInfo() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [emails, setEmails] = useState<any[]>([]);

  // tRPC mutations and queries
  const upsertUser = trpc.user.upsert.useMutation();
  const updateComposioId = trpc.user.updateComposioId.useMutation();
  const initiateConnection = trpc.composio.initiateConnection.useMutation();
  const { data: connectionStatus, refetch: refetchConnection } = trpc.composio.checkConnection.useQuery(
    { userId: currentUserId },
    { enabled: !!currentUserId }
  );
  const fetchEmailsMutation = trpc.composio.fetchEmails.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await upsertUser.mutateAsync({
        firstName,
        lastName,
        phoneNumber,
        email,
      });

      setCurrentUserId(phoneNumber);
      
      // Check if user has existing composio_id (already connected)
      if (result.user?.composio_id) {
        console.log('User already has connection:', result.user.composio_id);
        // Refetch connection status to update UI
        setTimeout(() => {
          refetchConnection();
        }, 500);
        alert('User info saved successfully! Your Gmail connection is already active.');
      } else {
        alert('User info saved successfully! Now you can connect Gmail.');
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleConnectGmail = async () => {
    if (!phoneNumber) {
      alert('Please save your user info first');
      return;
    }

    try {
      const result = await initiateConnection.mutateAsync({
        userId: phoneNumber,
      });

      if (result.redirectUrl) {
        // Open OAuth URL in new window
        window.open(result.redirectUrl, '_blank', 'width=600,height=700');
        
        alert('Please complete the authentication in the popup window. Click "Validate & Fetch Emails" after you finish.');
        
        // Poll for connection status and save when active
        const pollInterval = setInterval(async () => {
          const status = await refetchConnection();
          
          if (status.data?.isConnected && status.data?.connectionId) {
            // Save the connected account ID to database
            await updateComposioId.mutateAsync({
              phoneNumber,
              composioId: status.data.connectionId,
            });
            clearInterval(pollInterval);
            alert('Gmail connected successfully!');
          }
        }, 3000); // Poll every 3 seconds
        
        // Stop polling after 2 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
        }, 120000);
      }
    } catch (error: any) {
      alert(`Error connecting Gmail: ${error.message}`);
    }
  };

  const handleValidateConnection = async () => {
    if (!phoneNumber) {
      alert('Please save your user info first');
      return;
    }

    try {
      // Refetch connection status
      const status = await refetchConnection();

      if (status.data?.isConnected) {
        // Fetch emails
        const result = await fetchEmailsMutation.mutateAsync({
          userId: phoneNumber,
        });

        console.log('Fetch emails result:', result);

        if (result.emails && result.emails.length > 0) {
          // Parse the nested response structure
          // result.emails[0].output contains the actual email data
          const firstEmail = result.emails[0];
          if (firstEmail && firstEmail.output) {
            try {
              const parsed = JSON.parse(firstEmail.output);
              console.log('Parsed email data:', parsed);
              
              if (parsed.data && parsed.data.messages) {
                setEmails(parsed.data.messages);
                alert(`Successfully fetched ${parsed.data.messages.length} emails!`);
              }
            } catch (e) {
              console.error('Failed to parse email data:', e);
              alert('Failed to parse email data');
            }
          }
        }
      } else {
        alert('Gmail not connected. Please connect first.');
      }
    } catch (error: any) {
      alert(`Error validating connection: ${error.message}`);
    }
  };

  return (
    <Card className="h-full overflow-auto">
      <CardHeader>
        <CardTitle>User Information</CardTitle>
        <CardDescription>Manage your profile and connections</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* User Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="John"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <Input
              id="phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1234567890"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={upsertUser.isPending}>
            {upsertUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Information
          </Button>
        </form>

        <Separator />

        {/* Gmail Connection Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Gmail Connection</h3>
            {connectionStatus && (
              <Badge variant={connectionStatus.isConnected ? 'default' : 'secondary'}>
                {connectionStatus.status}
              </Badge>
            )}
          </div>

          {!connectionStatus?.isConnected && (
            <Button
              onClick={handleConnectGmail}
              className="w-full"
              variant="outline"
              disabled={!phoneNumber || initiateConnection.isPending}
            >
              {initiateConnection.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Connect Gmail
                </>
              )}
            </Button>
          )}

          {connectionStatus?.isConnected && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Gmail is connected and ready to use!
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleValidateConnection}
            className="w-full"
            disabled={!phoneNumber || !connectionStatus?.isConnected || fetchEmailsMutation.isPending}
          >
            {fetchEmailsMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validating...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Validate & Fetch Emails
              </>
            )}
          </Button>
        </div>

        {/* Display Emails */}
        {emails.length > 0 && (
          <div className="space-y-4">
            <Separator />
            <h3 className="text-lg font-semibold">Recent Emails ({emails.length})</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {emails.map((emailData: any, index: number) => (
                <Alert key={index} className="text-left">
                  <AlertDescription>
                    <div className="space-y-1">
                      <div className="font-semibold text-sm">{emailData.subject || 'No Subject'}</div>
                      <div className="text-xs text-muted-foreground">
                        From: {emailData.sender || 'Unknown'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(emailData.messageTimestamp).toLocaleString()}
                      </div>
                      {emailData.preview?.body && (
                        <div className="text-xs mt-1 line-clamp-2">
                          {emailData.preview.body}
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

