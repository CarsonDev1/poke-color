import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import LibraryRoute from '@/routes/library'
import NewPuzzleRoute from '@/routes/new'
import PlayRoute from '@/routes/play'

/**
 * Hash router, KHÔNG phải browser router: deploy static không có server
 * rewrite, nên với browser router thì F5 ở /play/abc sẽ ra 404. Hash router
 * chạy được ở mọi kiểu hosting tĩnh.
 */
const router = createHashRouter([
  { path: '/', element: <Navigate to="/library" replace /> },
  { path: '/library', element: <LibraryRoute /> },
  { path: '/new', element: <NewPuzzleRoute /> },
  { path: '/play/:id', element: <PlayRoute /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
