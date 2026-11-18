import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/entities';

export type Executor = Pick<NodePgDatabase<typeof schema>, 'select' | 'insert'>;

@Injectable()
export class ProjectRolesRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Runs `fn` in a transaction holding a lock on one project, server and role
   * name, across every API process, so a retry waits for the first call and
   * finds its role. `fn` must use the transaction it is given: the lock holds
   * a pooled connection while Discord answers.
   */
  async withCreateLock<T>(
    projectId: string,
    serverId: string,
    name: string,
    fn: (tx: Executor) => Promise<T>,
  ): Promise<T> {
    const key = `project-role:${projectId}:${serverId}:${name}`;
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
      );
      return fn(tx);
    });
  }

  /** The role this project already created on this server under `name`. */
  async findOwnedRoleByName(
    projectId: string,
    serverId: string,
    name: string,
    executor: Executor = this.db,
  ): Promise<typeof schema.roles.$inferSelect | null> {
    const [row] = await executor
      .select({ role: schema.roles })
      .from(schema.projectCreatedRoles)
      .innerJoin(
        schema.roles,
        eq(schema.roles.id, schema.projectCreatedRoles.roleId),
      )
      .where(
        and(
          eq(schema.projectCreatedRoles.projectId, projectId),
          eq(schema.projectCreatedRoles.serverId, serverId),
          eq(schema.roles.name, name),
        ),
      )
      .limit(1);

    return row?.role ?? null;
  }

  async recordCreatedRole(
    params: {
      projectId: string;
      roleId: string;
      serverId: string;
    },
    executor: Executor = this.db,
  ): Promise<typeof schema.projectCreatedRoles.$inferSelect> {
    const [row] = await executor
      .insert(schema.projectCreatedRoles)
      .values({
        projectId: params.projectId,
        roleId: params.roleId,
        serverId: params.serverId,
      })
      .onConflictDoNothing()
      .returning();

    return row;
  }

  async isRoleCreatedByProject(
    projectId: string,
    roleId: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.projectCreatedRoles.id })
      .from(schema.projectCreatedRoles)
      .where(
        and(
          eq(schema.projectCreatedRoles.projectId, projectId),
          eq(schema.projectCreatedRoles.roleId, roleId),
        ),
      )
      .limit(1);

    return !!row;
  }

  async findRoleById(
    serverId: string,
    roleId: string,
  ): Promise<typeof schema.roles.$inferSelect | null> {
    const [role] = await this.db
      .select()
      .from(schema.roles)
      .where(
        and(eq(schema.roles.serverId, serverId), eq(schema.roles.id, roleId)),
      )
      .limit(1);

    return role ?? null;
  }

  /**
   * Records the grant locally. A member the sync has not stored yet is skipped
   * (the foreign key would fail); the gateway sync records it when it arrives.
   */
  async assignRoleToMember(discordId: string, roleId: string): Promise<void> {
    const [member] = await this.db
      .select({ id: schema.members.id })
      .from(schema.members)
      .where(eq(schema.members.id, discordId))
      .limit(1);
    if (!member) return;

    await this.db
      .insert(schema.serverMemberRoles)
      .values({
        memberId: discordId,
        roleId,
      })
      .onConflictDoNothing();
  }

  async removeRoleFromMember(discordId: string, roleId: string): Promise<void> {
    await this.db
      .delete(schema.serverMemberRoles)
      .where(
        and(
          eq(schema.serverMemberRoles.memberId, discordId),
          eq(schema.serverMemberRoles.roleId, roleId),
        ),
      );
  }

  async isRoleAssignedToMember(
    discordId: string,
    roleId: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ memberId: schema.serverMemberRoles.memberId })
      .from(schema.serverMemberRoles)
      .where(
        and(
          eq(schema.serverMemberRoles.memberId, discordId),
          eq(schema.serverMemberRoles.roleId, roleId),
        ),
      )
      .limit(1);

    return !!row;
  }
}
