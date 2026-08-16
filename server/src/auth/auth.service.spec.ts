import { AuthService } from './auth.service';
import { BusinessException } from '../common/exceptions/business.exception';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  const hash = bcrypt.hashSync('123456', 10);

  const makeUserRepo = (user?: { id: number; companyId: number; username: string; password: string; status: number; isSuperAdmin: boolean }) => ({
    createQueryBuilder: jest.fn(() => ({
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user ?? null),
    })),
  });

  function build(user: Parameters<typeof makeUserRepo>[0]) {
    const permissionService = {
      getUserPermissionCodes: jest.fn().mockResolvedValue(['product:view']),
      getMenuTreeForUser: jest.fn().mockResolvedValue([]),
    };
    service = new AuthService(
      { sign: jest.fn().mockReturnValue('fake-jwt-token') } as any,
      { get: jest.fn(() => 'secret') } as any,
      permissionService as any,
      { findOne: jest.fn().mockResolvedValue({ id: 1, code: 'DEMO', name: '演示科技', status: 1 }) } as any,
      makeUserRepo(user) as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
    );
    return service;
  }

  it('登录成功返回 token 与用户信息', async () => {
    const svc = build({
      id: 1,
      companyId: 1,
      username: 'admin',
      password: hash,
      status: 1,
      isSuperAdmin: true,
    });
    const result = await svc.login('DEMO', 'admin', '123456');
    expect(result.token).toBe('fake-jwt-token');
    expect(result.user.username).toBe('admin');
    expect(result.user.companyCode).toBe('DEMO');
  });

  it('密码错误抛出业务异常 40102', async () => {
    const svc = build({
      id: 1,
      companyId: 1,
      username: 'admin',
      password: hash,
      status: 1,
      isSuperAdmin: false,
    });
    await expect(svc.login('DEMO', 'admin', 'wrong-password')).rejects.toMatchObject({
      response: { code: 40102 },
    });
  });

  it('公司编码不存在抛出业务异常 40101', async () => {
    const permissionService = {
      getUserPermissionCodes: jest.fn(),
      getMenuTreeForUser: jest.fn(),
    };
    service = new AuthService(
      { sign: jest.fn() } as any,
      { get: jest.fn(() => 'secret') } as any,
      permissionService as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      makeUserRepo(undefined) as any,
      { find: jest.fn() } as any,
      { find: jest.fn() } as any,
    );
    await expect(service.login('NOPE', 'admin', '123456')).rejects.toMatchObject({
      response: { code: 40101 },
    });
  });

  it('用户不存在与密码错误返回同一提示（防枚举）', async () => {
    const svc = build(undefined);
    try {
      await svc.login('DEMO', 'ghost', '123456');
      fail('should throw');
    } catch (err) {
      expect((err as BusinessException).getResponse()).toMatchObject({ code: 40102 });
    }
  });
});
