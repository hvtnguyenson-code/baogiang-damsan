import { Navigate, Route, Routes } from 'react-router-dom';
import { CapabilityRoute, FirstLoginRoute, LoginRoute, ProtectedRoute } from './auth/route-guards';
import { AppLayout } from './layouts/AppLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { FirstPasswordChangePage } from './pages/FirstPasswordChangePage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SystemStatusPage } from './pages/SystemStatusPage';
import { ProfilePage } from './pages/ProfilePage';
import { UsersPage } from './pages/UsersPage';
import { CatalogPage } from './pages/CatalogPage';
import { TemporalAssignmentsPage } from './pages/TemporalAssignmentsPage';
import { CapabilitiesPage } from './pages/CapabilitiesPage';
import { AuditPage } from './pages/AuditPage';
import { DutyCatalogPage } from './pages/DutyCatalogPage';
import { DutyAssignmentsPage } from './pages/DutyAssignmentsPage';
import { AcademicYearsPage } from './pages/AcademicYearsPage';
import { AcademicCalendarPage } from './pages/AcademicCalendarPage';
import { SchoolClassesPage } from './pages/SchoolClassesPage';
import { canManageDutyAssignments, hasSchoolCapability } from './lib/capabilities';

export default function App() {
  return (
    <Routes>
      <Route element={<LoginRoute />}>
        <Route element={<AuthLayout />}><Route path="/dang-nhap" element={<LoginPage />} /></Route>
      </Route>
      <Route element={<FirstLoginRoute />}>
        <Route element={<AuthLayout />}><Route path="/doi-mat-khau-lan-dau" element={<FirstPasswordChangePage />} /></Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/ho-so" element={<ProfilePage />} />
          <Route element={<CapabilityRoute allow={(c) => hasSchoolCapability(c, 'USER_MANAGE')} />}><Route path="/quan-tri/nguoi-dung" element={<UsersPage />} /></Route>
          <Route element={<CapabilityRoute allow={(c) => hasSchoolCapability(c, 'SUBJECT_GROUP_MANAGE')} />}>
            <Route path="/quan-tri/to-chuyen-mon" element={<CatalogPage kind="subject-groups" />} />
            <Route path="/quan-tri/phan-cong-to" element={<TemporalAssignmentsPage kind="subject-group-memberships" />} />
          </Route>
          <Route element={<CapabilityRoute allow={(c) => hasSchoolCapability(c, 'SUBJECT_MANAGE')} />}>
            <Route path="/quan-tri/mon-hoc" element={<CatalogPage kind="subjects" />} />
            <Route path="/quan-tri/phan-cong-mon" element={<TemporalAssignmentsPage kind="staff-subjects" />} />
          </Route>
          <Route element={<CapabilityRoute allow={(c) => hasSchoolCapability(c, 'CAPABILITY_GRANT')} />}><Route path="/quan-tri/quyen" element={<CapabilitiesPage />} /></Route>
          <Route element={<CapabilityRoute allow={(c) => hasSchoolCapability(c, 'AUDIT_VIEW')} />}><Route path="/quan-tri/nhat-ky" element={<AuditPage />} /></Route>
          <Route element={<CapabilityRoute allow={(c) => hasSchoolCapability(c, 'ADDITIONAL_DUTY_CATALOG_MANAGE')} />}><Route path="/quan-tri/kiem-nhiem/danh-muc" element={<DutyCatalogPage />} /></Route>
          <Route element={<CapabilityRoute allow={canManageDutyAssignments} />}><Route path="/quan-tri/kiem-nhiem/phan-cong" element={<DutyAssignmentsPage />} /></Route>
          <Route element={<CapabilityRoute allow={(c) => hasSchoolCapability(c, 'ACADEMIC_STRUCTURE_MANAGE')} />}>
            <Route path="/quan-tri/cau-truc-nam-hoc" element={<AcademicYearsPage />} />
            <Route path="/quan-tri/cau-truc-nam-hoc/:academicYearId" element={<Navigate to="lich" replace />} />
            <Route path="/quan-tri/cau-truc-nam-hoc/:academicYearId/lich" element={<AcademicCalendarPage />} />
            <Route path="/quan-tri/cau-truc-nam-hoc/:academicYearId/lop" element={<SchoolClassesPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="/trang-thai-he-thong" element={<SystemStatusPage />} />
      <Route path="/khong-co-quyen" element={<AccessDeniedPage />} />
      <Route path="/login" element={<Navigate to="/dang-nhap" replace />} />
      <Route path="/system-status" element={<Navigate to="/trang-thai-he-thong" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
