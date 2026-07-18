import mysql from "mysql2/promise";

let pool;

export function getPool() {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    pool = mysql.createPool({
      uri: databaseUrl,
      connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
      timezone: "+08:00",
      decimalNumbers: true,
      enableKeepAlive: true,
    });
  }
  return pool;
}

export async function transaction(work) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function closePool() {
  if (pool) await pool.end();
  pool = undefined;
}
