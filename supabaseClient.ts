import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkjiomqxawblijaiknom.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ramlvbXF4YXdibGlqYWlrbm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2MDY1NDYsImV4cCI6MjA4MTE4MjU0Nn0.Pok-NSEv8MQw2tQCODPw1nilagsFEkoPkaTQt2Eftuc';

// Using default configuration is often more stable for basic connectivity
export const supabase = createClient(supabaseUrl, supabaseAnonKey);