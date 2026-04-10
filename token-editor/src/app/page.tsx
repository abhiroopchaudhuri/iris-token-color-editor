'use client';

import { useEffect, useState } from 'react';
import { useColorStore } from '@/hooks/useColorStore';
import UploadZone from '@/components/UploadZone';
import ColorEditor from '@/components/ColorEditor';

export default function Home() {
  const isLoaded = useColorStore(s => s.isLoaded);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    useColorStore.getState().restoreSession();
    setIsInitializing(false);
  }, []);

  if (isInitializing) {
    // Prevent UI hydration flash while checking localStorage
    return null; 
  }

  return isLoaded ? <ColorEditor /> : <UploadZone />;
}
