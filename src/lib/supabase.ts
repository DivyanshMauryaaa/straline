import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default supabase;

export const projectsTable = () => {
    const CREATE = () => {}
    const DELETE = () => {}
    const UPDATE = () => {}
    const READ = () => {}
}

export const tasksTable = () => {
    const CREATE = () => {}
    const DELETE = () => {}
    const UPDATE = () => {}
    const READ = () => {}
}

export const s = () => {
    const CREATE = () => {}
    const DELETE = () => {}
    const UPDATE = () => {}
    const READ = () => {}
}

