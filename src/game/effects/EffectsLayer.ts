import Phaser from 'phaser';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

interface Shockwave {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
}

export interface BurstOptions {
  colors: string[];
  count?: number;
  speed?: number;
  size?: number;
  life?: number;
  gravity?: number;
}

/** Pixel explosions, muzzle flashes, dust and capture shockwaves. */
export class EffectsLayer {
  private readonly scene: Phaser.Scene;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private enabled = true;

  constructor(scene: Phaser.Scene, depth = 50) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(depth);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.particles = [];
      this.shockwaves = [];
      this.graphics.clear();
    }
  }

  burst(x: number, y: number, options: BurstOptions): void {
    if (!this.enabled) return;
    const count = options.count ?? 14;
    const speed = options.speed ?? 55;
    const size = options.size ?? 2;
    const life = options.life ?? 520;
    const gravity = options.gravity ?? 40;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.35 + Math.random() * 0.9);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life,
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.9),
        color: options.colors[Math.floor(Math.random() * options.colors.length)] as string,
        gravity,
      });
    }
  }

  explosion(x: number, y: number, big = false): void {
    if (!this.enabled) return;
    this.burst(x, y, {
      colors: ['#fff3b0', '#ffb03a', '#ff6b2c', '#8c2f0f'],
      count: big ? 30 : 16,
      speed: big ? 95 : 60,
      size: big ? 3 : 2,
      life: big ? 760 : 480,
      gravity: 55,
    });
    this.burst(x, y, {
      colors: ['#5b5b5b', '#3a3a3a', '#7a7a7a'],
      count: big ? 14 : 7,
      speed: 26,
      size: 3,
      life: 1100,
      gravity: -8,
    });
    this.shockwaves.push({
      x,
      y,
      life: big ? 420 : 280,
      maxLife: big ? 420 : 280,
      radius: big ? 54 : 32,
      color: '#ffd27a',
    });
    if (this.scene.cameras.main && big) {
      this.scene.cameras.main.shake(140, 0.0035);
    }
  }

  muzzleFlash(x: number, y: number, angle: number): void {
    if (!this.enabled) return;
    this.burst(x + Math.cos(angle) * 8, y + Math.sin(angle) * 8, {
      colors: ['#ffeaa0', '#ffc44d', '#ff8b2b'],
      count: 5,
      speed: 40,
      size: 1.6,
      life: 220,
      gravity: 10,
    });
  }

  dust(x: number, y: number): void {
    if (!this.enabled) return;
    this.burst(x, y, {
      colors: ['#b8a98a', '#8e8168', '#d7cdb4'],
      count: 3,
      speed: 16,
      size: 2,
      life: 520,
      gravity: -4,
    });
  }

  captureWave(x: number, y: number, color: string): void {
    if (!this.enabled) return;
    this.shockwaves.push({ x, y, life: 620, maxLife: 620, radius: 96, color });
    this.burst(x, y, { colors: [color, '#ffffff'], count: 16, speed: 45, size: 2, life: 620, gravity: -12 });
  }

  update(delta: number): void {
    if (!this.enabled) return;
    const dt = Math.min(delta, 60) / 1000;
    this.graphics.clear();

    this.particles = this.particles.filter((particle) => {
      particle.life -= delta;
      if (particle.life <= 0) return false;
      particle.vy += particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
      this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(particle.color).color, alpha);
      this.graphics.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
      return true;
    });

    this.shockwaves = this.shockwaves.filter((wave) => {
      wave.life -= delta;
      if (wave.life <= 0) return false;
      const progress = 1 - wave.life / wave.maxLife;
      const radius = wave.radius * progress;
      const alpha = Math.max(0, 0.7 * (1 - progress));
      this.graphics.lineStyle(2, Phaser.Display.Color.HexStringToColor(wave.color).color, alpha);
      this.graphics.strokeRect(wave.x - radius, wave.y - radius * 0.7, radius * 2, radius * 1.4);
      return true;
    });
  }
}
