import mongoose from 'mongoose';
import { env, isProd } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  // Auto-building indexes is convenient in development; in production
  // indexes are created deliberately (see README "Indexes").
  mongoose.set('autoIndex', !isProd);

  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));

  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}

export async function disconnectDB() {
  await mongoose.connection.close();
}
