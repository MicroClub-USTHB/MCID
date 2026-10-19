/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { DiscordService } from '../discord/discord.service';
import { SyncService } from './sync.service';
import { Client, Guild, GuildMember, User, Role } from 'discord.js';

// A reconnect that loses the session fires shardReady more than once close
// together when the connection flaps, so the catch-up waits this long and then
// runs once. It reads the state of Discord at that moment, so it also covers
// every reconnect inside the window.
const RECONNECT_SYNC_DELAY_MS = 60_000;

@Injectable()
export class SyncListener
  implements OnModuleInit, OnModuleDestroy, OnApplicationBootstrap
{
  private readonly logger = new Logger(SyncListener.name);
  private client: Client;
  private readonly readyShards = new Set<number>();
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly discordService: DiscordService,
    private readonly syncService: SyncService,
  ) {
    this.client = this.discordService.getClient();
  }

  onModuleInit() {
    this.logger.log('Registering Discord event listeners for sync');

    // Member events
    this.client.on('guildMemberAdd', this.handleGuildMemberAdd.bind(this));
    this.client.on(
      'guildMemberRemove',
      this.handleGuildMemberRemove.bind(this),
    );
    this.client.on(
      'guildMemberUpdate',
      this.handleGuildMemberUpdate.bind(this),
    );
    this.client.on('userUpdate', this.handleUserUpdate.bind(this));

    // Gateway session events
    this.client.on('shardReady', this.handleShardReady.bind(this));
    this.client.on('shardResume', this.handleShardResume.bind(this));

    // Role events
    this.client.on('roleCreate', this.handleRoleCreate.bind(this));
    this.client.on('roleUpdate', this.handleRoleUpdate.bind(this));
    this.client.on('roleDelete', this.handleRoleDelete.bind(this));

    // Guild (server) lifecycle events
    this.client.on('guildCreate', this.handleGuildCreate.bind(this));
    this.client.on('guildUpdate', this.handleGuildUpdate.bind(this));
    this.client.on('guildDelete', this.handleGuildDelete.bind(this));
  }

  onApplicationBootstrap() {
    // All modules are ready — safe to query the DB now
    if (this.discordService.isBotReady()) {
      this.scheduleStartupSync();
    } else {
      this.discordService.onBotReady(() => this.scheduleStartupSync());
    }
  }

  onModuleDestroy() {
    this.logger.log('Removing Discord event listeners');
    this.client.removeAllListeners('guildMemberAdd');
    this.client.removeAllListeners('guildMemberRemove');
    this.client.removeAllListeners('guildMemberUpdate');
    this.client.removeAllListeners('userUpdate');
    this.client.removeAllListeners('roleCreate');
    this.client.removeAllListeners('roleUpdate');
    this.client.removeAllListeners('roleDelete');
    this.client.removeAllListeners('guildCreate');
    this.client.removeAllListeners('guildUpdate');
    this.client.removeAllListeners('guildDelete');
    this.client.removeAllListeners('shardReady');
    this.client.removeAllListeners('shardResume');
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  // ─── Startup ────────────────────────────────────────────────────

  private scheduleStartupSync(): void {
    this.syncService.startupSyncAll().catch((err: unknown) => {
      this.logger.error(
        'Startup sync failed',
        err instanceof Error ? err.stack : String(err),
      );
    });
  }

  // ─── Gateway session events ─────────────────────────────────────

  /**
   * discord.js emits shardReady on every READY packet: the first connection
   * and any reconnect where Discord could not resume the session (a resume
   * emits shardResume instead). Events sent during that gap are gone, so every
   * shardReady after the shard's first one schedules a catch-up sync. The first
   * one is the boot, which scheduleStartupSync already covers.
   */
  private handleShardReady(shardId: number): void {
    if (!this.readyShards.has(shardId)) {
      this.readyShards.add(shardId);
      return;
    }
    this.logger.warn(
      `Shard ${shardId} started a new session after a disconnect, scheduling a catch-up sync`,
    );
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.syncService.startupSyncAll('reconnect').catch((err: unknown) => {
        this.logger.error(
          'Reconnect sync failed',
          err instanceof Error ? err.stack : String(err),
        );
      });
    }, RECONNECT_SYNC_DELAY_MS);
    this.reconnectTimer.unref?.();
  }

  // Discord replays the missed events on a resume, so nothing to catch up.
  private handleShardResume(shardId: number, replayedEvents: number): void {
    this.logger.debug(
      `Shard ${shardId} resumed, ${replayedEvents} event(s) replayed`,
    );
  }

  // ─── Guild (Server) Events ──────────────────────────────────────

  private async handleGuildCreate(guild: Guild): Promise<void> {
    try {
      await this.syncService.handleGuildCreate(guild);
    } catch (error) {
      this.logger.error(
        `Error in guildCreate handler: ${error.message}`,
        error.stack,
      );
    }
  }

  private async handleGuildDelete(guild: Guild): Promise<void> {
    try {
      await this.syncService.handleGuildDelete(guild);
    } catch (error) {
      this.logger.error(
        `Error in guildDelete handler: ${error.message}`,
        error.stack,
      );
    }
  }

  private async handleGuildUpdate(
    oldGuild: Guild,
    newGuild: Guild,
  ): Promise<void> {
    try {
      await this.syncService.handleGuildUpdate(oldGuild, newGuild);
    } catch (error) {
      this.logger.error(
        `Error in guildUpdate handler: ${error.message}`,
        error.stack,
      );
    }
  }

  // ─── Member Events ──────────────────────────────────────────────

  private async handleGuildMemberAdd(member: GuildMember): Promise<void> {
    try {
      await this.syncService.handleMemberAdd(member);
    } catch (error) {
      this.logger.error(
        `Error in guildMemberAdd handler: ${error.message}`,
        error.stack,
      );
    }
  }

  private async handleGuildMemberRemove(member: GuildMember): Promise<void> {
    try {
      await this.syncService.handleMemberRemove(member);
    } catch (error) {
      this.logger.error(
        `Error in guildMemberRemove handler: ${error.message}`,
        error.stack,
      );
    }
  }

  private async handleGuildMemberUpdate(
    oldMember: GuildMember,
    newMember: GuildMember,
  ): Promise<void> {
    try {
      await this.syncService.handleMemberUpdate(oldMember, newMember);
    } catch (error) {
      this.logger.error(
        `Error in guildMemberUpdate handler: ${error.message}`,
        error.stack,
      );
    }
  }

  private async handleUserUpdate(oldUser: User, newUser: User): Promise<void> {
    try {
      await this.syncService.handleUserUpdate(oldUser, newUser);
    } catch (error) {
      this.logger.error(
        `Error in userUpdate handler: ${error.message}`,
        error.stack,
      );
    }
  }

  // ─── Role Events ────────────────────────────────────────────────

  private async handleRoleCreate(role: Role): Promise<void> {
    try {
      await this.syncService.handleRoleCreate(role);
    } catch (error) {
      this.logger.error(
        `Error in roleCreate handler: ${error.message}`,
        error.stack,
      );
    }
  }

  private async handleRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
    try {
      await this.syncService.handleRoleUpdate(newRole);
    } catch (error) {
      this.logger.error(
        `Error in roleUpdate handler: ${error.message}`,
        error.stack,
      );
    }
  }

  private async handleRoleDelete(role: Role): Promise<void> {
    try {
      await this.syncService.handleRoleDelete(role);
    } catch (error) {
      this.logger.error(
        `Error in roleDelete handler: ${error.message}`,
        error.stack,
      );
    }
  }
}
