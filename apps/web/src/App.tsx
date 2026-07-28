import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { HomePage } from './pages/HomePage';
import { SystemStatusPage } from './pages/SystemStatusPage';
import { NotFoundPage } from './pages/NotFoundPage';

/**
 * App - root routing component.
 * All routes are wrapped in AppLayout which provides header and navigation.
 */
function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/system-status" element={<SystemStatusPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
