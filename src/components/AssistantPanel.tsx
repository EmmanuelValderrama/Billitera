import {
  CheckCircle2,
  FileAudio,
  ImagePlus,
  Maximize2,
  Mic,
  Minus,
  Send,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { ChangeEvent, FormEvent, Fragment, ReactNode, useEffect, useRef, useState } from 'react';
import {
  BudgetMode,
  Expense,
  ExpenseCategory,
  IncomeEntry,
  getExpenseTotalAmount,
} from '../data/walletData';
import { ExpenseWriteInput, IncomeWriteInput } from '../services/walletStore';

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imagePreviewUrl?: string;
  audioLabel?: string;
  transcript?: string;
  attachmentLabel?: string;
  savedExpenseSummary?: string;
}

export interface AssistantSavingsGoalSummary {
  id: string;
  name: string;
  savedAmount: number;
  targetAmount?: number;
}

interface PendingAttachment {
  kind: 'image' | 'audio';
  mimeType: string;
  dataBase64: string;
  previewUrl?: string;
  fileName: string;
  durationSec?: number;
}

interface AssistantPanelProps {
  isOpen: boolean;
  isMinimized: boolean;
  accountName: string;
  budgetMode: BudgetMode;
  baseBudget: number;
  totalIncome: number;
  monthlyBudget: number;
  totalSpent: number;
  availableBalance: number;
  expenses: Expense[];
  incomes: IncomeEntry[];
  totalSaved: number;
  savingsGoals: AssistantSavingsGoalSummary[];
  messages: AssistantChatMessage[];
  onSetMessages: (updater: (prev: AssistantChatMessage[]) => AssistantChatMessage[]) => void;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
  onRegisterExpense: (input: ExpenseWriteInput) => Promise<void>;
  onRegisterIncome: (input: IncomeWriteInput) => Promise<void>;
}

function getLocalSystemIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderFormattedText(text: string): ReactNode {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <Fragment key={lineIdx}>
        {parts.map((part, partIdx) => {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return (
              <strong key={partIdx} className="font-semibold text-zinc-50">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <Fragment key={partIdx}>{part}</Fragment>;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </Fragment>
    );
  });
}

function readBlobAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(blob);
  });
}

async function prepareImageAttachment(file: File): Promise<PendingAttachment> {
  const previewUrl = URL.createObjectURL(file);

  // Redimensionar imágenes grandes para que la respuesta de Gemini sea rápida
  if (file.type !== 'image/heic' && file.type !== 'image/heif') {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
        el.src = previewUrl;
      });

      const maxDim = 1400;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      if (scale < 1 || file.size > 1_500_000) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const base64 = dataUrl.split(',')[1] ?? '';
          return {
            kind: 'image',
            mimeType: 'image/jpeg',
            dataBase64: base64,
            previewUrl: dataUrl,
            fileName: file.name || 'recibo.jpg',
          };
        }
      }
    } catch {
      // Fallback a lectura directa si el navegador no decodifica en canvas
    }
  }

  const base64 = await readBlobAsBase64(file);
  const dataUrl = `data:${file.type || 'image/jpeg'};base64,${base64}`;
  URL.revokeObjectURL(previewUrl);
  return {
    kind: 'image',
    mimeType: file.type || 'image/jpeg',
    dataBase64: base64,
    previewUrl: dataUrl,
    fileName: file.name || 'imagen.jpg',
  };
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function AssistantPanel({
  isOpen,
  isMinimized,
  accountName,
  budgetMode,
  baseBudget,
  totalIncome,
  monthlyBudget,
  totalSpent,
  availableBalance,
  expenses,
  incomes,
  totalSaved,
  savingsGoals,
  messages,
  onSetMessages,
  onMinimize,
  onRestore,
  onClose,
  onRegisterExpense,
  onRegisterIncome,
}: AssistantPanelProps) {
  const [inputText, setInputText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingSecondsRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isSending, isOpen, isMinimized]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }
      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div
        role="region"
        aria-label="Asistente minimizado"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 w-[280px] bg-gradient-to-br from-[#1b1d22] via-[#131418] to-[#181a20] border border-white/[0.14] shadow-2xl rounded-xl px-4 py-3 flex items-center justify-between gap-3"
      >
        <button
          type="button"
          onClick={onRestore}
          className="flex items-center gap-2 text-left min-w-0 cursor-pointer group"
        >
          <Sparkles className="w-4 h-4 text-[#10d47e] shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-display text-sm font-medium text-zinc-50 group-hover:text-white truncate">
              Asistente
            </p>
            <p className="text-[11px] text-zinc-400 truncate">
              {messages.length > 0
                ? `${messages.length} mensaje${messages.length === 1 ? '' : 's'} en sesión`
                : accountName}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onRestore}
            aria-label="Abrir chat del asistente"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar asistente"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  async function handleImageSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 12_000_000) {
      setErrorMsg('La imagen es muy pesada (máximo 12 MB).');
      return;
    }

    setErrorMsg('');
    try {
      const prepared = await prepareImageAttachment(file);
      setPendingAttachment(prepared);
    } catch {
      setErrorMsg('No se pudo cargar la imagen seleccionada.');
    }
  }

  async function handleAudioFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 10_000_000) {
      setErrorMsg('El archivo de audio es muy pesado (máximo 10 MB).');
      return;
    }

    setErrorMsg('');
    try {
      const base64 = await readBlobAsBase64(file);
      setPendingAttachment({
        kind: 'audio',
        mimeType: file.type || 'audio/mp3',
        dataBase64: base64,
        fileName: file.name || 'nota-de-voz.mp3',
      });
    } catch {
      setErrorMsg('No se pudo leer el archivo de audio.');
    }
  }

  async function handleStartRecording() {
    if (isRecording || isSending) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMsg('Tu navegador no permite grabar audio. Puedes subir un archivo de audio.');
      return;
    }

    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg',
      ];
      const supportedType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        if (recordingTimerRef.current) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        if (mediaStreamRef.current) {
          for (const track of mediaStreamRef.current.getTracks()) {
            track.stop();
          }
          mediaStreamRef.current = null;
        }

        const recordedMime = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedMime });
        audioChunksRef.current = [];
        setIsRecording(false);

        if (audioBlob.size < 200) {
          setErrorMsg('La grabación quedó vacía. Intenta hablar más cerca del micrófono.');
          return;
        }

        try {
          const base64 = await readBlobAsBase64(audioBlob);
          setPendingAttachment({
            kind: 'audio',
            mimeType: recordedMime,
            dataBase64: base64,
            fileName: 'Nota de voz',
            durationSec: Math.max(recordingSecondsRef.current, 1),
          });
        } catch {
          setErrorMsg('No se pudo procesar la nota de voz grabada.');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);

      recordingTimerRef.current = window.setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
        if (recordingSecondsRef.current >= 90 && mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 1000);
    } catch {
      setErrorMsg('No se pudo acceder al micrófono. Revisa los permisos o sube un archivo de audio.');
      setIsRecording(false);
    }
  }

  function handleStopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = inputText.trim();
    if ((!trimmed && !pendingAttachment) || isSending || isRecording) return;

    const currentAttachment = pendingAttachment;
    const attachmentLabel = currentAttachment
      ? currentAttachment.kind === 'image'
        ? `Imagen adjunta: ${currentAttachment.fileName}`
        : `Nota de voz adjunta: ${currentAttachment.fileName}`
      : undefined;

    const userMsgId = `msg-u-${Date.now()}`;
    const userMsg: AssistantChatMessage = {
      id: userMsgId,
      role: 'user',
      text: trimmed,
      ...(currentAttachment?.kind === 'image'
        ? { imagePreviewUrl: currentAttachment.previewUrl }
        : {}),
      ...(currentAttachment?.kind === 'audio'
        ? {
            audioLabel: currentAttachment.durationSec
              ? `Nota de voz (${formatDuration(currentAttachment.durationSec)})`
              : currentAttachment.fileName,
          }
        : {}),
      ...(attachmentLabel ? { attachmentLabel } : {}),
    };

    const nextHistory = [...messages, userMsg];
    onSetMessages(() => nextHistory);
    setInputText('');
    setPendingAttachment(null);
    setErrorMsg('');
    setIsSending(true);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({
            role: m.role,
            text: m.transcript ? `${m.text ? `${m.text}\n` : ''}[Audio]: "${m.transcript}"` : m.text,
            ...(m.attachmentLabel ? { attachmentLabel: m.attachmentLabel } : {}),
          })),
          ...(currentAttachment
            ? {
                attachment: {
                  kind: currentAttachment.kind,
                  mimeType: currentAttachment.mimeType,
                  dataBase64: currentAttachment.dataBase64,
                  fileName: currentAttachment.fileName,
                },
              }
            : {}),
          context: {
            accountName,
            currentDateIso: getLocalSystemIsoDate(),
            budgetMode,
            baseBudget,
            totalIncome,
            monthlyBudget,
            totalSpent,
            availableBalance,
            incomes: incomes.map((inc) => ({
              id: inc.id,
              amount: inc.amount,
              date: inc.date,
              description: inc.description,
            })),
            totalSaved,
            savingsGoals,
            expenses: expenses.map((exp) => ({
              id: exp.id,
              amount: exp.amount,
              totalAmount: getExpenseTotalAmount(exp),
              date: exp.date,
              description: exp.description,
              category: exp.category,
              paymentType: exp.paymentType,
              cardLabel: exp.cardLabel,
              installmentMonths: exp.installmentMonths,
              interestRatePercent: exp.interestRatePercent,
            })),
          },
        }),
      });

      const data = (await response.json()) as {
        action?: 'reply' | 'create_expense' | 'create_income';
        reply?: string;
        transcript?: string;
        expense?: {
          amount: number;
          date: string;
          description: string;
          category: ExpenseCategory;
        };
        income?: {
          amount: number;
          date: string;
          description: string;
        };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo conectar con el asistente.');
      }

      if (data.transcript) {
        onSetMessages((prev) =>
          prev.map((m) =>
            m.id === userMsgId
              ? {
                  ...m,
                  transcript: data.transcript,
                  attachmentLabel: `Audio transcrito: "${data.transcript}"`,
                }
              : m
          )
        );
      }

      if (data.action === 'create_expense' && data.expense) {
        await onRegisterExpense({
          amount: Math.round(data.expense.amount),
          date: data.expense.date,
          description: data.expense.description,
          category: data.expense.category,
          paymentType: 'single',
        });

        const assistantMsg: AssistantChatMessage = {
          id: `msg-a-${Date.now()}`,
          role: 'assistant',
          text: data.reply || `Listo, ${accountName}. Movimiento registrado.`,
          savedExpenseSummary: `${data.expense.description} · ${data.expense.category}`,
        };
        onSetMessages((prev) => [...prev, assistantMsg]);
      } else if (data.action === 'create_income' && data.income) {
        await onRegisterIncome({
          amount: Math.round(data.income.amount),
          date: data.income.date,
          description: data.income.description,
        });

        const assistantMsg: AssistantChatMessage = {
          id: `msg-a-${Date.now()}`,
          role: 'assistant',
          text: data.reply || `Listo, ${accountName}. Ingreso agregado a Tu billetera.`,
          savedExpenseSummary: `${data.income.description} · Ingreso`,
        };
        onSetMessages((prev) => [...prev, assistantMsg]);
      } else {
        const assistantMsg: AssistantChatMessage = {
          id: `msg-a-${Date.now()}`,
          role: 'assistant',
          text:
            data.reply ||
            `${accountName}, ¿en qué te puedo ayudar con Tu billetera?`,
        };
        onSetMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al consultar al asistente.';
      setErrorMsg(msg);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <aside
      role="dialog"
      aria-label="Asistente de Tu billetera"
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 w-[calc(100vw-2rem)] sm:w-[410px] h-[540px] max-h-[calc(100vh-5.5rem)] flex flex-col bg-gradient-to-br from-[#1b1d22] via-[#131418] to-[#181a20] border border-white/[0.14] shadow-2xl rounded-xl overflow-hidden"
    >
      {/* Cabecera */}
      <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0 bg-[#14161b]/90">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-400/[0.12] border border-emerald-400/35 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-[#10d47e]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base font-medium text-zinc-50 leading-tight">
              Asistente
            </h2>
            <p className="text-[11px] text-zinc-400 truncate">
              Cuenta activa: {accountName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Minimizar asistente"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar asistente"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Área de mensajes (en memoria, sin persistencia) */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5 text-sm">
        {messages.length === 0 ? (
          <div className="rounded-xl bg-[#0b0c10] border border-white/[0.08] p-4 space-y-2">
            <p className="text-zinc-200 leading-relaxed">
              Hola, <strong className="font-semibold text-zinc-50">{accountName}</strong>.
              Escríbeme, sube la foto de un recibo o ticket, o graba/carga una nota de voz para
              registrar gastos o consultar tu saldo disponible.
            </p>
            <p className="text-xs text-zinc-500">
              Esta conversación vive solo en memoria y no se guarda al cerrar o recargar.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-xl px-3.5 py-2.5 leading-relaxed space-y-2 ${
                    isUser
                      ? 'bg-[#10d47e]/15 border border-[#10d47e]/35 text-zinc-100'
                      : 'bg-[#0b0c10] border border-white/[0.08] text-zinc-300'
                  }`}
                >
                  {msg.imagePreviewUrl && (
                    <img
                      src={msg.imagePreviewUrl}
                      alt="Comprobante adjunto"
                      className="max-h-40 w-auto rounded-lg border border-white/[0.1] object-contain"
                    />
                  )}

                  {msg.audioLabel && (
                    <div className="flex items-center gap-2 text-xs text-emerald-300">
                      <FileAudio className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{msg.audioLabel}</span>
                    </div>
                  )}

                  {msg.transcript && (
                    <p className="text-xs italic text-zinc-300 border-l-2 border-emerald-400/50 pl-2">
                      “{msg.transcript}”
                    </p>
                  )}

                  {msg.text && (
                    <p className="text-[13.5px] whitespace-pre-wrap break-words">
                      {renderFormattedText(msg.text)}
                    </p>
                  )}

                  {msg.savedExpenseSummary && (
                    <div className="pt-2 border-t border-white/[0.08] flex items-center gap-1.5 text-[11px] text-[#10d47e]">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        Guardado en Tu billetera · {msg.savedExpenseSummary}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {isSending && (
          <div className="flex items-start">
            <div className="rounded-xl px-3.5 py-2.5 bg-[#0b0c10] border border-white/[0.08] text-xs text-zinc-400">
              Analizando tu solicitud...
            </div>
          </div>
        )}

        {errorMsg && (
          <p role="alert" className="text-xs text-[#e07a73] px-1">
            {errorMsg}
          </p>
        )}

        <div ref={scrollEndRef} />
      </div>

      {/* Previsualización de archivo o grabación activa */}
      {(pendingAttachment || isRecording) && (
        <div className="px-3 py-2 border-t border-white/[0.08] bg-[#121318] flex items-center justify-between gap-2 shrink-0">
          {isRecording ? (
            <div className="flex items-center justify-between w-full gap-2">
              <div className="flex items-center gap-2 text-xs text-[#e07a73]">
                <span className="w-2 h-2 rounded-full bg-[#e07a73] animate-pulse" />
                <span>Grabando nota de voz... {formatDuration(recordingSeconds)}</span>
              </div>
              <button
                type="button"
                onClick={handleStopRecording}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#e07a73] hover:bg-[#ea8d87] text-[#1f0908] text-xs font-semibold cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                <span>Detener</span>
              </button>
            </div>
          ) : pendingAttachment ? (
            <div className="flex items-center justify-between w-full gap-2 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {pendingAttachment.kind === 'image' && pendingAttachment.previewUrl ? (
                  <img
                    src={pendingAttachment.previewUrl}
                    alt="Vista previa"
                    className="w-9 h-9 rounded-md object-cover border border-white/[0.12] shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-md bg-emerald-400/[0.12] border border-emerald-400/35 flex items-center justify-center shrink-0">
                    <FileAudio className="w-4 h-4 text-[#10d47e]" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-100 truncate">
                    {pendingAttachment.fileName}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {pendingAttachment.kind === 'image'
                      ? 'Imagen lista para analizar'
                      : pendingAttachment.durationSec
                        ? `Audio grabado (${formatDuration(pendingAttachment.durationSec)})`
                        : 'Audio listo para transcribir'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSending}
                onClick={() => setPendingAttachment(null)}
                aria-label="Quitar archivo adjunto"
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Barra de entrada multimodal: texto + imagen + audio (grabar o cargar) */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-white/[0.08] bg-[#0f1014] flex items-center gap-1.5 shrink-0"
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelected}
          className="hidden"
          aria-hidden="true"
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          onChange={handleAudioFileSelected}
          className="hidden"
          aria-hidden="true"
        />

        <button
          type="button"
          disabled={isSending || isRecording}
          onClick={() => imageInputRef.current?.click()}
          aria-label="Subir foto de recibo o ticket"
          title="Subir imagen o recibo"
          className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-zinc-300 hover:text-emerald-300 transition-colors cursor-pointer disabled:opacity-40 shrink-0"
        >
          <ImagePlus className="w-4 h-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          disabled={isSending}
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          aria-label={isRecording ? 'Detener grabación de voz' : 'Grabar nota de voz'}
          title={isRecording ? 'Detener grabación' : 'Grabar nota de voz'}
          className={`p-2 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 shrink-0 ${
            isRecording
              ? 'bg-[#e07a73]/20 border-[#e07a73]/60 text-[#e07a73]'
              : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-zinc-300 hover:text-emerald-300'
          }`}
        >
          {isRecording ? (
            <Square className="w-4 h-4 fill-current" aria-hidden="true" />
          ) : (
            <Mic className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          disabled={isSending || isRecording}
          onClick={() => audioInputRef.current?.click()}
          aria-label="Cargar archivo de audio"
          title="Cargar nota de voz"
          className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-zinc-300 hover:text-emerald-300 transition-colors cursor-pointer disabled:opacity-40 shrink-0"
        >
          <FileAudio className="w-4 h-4" aria-hidden="true" />
        </button>

        <input
          ref={inputRef}
          type="text"
          disabled={isSending || isRecording}
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            if (errorMsg) setErrorMsg('');
          }}
          placeholder={
            pendingAttachment
              ? 'Agrega una nota opcional o envía...'
              : 'Escribe, sube recibo o graba audio...'
          }
          aria-label="Mensaje para el asistente"
          className="flex-1 min-w-0 bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-colors disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={isSending || isRecording || (!inputText.trim() && !pendingAttachment)}
          aria-label="Enviar al asistente"
          className="p-2.5 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] disabled:opacity-40 text-[#042415] transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <Send className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
        </button>
      </form>
    </aside>
  );
}
