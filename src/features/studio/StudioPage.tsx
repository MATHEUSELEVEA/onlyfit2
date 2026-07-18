import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { createDraftMedia, moveItem, type DraftMedia } from './media';
import { getCreatePostErrorMessage, useCreatePost, type PostVisibility } from './useCreatePost';
import { useMyProfile } from '@/features/profile/useMyProfile';
import { PickMediaStep } from './steps/PickMediaStep';
import { DetailsStep } from './steps/DetailsStep';

type Step = 'pick' | 'details';

// Estúdio de criação de post. Fluxo em passos (escolher mídia → detalhes →
// publicar), propositalmente segregado em features/studio para evoluir depois
// com edição, filtros, música e melhorias por IA sem mexer no resto do app.
export function StudioPage() {
  const navigate = useNavigate();
  const createPost = useCreatePost();
  const { data: profile } = useMyProfile();
  // Só Profissional publica para assinantes; Membro só publica conteúdo público.
  const isProfessional = profile?.isProfessional ?? false;

  const [step, setStep] = useState<Step>('pick');
  const [media, setMedia] = useState<DraftMedia[]>([]);
  const [caption, setCaption] = useState('');
  const [sports, setSports] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<PostVisibility>('public');

  // Revoga os object URLs dos previews ao desmontar, evitando vazamento.
  useEffect(() => {
    return () => {
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

  const publish = () => {
    createPost.mutate(
      // Trava servidor-agnóstica: Membro nunca envia paid_members.
      { media, caption, sports, visibility: isProfessional ? visibility : 'public' },
      {
        onSuccess: (postId) => {
          media.forEach((item) => URL.revokeObjectURL(item.previewUrl));
          navigate(`/video/${postId}`, { replace: true });
        },
      },
    );
  };

  const close = () => {
    if (step === 'details') {
      setStep('pick');
    } else {
      navigate(-1);
    }
  };

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
            onAdd={addFiles}
            onRemove={removeMedia}
            onMove={reorderMedia}
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
            onPublish={publish}
            isPublishing={createPost.isPending}
            error={createPost.isError ? getCreatePostErrorMessage(createPost.error) : null}
          />
        )}
      </div>
    </div>
  );
}
