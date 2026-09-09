import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    channel: vi.fn(),
  },
}));

import { getSignedInProfile } from './supabaseTasks';

describe('Supabase storage isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-robson' } },
    });

    const single = vi.fn().mockResolvedValue({
      data: { id: 'profile-robson', slug: 'robson', display_name: 'Robson' },
      error: null,
    });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'agendamento_profiles') {
        throw new Error(`Tabela inesperada: ${table}`);
      }
      return { select };
    });
  });

  it('resolve o usuário somente pela tabela exclusiva do Agendamentos', async () => {
    const profile = await getSignedInProfile();

    expect(mocks.from).toHaveBeenCalledWith('agendamento_profiles');
    expect(profile).toEqual({
      id: 'profile-robson',
      slug: 'robson',
      displayName: 'Robson',
    });
  });
});
