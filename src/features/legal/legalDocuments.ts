export type LegalDocumentKind = 'acceptance' | 'notice' | 'declaration';

export interface LegalDocument {
  key: string;
  version: string;
  kind: LegalDocumentKind;
  title: string;
  description: string;
  pdfPath: string;
  checkboxLabel: string;
  actionLabel: string;
}
