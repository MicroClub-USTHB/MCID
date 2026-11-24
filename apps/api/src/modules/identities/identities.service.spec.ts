import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IdentitiesService } from './identities.service';

describe('IdentitiesService', () => {
  let repository: {
    memberExists: jest.Mock;
    findOwner: jest.Mock;
    upsert: jest.Mock;
    remove: jest.Mock;
    list: jest.Mock;
  };
  let service: IdentitiesService;

  beforeEach(() => {
    repository = {
      memberExists: jest.fn().mockResolvedValue(true),
      findOwner: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      remove: jest.fn().mockResolvedValue(true),
      list: jest.fn().mockResolvedValue([]),
    };
    service = new IdentitiesService(repository as never);
  });

  it('normalises a GitHub handle (case, @, spaces) before storing', async () => {
    await service.link('m1', 'github', '  @Octo-Cat ');
    expect(repository.upsert).toHaveBeenCalledWith({
      memberId: 'm1',
      provider: 'github',
      handle: 'octo-cat',
    });
  });

  it.each(['', 'a b', '-lead', 'trail-', 'dou--ble', 'x'.repeat(40), 'ü'])(
    'rejects the invalid GitHub handle %j',
    async (handle) => {
      await expect(service.link('m1', 'github', handle)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.upsert).not.toHaveBeenCalled();
    },
  );

  it('rejects an unknown provider', async () => {
    await expect(service.link('m1', 'myspace', 'tom')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unknown member', async () => {
    repository.memberExists.mockResolvedValue(false);
    await expect(
      service.link('ghost', 'github', 'octo'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses an account already linked to someone else', async () => {
    repository.findOwner.mockResolvedValue('other-member');
    await expect(service.link('m1', 'github', 'octo')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('lets a member re-submit their own account', async () => {
    repository.findOwner.mockResolvedValue('m1');
    await expect(service.link('m1', 'github', 'octo')).resolves.toBeDefined();
  });

  it('unlink throws when nothing was linked', async () => {
    repository.remove.mockResolvedValue(false);
    await expect(service.unlink('m1', 'github')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
