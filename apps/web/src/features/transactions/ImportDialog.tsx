import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCommitImportMutation,
  usePreviewImportMutation,
  useRevertImportMutation,
  useListImportBatchesQuery,
} from '../../api/endpoints/imports';
import type { Account, ImportOptionOverrides, ImportPreview } from '../../api/types';
import LedgerRow from '../../components/LedgerRow';
import { CheckCircleIcon, UndoIcon, UploadIcon } from '../../icons';
import { getApiErrorMessage } from '../../lib/apiError';
import { formatMoney, formatRelative } from '../../lib/format';
import ImportMappingEditor from './ImportMappingEditor';
import ImportPreviewRows, { ImportCounts } from './ImportPreviewRows';

/** Matches the server's own cap; checked here only to fail before the upload. */
const MAX_FILE_BYTES = 512_000;

interface ImportDialogProps {
  open: boolean;
  workspaceId: string;
  accounts: Account[];
  defaultAccountId?: string | undefined;
  onClose: () => void;
}

type Stage = 'choose' | 'review' | 'done';

/**
 * CSV import, as preview-then-commit.
 *
 * The dialog mirrors the API exactly: picking a file *previews* it, which parses
 * and checks for duplicates and writes nothing; only pressing Import commits,
 * and it commits every kept row or none of them. That shape is the whole point —
 * a statement whose 147th row is malformed must not leave 146 rows behind, and a
 * re-imported overlapping month must not double anybody's balance.
 *
 * Every inference the server made is shown as a control rather than as a result,
 * because the three that matter — date layout, decimal mark, direction
 * convention — corrupt an entire statement silently when they are wrong.
 */
export default function ImportDialog({
  open,
  workspaceId,
  accounts,
  defaultAccountId,
  onClose,
}: ImportDialogProps): ReactElement {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>('choose');
  const [accountId, setAccountId] = useState(defaultAccountId ?? '');
  const [filename, setFilename] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [imported, setImported] = useState<{ batchId: string; count: number } | null>(null);
  const [reverted, setReverted] = useState(false);

  const [runPreview, previewState] = usePreviewImportMutation();
  const [commit, commitState] = useCommitImportMutation();
  const [revert, revertState] = useRevertImportMutation();

  const history = useListImportBatchesQuery(open ? { workspaceId, limit: 5 } : skipToken);

  const openAccounts = accounts.filter((account) => !account.isArchived);

  // A dialog that keeps its last file is a dialog that imports it twice.
  useEffect(() => {
    if (open) return;
    setStage('choose');
    setFilename(null);
    setContent('');
    setFileError(null);
    setPreview(null);
    setSelected(new Set());
    setImported(null);
    setReverted(false);
  }, [open]);

  useEffect(() => {
    if (open && !accountId && defaultAccountId) setAccountId(defaultAccountId);
  }, [open, accountId, defaultAccountId]);

  const applyPreview = (result: ImportPreview): void => {
    setPreview(result);
    // Everything that is neither broken nor a suspected duplicate starts
    // ticked: the common case is "import this statement", and the rows that
    // need a decision are exactly the ones left unticked.
    setSelected(
      new Set(
        result.rows
          .filter(
            (row) =>
              row.errors.length === 0 &&
              row.duplicateOfTransactionId === null &&
              row.duplicateOfLineNumber === null,
          )
          .map((row) => row.lineNumber),
      ),
    );
    setStage('review');
  };

  const previewFile = async (text: string, name: string | null, overrides: ImportOptionOverrides = {}): Promise<void> => {
    const result = await runPreview({ workspaceId, accountId, content: text, filename: name, ...overrides })
      .unwrap()
      .catch(() => null);
    if (result) applyPreview(result.preview);
  };

  const acceptFile = async (file: File): Promise<void> => {
    setFileError(null);

    if (file.size > MAX_FILE_BYTES) {
      setFileError(t('imports.fileTooLarge', { limit: Math.floor(MAX_FILE_BYTES / 1000) }));
      return;
    }

    // Read as text in the browser: the payload is already capped well under the
    // JSON body limit, and posting it as JSON keeps this on the same
    // authenticated fetch path as every other call.
    const text = await file.text();
    setContent(text);
    setFilename(file.name);
    await previewFile(text, file.name);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    // Cleared so picking the same file twice still fires a change event.
    event.target.value = '';
    if (file) void acceptFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void acceptFile(file);
  };

  /** Any option change re-reads the same file under the new instructions. */
  const handleOptionsChange = (overrides: ImportOptionOverrides): void => {
    if (!preview) return;
    void previewFile(content, filename, { ...preview.options, ...overrides });
  };

  const toggleRow = (lineNumber: number): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(lineNumber)) next.delete(lineNumber);
      else next.add(lineNumber);
      return next;
    });
  };

  const selectAllImportable = (): void => {
    if (!preview) return;
    setSelected(
      new Set(preview.rows.filter((row) => row.errors.length === 0).map((row) => row.lineNumber)),
    );
  };

  const handleCommit = async (): Promise<void> => {
    if (!preview) return;
    const rows = [...selected].sort((a, b) => a - b).map((lineNumber) => ({ lineNumber }));
    const result = await commit({ workspaceId, batchId: preview.batchId, rows }).unwrap().catch(() => null);
    if (!result) return;
    setImported({ batchId: result.batchId, count: result.imported });
    setStage('done');
  };

  const handleUndo = async (batchId: string): Promise<void> => {
    const result = await revert({ workspaceId, batchId }).unwrap().catch(() => null);
    if (result && imported?.batchId === batchId) setReverted(true);
  };

  const busy = previewState.isLoading || commitState.isLoading || revertState.isLoading;
  const error = previewState.error ?? commitState.error ?? revertState.error;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('imports.title')}</DialogTitle>

      {busy ? <LinearProgress /> : null}

      <DialogContent>
        <Stack spacing={2.5}>
          {error ? <Alert severity="error">{getApiErrorMessage(error, t('imports.failed'))}</Alert> : null}
          {fileError ? <Alert severity="error">{fileError}</Alert> : null}

          {stage === 'choose' ? (
            <>
              <Typography variant="body2" color="text.secondary">
                {t('imports.explainer')}
              </Typography>

              <TextField
                select
                label={t('common.account')}
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                helperText={t('imports.accountHint')}
                SelectProps={{ displayEmpty: true }}
                InputLabelProps={{ shrink: true }}
              >
                <MenuItem value="">
                  <Typography variant="body2" color="text.secondary" component="span">
                    {t('imports.chooseAccount')}
                  </Typography>
                </MenuItem>
                {openAccounts.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name} · {account.currency}
                  </MenuItem>
                ))}
              </TextField>

              <ButtonBase
                component="div"
                disabled={!accountId || busy}
                onClick={() => fileInput.current?.click()}
                onDragOver={(event: DragEvent<HTMLElement>) => {
                  event.preventDefault();
                  if (accountId) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={accountId ? handleDrop : undefined}
                sx={{
                  flexDirection: 'column',
                  gap: 1,
                  py: 5,
                  px: 3,
                  borderRadius: 2,
                  border: '1px dashed',
                  borderColor: dragging ? 'primary.main' : 'divider',
                  bgcolor: dragging ? 'action.hover' : 'transparent',
                  opacity: accountId ? 1 : 0.5,
                  transition: 'border-color 120ms, background-color 120ms',
                }}
              >
                <UploadIcon fontSize="large" color="action" />
                <Typography variant="body2" sx={{ fontWeight: 550 }}>
                  {t('imports.dropzone')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('imports.dropzoneHint', { limit: Math.floor(MAX_FILE_BYTES / 1000) })}
                </Typography>
              </ButtonBase>

              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv,text/plain"
                hidden
                onChange={handleFileInput}
              />

              {history.data && history.data.batches.length > 0 ? (
                <>
                  <Divider />
                  <Stack spacing={0.5}>
                    <Typography variant="eyebrow" color="text.secondary">
                      {t('imports.recent')}
                    </Typography>
                    <Box>
                      {history.data.batches.map((batch) => (
                        <LedgerRow
                          key={batch.id}
                          dense
                          tone={batch.status === 'reverted' ? 'neutral' : 'none'}
                          {...(batch.status === 'reverted' ? { toneLabel: t('imports.statusReverted') } : {})}
                          lead={formatRelative(batch.committedAt ?? batch.createdAt)}
                          primary={batch.filename ?? t('imports.untitledFile')}
                          secondary={batch.accountName}
                          amount={t('imports.rowCount', { count: batch.importedCount })}
                          actions={
                            batch.status === 'committed' ? (
                              <Button
                                size="small"
                                startIcon={<UndoIcon />}
                                disabled={busy}
                                onClick={() => void handleUndo(batch.id)}
                              >
                                {t('imports.undo')}
                              </Button>
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                {t('imports.statusReverted')}
                              </Typography>
                            )
                          }
                        />
                      ))}
                    </Box>
                  </Stack>
                </>
              ) : null}
            </>
          ) : null}

          {stage === 'review' && preview ? (
            <>
              <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" sx={{ fontWeight: 550 }}>
                  {preview.filename ?? t('imports.untitledFile')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {preview.accountName} · {preview.currency}
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Typography variant="caption" color="text.secondary">
                  {t('imports.netOfSelection', {
                    inflow: formatMoney(preview.totals.inflow, preview.currency),
                    outflow: formatMoney(preview.totals.outflow, preview.currency),
                  })}
                </Typography>
              </Stack>

              <ImportMappingEditor
                headers={preview.headers}
                options={preview.options}
                dateFormatAmbiguous={preview.dateFormatAmbiguous}
                mappingRecalled={preview.mappingRecalled}
                disabled={busy}
                onChange={handleOptionsChange}
              />

              <Divider />

              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <ImportCounts counts={preview.counts} />
                </Box>
                <Button size="small" onClick={selectAllImportable} disabled={busy}>
                  {t('imports.selectAll')}
                </Button>
                <Button size="small" onClick={() => setSelected(new Set())} disabled={busy}>
                  {t('imports.selectNone')}
                </Button>
              </Stack>

              {preview.counts.duplicate > 0 ? (
                <Alert severity="info">{t('imports.duplicatesExplainer')}</Alert>
              ) : null}

              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                <ImportPreviewRows
                  rows={preview.rows}
                  currency={preview.currency}
                  selected={selected}
                  loading={previewState.isLoading}
                  onToggle={toggleRow}
                />
              </Box>
            </>
          ) : null}

          {stage === 'done' && imported ? (
            <Stack spacing={2} alignItems="center" sx={{ py: 4, textAlign: 'center' }}>
              <CheckCircleIcon fontSize="large" color={reverted ? 'disabled' : 'success'} />
              <Typography variant="h3">
                {reverted
                  ? t('imports.undoneTitle')
                  : t('imports.doneTitle', { count: imported.count })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {reverted ? t('imports.undoneDescription') : t('imports.doneDescription')}
              </Typography>
              {!reverted ? (
                <Button
                  startIcon={<UndoIcon />}
                  disabled={busy}
                  onClick={() => void handleUndo(imported.batchId)}
                >
                  {t('imports.undoThis')}
                </Button>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {stage === 'review' ? (
          <Button onClick={() => setStage('choose')} disabled={busy}>
            {t('imports.chooseAnother')}
          </Button>
        ) : null}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose} disabled={busy}>
          {stage === 'done' ? t('common.close') : t('common.cancel')}
        </Button>
        {stage === 'review' ? (
          <Button
            variant="contained"
            disabled={busy || selected.size === 0}
            onClick={() => void handleCommit()}
          >
            {commitState.isLoading
              ? t('imports.importing')
              : t('imports.importCount', { count: selected.size })}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
