const sessions: Record<string, string> = { MORNING: 'Buổi sáng', AFTERNOON: 'Buổi chiều', EVENING: 'Buổi tối' };
const components: Record<string, string> = { CORE: 'Chương trình chính khóa', SPECIALIZED_STUDY: 'Chuyên đề học tập' };
export const sessionLabel = (value: string) => Object.prototype.hasOwnProperty.call(sessions, value) ? sessions[value] : 'Chưa xác định buổi';
export const curricularComponentLabel = (value: string) => Object.prototype.hasOwnProperty.call(components, value) ? components[value] : 'Chưa xác định thành phần chương trình';

// Exact safe messages verified in effective-schedule-policy.ts; arbitrary reasons are never echoed.
const scheduleReasons = new Set([
  'Phiên bản lịch học hoặc ngày học không hợp lệ', 'Không tìm thấy thời khóa biểu hiệu lực',
  'Trùng lặp nhiều phiên bản thời khóa biểu hiệu lực', 'Dữ liệu nguồn tiết học không hợp lệ',
  'Xung đột với hoạt động chuyên biệt', 'Trùng lặp phương án xử lý tiết học',
  'Chưa liên kết phân phối chương trình', 'Dữ liệu phân phối chương trình không nhất quán',
  'Dữ liệu lịch dạy chưa đủ nhất quán để xác định.',
]);
export const scheduleBlockedReason = (value: string) => scheduleReasons.has(value)
  ? value : 'Chưa thể xác định lịch dạy. Hãy liên hệ người phụ trách thời khóa biểu để kiểm tra dữ liệu nguồn.';

// Codes verified in historical-teaching.csv.ts and historical-teaching.service.ts.
const historicalIssues: Record<string, string> = {
  HISTORY_SOURCE_EMPTY: 'Chưa có dữ liệu. Hãy dán dữ liệu bên dưới dòng tiêu đề.',
  HISTORY_SOURCE_TOO_LARGE: 'Dữ liệu vượt quá 512 KiB. Hãy chia thành các đợt nhập nhỏ hơn.',
  HISTORY_SOURCE_INVALID_CONTROL: 'Dữ liệu có ký tự không hợp lệ. Hãy kiểm tra lại nội dung đã dán.',
  HISTORY_SOURCE_NO_DATA_ROWS: 'Cần có dòng tiêu đề và ít nhất một dòng dữ liệu.',
  HISTORY_SOURCE_TOO_MANY_ROWS: 'Mỗi đợt nhập chỉ được tối đa 2.000 dòng dữ liệu.',
  HISTORY_HEADER_INVALID_CSV: 'Dòng tiêu đề không đúng định dạng. Hãy dùng dòng tiêu đề mẫu.',
  HISTORY_HEADER_MISMATCH: 'Tên hoặc thứ tự cột chưa đúng. Hãy dùng dòng tiêu đề mẫu.',
  HISTORY_ROW_INVALID_CSV: 'Dấu ngoặc kép trong dòng chưa cân bằng. Hãy sửa rồi xem trước lại.',
  HISTORY_ROW_COLUMN_COUNT: 'Dòng phải có đúng 11 cột theo tiêu đề mẫu.',
  HISTORY_CLASS_REQUIRED: 'Hãy điền mã lớp.', HISTORY_SUBJECT_REQUIRED: 'Hãy điền mã môn học.',
  HISTORY_TEACHER_REQUIRED: 'Hãy điền mã cán bộ của giáo viên thực dạy.',
  HISTORY_SOURCE_DATE_INVALID: 'Ngày gốc phải là ngày hợp lệ theo dạng năm-tháng-ngày.',
  HISTORY_EXECUTION_DATE_INVALID: 'Ngày dạy thực tế phải là ngày hợp lệ theo dạng năm-tháng-ngày.',
  HISTORY_SOURCE_SESSION_INVALID: 'Buổi gốc phải dùng SANG, CHIEU hoặc TOI theo mẫu nhập.',
  HISTORY_EXECUTION_SESSION_INVALID: 'Buổi dạy thực tế phải dùng SANG, CHIEU hoặc TOI theo mẫu nhập.',
  HISTORY_SOURCE_ORDINAL_INVALID: 'Tiết gốc phải là số nguyên từ 1 đến 20.',
  HISTORY_EXECUTION_ORDINAL_INVALID: 'Tiết dạy thực tế phải là số nguyên từ 1 đến 20.',
  HISTORY_KIND_INVALID: 'Loại tiết dạy phải dùng BINH_THUONG, DAY_THAY hoặc DAY_BU theo mẫu nhập.',
  HISTORY_NOTE_TOO_LONG: 'Ghi chú chỉ được tối đa 500 ký tự.',
  HISTORY_MAKEUP_TARGET_REQUIRED: 'Dạy bù cần có đủ ngày, buổi và tiết dạy thực tế.',
  HISTORY_NON_MAKEUP_TARGET_MISMATCH: 'Tiết bình thường hoặc dạy thay phải cùng ngày, buổi và tiết gốc.',
  HISTORY_MAKEUP_BEFORE_SOURCE: 'Ngày dạy bù không được trước ngày dạy gốc.',
  HISTORY_MAKEUP_TARGET_SAME_AS_SOURCE: 'Dạy bù phải khác ngày, buổi hoặc tiết so với tiết gốc.',
  HISTORY_CLASS_NOT_FOUND: 'Không tìm thấy mã lớp trong năm học đã chọn.',
  HISTORY_SUBJECT_NOT_FOUND: 'Không tìm thấy mã môn học.',
  HISTORY_TEACHER_NOT_FOUND: 'Không tìm thấy mã cán bộ của giáo viên thực dạy.',
  HISTORY_SOURCE_NOT_PRE_OPERATIONAL: 'Ngày dạy gốc phải nằm trước mốc bắt đầu vận hành.',
  HISTORY_PPCT_NOT_ALLOCATED: 'Chưa xác định được nội dung phân phối chương trình cho tiết gốc.',
  HISTORY_SOURCE_NOT_ENDED: 'Tiết gốc chưa kết thúc theo giờ Việt Nam.',
  HISTORY_RESPONSIBLE_TEACHER_SNAPSHOT_MISSING: 'Thiếu thông tin giáo viên chịu trách nhiệm tại thời điểm tiết dạy.',
  HISTORY_NORMAL_TEACHER_MISMATCH: 'Tiết bình thường phải do giáo viên trong thời khóa biểu gốc thực dạy.',
  HISTORY_NORMAL_SOURCE_NOT_BASE: 'Tiết bình thường không được có điều chỉnh hoặc bị ngừng theo lịch.',
  HISTORY_SAME_SUBJECT_ELIGIBILITY_MISSING: 'Chưa xác minh được phân công đúng môn của giáo viên vào ngày thực dạy.',
  HISTORY_OBLIGATION_ALREADY_CONFIRMED: 'Tiết này đã có minh chứng giảng dạy đang có hiệu lực.',
  HISTORY_REPLACEMENT_AMBIGUOUS: 'Có nhiều minh chứng đã hoàn tác chưa được thay thế cho cùng tiết dạy.',
  HISTORY_SUBSTITUTION_SAME_TEACHER: 'Giáo viên dạy thay phải khác giáo viên chịu trách nhiệm.',
  HISTORY_SUBSTITUTION_SOURCE_CONFLICT: 'Tiết gốc có điều chỉnh không phù hợp với dạy thay.',
  HISTORY_MAKEUP_SOURCE_NOT_ELIGIBLE: 'Tiết gốc không còn đủ điều kiện xác nhận dạy bù.',
  HISTORY_MAKEUP_TARGET_SLOT_AMBIGUOUS: 'Chưa xác định được một tiết dạy bù duy nhất theo ngày, buổi và tiết.',
  HISTORY_MAKEUP_TARGET_NOT_ENDED: 'Tiết dạy bù chưa kết thúc theo giờ Việt Nam.',
  HISTORY_MAKEUP_TARGET_TIMETABLE_AMBIGUOUS: 'Chưa xác định được thời khóa biểu và lịch học có hiệu lực vào ngày dạy bù.',
  HISTORY_MAKEUP_ACTIVE_AMBIGUOUS: 'Có nhiều lịch dạy bù đang có hiệu lực cho cùng tiết gốc.',
  HISTORY_MAKEUP_ACTIVE_CONFLICT: 'Đã có lịch dạy bù khác thời điểm hoặc giáo viên cho tiết này.',
  HISTORY_EXECUTION_WEEK_AMBIGUOUS: 'Chưa xác định được tuần học cho ngày thực dạy.',
  HISTORY_MAKEUP_BATCH_COLLISION: 'Các dòng dạy bù trong đợt nhập bị trùng lịch lớp hoặc giáo viên.',
  HISTORY_MAKEUP_TARGET_TIMETABLE_COLLISION: 'Dạy bù bị trùng lịch với tiết học trong thời khóa biểu.',
  HISTORY_MAKEUP_TARGET_ACTIVITY_COLLISION: 'Dạy bù bị trùng lịch với hoạt động khác.',
  HISTORY_MAKEUP_TARGET_MAKEUP_COLLISION: 'Dạy bù bị trùng với lịch dạy bù khác đang có hiệu lực.',
  DUPLICATE_ACTIVE_EXECUTION: 'Có nhiều minh chứng đang có hiệu lực cho cùng tiết dạy.',
  EXECUTION_PPCT_PROVENANCE_MISMATCH: 'Minh chứng giảng dạy chưa khớp nội dung phân phối chương trình.',
};
export const historicalIssueLabel = (code: string) => Object.prototype.hasOwnProperty.call(historicalIssues, code) ? historicalIssues[code]
  : 'Có vấn đề chưa xác định trong dữ liệu lịch sử. Hãy nhờ người phụ trách kiểm tra trước khi xác nhận.';

export function transportError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Không thể hoàn tất yêu cầu.');
}
