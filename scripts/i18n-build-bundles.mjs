import { readFileSync, writeFileSync } from 'node:fs';

// Inputs produced by scripts/i18n-assemble.mjs + the translation workflow.
const enMessages = JSON.parse(readFileSync('/tmp/i18n-en-messages.json', 'utf8')); // key -> english
const sourceMap = JSON.parse(readFileSync('/tmp/i18n-source-map.json', 'utf8'));     // english -> key (static only)
const tr = JSON.parse(readFileSync('/tmp/i18n-translations.json', 'utf8'));          // {de:{key:str},fr,es,ru}

const LANGS = ['de', 'fr', 'es', 'ru'];

// --- Locale-aware plural templates (CLDR categories). {count} interpolated at runtime. ---
// en/de/fr/es: one|other ; ru: one|few|many|other.
const P = (one, other, few, many) => ({ en: null, one, other, few, many });
const PLURALS = {
  trip:      { en:{one:'{count} trip',other:'{count} trips'}, de:{one:'{count} Reise',other:'{count} Reisen'}, fr:{one:'{count} voyage',other:'{count} voyages'}, es:{one:'{count} viaje',other:'{count} viajes'}, ru:{one:'{count} поездка',few:'{count} поездки',many:'{count} поездок',other:'{count} поездки'} },
  traveler:  { en:{one:'{count} traveler',other:'{count} travelers'}, de:{one:'{count} Reisende:r',other:'{count} Reisende'}, fr:{one:'{count} voyageur',other:'{count} voyageurs'}, es:{one:'{count} viajero',other:'{count} viajeros'}, ru:{one:'{count} путешественник',few:'{count} путешественника',many:'{count} путешественников',other:'{count} путешественника'} },
  document:  { en:{one:'{count} document',other:'{count} documents'}, de:{one:'{count} Dokument',other:'{count} Dokumente'}, fr:{one:'{count} document',other:'{count} documents'}, es:{one:'{count} documento',other:'{count} documentos'}, ru:{one:'{count} документ',few:'{count} документа',many:'{count} документов',other:'{count} документа'} },
  task:      { en:{one:'{count} task',other:'{count} tasks'}, de:{one:'{count} Aufgabe',other:'{count} Aufgaben'}, fr:{one:'{count} tâche',other:'{count} tâches'}, es:{one:'{count} tarea',other:'{count} tareas'}, ru:{one:'{count} задача',few:'{count} задачи',many:'{count} задач',other:'{count} задачи'} },
  day:       { en:{one:'{count} day',other:'{count} days'}, de:{one:'{count} Tag',other:'{count} Tage'}, fr:{one:'{count} jour',other:'{count} jours'}, es:{one:'{count} día',other:'{count} días'}, ru:{one:'{count} день',few:'{count} дня',many:'{count} дней',other:'{count} дня'} },
  place:     { en:{one:'{count} place',other:'{count} places'}, de:{one:'{count} Ort',other:'{count} Orte'}, fr:{one:'{count} lieu',other:'{count} lieux'}, es:{one:'{count} lugar',other:'{count} lugares'}, ru:{one:'{count} место',few:'{count} места',many:'{count} мест',other:'{count} места'} },
  booking:   { en:{one:'{count} booking',other:'{count} bookings'}, de:{one:'{count} Buchung',other:'{count} Buchungen'}, fr:{one:'{count} réservation',other:'{count} réservations'}, es:{one:'{count} reserva',other:'{count} reservas'}, ru:{one:'{count} бронирование',few:'{count} бронирования',many:'{count} бронирований',other:'{count} бронирования'} },
  change:    { en:{one:'{count} change',other:'{count} changes'}, de:{one:'{count} Änderung',other:'{count} Änderungen'}, fr:{one:'{count} modification',other:'{count} modifications'}, es:{one:'{count} cambio',other:'{count} cambios'}, ru:{one:'{count} изменение',few:'{count} изменения',many:'{count} изменений',other:'{count} изменения'} },
  night:     { en:{one:'{count} night',other:'{count} nights'}, de:{one:'{count} Nacht',other:'{count} Nächte'}, fr:{one:'{count} nuit',other:'{count} nuits'}, es:{one:'{count} noche',other:'{count} noches'}, ru:{one:'{count} ночь',few:'{count} ночи',many:'{count} ночей',other:'{count} ночи'} },
  stop:      { en:{one:'{count} stop',other:'{count} stops'}, de:{one:'{count} Stopp',other:'{count} Stopps'}, fr:{one:'{count} arrêt',other:'{count} arrêts'}, es:{one:'{count} parada',other:'{count} paradas'}, ru:{one:'{count} остановка',few:'{count} остановки',many:'{count} остановок',other:'{count} остановки'} },
  note:      { en:{one:'{count} note',other:'{count} notes'}, de:{one:'{count} Notiz',other:'{count} Notizen'}, fr:{one:'{count} note',other:'{count} notes'}, es:{one:'{count} nota',other:'{count} notas'}, ru:{one:'{count} заметка',few:'{count} заметки',many:'{count} заметок',other:'{count} заметки'} },
  item:      { en:{one:'{count} item',other:'{count} items'}, de:{one:'{count} Element',other:'{count} Elemente'}, fr:{one:'{count} élément',other:'{count} éléments'}, es:{one:'{count} elemento',other:'{count} elementos'}, ru:{one:'{count} элемент',few:'{count} элемента',many:'{count} элементов',other:'{count} элемента'} },
  photo:     { en:{one:'{count} photo',other:'{count} photos'}, de:{one:'{count} Foto',other:'{count} Fotos'}, fr:{one:'{count} photo',other:'{count} photos'}, es:{one:'{count} foto',other:'{count} fotos'}, ru:{one:'{count} фото',few:'{count} фото',many:'{count} фото',other:'{count} фото'} },
  answer:    { en:{one:'{count} answer',other:'{count} answers'}, de:{one:'{count} Antwort',other:'{count} Antworten'}, fr:{one:'{count} réponse',other:'{count} réponses'}, es:{one:'{count} respuesta',other:'{count} respuestas'}, ru:{one:'{count} ответ',few:'{count} ответа',many:'{count} ответов',other:'{count} ответа'} },
};

function pluralFor(locale) {
  const out = {};
  for (const [noun, byLang] of Object.entries(PLURALS)) out[noun] = byLang[locale];
  return out;
}

function tokens(s) { return (String(s).match(/\{(\w+)\}/g) || []).sort(); }

// English bundle: messages = en, plurals = en forms.
const enBundle = { locale: 'en', messages: enMessages, plural: pluralFor('en') };
writeFileSync('public/lang/en.json', JSON.stringify(enBundle, null, 2) + '\n');

let report = { en: { keys: Object.keys(enMessages).length } };
for (const code of LANGS) {
  const messages = {};
  let translated = 0, fellBack = 0, tokenMismatch = 0;
  for (const [key, en] of Object.entries(enMessages)) {
    const val = tr[code] && tr[code][key];
    if (typeof val === 'string' && val.trim()) {
      // Guard placeholder integrity: if tokens differ, fall back to English to avoid broken interpolation.
      if (tokens(val).join(',') === tokens(en).join(',')) { messages[key] = val; translated++; }
      else { messages[key] = en; fellBack++; tokenMismatch++; }
    } else { messages[key] = en; fellBack++; }
  }
  const bundle = { locale: code, messages, plural: pluralFor(code) };
  writeFileSync(`public/lang/${code}.json`, JSON.stringify(bundle, null, 2) + '\n');
  report[code] = { translated, fellBack, tokenMismatch };
}

// Rewrite source-map with the new meaningful keys (static strings only).
writeFileSync('public/lang/source-map.json', JSON.stringify(sourceMap, null, 2) + '\n');

console.log('Bundles written. Report:');
console.log(JSON.stringify(report, null, 2));
console.log('source-map entries:', Object.keys(sourceMap).length);
// Preserve visual-QA translations for runtime strings and the landing page.
await import('./i18n-qa-overrides.mjs');
