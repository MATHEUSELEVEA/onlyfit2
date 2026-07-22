# TREINO-EXECUTAVEL.md

Como cada esporte vira um treino **executável** (igual musculação), calibrado para o público geral (amador, não elite). Fonte da verdade do modelo de "passo executável" + player guiado + builder.

## Princípios

1. **Esforço-primeiro.** O alvo de cada passo é `fácil / moderado / forte / máx / recuperar`. Pace/FC/potência são **opcionais** — só aparecem se o profissional preencher. (Referências: Nike Run Club, Peloton RPE.)
2. **Wearable-opcional.** O **app dá o "check" sozinho**, 100% no celular (timers + passos). Apple Health e (futuro) GPS **enriquecem** o realizado (FC, pace, distância) — nunca são pré-requisito.
3. **Sem migração acoplada.** O plano executável mora no `workout_prescriptions.prescription` (JSONB livre); o realizado vem do Apple Health (`external_activities`). Nada de schema novo acoplado ao desktop.

## O modelo — "passo executável"

`src/features/training/guidedSession.ts`. Um treino é uma lista ordenada de passos:

- **bound** (quanto dura): `time` (segundos) · `distance` (metros) · `reps` · `open` (o aluno toca "concluir").
- **target** (alvo): `effort` (sempre) + opcionais `paceSecPerKm` / `hrZone` / `power` / `cadence`.
- **role**: `warmup / activation / main / recovery / cooldown`.
- **rest** opcional (recuperação por tempo) e **repeat Nx** (`{ kind: 'repeat', times, steps }`) para "6× (forte + recuperar)".

**`toGuidedWorkout(studentWorkout)`** resolve o plano por precedência: `prescription.steps` estruturado → blocos da prescrição (parse de texto) → exercícios → fallback (1 passo aberto). Retorna `null` para musculação (segue no Player de força atual). Musculação permanece intocada.

## Quem executa — player guiado

`src/pages/GuidedSessionPage.tsx`, rota `/meu-fit/treino/player/guiado` (prefixo imersivo). Motor genérico: mostra o passo atual (papel + rótulo + alvo de esforço), cronômetro (regressivo p/ tempo; "concluir" p/ distância/reps/aberto), recuperação automática, preview do próximo passo, trilha de progresso. Ao concluir: grava a sessão (`workout_sessions`) e mostra o resumo. Lançado por **Hoje**, **Biblioteca** e **detalhe do dia** (branch por esporte em `TrainingPage`).

## Quem constrói — builder

`src/features/profile/offerings/GuidedStepsEditor.tsx`, dentro do `StandaloneWorkoutConfig`. Para esportes não-musculação, o profissional monta a sessão em passos (mesmo modelo `GuidedStep`): papel · nome · esforço · medir por tempo/distância/reps/livre · ritmo opcional · descanso · repetir Nx. Salva no mesmo `prescription` JSONB (RPC existente). **Round-trip:** o que monta é exatamente o que o aluno executa.

## Check + relatório + evolução

- **Check:** o player persiste em `workout_sessions` → a aba Hoje e a Biblioteca já refletem "feito hoje".
- **Relatório/performance:** as métricas realizadas (pace/FC/distância/laps) vêm do Apple Health (`external_activities`) e aparecem em Histórico/Progresso via `sportActivityMetrics.ts` (espelho dos campos da prescrição). Sem wearable → duração + esforço; com wearable → performance completa.

## Roadmap

- ✅ Fundação + executor genérico (corrida/caminhada/bike/funcional/yoga no básico) + builder de passos.
- ⏳ Players sport-specific: natação (sets + saída), HIIT (relógio AMRAP/EMOM/Tabata), yoga (posturas + respiração).
- ⏳ Planejado × realizado explícito (matcher sessão ↔ atividade do wearable por data+esporte) e tendências por esporte.
- ⏳ GPS do celular (Capacitor Geolocation) p/ distância/pace de corrida/bike **sem watch**.
