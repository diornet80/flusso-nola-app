
export enum Department {
  AUTOMATIZZATI = 'Automatizzati',
  PANNELLI = 'Pannelli',
  TOP = 'Top',
  FINALE = 'Finale',
  IMBALLAGGIO = 'Imballaggio'
}

export type SkinType = '5384' | '5671' | '5646' | '5651' | '5656';

export type MachineAsset = 'Brotje 1597' | 'Brotje 1570' | 'Brotje 1569' | 'Brotje 1679' | 'Recoules 199' | 'Recoules 198';

export interface SkinPhaseState {
  isCompleted: boolean;
  asset?: MachineAsset; // Solo per fase Macchina
  status?: 'OK' | 'KO'; // Solo per Quality Gate
}

export interface SkinWork {
  type: SkinType;
  phases: {
    'Masticiatura': SkinPhaseState;
    'Macchina': SkinPhaseState;
    'Completamento': SkinPhaseState;
    'Quality Gate': SkinPhaseState;
  };
}

export interface Operation {
  id: string;
  name: string;
  isCompleted: boolean;
}

export type DiscrepancySeverity = 'Low' | 'Medium' | 'High' | 'Critical';

export interface Discrepancy {
  id: string;
  defectType: string;
  department: Department;
  skinType?: SkinType;
  description: string;
  isOpen: boolean;
  severity: DiscrepancySeverity;
  createdAt: string;
}

export interface DeptSchedule {
  startDate: string;
  endDate: string;
  operations: Operation[];
  skins?: SkinWork[]; // Solo per Automatizzati
  qualityStatus?: 'OK' | 'KO'; // Stato Quality Gate per Pannelli, Top, Finale
}

export interface MSNUnit {
  id: string;
  msn: string;
  partNumber: string;
  startDate: string;
  endDate: string;
  wrappingDate?: string;
  plannedShippingDate?: string;
  currentDepartment: Department;
  deptSchedules: Record<Department, DeptSchedule>;
  discrepancies: Discrepancy[];
  shipped: boolean;
  shippedAt?: string;
}
