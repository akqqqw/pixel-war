import Phaser from 'phaser';
import { BUILDINGS, buildingRadius } from '@/core/buildings/buildings';
import type { BuildingInstance, GameState } from '@/core/state/types';
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
import { sound } from '@/services/audio';
import { useGameStore } from '@/store/gameStore';

interface Marker {
  signature: string;
  sprites: Phaser.GameObjects.GameObject[];
}

/**
 * Draws the war map: terrain, per-cell political colours, country borders,
 * structures (clustered when zoomed out), the selected cell, action radii and
 * the strike flashes. Everything is read from the store; the scene never
 * changes the game state on its own.
 */
export class WorldScene extends Phaser.Scene {
  private gameRef: GameState | null = null;
  private ownerLayer!: OwnerLayer;
  private borderGraphics!: Phaser.GameObjects.Graphics;
  private radiusGraphics!: Phaser.GameObjects.Graphics;
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private strikeGraphics!: Phaser.GameObjects.Graphics;
  private cameraController!: CameraController;

  private buildingMarkers = new Map<string, Marker>();
  private regionLabels = new Map<string, Phaser.GameObjects.Text>();
  private capitalLabels = new Map<string, Phaser.GameObjects.Text>();
  private flashes: { cell: number; at: number }[] = [];
  /** Cluster icons of a zoomed-out view, clickable as one marker. */
  private markerHits: { x: number; y: number; cell: number }[] = [];
  private lastMapVersion = -1;
  private lastRevision = -1;
  private lastSelection: number | null = -2;
  private lastChoice: string | null = '__none__';
  private lastDraft: number | null = -2;
  private lastZoomBucket = -1;
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
    this.add
      .image(0, 0, ownerTextureKey(world.seed))
      .setOrigin(0, 0)
      .setScale(TILE_PIXELS)
      .setDepth(1);

    this.borderGraphics = this.add.graphics().setDepth(2);
    this.radiusGraphics = this.add.graphics().setDepth(3);
    this.strikeGraphics = this.add.graphics().setDepth(5);
    this.selectionGraphics = this.add.graphics().setDepth(4);
    this.drawBorders(game);

    this.cameraController = new CameraController(this, width, height);
    this.cameraController.attach(this);
    this.cameraController.fit();
    const onResize = (): void => this.cameraController.fit();
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    this.syncMarkers(game);
    this.syncLabels(game);
    this.lastMapVersion = game.mapVersion;

    const capital = game.world.territories.find((region) => region.id === game.countries[game.playerCountryId]?.capitalRegionId);
    const focus = capital ?? game.world.territories[0];
    if (focus) {
      this.cameraController.centerOn(focus.centroid.x * TILE_PIXELS, focus.centroid.y * TILE_PIXELS);
    }

    this.input.addPointer(2);
    this.setupInput();
    this.cameras.main.setBackgroundColor('#0a1626');
    this.cameras.main.fadeIn(240, 6, 12, 22);
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
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) return;
      if (pointer.wasTouch) return;
      const store = useGameStore.getState();
      const cell = this.cellAtPointer(pointer);
      if (cell === null) {
        store.setHoverCell(null);
        return;
      }
      // A cluster icon stands for a building, so hovering it tells about that cell.
      const marker = this.markerAtPointer(pointer);
      store.setHoverCell(marker ?? cell);
    });
    this.input.on('gameout' as string, () => useGameStore.getState().setHoverCell(null));
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // A finger wobbles more than a mouse — allow a wider tap radius on touch.
      if (moved > (pointer.wasTouch ? 16 : 10)) return;
      if (this.input.pointer1?.isDown && this.input.pointer1 !== pointer) return;
      if (this.input.pointer2?.isDown && this.input.pointer2 !== pointer) return;
      this.handleClick(pointer);
    });
  }

  private cellToPixel(cell: number): { x: number; y: number } {
    const width = this.gameRef?.world.width ?? 1;
    return {
      x: (cell % width) * TILE_PIXELS + TILE_PIXELS / 2,
      y: Math.floor(cell / width) * TILE_PIXELS + TILE_PIXELS / 2,
    };
  }

  /** Cell under the pointer, or null when the pointer is off the map. */
  private cellAtPointer(pointer: Phaser.Input.Pointer): number | null {
    const game = this.gameRef;
    if (!game) return null;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / TILE_PIXELS);
    const tileY = Math.floor(worldPoint.y / TILE_PIXELS);
    if (tileX < 0 || tileY < 0 || tileX >= game.world.width || tileY >= game.world.height) return null;
    return tileY * game.world.width + tileX;
  }

  /** Cell of the cluster icon under the pointer (zoomed-out view only). */
  private markerAtPointer(pointer: Phaser.Input.Pointer): number | null {
    if (this.cameraController && this.cameraController.zoom >= 1.15) return null;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    for (const hit of this.markerHits) {
      if (Math.abs(hit.x - point.x) <= 9 && Math.abs(hit.y - point.y) <= 9) return hit.cell;
    }
    return null;
  }

  private handleClick(pointer: Phaser.Input.Pointer): void {
    const game = this.gameRef;
    if (!game) return;
    const cell = this.markerAtPointer(pointer) ?? this.cellAtPointer(pointer);
    if (cell === null) return;
    const store = useGameStore.getState();

    if (store.strikeBuildingId) {
      const result = store.fireAt(cell);
      if (result.ok) this.flashes.push({ cell, at: this.time.now });
      return;
    }
    if (store.buildingChoice) {
      const result = store.placeAt(cell);
      if (result.ok) this.flashes.push({ cell, at: this.time.now });
      return;
    }

    const playerIndex = game.countryOrder.indexOf(game.playerCountryId);
    const owner = game.cellOwner[cell] ?? -1;
    const selected = store.selectedCell;
    const selectedOwner = selected !== null ? game.cellOwner[selected] ?? -1 : -1;

    // Own cell selected, enemy cell clicked → choose the direction of the push.
    if (selected !== null && selectedOwner === playerIndex && owner >= 0 && owner !== playerIndex) {
      const result = store.draftOffensive(cell);
      if (!result.ok && result.message) store.pushNotice(result.message, 'danger');
      return;
    }
    store.cancelDraft();
    store.selectCell(cell);
  }

  private drawBorders(game: GameState): void {
    const gfx = this.borderGraphics;
    gfx.clear();
    const world = game.world;
    const width = world.width;
    for (let cell = 0; cell < game.cellOwner.length; cell += 1) {
      const owner = game.cellOwner[cell] ?? -1;
      if (owner < 0) continue;
      const x = cell % width;
      const y = (cell / width) | 0;
      const px = x * TILE_PIXELS;
      const py = y * TILE_PIXELS;
      const neighbours: [number, number][] = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbours) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= world.height) continue;
        const next = ny * width + nx;
        const nextOwner = game.cellOwner[next] ?? -1;
        if (nextOwner === owner) continue;
        const east = nx !== x;
        const gfxColor = nextOwner < 0 ? 0x081422 : 0x0b1524;
        gfx.fillStyle(gfxColor, nextOwner < 0 ? 0.35 : 0.18);
        if (east) gfx.fillRect(nx > x ? px + TILE_PIXELS - 1 : px, py, 1, TILE_PIXELS);
        else gfx.fillRect(px, ny > y ? py + TILE_PIXELS - 1 : py, TILE_PIXELS, 1);
      }
    }
  }

  /** Structure icons when zoomed in, one counted cluster per region otherwise. */
  private syncMarkers(game: GameState): void {
    const zoomedIn = this.cameraController ? this.cameraController.zoom >= 1.15 : true;
    this.markerHits = [];
    const signatures = new Map<string, string>();
    for (const region of Object.values(game.regions)) {
      const key = `r:${region.id}`;
      const parts = region.buildings.map((building) => `${building.id}:${building.kind}:${building.level}`);
      signatures.set(key, `${zoomedIn ? 'in' : 'out'}|${parts.join(',')}|${region.owner ?? '-'}`);
    }

    for (const [key, marker] of [...this.buildingMarkers]) {
      if (signatures.get(key) !== marker.signature || !signatures.has(key)) {
        marker.sprites.forEach((sprite) => sprite.destroy());
        this.buildingMarkers.delete(key);
      }
    }

    for (const region of Object.values(game.regions)) {
      const key = `r:${region.id}`;
      const signature = signatures.get(key) ?? '';
      if (this.buildingMarkers.has(key)) continue;
      const sprites: Phaser.GameObjects.GameObject[] = [];
      if (zoomedIn) {
        for (const building of region.buildings) {
          sprites.push(this.drawBuildingIcon(building));
        }
      } else if (region.buildings.length > 0) {
        const staticRegion = game.world.territories.find((entry) => entry.id === region.id);
        if (staticRegion) {
          const counts = new Map<string, number>();
          for (const building of region.buildings) {
            counts.set(building.kind, (counts.get(building.kind) ?? 0) + 1);
          }
          const kinds = [...counts.entries()].slice(0, 3);
          const baseX = staticRegion.centroid.x * TILE_PIXELS;
          const baseY = staticRegion.centroid.y * TILE_PIXELS + 10;
          kinds.forEach(([kind, count], index) => {
            const offset = (index - (kinds.length - 1) / 2) * 14;
            const icon = this.add
              .image(baseX + offset, baseY, buildingTextureKey(kind as keyof typeof BUILDINGS))
              .setDepth(11)
              .setScale(1.1);
            const label = this.add
              .text(baseX + offset + 7, baseY + 6, `${count}`, {
                fontFamily: 'monospace',
                fontSize: '9px',
                color: '#f4ecd8',
                stroke: '#08111e',
                strokeThickness: 3,
              })
              .setOrigin(0.5, 0.5)
              .setDepth(12);
            sprites.push(icon, label);
          });
          const first = region.buildings[0];
          if (first) {
            this.markerHits.push({ x: baseX, y: baseY, cell: first.cell });
          }
        }
      }
      this.buildingMarkers.set(key, { signature, sprites });
    }
  }

  private drawBuildingIcon(building: BuildingInstance): Phaser.GameObjects.Image {
    const { x, y } = this.cellToPixel(building.cell);
    const icon = this.add
      .image(x, y, buildingTextureKey(building.kind))
      .setDepth(10)
      .setScale(0.8);
    if (building.level > 1) icon.setTint(0xfff0c0);
    return icon;
  }

  private syncLabels(game: GameState): void {
    for (const country of Object.values(game.countries)) {
      const region = game.world.territories.find((entry) => entry.id === country.capitalRegionId);
      if (!region) continue;
      let label = this.capitalLabels.get(country.id);
      if (!label) {
        label = this.add
          .text(region.centroid.x * TILE_PIXELS, region.centroid.y * TILE_PIXELS - 16, country.shortName, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#f6efdd',
            stroke: '#08111e',
            strokeThickness: 3,
          })
          .setOrigin(0.5, 0.5)
          .setDepth(13);
        this.capitalLabels.set(country.id, label);
      }
    }
    for (const country of Object.values(game.countries)) {
      const label = this.capitalLabels.get(country.id);
      if (!label) continue;
      label.setColor(country.isPlayer ? '#ffe9a8' : '#f6efdd');
      label.setVisible(country.alive);
    }
    void game;
  }

  private selectRegionLabel(cell: number | null, game: GameState): void {
    if (cell === null) return;
    const index = game.world.tileTerritory[cell] ?? -1;
    const region = game.world.territories[index];
    if (!region) return;
    if (this.regionLabels.has(region.id)) return;
    const label = this.add
      .text(region.centroid.x * TILE_PIXELS, region.centroid.y * TILE_PIXELS, region.name, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#cfe6ff',
        stroke: '#08111e',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(13);
    this.regionLabels.set(region.id, label);
  }

  private drawSelection(game: GameState): void {
    const gfx = this.selectionGraphics;
    const radius = this.radiusGraphics;
    gfx.clear();
    radius.clear();
    const store = useGameStore.getState();
    const selected = store.selectedCell;
    const playerIndex = game.countryOrder.indexOf(game.playerCountryId);

    if (selected !== null) {
      const { x, y } = this.cellToPixel(selected);
      const owner = game.cellOwner[selected] ?? -1;
      const country = owner >= 0 ? game.countries[game.countryOrder[owner]!] : null;
      const color = country ? Phaser.Display.Color.HexStringToColor(country.accent).color : 0x9fd0ff;
      gfx.lineStyle(2, color, 0.95);
      gfx.strokeRect(
        x - TILE_PIXELS / 2 - 1,
        y - TILE_PIXELS / 2 - 1,
        TILE_PIXELS + 2,
        TILE_PIXELS + 2,
      );
      if (owner === playerIndex) {
        const neighbours = this.landNeighbourCells(game, selected);
        for (const next of neighbours) {
          if ((game.cellOwner[next] ?? -1) === playerIndex) continue;
          const point = this.cellToPixel(next);
          gfx.lineStyle(1, 0xff8a5c, 0.55);
          gfx.strokeRect(
            point.x - TILE_PIXELS / 2,
            point.y - TILE_PIXELS / 2,
            TILE_PIXELS,
            TILE_PIXELS,
          );
        }
      }
    }

    // The structure of the selected cell shows its action radius. While a strike
    // is being aimed, the radius of the chosen launcher is shown in orange.
    const regionIndex = selected !== null ? game.world.tileTerritory[selected] ?? -1 : -1;
    const region = regionIndex >= 0 ? game.regions[game.world.territories[regionIndex]?.id ?? ''] : undefined;
    const strikeBuilding = store.strikeBuildingId
      ? Object.values(game.regions)
          .flatMap((entry) => entry.buildings)
          .find((entry) => entry.id === store.strikeBuildingId)
      : undefined;
    if (strikeBuilding) {
      const def = BUILDINGS[strikeBuilding.kind];
      if (def.radius) {
        const { x, y } = this.cellToPixel(strikeBuilding.cell);
        const pixels = buildingRadius(strikeBuilding.kind, strikeBuilding.level) * TILE_PIXELS;
        radius.fillStyle(0xff8a5c, 0.09);
        radius.fillCircle(x, y, pixels);
        radius.lineStyle(2, 0xff8a5c, 0.8);
        radius.strokeCircle(x, y, pixels);
      }
    }
    const building = region?.buildings.find((entry) => entry.cell === selected);
    if (building) {
      const def = BUILDINGS[building.kind];
      if (def.radius) {
        const { x, y } = this.cellToPixel(building.cell);
        const pixels = def.radius * TILE_PIXELS;
        radius.fillStyle(0x9fd0ff, 0.07);
        radius.fillCircle(x, y, pixels);
        radius.lineStyle(1, 0x9fd0ff, 0.55);
        radius.strokeCircle(x, y, pixels);
      }
    }

    // Direction draft: highlight the target and draw a line from the source.
    const draft = store.orderDraft;
    if (draft) {
      const target = this.cellToPixel(draft.targetCell);
      const source = selected !== null ? this.cellToPixel(selected) : null;
      if (source) {
        gfx.lineStyle(1, 0xff8a5c, 0.5);
        gfx.lineBetween(source.x, source.y, target.x, target.y);
      }
      gfx.lineStyle(2, 0xff8a5c, 0.95);
      gfx.strokeRect(
        target.x - TILE_PIXELS / 2 - 1,
        target.y - TILE_PIXELS / 2 - 1,
        TILE_PIXELS + 2,
        TILE_PIXELS + 2,
      );
    }
  }

  private landNeighbourCells(game: GameState, cell: number): number[] {
    const width = game.world.width;
    const x = cell % width;
    const y = (cell / width) | 0;
    const out: number[] = [];
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= game.world.height) continue;
      out.push(ny * width + nx);
    }
    return out;
  }

  private drawStrikes(game: GameState, time: number): void {
    const gfx = this.strikeGraphics;
    gfx.clear();

    // Pulse on the cell the running offensive is aimed at.
    const playerIndex = game.countryOrder.indexOf(game.playerCountryId);
    const order = game.orders.find((entry) => entry.countryId === game.playerCountryId && entry.active);
    if (order && playerIndex >= 0) {
      const { x, y } = this.cellToPixel(order.targetCell);
      const pulse = 0.45 + Math.sin(time / 220) * 0.35;
      gfx.lineStyle(2, 0xff8a5c, pulse);
      gfx.strokeRect(
        x - TILE_PIXELS / 2 - 2,
        y - TILE_PIXELS / 2 - 2,
        TILE_PIXELS + 4,
        TILE_PIXELS + 4,
      );
    }
    for (const strike of game.strikes) {
      const progress = Phaser.Math.Clamp((game.tick + 1 - strike.fireAtTick) / 2, 0, 1);
      const from = this.cellToPixel(strike.fromCell);
      const to = this.cellToPixel(strike.targetCell);
      const x = Phaser.Math.Linear(from.x, to.x, progress);
      const y = Phaser.Math.Linear(from.y, to.y, progress);
      const color = strike.kind === 'missile' ? 0xff8a5c : 0xffe9a8;
      gfx.fillStyle(color, 0.95);
      if (strike.kind === 'missile') gfx.fillRect(x - 1, y - 1, 3, 3);
      else {
        const size = 2 + Math.sin(time / 60) * 1;
        gfx.fillRect(x - size, y - size, size * 2, size * 2);
      }
    }
    // Short sparks where the frontline actually fought this tick.
    if (this.cameraController && this.cameraController.zoom >= 0.85) {
      const owner = game.countryOrder.indexOf(game.playerCountryId);
      for (let index = 0; index < game.lastFights.length; index += 1) {
        const cell = game.lastFights[index]!;
        const mine = (game.cellOwner[cell] ?? -1) === owner;
        const flicker = Math.sin(time / 70 + index * 1.7);
        if (flicker < 0) continue;
        const { x, y } = this.cellToPixel(cell);
        gfx.fillStyle(mine ? 0xffe9a8 : 0xff8a5c, 0.28 + flicker * 0.35);
        gfx.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    for (const flash of this.flashes) {
      const age = time - flash.at;
      if (age > 450) continue;
      const alpha = 1 - age / 450;
      const { x, y } = this.cellToPixel(flash.cell);
      const size = TILE_PIXELS * (1 + age / 260);
      gfx.fillStyle(0xffd27a, alpha * 0.65);
      gfx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }

  private handleCaptures(game: GameState): void {
    const now = this.time.now;
    const owner = game.countryOrder.indexOf(game.playerCountryId);
    let gained = 0;
    let lost = 0;
    for (const cell of game.lastCaptured) {
      this.flashes.push({ cell, at: now });
      if ((game.cellOwner[cell] ?? -1) === owner) gained += 1;
      else lost += 1;
    }
    if (game.lastCaptured.length > 0) this.cameras.main.shake(90, 0.0015);
    if (gained > 0) sound.play('capture');
    else if (lost > 0) sound.play('lost');
    this.flashes = this.flashes.filter((flash) => now - flash.at < 500);
  }

  private handlePinch(): void {
    const pointer1 = this.input.pointer1;
    const pointer2 = this.input.pointer2;
    if (pointer1?.isDown && pointer2?.isDown) {
      const distance = Phaser.Math.Distance.Between(pointer1.x, pointer1.y, pointer2.x, pointer2.y);
      if (this.pinchDistance > 0 && Math.abs(distance - this.pinchDistance) > 1) {
        this.cameraController.handlePinch(distance, (pointer1.x + pointer2.x) / 2, (pointer1.y + pointer2.y) / 2);
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
      if (game.mapVersion !== this.lastMapVersion) {
        this.lastMapVersion = game.mapVersion;
        repaintOwnerLayer(game.world, game, this.ownerLayer);
        this.drawBorders(game);
        this.buildingMarkers.forEach((marker) => {
          marker.sprites.forEach((sprite) => sprite.destroy());
        });
        this.buildingMarkers.clear();
      }
      this.handleCaptures(game);
      this.syncMarkers(game);
    }

    const zoomBucket = Math.round(this.cameraController.zoom * 4);
    if (zoomBucket !== this.lastZoomBucket) {
      this.lastZoomBucket = zoomBucket;
      this.syncMarkers(game);
    }

    if (store.selectedCell !== this.lastSelection) {
      this.lastSelection = store.selectedCell;
      this.selectRegionLabel(store.selectedCell, game);
      this.drawSelection(game);
    }
    if (store.buildingChoice !== this.lastChoice || store.orderDraft?.targetCell !== this.lastDraft) {
      this.lastChoice = store.buildingChoice;
      this.lastDraft = store.orderDraft?.targetCell ?? null;
      this.drawSelection(game);
    }

    this.drawStrikes(game, time);

    const zoom = this.cameraController.zoom;
    for (const label of this.capitalLabels.values()) {
      label.setVisible(zoom > 0.85);
      label.setScale(1 / zoom);
    }
    for (const label of this.regionLabels.values()) {
      label.setVisible(zoom > 1.6);
      label.setScale(1 / zoom);
    }
    for (const marker of this.buildingMarkers.values()) {
      for (const sprite of marker.sprites) {
        if (sprite instanceof Phaser.GameObjects.Text) sprite.setScale(1 / Math.max(1, zoom * 0.8));
      }
    }
    this.selectionGraphics.setAlpha(store.buildingChoice || store.strikeBuildingId ? 0.55 + Math.sin(time / 240) * 0.35 : 0.9);
  }
}
