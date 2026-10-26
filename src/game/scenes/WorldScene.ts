import Phaser from 'phaser';
import { useGameStore } from '@/store/gameStore';
import type { GameState, TerritoryState, UnitGroup } from '@/core/state/types';
import type { TerritoryStatic, WorldData } from '@/core/world/world';
import { armyEntries, armyCount } from '@/core/units/army';
import type { LandUnitType } from '@/core/units/unitTypes';
import { CameraController } from '@/game/camera/CameraController';
import { EffectsLayer } from '@/game/effects/EffectsLayer';
import {
  TILE_PIXELS,
  darken,
  ensureOwnerLayer,
  ensureTerrainTexture,
  ensureUnitTextures,
  ensureUtilityTextures,
  ownerTextureKey,
  repaintOwnerLayer,
  terrainTextureKey,
  type OwnerLayer,
} from '@/game/render/GameTextures';
import { cityTextureKey } from '@/game/sprites/citySprites';
import { unitTextureKey } from '@/game/sprites/unitSprites';
import { mixHex } from '@/game/sprites/canvas';
import { onCameraCommand } from '@/game/bridge';

interface ArmyMarkerGroup {
  container: Phaser.GameObjects.Container;
  signature: string;
}

export class WorldScene extends Phaser.Scene {
  private gameRef: GameState | null = null;
  private ownerLayer!: OwnerLayer;
  private ownerImage!: Phaser.GameObjects.Image;
  private borderGraphics!: Phaser.GameObjects.Graphics;
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private pathGraphics!: Phaser.GameObjects.Graphics;
  private cameraController!: CameraController;
  private effects!: EffectsLayer;
  private cityObjects = new Map<string, ArmyMarkerGroup>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private groupObjects = new Map<string, { container: Phaser.GameObjects.Container; image: Phaser.GameObjects.Image; badge: Phaser.GameObjects.Text; type: LandUnitType }>();
  private lastRevision = -1;
  private lastSelection: string | null = '__none__';
  private lastOwnerSignature = '';
  private lastColorSignature = '';
  private lastBattleId: string | null = null;
  private lastCaptureTicks = new Map<string, number>();
  private lastCameraNonce = 0;
  private pinchDistance = 0;
  private unsubscribeCamera: (() => void) | null = null;

  constructor() {
    super('WorldScene');
  }

  create(): void {
    const store = useGameStore.getState();
    const game = store.game;
    if (!game) return;
    this.gameRef = game;
    const world = game.world;

    const width = world.width * TILE_PIXELS;
    const height = world.height * TILE_PIXELS;

    ensureTerrainTexture(this, world);
    ensureUtilityTextures(this);
    ensureUnitTextures(
      this,
      Object.values(game.countries).map((country) => country.color),
    );

    const terrain = this.add.image(0, 0, terrainTextureKey(world.seed)).setOrigin(0, 0);
    terrain.setDepth(0);

    this.ownerLayer = ensureOwnerLayer(this, world) as OwnerLayer;
    repaintOwnerLayer(this, world, game, this.ownerLayer as unknown as OwnerLayer);
    this.ownerImage = this.add.image(0, 0, ownerTextureKey(world.seed)).setOrigin(0, 0);
    this.ownerImage.setScale(TILE_PIXELS);
    this.ownerImage.setDepth(1);

    this.borderGraphics = this.add.graphics().setDepth(2);
    this.selectionGraphics = this.add.graphics().setDepth(3);
    this.pathGraphics = this.add.graphics().setDepth(4);

    this.drawBorders(game);
    this.lastOwnerSignature = this.ownerSignature(game);
    this.lastColorSignature = this.colorSignature(game);

    this.cameraController = new CameraController(this, width, height);
    this.cameraController.attach(this);
    this.effects = new EffectsLayer(this, 60);
    this.effects.setEnabled(store.settings.effects);

    this.buildCities(game);
    this.buildLabels(game);
    this.drawSelection(store.selectedTerritoryId);

    const capital = game.countries[game.playerCountryId]?.capitalTerritoryId;
    const focus = capital ?? world.territories[0]?.id;
    if (focus) {
      const territory = this.territoryStatic(world, focus);
      if (territory) {
        this.cameraController.focus(
          territory.centroid.x * TILE_PIXELS,
          territory.centroid.y * TILE_PIXELS,
          1.9,
        );
        this.cameraController.centerOn(
          territory.centroid.x * TILE_PIXELS,
          territory.centroid.y * TILE_PIXELS,
        );
      }
    }

    this.input.addPointer(2);
    this.setupInput();
    this.unsubscribeCamera?.();
    this.unsubscribeCamera = onCameraCommand((command) => {
      const centerX = this.cameras.main.width / 2;
      const centerY = this.cameras.main.height / 2;
      if (command.type === 'zoomIn') this.cameraController.zoomAt(centerX, centerY, 0.22);
      else if (command.type === 'zoomOut') this.cameraController.zoomAt(centerX, centerY, -0.2);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeCamera?.();
      this.unsubscribeCamera = null;
    });

    this.cameras.main.setBackgroundColor('#07101d');
    this.cameras.main.fadeIn(350, 6, 12, 22);
  }

  private setupInput(): void {
    let downX = 0;
    let downY = 0;
    let moved = 0;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      downX = pointer.x;
      downY = pointer.y;
      moved = 0;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      moved = Math.max(moved, Math.hypot(pointer.x - downX, pointer.y - downY));
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (moved > 10) return;
      // Ignore the finger that stays down after a pinch gesture.
      if (this.input.pointer1?.isDown && this.input.pointer1 !== pointer) return;
      if (this.input.pointer2?.isDown && this.input.pointer2 !== pointer) return;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tileX = Math.floor(worldPoint.x / TILE_PIXELS);
      const tileY = Math.floor(worldPoint.y / TILE_PIXELS);
      const game = this.gameRef;
      if (!game) return;
      if (tileX < 0 || tileY < 0 || tileX >= game.world.width || tileY >= game.world.height) return;
      const index = tileY * game.world.width + tileX;
      const region = game.world.tileTerritory[index] ?? -1;
      if (region < 0) {
        useGameStore.getState().selectTerritory(null);
        return;
      }
      const territory = game.world.territories[region];
      if (territory) {
        useGameStore.getState().selectTerritory(territory.id);
        this.effects.dust(worldPoint.x, worldPoint.y);
      }
    });
  }

  private territoryStatic(world: WorldData, id: string): TerritoryStatic | null {
    return world.territories.find((territory) => territory.id === id) ?? null;
  }

  private ownerSignature(game: GameState): string {
    return game.world.territories.map((territory) => game.territories[territory.id]?.owner ?? '-').join('');
  }

  private colorSignature(game: GameState): string {
    return Object.values(game.countries)
      .map((country) => country.color)
      .join('|');
  }

  private drawBorders(game: GameState): void {
    const gfx = this.borderGraphics;
    const world = game.world;
    gfx.clear();
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const index = y * world.width + x;
        const region = world.tileTerritory[index] ?? -1;
        if (region < 0) continue;
        const territory = world.territories[region];
        const state = territory ? game.territories[territory.id] : undefined;
        const country = state ? game.countries[state.owner] : undefined;
        if (!country) continue;
        const px = x * TILE_PIXELS;
        const py = y * TILE_PIXELS;
        const neighbors: [number, number, number, number][] = [
          [x - 1, y, px, py],
          [x + 1, y, px + TILE_PIXELS - 1, py],
          [x, y - 1, px, py],
          [x, y + 1, px, py + TILE_PIXELS - 1],
        ];
        for (const [nx, ny, ex, ey] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
          const neighborRegion = world.tileTerritory[ny * world.width + nx] ?? -1;
          if (neighborRegion === region) continue;
          const neighborState = neighborRegion >= 0
            ? game.territories[world.territories[neighborRegion]?.id ?? '']
            : undefined;
          const neighborOwner = neighborState?.owner;
          if (!neighborOwner) continue;
          const isNational = neighborOwner !== state?.owner;
          const color = isNational ? darken(country.color, 0.32) : mixHex(country.color, '#0b1524', 0.55);
          gfx.fillStyle(Phaser.Display.Color.HexStringToColor(color).color, isNational ? 0.95 : 0.5);
          if (nx !== x) {
            gfx.fillRect(ex, py, isNational ? 2 : 1, TILE_PIXELS);
          } else {
            gfx.fillRect(px, ey, TILE_PIXELS, isNational ? 2 : 1);
          }
        }
      }
    }
  }

  private drawSelection(selectedId: string | null): void {
    const gfx = this.selectionGraphics;
    gfx.clear();
    const game = this.gameRef;
    if (!game || !selectedId) return;
    const territory = this.territoryStatic(game.world, selectedId);
    if (!territory) return;
    const tiles = new Set(territory.tiles);
    const width = game.world.width;
    const accent = game.countries[game.territories[selectedId]?.owner ?? '']?.accent ?? '#ffe9a8';
    for (const tile of territory.tiles) {
      const x = tile % width;
      const y = Math.floor(tile / width);
      const px = x * TILE_PIXELS;
      const py = y * TILE_PIXELS;
      const edges: [number, number, number, number, number, number][] = [
        [tile - 1, px, py, TILE_PIXELS, 1, 0],
        [tile + 1, px + TILE_PIXELS - 1, py, 1, TILE_PIXELS, 0],
        [tile - width, px, py, TILE_PIXELS, 1, 0],
        [tile + width, px, py + TILE_PIXELS - 1, TILE_PIXELS, 1, 0],
      ];
      for (const [neighbor, ex, ey, ew, eh] of edges) {
        if (tiles.has(neighbor)) continue;
        const nx = neighbor % width;
        const ny = Math.floor(neighbor / width);
        if (neighbor < 0 || nx < 0 || nx >= width || ny < 0 || ny >= game.world.height) continue;
        gfx.fillStyle(Phaser.Display.Color.HexStringToColor('#ffffff').color, 0.85);
        gfx.fillRect(ex, ey, ew, eh);
      }
    }
    gfx.lineStyle(1, Phaser.Display.Color.HexStringToColor(accent).color, 0.6);
    const bounds = this.territoryBounds(territory);
    gfx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  private territoryBounds(territory: TerritoryStatic): { x: number; y: number; width: number; height: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const width = this.gameRef?.world.width ?? 128;
    for (const tile of territory.tiles) {
      const x = tile % width;
      const y = Math.floor(tile / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return {
      x: minX * TILE_PIXELS,
      y: minY * TILE_PIXELS,
      width: (maxX - minX + 1) * TILE_PIXELS,
      height: (maxY - minY + 1) * TILE_PIXELS,
    };
  }

  private buildCities(game: GameState): void {
    for (const territory of game.world.territories) {
      this.syncCity(game, territory);
    }
  }

  private syncCity(game: GameState, territory: TerritoryStatic): void {
    const state = game.territories[territory.id];
    if (!state) return;
    const country = game.countries[state.owner];
    if (!country) return;
    const signature = `${state.owner}|${territory.isCapital}|${this.markerSignature(state)}`;
    const existing = this.cityObjects.get(territory.id);
    if (existing && existing.signature === signature) return;
    if (existing) existing.container.destroy(true);

    const x = (territory.cityTile % game.world.width) * TILE_PIXELS + TILE_PIXELS / 2;
    const y = Math.floor(territory.cityTile / game.world.width) * TILE_PIXELS + TILE_PIXELS / 2;
    const container = this.add.container(x, y);
    container.setDepth(10);

    const icon = this.add.image(0, -4, cityTextureKey(country.color, territory.isCapital));
    icon.setScale(territory.isCapital ? 1 : 0.82);
    container.add(icon);

    // garrison stack
    const units = armyEntries(state.garrison).sort((a, b) => b.count - a.count);
    const total = armyCount(state.garrison);
    const shown = units.slice(0, 3);
    shown.forEach((entry, index) => {
      const iconImage = this.add.image(-16 + index * 13, 15, unitTextureKey(entry.type, 0, country.color));
      iconImage.setScale(0.58);
      iconImage.setAlpha(0.96);
      container.add(iconImage);
    });
    if (total > 0) {
      const badge = this.add.text(13, 9, `${total}`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#f4f1e4',
        backgroundColor: 'rgba(8,14,24,0.75)',
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
      });
      badge.setOrigin(0.5, 0.5);
      badge.setResolution(2);
      container.add(badge);
    }

    this.cityObjects.set(territory.id, { container, signature });
  }

  private markerSignature(state: TerritoryState): string {
    return `${armyCount(state.garrison)}:${armyEntries(state.garrison).map((entry) => entry.type).join(',')}`;
  }

  private buildLabels(game: GameState): void {
    for (const territory of game.world.territories) {
      const x = territory.centroid.x * TILE_PIXELS;
      const y = territory.centroid.y * TILE_PIXELS - 18;
      const text = this.add.text(x, y, territory.name, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#f2ecd8',
        stroke: '#08111e',
        strokeThickness: 3,
      });
      text.setOrigin(0.5, 0.5);
      text.setResolution(2);
      text.setDepth(11);
      this.labels.set(territory.id, text);
    }
  }

  private isGroupVisible(group: UnitGroup): boolean {
    return !!group.movement;
  }

  private groupType(group: UnitGroup): LandUnitType {
    const entries = armyEntries(group.army).sort((a, b) => b.def.attack - a.def.attack);
    return entries[0]?.type ?? 'apc';
  }

  private syncGroups(game: GameState): void {
    const seen = new Set<string>();
    for (const [id, group] of Object.entries(game.groups)) {
      if (!this.isGroupVisible(group)) continue;
      seen.add(id);
      const country = game.countries[group.country];
      if (!country) continue;
      const type = this.groupType(group);
      let entry = this.groupObjects.get(id);
      if (!entry || entry.type !== type) {
        entry?.container.destroy(true);
        const container = this.add.container(0, 0);
        container.setDepth(14);
        const image = this.add.image(0, 0, unitTextureKey(type, 0, country.color));
        image.setScale(0.85);
        const badge = this.add.text(8, 8, '', {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#f4f1e4',
          backgroundColor: 'rgba(8,14,24,0.8)',
          padding: { left: 2, right: 2, top: 1, bottom: 1 },
        });
        badge.setOrigin(0.5, 0.5);
        badge.setResolution(2);
        container.add([image, badge]);
        entry = { container, image, badge, type };
        this.groupObjects.set(id, entry);
      }
      entry.badge.setText(`${armyCount(group.army)}`);
    }

    for (const [id, entry] of this.groupObjects) {
      if (seen.has(id)) continue;
      entry.container.destroy(true);
      this.groupObjects.delete(id);
    }
  }

  private updateGroupPositions(game: GameState, time: number): void {
    const pathGfx = this.pathGraphics;
    pathGfx.clear();
    for (const [id, group] of Object.entries(game.groups)) {
      const entry = this.groupObjects.get(id);
      const movement = group.movement;
      if (!entry || !movement) continue;
      const fromId = movement.path[movement.step - 1] ?? movement.originTerritoryId;
      const toId = movement.path[movement.step];
      const from = this.territoryStatic(game.world, fromId);
      const to = toId ? this.territoryStatic(game.world, toId) : null;
      if (!from || !to) continue;
      const extra = game.speed > 0 ? game.tickProgressMs * game.speed : 0;
      const progress = Phaser.Math.Clamp((movement.progress + extra) / Math.max(1, movement.milliseconds), 0, 1);
      const sx = from.centroid.x * TILE_PIXELS;
      const sy = from.centroid.y * TILE_PIXELS;
      const tx = to.centroid.x * TILE_PIXELS;
      const ty = to.centroid.y * TILE_PIXELS;
      const wobble = Math.sin(time / 220 + (id.charCodeAt(1) || 0)) * 2.5;
      const nx = -(ty - sy);
      const ny = tx - sx;
      const length = Math.max(1, Math.hypot(nx, ny));
      const x = Phaser.Math.Linear(sx, tx, progress) + (nx / length) * wobble;
      const y = Phaser.Math.Linear(sy, ty, progress) + (ny / length) * wobble;
      entry.container.setPosition(x, y);
      const angle = Math.atan2(ty - sy, tx - sx);
      entry.image.setRotation(angle + Math.PI / 2);
      entry.image.setTexture(
        unitTextureKey(entry.type, Math.floor(time / 160) % 2 === 0 ? 0 : 1, game.countries[group.country]?.color ?? '#888888'),
      );
      entry.container.setDepth(14 + y / 1000);

      const owner = game.countries[group.country];
      if (owner) {
        pathGfx.lineStyle(1, Phaser.Display.Color.HexStringToColor(owner.accent).color, 0.35);
        const steps = 8;
        for (let i = 0; i < steps; i += 2) {
          const t0 = i / steps;
          const t1 = (i + 1) / steps;
          pathGfx.beginPath();
          pathGfx.moveTo(Phaser.Math.Linear(x, tx, t0), Phaser.Math.Linear(y, ty, t0));
          pathGfx.lineTo(Phaser.Math.Linear(x, tx, t1), Phaser.Math.Linear(y, ty, t1));
          pathGfx.strokePath();
        }
      }
    }
  }

  private handleBattleEffects(game: GameState, store: ReturnType<typeof useGameStore.getState>): void {
    const battle = game.battles[0];
    if (!battle || battle.id === this.lastBattleId) return;
    this.lastBattleId = battle.id;
    const territory = this.territoryStatic(game.world, battle.territoryId);
    if (territory) {
      const x = territory.centroid.x * TILE_PIXELS;
      const y = territory.centroid.y * TILE_PIXELS;
      this.effects.explosion(x, y, battle.attackerCountry === store.game?.playerCountryId);
      this.effects.explosion(x + 10, y - 8, false);
    }
  }

  private handleCaptureEffects(game: GameState): void {
    for (const territory of game.world.territories) {
      const state = game.territories[territory.id];
      if (!state?.capturedAtTick) continue;
      const seen = this.lastCaptureTicks.get(territory.id) ?? -1;
      if (state.capturedAtTick === seen) continue;
      this.lastCaptureTicks.set(territory.id, state.capturedAtTick);
      const country = game.countries[state.owner];
      const x = territory.centroid.x * TILE_PIXELS;
      const y = territory.centroid.y * TILE_PIXELS;
      this.effects.captureWave(x, y, country?.accent ?? '#ffffff');
      this.flashTerritory(territory, country?.color ?? '#ffffff');
    }
  }

  private flashTerritory(territory: TerritoryStatic, color: string): void {
    const game = this.gameRef;
    if (!game) return;
    const width = game.world.width;
    const gfx = this.add.graphics();
    gfx.setDepth(9);
    gfx.fillStyle(Phaser.Display.Color.HexStringToColor(mixHex(color, '#ffffff', 0.55)).color, 0.75);
    for (const tile of territory.tiles) {
      gfx.fillRect((tile % width) * TILE_PIXELS, Math.floor(tile / width) * TILE_PIXELS, TILE_PIXELS, TILE_PIXELS);
    }
    this.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: 900,
      ease: 'Quad.easeOut',
      onComplete: () => gfx.destroy(),
    });
  }

  private updateLabels(game: GameState, store: ReturnType<typeof useGameStore.getState>): void {
    const zoom = this.cameraController.zoom;
    const show = store.settings.labels && zoom >= 1.05;
    for (const [id, label] of this.labels) {
      const territory = this.territoryStatic(game.world, id);
      if (!territory) continue;
      const state = game.territories[id];
      const selected = store.selectedTerritoryId === id;
      const visible = show || selected;
      label.setVisible(visible);
      if (!visible) continue;
      const country = state ? game.countries[state.owner] : undefined;
      label.setColor(selected ? '#ffe9a8' : '#efe9d6');
      label.setScale(1 / zoom);
      label.setAlpha(selected ? 1 : 0.88);
      void country;
    }
  }

  private handlePinch(): void {
    const pointer1 = this.input.pointer1;
    const pointer2 = this.input.pointer2;
    if (pointer1?.isDown && pointer2?.isDown) {
      const distance = Phaser.Math.Distance.Between(pointer1.x, pointer1.y, pointer2.x, pointer2.y);
      if (this.pinchDistance > 0) {
        const delta = distance / this.pinchDistance;
        this.cameraController.zoomAt(
          (pointer1.x + pointer2.x) / 2,
          (pointer1.y + pointer2.y) / 2,
          delta - 1,
        );
      }
      this.pinchDistance = distance;
    } else {
      this.pinchDistance = 0;
    }
  }

  override update(time: number, delta: number): void {
    const store = useGameStore.getState();
    const game = store.game;
    if (!game || !this.cameraController || !this.effects) return;
    if (game !== this.gameRef) {
      this.cityObjects.forEach((entry) => entry.container.destroy(true));
      this.cityObjects.clear();
      this.labels.forEach((label) => label.destroy());
      this.labels.clear();
      this.groupObjects.forEach((entry) => entry.container.destroy(true));
      this.groupObjects.clear();
      this.scene.restart();
      return;
    }

    this.handlePinch();
    this.cameraController.update(delta);

    if (store.revision !== this.lastRevision) {
      this.lastRevision = store.revision;
      const ownerSignature = this.ownerSignature(game);
      if (ownerSignature !== this.lastOwnerSignature || this.colorSignature(game) !== this.lastColorSignature) {
        this.lastOwnerSignature = ownerSignature;
        this.lastColorSignature = this.colorSignature(game);
        repaintOwnerLayer(this, game.world, game, this.ownerLayer as unknown as OwnerLayer);
        this.drawBorders(game);
      }
      for (const territory of game.world.territories) this.syncCity(game, territory);
      this.syncGroups(game);
      this.handleBattleEffects(game, store);
      this.handleCaptureEffects(game);
      if (store.selectedTerritoryId !== this.lastSelection) {
        this.drawSelection(store.selectedTerritoryId);
      }
    }

    if (store.selectedTerritoryId !== this.lastSelection) {
      this.lastSelection = store.selectedTerritoryId;
      this.drawSelection(store.selectedTerritoryId);
    }

    this.selectionGraphics.setAlpha(0.65 + Math.sin(time / 260) * 0.25);
    this.effects.setEnabled(store.settings.effects);
    this.updateLabels(game, store);
    this.updateGroupPositions(game, time);
    this.effects.update(delta);

    if (store.cameraTarget && store.cameraTarget.nonce !== this.lastCameraNonce) {
      this.lastCameraNonce = store.cameraTarget.nonce;
      const territory = this.territoryStatic(game.world, store.cameraTarget.territoryId);
      if (territory) {
        this.cameraController.focus(
          territory.centroid.x * TILE_PIXELS,
          territory.centroid.y * TILE_PIXELS,
          Math.max(1.4, this.cameraController.zoom),
        );
      }
    }
  }
}

