const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async () => {
  const { count: onlineUsers } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('online', true);

  const { count: totalUsers } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ onlineUsers: onlineUsers || 0, totalUsers: totalUsers || 0 })
  };
};
