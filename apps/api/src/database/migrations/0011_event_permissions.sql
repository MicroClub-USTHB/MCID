INSERT INTO "permissions" ("key", "description") VALUES
  ('EVENTS.CREATE', 'Create events on the Event Platform'),
  ('EVENTS.RESPONSES.READ', 'Read responses submitted to events'),
  ('EVENTS.EMAIL.SEND', 'Send emails to event participants'),
  ('EVENTS.REVIEW', 'Review event submissions'),
  ('EVENTS.CHECKIN', 'Check participants in at events'),
  ('EVENTS.TEMPLATES.MANAGE', 'Manage event templates')
ON CONFLICT ("key") DO NOTHING;