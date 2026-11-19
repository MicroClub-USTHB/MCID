import { SetMetadata } from '@nestjs/common';

export const HIDE_INACCESSIBLE_SERVER_KEY = 'hide_inaccessible_server';

/**
 * Answers 404 instead of 403 when the project is not mapped to the server (or
 * the server is inactive), so the route never reveals whether the server exists.
 */
export const HideInaccessibleServer = () =>
  SetMetadata(HIDE_INACCESSIBLE_SERVER_KEY, true);
