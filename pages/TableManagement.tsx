import React, { Suspense } from 'react';
import VenueSystem from '../components/venue-control/App';

export default function TableManagement() {
  return (
    <div className="relative w-full h-[calc(100vh-64px)] overflow-hidden bg-[#F8F9F7] dark:bg-black transition-colors duration-300">
      <Suspense fallback={<div className="flex items-center justify-center h-full text-[#36e27b] animate-pulse uppercase font-black tracking-widest">Cargando Venue Control...</div>}>
        <VenueSystem />
      </Suspense>
    </div>
  );
}