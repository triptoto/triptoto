PRAGMA foreign_keys = ON;

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK(file_size >= 0),
  checksum TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'other' CHECK(document_type IN ('boarding_pass','ticket','hotel_confirmation','reservation','voucher','qr_code','other')),
  server_status TEXT NOT NULL DEFAULT 'uploaded' CHECK(server_status IN ('uploaded','processing','ready','unsupported','failed','removed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE document_trip_items (
  document_id TEXT NOT NULL,
  trip_item_id TEXT NOT NULL,
  PRIMARY KEY(document_id, trip_item_id),
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY(trip_item_id) REFERENCES trip_items(id) ON DELETE CASCADE
);

CREATE TABLE document_travelers (
  document_id TEXT NOT NULL,
  traveler_id TEXT NOT NULL,
  PRIMARY KEY(document_id, traveler_id),
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY(traveler_id) REFERENCES travelers(id) ON DELETE CASCADE
);

CREATE INDEX idx_documents_trip ON documents(trip_id, deleted_at, server_status);
