import {
  Injectable,
  BadRequestException,
  BadGatewayException,
  NotFoundException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { DiscordService } from '../discord/discord.service';
import { AuditService } from '../audit/audit.service';
import { CreateInviteDto, InviteResponseDto } from './dto/create-invite.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  ListChannelsQueryDto,
  ChannelTypeFilter,
} from './dto/list-channels-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { EmbedDto } from './dto/embed.dto';
import {
  ChannelDetailResponseDto,
  ChannelPermissionOverwriteDto,
} from './dto/channel-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CreateChannelDto, ChannelCreateType } from './dto/create-channel.dto';
import { CreateChannelResponseDto } from './dto/create-channel-response.dto';
import Discord, { ChannelType, OverwriteType } from 'discord.js';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly auditService: AuditService,
  ) {}

  async createCategory(
    projectId: string | undefined,
    serverId: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    let channel: Discord.GuildChannel | null;
    try {
      channel = await this.discordService.createChannel(serverId, dto.name, {
        type: ChannelType.GuildCategory,
      });
      if (!channel) {
        throw new NotFoundException({
          code: 'SERVER_NOT_FOUND',
          message: 'Server not found or bot not connected',
        });
      }
    } catch (error: unknown) {
      this.handleDiscordError(error);
    }

    this.auditService.logAction({
      actionType: 'server',
      action: 'category_created',
      entityType: 'category',
      entityId: channel.id,
      details: {
        projectId: projectId ?? null,
        serverId,
        name: dto.name,
      },
      severity: 'info',
    });

    return {
      id: channel.id,
      name: channel.name,
    };
  }

  async createChannel(
    projectId: string | undefined,
    serverId: string,
    dto: CreateChannelDto,
  ): Promise<CreateChannelResponseDto> {
    if (dto.parentId) {
      const parentChannel = await this.discordService.getChannelById(
        dto.parentId,
      );
      if (
        !parentChannel ||
        parentChannel.isDMBased() ||
        !('guildId' in parentChannel) ||
        parentChannel.guildId !== serverId
      ) {
        throw new NotFoundException({
          code: 'PARENT_NOT_FOUND',
          message: 'Parent category not found',
        });
      }

      if (parentChannel.type !== ChannelType.GuildCategory) {
        throw new BadRequestException({
          code: 'INVALID_PARENT',
          message: 'parentId must be a category channel',
        });
      }
    }

    const discordChannelType =
      dto.type === ChannelCreateType.VOICE
        ? ChannelType.GuildVoice
        : ChannelType.GuildText;

    let channel: Discord.GuildChannel | null;
    try {
      channel = await this.discordService.createChannel(serverId, dto.name, {
        type: discordChannelType,
        parent: dto.parentId,
      });
      if (!channel) {
        throw new NotFoundException({
          code: 'SERVER_NOT_FOUND',
          message: 'Server not found or bot not connected',
        });
      }
    } catch (error: unknown) {
      this.handleDiscordError(error);
    }

    this.auditService.logAction({
      actionType: 'server',
      action: 'channel_created',
      entityType: 'channel',
      entityId: channel.id,
      details: {
        projectId: projectId ?? null,
        serverId,
        name: dto.name,
        type: dto.type,
        parentId: dto.parentId ?? null,
      },
      severity: 'info',
    });

    return {
      id: channel.id,
      name: channel.name,
      type: dto.type,
      parentId: channel.parentId ?? null,
    };
  }

  private handleDiscordError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error instanceof Discord.DiscordAPIError) {
      if (
        error.code === Discord.RESTJSONErrorCodes.MissingPermissions ||
        error.code === Discord.RESTJSONErrorCodes.MissingAccess ||
        error.status === 403
      ) {
        throw new BadGatewayException({
          code: 'DISCORD_FORBIDDEN',
          message: 'Discord bot lacks permissions to manage channels',
        });
      }

      if (error.status === 400 || error.code === 50035) {
        throw new BadRequestException({
          code: 'INVALID_CHANNEL_PARAMETERS',
          message: error.message || 'Invalid channel parameters',
        });
      }

      if (error.status === 404) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: 'Discord resource not found',
        });
      }

      throw new BadGatewayException({
        code: 'DISCORD_ERROR',
        message: `Discord API error: ${error.message}`,
      });
    }

    this.logger.error(
      `Unexpected error in channel operation: ${String(error)}`,
    );
    throw new BadGatewayException({
      code: 'DISCORD_ERROR',
      message: 'Failed to communicate with Discord',
    });
  }

  /** Creates an invite for a channel; the guard has already checked server and channel access. */
  async createInvite(
    projectId: string,
    serverId: string,
    channelId: string,
    dto: CreateInviteDto,
  ): Promise<InviteResponseDto> {
    let invite: Discord.Invite | null;
    try {
      invite = await this.discordService.createChannelInvite(channelId, {
        maxAge: dto.maxAgeSeconds,
        maxUses: dto.maxUses,
        reason: `Created by project ${projectId}`,
      });
    } catch (error: unknown) {
      this.logger.warn(error instanceof Error ? error.message : String(error));
      throw new BadGatewayException({
        code: 'DISCORD_ERROR',
        message: 'Discord rejected the invite or the bot lacks permission',
      });
    }

    if (!invite) {
      throw new NotFoundException({
        code: 'CHANNEL_NOT_FOUND',
        message: 'Channel does not exist or bot lacks access',
      });
    }

    this.auditService.logAction({
      actionType: 'server',
      action: 'channel_invite_created',
      entityType: 'channel',
      entityId: channelId,
      details: {
        projectId,
        serverId,
        code: invite.code,
        maxAgeSeconds: dto.maxAgeSeconds ?? null,
        maxUses: dto.maxUses ?? null,
      },
      severity: 'info',
    });

    return {
      code: invite.code,
      url: invite.url,
      expiresAt: invite.expiresAt?.toISOString() ?? null,
    };
  }

  async sendMessage(
    serverId: string,
    channelId: string,
    dto: SendMessageDto,
  ): Promise<{
    id: string;
    channelId: string;
    content: string;
    timestamp: string;
    author: { id: string; username: string };
  }> {
    if (!dto.content?.length && !dto.embeds?.length) {
      throw new BadRequestException({
        code: 'INVALID_CONTENT',
        message: 'Either content or embeds must be provided',
      });
    }

    const options: Discord.MessageCreateOptions = {};

    if (dto.content) {
      options.content = dto.content;
    }

    if (dto.embeds?.length) {
      options.embeds = dto.embeds.map((e) => this.buildEmbed(e));
    }

    if (dto.tts) {
      options.tts = true;
    }

    if (dto.allowed_mentions) {
      options.allowedMentions = {};
      if (dto.allowed_mentions.parse?.length) {
        options.allowedMentions.parse = dto.allowed_mentions.parse;
      }
      if (dto.allowed_mentions.users?.length) {
        options.allowedMentions.users = dto.allowed_mentions.users;
      }
      if (dto.allowed_mentions.roles?.length) {
        options.allowedMentions.roles = dto.allowed_mentions.roles;
      }
    }

    const message = await this.discordService.sendMessage(channelId, options);

    if (!message) {
      throw new NotFoundException({
        code: 'CHANNEL_NOT_FOUND',
        message: 'Channel does not exist or bot lacks access',
      });
    }

    return {
      id: message.id,
      channelId: message.channelId,
      content: message.content,
      timestamp: message.createdAt.toISOString(),
      author: {
        id: message.author.id,
        username: message.author.username,
      },
    };
  }

  private buildEmbed(dto: EmbedDto): Discord.APIEmbed {
    const embed: Discord.APIEmbed = {};

    if (dto.title) embed.title = dto.title;
    if (dto.description) embed.description = dto.description;
    if (dto.url) embed.url = dto.url;
    if (dto.color !== undefined) embed.color = dto.color;

    if (dto.image) embed.image = { url: dto.image.url };
    if (dto.thumbnail) embed.thumbnail = { url: dto.thumbnail.url };

    if (dto.footer) {
      embed.footer = { text: dto.footer.text };
      if (dto.footer.icon_url) embed.footer.icon_url = dto.footer.icon_url;
    }

    if (dto.author) {
      embed.author = { name: dto.author.name };
      if (dto.author.url) embed.author.url = dto.author.url;
      if (dto.author.icon_url) embed.author.icon_url = dto.author.icon_url;
    }

    return embed;
  }

  private channelTypeToString(type: ChannelType): string {
    switch (type) {
      case ChannelType.GuildText:
        return 'text';
      case ChannelType.GuildVoice:
        return 'voice';
      case ChannelType.GuildAnnouncement:
        return 'announcement';
      case ChannelType.GuildCategory:
        return 'category';
      default:
        return 'unknown';
    }
  }

  async listChannels(serverId: string, query: ListChannelsQueryDto) {
    const channels = await this.discordService.getGuildChannels(serverId);

    if (!channels) {
      throw new NotFoundException({
        code: 'SERVER_NOT_FOUND',
        message: 'Server not found or bot not connected',
      });
    }

    const channelEntries = [...channels.values()].filter(
      (ch): ch is Discord.NonThreadGuildBasedChannel => {
        if (!ch) return false;
        if (ch.isDMBased()) return false;

        if (query.type && query.type !== ChannelTypeFilter.ALL) {
          const typeStr = this.channelTypeToString(ch.type);
          if (typeStr !== (query.type as string)) return false;
        }

        if (query.categoryId && ch.parentId !== query.categoryId) {
          return false;
        }

        return true;
      },
    );

    const categories: {
      id: string;
      name: string;
      position: number;
      children: string[];
    }[] = [];

    const categoryMap = new Map<
      string,
      { id: string; name: string; position: number; children: string[] }
    >();

    const channelList = channelEntries.map((ch) => {
      const isCategory = ch.type === ChannelType.GuildCategory;

      if (isCategory) {
        const cat = {
          id: ch.id,
          name: ch.name,
          position: ch.position,
          children: [] as string[],
        };
        categoryMap.set(ch.id, cat);
        categories.push(cat);
      }

      return {
        id: ch.id,
        name: ch.name,
        type: this.channelTypeToString(ch.type),
        position: ch.position,
        parentId: ch.parentId ?? null,
        topic: 'topic' in ch ? (ch.topic ?? null) : null,
        nsfw: 'nsfw' in ch ? ch.nsfw : false,
        permissionOverwrites: ch.permissionOverwrites.cache.size > 0,
      };
    });

    for (const ch of channelEntries) {
      if (ch.parentId && categoryMap.has(ch.parentId)) {
        categoryMap.get(ch.parentId)!.children.push(ch.id);
      }
    }

    return { channels: channelList, categories };
  }

  async getChannel(
    serverId: string,
    channelId: string,
  ): Promise<ChannelDetailResponseDto> {
    const channel = await this.discordService.getChannelById(channelId);

    if (!channel || channel.isDMBased()) {
      throw new NotFoundException({
        code: 'CHANNEL_NOT_FOUND',
        message: 'Channel does not exist or bot lacks access',
      });
    }

    const overwrites: ChannelPermissionOverwriteDto[] =
      'permissionOverwrites' in channel
        ? [...channel.permissionOverwrites.cache.values()].map((o) => ({
            id: o.id,
            type: o.type === OverwriteType.Role ? 'role' : 'member',
            allow: o.allow.bitfield.toString(),
            deny: o.deny.bitfield.toString(),
          }))
        : [];

    return {
      id: channel.id,
      name: 'name' in channel ? channel.name : 'Unknown',
      type: this.channelTypeToString(channel.type),
      position: 'position' in channel ? channel.position : 0,
      parentId: 'parentId' in channel ? (channel.parentId ?? null) : null,
      topic: 'topic' in channel ? (channel.topic ?? null) : null,
      nsfw: 'nsfw' in channel ? channel.nsfw : false,
      lastMessageId:
        'lastMessageId' in channel ? (channel.lastMessageId ?? null) : null,
      createdAt: channel.createdAt?.toISOString() ?? new Date().toISOString(),
      permissionOverwrites: overwrites.length > 0,
      overwrites,
    };
  }

  async getMessages(
    serverId: string,
    channelId: string,
    query: ListMessagesQueryDto,
  ) {
    const fetchOptions: Discord.FetchMessagesOptions = {
      limit: Math.min(query.limit ?? 50, 100),
    };

    if (query.before) fetchOptions.before = query.before;
    if (query.after) fetchOptions.after = query.after;

    const messages = await this.discordService.getChannelMessages(
      channelId,
      fetchOptions,
    );

    if (!messages) {
      throw new NotFoundException({
        code: 'CHANNEL_NOT_FOUND',
        message: 'Channel does not exist or bot lacks access',
      });
    }

    const rawMessages = [...messages.values()];
    // hasMore reflects whether Discord's raw page was full, not the count
    // after client-side authorId filtering — otherwise filtering down to a
    // handful of matches would falsely report no more messages available.
    const hasMore = rawMessages.length === (query.limit ?? 50);

    let messageList = rawMessages;

    if (query.authorId) {
      messageList = messageList.filter(
        (msg) => msg.author.id === query.authorId,
      );
    }

    return {
      messages: messageList.map((msg) => ({
        id: msg.id,
        content: msg.content,
        author: {
          id: msg.author.id,
          username: msg.author.username,
          avatar: msg.author.avatar ?? null,
        },
        timestamp: msg.createdAt.toISOString(),
        embeds: msg.embeds.map((e) => ({
          title: e.title ?? null,
          description: e.description ?? null,
          url: e.url ?? null,
          color: e.color ?? null,
          type: String(e.data.type),
        })),
        attachments: msg.attachments.map((a) => ({
          id: a.id,
          url: a.url,
          filename: a.name,
          size: a.size,
        })),
        mentions: [
          ...[...msg.mentions.users.values()].map((u) => ({
            id: u.id,
            name: u.username,
          })),
          ...[...msg.mentions.roles.values()].map((r) => ({
            id: r.id,
            name: r.name,
          })),
        ],
      })),
      hasMore,
    };
  }
}
