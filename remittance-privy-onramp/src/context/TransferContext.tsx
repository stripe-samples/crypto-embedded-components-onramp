import React, { createContext, ReactNode, useContext, useState } from 'react';

export type PayoutMode = 'hold_in_wallet' | 'auto_send_to_payout';

type TransferIntent = {
  amountUsd: string;
  recipientName: string;
  recipientDestination: string;
  payoutCountry: string;
  payoutMode: PayoutMode;
};

type TransferContextValue = {
  transfer: TransferIntent;
  updateTransfer: (updates: Partial<TransferIntent>) => void;
};

const DEFAULT_TRANSFER: TransferIntent = {
  amountUsd: '1',
  recipientName: 'Bob Garcia',
  recipientDestination: 'BBVA Mexico ending 4832',
  payoutCountry: 'Mexico',
  payoutMode: 'auto_send_to_payout',
};

const TransferContext = createContext<TransferContextValue | undefined>(undefined);

export function TransferProvider({ children }: { children: ReactNode }) {
  const [transfer, setTransfer] = useState<TransferIntent>(DEFAULT_TRANSFER);

  const updateTransfer = (updates: Partial<TransferIntent>) => {
    setTransfer(current => ({ ...current, ...updates }));
  };

  return (
    <TransferContext.Provider value={{ transfer, updateTransfer }}>
      {children}
    </TransferContext.Provider>
  );
}

export function useTransfer() {
  const context = useContext(TransferContext);
  if (!context) {
    throw new Error('useTransfer must be used within TransferProvider');
  }
  return context;
}
