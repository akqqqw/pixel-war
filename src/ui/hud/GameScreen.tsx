import { useEffect, useRef, useState } from 'react';
import { createPhaserGame } from '@/game/PhaserGame';
import { useGameStore } from '@/store/gameStore';
import { TopBar } from '@/ui/hud/TopBar';
import { BottomPanel } from '@/ui/hud/BottomPanel';
import { CellPanel } from '@/ui/hud/CellPanel';
import { OrderPanel } from '@/ui/hud/OrderPanel';
import { VictoryModal } from '@/ui/hud/VictoryModal';
import { MenuDialog } from '@/ui/hud/MenuDialog';
import { HelpDialog } from '@/ui/hud/HelpDialog';
import { Toasts } from '@/ui/hud/Toasts';

/** The map fills the screen; the interface floats in three slim corners. */
export function GameScreen() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const advance = useGameStore((state) => state.advance);
  const setSpeed = useGameStore((state) => state.setSpeed);
  const saveGame = useGameStore((state) => state.saveGame);
  const exitToMenu = useGameStore((state) => state.exitToMenu);
  const status = useGameStore((state) => state.game?.status ?? 'playing');
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const phaser = createPhaserGame(host);
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            phaser.scale.refresh();
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

  // Real-time loop: the store turns elapsed time into whole game ticks.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      const delta = now - last;
      last = now;
      advance(delta);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [advance]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.code === 'Space') {
        event.preventDefault();
        useGameStore.getState().togglePause();
      } else if (event.key === '1') setSpeed(1);
      else if (event.key === '2') setSpeed(2);
      else if (event.key === '3') setSpeed(4);
      else if (event.key === 'Escape') {
        const store = useGameStore.getState();
        store.chooseBuilding(null);
        store.cancelDraft();
        store.cancelStrike();
        setMenuOpen(false);
        setHelpOpen(false);
      } else if (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void saveGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveGame, setSpeed]);

  return (
    <div className="game">
      <div ref={hostRef} className="game__canvas" />
      <TopBar onMenu={() => setMenuOpen(true)} />
      <OrderPanel />
      <CellPanel />
      <BottomPanel />
      <button type="button" className="help-btn" onClick={() => setHelpOpen(true)} title="Как играть">
        ?
      </button>
      <Toasts />
      {menuOpen && (
        <MenuDialog
          onClose={() => setMenuOpen(false)}
          onExit={() => {
            setMenuOpen(false);
            exitToMenu();
          }}
        />
      )}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {status !== 'playing' && <VictoryModal />}
    </div>
  );
}
