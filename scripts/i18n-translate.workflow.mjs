export const meta = {
  name: 'i18n-translate',
  description: 'Translate the tripto.to English UI inventory into de/fr/es/ru at native quality, pinned to a glossary',
  phases: [
    { title: 'Translate', detail: 'per language x batch, glossary-pinned, reads batch files from /tmp/i18n-batches' },
  ],
}

const BATCHES = (args && args.batches) || 15
const DIR = '/tmp/i18n-batches'
const GLOSSARY = '/tmp/i18n-glossary.md'
const LANGS = [
  { code: 'de', name: 'German', extra: 'Use the formal Sie. Compound nouns are fine but keep button labels short and scannable.' },
  { code: 'fr', name: 'French', extra: 'Use vous. Apply French typography: a space before : ; ! ? and « » where quotes appear.' },
  { code: 'es', name: 'Spanish', extra: 'Use friendly tú. Use ¿ ¡ for questions and exclamations.' },
  { code: 'ru', name: 'Russian', extra: 'Use friendly lowercase вы. Natural word order and correct grammatical case; avoid calques.' },
]

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    translations: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'map of every input key -> its translated string',
    },
  },
  required: ['translations'],
}

phase('Translate')

const jobs = []
for (const lang of LANGS) for (let b = 0; b < BATCHES; b++) jobs.push({ lang, b })

const results = await parallel(
  jobs.map((job) => () =>
    agent(
      `You are a professional ${job.lang.name} UI localizer for tripto.to, a calm, private mobile travel app.

First Read ${GLOSSARY} (the terminology glossary) and Read ${DIR}/batch-${String(job.b).padStart(2, '0')}.json (a JSON array of {key, en} objects).

Translate EACH "en" string into natural, idiomatic ${job.lang.name} that a native speaker expects in a modern mobile travel app. Rules:
- Simple, friendly, concise. NOT literal or machine word-for-word. Preserve meaning, tone and UX intent.
- Keep button/label text short; do not lengthen unnecessarily.
- Preserve every {placeholder} token EXACTLY as written (same name, same braces). You MAY reposition a placeholder for correct grammar, but never rename, translate, or drop it.
- Preserve trailing ellipsis …, middot ·, currency symbols, and emoji. Match the source's sentence-final punctuation.
- Do NOT translate brand/product names or technical tokens: Tripto, Tripto Plus, Google, eSIM, PDF, FAQ, tripto.to, go@tripto.to, Lemon Squeezy, airport/currency codes.
- Follow the GLOSSARY exactly for every listed concept, so the same concept always uses the same word.
- ${job.lang.extra}

Return ONLY the structured tool: object "translations" mapping EACH input key to its ${job.lang.name} translation. Every key in the batch must appear exactly once. Do not add keys that are not in the batch.`,
      { label: `${job.lang.code}:b${job.b}`, phase: 'Translate', schema: SCHEMA },
    ).then((r) => ({ code: job.lang.code, b: job.b, translations: (r && r.translations) || {} })),
  ),
)

const out = { de: {}, fr: {}, es: {}, ru: {} }
for (const r of results.filter(Boolean)) Object.assign(out[r.code], r.translations)

const counts = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Object.keys(v).length]))
log('Translated key counts per lang: ' + JSON.stringify(counts))

return { translations: out, counts }