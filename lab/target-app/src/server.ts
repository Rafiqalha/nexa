import { startTargetServer } from './listen';

// Bind bawaan 127.0.0.1; container menetapkan HOST sendiri (lihat listen.ts).
startTargetServer(process.env);
