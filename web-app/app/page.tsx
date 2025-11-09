'use client';

import { useState } from 'react';
import { CallHistory } from '@/components/CallHistory';
import { UserInfo } from '@/components/UserInfo';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6">Secretary Dashboard</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-120px)]">
          {/* Call History Section - Takes 2/3 of the space */}
          <div className="lg:col-span-2">
            <CallHistory />
              </div>

          {/* User Info Section - Takes 1/3 of the space */}
          <div className="lg:col-span-1">
            <UserInfo />
          </div>
        </div>
      </div>
    </div>
  );
}
