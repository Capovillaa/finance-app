import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { skipToken } from '@reduxjs/toolkit/query';
import { useState, type ReactElement } from 'react';
import { useListMembersQuery } from '../api/endpoints/workspaces';
import { useAppSelector } from '../app/hooks';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import DataSection from '../features/settings/DataSection';
import InvitationsSection from '../features/settings/InvitationsSection';
import MembersSection from '../features/settings/MembersSection';
import PasswordSection from '../features/settings/PasswordSection';
import ProfileSection from '../features/settings/ProfileSection';
import WorkspaceSection from '../features/settings/WorkspaceSection';
import { useActiveWorkspace } from '../features/workspace/useActiveWorkspace';
import { canAdminister } from '../lib/permissions';
import { useTranslation } from 'react-i18next';

type TabKey = 'profile' | 'workspace' | 'members' | 'data';

/** Catalogue keys: this table is evaluated once, at import. */
const TABS: { key: TabKey; labelKey: string }[] = [
  { key: 'profile', labelKey: 'settings.profile' },
  { key: 'workspace', labelKey: 'settings.workspace' },
  { key: 'members', labelKey: 'settings.members' },
  { key: 'data', labelKey: 'settings.data' },
];

/**
 * Settings.
 *
 * Split by *whose* setting it is rather than by screen: the profile and the
 * account-wide actions follow the user between workspaces, while the workspace
 * and member tabs act on whichever workspace the switcher is pointing at. That
 * boundary is the one that trips people up, so the tabs make it the top-level
 * division and each section restates it.
 *
 * Tab state is local rather than in the URL, matching the rest of the app —
 * every screen here reads its scope from the store, not the path.
 */
export default function SettingsPage(): ReactElement {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>('profile');
  const user = useAppSelector((state) => state.auth.user);
  const { workspace, isLoading: workspaceLoading } = useActiveWorkspace();

  const members = useListMembersQuery(workspace ? workspace.id : skipToken);
  const isAdmin = canAdminister(workspace?.role);

  return (
    <Stack spacing={3}>
      <PageHeader
        title={t('nav.settings')}
        subtitle={
          <>
            {user?.email}
            {workspace ? ` · ${workspace.name}` : ''}
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={(_event, value: TabKey) => setTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        {TABS.map((item) => (
          <Tab key={item.key} value={item.key} label={t(item.labelKey)} />
        ))}
      </Tabs>

      {tab === 'profile' ? (
        user ? (
          <Stack spacing={2}>
            <ProfileSection user={user} />
            <PasswordSection />
          </Stack>
        ) : (
          <NoUser />
        )
      ) : null}

      {tab === 'workspace' ? (
        workspace ? (
          <WorkspaceSection workspace={workspace} />
        ) : (
          <NoWorkspace loading={workspaceLoading} />
        )
      ) : null}

      {tab === 'members' ? (
        workspace ? (
          <Stack spacing={2}>
            <MembersSection
              workspace={workspace}
              members={members.data?.members ?? []}
              loading={members.isLoading}
              currentUserId={user?.id}
            />
            {/* The list endpoint requires admin, so a viewer must not even ask. */}
            {isAdmin ? <InvitationsSection workspaceId={workspace.id} /> : null}
          </Stack>
        ) : (
          <NoWorkspace loading={workspaceLoading} />
        )
      ) : null}

      {tab === 'data' ? <DataSection /> : null}
    </Stack>
  );
}

function NoWorkspace({ loading }: { loading: boolean }): ReactElement {
  const { t } = useTranslation();

  return (
    <EmptyState
      title={loading ? t('workspace.loading') : t('workspace.none')}
      description={
        loading
          ? t('common.loading')
          : t('workspace.noneDescriptionSwitcher')
      }
    />
  );
}

function NoUser(): ReactElement {
  const { t } = useTranslation();

  return <EmptyState title={t('settings.loadingProfile')} description={t('common.loading')} />;
}
