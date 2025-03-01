import express from 'express';
import { MessageTracker } from '../services/MessageTracker';

export function startWebServer() {
  const app = express();
  const port = process.env.WEB_PORT || 3000;

  // JSONパースの設定
  app.use(express.json());

  // メインページ
  app.get('/', (req, res) => {
    res.send('Discord メッセージカウントボット Webインターフェース');
  });

  // ステータスAPI
  app.get('/api/status/:userId', async (req, res) => {
    try {
      const status = await MessageTracker.getUserStatus(req.params.userId);
      res.json(status);
    } catch (error) {
      console.error('APIエラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // 月間ランキングAPI
  app.get('/api/ranking/:year/:month', async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      const ranking = await MessageTracker.getMonthlyTopUsers(year, month);
      res.json(ranking);
    } catch (error) {
      console.error('APIエラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // サーバー起動
  app.listen(port, () => {
    console.log(`Webサーバーが起動しました: http://localhost:${port}`);
  });
}