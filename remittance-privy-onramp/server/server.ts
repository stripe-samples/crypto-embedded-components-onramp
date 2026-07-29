import dotenv from 'dotenv';
dotenv.config();

/* eslint-disable import/first */
import express from 'express';
import cors from 'cors';
import { STRIPE_SECRET_KEY } from './utils/stripeApiHelper';
import authRoutes from './routes/auth';
import onrampRoutes from './routes/onramp';
import remittanceRoutes from './routes/remittances';
/* eslint-enable import/first */

if (!STRIPE_SECRET_KEY) {
  console.error('ERROR: STRIPE_SECRET_KEY is not set in .env');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

app.use('/v1/auth', authRoutes);
app.use('/v1', onrampRoutes);
app.use('/v1', remittanceRoutes);

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(Number(PORT), HOST, () => {
  console.log(`Crypto Onramp backend is running on http://${HOST}:${PORT}.`);
});
