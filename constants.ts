import { Department } from './types';

export const INITIAL_OPS: Record<Department, string[]> = {
    [Department.AUTOMATIZZATI]: [],
    [Department.PANNELLI]: [
        'SIDE PNL LH PRIMARIA',
        'SIDE PNL RH PRIMARIA',
        'STTG FRAME BTT ASSY',
        'HOUSING',
        'JOINT 41 DITTA',
        'BTT CARGO ASSY INST',
        'LINING LH RH',
        'CROWN PRIMARIA',
        'SECONDARIA SIDE LH',
        'SECONDARIA SIDE RH',
        'SECONDARIA CRW',
        'SECONDARIA BTT'
    ],
    [Department.TOP]: [
        'TOP ASSY STRUCTURE',
        'LAP JOINT STRINGER 6LH',
        'LAP JOINT STRINGER 6RH',
        'LAP JOINT STRINGER 32 LH',
        'LAP JOINT STRINGER 32 RH',
        'PAX FLOOR INST ACF',
        'TOP BRACKET INSTL',
        'TOP BARREL',
        'TOP ASSY EQUIPPED',
        'END WALL INSTL',
        'END WALL ASSY',
        'FLOOR BEAM ASSY 35.0 ACF',
        'FLOOR BEAM ASSY 35.1 ACF',
        'FLOOR BEAM ASSY 35.2 ACF',
        'FLOOR BEAM ASSY 35.3 ACF',
        'FLOOR BEAM ASSY 35.4 ACF',
        'FLOOR BEAM ASSY 35.5 ACF',
        'FLOOR BEAM ASSY 35.6 ACF',
        'FLOOR BEAM ASSY 35.7 ACF',
        'PAX FLOOR ACF BRACKET INSTL',
        'PAX FLOOR ASSY EQUIPPED ACF',
    ],
    [Department.FINALE]: [
        'SEALING CROWN PANEL',
        'PAINTING SIDE PANEL',
        'SEALING BOTTOM PANEL',
        'PAINTING SIDE PANEL',
        'SEALING TOP BARREL',
        'PAINTING E SEALING',
    ],
    [Department.IMBALLAGGIO]: [
        'Wrapping'
    ]
};
