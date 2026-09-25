/** Topic taxonomy (with icons) for organising the dataset lists, plus the
 *  macro/survey split (true opinion surveys vs objective statistics). */

export interface Topic { id: string; label: string; icon: string }

export const TOPICS: Record<string, Topic> = {
  economy: { id: 'economy', label: 'Economy', icon: '📈' },
  demographics: { id: 'demographics', label: 'Demographics', icon: '👥' },
  health: { id: 'health', label: 'Health', icon: '🫀' },
  education: { id: 'education', label: 'Education', icon: '🎓' },
  environment: { id: 'environment', label: 'Environment', icon: '🌱' },
  connectivity: { id: 'connectivity', label: 'Connectivity', icon: '🌐' },
  governance: { id: 'governance', label: 'Governance', icon: '🏛️' },
  media: { id: 'media', label: 'Media & news', icon: '📰' },
  safety: { id: 'safety', label: 'Safety', icon: '🛡️' },
  risk: { id: 'risk', label: 'Risk & resilience', icon: '⚠️' },
  wellbeing: { id: 'wellbeing', label: 'Wellbeing', icon: '😊' },
  attitudes: { id: 'attitudes', label: 'Attitudes & values', icon: '🧭' },
};

/** Display order of topics — hard economics first, then demographics and
 *  connectivity, then the rest; opinion-style topics (wellbeing, attitudes) last. */
export const TOPIC_ORDER = [
  'economy', 'demographics', 'connectivity', 'health', 'education',
  'environment', 'governance', 'media', 'safety', 'risk', 'wellbeing', 'attitudes',
];

/** True opinion/perception surveys (everything else is objective statistics). */
export function isOpinionSurvey(slug: string): boolean {
  return slug.startsWith('whr-') || slug.startsWith('lits-') || slug.startsWith('wrp-')
    || slug.startsWith('hofstede-') || slug.startsWith('wvs-') || slug.startsWith('afro-') || slug.startsWith('ess-')
    || slug.startsWith('sdr2-') || slug.startsWith('cb-') || slug.startsWith('wgm-') || slug.startsWith('rlms-')
    || slug.startsWith('lb-') || slug.startsWith('dnr-') || slug.startsWith('ab-') || slug.startsWith('cses-');
}

/** Explicit topic overrides — win over the topic stored in the dataset JSON.
 *  Used to fold near-empty survey rubrics into bigger ones on the Polls page. */
const TOPIC_OVERRIDES: Record<string, string> = {
  'wrp-climate-threat': 'risk',      // all six World Risk Poll questions live together
  'wrp-discrimination': 'risk',
  'wrp-worry-crime': 'risk',
  'wgm-vaccines-effective': 'attitudes', // perception questions, not health statistics
  'wgm-vaccines-safe': 'attitudes',
};

export function topicOverride(slug: string): string | undefined {
  return TOPIC_OVERRIDES[slug];
}

/** Assign a topic to a dataset by slug. */
export function topicFor(slug: string): string {
  if (slug.startsWith('whr-')) return 'wellbeing';
  if (slug.startsWith('lits-')) return 'attitudes';
  if (slug.startsWith('v-dem-')) return 'governance';
  if (slug.startsWith('wri-') || slug.startsWith('inform-') || slug === 'wrp-resilience') return 'risk';
  if (slug === 'qog-wdi-expedu' || slug === 'gapminder-literacy') return 'education';
  if (slug === 'qog-wdi-chexppgdp' || slug === 'qog-wdi-mortinf' || slug === 'gapminder-life-expectancy') return 'health';
  if (slug === 'gapminder-internet') return 'connectivity';
  if (slug === 'gapminder-homicide') return 'safety';
  if (slug === 'gapminder-energy' || slug === 'wb-en-ghg-co2-pc-ce-ar5') return 'environment';
  if (slug === 'gapminder-hdi') return 'wellbeing';
  if (slug === 'wb-sp-dyn-tfrt-in' || slug === 'imf-population' ||
      slug === 'gapminder-median-age' || slug === 'gapminder-urban' || slug === 'gapminder-density') return 'demographics';
  if (slug.startsWith('qog-')) return 'governance';
  return 'economy';
}
