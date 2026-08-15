import { AddIcon, LabelIcon, SwapHorizIcon, UploadIcon } from '../icons';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, useState, type ReactElement } from 'react';
import { useListAccountsQuery } from '../api/endpoints/accounts';
import { useListCategoriesQuery } from '../api/endpoints/categories';
import { useListTagsQuery } from '../api/endpoints/tags';
import {
  useBulkCategorizeMutation,
  useConfirmTransactionMutation,
  useDeleteTransactionMutation,
  useGetTransactionQuery,
  useListTransactionsQuery,
  useRestoreTransactionMutation,
} from '../api/endpoints/transactions';
import type { TransactionFilters } from '../api/endpoints/transactions';
import { useListMembersQuery } from '../api/endpoints/workspaces';
import type { Transaction } from '../api/types';
import { useAppSelector } from '../app/hooks';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import PageHeader from '../components/PageHeader';
import BulkActionsBar from '../features/transactions/BulkActionsBar';
import ImportDialog from '../features/transactions/ImportDialog';
import SplitsDialog from '../features/transactions/SplitsDialog';
import TagManagerDialog from '../features/transactions/TagManagerDialog';
import TransactionDetailDrawer from '../features/transactions/TransactionDetailDrawer';
import TransactionFiltersBar, {
  EMPTY_FILTERS,
  type TransactionFilterState,
} from '../features/transactions/TransactionFiltersBar';
import TransactionFormDialog from '../features/transactions/TransactionFormDialog';
import TransactionLedger from '../features/transactions/TransactionLedger';
import TransferFormDialog from '../features/transactions/TransferFormDialog';
import { useActiveWorkspace } from '../features/workspace/useActiveWorkspace';
import { canEdit } from '../lib/permissions';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 25;

/** Debounces free-text search so every keystroke does not fire a request. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function toApiFilters(filters: TransactionFilterState, page: number): TransactionFilters {
  return {
    page,
    pageSize: PAGE_SIZE,
    from: filters.from || undefined,
    to: filters.to || undefined,
    accountIds: filters.accountIds,
    categoryIds: filters.categoryIds,
    tagIds: filters.tagIds,
    types: filters.types,
    statuses: filters.statuses,
    minAmount: filters.minAmount || undefined,
    maxAmount: filters.maxAmount || undefined,
    search: filters.search || undefined,
    // Sent only when on: the API defaults it to false, and an explicit
    // `includeDeleted=false` on every request is noise in the query string.
    includeDeleted: filters.includeDeleted || undefined,
  };
}

export default function TransactionsPage(): ReactElement {
  const { t } = useTranslation();
  const { workspace, isLoading: workspaceLoading } = useActiveWorkspace();
  const currentUserId = useAppSelector((state) => state.auth.user?.id);

  const [filters, setFilters] = useState<TransactionFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | undefined>(undefined);
  const [deleting, setDeleting] = useState<Transaction | undefined>(undefined);
  const [viewing, setViewing] = useState<Transaction | undefined>(undefined);
  const [splitting, setSplitting] = useState<Transaction | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const debouncedSearch = useDebounced(filters.search, 350);
  const appliedFilters: TransactionFilterState = { ...filters, search: debouncedSearch };

  // Any filter change other than free typing should reset paging, otherwise a
  // narrower result set could leave the view on a page that no longer exists.
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    filters.from,
    filters.to,
    filters.accountIds,
    filters.categoryIds,
    filters.tagIds,
    filters.types,
    filters.statuses,
    filters.minAmount,
    filters.maxAmount,
    filters.includeDeleted,
  ]);

  // A selection is a set of ids on the page in front of you. Once the page or
  // the filters move, those rows may not be on screen any more, and acting on
  // rows the user can no longer see is exactly the surprise to avoid.
  useEffect(() => {
    setSelectedIds([]);
  }, [page, appliedFilters.search, filters]);

  const accounts = useListAccountsQuery(workspace ? { workspaceId: workspace.id } : skipToken);
  const categories = useListCategoriesQuery(workspace ? { workspaceId: workspace.id } : skipToken);
  const tags = useListTagsQuery(workspace ? workspace.id : skipToken);
  // Fetched with the page rather than when the split dialog opens: the dialog
  // seeds its participant list from this, and waiting until it opens means the
  // first split of a session opens against an empty list.
  const members = useListMembersQuery(workspace ? workspace.id : skipToken);
  const transactions = useListTransactionsQuery(
    workspace ? { workspaceId: workspace.id, filters: toApiFilters(appliedFilters, page) } : skipToken,
  );

  // The same query the drawer runs, so opening the split editor from the drawer
  // costs nothing — RTK Query serves both subscribers from one cache entry.
  const splittingDetail = useGetTransactionQuery(
    workspace && splitting ? { workspaceId: workspace.id, id: splitting.id } : skipToken,
  );

  const [deleteTransaction, { isLoading: deletingInFlight }] = useDeleteTransactionMutation();
  const [confirmTransaction] = useConfirmTransactionMutation();
  const [restoreTransaction] = useRestoreTransactionMutation();
  const [bulkCategorize, { isLoading: bulkInFlight }] = useBulkCategorizeMutation();

  const role = workspace?.role;

  const toggleSelect = (id: string): void => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const handleConfirm = async (transaction: Transaction): Promise<void> => {
    if (!workspace) return;
    await confirmTransaction({ workspaceId: workspace.id, id: transaction.id })
      .unwrap()
      .catch(() => null);
  };

  const handleRestore = async (transaction: Transaction): Promise<void> => {
    if (!workspace) return;
    await restoreTransaction({ workspaceId: workspace.id, id: transaction.id })
      .unwrap()
      .catch(() => null);
  };

  const handleBulkCategorize = async (categoryId: string | null): Promise<void> => {
    if (!workspace || selectedIds.length === 0) return;
    const ok = await bulkCategorize({ workspaceId: workspace.id, transactionIds: selectedIds, categoryId })
      .unwrap()
      .then(() => true)
      .catch(() => false);
    if (ok) setSelectedIds([]);
  };

  const openCreate = (): void => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (transaction: Transaction): void => {
    setEditing(transaction);
    setFormOpen(true);
  };

  const handleDelete = async (): Promise<void> => {
    if (!workspace || !deleting) return;
    const ok = await deleteTransaction({ workspaceId: workspace.id, id: deleting.id })
      .unwrap()
      .then(() => true)
      .catch(() => false);
    if (ok) {
      setDeleting(undefined);
      // The row that was open in the drawer may be one of the legs just removed.
      setViewing(undefined);
    }
  };

  if (!workspaceLoading && !workspace) {
    return (
      <EmptyState
        title={t('workspace.none')}
        description={t('workspace.noneDescription')}
      />
    );
  }

  const data = transactions.data;

  return (
    <Stack spacing={3}>
      <PageHeader
        title={t('nav.transactions')}
        subtitle={
          <>
            {workspace?.name}
            {data ? ` · ${t('transactions.count', { count: data.total })}` : ''}
          </>
        }
        actions={
          <>
            <Button startIcon={<LabelIcon />} onClick={() => setTagsOpen(true)}>
              {t('transactions.manageTags')}
            </Button>
            {canEdit(role) ? (
              <>
                <Button startIcon={<UploadIcon />} onClick={() => setImportOpen(true)}>
                  {t('imports.action')}
                </Button>
                <Button variant="outlined" startIcon={<SwapHorizIcon />} onClick={() => setTransferOpen(true)}>
                  {t('transactions.newTransfer')}
                </Button>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                  {t('transactions.add')}
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <TransactionFiltersBar
        filters={filters}
        accounts={accounts.data?.accounts ?? []}
        categories={categories.data?.categories ?? []}
        tags={tags.data?.tags ?? []}
        onChange={setFilters}
      />

      <Card>
        {transactions.error ? (
          <Box sx={{ p: 2.5 }}>
            <ErrorState
              error={transactions.error}
              title={t('transactions.loadFailed')}
              onRetry={() => void transactions.refetch()}
            />
          </Box>
        ) : (
          <>
            {canEdit(role) && selectedIds.length > 0 ? (
              <BulkActionsBar
                selectedCount={selectedIds.length}
                categories={categories.data?.categories ?? []}
                applying={bulkInFlight}
                onApply={(categoryId) => void handleBulkCategorize(categoryId)}
                onClear={() => setSelectedIds([])}
              />
            ) : null}

            <TransactionLedger
              transactions={data?.items ?? []}
              loading={transactions.isLoading || workspaceLoading}
              role={role}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onOpen={setViewing}
              onEdit={openEdit}
              onDelete={setDeleting}
              onConfirm={(transaction) => void handleConfirm(transaction)}
              onRestore={(transaction) => void handleRestore(transaction)}
            />
          </>
        )}

        {data && data.totalPages > 1 ? (
          <Stack
            direction="row"
            justifyContent="center"
            sx={{ py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}
          >
            <Pagination count={data.totalPages} page={page} onChange={(_e, value) => setPage(value)} color="primary" />
          </Stack>
        ) : null}
      </Card>

      {workspace ? (
        <>
          <TransactionFormDialog
            open={formOpen}
            workspaceId={workspace.id}
            transaction={editing}
            defaultAccountId={accounts.data?.accounts[0]?.id}
            onClose={() => setFormOpen(false)}
          />

          <TransferFormDialog
            open={transferOpen}
            workspaceId={workspace.id}
            defaultAccountId={accounts.data?.accounts[0]?.id}
            onClose={() => setTransferOpen(false)}
          />

          <ImportDialog
            open={importOpen}
            workspaceId={workspace.id}
            accounts={accounts.data?.accounts ?? []}
            defaultAccountId={accounts.data?.accounts[0]?.id}
            onClose={() => setImportOpen(false)}
          />

          <TagManagerDialog
            open={tagsOpen}
            workspaceId={workspace.id}
            role={role}
            onClose={() => setTagsOpen(false)}
          />

          <TransactionDetailDrawer
            open={Boolean(viewing)}
            workspaceId={workspace.id}
            transactionId={viewing?.id}
            role={role}
            currentUserId={currentUserId}
            onClose={() => setViewing(undefined)}
            onEditSplits={setSplitting}
          />

          <SplitsDialog
            open={Boolean(splitting)}
            workspaceId={workspace.id}
            transaction={splitting}
            members={members.data?.members ?? []}
            existing={splittingDetail.data?.splits ?? []}
            onClose={() => setSplitting(undefined)}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting?.type === 'transfer' ? t('transactions.deleteTransferTitle') : t('transactions.deleteTitle')}
        description={
          deleting?.type === 'transfer'
            ? t('transactions.deleteTransferDescription', { description: deleting.description })
            : t('transactions.deleteDescription', { description: deleting?.description ?? '' })
        }
        confirmLabel={t('common.delete')}
        destructive
        loading={deletingInFlight}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(undefined)}
      />
    </Stack>
  );
}
