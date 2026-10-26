import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { MainMenu } from '@/ui/menu/MainMenu';
import { CountrySelect } from '@/ui/menu/CountrySelect';
import { GameScreen } from '@/ui/hud/GameScreen';

export default function App() {
  const screen = useGameStore((state) => state.screen);
  const hasGame = useGameStore((state) => state.game !== null);
  const bootstrap = useGameStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (screen === 'game' && hasGame) return <GameScreen />;
  if (screen === 'countrySelect') return <CountrySelect />;
  return <MainMenu />;
}
