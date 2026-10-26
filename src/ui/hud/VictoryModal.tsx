import { useGameStore } from '@/store/gameStore';
import { Modal } from '@/ui/components/Modal';
import { Sparkline } from '@/ui/components/Sparkline';
import { formatGameDate } from '@/core/time/gameDate';
import { countCells } from '@/core/sim/regions';
import { territoryShare } from '@/core/sim/effects';
import { formatMoney, formatPopulation } from '@/ui/helpers/format';
import { playerCountry, playerStats } from '@/ui/helpers/game';

/** End of the campaign: the graph of the war and the final standings. */
export function VictoryModal() {
  const game = useGameStore((state) => state.game);
  const exitToMenu = useGameStore((state) => state.exitToMenu);
  const setScreen = useGameStore((state) => state.setScreen);
  const country = playerCountry(game);
  if (!game || game.status === 'playing') return null;
  const won = game.status === 'victory';
  const stats = playerStats(game);

  const standings = game.countryOrder
    .map((id) => ({
      country: game.countries[id]!,
      cells: countCells(game, id),
      share: territoryShare(game, id),
    }))
    .filter((entry) => !!entry.country)
    .sort((a, b) => b.share - a.share);

  return (
    <Modal
      title={won ? 'Победа' : 'Поражение'}
      onClose={exitToMenu}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={exitToMenu}>
            В главное меню
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setScreen('countrySelect')}>
            Новая кампания
          </button>
        </>
      }
    >
      <div className={`victory victory--${won ? 'win' : 'loss'}`}>
        <div className="victory__eyebrow">{won ? 'Кампания завершена' : 'Кампания провалена'}</div>
        <h3>{game.victory?.title ?? (won ? 'Победа' : 'Поражение')}</h3>
        <p>{game.victory?.description ?? 'Партия окончена.'}</p>
      </div>

      <div className="victory__chart">
        <div className="menu-section__title">Ход войны</div>
        <Sparkline
          samples={game.history}
          series={game.countryOrder.map((id) => {
            const entry = game.countries[id]!;
            return {
              id,
              color: entry.color,
              highlight: entry.id === game.playerCountryId,
              alive: entry.alive,
            };
          })}
        />
        <div className="victory__legend">
          {standings.map((entry) => (
            <span key={entry.country.id} className="victory__legend-item">
              <i style={{ background: entry.country.color }} />
              {entry.country.shortName} {Math.round(entry.share * 1000) / 10}%
            </span>
          ))}
        </div>
      </div>

      <dl className="facts">
        <div>
          <dt>Государство</dt>
          <dd>{country?.name ?? '—'}</dd>
        </div>
        <div>
          <dt>Дата</dt>
          <dd>{formatGameDate(game.tick)}</dd>
        </div>
        <div>
          <dt>Земли</dt>
          <dd>{Math.round(stats.share * 1000) / 10}%</dd>
        </div>
        <div>
          <dt>Население</dt>
          <dd>{formatPopulation(stats.population)}</dd>
        </div>
        <div>
          <dt>Захвачено клеток</dt>
          <dd>{country?.stats.captured ?? 0}</dd>
        </div>
        <div>
          <dt>Построено зданий</dt>
          <dd>{country?.stats.built ?? 0}</dd>
        </div>
        <div>
          <dt>Ракет выпущено</dt>
          <dd>{country?.stats.missiles ?? 0}</dd>
        </div>
        <div>
          <dt>Итоговая армия</dt>
          <dd>{formatMoney(stats.army)}</dd>
        </div>
      </dl>
    </Modal>
  );
}
