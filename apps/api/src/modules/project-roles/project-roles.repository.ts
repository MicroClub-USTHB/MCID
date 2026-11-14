import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/entities';

@Injectable()
export class ProjectRolesRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async recordCreatedRole(params: {
    projectId: string;
    roleId: string;
    serverId: string;
  }): Promise<typeof schema.projectCreatedRoles.$inferSelect> {
    const [row] = await this.db
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

  async assignRoleToMember(discordId: string, roleId: string): Promise<void> {
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
