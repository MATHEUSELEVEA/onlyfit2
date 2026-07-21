import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { CameraStep } from './camera/CameraStep';
import { createDraftMedia, inferMediaKind, moveItem, type CaptureMode, type DraftMedia, type MediaKind } from './media';
import { enqueuePublish } from './publishQueue';
import type { PostVisibility } from './useCreatePost';
import { usePublishStory } from '@/features/stories/usePublishStory';
import { useMyProfile } from '@/features/profile/useMyProfile';
import { PickMediaStep } from './steps/PickMediaStep';
import { DetailsStep } from './steps/DetailsStep';

type Step = 'camera' | 'pick' | 'details';

// Estúdio de criação de post. Fluxo em passos (câmera → revisão → detalhes →
// publicar), propositalmente segregado em features/studio para evoluir depois
// com edição, filtros, música e melhorias por IA sem mexer no resto do app.
export function StudioPage() {
  const navigate = useNavigate();
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const publishStory = usePublishStory();
  // Só Profissional publica para assinantes; Membro só publica conteúdo público.
  const isProfessional = profile?.isProfessional ?? false;

  const [step, setStep] = useState<Step>('camera');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');
  const [media, setMedia] = useState<DraftMedia[]>([]);
  const [caption, setCaption] = useState('');
  const [sports, setSports] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  // Última mídia de story capturada/escolhida, guardada só para o "tentar de
  // novo" reenviar o mesmo arquivo se o upload falhar.
  const [pendingStory, setPendingStory] = useState<{ file: File; kind: MediaKind } | null>(null);

  // Guarda se a publicação já foi enfileirada — nesse caso os object URLs dos
  // previews continuam em uso pelo post otimista no feed, e a revogação
  // definitiva passa a ser responsabilidade do publishQueue (sucesso/erro).
  const publishedRef = useRef(false);

  // Revoga os object URLs dos previews ao desmontar, evitando vazamento — mas
  // só se a publicação não foi enfileirada (ver publishedRef acima).
  useEffect(() => {
    return () => {
      if (publishedRef.current) return;
      media.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (files: FileList) => {
    const drafts = Array.from(files)
      .map(createDraftMedia)
      .filter((draft): draft is DraftMedia => draft !== null);
    if (drafts.length) setMedia((prev) => [...prev, ...drafts]);
  };

  const addCapturedMedia = (draft: DraftMedia) => {
    setMedia((prev) => [...prev, draft]);
    setStep('pick');
  };

  // Publica um story direto (a partir da câmera ou da galeria, no modo
  // Stories): sobe a mídia e cria o story no banco, depois volta ao feed —
  // onde o story aparece como mais um item, com o relógio de 24h. Story é
  // sempre público neste fluxo rápido (sem tela de opções, como no Instagram).
  const submitStory = (input: { file: File; kind: MediaKind }) => {
    setPendingStory(input);
    publishStory.mutate(
      { file: input.file, kind: input.kind, visibility: 'public' },
      {
        onSuccess: () => {
          setPendingStory(null);
          navigate('/feed', { replace: true });
        },
      },
    );
  };

  const handleCameraCapture = (draft: DraftMedia) => {
    if (captureMode === 'stories') {
      // O story não usa o previewUrl do draft (publica direto), então revoga já.
      URL.revokeObjectURL(draft.previewUrl);
      submitStory({ file: draft.file, kind: draft.kind });
      return;
    }
    addCapturedMedia(draft);
  };

  const handleGalleryFiles = (files: FileList) => {
    if (captureMode === 'stories') {
      const file = files[0];
      const kind = file ? inferMediaKind(file) : null;
      if (file && kind) submitStory({ file, kind });
      return;
    }
    addFiles(files);
    setStep('pick');
  };

  const retryStory = () => {
    if (pendingStory) submitStory(pendingStory);
  };

  const dismissStoryError = () => {
    publishStory.reset();
    setPendingStory(null);
  };

  const removeMedia = (id: string) => {
    setMedia((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const reorderMedia = (from: number, to: number) => {
    setMedia((prev) => moveItem(prev, from, to));
  };

  const toggleSport = (key: string) => {
    setSports((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  };

  const publish = (): boolean => {
    if (!profile || media.length === 0) return false;
    publishedRef.current = true;
    // enqueuePublish insere o post otimista no feed e sobe a mídia em
    // background — não espera nada, então a navegação é imediata (o post
    // ainda não existe no banco, por isso não navegamos mais para /video/:id).
    enqueuePublish(
      // Trava servidor-agnóstica: Membro nunca envia paid_members.
      { media, caption, sports, visibility: isProfessional ? visibility : 'public' },
      profile,
    );
    navigate('/feed', { replace: true });
    return true;
  };

  const close = () => {
    if (step === 'details') setStep('pick');
    else if (step === 'pick') setStep('camera');
    else navigate(-1);
  };

  if (step === 'camera') {
    return (
      <CameraStep
        mode={captureMode}
        onModeChange={setCaptureMode}
        onCapturedPhoto={handleCameraCapture}
        onCapturedVideo={handleCameraCapture}
        onGalleryFiles={handleGalleryFiles}
        onClose={() => navigate(-1)}
        storyPublishing={publishStory.isPending}
        storyError={publishStory.isError ? 'Verifique sua conexão e tente novamente.' : null}
        onRetryStory={retryStory}
        onDismissStoryError={dismissStoryError}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex items-center gap-3 border-b border-outline-variant/40 px-2 py-2 pt-safe-top">
        <button
          type="button"
          onClick={close}
          aria-label={step === 'details' ? 'Voltar' : 'Fechar'}
          className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface transition-colors active:bg-surface-container"
        >
          {step === 'details' ? <ArrowLeft size={22} aria-hidden /> : <X size={22} aria-hidden />}
        </button>
        <h1 className="font-sans text-title text-on-surface">
          {step === 'pick' ? 'Novo post' : 'Detalhes'}
        </h1>
      </header>

      <div className="min-h-0 flex-1">
        {step === 'pick' ? (
          <PickMediaStep
            media={media}
            onRemove={removeMedia}
            onMove={reorderMedia}
            onAddMore={() => setStep('camera')}
            onNext={() => setStep('details')}
          />
        ) : (
          <DetailsStep
            caption={caption}
            onCaptionChange={setCaption}
            sports={sports}
            onToggleSport={toggleSport}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            canPublishToMembers={isProfessional}
            canPublish={Boolean(profile) && !profileLoading && media.length > 0}
            onPublish={publish}
          />
        )}
      </div>
    </div>
  );
}
