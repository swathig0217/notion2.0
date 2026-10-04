import type { WorkspaceContext } from '../packages/shared/src/ai/index.ts';

/** Fixed workspaces so results are reproducible. Today is Monday 2026-10-05. */
export const FIXTURES: Record<'studio' | 'empty', WorkspaceContext> = {
  studio: {
    today: '2026-10-05',
    timezone: 'America/New_York',
    clients: [
      {
        id: 'a0000000-0000-4000-8000-000000000001',
        name: 'Acme Co',
        email: 'sam@acme.example',
        status: 'active',
      },
      {
        id: 'a0000000-0000-4000-8000-000000000002',
        name: 'Bolt Studio',
        email: 'hello@bolt.example',
        status: 'active',
      },
      {
        id: 'a0000000-0000-4000-8000-000000000003',
        name: 'Alex Rivera',
        email: 'alex@rivera.example',
        status: 'active',
      },
      {
        id: 'a0000000-0000-4000-8000-000000000004',
        name: 'Alex Kim',
        email: 'alex.kim@kimco.example',
        status: 'active',
      },
      {
        id: 'a0000000-0000-4000-8000-000000000005',
        name: 'Northwind Bakery',
        email: null,
        status: 'paused',
      },
    ],
    projects: [
      {
        id: 'b0000000-0000-4000-8000-000000000001',
        title: 'Website refresh',
        client_id: 'a0000000-0000-4000-8000-000000000001',
      },
      {
        id: 'b0000000-0000-4000-8000-000000000002',
        title: 'Brand guidelines',
        client_id: 'a0000000-0000-4000-8000-000000000002',
      },
    ],
    recent_tasks: [
      {
        title: 'Prepare homepage mockups',
        client_id: 'a0000000-0000-4000-8000-000000000001',
        due_date: '2026-10-06',
      },
      {
        title: 'Collect logo files',
        client_id: 'a0000000-0000-4000-8000-000000000002',
        due_date: null,
      },
    ],
  },
  empty: {
    today: '2026-10-05',
    timezone: 'America/New_York',
    clients: [],
    projects: [],
    recent_tasks: [],
  },
};
