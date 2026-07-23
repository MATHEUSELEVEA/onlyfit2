import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { cleanSocialLinksForSave } from '@/lib/socialLinks';
import { myProfileQueryKey, type MyProfile } from './useMyProfile';

// Espelha o padrão do onlyfit-desktop (src/hooks/queries/useProfile.ts):
// whitelist explícita via zod `.strict()` para impedir mass assignment —
// nenhum campo fora desta lista pode ser gravado por este hook.
const profileUpdateSchema = z
  .object({
    full_name: z.string().min(1).max(100).optional(),
    username: z
      .string()
      .min(3)
      .max(30)
      .regex(/^[a-zA-Z0-9_]+$/)
      .optional(),
    bio: z.string().max(500).optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    language: z.string().max(10).optional().nullable(),
    country_code: z.string().max(5).optional().nullable(),
    social_links: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: ProfileUpdateInput }) => {
      const validated = profileUpdateSchema.parse(updates);
      const payload = {
        ...validated,
        ...(validated.social_links ? { social_links: cleanSocialLinksForSave(validated.social_links) } : {}),
      };

      // O RETURNING (`.select`) só pode conter colunas que o papel
      // `authenticated` tem permissão de LER. Em produção o SELECT de `phone`
      // (e demais campos sensíveis) é revogado — lê-se só via RPC
      // `get_my_sensitive_profile`. Incluir `phone` aqui fazia o Postgres
      // devolver 42501 ("permission denied for column phone"), que o bloco
      // abaixo interpretava como sessão expirada e deslogava o usuário. O
      // update de `phone` continua acontecendo; apenas não o pedimos de volta.
      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', userId)
        .select('id, full_name, username, bio, language, country_code, social_links')
        .maybeSingle();

      if (error) {
        // Como `userId` sempre vem da própria sessão (nunca de outro usuário),
        // um 42501 aqui nunca é "editando o perfil de outra pessoa" — é a
        // sessão tendo expirado (refresh token inválido) e o Postgres barrando
        // o update por falta de `auth.uid()`. Desloga para forçar novo login
        // em vez de mostrar uma mensagem de permissão que confunde o usuário.
        if (error.code === '42501' || error.message?.includes('row-level security')) {
          await supabase.auth.signOut();
          throw new Error('Sua sessão expirou. Faça login novamente.');
        }
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
          throw new Error('Este nome de usuário já está em uso.');
        }
        if (error.code === '23514' || error.message?.includes('violates check constraint')) {
          throw new Error('Algum campo possui um valor inválido.');
        }
        throw error;
      }

      if (!data) throw new Error('Perfil não encontrado.');
      return data;
    },
    onSuccess: (data, { userId }) => {
      queryClient.setQueryData<MyProfile | null>(myProfileQueryKey(userId), (current) =>
        current
          ? {
              ...current,
              fullName: data.full_name,
              username: data.username,
              bio: data.bio,
              countryCode: data.country_code,
              language: data.language,
              socialLinks: cleanSocialLinksForSave((data as { social_links?: Record<string, string> }).social_links ?? {}),
            }
          : current,
      );
      // `phone` vive na query de campos sensíveis (lida via RPC); como o update
      // pode tê-lo alterado, invalida essa query para a tela refletir o novo valor.
      queryClient.invalidateQueries({ queryKey: ['my-sensitive-profile', userId] });
    },
  });
}
