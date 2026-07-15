import { supabase } from '@/lib/supabase';
import type { HealthCategory, HealthFactInput } from './types';

export async function transcribeHealthAudio(recording: Blob, mime: string) {
  const extension = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('file', new File([recording], `registro-saude.${extension}`, { type: mime }));
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>('health-audio-transcribe', {
    body: form,
  });
  if (error || data?.error || !data?.text) throw new Error(await functionErrorMessage(error, data?.error, 'Falha ao transcrever áudio.'));
  return data.text;
}

export interface HealthPhotoProposal {
  title: string;
  category: HealthCategory;
  effective_date: string | null;
  narrative: string;
  facts: HealthFactInput[];
  warnings: string[];
}

export async function extractHealthPhoto(photo: File) {
  const form = new FormData();
  form.append('file', photo);
  const { data, error } = await supabase.functions.invoke<{ proposal?: HealthPhotoProposal; error?: string }>('health-photo-extract', {
    body: form,
  });
  if (error || data?.error || !data?.proposal) throw new Error(await functionErrorMessage(error, data?.error, 'Falha ao ler a foto.'));
  return data.proposal;
}

export interface HealthDocumentProposal {
  title: string;
  category: 'exam';
  effective_date: string | null;
  narrative: string;
  facts: HealthFactInput[];
  page_count: number;
  requires_manual_summary: boolean;
  warnings: string[];
  source_text_preview: string;
}

export async function uploadAndProcessHealthPdf(file: File) {
  const { data: upload, error: uploadError } = await supabase.functions.invoke<{
    document_id?: string;
    upload_url?: string;
    error?: string;
  }>('health-document-upload-url', {
    body: {
      filename: file.name,
      title: file.name.replace(/\.pdf$/i, ''),
      content_type: file.type,
      content_length: file.size,
    },
  });
  if (uploadError || upload?.error || !upload?.document_id || !upload.upload_url) {
    throw new Error(await functionErrorMessage(uploadError, upload?.error, 'Falha ao preparar o PDF.'));
  }
  const put = await fetch(upload.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  });
  if (!put.ok) throw new Error('Falha ao enviar o PDF para o armazenamento privado.');

  const { data: processed, error: processError } = await supabase.functions.invoke<{
    proposal?: HealthDocumentProposal;
    used_ai?: boolean;
    error?: string;
  }>('health-document-process', { body: { document_id: upload.document_id } });
  if (processError || processed?.error || !processed?.proposal) {
    throw new Error(await functionErrorMessage(processError, processed?.error, 'Falha ao processar o PDF.'));
  }
  return { documentId: upload.document_id, proposal: processed.proposal, usedAi: Boolean(processed.used_ai) };
}

export async function getHealthDocumentUrl(documentId: string) {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>('health-document-download-url', {
    body: { document_id: documentId },
  });
  if (error || data?.error || !data?.url) throw new Error(await functionErrorMessage(error, data?.error, 'Falha ao abrir o PDF.'));
  return data.url;
}

async function functionErrorMessage(error: unknown, nested: string | undefined, fallback: string) {
  if (nested) return nested;
  const context = (error as { context?: { json?: () => Promise<{ error?: string }> } } | null)?.context;
  if (context?.json) {
    try {
      const body = await context.json();
      if (body.error) return body.error;
    } catch {
      // A resposta pode já ter sido consumida pela biblioteca.
    }
  }
  const message = error instanceof Error ? error.message : '';
  return message && !message.includes('non-2xx') ? message : fallback;
}
