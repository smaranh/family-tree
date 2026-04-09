import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ViewMode from './pages/ViewMode';

function EditModePlaceholder() {
  return (
    <div style={{ padding: 40, fontFamily: 'Georgia, serif', color: '#3d2b1a' }}>
      <h2>Edit Mode — Phase 1B (coming soon)</h2>
    </div>
  );
}

const BASE_URL = '/family-tree';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={`${BASE_URL}`} element={<ViewMode />} />
        <Route path={`${BASE_URL}/edit`} element={<EditModePlaceholder />} />
      </Routes>
    </BrowserRouter>
  );
}
