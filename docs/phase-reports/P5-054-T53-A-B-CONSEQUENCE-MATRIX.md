# P5-054 / T53-A và phần an toàn của T53-B — Ma trận consequence

Ngày kiểm tra: 2026-10-26. Đây là bằng chứng audit/test cục bộ, không phải quyết định đóng P5-054.

## Cơ sở và giới hạn thực thi

- Repository: `D:\baogiang-damsan`; nhánh giữ nguyên `feat/p5-054-consequence-closure`.
- HEAD lúc bắt đầu: `070f4b96d840acb24afc89e8e9ae1b7e099aab24`; working tree sạch, không có file staged.
- Canonical GitHub main: `a15ddb194c2aac8f6e9d3c7ec35461702532fff8`, xác minh trực tiếp bằng `git ls-remote origin refs/heads/main`; khớp `origin/main` cục bộ. HEAD đi trước main một commit audit, không đi sau.
- `git fetch origin` bị sandbox chặn ghi `.git/FETCH_HEAD`; không thay quyền hoặc sửa Git metadata để vượt chặn.
- Task đăng ký: `P5-054`, traceability `T53`; dependencies `P5-050`, `P2-050`, `P3-031` đều `CLOSED`; predecessor tuần tự `P5-053` cũng `CLOSED` trong Task Register.
- Task Register còn ghi P5-054 `READY`, trong khi audit hiện hữu ghi bản nền đã merge qua PR #247. Theo giới hạn trực tiếp của người dùng, lần này không sửa governance hoặc tuyên bố chuyển trạng thái/đóng task.
- Chỉ bổ sung ma trận và hồi quy backend trên fixture. Không sửa backend runtime, Web, contracts, authority tính toán, quyền, persistence, schema/migration hay CI/CD. Không stage/commit/push/PR, đổi nhánh, truy cập VPS hoặc database.

Đã đối chiếu requirement P5-054, audit `P5-054-CONSEQUENCE-CLOSURE-AUDIT.md`, protocol P5-050, các current-state authorities, addendum v1.3 và ADR-031/033/036/037/048/056/057. ADR-037 chỉ còn là authority lịch sử cho phần đơn luồng; thành phần và định tuyến tuần phải theo ADR-048, allocator V2.

## Nguồn tính và provenance thực tế

Các đường dẫn dưới đây tính từ root repository.

| Miền | Authority đang có | Đầu vào và provenance thực | Điều không chứng minh được |
|---|---|---|---|
| Cơ hội nguồn | `apps/api/src/resolved-occurrences/resolved-occurrences.service.ts`, `resolveInTransaction` | Ngày/năm học; lịch/TKB/entry/slot/assignment/giáo viên/lớp/môn retained; binding PPCT chính xác; lifecycle overlay; `occurrenceKey` | `RESOLVED_LESSON_OCCURRENCE_STRUCTURAL_V1` có `ppctItemAllocation=NOT_ASSESSED`. Structural PASS không phải PPCT/debt/workload PASS. |
| PPCT | `apps/api/src/ppct-occurrence-allocation/ppct-occurrence-allocation.service.ts`, `resolveInTransactionV2`; policy `consumptionDecision` | Replay lịch sử lớp-môn qua ngày; exact association/plan/version/item/revision; `plannedComponent`; AcademicWeek/segments; nghĩa vụ trực tiếp; match nguồn make-up | `PPCT_OCCURRENCE_ALLOCATION_V2` đánh giá dữ liệu retained hiện hành, không nhận calendar/disposition/make-up/reversal đang đề xuất. PPCT ASSESSED cũng không đánh giá execution/completion/debt/reporting. |
| Nợ/hoàn thành | `apps/api/src/progress-debt/progress-debt.service.ts`, `resolveInTransactionV2` | Allocator V2; `asOfInstant` không ở tương lai; operational-start policy; exact execution/schedule provenance và thời điểm slot kết thúc | `TEACHING_PROGRESS_DEBT_V2` không mô phỏng thao tác chưa lưu. Không có execution không đồng nghĩa nợ; trước operational start không tự tạo nợ. |
| Workload | `apps/api/src/official-workload/official-workload-projection.service.ts`, `resolveInTransaction` | ACTIVE execution theo actual teacher và execution date; special-programme projection được tái sử dụng; WORKLOAD_ADJUSTMENT/date-effective duties/homeroom/calendar | Earned credit chỉ đến từ execution; overlay hoặc lịch dạy bù không phải execution. Resolver không nhận thao tác đề xuất. CalendarException không giảm required norm theo ADR-057. |
| Ngoại lệ lịch | `apps/api/src/operational-overlays/operational-overlays.service.ts`, `validateCalendarPreviewCandidate`, `calendarPreviewCoversOccurrence` | Cùng validation với create: calendar/year/date/scope/selector/exact slots; chặn overlap và việc triệt tiêu disposition/make-up ACTIVE | Chỉ kiểm tra candidate và tập cơ hội bị ảnh hưởng; chưa replay PPCT trước/sau hoặc reconciliation execution. |
| Dạy thay/giám sát | Cùng service, `validateDispositionPreviewCandidate`, `resolveEligibility`, `assertTeacherAvailable` | Source retained; loại thao tác; ACTIVE teaching staff; StaffSubject hiện hành cho dạy thay cùng môn; so khoảng giờ thật với TKB/disposition/make-up/SpecialActivity | Trả source entry, candidate teacher và eligibilitySameSubject; không trả exact PPCT item, workload/debt delta hay bằng chứng đủ để xác nhận toàn bộ consequence. |
| Collision dạy bù | `apps/api/src/operational-overlays/makeup-schedules.service.ts`, `create`; `apps/api/src/resolved-occurrences/effective-occupancy.ts`, `extractCanonicalOccupancies`, `intervalsOverlapTimes` | Resolution target trong transaction; effective class/teacher occupancies; half-open intervals; lịch/slot/StaffSubject target-date | `listCandidates` và `getTargetOptions` là advisory, không thay kiểm tra lúc ghi. `COLLISION_COVERAGE` hiện là `CANONICAL_CLASS_TEACHER_TIME_V1`, SpecialActivity ASSESSED, room NOT_ASSESSED; không được dùng nhãn này để suy ra consequence. |
| Reversal/correction | `reverseCalendarException`, `reverseLessonDisposition`, `MakeupSchedulesService.reverse` | Retained ID, ACTIVE -> REVERSED, expectedUpdatedAt CAS, requestKey/fingerprint, actor/reason/audit; disposition chặn make-up ACTIVE; make-up chặn execution ACTIVE | Không có reversal consequence-preview resolver. Việc reverse thành công không chứng minh toàn bộ replay/collision sau khôi phục là PASS. |

## Ma trận thao tác × consequence × nguồn

Đây là ngữ nghĩa của các authority khi đọc **fact retained hợp lệ**, không phải kết quả tính cho một candidate chưa lưu. Phần nợ áp dụng cho slot đã kết thúc, trong thời kỳ operational, và chưa có execution hợp lệ hoàn thành nghĩa vụ.

| Thao tác | PPCT | Workload | Debt/completion | Collision và guard | Nguồn kiểm chứng |
|---|---|---|---|---|---|
| CalendarException SCHOOL_WIDE/GRADE/CLASS; WHOLE_DAY/SESSION/EXACT_SLOTS | Cơ hội bị suppress không tiêu thụ item; item chờ sang cơ hội hợp lệ tiếp theo; không định tuyến lại planned component | Không sinh earned curricular credit. Required norm vẫn theo calendar/interruption + policy, không giảm theo exception | Không tạo direct obligation nên không tự sinh debt hoặc completion | Kiểm tra selector/scope/calendar; không triệt tiêu disposition/make-up ACTIVE; suppression không xóa SpecialActivity độc lập | Structural resolver; allocator V2/`consumptionDecision`; progress V2; official workload; calendar validator |
| AUTHORIZED_CANCELLATION | Không phân phối/tiêu thụ item | Không sinh earned credit | Không tự sinh debt/completion | Chỉ cơ hội chưa suppress, một disposition ACTIVE; không có assigned teacher | Overlay validator; allocator V2; progress V2 |
| SAME_SUBJECT_SUBSTITUTION | Phân phối một item trong đúng component của cơ hội gốc; không đổi TeachingAssignment/responsible teacher | Chỉ execution NORMAL hợp lệ mới cấp 1 credit cho actual substitute, theo execution date; không cấp thêm cho responsible teacher | Chưa có execution: UNCONFIRMED_COMPLETION_GAP, không tự tạo debt hay COMPLETED | ACTIVE teaching staff + StaffSubject nguồn; assigned teacher rảnh theo khoảng giờ thật; không lấy teacher-options làm chứng chỉ collision | Overlay eligibility/availability; allocator V2; progress reconciliation; workload curricular contribution |
| DIFFERENT_SUBJECT_SUPERVISION | Vẫn phân phối item của **môn nguồn**, không chuyển môn/PPCT theo người giám sát | Không tạo curricular earned credit cho giám sát hoặc responsible teacher chỉ từ disposition | Nghĩa vụ môn nguồn là PROVEN_OPEN_DEBT sau slot kết thúc; không được coi là hoàn thành | ACTIVE teaching staff; không yêu cầu StaffSubject cùng môn; phải kiểm tra assigned-teacher occupancy | Cùng overlay validator; allocator V2; progress V2; workload |
| ABSENCE_NO_REPLACEMENT | Phân phối item của môn nguồn | Không tạo earned credit | PROVEN_OPEN_DEBT khi đủ điều kiện thời gian/operational-start | Không có assigned teacher; occupancy thường được giải phóng | Allocator V2; progress V2; effective occupancy |
| Tạo lịch MAKEUP | Gắn đúng nghĩa vụ/item/revision/component đã có; **không tiêu thụ item mới** | Lịch mới không tạo credit. Chỉ execution MAKEUP hợp lệ mới cấp 1 credit cho actual teacher ở ngày thực hiện | Chỉ nhận PROVEN_OPEN_DEBT; tạo lịch không đóng nợ. Exact ACTIVE execution mới hoàn thành nghĩa vụ một lần | Target tương lai, calendar/slot duy nhất, StaffSubject bao phủ target-date, class/teacher collision canonical; không ACTIVE execution/schedule trùng nghĩa vụ | P3-031 create + progress V2 + allocator makeup source match + effective occupancy |
| Reverse CalendarException | Replay lại từ retained lifecycle mới; có thể khôi phục tiêu thụ và đổi allocation các cơ hội sau, không cộng/trừ cursor thủ công | Không sửa execution/credit đã lưu hoặc snapshot | Không tự cộng/trừ debt; nếu provenance execution lệch thì cần reconciliation | CAS/requestKey hiện có; chưa có proof collision/consequence sau khi khôi phục occupancy | Reverse command + structural/allocator/progress recomputation |
| Reverse disposition | Bỏ fact ACTIVE khỏi lần replay sau; base chỉ trở lại nếu không có suppression khác; không viết lại item/teacher của execution | Không tự xóa/đảo credit execution | Có thể từ proven debt về unconfirmed base gap; execution cũ không khớp provenance phải BLOCKED/reconcile | Chặn nếu source còn make-up ACTIVE; CAS/requestKey. Không coi guard này là đầy đủ reversal collision preview | Reverse command; progress reconciliation; allocator |
| Reverse lịch MAKEUP | Không hoàn tác một lần tiêu thụ PPCT nào vì schedule không tiêu thụ mới | Không tự đảo earned credit; execution ACTIVE chặn reversal | Khi chưa có execution, nghĩa vụ nợ gốc vẫn mở; không tạo/xóa nghĩa vụ thứ hai | Chặn execution ACTIVE; CAS/requestKey; giữ record/lineage, bỏ target ACTIVE khỏi occupancy lần đọc sau | P3-031 reverse; allocator source matching; progress/workload |

## Quyết định cho backend preview T53-B

Không thay runtime preview trong lát cắt này. Các resolver PPCT/progress/workload hiện có chỉ đọc retained state, không có tham số hoặc seam được chấp nhận để đánh giá candidate trước/sau. Gọi chúng trên state hiện tại rồi gắn kết quả vào candidate sẽ tạo provenance sai. Việc gọi `consumptionDecision` trên một occurrence tự sửa trong bộ nhớ cũng không chứng minh replay lịch sử, component routing, execution reconciliation hoặc workload delta.

Hợp đồng hiện hành được khóa bằng test:

| Bề mặt | Kết quả có thể chứng minh | Coverage bắt buộc giữ |
|---|---|---|
| Calendar preview hợp lệ | Source/selector validation PASS và affected occurrences | `ppctItemAllocation`, `workload`, `debt` đều NOT_ASSESSED, kể cả affected rỗng |
| Disposition preview hợp lệ | Source, conditional eligibility và availability validation PASS | Ba consequence đều NOT_ASSESSED, cả bốn loại disposition |
| Preview nguồn BLOCKED, collision/eligibility lỗi hoặc transaction không hoàn tất | BLOCKED; không lộ finding/exception nội bộ, không ghi business row/audit | Ba consequence đều NOT_ASSESSED |
| Teacher options / target options / make-up candidates | Advisory discovery, không phải authorization để ghi | Không được nâng thành collision/consequence PASS của candidate |
| Make-up create khi debt authority BLOCKED hoặc chưa đánh giá | Conflict trước persist/audit, kể cả payload upstream chứa item trông như debt hợp lệ | Không tạo schedule; không nhận debt item từ kết quả chưa PASS |

**P5-054/T53-B vẫn bị chặn ở consequence preview đầy đủ** cho đến khi có cách tái sử dụng authority hiện hữu để đánh giá candidate với exact provenance/coverage, cùng kiểm tra lại ở mutation transaction. Các việc này nằm trong parent P5-054/T53-B/D đã đăng ký; lần này không tạo deferral mới hoặc đổi business authority. T53-C không được mở xác nhận từ kết quả này.

## Hồi quy và giới hạn bằng chứng

- `operational-workspace-consequence-coverage.spec.ts`: validator overlay thật; persistence/structural reads là fixtures. Bao phủ scope/selector, cả bốn disposition, collision TKB/disposition/make-up/activity với slot ID khác nhưng giờ giao nhau, advisory options rồi collision, mất eligibility, suppression trên ACTIVE overlay và transaction failure. Chặn ghi bằng spy; kiểm tra không có success audit.
- `ppct-occurrence-allocation.service.spec.ts`: bổ sung tám hàng ma trận đi qua **allocator V2 thật -> ProgressDebtService V2 thật**, cùng transaction fixture, không execution. Khóa no-auto-debt cho suppression/cancellation, phân biệt substitution gap với supervision/absence debt; base sau reversal chỉ là fixture trạng thái đã resolve, không chứng minh reversal command.
- `makeup-schedules.service.spec.ts`: thêm coverage fail-closed dù có debt item; revalidation lúc create sau candidate read nay đã COMPLETED/UNCONFIRMED; không persist/audit.
- `official-workload-projection.spec.ts`: planned exception/substitution/supervision/make-up không trở thành earned credit, không tự giảm required norm.

Các test không kết nối PostgreSQL và không thay thế integration/race/E2E. Make-up no-new-consumption, exact completion, reversal guards, CAS/idempotency và component-routing còn được kiểm tra bởi các suite hiện hữu được đưa vào lượt targeted regression. Không suy ra PASS sản phẩm hoặc bằng chứng production từ fixture.

Kiểm chứng 26/10/2026: toàn bộ lint và typecheck workspace PASS; 21/21 unit suites, 448/448 tests PASS sau khi bổ sung 3 ca hồi quy (Jest chạy riêng khỏi integration). Unit mới của workspace preview: 28/28 PASS. Phạm vi integration PostgreSQL chưa nghiệm thu: 9 suite không được khởi tạo khi thiếu TEST_DATABASE_URL trỏ tới DB cô lập và đã được guard bảo vệ; không sửa/bỏ qua guard. git diff --check PASS. Chưa thực hiện E2E nghiệp vụ và không có deploy.

## Phần còn chặn trong parent P5-054

1. Candidate-aware before/after provenance cho PPCT/debt/workload; không đưa resolver tính thứ hai vào Web hoặc backend preview.
2. Proof reconciliation/collision khi reversal khôi phục cơ hội, kể cả execution retained không còn khớp; các command calendar/disposition hiện không chạy toàn bộ ba consequence resolvers.
3. Bằng chứng PostgreSQL cô lập và E2E các luồng requirement, gồm cạnh tranh, rollback/history và authorization denial. Chưa thực thi T53-D trong lượt này.
4. Đồng bộ trạng thái governance và review độc lập trước gate PR/merge theo protocol; chưa cập nhật governance/PR; chỉ giữ checkpoint thử nghiệm trên nhánh riêng, không push/merge/deploy trong lượt này.
