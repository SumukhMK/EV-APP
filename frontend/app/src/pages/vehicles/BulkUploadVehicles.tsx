import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import UploadIcon from '@mui/icons-material/UploadFileOutlined';
import { invalidateVehicles } from '../../lib/invalidate';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StatTiles } from '../../components/StatTiles';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { FlowStrip } from '../../components/FlowStrip';
import { UploadBox } from '../../components/UploadBox';
import { commitBulkUpload, previewBulkUpload } from '../../lib/api/vehicles';
import type { BulkUploadPreview } from '../../types';
import { neutral, status as tones } from '../../theme/tokens';

/** The stages the import walks, drawn under the header so the operator knows
 * how many more times it will ask before it commits. */
const IMPORT_STAGES = [
  'Upload',
  'Map columns',
  'Validate',
  'Duplicate check',
  'Preview',
  'Confirm import',
] as const;

/** What a row must carry. Told before the upload so mapping is the exception,
 * not the job. */
const EXPECTED_COLUMNS = [
  'Vehicle ID',
  'Chassis number',
  'IoT number',
  'Controller number',
  'Motor number',
  'Battery type',
  'Vehicle make',
  'Model',
  'Purchase date',
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

  const validate = useMutation({
    mutationFn: (file: File) => previewBulkUpload(file.name),
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

  // Before a file: at Upload. Once a preview is loaded: at Preview. While the
  // clean rows are being written: at Confirm import.
  const activeStage = commit.isPending ? 5 : preview ? 4 : 0;

  return (
    <>
      <PageHeader
        section="Fleet / Vehicles"
        title="Bulk upload vehicles"
        icon={UploadIcon}
        actions={
          <Button color="inherit" onClick={() => navigate('/vehicles')}>
            {done !== null ? 'Go back to all vehicles' : 'Cancel'}
          </Button>
        }
      />

      <Box sx={{ mt: 5 }}>
        <FlowStrip stages={IMPORT_STAGES} activeIndex={activeStage} />
      </Box>

      {done !== null && (
        <Alert severity="success" variant="outlined" sx={{ mt: 5 }}>
          {done} vehicles imported. They are in the registry as{' '}
          <Box component="span" sx={{ color: neutral[200] }}>Inducted</Box> and need inspection before
          they can be deployed.
        </Alert>
      )}

      <Panel
        label="File"
        subtitle="A .xlsx or .csv export of the registry. One bike per row."
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
          columnNote="Column names need not match exactly — you can map differing headers after upload."
        />
      </Panel>

      {preview && (
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
              <Button onClick={() => commit.mutate(preview)} disabled={commit.isPending || preview.validRows === 0}>
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
    </>
  );
}
