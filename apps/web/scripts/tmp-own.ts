import { createClient } from '@supabase/supabase-js'
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const SID = '61ce4515-ead7-4b7c-bbcf-647dec05b502'
async function main(){
  const { data: u } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  const yo = u.users.find(x => x.email === 'isaacsalirrosasc@gmail.com')
  console.log('cuenta:', yo?.email, yo?.id)
  const { data: s } = await db.from('video_sessions').select('user_id,step,reference_video_url,forensic_analysis').eq('id', SID).single()
  const r = s as any
  console.log('sesión step:', r.step, '· user_id actual:', r.user_id)
  console.log('video:', !!r.reference_video_url, '· forense:', !!r.forensic_analysis)
}
main()
