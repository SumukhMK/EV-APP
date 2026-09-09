import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StateChip } from '../../components/StateChip';
import { EmptyState } from '../../components/EmptyState';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { TableFooter } from '../../components/TableFooter';
import { listUsers } from '../../lib/api/users';
import {
  USER_ROLE_LABEL,
  USER_ROLE_SCOPE,
  USER_ROLE_TONE,
  USER_STATUS_LABEL,
  USER_STATUS_TONE,
} from '../../lib/labels';
import { formatDateTime } from '../../lib/format';
import { neutral } from '../../theme/tokens';
import { USER_ROLES, type User } from '../../types';

const PAGE_SIZE = 12;

/**
 * Who can use the system and what each role may do (artboard 18).
 *
 * The reference block at the top says plainly what each role is for, because
 * the table only lists names against roles and a client reading it should not
 * have to guess what "Fleet staff" is allowed to touch. None of it grants
 * anything: the rules are enforced server-side once the API exists, and the
 * page says so rather than pretending the buttons do something.
 */
export function Users() {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const [page, setPage] = useState(0);

  const list = useQuery({
    queryKey: ['users', 'list', page],
    queryFn: () => listUsers(page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.content ?? [];
  const total = list.data?.totalElements ?? 0;

  return (
    <>
      <PageHeader
        section="Admin"
        title="Users & roles"
        meta={
          <Mono sx={{ fontSize: 12, color: neutral[500] }}>
            {total > 0 ? `${total} accounts` : ''}
          </Mono>
        }
      />

      <Panel label="Roles" subtitle="What each role is for" sx={{ mt: 5 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
            gap: 3,
          }}
        >
          {USER_ROLES.map((role) => (
            <Box
              key={role}
              sx={{
                p: 3,
                border: `1px solid ${neutral[900]}`,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <StateChip label={USER_ROLE_LABEL[role]} tone={USER_ROLE_TONE[role]} />
              <Typography sx={{ fontSize: 13, color: neutral[400] }}>
                {USER_ROLE_SCOPE[role]}
              </Typography>
            </Box>
          ))}
        </Box>
      </Panel>

      <Panel label="Accounts" sx={{ mt: 5, p: { xs: '4px 12px 12px', sm: '4px 20px 12px' } }}>
        {list.isLoading ? (
          <EmptyState title="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No users" />
        ) : (
          <SimpleTable
            rows={rows}
            getRowKey={(x) => x.id}
            columns={[
              {
                key: 'name',
                header: 'Name',
                width: 200,
                render: (x) => (
                  <Box>
                    <Box component="span" sx={{ display: 'block' }}>{x.name}</Box>
                    <Mono sx={{ fontSize: 12, color: neutral[500] }}>{x.email}</Mono>
                  </Box>
                ),
              },
              {
                key: 'role',
                header: 'Role',
                width: 150,
                render: (x) => <StateChip label={USER_ROLE_LABEL[x.role]} tone={USER_ROLE_TONE[x.role]} />,
              },
              {
                key: 'status',
                header: 'Status',
                width: 110,
                render: (x) => (
                  <StateChip label={USER_STATUS_LABEL[x.status]} tone={USER_STATUS_TONE[x.status]} />
                ),
              },
              ...(compact
                ? []
                : [
                    {
                      key: 'lastActive',
                      header: 'Last active',
                      align: 'right' as const,
                      width: 180,
                      render: (x: User) => (
                        <Mono sx={{ fontSize: 12, color: x.lastActiveAt ? neutral[400] : neutral[600] }}>
                          {x.lastActiveAt ? formatDateTime(x.lastActiveAt) : 'Never signed in'}
                        </Mono>
                      ),
                    },
                  ]),
            ]}
          />
        )}
        {total > PAGE_SIZE && (
          <TableFooter
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
            noun="users"
          />
        )}
      </Panel>

      <Typography sx={{ fontSize: 12, color: neutral[500], mt: 3 }}>
        Inviting, disabling and changing a role are backend actions and are not wired in the
        prototype. Every such change is written to the audit log.
      </Typography>
    </>
  );
}
