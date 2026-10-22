export const DRONE_MODELS = [
  'Lightweight',
  'Middleweight',
  'Cruiserweight',
  'Heavyweight',
] as const;

export type DroneModel = (typeof DRONE_MODELS)[number];
