import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import UploadIcon from '@mui/icons-material/UploadFileOutlined';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import { invalidateVehicles } from '../../lib/invalidate';
import { ApiError } from '../../lib/api/client';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StatTiles } from '../../components/StatTiles';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { FlowStrip } from '../../components/FlowStrip';
import { UploadBox, type UploadRejection } from '../../components/UploadBox';
import { TableSkeleton } from '../../components/TableSkeleton';
import { commitBulkUpload, downloadImportTemplate, previewBulkUpload } from '../../lib/api/vehicles';
import type { BulkUploadPreview, ImportResult } from '../../types';
import { neutral, status as tones } from '../../theme/tokens';

/** The stages the import walks, drawn under the header so the operator knows
 * how many more times it will ask before it commits.
 *
 * "Map columns" used to sit second and never existed on either side. It is
 * still not a step: the server now recognises the common ways a hub spells a
 * column, so there is nothing to map by hand — and when it cannot, the error
 * below lists what it found next to what it needs. */
const IMPORT_STAGES = [
  'Upload',
  'Validate',
  'Duplicate check',
  'Preview',
  'Confirm import',
] as const;

/**
 * The columns the API parses, as the template spells them. Six are required.
 * batteryVendor and registrationNumber may be blank, but the columns must be
 * present. Spelling is loose — see the note under the box.
 */
const EXPECTED_COLUMNS = [
  'id',
  'chassisNumber',
  'model',
  'batteryType',
  'batteryVendor',
  'hub',
  'registrationNumber',
  'inductedOn',
] as const;

/** What the server accepts, as the browser can check it before sending. */
const ACCEPT = {
  'text/csv': ['.csv'],
  'text/plain': ['.csv'],
  'application/vnd.ms-excel': ['.xls', '.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

/** Mirrors spring.servlet.multipart.max-file-size; the server says the same if this is bypassed. */
const MAX_FILE_MB = 10;

const REJECTIONS: Record<UploadRejection, string> = {
  type: 'That file is not a spreadsheet. Upload an .xlsx, .xls or .csv file.',
  size: `The file is larger than ${MAX_FILE_MB} MB. Split it into smaller files.`,
  count: 'Upload one file at a time.',
};

/**
 * Two-stage import: validate first, then commit. The preview is what makes
 * this safe — 150 bikes are being migrated off a spreadsheet, and a silent
 * partial import would be worse than no import.
 *
 * Only the clean rows are imported. Bad rows are downloaded, fixed, re-uploaded.
 */
export function BulkUploadVehicles() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<BulkUploadPreview | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** A file turned away in the browser, before any request. */
  const [rejected, setRejected] = useState<string | null>(null);

  const validate = useMutation({
    mutationFn: (file: File) => previewBulkUpload(file),
    onSuccess: setPreview,
  });

  const commit = useMutation({
    mutationFn: (p: BulkUploadPreview) => commitBulkUpload(p),
    onSuccess: (result) => {
      setDone(result);
      setPreview(null);
      invalidateVehicles(queryClient);
    },
  });

  /**
   * Hands the workbook to the browser. The endpoint needs the bearer token,
   * so the bytes are fetched and turned into an object URL rather than linked
   * to directly.
   */
  const template = useMutation({
    mutationFn: downloadImportTemplate,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = blob.type.includes('csv') ? 'fleet-template.csv' : 'fleet-template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });

  /**
   * Back to nothing. Every path that brings in a new file goes through here
   * first, because the screen used to clear only the finished result: a
   * second upload that failed left the first file's preview on screen under
   * the error, and the operator read the old rows as the new file's.
   */
  const clear = () => {
    setPreview(null);
    setDone(null);
    setRejected(null);
    validate.reset();
  };

  const onFile = (file: File) => {
    clear();
    validate.mutate(file);
  };

  const onReject = (reason: UploadRejection) => {
    clear();
    setRejected(REJECTIONS[reason]);
  };

  // Before a file: at Upload. While the server reads it: at Validate. Once a
  // preview is loaded: at Preview. While the clean rows are being written:
  // at Confirm import.
  const activeStage = validate.isPending ? 1 : commit.isPending ? 4 : preview ? 3 : 0;

  // A problem with the whole file, as the server explained it. When it sent
  // the columns it was missing and the ones it found, those are laid out
  // rather than read out of the sentence.
  const fileError = validate.error instanceof ApiError ? validate.error : null;
  const missingColumns = stringList(fileError?.details?.missingColumns);
  const foundColumns = stringList(fileError?.details?.foundColumns);
  const errorMessage = rejected
    ?? (validate.isError
      ? (validate.error instanceof Error ? validate.error.message : 'That file could not be read.')
      : null);

  return (
    <>
      <PageHeader
        section="Fleet / Vehicles"
        title="Bulk upload vehicles"
        icon={UploadIcon}
        actions={
          <>
            <Button
              color="inherit"
              startIcon={<DownloadIcon />}
              disabled={template.isPending}
              onClick={() => template.mutate()}
            >
              {template.isPending ? 'Preparing…' : 'Download template'}
            </Button>
            <Button color="inherit" onClick={() => navigate('/vehicles')}>
              {done !== null ? 'Go back to all vehicles' : 'Cancel'}
            </Button>
          </>
        }
      />

      <Box sx={{ mt: 5 }}>
        <FlowStrip stages={IMPORT_STAGES} activeIndex={activeStage} />
      </Box>

      {template.isError && (
        <Alert severity="error" variant="outlined" sx={{ mt: 5 }}>
          Could not download the template. Try again.
        </Alert>
      )}

      {done !== null && (
        <Alert
          severity={done.skipped > 0 ? 'warning' : 'success'}
          variant="outlined"
          sx={{ mt: 5 }}
        >
          {done.imported} vehicles imported. They are in the registry as{' '}
          <Box component="span" sx={{ color: neutral[200] }}>Inducted</Box> and need inspection before
          they can be deployed.
          {done.skipped > 0 && (
            <>
              <Box sx={{ mt: 2 }}>
                {done.skipped} {done.skipped === 1 ? 'row was' : 'rows were'} skipped. These passed the
                preview and could not be imported — usually because the bike was added by someone else
                while this preview was open.
              </Box>
              <Box component="ul" sx={{ mt: 1, mb: 0, pl: 3 }}>
                {done.skippedRows.map((row) => (
                  <Box component="li" key={row.rowNumber}>
                    Row {row.rowNumber} · <Mono>{row.id}</Mono> — {row.error}
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Alert>
      )}

      <Panel
        label="File"
        subtitle="An .xlsx, .xls or .csv export of the registry. One bike per row, header row first."
        sx={{ mt: 5 }}
      >
        <UploadBox
          title={validate.isPending ? 'Validating…' : 'Drop a file or choose one'}
          description={`An .xlsx, .xls or .csv export of the registry, one bike per row. Up to ${MAX_FILE_MB} MB.`}
          accept={ACCEPT}
          maxSize={MAX_FILE_MB * 1024 * 1024}
          buttonLabel="Choose a file"
          onFile={onFile}
          onReject={onReject}
          expectedColumns={EXPECTED_COLUMNS}
          columnNote="Column names are matched loosely — “Chassis Number”, “Reg No” and “Induction Date” are all understood, and a title row above the header is fine. Download the template to start from the right columns."
        />
      </Panel>

      {validate.isPending && (
        <Panel
          label="Checking the file"
          subtitle="Every row is parsed, checked and looked up against the registry. Nothing is imported yet."
          sx={{ mt: 5 }}
        >
          <TableSkeleton rows={6} columns={[2, 2, 3, 3]} label="Checking the file" />
        </Panel>
      )}

      {errorMessage && missingColumns.length === 0 && (
        <Alert severity="error" variant="outlined" sx={{ mt: 5 }}>
          {errorMessage}
        </Alert>
      )}

      {errorMessage && missingColumns.length > 0 && (
        <Panel
          label="The file could not be used"
          subtitle="Rename the columns in your file to match, or start from the template."
          sx={{ mt: 5 }}
          action={
            <Button
              startIcon={<DownloadIcon />}
              disabled={template.isPending}
              onClick={() => template.mutate()}
            >
              {template.isPending ? 'Preparing…' : 'Download template'}
            </Button>
          }
        >
          <Alert severity="error" variant="outlined">
            {errorMessage}
          </Alert>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5, mt: 4 }}>
            <ColumnList id="missing-columns" label="Missing columns" items={missingColumns} tone="bad" />
            <ColumnList id="found-columns" label="Columns in your file" items={foundColumns} />
          </Box>
        </Panel>
      )}

      {preview && !validate.isPending && (
        <>
          <Box sx={{ mt: 5 }}>
            <StatTiles
              tiles={[
                { label: 'Rows', value: String(preview.totalRows) },
                { label: 'Will import', value: String(preview.validRows), tone: 'good' },
                { label: 'Errors', value: String(preview.errorRows), tone: 'bad' },
              ]}
            />
          </Box>

          <Panel
            label="Preview"
            subtitle={`${preview.fileName}${preview.sheetName ? ` · sheet “${preview.sheetName}”` : ''} — rows with an error are skipped. Fix them in the file and upload again.`}
            sx={{ mt: 5 }}
            action={
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button color="inherit" onClick={clear} disabled={commit.isPending}>
                  Remove file
                </Button>
                <Button onClick={() => setConfirmOpen(true)} disabled={commit.isPending || preview.validRows === 0}>
                  {commit.isPending ? 'Importing…' : `Import ${preview.validRows} vehicles`}
                </Button>
              </Box>
            }
          >
            {preview.ignoredColumns.length > 0 && (
              <Typography sx={{ fontSize: 12, color: 'grey.500', mb: 3 }}>
                Ignored columns: {preview.ignoredColumns.join(', ')} — they matched no field and were skipped.
              </Typography>
            )}
            <SimpleTable
              rows={preview.rows}
              getRowKey={(r) => String(r.rowNumber)}
              rowSx={(r) => (r.error ? { color: tones.bad.fg } : undefined)}
              columns={[
                {
                  key: 'row',
                  header: 'Row',
                  width: 70,
                  render: (r) => <Mono sx={{ color: neutral[500] }}>{r.rowNumber}</Mono>,
                },
                { key: 'id', header: 'Vehicle id', width: 130, render: (r) => <Mono>{r.id}</Mono> },
                {
                  key: 'chassis',
                  header: 'Chassis',
                  width: 190,
                  render: (r) => <Mono sx={{ fontSize: 12 }}>{r.chassisNumber || '—'}</Mono>,
                },
                { key: 'model', header: 'Model', width: 180, render: (r) => r.model },
                {
                  key: 'result',
                  header: 'Result',
                  render: (r) => (
                    <Box component="span" sx={{ fontSize: 12, color: r.error ? tones.bad.fg : neutral[600] }}>
                      {r.error ?? 'Ready to import'}
                    </Box>
                  ),
                },
              ]}
            />
          </Panel>
        </>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Import vehicles?"
        message={`${preview?.validRows ?? 0} clean rows will be added to the registry.`}
        info={`Only the ${preview?.validRows ?? 0} rows without errors are imported. ${preview?.errorRows ?? 0} rows with errors are skipped — fix them in the file and upload again.`}
        confirmLabel={`Import ${preview?.validRows ?? 0} vehicles`}
        tone="bad"
        dismissible={false}
        pending={commit.isPending}
        onConfirm={() => { setConfirmOpen(false); if (preview) commit.mutate(preview); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

/** A labelled run of chips — the missing columns in red, the found ones plain. */
function ColumnList({
  id,
  label,
  items,
  tone,
}: {
  id: string;
  label: string;
  items: string[];
  tone?: 'bad';
}) {
  return (
    <Box>
      <Typography variant="overline" id={id}>{label}</Typography>
      <Box
        component="ul"
        aria-labelledby={id}
        sx={{ listStyle: 'none', p: 0, m: 0, mt: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}
      >
        {items.length === 0 && (
          <Box component="li" sx={{ fontSize: 12, color: 'grey.500' }}>none</Box>
        )}
        {items.map((item) => (
          <Box
            component="li"
            key={item}
            sx={{
              fontSize: 12,
              px: 2,
              py: '3px',
              borderRadius: '4px',
              background: tone === 'bad' ? tones.bad.bg : neutral[900],
              color: tone === 'bad' ? tones.bad.fg : neutral[300],
            }}
          >
            {item}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** The detail as a list of strings, or nothing — the server's shape is not trusted blindly. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
