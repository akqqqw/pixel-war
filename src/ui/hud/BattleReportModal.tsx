import { useGameStore } from '@/store/gameStore';
import { armyCount } from '@/core/units/army';
import { LAND_UNITS } from '@/core/units/unitTypes';
import { countryDef } from '@/data/countries';
import { Modal } from '@/ui/components/Modal';
import { formatInt } from '@/ui/helpers/format';
import { unitIconUrl } from '@/ui/helpers/icons';
import { useGameSnapshot } from '@/ui/helpers/game';
import { formatGameDate } from '@/core/time/gameDate';
import type { Army } from '@/core/units/army';
import type { CountryId } from '@/core/types';

function LossList({ army, tint }: { army: Army; tint: string }) {
  const entries = (Object.entries(army) as [keyof typeof LAND_UNITS, number][])
    .filter(([, count]) => count > 0);
  if (entries.length === 0) return <span className="tiny muted">без потерь</span>;
  return (
    <span className="row wrap" style={{ gap: 6 }}>
      {entries.map(([type, count]) => (
        <span className="tag" key={type} style={{ color: 'var(--red)', borderColor: '#6d302a' }}>
          <img src={unitIconUrl(type, tint)} alt="" width={18} height={18} />
          {LAND_UNITS[type].shortName} −{count}
        </span>
      ))}
    </span>
  );
}

function SurvivorList({ army, tint }: { army: Army; tint: string }) {
  const entries = (Object.entries(army) as [keyof typeof LAND_UNITS, number][])
    .filter(([, count]) => count > 0);
  if (entries.length === 0) return <span className="tiny muted">уничтожены</span>;
  return (
    <span className="row wrap" style={{ gap: 6 }}>
      {entries.map(([type, count]) => (
        <span className="tag" key={type}>
          <img src={unitIconUrl(type, tint)} alt="" width={18} height={18} />
          {LAND_UNITS[type].shortName} ×{count}
        </span>
      ))}
    </span>
  );
}

export function BattleReportModal() {
  const report = useGameStore((state) => state.battleReport);
  const close = useGameStore((state) => state.closeBattleReport);
  const focusTerritory = useGameStore((state) => state.focusTerritory);
  const game = useGameSnapshot();
  if (!report || !game) return null;

  const playerId = game.playerCountryId;
  const attackerColor = game.countries[report.attackerCountry]?.color ?? '#888';
  const defenderColor = game.countries[report.defenderCountry]?.color ?? '#888';
  const playerIsAttacker = report.attackerCountry === playerId;
  const playerWon = playerIsAttacker ? report.outcome === 'attackerWin' : report.outcome === 'defenderWin';

  const attackerName = game.countries[report.attackerCountry]?.name ?? report.attackerCountry;
  const defenderName = game.countries[report.defenderCountry]?.name ?? report.defenderCountry;

  return (
    <Modal
      title="Боевое донесение"
      onClose={close}
      footer={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              focusTerritory(report.territoryId);
              close();
            }}
          >
            К территории
          </button>
          <button type="button" className="btn btn--primary" onClick={close}>
            Принято
          </button>
        </>
      }
    >
      <div className={`battle-outcome ${playerWon ? 'battle-outcome--win' : 'battle-outcome--loss'}`}>
        <div style={{ fontSize: 26 }}>{report.captured ? '█' : '▚'}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.04em' }}>
            {report.captured ? 'Территория захвачена' : report.outcome === 'defenderWin' ? 'Атака отбита' : 'Бой без результата'}
          </div>
          <div className="small muted">
            {report.territoryName} · {formatGameDate(report.tick)} · {attackerName} против {defenderName}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div className="tiny muted">Раундов</div>
          <strong>{report.rounds.length}</strong>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 8 }}>
        <span className="tag">Рельеф атаки ×{report.attackerTerrainMod.toFixed(2)}</span>
        <span className="tag">Оборона рельефа ×{report.defenderTerrainBonus.toFixed(2)}</span>
        <span className="tag">Гарнизон цели: {armyCount(report.defenderArmy)} ед.</span>
        <span className="tag">Атакующие: {armyCount(report.attackerArmy)} ед.</span>
      </div>

      <div className="send-grid">
        <div>
          <div className="label" style={{ marginBottom: 4 }}>
            Атакующий · {attackerName}
          </div>
          <div className="small" style={{ marginBottom: 4 }}>
            <span className="muted">Потери: </span>
            <LossList army={report.attackerLosses} tint={attackerColor} />
          </div>
          <div className="small">
            <span className="muted">Осталось: </span>
            {report.captured ? (
              <SurvivorList army={report.attackerArmy} tint={attackerColor} />
            ) : (
              <span className="tiny muted">отошли</span>
            )}
          </div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>
            Обороняющийся · {defenderName}
          </div>
          <div className="small" style={{ marginBottom: 4 }}>
            <span className="muted">Потери: </span>
            <LossList army={report.defenderLosses} tint={defenderColor} />
          </div>
          <div className="small">
            <span className="muted">Осталось: </span>
            {report.captured ? <span className="tiny muted">отступили</span> : <SurvivorList army={report.defenderArmy} tint={defenderColor} />}
          </div>
        </div>
      </div>

      <div>
        <div className="label" style={{ marginBottom: 4 }}>
          Ход боя
        </div>
        <table className="rounds-table">
          <thead>
            <tr>
              <th>Раунд</th>
              <th>Урон атакующего</th>
              <th>Урон обороны</th>
              <th>HP атак.</th>
              <th>HP обороны</th>
            </tr>
          </thead>
          <tbody>
            {report.rounds.map((round) => (
              <tr key={round.index}>
                <td>{round.index}</td>
                <td>{formatInt(round.attackerDamage)}</td>
                <td>{formatInt(round.defenderDamage)}</td>
                <td>{formatInt(round.attackerHpLeft)}</td>
                <td>{formatInt(round.defenderHpLeft)}</td>
              </tr>
            ))}
            {report.rounds.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Боя не было: территория занята без сопротивления.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="tiny muted">
        Ваша сторона: {playerIsAttacker ? 'атакующая' : 'обороняющаяся'} · подкрепления можно отправлять из панели
        территории. Итог боя влияет на границы и доход.
      </div>
      <span style={{ display: 'none' }}>{countryDef(report.attackerCountry as CountryId)?.name}</span>
    </Modal>
  );
}
