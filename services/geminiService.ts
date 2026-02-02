
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeDiscrepancies(discrepancies: string[]) {
  if (discrepancies.length === 0) return "Nessuna discrepanza rilevata.";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analizza le seguenti discrepanze industriali e fornisci un breve riepilogo delle criticità e suggerimenti per la risoluzione:\n${discrepancies.join('\n')}`,
      config: {
        systemInstruction: "Sei un esperto di controllo qualità industriale aeronautico. Fornisci risposte concise e professionali in italiano.",
      }
    });
    return response.text;
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return "Analisi AI non disponibile al momento.";
  }
}

export async function parseMsnDocument(base64Data: string, mimeType: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        {
          text: `Analizza questa tabella di produzione A321 ed estrai TUTTE le righe visibili.
          Per ogni riga, identifica ed estrai SOLO i seguenti 5 campi:
          1. MSN: Cerca il codice numerico a 5 cifre (es: 13817, 13754). Ignora le colonne cumulative 'Cum'.
          2. Start: La data di inizio (formato DD/MM/YY).
          3. Finish: La data di fine produzione (formato DD/MM/YY).
          4. Wrapping: La data indicata nella colonna 'Wrapping'.
          5. Shipping: La data indicata nella colonna 'FoB Date'.
          
          Restituisci un JSON con questa struttura:
          {
            "units": [
              {
                "msn": "13817",
                "startDate": "2026-03-10",
                "endDate": "2026-04-14",
                "wrappingDate": "2026-05-01",
                "shippingDate": "2026-05-28"
              }
            ]
          }
          Importante: Converti tutte le date nel formato standard ISO YYYY-MM-DD. Se l'anno non è specificato nella cella, usa 2026 come da intestazione.`
        }
      ],
      config: {
        responseMimeType: "application/json",
        systemInstruction: "Sei un estrattore di dati industriali di alta precisione. Non aggiungere commenti, restituisci solo il JSON. Assicurati che l'MSN sia quello a 5 cifre.",
      }
    });

    const result = JSON.parse(response.text || '{"units": []}');
    return result.units || [];
  } catch (error) {
    console.error("Document parsing failed:", error);
    return null;
  }
}
