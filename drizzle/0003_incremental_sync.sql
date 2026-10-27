CREATE TABLE sync_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  UNIQUE(collection, id)
);
CREATE INDEX sync_changes_collection_sequence ON sync_changes(collection, sequence);
INSERT INTO sync_changes(collection, id) SELECT 'solves', id FROM solves;
INSERT INTO sync_changes(collection, id) SELECT 'lesson_attempts', id FROM lesson_attempts;
CREATE TRIGGER solves_sync_insert AFTER INSERT ON solves BEGIN
  DELETE FROM sync_changes WHERE collection = 'solves' AND id = NEW.id;
  INSERT INTO sync_changes(collection, id) VALUES('solves', NEW.id);
END;
CREATE TRIGGER solves_sync_update AFTER UPDATE ON solves BEGIN
  DELETE FROM sync_changes WHERE collection = 'solves' AND id = NEW.id;
  INSERT INTO sync_changes(collection, id) VALUES('solves', NEW.id);
END;
CREATE TRIGGER lessons_sync_insert AFTER INSERT ON lesson_attempts BEGIN
  DELETE FROM sync_changes WHERE collection = 'lesson_attempts' AND id = NEW.id;
  INSERT INTO sync_changes(collection, id) VALUES('lesson_attempts', NEW.id);
END;
CREATE TRIGGER lessons_sync_update AFTER UPDATE ON lesson_attempts BEGIN
  DELETE FROM sync_changes WHERE collection = 'lesson_attempts' AND id = NEW.id;
  INSERT INTO sync_changes(collection, id) VALUES('lesson_attempts', NEW.id);
END;
