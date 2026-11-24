import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentitiesRepository } from './identities.repository';
import {
  IDENTITY_PROVIDERS,
  isIdentityProvider,
  type IdentityProvider,
} from './identity-providers';

@Injectable()
export class IdentitiesService {
  constructor(private readonly repository: IdentitiesRepository) {}

  /**
   * Checks a (member, handle) pair without writing anything, so a bad
   * submission can be refused before it is stored. Returns the handle in its
   * canonical form.
   */
  async assertLinkable(
    memberId: string,
    provider: string,
    rawHandle: string,
  ): Promise<string> {
    if (!isIdentityProvider(provider)) {
      throw new BadRequestException(`Unknown identity provider "${provider}"`);
    }
    const handle = IDENTITY_PROVIDERS[provider].normalizeHandle(rawHandle);
    if (handle === null) {
      throw new BadRequestException(
        `"${rawHandle}" is not a valid ${provider} username`,
      );
    }
    if (!(await this.repository.memberExists(memberId))) {
      throw new NotFoundException('Member not found');
    }
    const owner = await this.repository.findOwner(provider, handle);
    if (owner !== null && owner !== memberId) {
      throw new ConflictException(
        `This ${provider} account is already linked to another member`,
      );
    }
    return handle;
  }

  async link(memberId: string, provider: string, rawHandle: string) {
    const handle = await this.assertLinkable(memberId, provider, rawHandle);
    return this.repository.upsert({ memberId, provider, handle });
  }

  async unlink(memberId: string, provider: string): Promise<void> {
    if (!(await this.repository.remove(memberId, provider))) {
      throw new NotFoundException('No such identity');
    }
  }

  list(provider: IdentityProvider, roleIds?: string[]) {
    return this.repository.list(provider, roleIds);
  }
}
