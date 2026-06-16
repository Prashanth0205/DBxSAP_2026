import { ReactNode } from 'react';

// Mirrors src/server/lib/capability_keywords.py — keep these two files in sync.
export const CAPABILITY_KEYWORDS: Record<string, string[]> = {
  icu:       ['icu', 'intensive care', 'critical care', 'ventilator', 'ccm'],
  maternity: ['maternity', 'obstetric', 'delivery', 'labour', 'prenatal', 'antenatal', 'midwifery'],
  emergency: ['emergency', 'casualty', 'trauma', 'accident', 'a&e', '24 hour'],
  dialysis:  ['dialysis', 'renal', 'nephrology', 'kidney'],
  oncology:  ['oncology', 'cancer', 'chemotherapy', 'radiation', 'tumour'],
  trauma:    ['trauma', 'orthopedic', 'fracture', 'spine', 'neurosurgery'],
  nicu:      ['nicu', 'neonatal', 'newborn intensive', 'premature'],
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split `text` on capability-keyword matches and return a ReactNode array
 * with matches wrapped in <mark>. Renders as React elements — no innerHTML,
 * so the original text is shown verbatim with safe escaping.
 */
export function highlightKeywords(text: string, capability: string): ReactNode[] {
  const keywords = CAPABILITY_KEYWORDS[capability.toLowerCase()] ?? [capability];
  // Sort longest first so "intensive care" wins over "care" etc.
  const sorted = [...keywords].sort((a, b) => b.length - a.length).map(escapeRegex);
  const regex = new RegExp(`(${sorted.join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((p, i) =>
    i % 2 === 1 ? <mark key={i}>{p}</mark> : p
  );
}
