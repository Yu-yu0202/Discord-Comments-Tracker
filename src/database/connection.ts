import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000,     // 接続タイムアウトを60秒に設定
  enableKeepAlive: true,    // キープアライブを有効化
  keepAliveInitialDelay: 10000  // キープアライブの初期遅延を10秒に設定
});

// 接続テスト用の関数
export async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('データベース接続に成功しました');
    connection.release();
    return true;
  } catch (error) {
    console.error('データベース接続エラー:', error);
    return false;
  }
}