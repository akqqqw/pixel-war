import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';

/** Short messages: build results, failed actions, captured territories. */
export function Toasts() {
  const notices = useGameStore((state) => state.notices);
  const dismiss = useGameStore((state) => state.dismissNotice);

  useEffect(() => {
    if (notices.length === 0) return undefined;
    const timers = notices.map((notice) => window.setTimeout(() => dismiss(notice.id), 3200));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [notices, dismiss]);

  if (notices.length === 0) return null;
  return (
    <div className="toasts">
      {notices.map((notice) => (
        <button
          key={notice.id}
          type="button"
          className={`toast toast--${notice.kind}`}
          onClick={() => dismiss(notice.id)}
        >
          {notice.text}
        </button>
      ))}
    </div>
  );
}
