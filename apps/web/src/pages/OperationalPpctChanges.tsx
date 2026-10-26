import { useState } from 'react';
import { DataTable, Pagination } from '../components/ui/management';
import type { PpctConsequenceChange } from '../lib/operational-overlays-api';
import { curricularComponentLabel } from '../lib/teaching-workflow-presentation';

function itemLabel(item: PpctConsequenceChange['before']) {
  return item ? `Tiết ${item.sequence} · ${item.title}${item.component ? ` (${curricularComponentLabel(item.component)})` : ''}` : 'Không phân phối';
}

/** Presentation of backend-computed changes; no allocation or credit calculation. */
export function OperationalPpctChanges({ groups }: { groups: Array<{ label: string; changes: PpctConsequenceChange[] }> }) {
  const [page, setPage] = useState(1);
  const rows = groups.flatMap((group) => group.changes.map((change) => ({ ...change, label: group.label })));
  const effectivePage = Math.min(page, Math.max(1, Math.ceil(rows.length / 24)));
  if (!rows.length) return <p>Nội dung PPCT giữ nguyên trong phạm vi đã đối soát.</p>;
  return <section className="form-section" aria-label="Thay đổi nội dung PPCT">
    <h3>Nội dung PPCT trước và sau</h3>
    <DataTable label="Thay đổi phân phối từng nội dung" headings={['Lớp – môn', 'Ngày – giờ', 'Trước', 'Sau']}>
      {rows.slice((effectivePage - 1) * 24, effectivePage * 24).map((row) => <tr key={row.occurrenceKey}>
        <td>{row.label}</td><td>{row.civilDate} · {row.slotStartTime.slice(0, 5)}</td>
        <td>{itemLabel(row.before)}</td><td>{itemLabel(row.after)}</td>
      </tr>)}
    </DataTable>
    {rows.length > 24 && <Pagination page={effectivePage} pageSize={24} total={rows.length} onPage={setPage} ariaLabel="Trang thay đổi nội dung PPCT" />}
  </section>;
}
