import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const EVENT_PERMISSIONS = [
  'EVENTS.CREATE',
  'EVENTS.RESPONSES.READ',
  'EVENTS.EMAIL.SEND',
  'EVENTS.REVIEW',
  'EVENTS.CHECKIN',
  'EVENTS.TEMPLATES.MANAGE',
];

function readEventPermissionsMigration(): string {
  const dir = join(__dirname, 'migrations');
  const file = readdirSync(dir).find((name) =>
    name.endsWith('event_permissions.sql'),
  );
  if (!file) {
    throw new Error('No *_event_permissions.sql migration found');
  }
  return readFileSync(join(dir, file), 'utf8');
}

describe('event permissions migration', () => {
  it('inserts all six event permissions', () => {
    const sql = readEventPermissionsMigration();
    for (const key of EVENT_PERMISSIONS) {
      expect(sql).toContain(`'${key}'`);
    }
  });

  it('can run twice without creating duplicates', () => {
    const sql = readEventPermissionsMigration();
    expect(sql).toMatch(/ON CONFLICT \("key"\) DO NOTHING/i);
  });
});
