import express from 'express';
import path from 'path';
import { MessageTracker } from '../services/MessageTracker';

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const topUsers = await MessageTracker.getTopUsers(today);

  res.render('index', { topUsers, date: today });
});

export function startWebServer() {
  app.listen(port, () => {
    console.log(`Webサーバーが http://localhost:${port} で起動しました`);
  });
}