import { createContext, useContext, useState, ReactNode } from 'react';

interface GlobalSelectionContextType {
  selectedStudio: string;
  selectedAccount: string;
  setSelectedStudio: (id: string) => void;
  setSelectedAccount: (id: string) => void;
}

const GlobalSelectionContext = createContext<GlobalSelectionContextType | undefined>(undefined);

export function GlobalSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedStudio, setSelectedStudio] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');

  return (
    <GlobalSelectionContext.Provider value={{
      selectedStudio,
      selectedAccount,
      setSelectedStudio,
      setSelectedAccount,
    }}>
      {children}
    </GlobalSelectionContext.Provider>
  );
}

export function useGlobalSelection() {
  const context = useContext(GlobalSelectionContext);
  if (context === undefined) {
    throw new Error('useGlobalSelection must be used within a GlobalSelectionProvider');
  }
  return context;
}
