import Phaser from 'phaser';

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;

/** Mouse/touch camera: drag to pan, wheel or pinch to zoom, smooth focus on demand. */
export class CameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private targetZoom: number;
  private dragging = false;
  private dragMoved = 0;
  private lastPointer = { x: 0, y: 0 };
  private focusTarget: { x: number; y: number; zoom?: number } | null = null;
  private readonly worldWidth: number;
  private readonly worldHeight: number;

  constructor(scene: Phaser.Scene, worldWidth: number, worldHeight: number) {
    this.camera = scene.cameras.main;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.camera.setBounds(0, 0, worldWidth, worldHeight);
    this.targetZoom = 1;
    this.camera.setZoom(this.targetZoom);
    this.camera.setRoundPixels(true);
  }

  get zoom(): number {
    return this.camera.zoom;
  }

  get isDragging(): boolean {
    return this.dragging && this.dragMoved > 6;
  }

  attach(scene: Phaser.Scene): void {
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.dragMoved = 0;
      this.lastPointer = { x: pointer.x, y: pointer.y };
      this.focusTarget = null;
    });

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging || !pointer.isDown) return;
      const dx = pointer.x - this.lastPointer.x;
      const dy = pointer.y - this.lastPointer.y;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      if (this.dragMoved > 6) {
        this.camera.scrollX -= dx / this.camera.zoom;
        this.camera.scrollY -= dy / this.camera.zoom;
        this.clampScroll();
      }
      this.lastPointer = { x: pointer.x, y: pointer.y };
    });

    scene.input.on('pointerup', () => {
      this.dragging = false;
    });

    scene.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      this.zoomAt(pointer.x, pointer.y, dy > 0 ? -0.18 : 0.18);
    });

    scene.scale.on('resize', () => {
      this.clampScroll();
    });
  }

  zoomAt(screenX: number, screenY: number, delta: number): void {
    const worldBefore = this.camera.getWorldPoint(screenX, screenY);
    this.targetZoom = Phaser.Math.Clamp(this.targetZoom * (1 + delta), MIN_ZOOM, MAX_ZOOM);
    this.camera.setZoom(this.targetZoom);
    const worldAfter = this.camera.getWorldPoint(screenX, screenY);
    this.camera.scrollX += worldBefore.x - worldAfter.x;
    this.camera.scrollY += worldBefore.y - worldAfter.y;
    this.clampScroll();
  }

  handlePinch(distance: number, screenX: number, screenY: number): void {
    const worldBefore = this.camera.getWorldPoint(screenX, screenY);
    const target = Phaser.Math.Clamp(distance / 260, MIN_ZOOM, MAX_ZOOM);
    this.targetZoom = target;
    this.camera.setZoom(target);
    const worldAfter = this.camera.getWorldPoint(screenX, screenY);
    this.camera.scrollX += worldBefore.x - worldAfter.x;
    this.camera.scrollY += worldBefore.y - worldAfter.y;
    this.clampScroll();
  }

  focus(worldX: number, worldY: number, zoom?: number): void {
    this.focusTarget = { x: worldX, y: worldY, zoom };
  }

  centerOn(worldX: number, worldY: number): void {
    this.camera.centerOn(worldX, worldY);
    this.clampScroll();
  }

  update(delta: number): void {
    if (this.focusTarget) {
      const target = this.focusTarget;
      const cam = this.camera;
      const zoomTarget = target.zoom ? Phaser.Math.Clamp(target.zoom, MIN_ZOOM, MAX_ZOOM) : this.targetZoom;
      this.targetZoom = zoomTarget;
      const viewX = cam.width / 2 / cam.zoom;
      const viewY = cam.height / 2 / cam.zoom;
      const desiredX = target.x - viewX;
      const desiredY = target.y - viewY;
      const t = Math.min(1, delta / 140);
      cam.scrollX = Phaser.Math.Linear(cam.scrollX, desiredX, t);
      cam.scrollY = Phaser.Math.Linear(cam.scrollY, desiredY, t);
      cam.setZoom(Phaser.Math.Linear(cam.zoom, zoomTarget, t));
      this.clampScroll();
      if (Math.abs(cam.scrollX - desiredX) < 2 && Math.abs(cam.scrollY - desiredY) < 2) {
        this.focusTarget = null;
      }
    }
    this.clampScroll();
  }

  private clampScroll(): void {
    const cam = this.camera;
    const viewWidth = cam.width / cam.zoom;
    const viewHeight = cam.height / cam.zoom;
    if (viewWidth >= this.worldWidth) {
      cam.scrollX = (this.worldWidth - viewWidth) / 2;
    } else {
      cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, this.worldWidth - viewWidth);
    }
    if (viewHeight >= this.worldHeight) {
      cam.scrollY = (this.worldHeight - viewHeight) / 2;
    } else {
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, this.worldHeight - viewHeight);
    }
  }
}
