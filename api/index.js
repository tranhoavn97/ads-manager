// Điểm vào serverless cho Vercel: nạp app Express và xuất ra làm handler.
// Mọi request /api/* được vercel.json định tuyến tới đây.
import app from '../server.js';

export default app;
