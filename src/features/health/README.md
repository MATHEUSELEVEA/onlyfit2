# Perfil de Saúde

Implementação autodeclarada acessada por `Perfil > Perfil de Saúde`.

## Limites do módulo

- Não usa as tabelas legadas preenchidas por profissionais.
- Um registro confirmado nunca é atualizado; correções criam outro evento.
- Texto não usa IA.
- Áudio é transcrito em memória e descartado; somente o texto revisado é confirmado.
- Foto é lida pela IA em memória e descartada, como o áudio: nada de imagem é armazenado. A leitura é uma proposta (inclusive a categoria) e exige revisão.
- Documento aceita somente PDF privado. Extração é uma proposta e exige confirmação.
- Compartilhamento profissional e analytics não fazem parte desta fase.

## Onde mudar cada parte

- `types.ts`: contrato do domínio no cliente.
- `questionnaire.ts`: regras puras compartilhadas pelos dois modos de anamnese.
- `useHealthProfile.ts`: leituras e confirmação transacional via React Query.
- `healthCaptureApi.ts`: fronteira com as Edge Functions.
- páginas/componentes: somente estado e apresentação.

O backend vive em `../onlyfit-supabase`: migrations `20260713200000_self_health_profile.sql` e `20260715120000_health_photo_capture.sql`, e funções `health-*`.

## Alterar a anamnese

As telas são genéricas e renderizam `schema_json`; perguntas não ficam hardcoded no React. Para mudar o conteúdo:

1. Crie uma nova migration no `onlyfit-supabase`.
2. Insira uma nova linha em `health_questionnaire_versions` com `version` incremental e `is_published = true`.
3. Preserve versões anteriores. A consulta sempre escolhe a maior versão publicada.
4. Use apenas os tipos suportados: `boolean`, `boolean_confirmation`, `single_choice`, `textarea` e `number`.
5. Inclua `fact` quando a resposta precisar virar um fato atômico pesquisável.
6. Marque `review_status = clinically_reviewed` somente depois de revisão por profissional habilitado.

Eventos já confirmados guardam o snapshot da versão usada, portanto uma publicação nova não muda o histórico anterior.
