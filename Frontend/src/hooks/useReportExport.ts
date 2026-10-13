import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ExportColumnFormat = 'text' | 'number' | 'money' | 'percent';

export interface ExportColumn {
  key: string;
  label: string;
  format?: ExportColumnFormat;
}

export interface ExportSheet {
  title: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
}

interface ExportTableRequest {
  filename: string;
  sheets: ExportSheet[];
  filters_summary?: string[];
}

/** Downloads an .xlsx built from exactly the rows/columns already on screen
 * (post-filter) — used by Reports tabs with no bespoke export of their own
 * (Utilization, Performance). See Backend/routers/reports.py::export_table_xlsx. */
export function useExportReportTable() {
  return useMutation({
    mutationFn: (req: ExportTableRequest) =>
      api.downloadPost('/reports/export-table/xlsx', req, req.filename.endsWith('.xlsx') ? req.filename : `${req.filename}.xlsx`),
  });
}
