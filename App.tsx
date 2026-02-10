
import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Department, MSNUnit, Operation, DeptSchedule, SkinType, SkinWork, MachineAsset, Discrepancy, DiscrepancySeverity } from './types';
import { INITIAL_OPS } from './constants';
import { parseMsnDocument } from './services/geminiService';
import { databaseService } from './services/databaseService';
import { parseDatesSheet, ParsedDateUpdate } from './services/excelParser';
import { ImportUpdatesModal } from './components/ImportUpdatesModal';

const STORAGE_KEY = 'chicken-track-v2-data'; // DEPRECATED: Using Supabase


const SKIN_TYPES: SkinType[] = ['5651', '5656', '5384', '5671', '5646'];
const SKIN_LABELS: Record<SkinType, string> = {
  '5651': 'Side SX 5651',
  '5656': 'Side DX 5656',
  '5384': 'Bottom LH 5384',
  '5671': 'Bottom RH 5671',
  '5646': 'Crown 5646'
};

const MACHINE_ASSETS: MachineAsset[] = [
  'Brotje 1597', 'Brotje 1570', 'Brotje 1569', 'Brotje 1679', 'Recoules 199', 'Recoules 198'
];

const DEP_ORDER = [
  Department.AUTOMATIZZATI,
  Department.PANNELLI,
  Department.TOP,
  Department.FINALE,
  Department.IMBALLAGGIO
];

const addHours = (date: string | Date | undefined, hours: number) => {
  if (!date) return new Date().toISOString().split('T')[0];

  let d = new Date(date);

  if (isNaN(d.getTime())) {
    if (typeof date === 'string') {
      const parts = date.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (parts) {
        d = new Date(`${parts[3]}-${parts[2]}-${parts[1]}`);
      }
    }
  }

  if (isNaN(d.getTime())) {
    d = new Date();
  }

  d.setHours(d.getHours() + hours);
  try {
    return d.toISOString().split('T')[0];
  } catch (e) {
    return new Date().toISOString().split('T')[0];
  }
};

const createInitialSkins = (): SkinWork[] => SKIN_TYPES.map(type => ({
  type,
  phases: {
    'Masticiatura': { isCompleted: false },
    'Macchina': { isCompleted: false },
    'Completamento': { isCompleted: false },
    'Quality Gate': { isCompleted: false, status: 'OK' }
  }
}));

const createMsnSchedules = (start: string) => {
  const schedules: any = {};
  let currentStart = start;

  schedules[Department.AUTOMATIZZATI] = {
    startDate: currentStart,
    endDate: addHours(currentStart, 236),
    operations: [],
    skins: createInitialSkins()
  };

  const others = DEP_ORDER.slice(1);
  others.forEach(dept => {
    const prevDept = DEP_ORDER[DEP_ORDER.indexOf(dept) - 1];
    const deptStart = schedules[prevDept].endDate;
    schedules[dept] = {
      startDate: deptStart,
      endDate: addHours(deptStart, 300),
      operations: INITIAL_OPS[dept].map(name => ({ id: Math.random().toString(36).substr(2, 9), name, isCompleted: false })),
      qualityStatus: (dept === Department.PANNELLI || dept === Department.TOP || dept === Department.FINALE) ? 'OK' : undefined
    };
  });
  return schedules;
};

const INITIAL_EXAMPLES: MSNUnit[] = [
  { id: 'ex1', msn: '99999', partNumber: 'A321-NOLA', startDate: '2026-03-01', endDate: '2026-05-15', currentDepartment: Department.AUTOMATIZZATI, deptSchedules: createMsnSchedules('2026-03-01'), discrepancies: [], shipped: false },
  { id: 'ex2', msn: '88888', partNumber: 'A321-NOLA', startDate: '2026-03-10', endDate: '2026-05-25', currentDepartment: Department.AUTOMATIZZATI, deptSchedules: createMsnSchedules('2026-03-10'), discrepancies: [], shipped: false }
];

export default function App() {
  const [msns, setMsns] = useState<MSNUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [view, setView] = useState<'dashboard' | 'unit' | 'dept-flow' | 'shipments'>('dashboard');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDept, setActiveDept] = useState<Department | null>(null);
  const [activeSkin, setActiveSkin] = useState<SkinType | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showUpdateImport, setShowUpdateImport] = useState(false);
  const [importMode, setImportMode] = useState<'file' | 'manual'>('file');

  const [manualMsn, setManualMsn] = useState('');
  const [manualStartDate, setManualStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualEndDate, setManualEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualWrappingDate, setManualWrappingDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualShippingDate, setManualShippingDate] = useState(new Date().toISOString().split('T')[0]);

  const [msnToOverwriteManual, setMsnToOverwriteManual] = useState<MSNUnit | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [shipSearchTerm, setShipSearchTerm] = useState('');
  const [msnToDelete, setMsnToDelete] = useState<string | null>(null);
  const [msnToShip, setMsnToShip] = useState<string | null>(null);

  const selectedMsn = useMemo(() => msns.find(m => m.id === selectedId), [msns, selectedId]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await databaseService.fetchAllMSNs();
      setMsns(data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getDeptProgress = (unit: MSNUnit, dept: Department) => {
    const schedule = unit.deptSchedules?.[dept];
    if (!schedule) return 0;

    if (dept === Department.AUTOMATIZZATI && schedule.skins) {
      let total = 0;
      schedule.skins.forEach(s => {
        if (s.phases.Masticiatura.isCompleted) total += 30;
        if (s.phases.Macchina.isCompleted) total += 30;
        if (s.phases.Completamento.isCompleted) total += 30;
        if (s.phases['Quality Gate'].isCompleted) total += 10;
      });
      return Math.round(total / 5);
    }
    const ops = schedule.operations || [];
    if (ops.length === 0) return 0;
    const completed = ops.filter(o => o.isCompleted).length;
    return Math.round((completed / ops.length) * 100);
  };

  const isMsnReady = (unit: MSNUnit) => {
    if (!unit.deptSchedules) return false;
    return DEP_ORDER.every(d => {
      const schedule = unit.deptSchedules[d];
      if (!schedule) return false;

      const p = getDeptProgress(unit, d);
      if (d === Department.AUTOMATIZZATI) {
        const anySkinKO = schedule.skins?.some(s => s.phases['Quality Gate'].isCompleted && s.phases['Quality Gate'].status === 'KO') || false;
        return p === 100 && !anySkinKO;
      }
      return p === 100 && schedule.qualityStatus !== 'KO';
    });
  };

  const dashboardMsns = useMemo(() => {
    return msns.filter(u => !isMsnReady(u) && !u.shipped && u.msn.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [msns, searchTerm, isMsnReady]);

  const readyMsns = useMemo(() => {
    return msns.filter(u => isMsnReady(u) && !u.shipped && u.msn.toLowerCase().includes(shipSearchTerm.toLowerCase()));
  }, [msns, shipSearchTerm, isMsnReady]);

  const shippedMsns = useMemo(() => {
    return msns.filter(u => u.shipped && u.msn.toLowerCase().includes(shipSearchTerm.toLowerCase()));
  }, [msns, shipSearchTerm]);

  // Contatori aggiornati secondo richiesta
  const productionUnitsCount = useMemo(() => msns.filter(m => !isMsnReady(m) && !m.shipped).length, [msns, isMsnReady]);
  const readyUnitsCount = useMemo(() => msns.filter(m => isMsnReady(m) && !m.shipped).length, [msns, isMsnReady]);
  const archivedUnitsCount = useMemo(() => msns.filter(m => m.shipped).length, [msns]);

  const confirmDelete = async () => {
    if (msnToDelete) {
      try {
        await databaseService.deleteMSN(msnToDelete);
        setMsns(prev => prev.filter(m => m.id !== msnToDelete));
        if (selectedId === msnToDelete) {
          setView('dashboard');
          setSelectedId(null);
        }
        setMsnToDelete(null);
      } catch (error) {
        console.error('Error deleting MSN:', error);
      }
    }
  };

  const confirmShip = async () => {
    if (msnToShip) {
      try {
        const updated = await databaseService.shipMSN(msnToShip);
        setMsns(prev => prev.map(m => m.id === msnToShip ? updated : m));
        setMsnToShip(null);
      } catch (error) {
        console.error('Error shipping MSN:', error);
      }
    }
  };

  const unshipMsn = async (id: string) => {
    try {
      const updated = await databaseService.unshipMSN(id);
      setMsns(prev => prev.map(m => m.id === id ? updated : m));
    } catch (error) {
      console.error('Error unshipping MSN:', error);
    }
  };

  const handleManualAdd = async () => {
    if (!manualMsn) return;
    const existing = msns.find(m => m.msn === manualMsn);
    if (existing) {
      setMsnToOverwriteManual({
        ...existing,
        startDate: manualStartDate,
        endDate: manualEndDate,
        wrappingDate: manualWrappingDate,
        plannedShippingDate: manualShippingDate
      });
      return;
    }

    const newUnit: Omit<MSNUnit, 'id'> = {
      msn: manualMsn,
      partNumber: 'A321-NOLA',
      startDate: manualStartDate,
      endDate: manualEndDate,
      wrappingDate: manualWrappingDate,
      plannedShippingDate: manualShippingDate,
      currentDepartment: Department.AUTOMATIZZATI,
      deptSchedules: createMsnSchedules(manualStartDate),
      discrepancies: [],
      shipped: false
    };

    try {
      const created = await databaseService.createMSN(newUnit);
      setMsns(prev => [...prev, created]);
      setShowImport(false);
      setManualMsn('');
    } catch (error) {
      console.error('Error creating MSN:', error);
    }
  };

  const confirmManualOverwrite = async () => {
    if (msnToOverwriteManual) {
      try {
        const updated = await databaseService.updateMSN(msnToOverwriteManual.id, {
          startDate: manualStartDate,
          endDate: manualEndDate,
          wrappingDate: manualWrappingDate,
          plannedShippingDate: manualShippingDate
        });
        setMsns(prev => prev.map(m => m.id === updated.id ? updated : m));
        setMsnToOverwriteManual(null);
        setShowImport(false);
        setManualMsn('');
      } catch (error) {
        console.error('Error updating MSN:', error);
      }
    }
  };

  const handleEditMsn = (msnId: string) => {
    const msn = msns.find(m => m.id === msnId);
    if (!msn) return;

    setManualMsn(msn.msn);
    setManualStartDate(msn.startDate || new Date().toISOString().split('T')[0]);
    setManualEndDate(msn.endDate || new Date().toISOString().split('T')[0]);
    setManualWrappingDate(msn.wrappingDate || '');
    setManualShippingDate(msn.plannedShippingDate || '');

    setMsnToOverwriteManual(msn);
    setImportMode('manual');
    setShowImport(true);
  };

  const handleImportDates = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const dateUpdates = parseDatesSheet(sheet);

        if (dateUpdates.length === 0) {
          alert('Nessun dato valido trovato nel file.');
          setIsScanning(false);
          return;
        }

        // Fetch current MSNs to map MSN -> ID and preserve other data
        const currentMsns = await databaseService.fetchAllMSNs();
        const batchMap = new Map<string, MSNUnit>();

        for (const update of dateUpdates) {
          const existing = currentMsns.find(m => m.msn === update.msn);
          if (existing) {
            batchMap.set(update.msn, {
              ...existing,
              startDate: update.startDate || existing.startDate,
              endDate: update.endDate || existing.endDate,
              wrappingDate: update.wrappingDate || existing.wrappingDate,
              plannedShippingDate: update.plannedShippingDate || existing.plannedShippingDate
            });
          }
        }

        const batch = Array.from(batchMap.values());

        if (batch.length > 0) {
          await databaseService.upsertMSNs(batch);
          alert(`Importazione completata: ${batch.length} MSN aggiornati.`);
          loadData();
        } else {
          alert('Nessun MSN corrispondente trovato nel database.');
        }
      } catch (err) {
        console.error('Error importing dates:', err);
        alert('Errore durante l\'importazione delle date.');
      } finally {
        setIsScanning(false);
        e.target.value = ''; // Reset input
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    // Helper to process row data into partial MSNUnit
    const processRowData = (msnStr: string, start: string, end: string, wrapping?: string, shipping?: string): Partial<MSNUnit> => {
      const existing = msns.find(m => m.msn === msnStr);
      if (existing) {
        return {
          ...existing,
          startDate: start,
          endDate: end,
          wrappingDate: wrapping,
          plannedShippingDate: shipping
        };
      } else {
        return {
          msn: msnStr,
          partNumber: 'A321-NOLA',
          startDate: start,
          endDate: end,
          wrappingDate: wrapping,
          plannedShippingDate: shipping,
          currentDepartment: Department.AUTOMATIZZATI,
          deptSchedules: createMsnSchedules(start),
          discrepancies: [],
          shipped: false
        };
      }
    };

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = evt.target?.result;
          const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet) as any[];

          if (json.length === 0) {
            alert('Il file Excel sembra vuoto o non leggibile.');
            setIsScanning(false);
            return;
          }

          const msnsToUpsert: Partial<MSNUnit>[] = [];

          json.forEach(row => {
            // Normalize keys to lowercase to be case-insensitive
            const normalizedRow = Object.keys(row).reduce((acc: any, key) => {
              acc[key.toLowerCase().trim()] = row[key];
              return acc;
            }, {});

            const msnStr = String(normalizedRow['msn'] || '');
            if (!msnStr) return;

            const parseExcelDate = (val: any) => {
              if (val instanceof Date) return val.toISOString().split('T')[0];
              if (!val) return undefined;
              // Handle Excel serial dates or strings
              return String(val);
            };

            // Support multiple column names (english/italian)
            const start = parseExcelDate(normalizedRow['start'] || normalizedRow['inizio']) || new Date().toISOString().split('T')[0];
            const end = parseExcelDate(normalizedRow['finish'] || normalizedRow['end'] || normalizedRow['fine']) || addHours(start, 1200);
            const wrapping = parseExcelDate(normalizedRow['wrapping']);
            const shipping = parseExcelDate(normalizedRow['shipping'] || normalizedRow['fob'] || normalizedRow['spedizione']);

            msnsToUpsert.push(processRowData(msnStr, start, end, wrapping, shipping));
          });

          if (msnsToUpsert.length === 0) {
            alert('Nessuna MSN trovata nel file. Assicurati che ci sia una colonna chiamata "MSN".');
            setIsScanning(false);
            return;
          }

          // Deduplicate MSNs to avoid "ON CONFLICT DO UPDATE command cannot affect row a second time"
          const uniqueMsnsMap = new Map<string, Partial<MSNUnit>>();
          msnsToUpsert.forEach(item => {
            if (item.msn) {
              uniqueMsnsMap.set(item.msn, item);
            }
          });
          const dedupedMsns = Array.from(uniqueMsnsMap.values());

          await databaseService.upsertMSNs(dedupedMsns);
          await loadData();

          alert(`Importazione completata! ${dedupedMsns.length} unità aggiornate/inserite.`);
          setIsScanning(false);
          setShowImport(false);
        } catch (err) {
          console.error("Excel import error:", err);
          alert('Errore durante l\'importazione: ' + (err as Error).message);
          setIsScanning(false);
        }
      };
      reader.readAsBinaryString(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const b64 = (reader.result as string).split(',')[1];
        const units = await parseMsnDocument(b64, file.type);
        if (units) {
          const msnsToUpsert: Partial<MSNUnit>[] = units.map((u: any) =>
            processRowData(u.msn, u.startDate, u.endDate, u.wrappingDate, u.shippingDate)
          );

          await databaseService.upsertMSNs(msnsToUpsert);
          await loadData();
        }
      } catch (err) {
        console.error("File import error:", err);
      } finally {
        setIsScanning(false);
        setShowImport(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleOp = async (msnId: string, dept: Department, opId: string) => {
    const msn = msns.find(m => m.id === msnId);
    if (!msn) return;

    // Deep clone schedule to avoid mutation issues
    const schedule = msn.deptSchedules?.[dept];
    if (!schedule) return;

    const newOps = schedule.operations.map(op => {
      if (op.id !== opId) return op;

      // Cycle: Todo -> Doing -> Done -> Todo
      let newState: 'todo' | 'doing' | 'done' = 'doing';
      let isCompleted = false;

      if (op.state === 'doing') {
        newState = 'done';
        isCompleted = true;
      } else if (op.isCompleted || op.state === 'done') { // Check isCompleted for backward compatibility
        newState = 'todo';
        isCompleted = false;
      }

      return { ...op, isCompleted, state: newState };
    });

    const newSchedules = {
      ...msn.deptSchedules,
      [dept]: { ...schedule, operations: newOps }
    };

    // Optimistic update
    setMsns(prev => prev.map(m => m.id !== msnId ? m : { ...m, deptSchedules: newSchedules }));

    try {
      await databaseService.updateMSN(msnId, { deptSchedules: newSchedules });
    } catch (e) {
      console.error("Failed to update op", e);
      loadData();
    }
  };

  const updateDeptQualityStatus = async (msnId: string, dept: Department, status: 'OK' | 'KO') => {
    const msn = msns.find(m => m.id === msnId);
    if (!msn) return;

    const newDeptSchedule = {
      ...msn.deptSchedules[dept],
      qualityStatus: status
    };

    const newSchedules = {
      ...msn.deptSchedules,
      [dept]: newDeptSchedule
    };

    setMsns(prev => prev.map(m => m.id !== msnId ? m : { ...m, deptSchedules: newSchedules }));

    try {
      await databaseService.updateMSN(msnId, { deptSchedules: newSchedules });
    } catch (e) {
      console.error("Failed to update quality", e);
      loadData();
    }
  };

  const toggleMachine = async (msnId: string, skinType: SkinType, asset: MachineAsset) => {
    const msn = msns.find(m => m.id === msnId);
    if (!msn) return;

    const schedule = msn.deptSchedules?.[Department.AUTOMATIZZATI];
    if (!schedule?.skins) return;

    const skins = schedule.skins.map(s => {
      if (s.type !== skinType) return s;

      const currentDetails = s.phases.Macchina.machineDetails || [];
      const exists = currentDetails.some(d => d.asset === asset);

      let newDetails;
      if (exists) {
        newDetails = currentDetails.filter(d => d.asset !== asset);
      } else {
        const currentTotal = currentDetails.reduce((sum, d) => sum + d.percentage, 0);
        const remaining = Math.max(0, 100 - currentTotal);
        newDetails = [...currentDetails, { asset, percentage: remaining }];
      }

      const isCompleted = newDetails.length > 0;

      return {
        ...s,
        phases: {
          ...s.phases,
          Macchina: {
            ...s.phases.Macchina,
            isCompleted,
            machineDetails: newDetails
          }
        }
      };
    });

    const newDeptSchedule = { ...schedule, skins };
    const newSchedules = { ...msn.deptSchedules, [Department.AUTOMATIZZATI]: newDeptSchedule };

    setMsns(prev => prev.map(m => m.id !== msnId ? m : { ...m, deptSchedules: newSchedules }));

    try {
      await databaseService.updateMSN(msnId, { deptSchedules: newSchedules });
    } catch (e) {
      console.error("Failed to update machine", e);
      loadData();
    }
  };

  const updateSkinPhase = async (msnId: string, skinType: SkinType, phase: keyof SkinWork['phases'], updates: any) => {
    const msn = msns.find(m => m.id === msnId);
    if (!msn) return;

    // Deep clone/modify
    const schedule = msn.deptSchedules?.[Department.AUTOMATIZZATI];
    if (!schedule?.skins) return;

    const skins = schedule.skins.map(s => {
      if (s.type !== skinType) return s;

      // Manual click cycle logic for non-machine phases
      // If we are just toggling completion (the UI calls this with specific updates usually, but we need to check if we should intercept)

      // The current UI passing `{ isCompleted: !isCompleted }` usually.
      // We want to change that call site OR handle logic here.
      // Let's rely on the UI calling with explicit values OR we just look at what's passed.
      // Actually, simplest is to update the calling code in rendering to call this with the right next state.
      // But let's assume `updates` contains the raw properties we want to set.

      return { ...s, phases: { ...s.phases, [phase]: { ...s.phases[phase], ...updates } } };
    });

    // ... rest of function ...

    const newDeptSchedule = {
      ...schedule,
      skins
    };

    const newSchedules = {
      ...msn.deptSchedules,
      [Department.AUTOMATIZZATI]: newDeptSchedule
    };

    setMsns(prev => prev.map(m => m.id !== msnId ? m : { ...m, deptSchedules: newSchedules }));

    try {
      await databaseService.updateMSN(msnId, { deptSchedules: newSchedules });
    } catch (e) {
      console.error("Failed to update skin phase", e);
      loadData();
    }
  };

  const updateMachinePercentage = async (msnId: string, skinType: SkinType, asset: MachineAsset, percentage: number) => {
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;

    const msn = msns.find(m => m.id === msnId);
    if (!msn) return;

    const schedule = msn.deptSchedules?.[Department.AUTOMATIZZATI];
    if (!schedule?.skins) return;

    // Validate Total <= 100%
    const currentSkin = schedule.skins.find(s => s.type === skinType);
    if (!currentSkin) return;

    const otherDetails = currentSkin.phases.Macchina.machineDetails?.filter(d => d.asset !== asset) || [];
    const currentTotal = otherDetails.reduce((sum, d) => sum + d.percentage, 0);

    if (currentTotal + percentage > 100) {
      alert(`Errore: La percentuale totale supererebbe il 100%. Disponibile: ${100 - currentTotal}%`);
      return;
    }

    const skins = schedule.skins.map(s => {
      if (s.type !== skinType) return s;

      const currentDetails = s.phases.Macchina.machineDetails || [];
      const updatedDetails = currentDetails.map(d => d.asset === asset ? { ...d, percentage } : d);

      return {
        ...s,
        phases: {
          ...s.phases,
          Macchina: { ...s.phases.Macchina, machineDetails: updatedDetails }
        }
      };
    });

    const newDeptSchedule = { ...schedule, skins };
    const newSchedules = { ...msn.deptSchedules, [Department.AUTOMATIZZATI]: newDeptSchedule };

    setMsns(prev => prev.map(m => m.id !== msnId ? m : { ...m, deptSchedules: newSchedules }));

    try {
      await databaseService.updateMSN(msnId, { deptSchedules: newSchedules });
    } catch (e) {
      console.error("Failed to update percentage", e);
      loadData();
    }
  };

  const ProgressBar = ({ label, progress, isKO }: { label: string, progress: number, isKO?: boolean }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-500">
        <span className="flex items-center gap-1">
          {label}
          {isKO && <span className="text-red-500 animate-pulse font-black">(KO DETECTED)</span>}
        </span>
        <span>{progress}%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full transition-all duration-700 ${isKO ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : progress === 100 ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }}></div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-indigo-400 font-black uppercase tracking-widest text-xs animate-pulse">Caricamento Dati...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      <header className="h-20 bg-slate-900/50 backdrop-blur-xl border-b border-slate-800 px-8 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center font-black text-white shadow-lg shadow-indigo-600/20 cursor-pointer" onClick={() => setView('dashboard')}>CT</div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-tighter">Chicken Track Pro</h1>
            <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-[0.3em]">Aero Nola Plant</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => setView('shipments')}
            className={`relative px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'shipments' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
          >
            Spedizioni
            {readyUnitsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px] animate-pulse">
                {readyUnitsCount}
              </span>
            )}
          </button>
          <button onClick={() => setShowUpdateImport(true)} className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-white shadow-lg shadow-indigo-600/20">Aggiorna Reparti</button>

          <div className="relative group">
            <button
              onClick={() => document.getElementById('date-import-input')?.click()}
              className="bg-slate-800 hover:bg-slate-700 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Importa Date
            </button>
            <input
              type="file"
              id="date-import-input"
              accept=".xlsx, .xls"
              onChange={handleImportDates}
              className="hidden"
            />
          </div>

          <button onClick={() => { setShowImport(true); setImportMode('file'); }} className="bg-slate-800 hover:bg-slate-700 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Importa MSN</button>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-y-auto">
        {view === 'dashboard' ? (
          <div className="max-w-7xl mx-auto space-y-12">
            <div className="flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="flex items-center gap-6 w-full">
                <h2 className="text-5xl md:text-6xl font-black italic tracking-tighter leading-none text-white">Line Status</h2>
                <div className="hidden md:flex items-center gap-3 px-5 py-2 bg-slate-900 rounded-2xl border-2 border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.3)]">
                  <span className="text-3xl font-black text-indigo-400">{productionUnitsCount}</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">In<br />Production</span>
                </div>
              </div>
              <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                <div className="relative w-full md:w-64">
                  <input
                    type="text"
                    placeholder="Cerca MSN..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <svg className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="flex items-center gap-3 text-green-500 bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20 whitespace-nowrap">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Live Sync</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {dashboardMsns.map(u => (
                <div key={u.id} onClick={() => { setSelectedId(u.id); setView('unit'); }} className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] hover:border-indigo-500/50 transition-all group cursor-pointer shadow-2xl relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMsnToDelete(u.id); }}
                    className="absolute top-6 right-6 z-10 p-2.5 bg-slate-950/50 rounded-xl text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-red-500/20"
                    title="Elimina MSN"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <div className="flex justify-between items-start mb-6 pr-12">
                    <div>
                      <span className="text-4xl font-black italic text-white group-hover:text-indigo-400 transition-colors">{u.msn}</span>
                      <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">A321-NOLA</p>
                    </div>
                    <div className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-700">Production</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Produzione</p>
                      <div className="flex justify-between items-center text-[10px] font-black text-slate-300">
                        <span>{u.startDate ? new Date(u.startDate).toLocaleDateString() : '-'}</span>
                        <span className="text-slate-600">→</span>
                        <span>{u.endDate ? new Date(u.endDate).toLocaleDateString() : '-'}</span>
                      </div>
                    </div>
                    <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Spedizione/Imb.</p>
                      <div className="flex flex-col text-[10px] font-black text-slate-300">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Imb:</span>
                          <span>{u.wrappingDate ? new Date(u.wrappingDate).toLocaleDateString() : '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Ship:</span>
                          <span className={u.plannedShippingDate ? 'text-indigo-400' : ''}>{u.plannedShippingDate ? new Date(u.plannedShippingDate).toLocaleDateString() : '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditMsn(u.id); }}
                    className="absolute top-6 right-16 z-10 p-2.5 bg-slate-950/50 rounded-xl text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-indigo-500/20"
                    title="Modifica Date"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <div className="space-y-4">
                    <ProgressBar label="Automatizzati" progress={getDeptProgress(u, Department.AUTOMATIZZATI)} isKO={u.deptSchedules?.[Department.AUTOMATIZZATI]?.skins?.some(s => s.phases['Quality Gate'].isCompleted && s.phases['Quality Gate'].status === 'KO') ?? false} />
                    <ProgressBar label="Pannelli" progress={getDeptProgress(u, Department.PANNELLI)} isKO={u.deptSchedules?.[Department.PANNELLI]?.qualityStatus === 'KO'} />
                    <ProgressBar label="Top" progress={getDeptProgress(u, Department.TOP)} isKO={u.deptSchedules?.[Department.TOP]?.qualityStatus === 'KO'} />
                    <ProgressBar label="Finiture" progress={getDeptProgress(u, Department.FINALE)} isKO={u.deptSchedules?.[Department.FINALE]?.qualityStatus === 'KO'} />
                    <ProgressBar label="Imballaggio" progress={getDeptProgress(u, Department.IMBALLAGGIO)} />
                  </div>
                </div>
              ))}
              {dashboardMsns.length === 0 && (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-[3rem]">
                  <p className="text-slate-500 font-black uppercase tracking-widest">Nessuna MSN in produzione attiva</p>
                </div>
              )}
            </div>
          </div>
        ) : view === 'shipments' ? (
          <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="flex items-center gap-6">
                <button onClick={() => setView('dashboard')} className="p-4 bg-slate-900 rounded-2xl border border-slate-800 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth="3" /></svg></button>
                <h2 className="text-5xl font-black italic tracking-tighter leading-none text-white">Log Spedizioni</h2>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 px-5 py-2 bg-slate-900 rounded-2xl border-2 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                  <span className="text-2xl font-black text-green-500">{readyUnitsCount}</span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-tight">Ready<br />to ship</span>
                </div>
                <div className="flex items-center gap-3 px-5 py-2 bg-slate-900 rounded-2xl border border-slate-800">
                  <span className="text-2xl font-black text-slate-400">{archivedUnitsCount}</span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-tight">Archived<br />Units</span>
                </div>
                <div className="relative w-full md:w-64">
                  <input
                    type="text"
                    placeholder="Cerca MSN..."
                    value={shipSearchTerm}
                    onChange={(e) => setShipSearchTerm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {readyMsns.map(u => (
                <div key={u.id} className="bg-slate-900 border border-green-500/30 p-8 rounded-[2.5rem] shadow-2xl relative flex flex-col justify-between min-h-[300px] group">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMsnToDelete(u.id); }}
                    className="absolute top-6 right-6 z-10 p-2.5 bg-slate-950/50 rounded-xl text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-red-500/20"
                    title="Elimina MSN"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <div>
                    <div className="flex justify-between items-start mb-6 pr-12">
                      <div>
                        <span className="text-4xl font-black italic text-white">{u.msn}</span>
                        <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">A321-NOLA</p>
                      </div>
                      <div className="bg-green-500 text-slate-950 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-green-500/20">Ready</div>
                    </div>
                    <div className="bg-slate-950/50 p-6 rounded-3xl space-y-4 border border-slate-800">
                      <div className="flex justify-between text-[10px] font-bold"><span className="text-slate-500 uppercase">Qualità</span><span className="text-green-500">100% OK</span></div>
                      <div className="flex justify-between text-[10px] font-bold"><span className="text-slate-500 uppercase">Wrapping</span><span className="text-green-500">ESEGUITO</span></div>
                    </div>
                  </div>
                  <button
                    onClick={() => setMsnToShip(u.id)}
                    className="mt-8 w-full py-5 bg-green-600 hover:bg-green-500 text-white rounded-3xl font-black uppercase tracking-[0.2em] text-[10px] transition-all shadow-xl shadow-green-600/10 active:scale-95"
                  >
                    Completa Spedizione
                  </button>
                </div>
              ))}

              {shippedMsns.map(u => (
                <div key={u.id} className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] relative flex flex-col justify-between min-h-[300px] group">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMsnToDelete(u.id); }}
                    className="absolute top-6 right-6 z-10 p-2.5 bg-slate-950/50 rounded-xl text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-red-500/20"
                    title="Elimina MSN"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <div>
                    <div className="flex justify-between items-start mb-6 pr-12">
                      <div>
                        <span className="text-4xl font-black italic text-slate-400">{u.msn}</span>
                        <p className="text-[9px] font-bold text-slate-600 uppercase mt-1">A321-NOLA</p>
                      </div>
                      <div className="bg-slate-800 text-slate-500 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-700">Shipped</div>
                    </div>
                    <div className="text-center mt-6 space-y-2">
                      <p className="text-[10px] text-green-500 font-black uppercase tracking-widest">Unità spedita con successo</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase">Data: {u.shippedAt}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 mt-8">
                    <button
                      onClick={() => unshipMsn(u.id)}
                      className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-indigo-400/20 rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all"
                    >
                      Annulla Spedizione
                    </button>
                    <div className="w-full py-3 bg-slate-950/30 text-slate-600 rounded-2xl font-black uppercase text-[9px] text-center border border-slate-800">Archiviato</div>
                  </div>
                </div>
              ))}

              {readyMsns.length === 0 && shippedMsns.length === 0 && (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-[3rem]">
                  <p className="text-slate-500 font-black uppercase tracking-widest">Nessuna unità pronta o spedita</p>
                </div>
              )}
            </div>
          </div>
        ) : view === 'unit' && selectedMsn ? (
          <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom duration-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <button onClick={() => setView('dashboard')} className="p-4 bg-slate-900 rounded-2xl text-slate-400 hover:text-white transition-colors border border-slate-800"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth="3" /></svg></button>
                <div>
                  <h3 className="text-4xl font-black italic text-white tracking-tighter">Gestione MSN {selectedMsn.msn}</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Avanzamento flussi industriali</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              {DEP_ORDER.map(dept => {
                const p = getDeptProgress(selectedMsn, dept);
                let isKO = false;
                if (dept === Department.AUTOMATIZZATI) {
                  isKO = selectedMsn.deptSchedules?.[Department.AUTOMATIZZATI]?.skins?.some(s => s.phases['Quality Gate'].isCompleted && s.phases['Quality Gate'].status === 'KO') || false;
                } else {
                  isKO = selectedMsn.deptSchedules?.[dept]?.qualityStatus === 'KO';
                }

                return (
                  <button key={dept} onClick={() => { setActiveDept(dept); setView('dept-flow'); setActiveSkin(null); }} className={`p-10 rounded-[2.5rem] border-2 transition-all flex flex-col items-center gap-6 shadow-xl ${isKO ? 'bg-red-500/10 border-red-500/50 hover:border-red-500' : p === 100 ? 'bg-green-500/10 border-green-500/50' : 'bg-slate-900 border-slate-800 hover:border-indigo-500'}`}>
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center font-black text-lg ${isKO ? 'bg-red-500 text-white' : p === 100 ? 'bg-green-500 text-slate-950' : 'bg-slate-800 text-indigo-400'}`}>{p}%</div>
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isKO ? 'text-red-500' : ''}`}>{dept === Department.FINALE ? 'Finiture' : dept} {isKO && '(KO)'}</span>
                  </button>
                );
              })}
            </div>

            {isMsnReady(selectedMsn) && (
              <div className="bg-green-600 p-10 rounded-[3rem] flex items-center justify-between shadow-2xl shadow-green-600/30">
                <div>
                  <h4 className="text-3xl font-black italic uppercase text-white tracking-tighter">Produzione Ultimata</h4>
                  <p className="text-green-100 font-bold uppercase text-[10px] tracking-widest mt-2">L'unità è stata spostata automaticamente in "Spedizioni"</p>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setView('shipments')} className="bg-white text-green-600 px-6 py-4 rounded-2xl font-black uppercase text-[10px] shadow-xl hover:scale-105 transition-transform tracking-widest">Vai alle Spedizioni</button>
                </div>
              </div>
            )}
          </div>
        ) : view === 'dept-flow' && selectedMsn && activeDept ? (
          <div className="max-w-3xl mx-auto space-y-10 animate-in fade-in duration-300">
            <div className="flex items-center gap-6">
              <button onClick={() => setView('unit')} className="p-4 bg-slate-900 rounded-2xl border border-slate-800"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth="3" /></svg></button>
              <div>
                <h3 className="text-3xl font-black italic text-white tracking-tighter">Reparto {activeDept === Department.FINALE ? 'Finiture' : activeDept}</h3>
                <div className="flex gap-4 mt-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Inizio: {selectedMsn.deptSchedules?.[activeDept]?.startDate}</span>
                  <span className="text-[10px] font-bold text-indigo-400 uppercase">Fine: {selectedMsn.deptSchedules?.[activeDept]?.endDate}</span>
                </div>
              </div>
            </div>

            {activeDept === Department.AUTOMATIZZATI ? (
              <div className="space-y-6">
                {!activeSkin ? (
                  <div className="grid grid-cols-1 gap-4">
                    {selectedMsn.deptSchedules?.[Department.AUTOMATIZZATI]?.skins?.map(skin => {
                      const sp = (skin.phases.Masticiatura.isCompleted ? 30 : 0) + (skin.phases.Macchina.isCompleted ? 30 : 0) + (skin.phases.Completamento.isCompleted ? 30 : 0) + (skin.phases['Quality Gate'].isCompleted ? 10 : 0);
                      const skinKO = skin.phases['Quality Gate'].status === 'KO' && skin.phases['Quality Gate'].isCompleted;
                      return (
                        <button key={skin.type} onClick={() => setActiveSkin(skin.type)} className={`bg-slate-900 p-8 rounded-3xl border ${skinKO ? 'border-red-500' : 'border-slate-800'} flex justify-between items-center hover:border-indigo-500 transition-all group`}>
                          <div className="flex items-center gap-4">
                            {skinKO && (
                              <div className="p-2 bg-red-500 rounded-xl text-white">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </div>
                            )}
                            <span className={`text-lg font-black uppercase tracking-tight transition-colors ${skinKO ? 'text-red-500' : 'text-white group-hover:text-indigo-400'}`}>{SKIN_LABELS[skin.type]} {skinKO && '(QUALITY KO)'}</span>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="h-2 w-32 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full ${skinKO ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${sp}%` }}></div>
                            </div>
                            <span className="text-[10px] font-black text-slate-500">{sp}%</span>
                            <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth="4" /></svg>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-900 p-10 rounded-[3rem] border border-slate-800 space-y-10">
                    <div className="flex justify-between items-center">
                      <h4 className="text-2xl font-black italic text-white">{SKIN_LABELS[activeSkin]}</h4>
                      <button onClick={() => setActiveSkin(null)} className="text-[10px] font-black uppercase text-indigo-400 border-b border-indigo-400/30">Torna alla lista</button>
                    </div>
                    {(() => {
                      const skin = selectedMsn.deptSchedules[Department.AUTOMATIZZATI].skins?.find(s => s.type === activeSkin)!;
                      return (
                        <div className="space-y-6">
                          <div onClick={() => {
                            const currentP = skin.phases.Masticiatura.progress ?? (skin.phases.Masticiatura.isCompleted ? 100 : 0);
                            let newP = 0;
                            if (currentP === 0) newP = 50; // In Progress
                            else if (currentP < 100) newP = 100; // Done
                            else newP = 0; // Reset
                            updateSkinPhase(selectedMsn.id, activeSkin, 'Masticiatura', { isCompleted: newP === 100, progress: newP });
                          }} className={`p-8 rounded-2xl border-2 transition-all cursor-pointer ${skin.phases.Masticiatura.isCompleted ? 'bg-green-500/10 border-green-500' : (skin.phases.Masticiatura.progress && skin.phases.Masticiatura.progress > 0) ? 'bg-orange-500/10 border-orange-500' : 'bg-slate-950 border-slate-800'}`}>
                            <div className="flex justify-between">
                              <span className="text-xs font-black uppercase tracking-widest">1. Masticiatura (30%)</span>
                              {skin.phases.Masticiatura.isCompleted && <span className="text-[10px] font-black text-green-500">COMPLETATO</span>}
                              {!skin.phases.Masticiatura.isCompleted && (skin.phases.Masticiatura.progress ?? 0) > 0 && <span className="text-[10px] font-black text-orange-500">IN LAVORAZIONE</span>}
                            </div>
                          </div>
                          <div className={`p-8 rounded-2xl border-2 transition-all ${skin.phases.Macchina.isCompleted ? 'bg-green-500/10 border-green-500' : 'bg-slate-950 border-slate-800'}`}>
                            <div className="flex justify-between items-center mb-6">
                              <span className="text-xs font-black uppercase tracking-widest">2. Macchina (30%)</span>
                              <div className="flex items-center gap-3">{skin.phases.Macchina.isCompleted && <span className="text-[10px] font-black text-green-500">COMPLETATO</span>}<input type="checkbox" checked={skin.phases.Macchina.isCompleted} onChange={() => updateSkinPhase(selectedMsn.id, activeSkin, 'Macchina', { isCompleted: !skin.phases.Macchina.isCompleted })} className="w-6 h-6 accent-indigo-500" /></div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{MACHINE_ASSETS.map(asset => {
                              const detail = skin.phases.Macchina.machineDetails?.find(d => d.asset === asset);
                              const isSelected = !!detail || skin.phases.Macchina.asset === asset;

                              let colorClass = 'bg-slate-900 border-slate-800 text-slate-500 hover:border-indigo-500/50';
                              let percentageText = '';

                              if (isSelected) {
                                const percentage = detail?.percentage ?? 100;
                                percentageText = `${percentage}%`;

                                if (percentage === 100) colorClass = 'bg-indigo-600 border-indigo-500 text-white';
                                else if (percentage >= 75) colorClass = 'bg-indigo-500 border-indigo-500 text-white';
                                else if (percentage >= 50) colorClass = 'bg-yellow-500 border-yellow-500 text-slate-950';
                                else if (percentage >= 25) colorClass = 'bg-orange-500 border-orange-500 text-white';
                                else colorClass = 'bg-red-500 border-red-500 text-white';
                              }

                              return (
                                <button key={asset} onClick={() => toggleMachine(selectedMsn.id, activeSkin, asset)} className={`relative py-4 rounded-xl text-[9px] font-black uppercase transition-all border flex flex-col items-center justify-center gap-1 ${colorClass}`}>
                                  <span>{asset}</span>
                                  {isSelected && (
                                    <div onClick={(e) => e.stopPropagation()} className="mt-1">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={detail?.percentage ?? 100}
                                        onChange={(e) => updateMachinePercentage(selectedMsn.id, activeSkin, asset, parseInt(e.target.value) || 0)}
                                        className="w-12 bg-black/30 border border-white/20 rounded text-center text-white font-bold"
                                      />
                                      <span className="text-[8px] ml-1 opacity-80">%</span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}</div>
                          </div>
                          <div onClick={() => {
                            const currentP = skin.phases.Completamento.progress ?? (skin.phases.Completamento.isCompleted ? 100 : 0);
                            let newP = 0;
                            if (currentP === 0) newP = 50;
                            else if (currentP < 100) newP = 100;
                            else newP = 0;
                            updateSkinPhase(selectedMsn.id, activeSkin, 'Completamento', { isCompleted: newP === 100, progress: newP });
                          }} className={`p-8 rounded-2xl border-2 transition-all cursor-pointer ${skin.phases.Completamento.isCompleted ? 'bg-green-500/10 border-green-500' : (skin.phases.Completamento.progress && skin.phases.Completamento.progress > 0) ? 'bg-orange-500/10 border-orange-500' : 'bg-slate-950 border-slate-800'}`}>
                            <div className="flex justify-between">
                              <span className="text-xs font-black uppercase tracking-widest">3. Completamento (30%)</span>
                              {skin.phases.Completamento.isCompleted && <span className="text-[10px] font-black text-green-500">COMPLETATO</span>}
                              {!skin.phases.Completamento.isCompleted && (skin.phases.Completamento.progress ?? 0) > 0 && <span className="text-[10px] font-black text-orange-500">IN LAVORAZIONE</span>}
                            </div>
                          </div>
                          <div className={`p-8 rounded-2xl border-2 transition-all ${skin.phases['Quality Gate'].isCompleted ? (skin.phases['Quality Gate'].status === 'KO' ? 'bg-red-500/10 border-red-500' : 'bg-green-500/10 border-green-500') : 'bg-slate-950 border-slate-800'}`}>
                            <div className="flex justify-between items-center mb-6">
                              <span className="text-xs font-black uppercase tracking-widest">4. Quality Gate (10%)</span>
                              <div className="flex gap-2">
                                <button onClick={() => updateSkinPhase(selectedMsn.id, activeSkin, 'Quality Gate', { status: 'OK', isCompleted: true })} className={`px-4 py-2 rounded-lg text-[9px] font-black ${skin.phases['Quality Gate'].status === 'OK' && skin.phases['Quality Gate'].isCompleted ? 'bg-green-500 text-slate-950' : 'bg-slate-900 text-slate-500'}`}>OK</button>
                                <button onClick={() => updateSkinPhase(selectedMsn.id, activeSkin, 'Quality Gate', { status: 'KO', isCompleted: true })} className={`px-4 py-2 rounded-lg text-[9px] font-black ${skin.phases['Quality Gate'].status === 'KO' && skin.phases['Quality Gate'].isCompleted ? 'bg-red-500 text-white' : 'bg-slate-900 text-slate-500'}`}>KO</button>
                              </div>
                            </div>
                            {skin.phases['Quality Gate'].isCompleted && skin.phases['Quality Gate'].status === 'KO' && (
                              <p className="mt-4 text-red-400 font-black text-[9px] uppercase tracking-widest bg-red-500/10 p-4 rounded-xl border border-red-500/20">Blocco Produzione: Non conformità rilevata sul pannello.</p>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-8">
                <div className="bg-slate-900 p-10 rounded-[3rem] border border-slate-800 space-y-8">
                  {selectedMsn.deptSchedules[activeDept].operations.map((op, idx) => (
                    <div key={op.id} onClick={() => toggleOp(selectedMsn.id, activeDept, op.id)} className={`flex items-center gap-6 p-8 rounded-3xl border-2 transition-all cursor-pointer ${op.state === 'done' || op.isCompleted ? 'bg-green-500/10 border-green-500/50' : op.state === 'doing' ? 'bg-orange-500/10 border-orange-500/50' : 'bg-slate-950 border-slate-800 hover:border-indigo-500/30'}`}>
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border-2 ${op.state === 'done' || op.isCompleted ? 'bg-green-500 border-green-500 text-slate-950' : op.state === 'doing' ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-800 text-slate-600'}`}>
                        {(op.state === 'done' || op.isCompleted) && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeWidth="4" /></svg>}
                        {op.state === 'doing' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                      <span className={`text-sm font-black uppercase tracking-widest ${op.state === 'done' || op.isCompleted ? 'text-slate-400 line-through' : op.state === 'doing' ? 'text-orange-400' : 'text-white'}`}>
                        {idx + 1}. {op.name}
                        {op.state === 'doing' && <span className="ml-2 text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-md">IN LAVORAZIONE</span>}
                      </span>
                    </div>
                  ))}
                </div>

                {(activeDept === Department.PANNELLI || activeDept === Department.TOP || activeDept === Department.FINALE) && (
                  <div className={`bg-slate-900 p-10 rounded-[3rem] border-2 space-y-6 ${selectedMsn.deptSchedules[activeDept].qualityStatus === 'KO' ? 'border-red-500' : 'border-slate-800'}`}>
                    <div className="flex justify-between items-center">
                      <h4 className="text-xl font-black italic text-white uppercase tracking-tighter">Quality Gate Reparto</h4>
                      <div className="flex gap-3">
                        <button onClick={() => updateDeptQualityStatus(selectedMsn.id, activeDept, 'OK')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedMsn.deptSchedules[activeDept].qualityStatus === 'OK' ? 'bg-green-500 text-slate-950 shadow-lg shadow-green-500/20' : 'bg-slate-950 text-slate-500 border border-slate-800'}`}>OK</button>
                        <button onClick={() => updateDeptQualityStatus(selectedMsn.id, activeDept, 'KO')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedMsn.deptSchedules[activeDept].qualityStatus === 'KO' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-slate-950 text-slate-500 border border-slate-800'}`}>KO</button>
                      </div>
                    </div>
                    {selectedMsn.deptSchedules[activeDept].qualityStatus === 'KO' && (
                      <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest animate-pulse">Attenzione: Qualità non conforme rilevata in questo reparto.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </main>

      {/* MODALS */}
      {msnToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-8 animate-in fade-in zoom-in duration-200">
          <div className="bg-slate-900 w-full max-w-md rounded-[3rem] border border-slate-800 shadow-2xl p-10 text-center space-y-8">
            <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div>
              <h3 className="text-2xl font-black italic text-white tracking-tighter uppercase">Conferma Eliminazione</h3>
              <p className="text-sm text-slate-400 font-medium mt-2 leading-relaxed">Sei sicuro di voler eliminare la MSN <span className="text-white font-bold">{msns.find(m => m.id === msnToDelete)?.msn}</span>? <br /> Questa operazione non può essere annullata.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <button onClick={() => setMsnToDelete(null)} className="flex-1 py-4 bg-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-colors">Annulla</button>
              <button onClick={confirmDelete} className="flex-1 py-4 bg-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 transition-colors shadow-lg shadow-red-600/20">Elimina MSN</button>
            </div>
          </div>
        </div>
      )}

      {msnToShip && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-8 animate-in fade-in zoom-in duration-200">
          <div className="bg-slate-900 w-full max-w-md rounded-[3rem] border border-slate-800 shadow-2xl p-10 text-center space-y-8">
            <div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div>
              <h3 className="text-2xl font-black italic text-white tracking-tighter uppercase">Conferma Spedizione</h3>
              <p className="text-sm text-slate-400 font-medium mt-2 leading-relaxed">Confermi che l'unità <span className="text-white font-bold">{msns.find(m => m.id === msnToShip)?.msn}</span> è pronta per lasciare lo stabilimento?</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <button onClick={() => setMsnToShip(null)} className="flex-1 py-4 bg-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-colors">Annulla</button>
              <button onClick={confirmShip} className="flex-1 py-4 bg-green-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-green-500 transition-colors shadow-lg shadow-green-600/20">Spedisci Ora</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl z-[100] flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="bg-slate-900 w-full max-w-3xl rounded-[4rem] border border-slate-800 shadow-2xl p-12 space-y-10">
            <div className="flex justify-between items-center">
              <h3 className="text-3xl font-black italic text-white tracking-tighter">Gestione MSN</h3>
              <button onClick={() => setShowImport(false)} className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" /></svg>
              </button>
            </div>

            <div className="flex bg-slate-950 p-2 rounded-2xl border border-slate-800">
              <button onClick={() => setImportMode('file')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${importMode === 'file' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>File (AI/Excel)</button>
              <button onClick={() => setImportMode('manual')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${importMode === 'manual' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Manuale</button>
            </div>

            {importMode === 'file' ? (
              <div onClick={() => !isScanning && document.getElementById('file-upload')?.click()} className="h-64 bg-slate-950 border-4 border-dashed border-slate-800 rounded-[3rem] flex flex-col items-center justify-center gap-6 cursor-pointer hover:border-indigo-500 transition-all">
                {isScanning ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Elaborazione in corso...</span>
                  </div>
                ) : (
                  <>
                    <svg className="w-16 h-16 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" strokeWidth="1.5" /></svg>
                    <div className="text-center">
                      <p className="text-xs font-black uppercase text-slate-300 tracking-widest">Trascina Immagine, PDF o Excel</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase mt-2 tracking-widest">Supporta analisi AI e Parsing Excel</p>
                    </div>
                  </>
                )}
                <input id="file-upload" type="file" className="hidden" onChange={handleImport} accept="image/*,application/pdf,.xlsx,.xls" />
              </div>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-bottom duration-300 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-4">Codice MSN</label>
                  <input type="text" placeholder="Es: 14500" value={manualMsn} onChange={(e) => setManualMsn(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-[1.5rem] px-6 py-4 text-white focus:border-indigo-500 focus:outline-none transition-all font-black text-xl italic" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-4">Inizio Produzione</label>
                    <input type="date" value={manualStartDate} onChange={(e) => setManualStartDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-[1.5rem] px-6 py-3 text-white focus:border-indigo-500 focus:outline-none transition-all font-bold" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-4">Fine Produzione</label>
                    <input type="date" value={manualEndDate} onChange={(e) => setManualEndDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-[1.5rem] px-6 py-3 text-white focus:border-indigo-500 focus:outline-none transition-all font-bold" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-4">Data Imballaggio</label>
                    <input type="date" value={manualWrappingDate} onChange={(e) => setManualWrappingDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-[1.5rem] px-6 py-3 text-white focus:border-indigo-500 focus:outline-none transition-all font-bold" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-4">Data Spedizione FoB</label>
                    <input type="date" value={manualShippingDate} onChange={(e) => setManualShippingDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-[1.5rem] px-6 py-3 text-white focus:border-indigo-500 focus:outline-none transition-all font-bold" />
                  </div>
                </div>
                <button onClick={handleManualAdd} disabled={!manualMsn} className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] text-xs shadow-xl shadow-indigo-600/20 transition-all active:scale-95">Aggiungi MSN</button>
              </div>
            )}
          </div>
        </div>
      )}
      {showUpdateImport && (
        <ImportUpdatesModal
          onClose={() => setShowUpdateImport(false)}
          onSuccess={() => {
            setShowUpdateImport(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}
