import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
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
  })
  .strict();

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: ProfileUpdateInput }) => {
      const validated = profileUpdateSchema.parse(updates);

      const { data, error } = await supabase
        .from('profiles')
        .update(validated)
        .eq('id', userId)
        .select('id, full_name, username, bio, phone, language, country_code')
        .maybeSingle();

      if (error) {
        if (error.code === '42501' || error.message?.includes('row-level security')) {
          throw new Error('Sem permissão para editar este perfil.');
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
            }
          : current,
      );
    },
  });
}
