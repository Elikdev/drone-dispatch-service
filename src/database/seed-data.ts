import { DroneModel } from '../modules/drones/domain/drone.rules';

export interface DroneSeed {
  serialNumber: string;
  model: DroneModel;
  weightLimitG: number;
  batteryPct: number;
}

export interface MedicationSeed {
  name: string;
  code: string;
  weightG: number;
  imageUrl: string;
}

export const DRONE_SEEDS: DroneSeed[] = [
  {
    serialNumber: 'DRN-LW-001',
    model: 'Lightweight',
    weightLimitG: 150,
    batteryPct: 100,
  },
  {
    serialNumber: 'DRN-LW-002',
    model: 'Lightweight',
    weightLimitG: 150,
    batteryPct: 20,
  },
  {
    serialNumber: 'DRN-MW-001',
    model: 'Middleweight',
    weightLimitG: 250,
    batteryPct: 85,
  },
  {
    serialNumber: 'DRN-MW-002',
    model: 'Middleweight',
    weightLimitG: 250,
    batteryPct: 25,
  },
  {
    serialNumber: 'DRN-CW-001',
    model: 'Cruiserweight',
    weightLimitG: 375,
    batteryPct: 60,
  },
  {
    serialNumber: 'DRN-CW-002',
    model: 'Cruiserweight',
    weightLimitG: 375,
    batteryPct: 10,
  },
  {
    serialNumber: 'DRN-HW-001',
    model: 'Heavyweight',
    weightLimitG: 500,
    batteryPct: 95,
  },
  {
    serialNumber: 'DRN-HW-002',
    model: 'Heavyweight',
    weightLimitG: 500,
    batteryPct: 45,
  },
];

const imageUrl = (code: string) =>
  `https://images.example.com/medications/${code.toLowerCase()}.png`;

export const MEDICATION_SEEDS: MedicationSeed[] = [
  { name: 'Paracetamol_500mg', code: 'PARA_500', weightG: 25 },
  { name: 'Amoxicillin_250mg', code: 'AMOX_250', weightG: 30 },
  { name: 'Insulin_Glargine', code: 'INSULIN_100', weightG: 45 },
  { name: 'Oral_Rehydration_Salts', code: 'ORS_20', weightG: 20.5 },
  { name: 'Artemether-Lumefantrine', code: 'ACT_20', weightG: 15 },
  { name: 'Ibuprofen_400mg', code: 'IBU_400', weightG: 22.5 },
  { name: 'Metformin_500mg', code: 'MET_500', weightG: 35 },
  { name: 'Adrenaline_Autoinjector', code: 'EPI_03', weightG: 120 },
].map((medication) => ({ ...medication, imageUrl: imageUrl(medication.code) }));
