import { useGameStore } from '@/store/gameStore';
import { useGameSnapshot, ownedTerritories, playerCountry } from '@/ui/helpers/game';
import { ResourceChip } from '@/ui/components/ResourceChip';
import { formatGameClock, formatGameDateShort } from '@/core/time/gameDate';
import { useUiStore } from '@/ui/state/uiStore';

interface TopBarProps {
  onToggleLeft: () => void;
  onToggleRight: () => void;
}

export function TopBar({ onToggleLeft, onToggleRight }: TopBarProps) {
  const game = useGameSnapshot();
  const saveGame = useGameStore((state) => state.saveGame);
  const openDialog = useUiStore((state) => state.openDialog);
  if (!game) return null;

  const country = playerCountry(game);
  if (!country) return null;
  const owned = ownedTerritories(game, country.id).length;
  const total = game.world.territories.length;
  const capital = country.capitalTerritoryId
    ? game.world.territories.find((territory) => territory.id === country.capitalTerritoryId)
    : undefined;

  return (
    <header className="topbar">
      <div className="topbar__country">
        <div className="topbar__flag" style={{ background: `linear-gradient(180deg, ${country.accent}, ${country.color})` }} />
        <div>
          <div className="topbar__name">{country.name}</div>
          <div className="topbar__capital">
            {capital ? `Столица: ${capital.name}` : 'Столица потеряна'}
          </div>
        </div>
      </div>

      <div className="resources">
        <ResourceChip resource="money" value={country.resources.money} delta={country.income.money} />
        <ResourceChip resource="metal" value={country.resources.metal} delta={country.income.metal} />
        <ResourceChip resource="oil" value={country.resources.oil} delta={country.income.oil} />
        <ResourceChip resource="energy" value={country.resources.energy} delta={country.income.energy} />
      </div>

      <div className="topbar__right">
        <div className="progress-pill" title="Захвачено территорий">
          <span>Мир</span>
          <strong>
            {owned}/{total}
          </strong>
        </div>
        <div className="date-chip">
          <strong>{formatGameDateShort(game.tick)}</strong>
          <span>
            {formatGameClock(game.tick)}
            {game.speed === 0 ? ' · пауза' : ` · ×${game.speed}`}
          </span>
        </div>
        <button type="button" className="btn btn--ghost btn--sm mobile-only" onClick={onToggleLeft} aria-label="Панель армии">
          ☰
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void saveGame()}>
          Сохранить
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => openDialog({ type: 'settings' })}>
          Меню
        </button>
        <button type="button" className="btn btn--ghost btn--sm mobile-only" onClick={onToggleRight} aria-label="Информация о территории">
          ⓘ
        </button>
      </div>
    </header>
  );
}
