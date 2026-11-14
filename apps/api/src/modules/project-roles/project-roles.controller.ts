import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { RequireScope } from '../../common/decorators/require-scope.decorator';
import { ProjectRolesService } from './project-roles.service';
import { CreateProjectRoleDto } from './dto/create-project-role.dto';
import { ProjectRoleResponseDto } from './dto/project-role-response.dto';
import * as schema from '../../database/entities';

interface RequestWithProject extends Request {
  project?: typeof schema.projects.$inferSelect;
}

@ApiTags('Roles')
@ApiSecurity('api-key')
@Controller('servers/:serverId')
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ProjectRolesController {
  constructor(private readonly projectRolesService: ProjectRolesService) {}

  @Post('roles')
  @RequireScope('manage_roles')
  @ApiOperation({
    summary: 'Create a Discord role for an event or project',
    description:
      'Creates a new Discord role with no permissions by default (0n bitfield) ' +
      'and records project ownership. The role can subsequently be granted and removed ' +
      'by the same project using the member role endpoints.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '987654321098765432',
  })
  @ApiCreatedResponse({
    description: 'Role created successfully',
    type: ProjectRoleResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input payload' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key' })
  @ApiForbiddenResponse({
    description: 'Project lacks manage_roles scope on this server',
  })
  @ApiNotFoundResponse({ description: 'Server not found' })
  async createRole(
    @Param('serverId') serverId: string,
    @Body() dto: CreateProjectRoleDto,
    @Req() req: RequestWithProject,
  ): Promise<ProjectRoleResponseDto> {
    const projectId = req.project?.id;
    return this.projectRolesService.createRole(projectId!, serverId, dto);
  }

  @Put('members/:discordId/roles/:roleId')
  @RequireScope('manage_roles')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Grant a project-created role to a member',
    description:
      'Grants a role to a member of the server. Only roles previously created ' +
      'by the calling project can be granted; attempts to grant executive, root, ' +
      'or unowned roles will return 403 Forbidden and record an audit log.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '987654321098765432',
  })
  @ApiParam({
    name: 'discordId',
    description: 'Discord member ID',
    example: '123456789012345678',
  })
  @ApiParam({
    name: 'roleId',
    description: 'Discord role ID to grant',
    example: '555666777888999000',
  })
  @ApiNoContentResponse({
    description: 'Role granted successfully (or already held)',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key' })
  @ApiForbiddenResponse({
    description:
      'Project lacks manage_roles scope, role was not created by this project, or role is protected',
  })
  @ApiNotFoundResponse({ description: 'Server, member, or role not found' })
  async grantRole(
    @Param('serverId') serverId: string,
    @Param('discordId') discordId: string,
    @Param('roleId') roleId: string,
    @Req() req: RequestWithProject,
  ): Promise<void> {
    const projectId = req.project?.id;
    await this.projectRolesService.grantRoleToMember(
      projectId!,
      serverId,
      discordId,
      roleId,
    );
  }

  @Delete('members/:discordId/roles/:roleId')
  @RequireScope('manage_roles')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a project-created role from a member',
    description:
      'Removes a role from a member of the server. Only roles previously created ' +
      'by the calling project can be removed; attempts to remove executive, root, ' +
      'or unowned roles will return 403 Forbidden and record an audit log.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '987654321098765432',
  })
  @ApiParam({
    name: 'discordId',
    description: 'Discord member ID',
    example: '123456789012345678',
  })
  @ApiParam({
    name: 'roleId',
    description: 'Discord role ID to remove',
    example: '555666777888999000',
  })
  @ApiNoContentResponse({
    description: 'Role removed successfully (or not held)',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key' })
  @ApiForbiddenResponse({
    description:
      'Project lacks manage_roles scope, role was not created by this project, or role is protected',
  })
  @ApiNotFoundResponse({ description: 'Server, member, or role not found' })
  async removeRole(
    @Param('serverId') serverId: string,
    @Param('discordId') discordId: string,
    @Param('roleId') roleId: string,
    @Req() req: RequestWithProject,
  ): Promise<void> {
    const projectId = req.project?.id;
    await this.projectRolesService.removeRoleFromMember(
      projectId!,
      serverId,
      discordId,
      roleId,
    );
  }
}
