/** Minimal event bridge so React controls (zoom buttons) can drive the Phaser camera. */
export type CameraCommand = { type: 'zoomIn' } | { type: 'zoomOut' } | { type: 'recenter' };

type Listener = (command: CameraCommand) => void;

const listeners = new Set<Listener>();

export function onCameraCommand(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitCameraCommand(command: CameraCommand): void {
  listeners.forEach((listener) => listener(command));
}
