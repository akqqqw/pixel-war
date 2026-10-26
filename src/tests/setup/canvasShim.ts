import { createCanvas } from '@napi-rs/canvas';

/**
 * The pixel-art painters only need document.createElement('canvas').
 * A real canvas implementation keeps them testable outside the browser.
 */
const globalScope = globalThis as unknown as {
  document?: { createElement: (tag: string) => unknown };
};

if (typeof globalScope.document === 'undefined') {
  globalScope.document = {
    createElement: (tag: string): unknown => {
      if (tag === 'canvas') return createNapiCanvas(1, 1);
      return {};
    },
  };
}

interface NapiCanvasLike {
  getContext: (type: '2d') => unknown;
  toDataURL: () => string;
}

interface NapiContextLike {
  drawImage: (...args: unknown[]) => unknown;
}

function createNapiCanvas(width: number, height: number): NapiCanvasLike {
  return createCanvas(width, height) as unknown as NapiCanvasLike;
}

// jsdom has no 2D rasteriser. Back its canvases with a native canvas so the
// painters run unchanged inside UI tests, translating drawImage arguments.
if (typeof HTMLCanvasElement !== 'undefined') {
  const backing = new WeakMap<object, NapiCanvasLike>();
  const proxies = new WeakMap<object, unknown>();

  const toNative = (image: unknown): unknown => {
    if (image && typeof image === 'object') return backing.get(image as object) ?? image;
    return image;
  };

  const proto = HTMLCanvasElement.prototype as unknown as { getContext: (type: string) => unknown };
  proto.getContext = function getContext(this: HTMLCanvasElement, type: string): unknown {
    if (type !== '2d') return null;
    let native = backing.get(this);
    if (!native) {
      native = createNapiCanvas(Math.max(1, this.width || 300), Math.max(1, this.height || 150));
      backing.set(this, native);
    }
    const cached = proxies.get(native);
    if (cached) return cached;
    const context = native.getContext('2d') as Record<string | symbol, unknown>;
    const proxy = new Proxy(context, {
      get(target, property) {
        if (property === 'drawImage') {
          return (image: unknown, ...rest: unknown[]) =>
            (target.drawImage as NapiContextLike['drawImage'])(toNative(image), ...rest);
        }
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
      set(target, property, value) {
        Reflect.set(target, property, value);
        return true;
      },
    });
    proxies.set(native, proxy);
    return proxy;
  };

  (HTMLCanvasElement.prototype as unknown as { toDataURL: () => string }).toDataURL = function toDataURL(
    this: HTMLCanvasElement,
  ): string {
    const native = backing.get(this);
    return native ? native.toDataURL() : 'data:image/png;base64,';
  };
}

// Phaser's feature detection runs on import, before any test body executes.
if (typeof window !== 'undefined' && !('CanvasRenderingContext2D' in window)) {
  (window as unknown as { CanvasRenderingContext2D: unknown }).CanvasRenderingContext2D = class {};
}

// jsdom omits a few browser APIs the game shell relies on.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

export {};
