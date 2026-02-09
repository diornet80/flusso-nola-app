import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Department } from '../types';
import { parseAutomatedSheet, parsePannelliSheet } from '../services/excelParser';
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
                        if (msnUnit) {
                            let currentMsn = updatesMap.get(msnUnit.id) || msnUnit;
                            const schedule = currentMsn.deptSchedules?.[Department.PANNELLI];

                            if (schedule && schedule.operations) {
                                const newOperations = schedule.operations.map((op: any) => {
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
                                    [Department.PANNELLI]: newSchedule
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
                            <option value={Department.TOP} disabled>Top (Prossimamente)</option>
                            <option value={Department.FINALE} disabled>Finale (Prossimamente)</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">File Excel</label>
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
                                        <span className="font-bold text-xs uppercase tracking-widest">Clicca per caricare</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {status && (
                        <div className={`p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest text-center ${status.includes('Errore') ? 'bg-red-500/10 text-red-500' : 'bg-indigo-500/10 text-indigo-400'}`}>
                            {status}
                        </div>
                    )}

                    <button
                        onClick={handleImport}
                        disabled={!file || isScanning}
                        className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs transition-all ${!file || isScanning ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'}`}
                    >
                        {isScanning ? 'Elaborazione in corso...' : 'Avvia Importazione'}
                    </button>
                </div>
            </div>
        </div>
    );
};
