import Phaser from 'phaser';
import { BUILDINGS, type BuildingKind } from '@/core/buildings/buildings';
import type { GameState } from '@/core/state/types';
import type { TerritoryStatic } from '@/core/world/world';
import { CameraController } from '@/game/camera/CameraController';
import {
  buildingTextureKey,
  ensureBuildingTextures,
  ensureOwnerLayer,
  ensureTerrainTexture,
  ownerTextureKey,
  repaintOwnerLayer,
  terrainTextureKey,
  type OwnerLayer,
} from '@/game/render/GameTextures';
import { TILE_PIXELS } from '@/game/sprites/terrainPainter';
import { useGameStore } from '@/store/gameStore';

interface BuildingMarker {
  signature: string;
  sprites: Phaser.GameObjects.Image[];
}

/**
 * Draws the world: flat terrain, political tint per cell, national borders,
 * structure glyphs with their action radius and the selected territory.
 */
export class WorldScene extends Phaser.Scene {
  private gameRef: GameState | null = null;
  private ownerLayer!: OwnerLayer;
  private borderGraphics!: Phaser.GameObjects.Graphics;
  private radiusGraphics!: Phaser.GameObjects.Graphics;
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private cameraController!: CameraController;
  private buildingMarkers = new Map<string, BuildingMarker>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private badges = new Map<string, Phaser.GameObjects.Text>();
  private flashes = new Map<string, number>();
  private lastRevision = -1;
  private lastSelection: string | null = '__none__';
  private lastChoice: BuildingKind | null = null;
  private lastOwnerSignature = '';
  private lastRadiiRevision = -1;
  private pinchDistance = 0;

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
    ensureBuildingTextures(this);

    this.add.image(0, 0, terrainTextureKey(world.seed)).setOrigin(0, 0).setDepth(0);

    this.ownerLayer = ensureOwnerLayer(this, world);
    repaintOwnerLayer(world, game, this.ownerLayer);
    const ownerImage = this.add.image(0, 0, ownerTextureKey(world.seed)).setOrigin(0, 0);
    ownerImage.setScale(TILE_PIXELS).setDepth(1);

    this.borderGraphics = this.add.graphics().setDepth(2);
    this.radiusGraphics = this.add.graphics().setDepth(3);
    this.selectionGraphics = this.add.graphics().setDepth(4);
    this.drawBorders(game);

    this.cameraController = new CameraController(this, width, height);
    this.cameraController.attach(this);

    this.buildAll(game);
    this.drawSelection(store.selectedTerritoryId);
    this.lastOwnerSignature = this.ownerSignature(game);
    this.lastSelection = store.selectedTerritoryId;

    const capital = game.countries[game.playerCountryId]?.capitalTerritoryId;
    const focusId = capital ?? world.territories[0]?.id ?? null;
    if (focusId) {
      const territory = world.territories.find((t) => t.id === focusId);
      if (territory) {
        this.cameraController.centerOn(territory.centroid.x * TILE_PIXELS, territory.centroid.y * TILE_PIXELS);
      }
    }

    this.input.addPointer(2);
    this.setupInput();
    this.cameras.main.setBackgroundColor('#0a1626');
    this.cameras.main.fadeIn(280, 6, 12, 22);
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
      if (this.input.pointer1?.isDown && this.input.pointer1 !== pointer) return;
      if (this.input.pointer2?.isDown && this.input.pointer2 !== pointer) return;
      this.handleClick(pointer);
    });
  }

  private handleClick(pointer: Phaser.Input.Pointer): void {
    const game = this.gameRef;
    if (!game) return;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_PIXELS);
    const tileY = Math.floor(worldPoint.y / TILE_PIXELS);
    if (tileX < 0 || tileY < 0 || tileX >= game.world.width || tileY >= game.world.height) return;
    const regionIndex = game.world.tileTerritory[tileY * game.world.width + tileX] ?? -1;
    if (regionIndex < 0) {
      useGameStore.getState().selectTerritory(null);
      return;
    }
    const territory = game.world.territories[regionIndex];
    if (!territory) return;
    const store = useGameStore.getState();
    if (store.buildingChoice) {
      const result = store.buildHere(territory.id);
      if (result.ok) this.flashTerritory(territory, '#ffe9a8');
      store.selectTerritory(territory.id);
      return;
    }
    if (store.transferFrom) {
      const result = store.finishTransfer(territory.id);
      if (result.ok) this.flashTerritory(territory, '#9fd0ff');
      return;
    }
    store.selectTerritory(territory.id);
  }

  private ownerSignature(game: GameState): string {
    let signature = '';
    for (const territory of game.world.territories) {
      signature += `${territory.id}:${game.territories[territory.id]?.owner ?? '-'};`;
    }
    return signature;
  }

  private drawBorders(game: GameState): void {
    const gfx = this.borderGraphics;
    gfx.clear();
    const world = game.world;
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const index = y * world.width + x;
        const region = world.tileTerritory[index] ?? -1;
        if (region < 0) continue;
        const px = x * TILE_PIXELS;
        const py = y * TILE_PIXELS;
        const ownerIndex = game.tileOwner[index] ?? -1;
        const neighbours: [number, number, number, number][] = [
          [x - 1, y, px, py],
          [x + 1, y, px + TILE_PIXELS - 1, py],
          [x, y - 1, px, py],
          [x, y + 1, px, py + TILE_PIXELS - 1],
        ];
        for (const [nx, ny, ex, ey] of neighbours) {
          if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
          const neighbourIndex = ny * world.width + nx;
          const neighbourRegion = world.tileTerritory[neighbourIndex] ?? -1;
          if (neighbourRegion === region) continue;
          if (neighbourRegion < 0) {
            // Coastline: a thin dark edge is enough, the painter already draws surf.
            gfx.fillStyle(0x081422, 0.5);
            if (nx !== x) gfx.fillRect(ex, py, 1, TILE_PIXELS);
            else gfx.fillRect(px, ey, TILE_PIXELS, 1);
            continue;
          }
          const neighbourOwner = game.tileOwner[neighbourIndex] ?? -1;
          const national = neighbourOwner !== ownerIndex;
          if (!national) {
            gfx.fillStyle(0x0b1524, 0.28);
            if (nx !== x) gfx.fillRect(ex, py, 1, TILE_PIXELS);
            else gfx.fillRect(px, ey, TILE_PIXELS, 1);
            continue;
          }
          const country = game.countryOrder[neighbourOwner] ? game.countries[game.countryOrder[neighbourOwner]!] : null;
          const color = country ? Phaser.Display.Color.HexStringToColor(country.color).color : 0x1a2233;
          gfx.fillStyle(color, 0.95);
          if (nx !== x) gfx.fillRect(ex, py, 2, TILE_PIXELS);
          else gfx.fillRect(px, ey, TILE_PIXELS, 2);
        }
      }
    }
  }

  private buildAll(game: GameState): void {
    for (const territory of game.world.territories) {
      this.syncBuildings(game, territory);
      this.syncLabel(game, territory);
      this.syncBadge(game, territory);
    }
  }

  private syncBuildings(game: GameState, territory: TerritoryStatic): void {
    const state = game.territories[territory.id];
    if (!state) return;
    const signature = state.buildings.map((building) => `${building.id}:${building.kind}`).join('|') + `#${state.owner}`;
    const existing = this.buildingMarkers.get(territory.id);
    if (existing && existing.signature === signature) return;
    existing?.sprites.forEach((sprite) => sprite.destroy());

    const sprites: Phaser.GameObjects.Image[] = [];
    const sorted = [...state.buildings].sort((a, b) => a.tile - b.tile);
    sorted.forEach((building, order) => {
      const x = (building.tile % game.world.width) * TILE_PIXELS + TILE_PIXELS / 2;
      const y = Math.floor(building.tile / game.world.width) * TILE_PIXELS + TILE_PIXELS / 2;
      const angle = (order / Math.max(1, sorted.length)) * Math.PI * 2;
      const offset = sorted.length > 1 ? 5 : 0;
      const sprite = this.add
        .image(x + Math.cos(angle) * offset, y + Math.sin(angle) * offset - 3, buildingTextureKey(building.kind))
        .setDepth(10);
      sprite.setScale(0.9);
      sprites.push(sprite);
    });
    this.buildingMarkers.set(territory.id, { signature, sprites });
  }

  private syncLabel(game: GameState, territory: TerritoryStatic): void {
    let label = this.labels.get(territory.id);
    if (!label) {
      label = this.add
        .text(territory.centroid.x * TILE_PIXELS, territory.centroid.y * TILE_PIXELS - 14, territory.name, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#f2ecd8',
          stroke: '#08111e',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(12);
      this.labels.set(territory.id, label);
    }
    void game;
  }

  private syncBadge(game: GameState, territory: TerritoryStatic): void {
    const state = game.territories[territory.id];
    if (!state) return;
    let badge = this.badges.get(territory.id);
    if (!badge) {
      badge = this.add
        .text(territory.centroid.x * TILE_PIXELS + 12, territory.centroid.y * TILE_PIXELS + 8, '', {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#ffe9a8',
          backgroundColor: 'rgba(8,14,24,0.7)',
          padding: { left: 2, right: 2, top: 1, bottom: 1 },
        })
        .setOrigin(0.5, 0.5)
        .setDepth(12);
      this.badges.set(territory.id, badge);
    }
    badge.setText(`${Math.round(state.army)}`);
    const selected = useGameStore.getState().selectedTerritoryId === territory.id;
    badge.setVisible(selected || this.cameras.main.zoom > 1.25);
  }

  private drawSelection(selectedId: string | null): void {
    const gfx = this.selectionGraphics;
    gfx.clear();
    const game = this.gameRef;
    if (!game) return;
    this.radiusGraphics.clear();
    if (!selectedId) return;
    const territory = game.world.territories.find((t) => t.id === selectedId);
    if (!territory) return;
    const state = game.territories[selectedId];
    const color = state?.owner ? game.countries[state.owner]?.accent ?? '#ffe9a8' : '#ffe9a8';
    const tiles = new Set(territory.tiles);
    const width = game.world.width;
    const tint = Phaser.Display.Color.HexStringToColor(color).color;
    gfx.fillStyle(tint, 0.95);
    for (const tile of territory.tiles) {
      const x = (tile % width) * TILE_PIXELS;
      const y = Math.floor(tile / width) * TILE_PIXELS;
      const edges: [number, number, number, number, number][] = [
        [tile - 1, x, y, TILE_PIXELS, 1],
        [tile + 1, x + TILE_PIXELS - 1, y, 1, TILE_PIXELS],
        [tile - width, x, y, TILE_PIXELS, 1],
        [tile + width, x, y + TILE_PIXELS - 1, TILE_PIXELS, 1],
      ];
      for (const [neighbour, ex, ey, ew, eh] of edges) {
        if (tiles.has(neighbour)) continue;
        gfx.fillRect(ex, ey, ew, eh);
      }
    }
    this.drawRadii(game, selectedId);
  }

  /**
   * Coverage of AA batteries and barricades. Every own structure shows its
   * radius; the ones inside the selected territory are highlighted.
   */
  private drawRadii(game: GameState, selectedId: string | null): void {
    const gfx = this.radiusGraphics;
    gfx.clear();
    const playerId = game.playerCountryId;
    for (const territory of Object.values(game.territories)) {
      if (territory.owner !== playerId) continue;
      const strong = territory.id === selectedId;
      for (const building of territory.buildings) {
        const def = BUILDINGS[building.kind];
        if (!def?.radius) continue;
        const x = (building.tile % game.world.width) * TILE_PIXELS + TILE_PIXELS / 2;
        const y = Math.floor(building.tile / game.world.width) * TILE_PIXELS + TILE_PIXELS / 2;
        const radius = def.radius * TILE_PIXELS;
        gfx.lineStyle(strong ? 1 : 1, 0x9fd0ff, strong ? 0.85 : 0.35);
        gfx.strokeCircle(x, y, radius);
        gfx.fillStyle(0x9fd0ff, strong ? 0.06 : 0.02);
        gfx.fillCircle(x, y, radius);
      }
    }
  }

  private flashTerritory(territory: TerritoryStatic, color: string): void {
    const game = this.gameRef;
    if (!game) return;
    const width = game.world.width;
    const gfx = this.add.graphics().setDepth(6);
    gfx.fillStyle(Phaser.Display.Color.HexStringToColor(color).color, 0.35);
    for (const tile of territory.tiles) {
      gfx.fillRect((tile % width) * TILE_PIXELS, Math.floor(tile / width) * TILE_PIXELS, TILE_PIXELS, TILE_PIXELS);
    }
    this.tweens.add({ targets: gfx, alpha: 0, duration: 700, onComplete: () => gfx.destroy() });
  }

  private handleCaptures(game: GameState): void {
    for (const territory of game.world.territories) {
      const state = game.territories[territory.id];
      if (!state?.capturedAtTick) continue;
      if ((this.flashes.get(territory.id) ?? -1) >= state.capturedAtTick) continue;
      this.flashes.set(territory.id, state.capturedAtTick);
      const country = state.owner ? game.countries[state.owner] : null;
      this.flashTerritory(territory, country?.accent ?? '#ffffff');
      this.cameras.main.shake(120, 0.002);
    }
  }

  private handlePinch(): void {
    const pointer1 = this.input.pointer1;
    const pointer2 = this.input.pointer2;
    if (pointer1?.isDown && pointer2?.isDown) {
      const distance = Phaser.Math.Distance.Between(pointer1.x, pointer1.y, pointer2.x, pointer2.y);
      if (this.pinchDistance > 0 && Math.abs(distance - this.pinchDistance) > 1) {
        this.cameraController.handlePinch(
          distance,
          (pointer1.x + pointer2.x) / 2,
          (pointer1.y + pointer2.y) / 2,
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
    if (!game || !this.cameraController) return;

    if (game !== this.gameRef) {
      this.scene.restart();
      return;
    }

    this.handlePinch();
    this.cameraController.update(delta);

    if (store.revision !== this.lastRevision) {
      this.lastRevision = store.revision;
      const signature = this.ownerSignature(game);
      if (signature !== this.lastOwnerSignature) {
        this.lastOwnerSignature = signature;
        repaintOwnerLayer(game.world, game, this.ownerLayer);
        this.drawBorders(game);
        this.buildingMarkers.forEach((marker) => {
          marker.signature = '__stale__';
        });
      }
      for (const territory of game.world.territories) {
        this.syncBuildings(game, territory);
        this.syncBadge(game, territory);
      }
      this.handleCaptures(game);
    }

    if (store.selectedTerritoryId !== this.lastSelection) {
      this.lastSelection = store.selectedTerritoryId;
      this.drawSelection(store.selectedTerritoryId);
    }
    if (store.buildingChoice !== this.lastChoice) {
      this.lastChoice = store.buildingChoice;
      this.drawSelection(store.selectedTerritoryId);
    }
    // Radii follow the map: they appear and disappear as structures change.
    if (store.revision !== this.lastRadiiRevision) {
      this.lastRadiiRevision = store.revision;
      this.drawRadii(game, store.selectedTerritoryId);
    }

    const zoom = this.cameraController.zoom;
    const showNames = zoom > 1.15;
    for (const [id, label] of this.labels) {
      const selected = store.selectedTerritoryId === id;
      label.setVisible(showNames || selected);
      label.setScale(1 / zoom);
    }
    for (const [id, badge] of this.badges) {
      const selected = store.selectedTerritoryId === id;
      badge.setVisible(selected || zoom > 1.25);
      badge.setScale(1 / zoom);
    }
    this.selectionGraphics.setAlpha(store.buildingChoice ? 0.55 + Math.sin(time / 240) * 0.35 : 0.9);
  }
}
