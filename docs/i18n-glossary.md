# tripto.to localization glossary

Canonical translations for recurring product concepts. Every locale bundle MUST use
these exact terms so the same concept never appears with two different words. Tone is
simple, friendly, modern, concise — mobile UI copy, never literal machine translation.
English (`en`) is the source of truth and the fallback.

Legend: EN → de / fr / es / ru

## Core nouns (product concepts)

- Trip → Reise / Voyage / Viaje / Поездка
- Timeline → Zeitachse / Chronologie / Cronología / Хронология
- Traveler → Reisende:r / Voyageur / Viajero / Путешественник
- Day plan → Tagesplan / Programme du jour / Plan del día / План дня
- Documents → Dokumente / Documents / Documentos / Документы
- Document → Dokument / Document / Documento / Документ
- Settings → Einstellungen / Paramètres / Ajustes / Настройки
- Account → Konto / Compte / Cuenta / Аккаунт
- Booking / Reservation → Buchung / Réservation / Reserva / Бронирование
- Flight → Flug / Vol / Vuelo / Рейс
- Hotel / Stay → Hotel / Hôtel / Hotel / Отель
- Train → Zug / Train / Tren / Поезд
- Activity → Aktivität / Activité / Actividad / Активность
- Restaurant → Restaurant / Restaurant / Restaurante / Ресторан
- Checklist → Checkliste / Liste de contrôle / Lista de tareas / Чек-лист
- Note → Notiz / Note / Nota / Заметка
- Weather → Wetter / Météo / Clima / Погода
- Currency → Währung / Devise / Moneda / Валюта
- Map → Karte / Carte / Mapa / Карта
- Notification / Alert → Benachrichtigung / Notification / Notificación / Уведомление
- Subscription → Abo / Abonnement / Suscripción / Подписка

## Core verbs / actions (buttons — keep short, native UI terms)

- Save → Speichern / Enregistrer / Guardar / Сохранить
- Delete → Löschen / Supprimer / Eliminar / Удалить
- Edit → Bearbeiten / Modifier / Editar / Изменить
- Add → Hinzufügen / Ajouter / Añadir / Добавить
- Remove → Entfernen / Retirer / Quitar / Убрать
- Cancel → Abbrechen / Annuler / Cancelar / Отмена
- Confirm → Bestätigen / Confirmer / Confirmar / Подтвердить
- Continue → Fortfahren / Continuer / Continuar / Продолжить
- Clear → Leeren / Effacer / Borrar / Очистить  (NOT the same word as Delete)
- Import → Importieren / Importer / Importar / Импорт
- Export → Exportieren / Exporter / Exportar / Экспорт
- Search → Suchen / Rechercher / Buscar / Поиск
- Refresh → Aktualisieren / Actualiser / Actualizar / Обновить
- Close → Schließen / Fermer / Cerrar / Закрыть
- Back → Zurück / Retour / Atrás / Назад
- Next → Weiter / Suivant / Siguiente / Далее
- Done → Fertig / Terminé / Hecho / Готово
- Sign in → Anmelden / Se connecter / Iniciar sesión / Войти
- Sign out → Abmelden / Se déconnecter / Cerrar sesión / Выйти

## States / labels

- Offline → Offline / Hors ligne / Sin conexión / Офлайн
- Optional → Optional / Facultatif / Opcional / Необязательно
- Required → Erforderlich / Obligatoire / Obligatorio / Обязательно
- Today → Heute / Aujourd’hui / Hoy / Сегодня
- Tomorrow → Morgen / Demain / Mañana / Завтра
- Upcoming → Bevorstehend / À venir / Próximos / Предстоящие
- Past → Vergangen / Passés / Pasados / Прошедшие
- Cancelled → Storniert / Annulés / Cancelados / Отменённые
- Loading… → Lädt… / Chargement… / Cargando… / Загрузка…

## Corrections to the previous (bad) pass — MUST be applied

- "Travel essentials": de was Russian "Для путешествия" → **Reise-Essentials**;
  ru was "В путешествие" → **Всё для поездки**. (fr "Essentiels de voyage", es "Esenciales de viaje" OK.)
- Hotel: de k80 was Russian "Отель" → **Hotel**.
- Clear: de must be **Leeren** (not "Löschen", which is Delete).
- Never leave source English untranslated, and never let another language leak into a file.

## Rules

- Formality: German uses **Sie**; French uses **vous**; Spanish uses **tú** (friendly,
  consistent with existing copy); Russian uses **вы** (lowercase, friendly).
- Do NOT translate: "Tripto", "Tripto Plus", "Google", "eSIM", "PDF", "FAQ", brand names,
  airport/currency codes, flight numbers, user data.
- Keep punctuation style of the source (…, ·). French adds a thin space before ! ? : as
  already done in existing fr strings.
- Buttons: prefer the shortest natural term; do not lengthen unnecessarily.
