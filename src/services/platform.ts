/**
 * Platform boundary.
 *
 * The game ships as a pure web build, but the same code must later run inside
 * the Yandex Games SDK (cloud saves, fullscreen ads, achievements, leaderboards).
 * Everything platform specific therefore goes through this interface: the store
 * and the UI never touch `window.YaGames` or `localStorage` for these features.
 *
 * `LocalPlatform` is today's implementation — it keeps working offline and
 * silently reports "no cloud" where the browser cannot provide it.
 */

export type AchievementId =
  | 'first_capture'
  | 'region_taken'
  | 'half_world'
  | 'rival_eliminated'
  | 'first_victory'
  | 'rocket_launched'
  | 'heavy_mobilization'
  | 'fortified';

export type LeaderboardId = 'land_share' | 'fastest_victory';

export interface Platform {
  readonly id: 'local' | 'yandex';
  /** Cloud saves are available — the UI may offer them. */
  readonly hasCloud: boolean;
  init(): Promise<void>;
  saveToCloud(slot: string, data: string): Promise<boolean>;
  loadFromCloud(slot: string): Promise<string | null>;
  unlockAchievement(id: AchievementId): Promise<void>;
  submitScore(board: LeaderboardId, value: number): Promise<void>;
  /** Fullscreen interstitial between campaigns; resolves when it is closed. */
  showFullscreenAd(): Promise<void>;
  /** Called when the hosting platform asks the game to stop (tab hidden, ad). */
  onPause(handler: () => void): void;
  onResume(handler: () => void): void;
}

const CLOUD_PREFIX = 'pixel-war-cloud-';

/**
 * Offline implementation: cloud slots live in `localStorage` when it is
 * available, ads resolve instantly and scores are written to a local board.
 */
export class LocalPlatform implements Platform {
  readonly id = 'local';

  constructor(private readonly cloudEnabled = true) {}

  get hasCloud(): boolean {
    if (!this.cloudEnabled) return false;
    try {
      const probe = '__pixel_war_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    // Nothing to boot offline — kept async so the call sites match the SDK.
  }

  async saveToCloud(slot: string, data: string): Promise<boolean> {
    if (!this.hasCloud) return false;
    try {
      localStorage.setItem(`${CLOUD_PREFIX}${slot}`, data);
      return true;
    } catch {
      return false;
    }
  }

  async loadFromCloud(slot: string): Promise<string | null> {
    if (!this.hasCloud) return null;
    try {
      return localStorage.getItem(`${CLOUD_PREFIX}${slot}`);
    } catch {
      return null;
    }
  }

  async unlockAchievement(): Promise<void> {
    // Stored by `achievements.ts` next to the rest of the progress.
  }

  async submitScore(board: LeaderboardId, value: number): Promise<void> {
    try {
      const key = `pixel-war-score-${board}`;
      const best = Number(localStorage.getItem(key) ?? 0);
      if (!Number.isFinite(best) || value > best) localStorage.setItem(key, String(Math.round(value)));
    } catch {
      // Private mode: scores simply are not kept.
    }
  }

  async showFullscreenAd(): Promise<void> {
    // No ads in the offline build — resolve immediately so nothing blocks.
  }

  onPause(handler: () => void): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) handler();
    });
  }

  onResume(handler: () => void): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) handler();
    });
  }
}

export const platform: Platform = new LocalPlatform();

/** Local best score, shown next to the leaderboard placeholders. */
export function localBestScore(board: LeaderboardId): number {
  try {
    const raw = localStorage.getItem(`pixel-war-score-${board}`);
    const value = Number(raw ?? 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}
