// Supabase project the extension writes to.
//
// This is the ANON key, not a secret: it is already shipped inside the public
// web app's JavaScript bundle, and it grants nothing on its own. Row Level
// Security is what protects the data — every row is gated on
// `user_id = auth.uid()`, so this key is only useful once you have signed in
// as yourself.
export const SUPABASE_URL = "https://pipvbltrewkavphwlyiv.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_h566_GtbbelJ-A4qBJHRTg_CBk9JNV-";

export const APP_URL = "https://resume-forge-self.vercel.app";
