import { create } from 'zustand';
import type { TerritoryId } from '@/core/types';

export type Dialog =
  | { type: 'send'; from?: TerritoryId; to?: TerritoryId }
  | { type: 'settings' }
  | { type: 'help' }
  | { type: 'saves' }
  | { type: 'battles' }
  | { type: 'newGameConfirm' }
  | null;

interface UiStore {
  dialog: Dialog;
  leftOpen: boolean;
  rightOpen: boolean;
  openDialog: (dialog: Dialog) => void;
  closeDialog: () => void;
  openSend: (from?: TerritoryId, to?: TerritoryId) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  closeDrawers: () => void;
}

export const useUiStore = create<UiStore>()((set) => ({
  dialog: null,
  leftOpen: false,
  rightOpen: false,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  openSend: (from, to) => set({ dialog: { type: 'send', from, to } }),
  toggleLeft: () => set((state) => ({ leftOpen: !state.leftOpen, rightOpen: false })),
  toggleRight: () => set((state) => ({ rightOpen: !state.rightOpen, leftOpen: false })),
  closeDrawers: () => set({ leftOpen: false, rightOpen: false }),
}));
