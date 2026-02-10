import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Department } from '../types';

import { parseAutomatedSheet, parsePannelliSheet, parseTopSheet, parseFinaleSheet, parseFinitureTopSheet } from '../services/excelParser';
import { databaseService } from '../services/databaseService';

interface ImportUpdatesModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export const ImportUpdatesModal: React.FC<ImportUpdatesModalProps> = ({ onClose, onSuccess }) => {
    const [selectedDept, setSelectedDept] = useState<Department>(Department.AUTOMATIZZATI);
    const [file, setFile] = useState<File | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [status, setStatus] = useState<string>('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setStatus('');
        }
    };

    const handleImport = async () => {
        if (!file) return;

        setIsScanning(true);
        setStatus('Lettura file in corso...');

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
                const sheet = workbook.Sheets[workbook.SheetNames[0]]; // Assume first sheet

                if (selectedDept === Department.AUTOMATIZZATI) {
                    const parsedUpdates = parseAutomatedSheet(sheet);

                    if (parsedUpdates.length === 0) {
                        setStatus('Nessun aggiornamento trovato nel file.');
                        setIsScanning(false);
                        return;
                    }

                    setStatus(`Trovati ${parsedUpdates.length} aggiornamenti. Applicazione in corso...`);

                    // Fetch all MSNs to update
                    const allMsns = await databaseService.fetchAllMSNs();
                    let updatedCount = 0;

                    const updatesMap = new Map<string, any>(); // Map MSN ID to msn object

                    for (const update of parsedUpdates) {
                        const msnUnit = allMsns.find(u => u.msn === update.msn);
                        if (msnUnit) {
                            // Prepare update
                            let currentMsn = updatesMap.get(msnUnit.id) || msnUnit;
                            const schedule = currentMsn.deptSchedules?.[Department.AUTOMATIZZATI];

                            if (schedule && schedule.skins) {
                                const newSkins = schedule.skins.map((s: any) => {
                                    if (s.type === update.skinType) {
                                        return {
                                            ...s,
                                            phases: {
                                                ...s.phases,
                                                ...update.updates
                                            }
                                        };
                                    }
                                    return s;
                                });

                                const newSchedule = { ...schedule, skins: newSkins };
                                const newDeptSchedules = {
                                    ...currentMsn.deptSchedules,
                                    [Department.AUTOMATIZZATI]: newSchedule
                                };

                                const updatedMsn = { ...currentMsn, deptSchedules: newDeptSchedules };
                                updatesMap.set(msnUnit.id, updatedMsn);
                            }
                        }
                    }

                    // Perform Batch Update? databaseService treats upsert by MSN.
                    // We can use upsertMSNs
                    if (updatesMap.size > 0) {
                        const msnsToUpdate = Array.from(updatesMap.values());
                        await databaseService.upsertMSNs(msnsToUpdate);
                        updatedCount = msnsToUpdate.length;
                    }

                    setStatus(`Importazione completata! ${updatedCount} MSN aggiornati.`);
                    setTimeout(() => {
                        onSuccess();
                    }, 1500);

                } else if (selectedDept === Department.PANNELLI) {
                    const parsedUpdates = parsePannelliSheet(sheet);

                    if (parsedUpdates.length === 0) {
                        setStatus('Nessun aggiornamento trovato nel file.');
                        setIsScanning(false);
                        return;
                    }

                    setStatus(`Trovati ${parsedUpdates.length} aggiornamenti. Applicazione in corso...`);

                    // Fetch all MSNs to update
                    const allMsns = await databaseService.fetchAllMSNs();
                    let updatedCount = 0;

                    const updatesMap = new Map<string, any>();

                    for (const update of parsedUpdates) {
                        const msnUnit = allMsns.find(u => u.msn === update.msn);
                        console.log(`[Import] Processing MSN ${update.msn}, found in DB:`, !!msnUnit);

                        if (msnUnit) {
                            let currentMsn = updatesMap.get(msnUnit.id) || msnUnit;
                            const schedule = currentMsn.deptSchedules?.[Department.PANNELLI];

                            console.log(`[Import] MSN ${update.msn} has schedule:`, !!schedule);
                            console.log(`[Import] MSN ${update.msn} operations count:`, schedule?.operations?.length);

                            if (schedule && schedule.operations) {
                                console.log(`[Import] Current operations for MSN ${update.msn}:`, schedule.operations.map((o: any) => o.name));
                                console.log(`[Import] Updates for MSN ${update.msn}:`, update.operationUpdates.map(u => u.operationName));

                                const newOperations = schedule.operations.map((op: any) => {
                                    const updateForOp = update.operationUpdates.find(
                                        u => u.operationName.toUpperCase() === op.name.toUpperCase()
                                    );

                                    if (updateForOp) {
                                        console.log(`[Import] MATCH! "${op.name}" -> state: ${updateForOp.state}, completed: ${updateForOp.isCompleted}`);
                                        return {
                                            ...op,
                                            isCompleted: updateForOp.isCompleted,
                                            state: updateForOp.state
                                        };
                                    } else {
                                        console.log(`[Import] NO MATCH for "${op.name}"`);
                                    }
                                    return op;
                                });

                                const newSchedule = { ...schedule, operations: newOperations };
                                const newDeptSchedules = {
                                    ...currentMsn.deptSchedules,
                                    [Department.PANNELLI]: newSchedule
                                };

                                const updatedMsn = { ...currentMsn, deptSchedules: newDeptSchedules };
                                updatesMap.set(msnUnit.id, updatedMsn);
                                console.log(`[Import] Added MSN ${update.msn} to updates map`);
                            }
                        }
                    }

                    if (updatesMap.size > 0) {
                        const msnsToUpdate = Array.from(updatesMap.values());
                        await databaseService.upsertMSNs(msnsToUpdate);
                        updatedCount = msnsToUpdate.length;
                    }

                    setStatus(`Importazione completata! ${updatedCount} MSN aggiornati.`);
                    setTimeout(() => {
                        onSuccess();
                    }, 1500);

                } else if (selectedDept === Department.TOP) {
                    const parsedUpdates = parseTopSheet(sheet);

                    if (parsedUpdates.length === 0) {
                        setStatus('Nessun aggiornamento trovato nel file.');
                        setIsScanning(false);
                        return;
                    }

                    setStatus(`Trovati ${parsedUpdates.length} aggiornamenti. Applicazione in corso...`);

                    // Fetch all MSNs to update
                    const allMsns = await databaseService.fetchAllMSNs();
                    let updatedCount = 0;

                    const updatesMap = new Map<string, any>();

                    for (const update of parsedUpdates) {
                        const msnUnit = allMsns.find(u => u.msn === update.msn);
                        // console.log(`[Import] Processing MSN ${update.msn}, found in DB:`, !!msnUnit);

                        if (msnUnit) {
                            let currentMsn = updatesMap.get(msnUnit.id) || msnUnit;
                            const schedule = currentMsn.deptSchedules?.[Department.TOP];

                            if (schedule && schedule.operations) {
                                const newOperations = schedule.operations.map((op: any) => {
                                    // Normalize names by removing content in parentheses and extra spaces
                                    const normalize = (name: string) => name.replace(/\s*\(.*?\)\s*/g, '').trim().toUpperCase();

                                    const dbNameNormalized = normalize(op.name);

                                    const updateForOp = update.operationUpdates.find(
                                        u => {
                                            const excelNameNormalized = normalize(u.operationName);
                                            // Try exact match first, then normalized match
                                            return u.operationName.toUpperCase() === op.name.toUpperCase() ||
                                                excelNameNormalized === dbNameNormalized;
                                        }
                                    );

                                    if (updateForOp) {
                                        return {
                                            ...op,
                                            isCompleted: updateForOp.isCompleted,
                                            state: updateForOp.state
                                        };
                                    }
                                    return op;
                                });

                                const newSchedule = { ...schedule, operations: newOperations };
                                const newDeptSchedules = {
                                    ...currentMsn.deptSchedules,
                                    [Department.TOP]: newSchedule
                                };

                                const updatedMsn = { ...currentMsn, deptSchedules: newDeptSchedules };
                                updatesMap.set(msnUnit.id, updatedMsn);
                            }
                        }
                    }

                    if (updatesMap.size > 0) {
                        const msnsToUpdate = Array.from(updatesMap.values());
                        await databaseService.upsertMSNs(msnsToUpdate);
                        updatedCount = msnsToUpdate.length;
                    }

                    setStatus(`Importazione completata! ${updatedCount} MSN aggiornati.`);
                    setTimeout(() => {
                        onSuccess();
                    }, 1500);

                } else if (selectedDept === Department.FINALE) {
                    const parsedUpdates = parseFinaleSheet(sheet);

                    if (parsedUpdates.length === 0) {
                        setStatus('Nessun aggiornamento trovato nel file.');
                        setIsScanning(false);
                        return;
                    }

                    setStatus(`Trovati ${parsedUpdates.length} aggiornamenti. Applicazione in corso...`);

                    // Fetch all MSNs to update
                    const allMsns = await databaseService.fetchAllMSNs();
                    let updatedCount = 0;

                    const updatesMap = new Map<string, any>();

                    for (const update of parsedUpdates) {
                        const msnUnit = allMsns.find(u => u.msn === update.msn);

                        if (msnUnit) {
                            let currentMsn = updatesMap.get(msnUnit.id) || msnUnit;
                            const schedule = currentMsn.deptSchedules?.[Department.FINALE];

                            if (schedule && schedule.operations) {
                                const newOperations = schedule.operations.map((op: any) => {
                                    // Simple match for now
                                    // Use 'includes' or strict match? Strict match is safer if specific names.
                                    // User said names are in F6-F9.
                                    const updateForOp = update.operationUpdates.find(
                                        u => u.operationName.toUpperCase() === op.name.toUpperCase()
                                    );

                                    if (updateForOp) {
                                        return {
                                            ...op,
                                            isCompleted: updateForOp.isCompleted,
                                            state: updateForOp.state
                                        };
                                    }
                                    return op;
                                });

                                const newSchedule = { ...schedule, operations: newOperations };
                                const newDeptSchedules = {
                                    ...currentMsn.deptSchedules,
                                    [Department.FINALE]: newSchedule
                                };

                                const updatedMsn = { ...currentMsn, deptSchedules: newDeptSchedules };
                                updatesMap.set(msnUnit.id, updatedMsn);
                            }
                        }
                    }

                    if (updatesMap.size > 0) {
                        const msnsToUpdate = Array.from(updatesMap.values());
                        await databaseService.upsertMSNs(msnsToUpdate);
                        updatedCount = msnsToUpdate.length;
                    }

                    setStatus(`Importazione completata! ${updatedCount} MSN aggiornati.`);
                    setTimeout(() => {
                        onSuccess();
                    }, 1500);

                } else {
                    setStatus('Importazione per questo reparto non ancora supportata.');
                }

            } catch (err) {
                console.error('Import error:', err);
                setStatus('Errore durante l\'importazione: ' + (err as Error).message);
            } finally {
                setIsScanning(false);
            }
        };

        reader.readAsBinaryString(file);
    };



    const handleFinitureTopImport = async (fileTop: File) => {
        setIsScanning(true);
        setStatus('Lettura file Finiture-Top in corso...');

        try {
            const data = await fileTop.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Use the new parser
            const updates = parseFinitureTopSheet(worksheet);

            if (updates.length === 0) {
                setStatus('Nessun dato trovato per Finiture Top.');
                setIsScanning(false);
                return;
            }

            setStatus(`Trovati ${updates.length} aggiornamenti Finiture Top. Sincronizzazione...`);

            // Reuse syncFinaleUpdates as it merges operations by name
            await databaseService.syncFinaleUpdates(updates);

            setStatus('Finiture Top importato con successo!');
            setTimeout(() => {
                setStatus('');
                onSuccess(); // Refresh Data
            }, 2000);

        } catch (error) {
            console.error('Import Finiture Top error:', error);
            setStatus('Errore importazione Finiture Top.');
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>

                <div className="mb-6">
                    <h3 className="text-2xl font-black italic text-white tracking-tighter">Importa Avanzamento</h3>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Carica Excel Reparto</p>
                </div>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reparto</label>
                        <select
                            value={selectedDept}
                            onChange={(e) => setSelectedDept(e.target.value as Department)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-500"
                        >
                            <option value={Department.AUTOMATIZZATI}>Automatizzati</option>
                            <option value={Department.PANNELLI}>Pannelli</option>
                            <option value={Department.TOP}>Top</option>
                            <option value={Department.FINALE}>Finiture</option>
                        </select>
                    </div>



                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                {selectedDept === Department.FINALE ? 'File "Finale" (Prime 4 Op.)' : 'File Excel'}
                            </label>
                            <div className="relative group">
                                <input
                                    type="file"
                                    accept=".xlsx, .xls"
                                    onChange={handleFileChange}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div className={`w-full bg-slate-950 border-2 border-dashed ${file ? 'border-green-500/50 bg-green-500/5' : 'border-slate-800 group-hover:border-indigo-500/50'} rounded-xl p-6 text-center transition-all`}>
                                    {file ? (
                                        <div className="flex items-center justify-center gap-2 text-green-500">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                            <span className="font-bold text-xs truncate max-w-[200px]">{file.name}</span>
                                        </div>
                                    ) : (
                                        <div className="text-slate-500">
                                            <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                            <span className="font-bold text-xs uppercase tracking-widest">
                                                {selectedDept === Department.FINALE ? 'Carica File Standard' : 'Clicca per caricare'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={handleImport}
                                disabled={!file || isScanning}
                                className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs transition-all ${!file || isScanning ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'}`}
                            >
                                {isScanning ? 'Elaborazione...' : 'Importa File Standard'}
                            </button>
                        </div>

                        {selectedDept === Department.FINALE && (
                            <div className="space-y-2 pt-4 border-t border-slate-800">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">File "Finiture Top" (Ultime 2 Op.)</label>
                                <div className="relative group">
                                    <input
                                        type="file"
                                        accept=".xlsx, .xls"
                                        onChange={(e) => {
                                            if (e.target.files?.[0]) handleFinitureTopImport(e.target.files[0]);
                                            // Reset input
                                            e.target.value = '';
                                        }}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        disabled={isScanning}
                                    />
                                    <div className={`w-full bg-slate-950 border-2 border-dashed border-slate-800 group-hover:border-indigo-500/50 rounded-xl p-4 text-center transition-all`}>
                                        <div className="text-slate-500">
                                            <span className="font-bold text-xs uppercase tracking-widest">Clicca per caricare Finiture-Top</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
