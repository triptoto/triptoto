import { readFileSync, writeFileSync } from 'node:fs';

// Supplemental strings found by opening rendered screens, including strings
// created at runtime that the static inventory generator cannot see.
const additions = {
  'Confirmed': ['Bestätigt', 'Confirmé', 'Confirmado', 'Подтверждено'],
  'Adult': ['Erwachsene Person', 'Adulte', 'Adulto', 'Взрослый'],
  'Child': ['Kind', 'Enfant', 'Niño', 'Ребёнок'],
  'Infant': ['Kleinkind', 'Bébé', 'Bebé', 'Младенец'],
  'Add Reservation': ['Reservierung hinzufügen', 'Ajouter une réservation', 'Añadir reserva', 'Добавить бронирование'],
  'Save Traveler': ['Reisende Person speichern', 'Enregistrer le voyageur', 'Guardar viajero', 'Сохранить путешественника'],
  'Save Checklist': ['Checkliste speichern', 'Enregistrer la liste', 'Guardar lista', 'Сохранить список'],
  'Name *': ['Name *', 'Nom *', 'Nombre *', 'Имя *'],
  'Neighborhood name *': ['Name des Viertels *', 'Nom du quartier *', 'Nombre del barrio *', 'Название района *'],
  'Group several nearby places into one area to explore': ['Fasse nahe Orte zu einem Viertel zusammen', 'Regroupez des lieux proches à explorer', 'Agrupa lugares cercanos para explorarlos', 'Объедините близкие места в один район'],
  'Save boarding pass offline': ['Bordkarte offline speichern', 'Enregistrer la carte d’embarquement hors ligne', 'Guardar tarjeta de embarque sin conexión', 'Сохранить посадочный талон офлайн'],
  'NEIGHBORHOOD': ['VIERTEL', 'QUARTIER', 'BARRIO', 'РАЙОН'],
  'Generic ticket': ['Allgemeines Ticket', 'Billet générique', 'Entrada genérica', 'Обычный билет'],
  'Created': ['Erstellt', 'Créé', 'Creado', 'Создано'],
  'Match it to a trip before adding.': ['Ordnen Sie sie vor dem Hinzufügen einer Reise zu.', 'Associez-la à un voyage avant de l’ajouter.', 'Asígnala a un viaje antes de añadirla.', 'Выберите поездку перед добавлением.'],
  'Match them to a trip before adding.': ['Ordnen Sie sie vor dem Hinzufügen einer Reise zu.', 'Associez-les à un voyage avant de les ajouter.', 'Asígnalas a un viaje antes de añadirlas.', 'Выберите поездку перед добавлением.'],
  'Less travel admin.': ['Weniger Reiseorganisation.', 'Moins de formalités de voyage.', 'Menos gestiones de viaje.', 'Меньше забот о поездке.'],
  'being there.': ['Erlebnisse.', 'de découvertes.', 'experiencias.', 'впечатлений.'],
  'Your bookings, day plans, and saved places.': ['Ihre Buchungen, Tagespläne und gespeicherten Orte.', 'Vos réservations, programmes de journée et lieux enregistrés.', 'Tus reservas, planes diarios y lugares guardados.', 'Ваши бронирования, планы по дням и сохранённые места.'],
  'One beautifully clear trip.': ['Alles übersichtlich in einer Reise.', 'Un voyage organisé avec clarté.', 'Un viaje organizado con claridad.', 'Всё ясно и удобно в одной поездке.'],
  'A few things': ['Ein paar Dinge', 'Quelques détails', 'Algunas cosas', 'Несколько вещей'],
  'Now has a home.': ['Jetzt hat alles seinen Platz.', 'Tout a désormais sa place.', 'Ahora todo tiene su lugar.', 'Теперь всё на своём месте.'],
  'Good company.': ['Gute Gesellschaft.', 'Une bonne compagnie.', 'Buena compañía.', 'Хорошая компания.'],
  'A little more together.': ['Gemeinsam wird es leichter.', 'Encore mieux ensemble.', 'Mejor en compañía.', 'Вместе ещё лучше.'],
  'A shared plan.': ['Ein gemeinsamer Plan.', 'Un programme commun.', 'Un plan compartido.', 'Общий план.'],
  'A trip should feel like': ['Eine Reise sollte sich anfühlen wie', 'Un voyage devrait être', 'Un viaje debería sentirse como', 'Путешествие должно быть'],
  'a possibility.': ['eine Möglichkeit.', 'une possibilité.', 'una posibilidad.', 'возможностью.'],
  'Enjoy it one day at a time.': ['Genießen Sie jeden Tag für sich.', 'Profitez de chaque journée.', 'Disfruta cada día a su ritmo.', 'Наслаждайтесь каждым днём.'],
  'Just a clearer way to travel.': ['Einfach klarer reisen.', 'Une façon plus claire de voyager.', 'Una forma más clara de viajar.', 'Просто более понятный способ путешествовать.'],
  'No grand promises.': ['Keine großen Versprechen.', 'Pas de grandes promesses.', 'Sin grandes promesas.', 'Без громких обещаний.'],
  'Not a pile of tabs.': ['Nicht ein Stapel offener Tabs.', 'Pas une pile d’onglets.', 'No un montón de pestañas.', 'Не десятки открытых вкладок.'],
  'See the whole trip.': ['Sehen Sie die ganze Reise.', 'Voyez l’ensemble du voyage.', 'Mira todo el viaje.', 'Вся поездка перед глазами.'],
  'Your next trip.': ['Ihre nächste Reise.', 'Votre prochain voyage.', 'Tu próximo viaje.', 'Ваша следующая поездка.'],
  'you might wonder.': ['vielleicht fragen Sie sich.', 'vous vous demandez peut-être.', 'quizá te preguntes.', 'вам может быть интересно.'],
  '“We should go here.”': ['„Hier sollten wir hin.“', '« On devrait aller ici. »', '«Deberíamos ir aquí».', '«Надо сюда сходить».'],
  'More': ['Mehr', 'Plus', 'Más', 'Больше'],
};
const locales = ['en', 'de', 'fr', 'es', 'ru'];
const bundles = Object.fromEntries(locales.map(lang => [lang, JSON.parse(readFileSync(`public/lang/${lang}.json`, 'utf8'))]));
const source = JSON.parse(readFileSync('public/lang/source-map.json', 'utf8'));
for (const [english, translations] of Object.entries(additions)) {
  const key = `qa.${english.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
  if (source[english] && source[english] !== key) throw new Error(`Existing key for ${english}: ${source[english]}`);
  source[english] = key;
  locales.forEach((lang, i) => { bundles[lang].messages[key] = lang === 'en' ? english : translations[i-1]; });
}
const internal = {
  'qa.review_bookings': ['Review {bookings}', '{bookings} prüfen', 'Vérifier {bookings}', 'Revisar {bookings}', 'Проверить: {bookings}'],
  'qa.notification_added': ['Added to this trip.', 'Zu dieser Reise hinzugefügt.', 'Ajouté à ce voyage.', 'Añadido a este viaje.', 'Добавлено в эту поездку.'],
  'qa.notification_removed': ['Removed from this trip.', 'Von dieser Reise entfernt.', 'Retiré de ce voyage.', 'Eliminado de este viaje.', 'Удалено из этой поездки.'],
  'qa.notification_updated': ['Updated on this trip.', 'Auf dieser Reise aktualisiert.', 'Mis à jour dans ce voyage.', 'Actualizado en este viaje.', 'Обновлено в этой поездке.'],
  'qa.notification_changed': ['Changed on this trip.', 'Auf dieser Reise geändert.', 'Modifié dans ce voyage.', 'Modificado en este viaje.', 'Изменено в этой поездке.'],
};
for (const [key, translations] of Object.entries(internal)) locales.forEach((lang, i) => { bundles[lang].messages[key] = translations[i]; });
const corrections = {
  ru: { 'ui.critical': 'Критично', 'ui.selected_date_date': 'Выбранная дата: {date}', 'ui.selected_range_startdate_to_enddate':'Выбранный диапазон: с {startDate} по {endDate}' },
  fr: { 'ui.selected_date_date': 'Date sélectionnée : {date}', 'ui.selected_range_startdate_to_enddate':'Période sélectionnée : du {startDate} au {endDate}' },
  es: { 'ui.selected_date_date': 'Fecha seleccionada: {date}', 'ui.selected_range_startdate_to_enddate':'Intervalo seleccionado: del {startDate} al {endDate}' },
  de: { 'ui.essentials': 'Das Wichtigste', 'ui.details': 'Angaben', 'ui.selected_date_date': 'Ausgewähltes Datum: {date}', 'ui.selected_range_startdate_to_enddate':'Ausgewählter Zeitraum: {startDate} bis {endDate}' },
};
for (const [lang, changes] of Object.entries(corrections)) Object.assign(bundles[lang].messages, changes);
for (const lang of locales) writeFileSync(`public/lang/${lang}.json`, JSON.stringify(bundles[lang], null, 2) + '\n');
writeFileSync('public/lang/source-map.json', JSON.stringify(source, null, 2) + '\n');
console.log(`Applied ${Object.keys(additions).length} rendered-screen translations to ${locales.length} locales.`);
