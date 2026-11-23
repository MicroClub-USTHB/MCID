import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/entities';
import {
  members,
  memberIdentities,
  serverMemberRoles,
} from '../../database/entities';
import type { MemberIdentity } from '../../database/entities';

@Injectable()
export class IdentitiesRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async memberExists(memberId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1);
    return row !== undefined;
  }

  /** The member that already owns this account, if any. */
  async findOwner(provider: string, handle: string): Promise<string | null> {
    const [row] = await this.db
      .select({ memberId: memberIdentities.memberId })
      .from(memberIdentities)
      .where(
        and(
          eq(memberIdentities.provider, provider),
          eq(memberIdentities.handle, handle),
        ),
      )
      .limit(1);
    return row?.memberId ?? null;
  }

  /** Sets (or replaces) the member's account for a provider. */
  async upsert(data: {
    memberId: string;
    provider: string;
    handle: string;
  }): Promise<MemberIdentity> {
    const [row] = await this.db
      .insert(memberIdentities)
      .values(data)
      .onConflictDoUpdate({
        target: [memberIdentities.memberId, memberIdentities.provider],
        // A changed handle is no longer the account that was verified.
        set: {
          handle: data.handle,
          externalId: null,
          verifiedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async remove(memberId: string, provider: string): Promise<boolean> {
    const rows = await this.db
      .delete(memberIdentities)
      .where(
        and(
          eq(memberIdentities.memberId, memberId),
          eq(memberIdentities.provider, provider),
        ),
      )
      .returning({ id: memberIdentities.id });
    return rows.length > 0;
  }

  /**
   * Identities for one provider. With `roleIds`, only members holding at
   * least one of those Discord roles in any server.
   */
  async list(
    provider: string,
    roleIds?: string[],
  ): Promise<Array<{ memberId: string; handle: string; verified: boolean }>> {
    const rows = await this.db
      .select({
        memberId: memberIdentities.memberId,
        handle: memberIdentities.handle,
        verifiedAt: memberIdentities.verifiedAt,
      })
      .from(memberIdentities)
      .where(
        roleIds === undefined
          ? eq(memberIdentities.provider, provider)
          : and(
              eq(memberIdentities.provider, provider),
              inArray(
                memberIdentities.memberId,
                this.db
                  .select({ id: serverMemberRoles.memberId })
                  .from(serverMemberRoles)
                  .where(inArray(serverMemberRoles.roleId, roleIds)),
              ),
            ),
      );
    return rows.map((r) => ({
      memberId: r.memberId,
      handle: r.handle,
      verified: r.verifiedAt !== null,
    }));
  }
}
