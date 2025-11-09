'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function CallHistory() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Call History</CardTitle>
        <CardDescription>Your recent calls will appear here</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center h-[calc(100%-80px)] text-muted-foreground">
          <p>No calls yet</p>
        </div>
      </CardContent>
    </Card>
  );
}



