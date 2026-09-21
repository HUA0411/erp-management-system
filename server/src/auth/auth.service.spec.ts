import { AuthService } from './auth.service';
import { BusinessException } from '../common/exceptions/business.exception';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  const hash = bcrypt.hashSync('123456', 10);

  const makeUserRepo = (user?: {
    id: number;
    companyId: number;
    username: string;
    password: string;
    status: number;
    isSuperAdmin: boolean;
  }) => ({
    createQueryBuilder: jest.fn(() => ({
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user ?? null),
    })),
    // 登录失败要记一次失败次数、成功要清零，都会调 update
    update: jest.fn().mockResolvedValue({ affected: 1 }),
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

  it('密码错误返回统一的 40101（不再用 40102 区分失败原因）', async () => {
    const svc = build({
      id: 1,
      companyId: 1,
      username: 'admin',
      password: hash,
      status: 1,
      isSuperAdmin: false,
    });
    await expect(svc.login('DEMO', 'admin', 'wrong-password')).rejects.toMatchObject({
      response: { code: 40101 },
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

  it('用户不存在与密码错误返回完全相同的 code 和 message（防枚举）', async () => {
    const missing = build(undefined);
    const wrongPwd = build({
      id: 1,
      companyId: 1,
      username: 'admin',
      password: hash,
      status: 1,
      isSuperAdmin: false,
    });

    // 注意密码要真的错：这个 repo mock 不区分 username，
    // 传 '123456' 反而会登录成功
    const grab = async (svc: AuthService, password: string): Promise<unknown> => {
      try {
        await svc.login('DEMO', 'ghost', password);
        fail('should throw');
      } catch (err) {
        return (err as BusinessException).getResponse();
      }
    };

    const a = await grab(missing, '123456');
    const b = await grab(wrongPwd, 'wrong-password');
    // 差一个字符都算泄漏：攻击者能据此区分「用户不存在」和「密码错」
    expect(a).toEqual(b);
    expect(a).toMatchObject({ code: 40101 });
  });
});
