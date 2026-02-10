import * as XLSX from 'xlsx';
import { SkinWork, SkinType, MachineAsset, MachineDetail } from '../types';

// Configuration for row mappings based on User Request
// Rows are 0-indexed in code, but user provided 1-indexed numbers.
const ROW_OFFSETS: Record<SkinType, number> = {
    '5384': 12, // Row 13
    '5671': 21, // Row 22
    '5656': 30, // Row 31
    '5651': 39, // Row 40
    '5646': 48  // Row 49
};

const MACHINE_MAP: Record<number, MachineAsset> = {
    2: 'Brotje 1597', // e.g. Row 15 for 5384 (13 + 2)
    3: 'Brotje 1570',
    4: 'Brotje 1569',
    5: 'Recoules 198',
    6: 'Recoules 199'
};

interface ParsedSkinUpdate {
    msn: string;
    skinType: SkinType;
    updates: Partial<SkinWork['phases']>;
}

export const parseAutomatedSheet = (sheet: XLSX.WorkSheet): ParsedSkinUpdate[] => {
    const updates: ParsedSkinUpdate[] = [];

    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');

    // Iterate through columns
    for (let C = range.s.c; C <= range.e.c; ++C) {

        // Check for each Skin Type block in this column
        (Object.keys(ROW_OFFSETS) as SkinType[]).forEach(skinType => {
            const startRow = ROW_OFFSETS[skinType];

            // Read MSN cell
            const msnCell = sheet[XLSX.utils.encode_cell({ c: C, r: startRow })];
            const msn = msnCell ? String(msnCell.v).trim() : null;

            if (msn) {
                const phasesUpdate: any = {};

                // 1. Preparazione (Row + 1)
                const prepCell = sheet[XLSX.utils.encode_cell({ c: C, r: startRow + 1 })];
                if (prepCell && prepCell.v != null) {
                    let progress = 0;
                    if (typeof prepCell.v === 'number') {
                        progress = prepCell.v <= 1 ? Math.round(prepCell.v * 100) : prepCell.v;
                    } else if (typeof prepCell.v === 'string') {
                        const cleaned = prepCell.v.replace(',', '.').replace('%', '').trim();
                        const parsed = parseFloat(cleaned);
                        if (!isNaN(parsed)) {
                            progress = (parsed <= 1 && parsed !== 0) ? Math.round(parsed * 100) : parsed;
                        } else if (prepCell.v.toUpperCase() === 'OK') {
                            progress = 100;
                        } else {
                            progress = 100;
                        }
                    } else {
                        progress = 100;
                    }
                    phasesUpdate['Masticiatura'] = { isCompleted: progress >= 100, progress };
                }

                // 2. Machine Assets (Rows + 2 to + 6)
                const machineDetails: MachineDetail[] = [];
                let machineCompleted = false;

                [2, 3, 4, 5, 6].forEach(offset => {
                    const machineCell = sheet[XLSX.utils.encode_cell({ c: C, r: startRow + offset })];
                    if (machineCell && machineCell.v) {
                        let percentage = 100;
                        if (typeof machineCell.v === 'number') {
                            percentage = machineCell.v <= 1 ? Math.round(machineCell.v * 100) : machineCell.v;
                        } else if (typeof machineCell.v === 'string') {
                            const parsed = parseFloat(machineCell.v.replace(',', '.').replace('%', ''));
                            if (!isNaN(parsed)) {
                                percentage = (parsed <= 1 && parsed !== 0) ? Math.round(parsed * 100) : parsed;
                            }
                        }

                        machineDetails.push({
                            asset: MACHINE_MAP[offset],
                            percentage: percentage
                        });
                        machineCompleted = true;
                    }
                });

                if (machineCompleted) {
                    phasesUpdate['Macchina'] = {
                        isCompleted: true, // Only if 100% logic required? User didn't specify for machines, kept logic simple validation
                        machineDetails: machineDetails
                    };
                }

                // 3. Completamento (Row + 7)
                const completeCell = sheet[XLSX.utils.encode_cell({ c: C, r: startRow + 7 })];
                if (completeCell && completeCell.v != null) {
                    let progress = 0;
                    if (typeof completeCell.v === 'number') {
                        progress = completeCell.v <= 1 ? Math.round(completeCell.v * 100) : completeCell.v;
                    } else if (typeof completeCell.v === 'string') {
                        const cleaned = completeCell.v.replace(',', '.').replace('%', '').trim();
                        const parsed = parseFloat(cleaned);
                        if (!isNaN(parsed)) {
                            progress = (parsed <= 1 && parsed !== 0) ? Math.round(parsed * 100) : parsed;
                        } else if (completeCell.v.toUpperCase() === 'OK') {
                            progress = 100;
                        } else {
                            progress = 100;
                        }
                    } else {
                        progress = 100;
                    }
                    phasesUpdate['Completamento'] = { isCompleted: progress >= 100, progress };
                }

                // 4. Auto Quality Gate Logic
                // "se tutto è completo automaticamente passa il quality gate a ok"
                // Everything complete means: Masticiatura AND Macchina AND Completamento.
                const prepDone = phasesUpdate['Masticiatura']?.isCompleted;
                const machDone = phasesUpdate['Macchina']?.isCompleted;
                const compDone = phasesUpdate['Completamento']?.isCompleted;

                if (prepDone && machDone && compDone) {
                    phasesUpdate['Quality Gate'] = { isCompleted: true, status: 'OK' };
                }

                if (Object.keys(phasesUpdate).length > 0) {
                    updates.push({
                        msn,
                        skinType,
                        updates: phasesUpdate
                    });
                }
            }
        });
    }

    return updates;
};

// Pannelli Department Parser
interface ParsedPannelliUpdate {
    msn: string;
    operationUpdates: Array<{
        operationName: string;
        percentage: number;
        isCompleted: boolean;
        state: 'todo' | 'doing' | 'done';
    }>;
}

export const parsePannelliSheet = (sheet: XLSX.WorkSheet): ParsedPannelliUpdate[] => {
    const updates: ParsedPannelliUpdate[] = [];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');

    console.log('[Pannelli Parser] Starting parse, range:', range);

    // MSNs are in row 4 (index 3), starting from column H (index 7)
    const msnRowIndex = 3;

    console.log('[Pannelli Parser] Using fixed MSN row index:', msnRowIndex);

    // Extract MSN values from columns starting at column H (index 7)
    const msnColumns: Array<{ col: number; msn: string }> = [];
    for (let C = 7; C <= range.e.c; C++) {
        const msnCell = sheet[XLSX.utils.encode_cell({ c: C, r: msnRowIndex })];
        if (msnCell && msnCell.v) {
            const msnValue = String(msnCell.v).trim();
            console.log(`[Pannelli Parser] Column ${C} MSN candidate: "${msnValue}"`);
            if (msnValue && /^\d+$/.test(msnValue)) {
                msnColumns.push({ col: C, msn: msnValue });
                console.log(`[Pannelli Parser] Added MSN: ${msnValue} at column ${C}`);
            }
        }
    }

    console.log('[Pannelli Parser] Found MSN columns:', msnColumns);

    if (msnColumns.length === 0) {
        console.warn('No MSN columns found in Pannelli sheet');
        return updates;
    }

    // Operations are in specific rows:
    // Rows 10-17 (indices 9-16): operations 1-8 (Primaria)
    // Rows 19-22 (indices 18-21): operations 9-12 (Secondaria)
    const operationRows: Array<{ row: number; name: string }> = [];

    // Define the exact row ranges
    const rowRanges = [
        { start: 9, end: 16 },  // Rows 10-17 (operations 1-8)
        { start: 18, end: 21 }  // Rows 19-22 (operations 9-12)
    ];

    for (const range of rowRanges) {
        for (let R = range.start; R <= range.end; R++) {
            const nameCell = sheet[XLSX.utils.encode_cell({ c: 3, r: R })]; // Column D (index 3)
            if (nameCell && nameCell.v) {
                let opName = String(nameCell.v).trim();

                console.log(`[Pannelli Parser] Row ${R} (Excel row ${R + 1}) operation: "${opName}"`);

                // Normalize operation names
                if (opName.includes('JOINT 41 ENGITECH')) {
                    opName = 'JOINT 41 DITTA';
                }

                if (opName && opName.length > 3) {
                    operationRows.push({ row: R, name: opName });
                    console.log(`[Pannelli Parser] Added operation: "${opName}" at row ${R}`);
                }
            }
        }
    }

    console.log('[Pannelli Parser] Found operation rows:', operationRows.length);

    // Parse data for each MSN
    msnColumns.forEach(({ col, msn }) => {
        const operationUpdates: ParsedPannelliUpdate['operationUpdates'] = [];

        console.log(`[Pannelli Parser] Processing MSN ${msn} at column ${col}`);

        operationRows.forEach(({ row, name }) => {
            const valueCell = sheet[XLSX.utils.encode_cell({ c: col, r: row })];

            console.log(`[Pannelli Parser] MSN ${msn}, Op "${name}": value="${valueCell?.v}"`);

            if (valueCell && valueCell.v != null) {
                let percentage = 0;

                if (typeof valueCell.v === 'number') {
                    percentage = valueCell.v <= 1 ? Math.round(valueCell.v * 100) : valueCell.v;
                } else if (typeof valueCell.v === 'string') {
                    const cleaned = valueCell.v.replace(',', '.').replace('%', '').trim();
                    const parsed = parseFloat(cleaned);
                    if (!isNaN(parsed)) {
                        percentage = (parsed <= 1 && parsed !== 0) ? Math.round(parsed * 100) : parsed;
                    }
                }

                // Determine state based on percentage
                let state: 'todo' | 'doing' | 'done' = 'todo';
                let isCompleted = false;

                if (percentage >= 100) {
                    state = 'done';
                    isCompleted = true;
                } else if (percentage > 0) {
                    state = 'doing';
                    isCompleted = false;
                } else {
                    state = 'todo';
                    isCompleted = false;
                }

                console.log(`[Pannelli Parser] MSN ${msn}, Op "${name}": percentage=${percentage}, state=${state}`);

                operationUpdates.push({
                    operationName: name,
                    percentage,
                    isCompleted,
                    state
                });
            }
        });

        if (operationUpdates.length > 0) {
            console.log(`[Pannelli Parser] Adding update for MSN ${msn} with ${operationUpdates.length} operations`);
            updates.push({
                msn,
                operationUpdates
            });
        }
    });

    console.log('[Pannelli Parser] Total updates:', updates.length);
    return updates;
};

// TOP Department Parser
interface ParsedTopUpdate {
    msn: string;
    operationUpdates: Array<{
        operationName: string;
        percentage: number;
        isCompleted: boolean;
        state: 'todo' | 'doing' | 'done';
    }>;
}

export const parseTopSheet = (sheet: XLSX.WorkSheet): ParsedTopUpdate[] => {
    const updates: ParsedTopUpdate[] = [];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');

    console.log('[TOP Parser] Starting parse, range:', range);

    // MSNs are in row 11 (index 10), starting from column J (index 9)
    const msnRowIndex = 10;

    console.log('[TOP Parser] Using fixed MSN row index:', msnRowIndex);

    // Extract MSN values from columns starting at column J (index 9)
    const msnColumns: Array<{ col: number; msn: string }> = [];
    for (let C = 9; C <= range.e.c; C++) {
        const msnCell = sheet[XLSX.utils.encode_cell({ c: C, r: msnRowIndex })];
        if (msnCell && msnCell.v) {
            const msnValue = String(msnCell.v).trim();
            console.log(`[TOP Parser] Column ${C} MSN candidate: "${msnValue}"`);
            if (msnValue && /^\d+$/.test(msnValue)) {
                msnColumns.push({ col: C, msn: msnValue });
                console.log(`[TOP Parser] Added MSN: ${msnValue} at column ${C}`);
            }
        }
    }

    console.log('[TOP Parser] Found MSN columns:', msnColumns);

    if (msnColumns.length === 0) {
        console.warn('No MSN columns found in TOP sheet');
        return updates;
    }

    // Operations are in specific rows in column I (index 8):
    // Rows 13-18 (indices 12-17): operations 1-6
    // Rows 20-24 (indices 19-23): operations 7-11
    // Rows 26-35 (indices 25-34): operations 12-21
    const operationRows: Array<{ row: number; name: string }> = [];

    // Define the exact row ranges
    const rowRanges = [
        { start: 12, end: 17 },  // Rows 13-18 (operations 1-6)
        { start: 19, end: 23 },  // Rows 20-24 (operations 7-11)
        { start: 25, end: 34 }   // Rows 26-35 (operations 12-21)
    ];

    for (const range of rowRanges) {
        for (let R = range.start; R <= range.end; R++) {
            const nameCell = sheet[XLSX.utils.encode_cell({ c: 8, r: R })]; // Column I (index 8)
            if (nameCell && nameCell.v) {
                let opName = String(nameCell.v).trim();

                console.log(`[TOP Parser] Row ${R} (Excel row ${R + 1}) operation: "${opName}"`);

                if (opName && opName.length > 3) {
                    operationRows.push({ row: R, name: opName });
                    console.log(`[TOP Parser] Added operation: "${opName}" at row ${R}`);
                }
            }
        }
    }

    console.log('[TOP Parser] Found operation rows:', operationRows.length);

    // Parse data for each MSN
    msnColumns.forEach(({ col, msn }) => {
        const operationUpdates: ParsedTopUpdate['operationUpdates'] = [];

        console.log(`[TOP Parser] Processing MSN ${msn} at column ${col}`);

        operationRows.forEach(({ row, name }) => {
            const valueCell = sheet[XLSX.utils.encode_cell({ c: col, r: row })];

            console.log(`[TOP Parser] MSN ${msn}, Op "${name}": value="${valueCell?.v}"`);

            if (valueCell && valueCell.v != null) {
                let percentage = 0;

                if (typeof valueCell.v === 'number') {
                    percentage = valueCell.v <= 1 ? Math.round(valueCell.v * 100) : valueCell.v;
                } else if (typeof valueCell.v === 'string') {
                    const cleaned = valueCell.v.replace(',', '.').replace('%', '').trim();
                    const parsed = parseFloat(cleaned);
                    if (!isNaN(parsed)) {
                        percentage = (parsed <= 1 && parsed !== 0) ? Math.round(parsed * 100) : parsed;
                    }
                }

                // Determine state based on percentage
                let state: 'todo' | 'doing' | 'done' = 'todo';
                let isCompleted = false;

                if (percentage >= 100) {
                    state = 'done';
                    isCompleted = true;
                } else if (percentage > 0) {
                    state = 'doing';
                    isCompleted = false;
                } else {
                    state = 'todo';
                    isCompleted = false;
                }

                console.log(`[TOP Parser] MSN ${msn}, Op "${name}": percentage=${percentage}, state=${state}`);

                operationUpdates.push({
                    operationName: name,
                    percentage,
                    isCompleted,
                    state
                });
            }
        });

        if (operationUpdates.length > 0) {
            console.log(`[TOP Parser] Adding update for MSN ${msn} with ${operationUpdates.length} operations`);
            updates.push({
                msn,
                operationUpdates
            });
        }
    });

    console.log('[TOP Parser] Total updates:', updates.length);
    return updates;
};

// FINALE Department Parser
interface ParsedFinaleUpdate {
    msn: string;
    operationUpdates: Array<{
        operationName: string;
        percentage: number;
        isCompleted: boolean;
        state: 'todo' | 'doing' | 'done';
    }>;
}

export const parseFinaleSheet = (sheet: XLSX.WorkSheet): ParsedFinaleUpdate[] => {
    const updates: ParsedFinaleUpdate[] = [];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');

    console.log('[Finale Parser] Starting parse, range:', range);

    // MSNs are in row 3 (index 2), starting from column H (index 7) based on user "MSN DA H3"
    const msnRowIndex = 2; // H3 is row 3 (0-indexed 2)

    console.log('[Finale Parser] Using fixed MSN row index:', msnRowIndex);

    // Extract MSN values from columns starting at column H (index 7)
    const msnColumns: Array<{ col: number; msn: string }> = [];
    for (let C = 7; C <= range.e.c; C++) {
        const msnCell = sheet[XLSX.utils.encode_cell({ c: C, r: msnRowIndex })];
        if (msnCell && msnCell.v) {
            const msnValue = String(msnCell.v).trim();
            console.log(`[Finale Parser] Column ${C} MSN candidate: "${msnValue}"`);
            if (msnValue && /^\d+$/.test(msnValue)) {
                msnColumns.push({ col: C, msn: msnValue });
                console.log(`[Finale Parser] Added MSN: ${msnValue} at column ${C}`);
            }
        }
    }

    console.log('[Finale Parser] Found MSN columns:', msnColumns);

    if (msnColumns.length === 0) {
        console.warn('No MSN columns found in Finale sheet');
        return updates;
    }

    // Operations are in rows 6-9 (indices 5-8) in Column F (index 5) based on user "operazioni da F6 a F9"
    const operationRows: Array<{ row: number; name: string }> = [];

    // Rows 6, 7, 8, 9 correspond to indices 5, 6, 7, 8
    const opStartRow = 5;
    const opEndRow = 8;
    const nameColIndex = 5; // Column F is index 5

    for (let R = opStartRow; R <= opEndRow; R++) {
        const nameCell = sheet[XLSX.utils.encode_cell({ c: nameColIndex, r: R })];
        if (nameCell && nameCell.v) {
            let opName = String(nameCell.v).trim();
            // Normalize spaces
            opName = opName.replace(/\s+/g, ' ');

            console.log(`[Finale Parser] Row ${R} (Excel row ${R + 1}) operation: "${opName}"`);

            if (opName) {
                operationRows.push({ row: R, name: opName });
            }
        }
    }

    console.log('[Finale Parser] Found operation rows:', operationRows.length);

    // Parse data for each MSN
    msnColumns.forEach(({ col, msn }) => {
        const operationUpdates: ParsedFinaleUpdate['operationUpdates'] = [];

        console.log(`[Finale Parser] Processing MSN ${msn} at column ${col}`);

        operationRows.forEach(({ row, name }) => {
            const valueCell = sheet[XLSX.utils.encode_cell({ c: col, r: row })];

            console.log(`[Finale Parser] MSN ${msn}, Op "${name}": value="${valueCell?.v}"`);

            if (valueCell && valueCell.v != null) {
                let percentage = 0;

                if (typeof valueCell.v === 'number') {
                    percentage = valueCell.v <= 1 ? Math.round(valueCell.v * 100) : valueCell.v;
                } else if (typeof valueCell.v === 'string') {
                    const cleaned = valueCell.v.replace(',', '.').replace('%', '').trim();
                    const parsed = parseFloat(cleaned);
                    if (!isNaN(parsed)) {
                        percentage = (parsed <= 1 && parsed !== 0) ? Math.round(parsed * 100) : parsed;
                    }
                }

                // Determine state based on percentage
                let state: 'todo' | 'doing' | 'done' = 'todo';
                let isCompleted = false;

                if (percentage >= 100) {
                    state = 'done';
                    isCompleted = true;
                } else if (percentage > 0) {
                    state = 'doing';
                    isCompleted = false;
                } else {
                    state = 'todo';
                    isCompleted = false;
                }

                console.log(`[Finale Parser] MSN ${msn}, Op "${name}": percentage=${percentage}, state=${state}`);

                operationUpdates.push({
                    operationName: name,
                    percentage,
                    isCompleted,
                    state
                });
            }
        });

        if (operationUpdates.length > 0) {
            console.log(`[Finale Parser] Adding update for MSN ${msn} with ${operationUpdates.length} operations`);
            updates.push({
                msn,
                operationUpdates
            });
        }
    });

    console.log('[Finale Parser] Total updates:', updates.length);
    return updates;
};

export const parseFinitureTopSheet = (sheet: XLSX.WorkSheet): ParsedFinaleUpdate[] => {
    const updates: ParsedFinaleUpdate[] = [];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z200');

    console.log('[Finiture Top Parser] Starting parse, range:', range);

    // User Config:
    // MSN starts at G3 -> Row 2 (0-indexed), Column 6 (G is 7th letter, index 6)
    const msnRowIndex = 2;
    const msnStartColIndex = 6; // G

    // Operations are at E6 and E7 -> Row 5 and 6 (0-indexed), Column 4 (E is 5th letter, index 4)
    const opNameColIndex = 4; // E
    const opRowIndices = [5, 6]; // Row 6 and 7

    console.log('[Finiture Top Parser] Using fixed MSN row index:', msnRowIndex, 'Start Col:', msnStartColIndex);

    const msnColumns: Array<{ col: number; msn: string }> = [];
    for (let C = msnStartColIndex; C <= range.e.c; C++) {
        const msnCell = sheet[XLSX.utils.encode_cell({ c: C, r: msnRowIndex })];
        if (msnCell && msnCell.v) {
            const msnValue = String(msnCell.v).trim();
            if (msnValue && /^\d+$/.test(msnValue)) {
                msnColumns.push({ col: C, msn: msnValue });
            }
        }
    }
    console.log('[Finiture Top Parser] Found MSN columns:', msnColumns);

    if (msnColumns.length === 0) return updates;

    // Read Operation Names from E6 and E7
    const operationRows: Array<{ row: number; name: string }> = [];
    opRowIndices.forEach(rowIndex => {
        const cell = sheet[XLSX.utils.encode_cell({ c: opNameColIndex, r: rowIndex })];
        if (cell && cell.v) {
            const val = String(cell.v).trim().toUpperCase().replace(/\s+/g, ' ');
            // Verify if it matches our expected names? Or just take what's there?
            // User said "E6, E7 PER GLI MSN DA G3 IN POI, PER L'AGGIORNAMENTO DA G6 E G7 IN POI"
            // So we trust these rows contain the relevant ops.
            // We can Map them to our internal constant names if needed, or rely on string match.
            // Internal names: 'SEALING TOP BARREL', 'PAINTING E SEALING'
            console.log(`[Finiture Top Parser] Read Op Name at E${rowIndex + 1}: "${val}"`);
            operationRows.push({ row: rowIndex, name: val });
        }
    });


    // Parse data
    msnColumns.forEach(({ col, msn }) => {
        const operationUpdates: ParsedFinaleUpdate['operationUpdates'] = [];

        operationRows.forEach(({ row, name }) => {
            const valueCell = sheet[XLSX.utils.encode_cell({ c: col, r: row })];
            if (valueCell && valueCell.v != null) {
                let percentage = 0;
                if (typeof valueCell.v === 'number') {
                    percentage = valueCell.v <= 1 ? Math.round(valueCell.v * 100) : valueCell.v;
                } else if (typeof valueCell.v === 'string') {
                    const cleaned = valueCell.v.replace(',', '.').replace('%', '').trim();
                    const parsed = parseFloat(cleaned);
                    if (!isNaN(parsed)) {
                        percentage = (parsed <= 1 && parsed !== 0) ? Math.round(parsed * 100) : parsed;
                    }
                }

                let state: 'todo' | 'doing' | 'done' = 'todo';
                let isCompleted = false;

                if (percentage >= 100) {
                    state = 'done';
                    isCompleted = true;
                } else if (percentage > 0) {
                    state = 'doing';
                }

                operationUpdates.push({
                    operationName: name,
                    percentage,
                    isCompleted,
                    state
                });
            }
        });

        if (operationUpdates.length > 0) {
            updates.push({ msn, operationUpdates });
        }
    });

    return updates;
};
