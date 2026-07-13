import type {
  HealthFactInput,
  QuestionnaireAnswer,
  QuestionnaireAnswers,
  QuestionnaireQuestion,
  QuestionnaireSection,
} from './types';

export function isQuestionVisible(question: QuestionnaireQuestion, answers: QuestionnaireAnswers) {
  const anyTrue = question.visible_when?.any_true;
  return !anyTrue?.length || anyTrue.some((questionId) => answers[questionId] === true);
}

export function visibleQuestionList(sections: QuestionnaireSection[], answers: QuestionnaireAnswers) {
  return sections.flatMap((section) => section.questions).filter((question) => isQuestionVisible(question, answers));
}

export function buildQuestionnaireFacts(
  sections: QuestionnaireSection[],
  answers: QuestionnaireAnswers,
  effectiveAt: string,
): HealthFactInput[] {
  return sections.flatMap((section) =>
    section.questions.flatMap((question) => {
      const value = answers[question.id];
      if (!question.fact || value == null || value === '') return [];
      const selectedLabel = question.options?.find((option) => option.value === value)?.label;
      const fact: HealthFactInput = {
        fact_type: question.fact.fact_type,
        canonical_key: question.fact.canonical_key,
        display: question.fact.display,
        unit: question.fact.unit,
        effective_at: effectiveAt,
        confidence: 1,
        metadata: { question_id: question.id, section_id: section.id, answer_value: value },
      };
      if (typeof value === 'boolean') fact.value_boolean = value;
      else if (typeof value === 'number') fact.value_numeric = value;
      else fact.value_text = selectedLabel ?? value;
      return [fact];
    }),
  );
}

export function parseObjectiveAnswer(question: QuestionnaireQuestion, raw: string): QuestionnaireAnswer | undefined {
  const normalized = normalize(raw);
  if (question.type === 'textarea') return raw.trim();
  if (question.type === 'boolean_confirmation') {
    return ['confirmo', 'concordo', 'sim', 'ok'].includes(normalized) ? true : undefined;
  }
  if (question.type === 'boolean') {
    if (['sim', 's', 'yes', 'tenho', 'possuo'].includes(normalized)) return true;
    if (['nao', 'n', 'no', 'nunca', 'nao tenho'].includes(normalized)) return false;
    return undefined;
  }
  if (question.type === 'number') {
    const value = Number(raw.replace(',', '.').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(value)) return undefined;
    if (question.min != null && value < question.min) return undefined;
    if (question.max != null && value > question.max) return undefined;
    return value;
  }
  const option = question.options?.find((candidate) => {
    const optionLabel = normalize(candidate.label);
    const optionValue = normalize(candidate.value);
    return normalized === optionLabel || normalized === optionValue;
  });
  return option?.value;
}

export function validateQuestionAnswer(question: QuestionnaireQuestion, value: QuestionnaireAnswer | undefined) {
  const missing = value == null || value === '';
  if (missing) return question.required ? 'Responda esta pergunta para continuar.' : undefined;
  if (question.type === 'boolean_confirmation' && value !== true) return 'Confirme a declaração para concluir.';
  if (question.type === 'boolean' && typeof value !== 'boolean') return 'Selecione Sim ou Não.';
  if (question.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Informe um número válido.';
    if (question.min != null && value < question.min) return `O valor mínimo é ${question.min}.`;
    if (question.max != null && value > question.max) return `O valor máximo é ${question.max}.`;
  }
  if (question.type === 'single_choice' && !question.options?.some((option) => option.value === value)) {
    return 'Selecione uma das opções disponíveis.';
  }
  return undefined;
}

export function answerLabel(question: QuestionnaireQuestion, value: QuestionnaireAnswer) {
  if (value === '') return 'Não informado';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return question.options?.find((option) => option.value === value)?.label ?? String(value);
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}
