-- ================================================================
-- Migration 006: pgmq + pg_net push notifications
-- Replaces: Firebase FCM + Supabase Edge Function + webhooks
--
-- How it works:
--   DB trigger → pgmq queue → pg_net HTTP → Expo Push API → device
--
-- No google-services.json on server. No Firebase Admin SDK.
-- No Edge Function. Everything runs inside Postgres.
-- ================================================================

-- Enable pgmq
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create the queue
SELECT pgmq.create('push_notifications');

-- INR formatter
CREATE OR REPLACE FUNCTION public.format_inr(amount NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT '₹' || TO_CHAR(amount, 'FM999,99,99,999.99');
$$;

-- Core HTTP sender — calls Expo Push API via pg_net
CREATE OR REPLACE FUNCTION public.send_expo_push(
  p_token TEXT, p_title TEXT, p_body TEXT,
  p_data JSONB DEFAULT '{}'::JSONB,
  p_channel TEXT DEFAULT 'cashflow_entries',
  p_sound TEXT DEFAULT 'default',
  p_badge INT DEFAULT 1
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_payload JSONB; v_req_id BIGINT; v_expo_token TEXT; v_headers JSONB;
BEGIN
  IF p_token IS NULL OR p_token = '' OR NOT (p_token LIKE 'ExponentPushToken[%]') THEN
    RAISE LOG '[push] Skipped invalid token: %', COALESCE(p_token, 'NULL');
    RETURN NULL;
  END IF;
  v_payload := jsonb_build_object(
    'to', p_token, 'title', p_title, 'body', p_body,
    'sound', p_sound, 'badge', p_badge, 'priority', 'high',
    'channelId', p_channel, 'data', p_data
  );
  BEGIN
    SELECT decrypted_secret INTO v_expo_token FROM vault.decrypted_secrets WHERE name = 'expo_access_token' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_expo_token := NULL; END;
  v_headers := CASE
    WHEN v_expo_token IS NOT NULL AND v_expo_token <> ''
    THEN jsonb_build_object('Content-Type','application/json','Accept','application/json','Authorization','Bearer '||v_expo_token)
    ELSE '{"Content-Type":"application/json","Accept":"application/json"}'::JSONB
  END;
  SELECT net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_payload, params := '{}'::JSONB,
    headers := v_headers, timeout_milliseconds := 10000
  ) INTO v_req_id;
  RAISE LOG '[push] Queued id=% title=%', v_req_id, p_title;
  RETURN v_req_id;
END;
$$;

-- Message processor
CREATE OR REPLACE FUNCTION public.process_push_message(msg JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_type TEXT := msg->>'type'; v_book_id UUID := (msg->>'book_id')::UUID;
  v_actor_id UUID := (msg->>'actor_id')::UUID; v_amount TEXT := msg->>'amount';
  v_entry_type TEXT := msg->>'entry_type'; v_note TEXT := msg->>'note';
  v_invitee_email TEXT := msg->>'invitee_email';
  v_book_name TEXT; v_actor_name TEXT; v_title TEXT; v_body TEXT; v_channel TEXT;
  rec RECORD;
BEGIN
  IF v_type IN ('entry_added','entry_updated','entry_deleted') THEN
    SELECT name INTO v_book_name FROM public.books WHERE id = v_book_id;
    v_book_name := COALESCE(v_book_name, 'your book');
    SELECT COALESCE(full_name, split_part(email,'@',1),'A member') INTO v_actor_name FROM public.profiles WHERE id = v_actor_id;
    IF v_type = 'entry_added' THEN
      v_title := CASE v_entry_type WHEN 'cash_in' THEN '↑ '||v_amount||' Cash In — '||v_book_name ELSE '↓ '||v_amount||' Cash Out — '||v_book_name END;
      v_body := CASE WHEN v_note IS NOT NULL AND v_note <> '' THEN '"'||v_note||'" by '||v_actor_name ELSE v_actor_name||' added a '||CASE v_entry_type WHEN 'cash_in' THEN 'cash in' ELSE 'cash out' END||' entry' END;
      v_channel := 'cashflow_entries';
    ELSIF v_type = 'entry_updated' THEN
      v_title := '✏️ Entry Updated — '||v_book_name; v_body := v_actor_name||' edited a '||v_amount||' entry'; v_channel := 'cashflow_entries';
    ELSIF v_type = 'entry_deleted' THEN
      v_title := '🗑 Entry Removed — '||v_book_name; v_body := v_actor_name||' deleted an entry'; v_channel := 'cashflow_entries';
    END IF;
    FOR rec IN SELECT p.push_token FROM public.book_members bm JOIN public.profiles p ON p.id = bm.user_id WHERE bm.book_id = v_book_id AND bm.user_id <> v_actor_id AND p.push_token IS NOT NULL AND p.push_token LIKE 'ExponentPushToken[%]' LOOP
      PERFORM public.send_expo_push(rec.push_token, v_title, v_body, jsonb_build_object('type',v_type,'bookId',v_book_id), v_channel);
    END LOOP;
  ELSIF v_type = 'invitation_sent' THEN
    DECLARE v_inviter_name TEXT; v_invitee_token TEXT; BEGIN
      SELECT COALESCE(full_name,split_part(email,'@',1),'Someone') INTO v_inviter_name FROM public.profiles WHERE id = v_actor_id;
      SELECT name INTO v_book_name FROM public.books WHERE id = v_book_id;
      v_book_name := COALESCE(v_book_name,'a book');
      SELECT push_token INTO v_invitee_token FROM public.profiles WHERE email = v_invitee_email;
      IF v_invitee_token IS NOT NULL AND v_invitee_token LIKE 'ExponentPushToken[%]' THEN
        PERFORM public.send_expo_push(v_invitee_token,'📖 Book Invitation',v_inviter_name||' invited you to join "'||v_book_name||'"',jsonb_build_object('type','invitation','bookId',v_book_id),'cashflow_invitations');
      END IF;
    END;
  END IF;
END;
$$;

-- Trigger function
CREATE OR REPLACE FUNCTION public.notify_push_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_payload JSONB; v_msg_id BIGINT; v_msg pgmq.message_record; BEGIN
  IF TG_TABLE_NAME = 'entries' THEN
    v_payload := jsonb_build_object('type',CASE TG_OP WHEN 'INSERT' THEN 'entry_added' WHEN 'UPDATE' THEN 'entry_updated' ELSE 'entry_deleted' END,'book_id',COALESCE(NEW.book_id,OLD.book_id),'actor_id',COALESCE(NEW.user_id,OLD.user_id),'amount',public.format_inr(COALESCE(NEW.amount,OLD.amount)),'entry_type',COALESCE(NEW.type,OLD.type),'note',COALESCE(NEW.note,OLD.note));
  ELSIF TG_TABLE_NAME = 'invitations' AND TG_OP = 'INSERT' THEN
    v_payload := jsonb_build_object('type','invitation_sent','book_id',NEW.book_id,'actor_id',NEW.inviter_id,'invitee_email',NEW.invitee_email);
  ELSE RETURN COALESCE(NEW,OLD); END IF;
  SELECT pgmq.send('push_notifications', v_payload) INTO v_msg_id;
  SELECT * INTO v_msg FROM pgmq.read('push_notifications',0,1) WHERE msg_id = v_msg_id LIMIT 1;
  IF v_msg IS NOT NULL THEN PERFORM public.process_push_message(v_msg.message); PERFORM pgmq.delete('push_notifications',v_msg_id); END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;

-- Triggers
DROP TRIGGER IF EXISTS trg_push_entry_insert     ON public.entries;
DROP TRIGGER IF EXISTS trg_push_entry_update     ON public.entries;
DROP TRIGGER IF EXISTS trg_push_entry_delete     ON public.entries;
DROP TRIGGER IF EXISTS trg_push_invitation_insert ON public.invitations;

CREATE TRIGGER trg_push_entry_insert     AFTER INSERT ON public.entries     FOR EACH ROW EXECUTE FUNCTION public.notify_push_trigger();
CREATE TRIGGER trg_push_entry_update     AFTER UPDATE ON public.entries     FOR EACH ROW EXECUTE FUNCTION public.notify_push_trigger();
CREATE TRIGGER trg_push_entry_delete     AFTER DELETE ON public.entries     FOR EACH ROW EXECUTE FUNCTION public.notify_push_trigger();
CREATE TRIGGER trg_push_invitation_insert AFTER INSERT ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.notify_push_trigger();

-- Permissions
REVOKE ALL ON FUNCTION public.notify_push_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_push_message(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_expo_push(TEXT,TEXT,TEXT,JSONB,TEXT,TEXT,INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.format_inr(NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_push_trigger() TO postgres;
GRANT EXECUTE ON FUNCTION public.process_push_message(JSONB) TO postgres;
GRANT EXECUTE ON FUNCTION public.send_expo_push(TEXT,TEXT,TEXT,JSONB,TEXT,TEXT,INT) TO postgres;
GRANT EXECUTE ON FUNCTION public.format_inr(NUMERIC) TO postgres;
