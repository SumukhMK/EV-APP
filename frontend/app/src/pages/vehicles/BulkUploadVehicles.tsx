import { useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import UploadIcon from '@mui/icons-material/UploadFileOutlined';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { invalidateVehicles } from '../../lib/invalidate';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StatTiles } from '../../components/StatTiles';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { commitBulkUpload, previewBulkUpload } from '../../lib/api/vehicles';
import type { BulkUploadPreview } from '../../types';
import { neutral, status as tones } from '../../theme/tokens';

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
  const inputRef = useRef<HTMLInputElement>(null);
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

  return (
    <>
      <PageHeader
        section="Fleet / Vehicles"
        title="Bulk upload vehicles"
        actions={
          <Button color="inherit" onClick={() => navigate('/vehicles')}>
            Cancel
          </Button>
        }
      />

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
        <Box
          onClick={() => inputRef.current?.click()}
          sx={{
            border: `1px dashed ${neutral[800]}`,
            borderRadius: 2,
            py: 10,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 120ms, background 120ms',
            '&:hover': { borderColor: neutral[700], background: 'rgba(255,255,255,0.015)' },
          }}
        >
          <UploadIcon sx={{ fontSize: 22, color: neutral[600] }} />
          <Typography sx={{ fontSize: 14, mt: 2 }}>
            {validate.isPending ? 'Validating…' : 'Choose a file'}
          </Typography>
          <Typography sx={{ fontSize: 12, color: neutral[500], mt: 1 }}>
            Columns: vehicle id, chassis number, model, battery, hub, purchase date
          </Typography>
        </Box>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setDone(null);
              validate.mutate(file);
            }
            e.target.value = '';
          }}
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
