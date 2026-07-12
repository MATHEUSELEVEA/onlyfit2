import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner'

import { getCorsHeaders } from '../_shared/cors.ts'

const PUBLIC_BUCKETS = ['onlyfit-media', 'onlyfit-thumbnails', 'onlyfit-avatar'] as const
const PRIVATE_BUCKETS = ['onlyfit-private'] as const
type PublicBucket = (typeof PUBLIC_BUCKETS)[number]
type PrivateBucket = (typeof PRIVATE_BUCKETS)[number]

// ── Limits per public bucket ────────────────────────────────────────────────
const PUBLIC_MAX_BYTES: Record<PublicBucket, number> = {
  'onlyfit-media': 2 * 1024 * 1024 * 1024,       // 2 GB
  'onlyfit-thumbnails': 20 * 1024 * 1024,          // 20 MB
  'onlyfit-avatar': 10 * 1024 * 1024,              // 10 MB
}

// ── Private document config ─────────────────────────────────────────────────
const DOC_MIME_ALLOWLIST: Record<string, string[]> = {
  anamnesis: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  exam: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  medical_report: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  other: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'],
}
const DOC_MAX_BYTES: Record<string, number> = {
  anamnesis: 15 * 1024 * 1024,
  exam: 15 * 1024 * 1024,
  medical_report: 15 * 1024 * 1024,
  other: 8 * 1024 * 1024,
}

const PUBLIC_MIME_ALLOWLIST: Record<PublicBucket, string[]> = {
  'onlyfit-media': [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v',
    'video/ogg',
    'application/vnd.apple.mpegurl',
    'application/pdf',
  ],
  'onlyfit-thumbnails': [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
  ],
  'onlyfit-avatar': [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
  ],
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function errorResponse(req: Request, message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    status,
  })
}

function getFileExtension(filename: string, fallback = 'bin') {
  const parts = filename.split('.').filter(Boolean)
  if (parts.length < 2) return fallback
  return parts.at(-1) ?? fallback
}

function guessMimeFromFilename(filename: string): string {
  const ext = getFileExtension(filename, '').toLowerCase()
  if (!ext) return 'application/octet-stream'

  // Images
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'avif') return 'image/avif'
  if (ext === 'heic' || ext === 'heif') return 'image/heic'

  // Video
  if (ext === 'mp4') return 'video/mp4'
  if (ext === 'webm') return 'video/webm'
  if (ext === 'mov') return 'video/quicktime'
  if (ext === 'm4v') return 'video/x-m4v'
  if (ext === 'ogg') return 'video/ogg'
  if (ext === 'm3u8') return 'application/vnd.apple.mpegurl'

  // Docs
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'txt') return 'text/plain'

  return 'application/octet-stream'
}

function normalizeMime(mime: string): string {
  const normalized = String(mime || '').trim().toLowerCase()
  return normalized || 'application/octet-stream'
}

async function readUploadPayload(req: Request) {
  const contentTypeHeader = req.headers.get('content-type') ?? ''
  const isMultipart = contentTypeHeader.includes('multipart/form-data')

  if (isMultipart) {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      throw Object.assign(new Error('file is required'), { code: 'VALIDATION' })
    }

    const inferredFromName = guessMimeFromFilename(file.name ?? '')
    return {
      isMultipart,
      file,
      filename: String(formData.get('filename') ?? file.name ?? '').trim(),
      content_type: String(formData.get('content_type') ?? file.type ?? inferredFromName ?? 'application/octet-stream').trim(),
      target_bucket: String(formData.get('target_bucket') ?? '').trim(),
      tenant_id: String(formData.get('tenant_id') ?? '').trim(),
      doc_kind: String(formData.get('doc_kind') ?? '').trim(),
      content_length: Number(formData.get('content_length') ?? file.size ?? 0),
    }
  }

  const body = await req.json()
  const filename = String(body.filename ?? '').trim()
  const inferredFromName = guessMimeFromFilename(filename)
  return {
    isMultipart,
    file: null,
    filename,
    content_type: String(body.content_type ?? inferredFromName ?? '').trim(),
    target_bucket: String(body.target_bucket ?? '').trim(),
    tenant_id: String(body.tenant_id ?? '').trim(),
    doc_kind: String(body.doc_kind ?? '').trim(),
    content_length: Number(body.content_length ?? 0),
  }
}

function getR2Client() {
  const accountId = Deno.env.get('R2_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw Object.assign(
      new Error('Server misconfiguration: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must be set'),
      { code: 'CONFIG' }
    );
  }

  return {
    accountId,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
  }
}

function logStructured(event: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse(req, 'Authorization header required', 401)
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      return errorResponse(req, authError?.message || 'Invalid or expired token', 401)
    }

    // ── Parse payload ─────────────────────────────────────────────────────
    const { isMultipart, file, filename, content_type, target_bucket, tenant_id, doc_kind, content_length } = await readUploadPayload(req)

    if (!filename) {
      return errorResponse(req, 'filename is required', 400)
    }

    const normalizedMime = normalizeMime(content_type)

    const trimmedTenant = typeof tenant_id === 'string' ? tenant_id.trim() : ''
    const tenantId = trimmedTenant.length > 0 ? trimmedTenant : user.id

    const bucketName = target_bucket || 'onlyfit-media';

    // ── Validate bucket ───────────────────────────────────────────────────
    const isPublic = (PUBLIC_BUCKETS as readonly string[]).includes(bucketName)
    const isPrivate = (PRIVATE_BUCKETS as readonly string[]).includes(bucketName)
    if (!isPublic && !isPrivate) {
      return errorResponse(req, `Invalid bucket name: ${bucketName}`, 400)
    }

    // ── Validate MIME ─────────────────────────────────────────────────────
    if (isPrivate) {
      const kind = typeof doc_kind === 'string' && doc_kind in DOC_MIME_ALLOWLIST ? doc_kind : 'other'
      const allowlist = DOC_MIME_ALLOWLIST[kind]
      if (!allowlist.includes(normalizedMime)) {
        return errorResponse(req, `MIME type not allowed for ${kind}: ${normalizedMime}`, 400)
      }
    } else {
      const allowlist = PUBLIC_MIME_ALLOWLIST[bucketName as PublicBucket]
      if (allowlist && !allowlist.includes(normalizedMime)) {
        return errorResponse(req, `MIME type not allowed for ${bucketName}: ${normalizedMime}`, 400)
      }
    }

    // ── Validate size ─────────────────────────────────────────────────────
    const size = Number(content_length ?? 0)
    if (Number.isFinite(size) && size > 0) {
      if (isPrivate) {
        const kind = typeof doc_kind === 'string' && doc_kind in DOC_MAX_BYTES ? doc_kind : 'other'
        const maxBytes = DOC_MAX_BYTES[kind]
        if (size > maxBytes) {
          return errorResponse(req, `File exceeds limit for ${kind}. Max ${Math.floor(maxBytes / (1024 * 1024))}MB`, 413)
        }
      } else {
        const maxBytes = PUBLIC_MAX_BYTES[bucketName as PublicBucket]
        if (maxBytes && size > maxBytes) {
          return errorResponse(req, `File exceeds limit for ${bucketName}. Max ${Math.floor(maxBytes / (1024 * 1024))}MB`, 413)
        }
      }
    }

    // ── Build object key ──────────────────────────────────────────────────
    const { accountId, client: S3 } = getR2Client()
    const fileExt = getFileExtension(filename, normalizedMime.startsWith('image/') ? 'jpg' : 'bin')
    const objectKey = `${tenantId}/${user.id}/${crypto.randomUUID()}.${fileExt}`.replace(/\/+/g, '/').replace(/^\//, '')

    // ── Upload: multipart (direct) or presigned URL ───────────────────────
    let uploadUrl = ''
    if (isMultipart) {
      await S3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: file.stream(),
        ContentType: normalizedMime,
      }))
    } else {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        ContentType: normalizedMime,
      })

      // 1800s = 30min — large video uploads may take several minutes
      uploadUrl = await getSignedUrl(S3, command, { expiresIn: 1800 })
    }

    // ── Build public URL ──────────────────────────────────────────────────
    const domainByBucket: Record<string, string> = {
      'onlyfit-media': Deno.env.get('R2_PUBLIC_DOMAIN_MEDIA') ?? Deno.env.get('R2_PUBLIC_DOMAIN') ?? '',
      'onlyfit-avatar': Deno.env.get('R2_PUBLIC_DOMAIN_AVATARS') ?? Deno.env.get('R2_PUBLIC_DOMAIN') ?? '',
      'onlyfit-thumbnails': Deno.env.get('R2_PUBLIC_DOMAIN_THUMBNAILS') ?? Deno.env.get('R2_PUBLIC_DOMAIN') ?? '',
    }
    let finalPublicUrl = '';
    if (isPublic) {
      const raw = domainByBucket[bucketName] ?? Deno.env.get('R2_PUBLIC_DOMAIN');
      if (raw) {
        const base = raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw}`;
        finalPublicUrl = `${base}/${objectKey}`;
      } else {
        if (bucketName === 'onlyfit-avatar') {
          return errorResponse(req,
            'R2_PUBLIC_DOMAIN_AVATARS nao configurado. Defina o secret no Supabase (Dashboard > Edge Functions > create-r2-upload-url > Secrets) com a URL publica do bucket de avatares (ex: https://pub-xxx.r2.dev).',
            500
          );
        }
        finalPublicUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${objectKey}`;
      }
    }

    logStructured({
      msg: 'create-r2-upload-url',
      user_id: user.id,
      bucket: bucketName,
      is_multipart: isMultipart,
      mime: normalizedMime,
      bytes: Number.isFinite(size) ? size : undefined,
      object_key: objectKey,
      status: 200,
    })

    return new Response(
      JSON.stringify({
        uploadUrl,
        publicUrl: finalPublicUrl,
        objectKey,
        bucket: bucketName,
        uploaded: isMultipart,
        contentType: normalizedMime,
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: unknown) {
    const errObj = error as Error & { code?: string };
    const status = errObj.code === 'VALIDATION' ? 400
      : errObj.code === 'CONFIG' ? 500
      : 500;

    logStructured({
      msg: 'create-r2-upload-url:error',
      error: errObj.message || 'Unknown error',
      code: errObj.code ?? 'UNEXPECTED',
      status,
    })

    return errorResponse(req, errObj.message || 'Internal server error', status)
  }
})
