import type { ResourceKey } from '@/core/types';
import { formatDelta, formatResource } from '@/ui/helpers/format';
import { uiIcon } from '@/ui/helpers/icons';

interface ResourceChipProps {
  resource: ResourceKey;
  value: number;
  delta?: number;
}

const LABELS: Record<ResourceKey, string> = {
  money: 'Деньги',
  metal: 'Металл',
  oil: 'Нефть',
  energy: 'Энергия',
};

export function ResourceChip({ resource, value, delta }: ResourceChipProps) {
  return (
    <div className={`resource resource--${resource}`} title={LABELS[resource]}>
      <img src={uiIcon(resource)} alt="" width={16} height={16} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
        <span className="resource__value">{formatResource(value)}</span>
        {delta !== undefined && (
          <span
            className="resource__delta"
            style={{ color: delta < -0.05 ? 'var(--red)' : delta > 0.05 ? 'var(--green)' : 'var(--muted-2)' }}
          >
            {formatDelta(delta)}/ч
          </span>
        )}
      </div>
    </div>
  );
}
