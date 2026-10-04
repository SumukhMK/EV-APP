import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { previewBulkUpload } from '../../lib/api/vehicles';
import type { BulkUploadPreview } from '../../types';
import { BulkUploadVehicles } from './BulkUploadVehicles';

vi.mock('../../lib/api/vehicles', () => ({
  previewBulkUpload: vi.fn(),
  commitBulkUpload: vi.fn(),
  downloadImportTemplate: vi.fn(),
}));

const preview = vi.mocked(previewBulkUpload);

/** One clean row, as the server stages it. */
const staged: BulkUploadPreview = {
  importId: 'imp-1',
  fileName: 'fleet.csv',
  sheetName: null,
  ignoredColumns: [],
  totalRows: 1,
  validRows: 1,
  errorRows: 0,
  rows: [{ rowNumber: 1, id: 'BLRSS0001', chassisNumber: 'CH-1', model: 'Eagle 2', error: null }],
};

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/vehicles/bulk-upload']}>
        <BulkUploadVehicles />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const input = () => view.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { ...view, input };
}

function csv(name: string) {
  return new File(['id,chassisNumber\nBLRSS0001,CH-1\n'], name, { type: 'text/csv' });
}

beforeEach(() => {
  preview.mockReset();
});

describe('bulk upload', () => {
  /**
   * The bug that started this: a second, failing upload left the first
   * file's preview table on screen under the error, so the operator read the
   * old rows as the result of the new file.
   */
  it("a failed upload clears the previous file's preview", async () => {
    preview
      .mockResolvedValueOnce(staged)
      .mockRejectedValueOnce(
        new ApiError('That file is not a spreadsheet. Upload an .xlsx, .xls or .csv file.', 422, 'file'),
      );
    const { input } = show();

    await userEvent.upload(input(), csv('fleet.csv'));
    expect(await screen.findByText('BLRSS0001')).toBeInTheDocument();

    await userEvent.upload(input(), csv('other.csv'));
    expect(await screen.findByText(/not a spreadsheet/)).toBeInTheDocument();
    expect(screen.queryByText('BLRSS0001')).not.toBeInTheDocument();
  });

  it('a header problem is laid out as missing and found columns, with the template to hand', async () => {
    preview.mockRejectedValueOnce(
      new ApiError(
        'Could not find these columns: hub, inductedOn. Columns in your file: Vehicle ID, Depot. '
          + 'Download the template to start from the right columns.',
        422,
        'file',
        {
          missingColumns: ['hub', 'inductedOn'],
          foundColumns: ['Vehicle ID', 'Depot'],
          expectedColumns: ['id', 'chassisNumber', 'model', 'batteryType', 'batteryVendor', 'hub',
            'registrationNumber', 'inductedOn'],
        },
      ),
    );
    const { input } = show();

    await userEvent.upload(input(), csv('export.csv'));

    const missing = await screen.findByRole('list', { name: 'Missing columns' });
    expect(within(missing).getByText('hub')).toBeInTheDocument();
    expect(within(missing).getByText('inductedOn')).toBeInTheDocument();
    const found = screen.getByRole('list', { name: 'Columns in your file' });
    expect(within(found).getByText('Vehicle ID')).toBeInTheDocument();
    expect(within(found).getByText('Depot')).toBeInTheDocument();
    // The header already has one; the problem panel offers it again where the eye is.
    expect(screen.getAllByRole('button', { name: /Download template/ }).length).toBeGreaterThanOrEqual(2);
  });

  it('refuses a file that is not a spreadsheet without calling the server', async () => {
    const { input } = show();
    // user-event honours the input's accept attribute itself by default, which
    // would hide the file before the box ever saw it. The box is what is under test.
    const user = userEvent.setup({ applyAccept: false });

    await user.upload(input(), new File(['\x89PNG'], 'photo.png', { type: 'image/png' }));

    expect(await screen.findByText(/Upload an \.xlsx, \.xls or \.csv file/)).toBeInTheDocument();
    expect(preview).not.toHaveBeenCalled();
  });

  it('refuses a file over 10 MB without calling the server', async () => {
    const { input } = show();
    const huge = csv('fleet.csv');
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 });

    await userEvent.upload(input(), huge);

    expect(await screen.findByText(/larger than 10 MB/)).toBeInTheDocument();
    expect(preview).not.toHaveBeenCalled();
  });

  it('lights the Validate stage while the file is being checked', async () => {
    let finish: (value: BulkUploadPreview) => void = () => {};
    preview.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const { input } = show();

    await userEvent.upload(input(), csv('fleet.csv'));
    await waitFor(() => expect(screen.getByText('Validate')).toHaveAttribute('aria-current', 'step'));

    finish(staged);
    expect(await screen.findByText('BLRSS0001')).toBeInTheDocument();
    expect(screen.getByText('Validate')).not.toHaveAttribute('aria-current');
  });

  it('the preview says which sheet it read and which columns it ignored', async () => {
    preview.mockResolvedValueOnce({
      ...staged,
      fileName: 'fleet.xlsx',
      sheetName: 'Fleet',
      ignoredColumns: ['Notes', 'Colour'],
    });
    const { input } = show();

    await userEvent.upload(input(), csv('fleet.xlsx'));

    expect(await screen.findByText(/sheet “Fleet”/)).toBeInTheDocument();
    expect(screen.getByText(/Ignored columns: Notes, Colour/)).toBeInTheDocument();
  });

  it('remove file clears the preview so the operator can start over', async () => {
    preview.mockResolvedValueOnce(staged);
    const { input } = show();

    await userEvent.upload(input(), csv('fleet.csv'));
    expect(await screen.findByText('BLRSS0001')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove file' }));

    expect(screen.queryByText('BLRSS0001')).not.toBeInTheDocument();
    expect(screen.getByText('Upload')).toHaveAttribute('aria-current', 'step');
  });
});
