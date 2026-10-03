import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import UploadIcon from '@mui/icons-material/UploadFileOutlined';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import { invalidateVehicles } from '../../lib/invalidate';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StatTiles } from '../../components/StatTiles';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { FlowStrip } from '../../components/FlowStrip';
import { UploadBox } from '../../components/UploadBox';
import { TableSkeleton } from '../../components/TableSkeleton';
import { commitBulkUpload, downloadImportTemplate, previewBulkUpload } from '../../lib/api/vehicles';
import type { BulkUploadPreview } from '../../types';
import { neutral, status as tones } from '../../theme/tokens';

/** The stages the import walks, drawn under the header so the operator knows
 * how many more times it will ask before it commits.
 *
 * "Map columns" used to sit second and never existed on either side — the
 * parser has always matched headers exactly. A step the product cannot
 * perform is worse than one it does not advertise, so it is gone and the
 * template below is the answer instead. */
const IMPORT_STAGES = [
  'Upload',
  'Validate',
  'Duplicate check',
  'Preview',
  'Confirm import',
] as const;

/**
 * The columns the API parses, spelled exactly as the header row must spell
 * them. This list was previously a different set of nine field names that the
 * importer has never accepted — it promised IoT, controller and motor numbers
 * it cannot store, and omitted the two it requires.
 *
 * Six are required. batteryVendor and registrationNumber may be blank, but
 * the columns must be present.
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
  const [done, setDone] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const validate = useMutation({
    mutationFn: (file: File) => previewBulkUpload(file),
    onSuccess: setPreview,
  });

  const commit = useMutation({
    mutationFn: (p: BulkUploadPreview) => commitBulkUpload(p),
    onSuccess: (result) => {
      setDone(result.imported);
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

  // Before a file: at Upload. Once a preview is loaded: at Preview. While the
  // clean rows are being written: at Confirm import.
  const activeStage = commit.isPending ? 4 : preview ? 3 : 0;

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
        <Alert severity="success" variant="outlined" sx={{ mt: 5 }}>
          {done} vehicles imported. They are in the registry as{' '}
          <Box component="span" sx={{ color: neutral[200] }}>Inducted</Box> and need inspection before
          they can be deployed.
        </Alert>
      )}

      <Panel
        label="File"
        subtitle="An .xlsx or .csv export of the registry. One bike per row, header row first."
        sx={{ mt: 5 }}
      >
        <UploadBox
          title={validate.isPending ? 'Validating…' : 'Drop a file or choose one'}
          description="A .xlsx or .csv export of the registry, one bike per row."
          accept=".csv,.xlsx"
          buttonLabel="Choose a file"
          onFile={(file) => {
            setDone(null);
            validate.mutate(file);
          }}
          expectedColumns={EXPECTED_COLUMNS}
          columnNote="Header names must match exactly. Download the template above to start from the right columns."
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

      {validate.isError && (
        <Alert severity="error" variant="outlined" sx={{ mt: 5 }}>
          {validate.error instanceof Error ? validate.error.message : 'That file could not be read.'}
        </Alert>
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
            subtitle={`${preview.fileName} — rows with an error are skipped. Fix them in the file and upload again.`}
            sx={{ mt: 5 }}
            action={
              <Button onClick={() => setConfirmOpen(true)} disabled={commit.isPending || preview.validRows === 0}>
                {commit.isPending ? 'Importing…' : `Import ${preview.validRows} vehicles`}
              </Button>
            }
          >
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
