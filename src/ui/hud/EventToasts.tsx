import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';

export function EventToasts() {
  const notices = useGameStore((state) => state.notices);
  const dismiss = useGameStore((state) => state.dismissNotice);

  useEffect(() => {
    const timers = notices.map((notice) => window.setTimeout(() => dismiss(notice.id), 7000));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [notices, dismiss]);

  return (
    <div className="toasts">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`toast toast--${notice.kind}`}
          onClick={() => dismiss(notice.id)}
          role="status"
        >
          {notice.text}
        </div>
      ))}
    </div>
  );
}
