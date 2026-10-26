import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { createPhaserGame } from '@/game/PhaserGame';
import { useUiStore } from '@/ui/state/uiStore';
import { TopBar } from '@/ui/hud/TopBar';
import { LeftPanel } from '@/ui/hud/LeftPanel';
import { RightPanel } from '@/ui/hud/RightPanel';
import { BottomBar } from '@/ui/hud/BottomBar';
import { MapOverlay } from '@/ui/hud/MapOverlay';
import { EventToasts } from '@/ui/hud/EventToasts';
import { Tutorial } from '@/ui/hud/Tutorial';
import { BattleReportModal } from '@/ui/hud/BattleReportModal';
import { VictoryModal } from '@/ui/hud/VictoryModal';
import { SendArmyDialog } from '@/ui/hud/SendArmyDialog';
import { HelpDialog, SavesDialog, SettingsDialog } from '@/ui/dialogs/Dialogs';
import { useGameSnapshot } from '@/ui/helpers/game';

export function GameScreen() {
  useGameSnapshot();
  const leftOpen = useUiStore((state) => state.leftOpen);
  const rightOpen = useUiStore((state) => state.rightOpen);
  const toggleLeft = useUiStore((state) => state.toggleLeft);
  const toggleRight = useUiStore((state) => state.toggleRight);
  const closeDrawers = useUiStore((state) => state.closeDrawers);
  const dialog = useUiStore((state) => state.dialog);
  const closeDialog = useUiStore((state) => state.closeDialog);
  const deleteSave = useGameStore((state) => state.deleteSave);
  const hostRef = useRef<HTMLDivElement>(null);

  // Phaser owns the map canvas; React never re-creates it between game ticks.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const phaser = createPhaserGame(host);
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            phaser.scale.refresh();
            return undefined;
          })
        : null;
    observer?.observe(host);
    const onResize = (): void => {
      phaser.scale.refresh();
    };
    window.addEventListener('resize', onResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      phaser.destroy(true);
    };
  }, []);

  // Real-time simulation loop, independent from React rendering.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      const delta = Math.min(now - last, 400);
      last = now;
      useGameStore.getState().advance(delta);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const store = useGameStore.getState();
      if (event.code === 'Space') {
        event.preventDefault();
        if (!store.game) return;
        store.setSpeed(store.game.speed === 0 ? 1 : 0);
      } else if (event.key === '1') {
        store.setSpeed(1);
      } else if (event.key === '2') {
        store.setSpeed(2);
      } else if (event.key === '3') {
        store.setSpeed(4);
      } else if (event.key === 'Escape') {
        closeDrawers();
        if (useUiStore.getState().dialog) closeDialog();
      } else if (event.key.toLowerCase() === 's' && event.ctrlKey) {
        event.preventDefault();
        void store.saveGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDialog, closeDrawers]);

  return (
    <div className="game">
      <TopBar onToggleLeft={toggleLeft} onToggleRight={toggleRight} />
      <div className="game-body">
        <aside className={`game-body__side ${leftOpen ? 'game-body__side--open' : ''}`}>
          <LeftPanel />
        </aside>

        <div className="map-column">
          <div className="map-wrap" ref={hostRef} />
          <MapOverlay />
          <EventToasts />
          <Tutorial />
        </div>

        <aside className={`game-body__side game-body__side--right ${rightOpen ? 'game-body__side--open' : ''}`}>
          <RightPanel />
        </aside>
      </div>
      <BottomBar onToggleLeft={toggleLeft} onToggleRight={toggleRight} />

      <BattleReportModal />
      <VictoryModal />

      {dialog?.type === 'send' && (
        <SendArmyDialog initialFrom={dialog.from} initialTo={dialog.to} onClose={closeDialog} />
      )}
      {dialog?.type === 'settings' && <SettingsDialog onClose={closeDialog} />}
      {dialog?.type === 'help' && <HelpDialog onClose={closeDialog} />}
      {dialog?.type === 'saves' && (
        <SavesDialog onClose={closeDialog} onDelete={(slot) => void deleteSave(slot)} />
      )}
    </div>
  );
}
