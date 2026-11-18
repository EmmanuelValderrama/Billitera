import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

interface ChatMessageInput {
  role: 'user' | 'assistant';
  text: string;
  attachmentLabel?: string;
}

interface AssistantAttachmentInput {
  kind: 'image' | 'audio';
  mimeType: string;
  dataBase64: string;
  fileName?: string;
}

interface ExpenseContextItem {
  id: string;
  amount: number;
  totalAmount: number;
  date: string;
  description: string;
  category: string;
  paymentType: 'single' | 'installments';
  cardLabel?: string;
  installmentMonths?: number;
  interestRatePercent?: number;
}

interface IncomeContextItem {
  id: string;
  amount: number;
  date: string;
  description: string;
}

interface SavingsGoalContextItem {
  id: string;
  name: string;
  savedAmount: number;
  targetAmount?: number;
}

interface AssistantRequestContext {
  accountName: string;
  currentDateIso: string;
  budgetMode?: 'fixed' | 'variable';
  baseBudget?: number;
  totalIncome?: number;
  monthlyBudget: number;
  totalSpent: number;
  availableBalance: number;
  expenses: ExpenseContextItem[];
  incomes?: IncomeContextItem[];
  totalSaved?: number;
  savingsGoals?: SavingsGoalContextItem[];
}

interface AssistantModelOutput {
  action: 'reply' | 'create_expense' | 'create_income';
  reply: string;
  expense?: {
    amount: number;
    date: string;
    description: string;
    category: string;
  };
  income?: {
    amount: number;
    date: string;
    description: string;
  };
}

const VALID_CATEGORIES = [
  'Alimentación',
  'Transporte',
  'Cafetería',
  'Hogar',
  'Salud y farmacia',
  'Restaurantes',
  'Servicios',
  'Entretenimiento',
  'Otros',
];

const SHORT_MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/mp3',
  'audio/mpeg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/aac',
  'audio/flac',
]);

function normalizeMimeType(raw: string, kind: 'image' | 'audio'): string | null {
  const base = raw.split(';')[0].trim().toLowerCase();
  if (kind === 'image') {
    if (base === 'image/jpg') return 'image/jpeg';
    return ALLOWED_IMAGE_MIMES.has(base) ? base : null;
  }
  if (base === 'video/webm') return 'audio/webm';
  if (base === 'audio/m4a' || base === 'audio/x-m4a') return 'audio/mp4';
  if (base === 'audio/x-wav') return 'audio/wav';
  return ALLOWED_AUDIO_MIMES.has(base) ? base : null;
}

function formatCop(value: number): string {
  const rounded = Math.round(value);
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  const formatted = new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(Math.abs(safe));
  return safe < 0 ? `-$ ${formatted}` : `$ ${formatted}`;
}

function formatShortIsoDate(isoDate: string): string {
  const [yStr, mStr, dStr] = isoDate.split('-');
  const y = Number(yStr) || 2026;
  const m = Number(mStr) || 1;
  const d = Number(dStr) || 1;
  const abbr = SHORT_MONTHS[m - 1] ?? 'ene';
  return `${d} ${abbr} ${y}`;
}

function computeYesterdayIso(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeCategory(raw: string | undefined): string {
  if (!raw) return 'Otros';
  const match = VALID_CATEGORIES.find(
    (cat) => cat.toLowerCase() === raw.trim().toLowerCase()
  );
  return match ?? 'Otros';
}

function buildSystemInstruction(ctx: AssistantRequestContext): string {
  const accountName = ctx.accountName.trim() || 'Cuenta';
  const todayIso = /^\d{4}-\d{2}-\d{2}$/.test(ctx.currentDateIso)
    ? ctx.currentDateIso
    : '2026-11-18';
  const currentYear = Number(todayIso.slice(0, 4)) || 2026;
  const yesterdayIso = computeYesterdayIso(todayIso);

  const budgetMode = ctx.budgetMode === 'variable' ? 'variable' : 'fixed';
  const baseBudget = ctx.baseBudget ?? (budgetMode === 'variable' ? 0 : ctx.monthlyBudget);
  const totalIncome = ctx.totalIncome ?? 0;
  const incomes = Array.isArray(ctx.incomes) ? ctx.incomes : [];
  const savingsGoals = Array.isArray(ctx.savingsGoals) ? ctx.savingsGoals : [];
  const totalSaved = ctx.totalSaved ?? 0;

  const todayExpenses = ctx.expenses.filter((e) => e.date === todayIso);
  const yesterdayExpenses = ctx.expenses.filter((e) => e.date === yesterdayIso);
  const todayTotal = todayExpenses.reduce((s, e) => s + e.totalAmount, 0);
  const yesterdayTotal = yesterdayExpenses.reduce((s, e) => s + e.totalAmount, 0);

  const expensesJson = JSON.stringify(
    ctx.expenses.map((e) => ({
      fecha: e.date,
      fechaCorta: formatShortIsoDate(e.date),
      montoTotalCop: e.totalAmount,
      montoFormatted: formatCop(e.totalAmount),
      descripcion: e.description,
      categoria: e.category,
      formaPago: e.paymentType === 'installments' ? 'A plazos' : 'De una sola vez',
      ...(e.cardLabel ? { tarjeta: e.cardLabel } : {}),
      ...(e.installmentMonths ? { cuotasMeses: e.installmentMonths } : {}),
    }))
  );

  const incomesJson = JSON.stringify(
    incomes.map((inc) => ({
      fecha: inc.date,
      fechaCorta: formatShortIsoDate(inc.date),
      montoCop: inc.amount,
      montoFormatted: formatCop(inc.amount),
      descripcion: inc.description,
    }))
  );

  const savingsJson = JSON.stringify(
    savingsGoals.map((goal) => ({
      nombre: goal.name,
      ahorradoCop: goal.savedAmount,
      ahorradoFormatted: formatCop(goal.savedAmount),
      ...(goal.targetAmount
        ? { metaCop: goal.targetAmount, metaFormatted: formatCop(goal.targetAmount) }
        : {}),
    }))
  );

  return `Eres el asistente financiero oficial dentro de la aplicación "Tu billetera".

DATOS REALES ACTUALES DEL USUARIO (ÚNICA FUENTE DE VERDAD):
- Nombre real de la cuenta: "${accountName}"
- Fecha actual del sistema (hoy): ${todayIso} (${formatShortIsoDate(todayIso)})
- Año en curso: ${currentYear}
- Ayer: ${yesterdayIso} (${formatShortIsoDate(yesterdayIso)})
- Modalidad del mes: ${
    budgetMode === 'variable'
      ? 'Modo Freelancer (dinero agregado paulatinamente desde $ 0)'
      : 'Presupuesto fijo mensual'
  }
- Presupuesto base fijo: ${formatCop(baseBudget)} (${baseBudget} COP)
- Total de ingresos agregados paulatinamente: ${formatCop(totalIncome)} (${totalIncome} COP)
- Total de fondos del mes (presupuesto disponible total): ${formatCop(ctx.monthlyBudget)} (${ctx.monthlyBudget} COP)
- Total gastado en el mes: ${formatCop(ctx.totalSpent)} (${ctx.totalSpent} COP)
- Saldo disponible actual: ${formatCop(ctx.availableBalance)} (${ctx.availableBalance} COP)
- Total en espacio de Ahorros (separado del gasto mensual): ${formatCop(totalSaved)} (${totalSaved} COP)
- Alcancías de ahorro: ${savingsJson}
- Ingresos agregados registrados: ${incomesJson}
- Resumen de hoy (${formatShortIsoDate(todayIso)}): ${todayExpenses.length} gasto(s), total ${formatCop(todayTotal)}
- Resumen de ayer (${formatShortIsoDate(yesterdayIso)}): ${yesterdayExpenses.length} gasto(s), total ${formatCop(yesterdayTotal)}
- Lista completa de gastos reales registrados (orden cronológico reciente primero):
${expensesJson}

CATEGORÍAS VÁLIDAS PARA REGISTRAR GASTOS:
${VALID_CATEGORIES.join(', ')}

REGLAS OBLIGATORIAS:
1. IDENTIDAD Y TRATO:
   - Responde SIEMPRE llamando al usuario por el nombre real de su cuenta: "${accountName}". Nunca uses un nombre genérico ni inventado.
   - Sé breve, claro, amable y directo en español.
   - Usa formato de moneda colombiana COP con signo pesos, espacio y puntos de miles sin decimales (ej. "$ 15.000", "$ 1.993.000", "-$ 307.000").
   - Usa formato de fecha corta como "14 nov 2026" o "17 nov 2026".

2. CERO INVENCIÓN DE DATOS Y ALCANCE:
   - Responde únicamente con base en los datos reales recibidos arriba o lo que se observe/escuche claramente en la imagen o audio del usuario.
   - Si no hay registros para una fecha o consulta, dilo explícitamente e indica que el total fue "$ 0".
   - Si la pregunta, imagen o audio está fuera del alcance de "Tu billetera" (por ejemplo fotos de paisajes, selfies, memes, documentos sin relación con compras/gastos, cultura general, recetas, música o conversaciones que no tienen que ver con gastos o movimientos de Tu billetera), devuelve action="reply" respondiendo claramente a "${accountName}" que no puedes registrarlo porque esa imagen o audio no corresponde a un gasto o movimiento de **Tu billetera**, e indica qué sí puedes hacer.

3. IMÁGENES (TICKETS, RECIBOS, CAPTURAS DE COMPRA O APUNTES DE GASTO):
   - Cuando el usuario adjunte una imagen, analízala con cuidado buscando: (1) monto total pagado en COP, (2) fecha exacta de la compra y (3) descripción (comercio o concepto).
   - NUNCA inventes ni adivines un dato que esté cortado, borroso, ilegible o ausente.
   - Si falta cualquiera de los 3 datos (monto, fecha o descripción) o alguno está dudoso/ambiguo (por ejemplo, varios montos posibles o fecha poco legible), devuelve action="reply", menciona lo que sí lograste leer con claridad y pregunta específicamente por el dato faltante o dudoso para confirmarlo antes de guardar.
   - Si los 3 datos se leen con total claridad y el gasto corresponde a Tu billetera, aplica la Regla 5 (validación de presupuesto) antes de devolver action="create_expense".

4. AUDIO (NOTAS DE VOZ TRANSCRITAS):
   - Cuando recibas la transcripción de un audio del usuario, extrae monto, fecha y descripción (o responde la consulta si el usuario preguntó por su saldo, presupuesto o movimientos).
   - Si falta alguno de los 3 datos (monto, fecha o descripción) o quedó poco claro, NO inventes nada: devuelve action="reply" y pregunta específicamente por el dato faltante antes de guardar.
   - Si el audio no tiene que ver con gastos, ingresos o consultas de Tu billetera, responde que no puedes registrarlo.

5. REQUISITOS PARA GUARDAR UN GASTO O INGRESO Y VALIDACIÓN DE PRESUPUESTO:
   - Para registrar un GASTO o un INGRESO son obligatorios 3 datos: (1) monto en COP, (2) fecha y (3) descripción.
   - Si falta cualquiera de esos 3 datos, devuelve action="reply", NO guardes nada y pregunta específicamente por el dato que falta.
   - Si el usuario da una fecha sin año (ej. "15 de noviembre", "el 3 de este mes"), asume el año en curso (${currentYear}), conviértela a formato YYYY-MM-DD e indica explícitamente en tu respuesta la fecha completa y "(año en curso)".
   - Si usa fechas relativas como "hoy" (${todayIso}) o "ayer" (${yesterdayIso}), calcúlalas exactamente con la fecha del sistema.
   - Si el usuario reporta dinero que recibió / ingreso / pago de cliente y tiene los 3 datos, devuelve action="create_income" con el objeto income y confirma el nuevo saldo disponible (${formatCop(ctx.availableBalance)} + monto).
   - Para gastos, clasifica en la categoría más apropiada de la lista de categorías válidas; si no encaja claro en otra, usa "Otros".
   - Antes de recomendar una compra o guardar un gasto, calcula:
     saldo_resultante = ${ctx.availableBalance} - monto
   - Si saldo_resultante < 0 (deja el saldo disponible en negativo o empeora un saldo que ya es negativo):
     * En la primera solicitud: devuelve action="reply" (NO guardes automáticamente).
     * Advierte al usuario con las cifras reales: saldo disponible actual (${formatCop(ctx.availableBalance)}), monto de la compra y saldo en negativo resultante.
     * Recomienda explícitamente NO hacer la compra porque supera su presupuesto.
     * Pide confirmación explícita antes de guardarlo (por si ya realizó el gasto y aun así necesita registrarlo).
   - SOLO si el usuario confirma explícitamente DESPUÉS de haber recibido esa advertencia en un turno anterior de esta conversación (por ejemplo: "sí, regístralo", "confirmo", "ya lo compré, guárdalo"), devuelve action="create_expense" con los 3 datos y confirma el nuevo saldo resultante.
   - Si saldo_resultante >= 0 y tienes los 3 datos obligatorios (monto, fecha, descripción), devuelve action="create_expense" con el objeto expense completo y en "reply" confirma el registro indicando el nuevo saldo disponible (${formatCop(ctx.availableBalance)} - monto).

6. CONSULTAS SIMPLES:
   - Responde preguntas sobre presupuesto o dinero agregado del mes, saldo disponible, ahorros, gastos de un día específico (como ayer o hoy) o últimos movimientos usando solo los datos reales. Si hay movimientos en una fecha consultada, lístalos con su descripción y monto exacto más la suma total.`;
}

function userExplicitlyConfirmedOverBudget(messages: ChatMessageInput[]): boolean {
  if (messages.length < 2) return false;
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');
  if (!lastAssistant) return false;
  const textLower = lastAssistant.text.toLowerCase();
  return (
    textLower.includes('confirmas') ||
    textLower.includes('negativo') ||
    textLower.includes('no he guardado el movimiento')
  );
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.post('/api/assistant', async (req, res) => {
    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({
        error: 'Falta configurar GEMINI_API_KEY en el servidor.',
      });
      return;
    }

    const body = req.body as {
      messages?: ChatMessageInput[];
      context?: AssistantRequestContext;
      attachment?: AssistantAttachmentInput;
    };

    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const context = body?.context;
    const attachment = body?.attachment;

    if (!context || (messages.length === 0 && !attachment)) {
      res.status(400).json({
        error: 'Solicitud incompleta para el asistente.',
      });
      return;
    }

    try {
      let audioTranscript: string | undefined;
      let validatedImagePart: { inlineData: { mimeType: string; data: string } } | null = null;

      if (attachment) {
        const cleanBase64 = String(attachment.dataBase64 ?? '').trim();
        if (!cleanBase64) {
          res.status(400).json({ error: 'El archivo adjunto está vacío.' });
          return;
        }

        if (attachment.kind === 'audio') {
          const audioMime = normalizeMimeType(attachment.mimeType || '', 'audio');
          if (!audioMime) {
            res.status(400).json({
              error: 'Formato de audio no soportado. Usa MP3, WAV, M4A, OGG o WebM.',
            });
            return;
          }

          const transcribeResponse = await ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: audioMime,
                    data: cleanBase64,
                  },
                },
                {
                  text: 'Transcribe fielmente este audio en español. Si no hay voz audible, solo hay ruido o está vacío, responde exactamente: [AUDIO_VACIO]',
                },
              ],
            },
          });

          const rawTranscript = (transcribeResponse.text ?? '').trim();
          if (!rawTranscript || rawTranscript === '[AUDIO_VACIO]') {
            res.json({
              action: 'reply',
              transcript: '',
              reply: `${context.accountName}, no logré escuchar voz clara en el audio. ¿Puedes grabarlo de nuevo o escribirme el gasto?`,
            });
            return;
          }
          audioTranscript = rawTranscript;
        } else if (attachment.kind === 'image') {
          const imageMime = normalizeMimeType(attachment.mimeType || '', 'image');
          if (!imageMime) {
            res.status(400).json({
              error: 'Formato de imagen no soportado. Usa JPG, PNG, WebP o HEIC.',
            });
            return;
          }
          validatedImagePart = {
            inlineData: {
              mimeType: imageMime,
              data: cleanBase64,
            },
          };
        }
      }

      const systemInstruction = buildSystemInstruction(context);
      const contents = messages.map((msg, idx) => {
        const isLast = idx === messages.length - 1;
        const baseText = String(msg.text ?? '').trim();
        const historyTag =
          !isLast && msg.attachmentLabel ? `[${msg.attachmentLabel}] ` : '';

        if (isLast && msg.role === 'user') {
          const parts: Array<
            | { text: string }
            | { inlineData: { mimeType: string; data: string } }
          > = [];

          if (validatedImagePart) {
            parts.push(validatedImagePart);
            parts.push({
              text:
                baseText ||
                'Analiza esta imagen. Si es un recibo, ticket, captura de compra o apunte de gasto, extrae monto, fecha y descripción sin inventar ningún dato. Si falta algún dato o está dudoso, pregúntame antes de guardar. Si no tiene que ver con gastos de Tu billetera, responde que no puedes registrarlo.',
            });
          } else if (audioTranscript) {
            const combined = baseText
              ? `${baseText}\n[Transcripción de nota de voz del usuario]: "${audioTranscript}"`
              : `[Transcripción de nota de voz del usuario]: "${audioTranscript}"`;
            parts.push({ text: combined });
          } else {
            parts.push({ text: baseText });
          }

          return {
            role: 'user',
            parts,
          };
        }

        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: `${historyTag}${baseText}` }],
        };
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              action: {
                type: Type.STRING,
                enum: ['reply', 'create_expense', 'create_income'],
                description:
                  'Usa create_expense solo para registrar un gasto con monto, fecha y descripción claros y sin advertencia pendiente; usa create_income para registrar un ingreso recibido con los 3 datos; de lo contrario usa reply.',
              },
              reply: {
                type: Type.STRING,
                description: 'Respuesta breve y directa al usuario en español.',
              },
              expense: {
                type: Type.OBJECT,
                properties: {
                  amount: {
                    type: Type.INTEGER,
                    description: 'Monto entero positivo en COP.',
                  },
                  date: {
                    type: Type.STRING,
                    description: 'Fecha exacta en formato YYYY-MM-DD.',
                  },
                  description: {
                    type: Type.STRING,
                    description: 'Descripción corta del gasto (máximo 80 caracteres).',
                  },
                  category: {
                    type: Type.STRING,
                    enum: VALID_CATEGORIES,
                    description: 'Categoría válida del gasto.',
                  },
                },
                required: ['amount', 'date', 'description', 'category'],
              },
              income: {
                type: Type.OBJECT,
                properties: {
                  amount: {
                    type: Type.INTEGER,
                    description: 'Monto entero positivo en COP recibido.',
                  },
                  date: {
                    type: Type.STRING,
                    description: 'Fecha exacta en formato YYYY-MM-DD.',
                  },
                  description: {
                    type: Type.STRING,
                    description: 'Descripción corta del ingreso (máximo 80 caracteres).',
                  },
                },
                required: ['amount', 'date', 'description'],
              },
            },
            required: ['action', 'reply'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      let parsed: AssistantModelOutput;
      try {
        parsed = JSON.parse(rawText) as AssistantModelOutput;
      } catch {
        parsed = {
          action: 'reply',
          reply:
            rawText ||
            `${context.accountName}, no pude interpretar esa respuesta. Intenta formular tu consulta de nuevo.`,
        };
      }

      if (parsed.action === 'create_income' && parsed.income) {
        const roundedAmount = Math.round(Number(parsed.income.amount) || 0);
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.income.date ?? '');
        const cleanDescription = (parsed.income.description ?? '').trim().slice(0, 80);

        if (roundedAmount <= 0 || !validDate || !cleanDescription) {
          res.json({
            action: 'reply',
            ...(audioTranscript ? { transcript: audioTranscript } : {}),
            reply: parsed.reply,
          });
          return;
        }

        res.json({
          action: 'create_income',
          ...(audioTranscript ? { transcript: audioTranscript } : {}),
          reply: parsed.reply,
          income: {
            amount: roundedAmount,
            date: parsed.income.date,
            description: cleanDescription,
          },
        });
        return;
      }

      if (parsed.action === 'create_expense' && parsed.expense) {
        const roundedAmount = Math.round(Number(parsed.expense.amount) || 0);
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.expense.date ?? '');
        const cleanDescription = (parsed.expense.description ?? '').trim().slice(0, 80);

        if (roundedAmount <= 0 || !validDate || !cleanDescription) {
          res.json({
            action: 'reply',
            ...(audioTranscript ? { transcript: audioTranscript } : {}),
            reply: parsed.reply,
          });
          return;
        }

        const resultingBalance = context.availableBalance - roundedAmount;
        const putsOrWorsensNegative =
          resultingBalance < 0 || (context.availableBalance < 0 && roundedAmount > 0);

        if (putsOrWorsensNegative && !userExplicitlyConfirmedOverBudget(messages)) {
          res.json({
            action: 'reply',
            ...(audioTranscript ? { transcript: audioTranscript } : {}),
            reply: `${context.accountName}, tu saldo disponible actual es de **${formatCop(
              context.availableBalance
            )}**. Si gastas **${formatCop(
              roundedAmount
            )}**, tu saldo quedaría en negativo (**${formatCop(
              resultingBalance
            )}**). Te recomiendo **no hacer esta compra** porque supera tu presupuesto. No he guardado el movimiento; ¿confirmas que deseas registrarlo de todas formas?`,
          });
          return;
        }

        res.json({
          action: 'create_expense',
          ...(audioTranscript ? { transcript: audioTranscript } : {}),
          reply: parsed.reply,
          expense: {
            amount: roundedAmount,
            date: parsed.expense.date,
            description: cleanDescription,
            category: normalizeCategory(parsed.expense.category),
          },
        });
        return;
      }

      res.json({
        action: 'reply',
        ...(audioTranscript ? { transcript: audioTranscript } : {}),
        reply:
          parsed.reply ||
          `${context.accountName}, ¿en qué te puedo ayudar con Tu billetera?`,
      });
    } catch (error) {
      console.error('Error en /api/assistant:', error);
      res.status(500).json({
        error: 'No se pudo consultar al asistente en este momento. Intenta de nuevo.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Tu billetera servidor activo en puerto ${port}`);
  });
}

startServer();
