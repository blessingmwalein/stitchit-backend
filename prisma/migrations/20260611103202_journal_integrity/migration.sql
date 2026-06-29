-- Accounting integrity: a journal line is either a debit or a credit (never both, never negative),
-- and a POSTED journal entry's lines must balance. Enforced at the database level so no code path
-- can corrupt the books.

ALTER TABLE "JournalLine"
  ADD CONSTRAINT "journal_line_debit_xor_credit"
  CHECK (
    debit >= 0 AND credit >= 0
    AND NOT (debit > 0 AND credit > 0)
    AND (debit + credit) > 0
  );

-- Deferred constraint trigger: re-validate entry balance at COMMIT for any touched entry.
CREATE OR REPLACE FUNCTION check_journal_entry_balanced()
RETURNS TRIGGER AS $$
DECLARE
  entry_id TEXT;
  entry_status TEXT;
  d NUMERIC;
  c NUMERIC;
BEGIN
  entry_id := COALESCE(NEW."journalEntryId", OLD."journalEntryId");

  SELECT status INTO entry_status FROM "JournalEntry" WHERE id = entry_id;
  IF entry_status IS NULL THEN
    RETURN NULL; -- entry deleted in same tx (cascade)
  END IF;

  IF entry_status = 'POSTED' THEN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
      INTO d, c
      FROM "JournalLine" WHERE "journalEntryId" = entry_id;
    IF d <> c THEN
      RAISE EXCEPTION 'Journal entry % is not balanced: debits % <> credits %', entry_id, d, c;
    END IF;
    IF d = 0 THEN
      RAISE EXCEPTION 'Posted journal entry % has no lines', entry_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_entry_balanced
AFTER INSERT OR UPDATE OR DELETE ON "JournalLine"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_journal_entry_balanced();

-- Posted entries are immutable: block updates/deletes of lines belonging to a POSTED entry.
-- (Posting inserts lines while status is DRAFT, then flips the entry to POSTED.)
CREATE OR REPLACE FUNCTION block_posted_journal_mutation()
RETURNS TRIGGER AS $$
DECLARE
  entry_status TEXT;
BEGIN
  SELECT status INTO entry_status FROM "JournalEntry" WHERE id = OLD."journalEntryId";
  IF entry_status = 'POSTED' THEN
    RAISE EXCEPTION 'Journal entry % is POSTED and immutable; create a reversal instead', OLD."journalEntryId";
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_line_immutable
BEFORE UPDATE OR DELETE ON "JournalLine"
FOR EACH ROW EXECUTE FUNCTION block_posted_journal_mutation();
