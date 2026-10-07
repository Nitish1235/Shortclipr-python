import { useNavigate } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import ClipEngine from '../components/ClipEngine'

export default function CreateClips() {
  const navigate = useNavigate()
  return <AppLayout><main className="studio-create-page">
    <header className="studio-page-heading"><div><span className="studio-eyebrow">CREATE CLIPS</span><h1>Start with a good moment.</h1><p>Find the clips, set the frame, and add your signature caption style.</p></div></header>
    <div className="studio-create-surface"><ClipEngine onJobCreated={() => navigate('/youtube-shorts/dashboard')} /></div>
  </main></AppLayout>
}
