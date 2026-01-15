import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ilbbofzduodwstpqekri.supabase.co'

// Yahan apni poori lambi key paste karo jo 'sb_' se shuru ho rahi hai
const supabaseKey = 'sb_publishable_t5Drz4VfjzVlEO8T8jMWYg_q1Q7qC5j' 

export const supabase = createClient(supabaseUrl, supabaseKey)