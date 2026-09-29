import { useEffect, useId, useState } from 'react';
import type {
  CivilDateString,
  EffectiveScheduleAcademicWeekOption,
  EffectiveScheduleComparisonResponse,
  EffectiveScheduleContextOptionsResponse,
  EffectiveScheduleTeacherOption,
  IndividualWeeklyScheduleResponse,
  SchoolWideDayScheduleResponse,
} from '@baogiang/contracts';
import { Button } from '../components/ui/button';
import {
  fetchEffectiveScheduleComparison,
  fetchEffectiveScheduleContext,
  fetchEffectiveScheduleTeachers,
  fetchIndividualWeeklySchedule,
  fetchSchoolWideDaySchedule,
} from '../lib/effective-schedule-api';

type ScheduleMode = 'my-schedule' | 'school-wide' | 'peer-schedule';
type PeerViewMode = 'peer-weekly' | 'compare';

export function EffectiveSchedulePage() {
  const weekSelectId = useId();
  const modeSelectId = useId();
  const daySelectId = useId();
  const teacherSearchId = useId();
  const teacherSelectId = useId();

  // Context state
  const [context, setContext] = useState<EffectiveScheduleContextOptionsResponse | null>(null);
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [selectedWeekId, setSelectedWeekId] = useState<string>('');
  const [selectedDayCivilDate, setSelectedDayCivilDate] = useState<CivilDateString | ''>('');

  // Mode state
  const [mode, setMode] = useState<ScheduleMode>('my-schedule');
  const [peerViewMode, setPeerViewMode] = useState<PeerViewMode>('peer-weekly');

  // Teacher dropdown & search state
  const [teacherSearch, setTeacherSearch] = useState<string>('');
  const [teachers, setTeachers] = useState<EffectiveScheduleTeacherOption[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');

  // Schedule data states
  const [mySchedule, setMySchedule] = useState<IndividualWeeklyScheduleResponse | null>(null);
  const [peerSchedule, setPeerSchedule] = useState<IndividualWeeklyScheduleResponse | null>(null);
  const [schoolWideSchedule, setSchoolWideSchedule] = useState<SchoolWideDayScheduleResponse | null>(null);
  const [comparisonSchedule, setComparisonSchedule] = useState<EffectiveScheduleComparisonResponse | null>(null);

  // Loading & error states
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Initial context load
  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMessage(null);

    fetchEffectiveScheduleContext()
      .then((ctx) => {
        if (!active) return;
        setContext(ctx);
        const yearId = ctx.currentAcademicYearId ?? (ctx.academicYears[0]?.id || '');
        setSelectedYearId(yearId);
        const weekId = ctx.currentAcademicWeekId ?? (ctx.weeks[0]?.id || '');
        setSelectedWeekId(weekId);
        setSelectedDayCivilDate(ctx.currentCivilDate || '');
      })
      .catch((err) => {
        if (!active) return;
        setErrorMessage(err instanceof Error ? err.message : 'Không thể tải thông tin năm học và tuần học.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // 2. Load teacher options (searchable)
  useEffect(() => {
    let active = true;
    fetchEffectiveScheduleTeachers(teacherSearch, 1, 50)
      .then((res) => {
        if (!active) return;
        setTeachers(res.items);
      })
      .catch(() => {
        if (!active) return;
        setTeachers([]);
      });

    return () => {
      active = false;
    };
  }, [teacherSearch]);

  // 3. Load schedule data based on active mode
  useEffect(() => {
    if (!selectedYearId || !selectedWeekId) return;

    let active = true;
    setLoadingSchedule(true);
    setErrorMessage(null);

    if (mode === 'my-schedule') {
      fetchIndividualWeeklySchedule(selectedYearId, selectedWeekId)
        .then((data) => {
          if (!active) return;
          setMySchedule(data);
        })
        .catch((err) => {
          if (!active) return;
          setErrorMessage(err instanceof Error ? err.message : 'Không thể tải lịch dạy cá nhân.');
        })
        .finally(() => {
          if (active) setLoadingSchedule(false);
        });
    } else if (mode === 'school-wide') {
      const activeDate = (selectedDayCivilDate || context?.currentCivilDate) as CivilDateString;
      if (activeDate) {
        fetchSchoolWideDaySchedule(selectedYearId, activeDate)
          .then((data) => {
            if (!active) return;
            setSchoolWideSchedule(data);
          })
          .catch((err) => {
            if (!active) return;
            setErrorMessage(err instanceof Error ? err.message : 'Không thể tải lịch toàn trường.');
          })
          .finally(() => {
            if (active) setLoadingSchedule(false);
          });
      } else {
        setLoadingSchedule(false);
      }
    } else if (mode === 'peer-schedule') {
      if (!selectedTeacherId) {
        setPeerSchedule(null);
        setComparisonSchedule(null);
        setLoadingSchedule(false);
        return;
      }

      if (peerViewMode === 'peer-weekly') {
        fetchIndividualWeeklySchedule(selectedYearId, selectedWeekId, selectedTeacherId)
          .then((data) => {
            if (!active) return;
            setPeerSchedule(data);
          })
          .catch((err) => {
            if (!active) return;
            setErrorMessage(err instanceof Error ? err.message : 'Không thể tải lịch của giáo viên được chọn.');
          })
          .finally(() => {
            if (active) setLoadingSchedule(false);
          });
      } else {
        fetchEffectiveScheduleComparison(selectedYearId, selectedWeekId, selectedTeacherId)
          .then((data) => {
            if (!active) return;
            setComparisonSchedule(data);
          })
          .catch((err) => {
            if (!active) return;
            setErrorMessage(err instanceof Error ? err.message : 'Không thể thực hiện so sánh lịch.');
          })
          .finally(() => {
            if (active) setLoadingSchedule(false);
          });
      }
    }

    return () => {
      active = false;
    };
  }, [mode, peerViewMode, selectedYearId, selectedWeekId, selectedDayCivilDate, selectedTeacherId, context?.currentCivilDate]);

  const selectedWeek: EffectiveScheduleAcademicWeekOption | undefined = context?.weeks.find(
    (w) => w.id === selectedWeekId,
  );

  return (
    <div className="workspace-page">
      <header className="page-heading page-heading--rail">
        <div className="margin-rail" aria-hidden="true" />
        <div>
          <p className="utility-label">Không gian làm việc giáo viên</p>
          <h1>Lịch dạy</h1>
          <p>
            Theo dõi lịch dạy hiệu lực thực tế toàn trường, thời khóa biểu cá nhân, đồng nghiệp và so sánh bận/trống.
          </p>
        </div>
      </header>

      {errorMessage && (
        <div className="alert alert--error" role="alert">
          <strong>Lỗi nạp dữ liệu lịch dạy</strong>
          <p>{errorMessage}</p>
        </div>
      )}

      {/* Control bar */}
      <section className="ledger-section" aria-labelledby="schedule-controls-heading">
        <h2 id="schedule-controls-heading" className="sr-only">
          Bộ chọn lịch dạy
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          {/* Tuần học */}
          <div className="form-field">
            <label className="form-field__label" htmlFor={weekSelectId}>
              Tuần học
            </label>
            <select
              id={weekSelectId}
              className="form-field__input"
              value={selectedWeekId}
              disabled={loading || !context?.weeks.length}
              onChange={(e) => setSelectedWeekId(e.target.value)}
            >
              {context?.weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.displayLabel} ({w.startDate} đến {w.endDate})
                </option>
              ))}
            </select>
          </div>

          {/* Chế độ xem */}
          <div className="form-field">
            <label className="form-field__label" htmlFor={modeSelectId}>
              Phạm vi hiển thị
            </label>
            <select
              id={modeSelectId}
              className="form-field__input"
              value={mode}
              onChange={(e) => setMode(e.target.value as ScheduleMode)}
            >
              <option value="my-schedule">Lịch của tôi</option>
              <option value="school-wide">Toàn trường</option>
              <option value="peer-schedule">Lịch của một giáo viên</option>
            </select>
          </div>
        </div>

        {/* Khi ở chế độ Toàn trường: chọn ngày */}
        {mode === 'school-wide' && (
          <div className="form-field" style={{ maxWidth: '320px', marginBottom: '20px' }}>
            <label className="form-field__label" htmlFor={daySelectId}>
              Ngày xem (Toàn trường)
            </label>
            <input
              id={daySelectId}
              type="date"
              className="form-field__input"
              value={selectedDayCivilDate}
              min={selectedWeek?.startDate}
              max={selectedWeek?.endDate}
              onChange={(e) => setSelectedDayCivilDate(e.target.value as CivilDateString)}
            />
          </div>
        )}

        {/* Khi ở chế độ Giáo viên cụ thể: tìm & chọn giáo viên + toggle So sánh */}
        {mode === 'peer-schedule' && (
          <div style={{ background: '#fff', border: '1px solid #c9d4da', borderRadius: '4px', padding: '16px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>Chọn đồng nghiệp</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-field__label" htmlFor={teacherSearchId}>
                  Tìm theo tên hoặc mã
                </label>
                <input
                  id={teacherSearchId}
                  type="text"
                  className="form-field__input"
                  placeholder="Nhập tên giáo viên..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                />
              </div>

              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-field__label" htmlFor={teacherSelectId}>
                  Danh sách giáo viên
                </label>
                <select
                  id={teacherSelectId}
                  className="form-field__input"
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                >
                  <option value="">-- Chọn một đồng nghiệp --</option>
                  {teachers.map((t) => (
                    <option key={t.userId} value={t.userId}>
                      {t.displayName} {t.code ? `(${t.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedTeacherId && (
              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #c9d4da', paddingTop: '12px' }}>
                <Button
                  type="button"
                  variant={peerViewMode === 'peer-weekly' ? 'primary' : 'secondary'}
                  onClick={() => setPeerViewMode('peer-weekly')}
                  id="btn-peer-weekly"
                >
                  Lịch của giáo viên được chọn
                </Button>
                <Button
                  type="button"
                  variant={peerViewMode === 'compare' ? 'primary' : 'secondary'}
                  onClick={() => setPeerViewMode('compare')}
                  id="btn-compare-with-me"
                >
                  So sánh với lịch của tôi
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Loading state indicator */}
      {loadingSchedule && (
        <div style={{ padding: '24px', textAlign: 'center', background: '#fff', border: '1px solid #c9d4da', borderRadius: '4px', marginBlock: '16px' }}>
          <span className="button__spinner" style={{ display: 'inline-block', marginRight: '8px' }} aria-hidden="true" />
          <span>Đang nạp dữ liệu lịch dạy hiệu lực...</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SURFACE A: Lịch của tôi */}
      {/* ------------------------------------------------------------- */}
      {mode === 'my-schedule' && !loadingSchedule && mySchedule && (
        <section aria-labelledby="my-schedule-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
            <h2 id="my-schedule-heading">
              Lịch của tôi — {mySchedule.teacherDisplayName} ({mySchedule.weekLabel})
            </h2>
            <span style={{ fontSize: '0.85rem', color: '#49616f' }}>
              Trạng thái: <strong>{mySchedule.status === 'PASS' ? 'Hợp lệ' : 'Bị chặn / Cần kiểm tra'}</strong>
            </span>
          </div>

          {mySchedule.status === 'BLOCKED' && (
            <div className="alert alert--error" role="alert">
              <strong>Lịch dạy đang ở trạng thái bị chặn (Fail-closed)</strong>
              <p>Một số dữ liệu thời khóa biểu hoặc phân công bị thiếu / chưa nhất quán:</p>
              <ul>
                {mySchedule.blockedReasons?.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'grid', gap: '16px' }}>
            {mySchedule.days.map((day) => (
              <div
                key={day.civilDate}
                style={{
                  background: '#fff',
                  border: '1px solid #c9d4da',
                  borderLeft: day.isBlocked ? '4px solid #a32929' : '4px solid #1f4358',
                  borderRadius: '4px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #c9d4da', paddingBottom: '8px', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                    {formatWeekdayVi(day.weekday)} — {day.civilDate}
                  </h3>
                  {day.isBlocked && (
                    <span style={{ color: '#a32929', fontWeight: 600, fontSize: '0.85rem' }}>
                      Bị chặn (Không thể xác định)
                    </span>
                  )}
                </div>

                {day.isBlocked ? (
                  <div style={{ color: '#a32929', padding: '8px', background: '#fff1f1', borderRadius: '4px' }}>
                    Ngày học này không thể xác định lịch hiệu lực một cách nhất quán. Không hiển thị là trống.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                    {day.slots.map((slot) => (
                      <div
                        key={slot.id}
                        style={{
                          border: '1px solid #c9d4da',
                          borderRadius: '4px',
                          padding: '10px',
                          background: slot.occupancyState === 'OCCUPIED' ? '#f3f6f7' : '#fff',
                          borderTop: slot.occupancyState === 'OCCUPIED' ? '3px solid #1f4358' : '1px solid #c9d4da',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#49616f', marginBottom: '4px' }}>
                          <span>{slot.slotLabel}</span>
                          <span>{slot.startTime}–{slot.endTime}</span>
                        </div>
                        {slot.occupancyState === 'OCCUPIED' ? (
                          <div>
                            {slot.className && (
                              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                                Lớp: {slot.className}
                              </div>
                            )}
                            {slot.subjectName && (
                              <div style={{ fontSize: '0.9rem', color: '#15242e' }}>
                                Môn: {slot.subjectName}
                              </div>
                            )}
                            {slot.activityTitle && (
                              <div style={{ fontSize: '0.9rem', color: '#15242e', fontWeight: 600 }}>
                                {slot.activityTitle}
                              </div>
                            )}
                            {slot.sourceLabel && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  marginTop: '6px',
                                  padding: '2px 6px',
                                  fontSize: '0.75rem',
                                  borderRadius: '2px',
                                  background: '#e8eef1',
                                  color: '#1f4358',
                                  fontWeight: 600,
                                }}
                              >
                                {slot.sourceLabel}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div style={{ color: '#49616f', fontStyle: 'italic', fontSize: '0.9rem', paddingTop: '6px' }}>
                            Trống
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SURFACE B: Toàn trường */}
      {/* ------------------------------------------------------------- */}
      {mode === 'school-wide' && !loadingSchedule && schoolWideSchedule && (
        <section aria-labelledby="school-wide-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
            <h2 id="school-wide-heading">
              Lịch toàn trường — {formatWeekdayVi(schoolWideSchedule.weekday)} ({schoolWideSchedule.civilDate})
            </h2>
            <span style={{ fontSize: '0.85rem', color: '#49616f' }}>
              Tổng số giáo viên: <strong>{schoolWideSchedule.teachers.length}</strong>
            </span>
          </div>

          {schoolWideSchedule.status === 'BLOCKED' && (
            <div className="alert alert--error" role="alert">
              <strong>Dữ liệu lịch toàn trường của ngày này bị chặn (Fail-closed)</strong>
              <p>Phát hiện xung đột hoặc thiếu dữ liệu thời khóa biểu cơ sở:</p>
              <ul>
                {schoolWideSchedule.blockedReasons?.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Desktop matrix view */}
          <div className="desktop-matrix" style={{ overflowX: 'auto', background: '#fff', border: '1px solid #c9d4da', borderRadius: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#1f4358', color: '#fff' }}>
                  <th style={{ padding: '10px 12px', borderBottom: '1px solid #c9d4da', position: 'sticky', left: 0, background: '#1f4358', zIndex: 1, minWidth: '160px' }}>
                    Giáo viên
                  </th>
                  {schoolWideSchedule.slots.map((s) => (
                    <th key={s.id} style={{ padding: '10px 8px', borderBottom: '1px solid #c9d4da', borderLeft: '1px solid #2e5971', minWidth: '110px' }}>
                      <div>{s.label}</div>
                      <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>{s.startTime}–{s.endTime}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schoolWideSchedule.teachers.map((t, idx) => (
                  <tr
                    key={t.teacherUserId}
                    style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #e1e8ed' }}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 600, position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fff' : '#f9fafb', borderRight: '1px solid #c9d4da' }}>
                      {t.teacherDisplayName}
                    </td>
                    {t.slots.map((slot) => (
                      <td key={slot.id} style={{ padding: '6px 8px', borderLeft: '1px solid #e1e8ed', verticalAlign: 'top' }}>
                        {slot.occupancyState === 'OCCUPIED' ? (
                          <div style={{ background: '#e8eef1', padding: '4px 6px', borderRadius: '3px' }}>
                            <div style={{ fontWeight: 700, color: '#1f4358' }}>{slot.className || 'Có tiết'}</div>
                            {slot.subjectName && <div style={{ fontSize: '0.78rem' }}>{slot.subjectName}</div>}
                            {slot.activityTitle && <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{slot.activityTitle}</div>}
                            {slot.sourceLabel && <div style={{ fontSize: '0.7rem', color: '#49616f' }}>{slot.sourceLabel}</div>}
                          </div>
                        ) : slot.occupancyState === 'BLOCKED' ? (
                          <span style={{ color: '#a32929', fontSize: '0.75rem', fontWeight: 600 }}>Bị chặn</span>
                        ) : (
                          <span style={{ color: '#49616f', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SURFACE C: Lịch của một giáo viên được chọn */}
      {/* ------------------------------------------------------------- */}
      {mode === 'peer-schedule' && peerViewMode === 'peer-weekly' && !loadingSchedule && peerSchedule && (
        <section aria-labelledby="peer-schedule-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
            <h2 id="peer-schedule-heading">
              Lịch của đồng nghiệp: {peerSchedule.teacherDisplayName} ({peerSchedule.weekLabel})
            </h2>
            <span style={{ fontSize: '0.85rem', color: '#49616f' }}>
              Trạng thái: <strong>{peerSchedule.status === 'PASS' ? 'Hợp lệ' : 'Bị chặn / Cần kiểm tra'}</strong>
            </span>
          </div>

          {peerSchedule.status === 'BLOCKED' && (
            <div className="alert alert--error" role="alert">
              <strong>Lịch của đồng nghiệp đang ở trạng thái bị chặn (Fail-closed)</strong>
              <ul>
                {peerSchedule.blockedReasons?.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'grid', gap: '16px' }}>
            {peerSchedule.days.map((day) => (
              <div
                key={day.civilDate}
                style={{
                  background: '#fff',
                  border: '1px solid #c9d4da',
                  borderLeft: day.isBlocked ? '4px solid #a32929' : '4px solid #1f4358',
                  borderRadius: '4px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #c9d4da', paddingBottom: '8px', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                    {formatWeekdayVi(day.weekday)} — {day.civilDate}
                  </h3>
                  {day.isBlocked && (
                    <span style={{ color: '#a32929', fontWeight: 600, fontSize: '0.85rem' }}>
                      Bị chặn (Không thể xác định)
                    </span>
                  )}
                </div>

                {day.isBlocked ? (
                  <div style={{ color: '#a32929', padding: '8px', background: '#fff1f1', borderRadius: '4px' }}>
                    Không thể xác định lịch hiệu lực của đồng nghiệp vào ngày này. Không hiển thị là trống.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                    {day.slots.map((slot) => (
                      <div
                        key={slot.id}
                        style={{
                          border: '1px solid #c9d4da',
                          borderRadius: '4px',
                          padding: '10px',
                          background: slot.occupancyState === 'OCCUPIED' ? '#f3f6f7' : '#fff',
                          borderTop: slot.occupancyState === 'OCCUPIED' ? '3px solid #1f4358' : '1px solid #c9d4da',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#49616f', marginBottom: '4px' }}>
                          <span>{slot.slotLabel}</span>
                          <span>{slot.startTime}–{slot.endTime}</span>
                        </div>
                        {slot.occupancyState === 'OCCUPIED' ? (
                          <div>
                            {slot.className && (
                              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                                Lớp: {slot.className}
                              </div>
                            )}
                            {slot.subjectName && (
                              <div style={{ fontSize: '0.9rem', color: '#15242e' }}>
                                Môn: {slot.subjectName}
                              </div>
                            )}
                            {slot.activityTitle && (
                              <div style={{ fontSize: '0.9rem', color: '#15242e', fontWeight: 600 }}>
                                {slot.activityTitle}
                              </div>
                            )}
                            {slot.sourceLabel && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  marginTop: '6px',
                                  padding: '2px 6px',
                                  fontSize: '0.75rem',
                                  borderRadius: '2px',
                                  background: '#e8eef1',
                                  color: '#1f4358',
                                  fontWeight: 600,
                                }}
                              >
                                {slot.sourceLabel}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div style={{ color: '#49616f', fontStyle: 'italic', fontSize: '0.9rem', paddingTop: '6px' }}>
                            Trống
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SURFACE D: So sánh với lịch của tôi */}
      {/* ------------------------------------------------------------- */}
      {mode === 'peer-schedule' && peerViewMode === 'compare' && !loadingSchedule && comparisonSchedule && (
        <section aria-labelledby="compare-schedule-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
            <h2 id="compare-schedule-heading">
              So sánh lịch dạy: Tôi ({comparisonSchedule.selfTeacher.displayName}) với {comparisonSchedule.peerTeacher.displayName}
            </h2>
          </div>

          <div className="alert alert--warning" role="alert">
            <strong>Thông tin đối chiếu chuyên môn</strong>
            <p style={{ margin: 0 }}>
              Bảng so sánh hiển thị trạng thái bận/trống dựa trên khoảng thời gian thực tế để hỗ trợ trao đổi phối hợp.
              Hệ thống không kết luận và không tự động phân công đổi tiết, coi thay.
            </p>
          </div>

          {comparisonSchedule.status === 'BLOCKED' && (
            <div className="alert alert--error" role="alert">
              <strong>Có ngày bị chặn không thể so sánh đầy đủ</strong>
              <ul>
                {comparisonSchedule.blockedReasons?.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ background: '#fff', border: '1px solid #c9d4da', borderRadius: '4px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#1f4358', color: '#fff' }}>
                  <th style={{ padding: '10px 14px', borderBottom: '1px solid #c9d4da' }}>Ngày & Tiết học</th>
                  <th style={{ padding: '10px 14px', borderBottom: '1px solid #c9d4da' }}>Lịch của tôi</th>
                  <th style={{ padding: '10px 14px', borderBottom: '1px solid #c9d4da' }}>Lịch đồng nghiệp</th>
                  <th style={{ padding: '10px 14px', borderBottom: '1px solid #c9d4da' }}>Kết quả đối chiếu</th>
                </tr>
              </thead>
              <tbody>
                {comparisonSchedule.facts.map((fact, idx) => (
                  <tr
                    key={`${fact.civilDate}:${fact.slotLabel}`}
                    style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #e1e8ed' }}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                      <div>{formatWeekdayVi(fact.weekday)} — {fact.civilDate}</div>
                      <div style={{ fontSize: '0.8rem', color: '#49616f' }}>
                        {fact.slotLabel} ({fact.startTime}–{fact.endTime})
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {fact.selfOccupancy.occupancyState === 'BLOCKED' ? (
                        <span style={{ color: '#a32929', fontWeight: 600 }}>Không thể xác định / Bị chặn</span>
                      ) : fact.selfOccupancy.occupancyState === 'OCCUPIED' ? (
                        <div>
                          <strong>{fact.selfOccupancy.className || fact.selfOccupancy.activityTitle || 'Có tiết'}</strong>
                          {fact.selfOccupancy.subjectName && <div>Môn: {fact.selfOccupancy.subjectName}</div>}
                          {fact.selfOccupancy.sourceLabel && (
                            <div style={{ fontSize: '0.75rem', color: '#49616f' }}>{fact.selfOccupancy.sourceLabel}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#49616f', fontStyle: 'italic' }}>Trống</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {fact.peerOccupancy.occupancyState === 'BLOCKED' ? (
                        <span style={{ color: '#a32929', fontWeight: 600 }}>Không thể xác định / Bị chặn</span>
                      ) : fact.peerOccupancy.occupancyState === 'OCCUPIED' ? (
                        <div>
                          <strong>{fact.peerOccupancy.className || fact.peerOccupancy.activityTitle || 'Có tiết'}</strong>
                          {fact.peerOccupancy.subjectName && <div>Môn: {fact.peerOccupancy.subjectName}</div>}
                          {fact.peerOccupancy.sourceLabel && (
                            <div style={{ fontSize: '0.75rem', color: '#49616f' }}>{fact.peerOccupancy.sourceLabel}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#49616f', fontStyle: 'italic' }}>Trống</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          background:
                            fact.comparisonState === 'BOTH_BUSY'
                              ? '#ffebee'
                              : fact.comparisonState === 'BOTH_FREE'
                              ? '#edf7f1'
                              : fact.comparisonState === 'BLOCKED'
                              ? '#fff1f1'
                              : '#fff7e6',
                          color:
                            fact.comparisonState === 'BOTH_BUSY'
                              ? '#a32929'
                              : fact.comparisonState === 'BOTH_FREE'
                              ? '#246b45'
                              : fact.comparisonState === 'BLOCKED'
                              ? '#a32929'
                              : '#7a4b00',
                        }}
                      >
                        {fact.comparisonLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function formatWeekdayVi(weekday: string): string {
  switch (weekday) {
    case 'MONDAY':
      return 'Thứ Hai';
    case 'TUESDAY':
      return 'Thứ Ba';
    case 'WEDNESDAY':
      return 'Thứ Tư';
    case 'THURSDAY':
      return 'Thứ Năm';
    case 'FRIDAY':
      return 'Thứ Sáu';
    case 'SATURDAY':
      return 'Thứ Bảy';
    case 'SUNDAY':
      return 'Chủ Nhật';
    default:
      return weekday;
  }
}
